import "server-only";
import { db } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { escapeHtml } from "@/lib/sanitize";
import { sendEmail } from "../email/transport";
import type { TransitEvent } from "../events/types";
import type { WeatherResult } from "../weather/open-meteo";
import type { DepartureBoard } from "../transit/vbb";

const log = createLogger("city-alerts");

export interface CityIncident {
  category: "weather" | "crowd" | "network";
  title: string;
  detail: string;
  severity: "high" | "warning";
}

/** Check city-wide conditions across Berlin and Potsdam and notify subscribed users. */
export async function processCityAlerts(
  users: Array<{ id: string; email: string; cityAlertsEnabled?: boolean; emailEnabled: boolean }>,
  weather: Record<string, WeatherResult>,
  events: TransitEvent[],
  boards: Map<string, DepartureBoard | null>,
): Promise<number> {
  const incidents: CityIncident[] = [];

  // 1. Weather anomalies in Berlin & Potsdam
  for (const [region, w] of Object.entries(weather)) {
    if (!w.available) continue;
    for (const anom of w.anomalies) {
      if (anom.severity === "high" || anom.severity === "severe") {
        incidents.push({
          category: "weather",
          title: `Severe Weather in ${region.toUpperCase()}: ${anom.kind.replace(/_/g, " ")}`,
          detail: anom.message,
          severity: anom.severity === "severe" ? "high" : "warning",
        });
      }
    }
  }

  // 2. Crowd surges from major stadium/arena events
  for (const ev of events) {
    if (ev.expectedAttendance && ev.expectedAttendance >= 10000) {
      const now = Date.now();
      const startMs = Date.parse(ev.startsAt);
      const endMs = Date.parse(ev.endsAt);
      if (now >= startMs - 60 * 60000 && now <= endMs + 90 * 60000) {
        incidents.push({
          category: "crowd",
          title: `Major Crowd Surge: ${ev.title} at ${ev.venue}`,
          detail: `~${ev.expectedAttendance.toLocaleString()} attendees expected. Overcrowding likely at ${ev.nearbyStops.join(", ")}. Lines affected: ${ev.affectedLines.join(", ")}.`,
          severity: "warning",
        });
      }
    }
  }

  // 3. Trunk line cancellations or heavy delays across monitored hubs
  const majorIssues: string[] = [];
  for (const [, board] of boards) {
    if (!board) continue;
    for (const d of board.departures) {
      if (d.cancelled) {
        majorIssues.push(`Line ${d.line} (${d.stopName} → ${d.direction}): CANCELLED`);
      } else if (d.delayMin && d.delayMin >= 15) {
        majorIssues.push(`Line ${d.line} (${d.stopName} → ${d.direction}): +${d.delayMin} min delay`);
      }
      if (majorIssues.length >= 4) break;
    }
    if (majorIssues.length >= 4) break;
  }

  if (majorIssues.length > 0) {
    incidents.push({
      category: "network",
      title: `Transit Trunk Disruptions Detected`,
      detail: majorIssues.join(" · "),
      severity: "high",
    });
  }

  if (incidents.length === 0) {
    return 0; // City transit is operating smoothly
  }

  let sentCount = 0;
  const ninetyMinAgo = new Date(Date.now() - 90 * 60 * 1000);

  for (const user of users) {
    if (!user.emailEnabled || !user.cityAlertsEnabled) continue;

    // Cooldown check: has this user received a CITY_ALERT in the last 90 minutes?
    const recentCityAlert = await db.alertLog.findFirst({
      where: {
        userId: user.id,
        reason: "CITY_ALERT",
        createdAt: { gte: ninetyMinAgo },
      },
    });

    if (recentCityAlert) {
      continue; // Cooldown active
    }

    // Build Email Bulletin
    const incidentItemsHtml = incidents
      .map(
        (inc) => `
        <div style="border-left: 4px solid ${inc.severity === "high" ? "#DC2626" : "#F59E0B"}; padding: 10px 14px; background: #F8FAFC; border-radius: 6px; margin-bottom: 12px;">
          <div style="font-size: 14px; font-weight: 700; color: #0F172A;">${escapeHtml(inc.title)}</div>
          <div style="font-size: 13px; color: #475569; margin-top: 4px; line-height: 1.4;">${escapeHtml(inc.detail)}</div>
        </div>
      `,
      )
      .join("");

    const emailHtml = `
      <!doctype html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #F1F5F9; padding: 20px;">
        <div style="max-width: 580px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
          <div style="background: linear-gradient(135deg, #0B1220, #1E293B); color: #FFFFFF; padding: 20px 24px;">
            <span style="font-size: 18px; font-weight: 800;">VBB Pulse &middot; City-Wide Transit Alert</span>
            <span style="float: right; font-size: 11px; background: #DC2626; color: #FFF; padding: 3px 8px; border-radius: 999px; font-weight: 700;">CITY RADAR</span>
          </div>
          <div style="padding: 24px;">
            <p style="font-size: 14px; color: #334155; margin-top: 0;">
              Live monitoring has detected major disruptions or crowd/weather conditions impacting the Berlin-Potsdam public transit network:
            </p>
            ${incidentItemsHtml}
            <div style="text-align: center; margin-top: 24px;">
              <a href="http://localhost:3000/dashboard" style="background: #4F46E5; color: #FFFFFF; text-decoration: none; font-weight: 600; font-size: 13px; padding: 10px 20px; border-radius: 6px; display: inline-block;">
                Open Live Commute Radar &rarr;
              </a>
            </div>
          </div>
          <div style="background: #F8FAFC; padding: 12px 24px; font-size: 11px; color: #94A3B8;">
            You receive this bulletin because City-Wide Alert Radar is enabled on your account. Manage preferences in your dashboard settings.
          </div>
        </div>
      </body>
      </html>
    `;

    const subject = `[City Alert] ${incidents[0]?.title ?? "Major Berlin-Potsdam Transit Disruption"}`;

    const res = await sendEmail({
      to: user.email,
      subject,
      html: emailHtml,
      text: `VBB Pulse City-Wide Transit Bulletin:\n\n${incidents.map((i) => `${i.title}\n${i.detail}`).join("\n\n")}\n\nVisit your dashboard at http://localhost:3000/dashboard`,
    });

    await db.alertLog.create({
      data: {
        userId: user.id,
        lineName: "CITY",
        stopName: "Berlin-Potsdam Metropolitan Network",
        status: incidents.some((i) => i.severity === "high") ? "CANCELLED" : "DELAYED",
        delayMin: 15,
        reason: "CITY_ALERT",
        context: JSON.stringify(incidents),
        subject,
        emailHtml,
        transport: res.transport,
        delivered: res.delivered,
        error: res.error ?? null,
        isTest: false,
      },
    });

    if (res.delivered) sentCount++;
    log.info("city alert dispatched", { userId: user.id, email: user.email, transport: res.transport });
  }

  return sentCount;
}
