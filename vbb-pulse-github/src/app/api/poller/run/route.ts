import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { pollerStatus, runPollCycle } from "@/services/poller/poller";

export const runtime = "nodejs";

/** Manually trigger a poll cycle (rate-limited). */
export async function POST() {
  const { user, res } = await requireUser();
  if (res) return res;
  const rl = rateLimit(`poll:${user.id}`, 3, 60);
  if (!rl.allowed) return jsonError(429, `Please wait ${rl.retryAfterSeconds}s`);
  const stats = await runPollCycle("manual");
  return NextResponse.json({ ok: true, stats, poller: pollerStatus() });
}
