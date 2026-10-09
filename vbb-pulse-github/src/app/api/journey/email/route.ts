import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api";
import { sendEmail } from "@/services/email/transport";
import { db } from "@/lib/db";
import { escapeHtml } from "@/lib/sanitize";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { user, res } = await requireUser();
  if (res) return res;

  const body = await req.json().catch(() => null);
  if (!body || !body.journey || !body.fromName || !body.toName) {
    return jsonError(400, "Missing journey payload");
  }

  const { journey, fromName, toName } = body;
  const statusColor = journey.isCancelled ? "#DC2626" : journey.worstDelayMin > 0 ? "#D97706" : "#059669";
  const statusTitle = journey.isCancelled
    ? "CANCELLED LEGS REPORTED"
    : journey.worstDelayMin > 0
    ? `+${journey.worstDelayMin} MIN DELAY ON ROUTE`
    : "ON TIME & CLEAR";

  const legsHtml = (journey.legs || [])
    .map((l: any) => {
      const isWalk = l.walking;
      const badge = isWalk
        ? `<span style="background:#475569;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700;">WALK</span>`
        : `<span style="background:#2563EB;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700;">${escapeHtml(l.line || "Transit")}</span>`;
      const delayText = l.cancelled
        ? `<strong style="color:#DC2626;">CANCELLED</strong>`
        : l.departureDelayMin > 0
        ? `<strong style="color:#D97706;">+${l.departureDelayMin} min delay</strong>`
        : `<span style="color:#059669;">On time</span>`;

      return `
        <div style="border-left: 3px solid #CBD5E1; padding-left: 12px; margin-bottom: 12px;">
          <div>${badge} <strong style="color:#0F172A; margin-left: 6px;">${escapeHtml(l.fromName)} &rarr; ${escapeHtml(l.toName)}</strong></div>
          <div style="font-size: 13px; color: #475569; margin-top: 4px;">
            Dep: ${escapeHtml(new Date(l.departure).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }))}
            ${l.platform ? `· Platform ${escapeHtml(l.platform)}` : ""} · ${delayText}
          </div>
        </div>
      `;
    })
    .join("");

  const warningsHtml = (journey.warnings || [])
    .map((w: string) => `<li style="margin-bottom: 4px;">${escapeHtml(w)}</li>`)
    .join("");

  const html = `
    <!doctype html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #F1F5F9; padding: 20px;">
      <div style="max-width: 560px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
        <div style="background: #0B1220; color: #FFFFFF; padding: 16px 20px;">
          <h2 style="margin: 0; font-size: 18px;">VBB Pulse &middot; Commute Route Status</h2>
          <p style="margin: 4px 0 0; color: #94A3B8; font-size: 12px;">${escapeHtml(fromName)} &rarr; ${escapeHtml(toName)}</p>
        </div>
        <div style="padding: 20px;">
          <div style="border-left: 4px solid ${statusColor}; padding: 10px 14px; background: #F8FAFC; border-radius: 6px; margin-bottom: 18px;">
            <div style="font-size: 16px; font-weight: 800; color: ${statusColor};">${statusTitle}</div>
            <div style="font-size: 13px; color: #64748B; margin-top: 2px;">
              Duration: ~${journey.durationMin} min · Departure: ${new Date(journey.departure).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
          <h3 style="font-size: 14px; color: #334155; margin-bottom: 10px; text-transform: uppercase;">Route Legs</h3>
          ${legsHtml}
          ${
            warningsHtml
              ? `<div style="background: #FFFBEB; border: 1px solid #FDE68A; padding: 12px; border-radius: 8px; margin-top: 14px;">
                  <strong style="color: #92400E; font-size: 12px;">Disruption Notices:</strong>
                  <ul style="margin: 6px 0 0; padding-left: 18px; font-size: 12px; color: #78350F;">${warningsHtml}</ul>
                </div>`
              : ""
          }
        </div>
      </div>
    </body>
    </html>
  `;

  const subject = `[VBB Route] ${fromName} → ${toName} (${statusTitle})`;
  const result = await sendEmail({
    to: user.email,
    subject,
    html,
    text: `Commute Route Report: ${fromName} -> ${toName}\nStatus: ${statusTitle}\nDuration: ~${journey.durationMin}m\nSee HTML email for complete details.`,
  });

  // Record in AlertLog
  await db.alertLog.create({
    data: {
      userId: user.id,
      lineName: journey.legs?.[0]?.line || "ROUTE",
      stopName: `${fromName} → ${toName}`,
      status: journey.isCancelled ? "CANCELLED" : journey.worstDelayMin > 0 ? "DELAYED" : "ON_TIME",
      delayMin: journey.worstDelayMin,
      reason: "ROUTE_REPORT",
      context: JSON.stringify({ from: fromName, to: toName, duration: journey.durationMin }),
      subject,
      emailHtml: html,
      transport: result.transport,
      delivered: result.delivered,
      error: result.error ?? null,
      isTest: false,
    },
  });

  return NextResponse.json({
    ok: true,
    transport: result.transport,
    delivered: result.delivered,
    error: result.error,
    message: result.transport === "console"
      ? `Email generated in console mock (no RESEND_API_KEY / SMTP configured yet).`
      : `Route report sent to ${user.email} via ${result.transport}!`,
  });
}
