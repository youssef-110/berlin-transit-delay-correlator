import "server-only";
import { upstreamCache } from "@/lib/cache";
import { createLogger } from "@/lib/logger";
import { SeededVenueSource } from "./seeded-venues";
import { TicketmasterSource } from "./ticketmaster";
import type { EventSource, TransitEvent } from "./types";

const log = createLogger("events");

/** Register additional adapters (e.g. Berlin Open Data) here. */
const SOURCES: EventSource[] = [new SeededVenueSource(), new TicketmasterSource()];

/**
 * Aggregates all enabled sources. Each source fails independently
 * (Promise.allSettled) so one broken provider never blocks the others,
 * and the whole aggregator never throws (transit alerts keep working).
 */
export async function getEvents(windowHoursBack = 3, windowHoursAhead = 12): Promise<TransitEvent[]> {
  try {
    return await upstreamCache.wrap(`events:${windowHoursBack}:${windowHoursAhead}`, 10 * 60 * 1000, async () => {
      const now = Date.now();
      const from = new Date(now - windowHoursBack * 3600000);
      const to = new Date(now + windowHoursAhead * 3600000);
      const enabled = SOURCES.filter((s) => s.isEnabled());
      const results = await Promise.allSettled(enabled.map((s) => s.fetchEvents(from, to)));

      const merged = new Map<string, TransitEvent>();
      results.forEach((r, i) => {
        const src = enabled[i]!.name;
        if (r.status === "rejected") {
          log.warn("event source failed", { source: src, err: (r.reason as Error)?.message });
          return;
        }
        for (const ev of r.value) {
          const dedupeKey = `${ev.venue.toLowerCase()}|${ev.startsAt.slice(0, 13)}`;
          if (!merged.has(dedupeKey)) merged.set(dedupeKey, ev);
        }
      });
      const events = [...merged.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      log.info("events aggregated", { sources: enabled.map((s) => s.name), count: events.length });
      return events;
    });
  } catch (err) {
    log.error("event aggregation failed – degrading gracefully", { err });
    return [];
  }
}
