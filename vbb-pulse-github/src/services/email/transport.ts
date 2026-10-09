import type { Transporter } from "nodemailer";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const log = createLogger("email");

export type TransportName = "resend" | "smtp" | "console";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendResult {
  transport: TransportName;
  delivered: boolean;
  messageId?: string;
  error?: string;
}

export function activeTransport(): TransportName {
  const e = env();
  if (e.RESEND_API_KEY) return "resend";
  if (e.SMTP_HOST) return "smtp";
  return "console";
}

declare const __non_webpack_require__: ((id: string) => any) | undefined;

let smtp: Transporter | null = null;
export function resetEmailTransport() {
  smtp = null;
}
async function getSmtpTransport(): Promise<Transporter> {
  if (smtp) return smtp;
  // Use runtime require so Webpack's Edge compiler doesn't attempt to bundle
  // Node built-ins (stream, fs, net) when instrumentation is analyzed.
  const req = typeof __non_webpack_require__ !== "undefined" ? __non_webpack_require__ : eval("require");
  const nodemailer = req("nodemailer");
  const e = env();
  smtp = nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_SECURE,
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined,
    pool: true,
    maxConnections: 3,
    connectionTimeout: 10_000,
  });
  return smtp as Transporter;
}

async function sendViaResend(msg: OutgoingEmail): Promise<SendResult> {
  const e = env();
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: e.EMAIL_FROM, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as { id?: string };
      return { transport: "resend", delivered: true, messageId: body.id };
    }
    const errText = (await res.text().catch(() => "")).slice(0, 300);
    if (res.status < 500 && res.status !== 429) return { transport: "resend", delivered: false, error: `Resend ${res.status}: ${errText}` };
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  return { transport: "resend", delivered: false, error: "Resend unavailable after retries" };
}

async function sendViaSmtp(msg: OutgoingEmail): Promise<SendResult> {
  const smtp = await getSmtpTransport();
  const info = await smtp.sendMail({ from: env().EMAIL_FROM, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
  return { transport: "smtp", delivered: true, messageId: info.messageId };
}

function sendViaConsole(msg: OutgoingEmail): SendResult {
  const bar = "═".repeat(72);
  console.log(
    `\n${bar}\n📧  MOCK EMAIL (no RESEND_API_KEY / SMTP_HOST configured)\nTo:      ${msg.to}\nSubject: ${msg.subject}\n${"─".repeat(72)}\n${msg.text}\n${bar}\n` +
      `   ↳ Full HTML preview is available from the dashboard → Alert history → "Preview".\n`,
  );
  return { transport: "console", delivered: true, messageId: `console-${Date.now()}` };
}

/** Send with automatic fallback: Resend → SMTP → console. Never throws. */
export async function sendEmail(msg: OutgoingEmail): Promise<SendResult> {
  const transport = activeTransport();
  const started = Date.now();
  try {
    const result = transport === "resend" ? await sendViaResend(msg) : transport === "smtp" ? await sendViaSmtp(msg) : sendViaConsole(msg);
    log[result.delivered ? "info" : "error"]("email dispatch", {
      transport: result.transport,
      delivered: result.delivered,
      to: maskEmail(msg.to),
      ms: Date.now() - started,
      messageId: result.messageId,
      error: result.error,
    });
    return result;
  } catch (err) {
    log.error("email dispatch failed", { transport, to: maskEmail(msg.to), err });
    return { transport, delivered: false, error: (err as Error).message };
  }
}

function maskEmail(email: string): string {
  const [u, d] = email.split("@");
  return `${(u ?? "").slice(0, 2)}***@${d ?? ""}`;
}
