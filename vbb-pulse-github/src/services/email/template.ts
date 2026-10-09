import "server-only";
import { escapeHtml, safeUrl, sanitizeHeader } from "@/lib/sanitize";
import type { Insight } from "../correlation/engine";

export interface AlertEmailData {
  routeLabel: string;
  lineName: string;
  stopName: string;
  status: "DELAYED" | "CANCELLED";
  delayMin: number;
  plannedTime: string | null; // HH:MM
  expectedTime: string | null; // HH:MM
  platform: string | null;
  insights: Insight[];
  alternative: string | null;
  reason: "NEW" | "ESCALATED" | "TEST";
  dashboardUrl: string;
  generatedAt: string; // HH:MM
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function lineColor(line: string): string {
  const l = line.toUpperCase();
  if (l.startsWith("S")) return "#008D4F"; // S-Bahn Berlin green
  if (l.startsWith("U")) return "#115D91"; // BVG U-Bahn blue
  if (l.startsWith("RE") || l.startsWith("RB") || l.startsWith("FEX")) return "#E2001A"; // DB Regio red
  if (l.startsWith("M") || /^\d{2}$/.test(l)) return "#CC0A22"; // tram
  return "#A5027D"; // bus
}

const SEVERITY_COLOR: Record<string, string> = { severe: "#DC2626", high: "#EA580C", moderate: "#CA8A04", info: "#2563EB" };
const KIND_ICON: Record<string, string> = { weather: "&#9729;", event: "&#127915;", operator: "&#9888;" };

export function renderAlertEmail(d: AlertEmailData): RenderedEmail {
  const cancelled = d.status === "CANCELLED";
  const headline = cancelled ? "Cancelled" : `+${d.delayMin} min`;
  const prefix = d.reason === "TEST" ? "[TEST] " : d.reason === "ESCALATED" ? "Update: " : "";
  const subject = sanitizeHeader(`${prefix}${d.lineName} ${cancelled ? "cancelled" : `delayed +${d.delayMin} min`} – ${d.routeLabel.replace(/^\S+\s–\s/, "")}`);
  const accent = cancelled ? "#DC2626" : d.delayMin >= 15 ? "#EA580C" : "#CA8A04";

  const insightRows = d.insights.length
    ? d.insights
        .map(
          (i) => `
          <tr><td style="padding:10px 14px;border-left:4px solid ${SEVERITY_COLOR[i.severity] ?? "#2563EB"};background:#F8FAFC;border-radius:6px;">
            <div style="font-size:14px;font-weight:600;color:#0F172A;">${KIND_ICON[i.kind] ?? ""} ${escapeHtml(i.message)}</div>
            ${i.detail ? `<div style="font-size:13px;color:#475569;margin-top:4px;">${escapeHtml(i.detail)}</div>` : ""}
          </td></tr><tr><td style="height:8px;"></td></tr>`,
        )
        .join("")
    : `<tr><td style="font-size:13px;color:#64748B;">No correlated weather or event anomalies detected.</td></tr>`;

  const times =
    d.plannedTime || d.expectedTime
      ? `<tr><td style="padding-top:12px;font-size:14px;color:#334155;">
          Scheduled <strong>${escapeHtml(d.plannedTime ?? "–")}</strong>
          ${cancelled ? "" : `&nbsp;→&nbsp; Expected <strong style="color:${accent};">${escapeHtml(d.expectedTime ?? "–")}</strong>`}
          ${d.platform ? `&nbsp;·&nbsp; Platform <strong>${escapeHtml(d.platform)}</strong>` : ""}
        </td></tr>`
      : "";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#EEF2F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F7;padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px rgba(15,23,42,.08);">
    <tr><td style="background:linear-gradient(135deg,#0B1220,#1E293B);padding:18px 24px;">
      <span style="font-size:16px;font-weight:700;color:#FFFFFF;letter-spacing:.3px;">VBB&nbsp;Pulse</span>
      <span style="font-size:12px;color:#94A3B8;margin-left:8px;">Berlin · Potsdam transit alerts</span>
      ${d.reason === "TEST" ? `<span style="float:right;font-size:11px;font-weight:700;color:#0B1220;background:#FACC15;padding:3px 8px;border-radius:999px;">TEST</span>` : ""}
    </td></tr>
    <tr><td style="padding:24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td>
          <span style="display:inline-block;background:${lineColor(d.lineName)};color:#FFFFFF;font-weight:800;font-size:15px;padding:4px 10px;border-radius:6px;">${escapeHtml(d.lineName)}</span>
          <span style="font-size:16px;font-weight:600;color:#0F172A;margin-left:8px;">${escapeHtml(d.routeLabel.replace(/^\S+\s–\s/, ""))}</span>
        </td></tr>
        <tr><td style="padding-top:16px;">
          <div style="font-size:40px;line-height:1;font-weight:800;color:${accent};">${escapeHtml(headline)}</div>
          <div style="font-size:13px;color:#64748B;margin-top:6px;">${d.reason === "ESCALATED" ? "Disruption has escalated since our last alert." : cancelled ? "This departure will not run." : "Current real-time delay vs. timetable."}</div>
        </td></tr>
        ${times}
      </table>
    </td></tr>
    <tr><td style="padding:0 24px 8px;"><div style="font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.8px;">Correlated context</div></td></tr>
    <tr><td style="padding:4px 24px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${insightRows}</table></td></tr>
    ${
      d.alternative
        ? `<tr><td style="padding:0 24px 20px;">
      <div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:10px;padding:12px 14px;">
        <div style="font-size:12px;font-weight:700;color:#047857;text-transform:uppercase;letter-spacing:.8px;">Suggested alternative</div>
        <div style="font-size:14px;color:#064E3B;margin-top:4px;">${escapeHtml(d.alternative)}</div>
      </div></td></tr>`
        : ""
    }
    <tr><td align="center" style="padding:4px 24px 26px;">
      <a href="${escapeHtml(safeUrl(d.dashboardUrl))}" style="display:inline-block;background:#4F46E5;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:8px;">Open live dashboard</a>
    </td></tr>
    <tr><td style="background:#F8FAFC;padding:14px 24px;font-size:11px;color:#94A3B8;line-height:1.5;">
      Generated ${escapeHtml(d.generatedAt)} (Europe/Berlin). You receive this because you track ${escapeHtml(d.lineName)} at ${escapeHtml(d.stopName)}.
      Adjust thresholds, cooldown or quiet hours in your dashboard. Data: VBB/HAFAS, Open-Meteo.
    </td></tr>
  </table>
</td></tr></table></body></html>`;

  const text = [
    `${prefix}VBB Pulse alert`,
    `${d.routeLabel}`,
    cancelled ? "Status: CANCELLED" : `Delay: +${d.delayMin} min`,
    d.plannedTime ? `Scheduled: ${d.plannedTime}${!cancelled && d.expectedTime ? ` → Expected: ${d.expectedTime}` : ""}` : "",
    d.platform ? `Platform: ${d.platform}` : "",
    "",
    "Correlated context:",
    ...(d.insights.length ? d.insights.map((i) => `- ${i.message}${i.detail ? ` — ${i.detail}` : ""}`) : ["- none detected"]),
    d.alternative ? `\nAlternative: ${d.alternative}` : "",
    `\nDashboard: ${safeUrl(d.dashboardUrl)}`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  return { subject, html, text };
}
