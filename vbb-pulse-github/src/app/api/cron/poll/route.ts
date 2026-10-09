import { NextResponse } from "next/server";
import { runPollCycle, pollerStatus } from "@/services/poller/poller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/poll
 * Endpoint designed for Vercel Cron or external schedulers (e.g., cron-job.org).
 * Securable via CRON_SECRET environment variable.
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const stats = await runPollCycle("interval");
  return NextResponse.json({
    ok: true,
    triggeredAt: new Date().toISOString(),
    stats,
    poller: pollerStatus(),
  });
}
