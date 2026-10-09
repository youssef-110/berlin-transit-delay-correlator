import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { jsonError, requireUser } from "@/lib/api";
import { env, reloadEnv } from "@/lib/env";
import { activeTransport, resetEmailTransport, sendEmail } from "@/services/email/transport";

export const runtime = "nodejs";

function maskString(str?: string): string {
  if (!str) return "";
  if (str.length <= 4) return "****";
  return `${str.slice(0, 3)}...${str.slice(-3)}`;
}

export async function GET() {
  const { user, res } = await requireUser();
  if (res) return res;

  const e = env();
  const transport = activeTransport();

  return NextResponse.json({
    ok: true,
    transport,
    isRealDelivery: transport !== "console",
    configured: {
      hasResend: Boolean(e.RESEND_API_KEY),
      resendKeyMasked: maskString(e.RESEND_API_KEY),
      hasSmtp: Boolean(e.SMTP_HOST),
      smtpHost: e.SMTP_HOST || "",
      smtpPort: e.SMTP_PORT || 587,
      smtpUserMasked: maskString(e.SMTP_USER),
      emailFrom: e.EMAIL_FROM,
    },
    userEmail: user.email,
  });
}

export async function POST(req: Request) {
  const { user, res } = await requireUser();
  if (res) return res;

  const body = await req.json().catch(() => null);
  if (!body) return jsonError(400, "Invalid JSON");

  const {
    provider, // "resend" | "smtp"
    resendApiKey,
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPass,
    emailFrom,
    sendTestNow,
  } = body;

  const envPath = path.resolve(process.cwd(), ".env");
  let envContent = "";
  try {
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, "utf-8");
    }
  } catch {
    // ignore
  }

  function updateEnvKey(key: string, value: string) {
    process.env[key] = value;
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}="${value}"`);
    } else {
      envContent += `\n${key}="${value}"`;
    }
  }

  if (provider === "resend") {
    if (!resendApiKey || !resendApiKey.trim()) {
      return jsonError(400, "Resend API key is required");
    }
    updateEnvKey("RESEND_API_KEY", resendApiKey.trim());
    if (emailFrom && emailFrom.trim()) {
      updateEnvKey("EMAIL_FROM", emailFrom.trim());
    }
  } else if (provider === "smtp") {
    if (!smtpHost || !smtpUser || !smtpPass) {
      return jsonError(400, "SMTP Host, User, and Password are required");
    }
    updateEnvKey("SMTP_HOST", smtpHost.trim());
    updateEnvKey("SMTP_PORT", String(smtpPort || 587));
    updateEnvKey("SMTP_USER", smtpUser.trim());
    updateEnvKey("SMTP_PASS", smtpPass.trim());
    if (emailFrom && emailFrom.trim()) {
      updateEnvKey("EMAIL_FROM", emailFrom.trim());
    }
  }

  // Write updated .env file
  try {
    fs.writeFileSync(envPath, envContent.trim() + "\n", "utf-8");
  } catch (err) {
    // If running in read-only environment, env updates in process.env still work
  }

  // Invalidate cache
  reloadEnv();
  resetEmailTransport();

  const newTransport = activeTransport();

  let testResult: any = null;
  if (sendTestNow) {
    testResult = await sendEmail({
      to: user.email,
      subject: `[VBB Pulse] Verification: Real Email Delivery Active`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; background: #0B1220; color: #FFFFFF; border-radius: 10px;">
          <h2 style="color: #10B981; margin-top: 0;">&#10003; Real Email Delivery Verified!</h2>
          <p>Your transit alerts will now be dispatched live to <strong>${user.email}</strong> via <strong>${newTransport.toUpperCase()}</strong>.</p>
          <p style="color: #94A3B8; font-size: 13px;">Sent at ${new Date().toLocaleTimeString("de-DE")}.</p>
        </div>
      `,
      text: `Real Email Delivery Verified! Your transit alerts will now be dispatched live to ${user.email} via ${newTransport}.`,
    });
  }

  return NextResponse.json({
    ok: true,
    transport: newTransport,
    isRealDelivery: newTransport !== "console",
    testResult,
    message: testResult?.delivered
      ? `Real email sent to ${user.email} successfully via ${newTransport}!`
      : testResult?.error
      ? `Configuration saved, but test email failed: ${testResult.error}`
      : `Email configuration updated. Active transport: ${newTransport}`,
  });
}
