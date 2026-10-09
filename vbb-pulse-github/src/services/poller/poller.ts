import "server-only";
import { upstreamCache } from "@/lib/cache";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { processLine } from "../alerts/notifier";
import { analyzeLine, correlate } from "../correlation/engine";
import { getEvents } from "../events/aggregator";
import { getDepartures, type DepartureBoard } from "../transit/vbb";
import { getAllWeather } from "../weather/open-meteo";

const log = createLogger("poller");

export interface PollStats {
  cycleId: string;
  startedAt: string;
  durationMs: number;
  users: number;
  trackedLines: number;
  stops: number;
  stopsFailed: number;
  disruptions: number;
  sent: number;
  suppressed: number;
  errors: number;
}

interface PollerState {
  timer: NodeJS.Timeout | null;
  running: boolean;
  lastStats: PollStats | null;
  lastError: string | null;
  cycles: number;
}

const g = globalThis as unknown as { __poller?: PollerState };
const state: PollerState = g.__poller ?? (g.__poller = { timer: null, running: false, lastStats: null, lastError: null, cycles: 0 });

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Execute one full poll → analyze → correlate → notify cycle. */
export async function runPollCycle(trigger: "interval" | "manual" | "startup" = "interval"): Promise<PollStats | null> {
  if (state.running) {
    log.warn("poll cycle skipped – previous cycle still running", { trigger });
    return null;
  }
  state.running = true;
  const cycleId = (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36)).slice(0, 8);
  const started = Date.now();
  const stats: PollStats = {
    cycleId,
    startedAt: new Date(started).toISOString(),
    durationMs: 0,
    users: 0,
    trackedLines: 0,
    stops: 0,
    stopsFailed: 0,
    disruptions: 0,
    sent: 0,
    suppressed: 0,
    errors: 0,
  };
  const clog = log.child(cycleId);
  clog.info("poll cycle started", { trigger });

  try {
    const users = await db.user.findMany({
      where: { emailEnabled: true },
      select: {
        id: true,
        email: true,
        delayThresholdMin: true,
        cooldownMinutes: true,
        quietHoursStart: true,
        quietHoursEnd: true,
        emailEnabled: true,
        cityAlertsEnabled: true,
        trackedLines: { select: { id: true, lineName: true, stopId: true, stopName: true, direction: true } },
      },
    });
    stats.users = users.length;
    stats.trackedLines = users.reduce((n, u) => n + u.trackedLines.length, 0);
    if (!users.length) {
      clog.info("no active users – nothing to do");
      return stats;
    }

    // 1) Fetch each unique stop + key hubs for city-wide radar, weather & events in parallel.
    const userStopIds = users.flatMap((u) => u.trackedLines.map((t) => t.stopId));
    // Always monitor key hubs (Alexanderplatz, Potsdam Hbf) for city-wide alerts
    const stopIds = [...new Set([...userStopIds, "900100003", "900230999"])];
    stats.stops = stopIds.length;
    const [boards, weather, events] = await Promise.all([
      mapLimit(stopIds, 4, async (id) => {
        try {
          return [id, await getDepartures(id)] as const;
        } catch (err) {
          stats.stopsFailed++;
          clog.error("departures failed for stop", { stopId: id, err: (err as Error).message });
          return [id, null] as const;
        }
      }),
      getAllWeather(), // never throws
      getEvents(), // never throws
    ]);
    const boardByStop = new Map<string, DepartureBoard | null>(boards);

    // 2) Analyze + correlate + notify per user line.
    for (const user of users) {
      for (const t of user.trackedLines) {
        const board = boardByStop.get(t.stopId) ?? null;
        if (!board) continue; // upstream failure: don't resolve/alert on missing data
        try {
          const analysis = analyzeLine(t, board, user.delayThresholdMin);
          const disruption = correlate(analysis, board, weather, events);
          if (disruption) stats.disruptions++;
          const res = await processLine(user, t, disruption);
          if (res.action === "sent") stats.sent++;
          if (res.action === "suppressed") stats.suppressed++;
        } catch (err) {
          stats.errors++;
          clog.error("line processing failed", { userId: user.id, line: t.lineName, err });
        }
      }
    }

    // 3) City-Wide Disruption Radar: notify users subscribed to city-wide alerts
    try {
      const { processCityAlerts } = await import("../alerts/city-alerts");
      const citySent = await processCityAlerts(users, weather, events, boardByStop);
      stats.sent += citySent;
    } catch (err) {
      clog.error("city alerts processing failed", { err });
    }
    state.lastError = null;
    return stats;
  } catch (err) {
    stats.errors++;
    state.lastError = (err as Error).message;
    clog.error("poll cycle failed", { err });
    return stats;
  } finally {
    stats.durationMs = Date.now() - started;
    state.lastStats = stats;
    state.cycles++;
    state.running = false;
    clog.info("poll cycle finished", { ...stats, cache: upstreamCache.stats() });
  }
}

/** Idempotent: safe to call multiple times (hot reload, multiple imports). */
export function startPoller() {
  const e = env();
  if (!e.POLLER_ENABLED) {
    log.info("poller disabled via POLLER_ENABLED=false");
    return;
  }
  if (state.timer) return;
  const intervalMs = e.POLL_INTERVAL_SECONDS * 1000;
  state.timer = setInterval(() => void runPollCycle("interval"), intervalMs);
  state.timer.unref?.();
  log.info("poller started", { intervalSeconds: e.POLL_INTERVAL_SECONDS });
  setTimeout(() => void runPollCycle("startup"), 5000).unref?.();
}

export function stopPoller() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}

export function pollerStatus() {
  return {
    enabled: env().POLLER_ENABLED,
    active: state.timer !== null,
    running: state.running,
    intervalSeconds: env().POLL_INTERVAL_SECONDS,
    cycles: state.cycles,
    lastStats: state.lastStats,
    lastError: state.lastError,
    cache: upstreamCache.stats(),
  };
}
