import "server-only";
import { z } from "zod";
import { env } from "@/lib/env";
import { fetchJsonWithRetry } from "@/lib/http";
import { HUBS, haversineKm } from "../transit/hubs";
import type { EventSource, TransitEvent } from "./types";

const tmSchema = z.object({
  _embedded: z
    .object({
      events: z.array(
        z
          .object({
            id: z.string(),
            name: z.string(),
            dates: z.object({ start: z.object({ dateTime: z.string().optional() }).passthrough() }).passthrough(),
            _embedded: z
              .object({
                venues: z
                  .array(
                    z
                      .object({
                        name: z.string().optional(),
                        location: z.object({ latitude: z.string(), longitude: z.string() }).optional(),
                      })
                      .passthrough(),
                  )
                  .optional(),
              })
              .passthrough()
              .optional(),
          })
          .passthrough(),
      ),
    })
    .optional(),
});

/** Optional live adapter (enabled when TICKETMASTER_API_KEY is set). */
export class TicketmasterSource implements EventSource {
  readonly name = "ticketmaster";

  isEnabled() {
    return Boolean(env().TICKETMASTER_API_KEY);
  }

  async fetchEvents(from: Date, to: Date): Promise<TransitEvent[]> {
    const key = env().TICKETMASTER_API_KEY;
    if (!key) return [];
    const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
    url.searchParams.set("apikey", key);
    url.searchParams.set("latlong", "52.47,13.25"); // between Berlin & Potsdam
    url.searchParams.set("radius", "35");
    url.searchParams.set("unit", "km");
    url.searchParams.set("size", "50");
    url.searchParams.set("sort", "date,asc");
    url.searchParams.set("startDateTime", from.toISOString().replace(/\.\d{3}Z$/, "Z"));
    url.searchParams.set("endDateTime", to.toISOString().replace(/\.\d{3}Z$/, "Z"));

    const body = tmSchema.parse(await fetchJsonWithRetry(url.toString(), { label: "ticketmaster", retries: 1 }));
    const out: TransitEvent[] = [];
    for (const ev of body._embedded?.events ?? []) {
      const start = ev.dates.start.dateTime;
      const venue = ev._embedded?.venues?.[0];
      if (!start || !venue?.location) continue;
      const lat = Number(venue.location.latitude);
      const lon = Number(venue.location.longitude);
      const near = HUBS.map((h) => ({ h, d: haversineKm(lat, lon, h.lat, h.lon) }))
        .filter((x) => x.d <= 2.5)
        .sort((a, b) => a.d - b.d)
        .slice(0, 2);
      out.push({
        id: `tm:${ev.id}`,
        title: ev.name,
        venue: venue.name ?? "Unknown venue",
        lat,
        lon,
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(Date.parse(start) + 3 * 3600000).toISOString(),
        expectedAttendance: null,
        nearbyStops: near.map((x) => x.h.short),
        affectedLines: [...new Set(near.flatMap((x) => x.h.lines))],
        source: this.name,
      });
    }
    return out;
  }
}
