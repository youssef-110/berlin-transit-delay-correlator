import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { sendTestAlert } from "@/services/alerts/notifier";

export const runtime = "nodejs";

/**
 * POST /api/alerts/test – "Send Test Delay Email".
 * Builds a simulated real-world delay scenario and emails the logged-in user
 * immediately (bypasses dedup/cooldown/quiet hours by design).
 */
export async function POST() {
  const { user, res } = await requireUser();
  if (res) return res;

  const rl = rateLimit(`test-email:${user.id}`, 5, 60);
  if (!rl.allowed) return jsonError(429, `Please wait ${rl.retryAfterSeconds}s before sending another test email`);

  const result = await sendTestAlert(user);
  if (!result.delivered) return jsonError(502, `Email delivery failed via ${result.transport}: ${result.error ?? "unknown error"}`);

  return NextResponse.json({
    ok: true,
    transport: result.transport,
    messageId: result.messageId,
    logId: result.logId,
    previewUrl: `/api/alerts/${result.logId}/preview`,
    message:
      result.transport === "console"
        ? "No email provider configured – the email was printed to the server console. Open the preview to see the HTML."
        : `Test email sent to ${user.email} via ${result.transport}.`,
  });
}
