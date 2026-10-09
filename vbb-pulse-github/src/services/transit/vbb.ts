import "server-only";
import { z } from "zod";
import { upstreamCache } from "@/lib/cache";
import { env } from "@/lib/env";
import { fetchJsonWithRetry } from "@/lib/http";
import { createLogger } from "@/lib/logger";

const log = createLogger("vbb");

// ── Upstream response schemas (lenient: unknown fields pass through) ─────────
const remarkSchema = z
  .object({
    type: z.string().optional(),
    code: z.string().nullish(),
    summary: z.string().nullish(),
    text: z.string().nullish(),
  })
  .passthrough();

const locationSchema = z.object({ latitude: z.number(), longitude: z.number() }).partial().passthrough();

const departureSchema = z
  .object({
    tripId: z.string(),
    stop: z.object({ id: z.string(), name: z.string(), location: locationSchema.nullish() }).passthrough().nullish(),
    when: z.string().nullish(),
    plannedWhen: z.string().nullish(),
    delay: z.number().nullish(),
    platform: z.string().nullish(),
    plannedPlatform: z.string().nullish(),
    direction: z.string().nullish(),
    cancelled: z.boolean().optional(),
    line: z
      .object({
        name: z.string(),
        product: z.string().optional(),
        productName: z.string().optional(),
        mode: z.string().optional(),
      })
      .passthrough()
      .nullish(),
    remarks: z.array(remarkSchema).optional(),
  })
  .passthrough();

const departuresResponseSchema = z.object({
  departures: z.array(z.unknown()),
  realtimeDataUpdatedAt: z.number().nullish(),
});

const stationSchema = z
  .object({
    type: z.string(),
    id: z.string(),
    name: z.string(),
    location: locationSchema.nullish(),
    products: z.record(z.boolean()).optional(),
  })
  .passthrough();

// ── Normalized domain types ──────────────────────────────────────────────────
export interface Remark {
  type: string;
  summary: string;
  text: string;
}

export interface Departure {
  tripId: string;
  stopId: string;
  stopName: string;
  lat: number | null;
  lon: number | null;
  line: string;
  product: string;
  direction: string;
  plannedWhen: string | null;
  when: string | null;
  /** Real-time minus scheduled, in whole minutes (null = no realtime data). */
  delayMin: number | null;
  cancelled: boolean;
  platform: string | null;
  plannedPlatform: string | null;
  remarks: Remark[];
}

export interface DepartureBoard {
  stopId: string;
  fetchedAt: string;
  realtimeUpdatedAt: string | null;
  departures: Departure[];
}

export interface Station {
  id: string;
  name: string;
  lat: number | null;
  lon: number | null;
  products: string[];
}

function computeDelayMin(d: z.infer<typeof departureSchema>): number | null {
  // Primary: compare scheduled vs. real-time estimated departure.
  if (d.when && d.plannedWhen) {
    const diff = (Date.parse(d.when) - Date.parse(d.plannedWhen)) / 60000;
    if (Number.isFinite(diff)) return Math.round(diff);
  }
  // Fallback: upstream-provided delay (seconds).
  if (typeof d.delay === "number") return Math.round(d.delay / 60);
  return null;
}

function normalize(raw: unknown): Departure | null {
  const parsed = departureSchema.safeParse(raw);
  if (!parsed.success) return null;
  const d = parsed.data;
  return {
    tripId: d.tripId,
    stopId: d.stop?.id ?? "",
    stopName: d.stop?.name ?? "",
    lat: d.stop?.location?.latitude ?? null,
    lon: d.stop?.location?.longitude ?? null,
    line: d.line?.name ?? "?",
    product: d.line?.product ?? "unknown",
    direction: d.direction ?? "",
    plannedWhen: d.plannedWhen ?? null,
    when: d.when ?? null,
    delayMin: computeDelayMin(d),
    cancelled: d.cancelled === true,
    platform: d.platform ?? null,
    plannedPlatform: d.plannedPlatform ?? null,
    remarks: (d.remarks ?? [])
      .filter((r) => r.type === "warning" || r.type === "status")
      .map((r) => ({ type: r.type ?? "hint", summary: r.summary ?? "", text: (r.text ?? "").slice(0, 500) })),
  };
}

/** Real-time departures at a stop for the next `durationMin` minutes (cached, TTL 60s). */
export async function getDepartures(stopId: string, durationMin = env().DEPARTURE_WINDOW_MIN): Promise<DepartureBoard> {
  const e = env();
  const key = `vbb:departures:${stopId}:${durationMin}`;
  return upstreamCache.wrap(key, e.UPSTREAM_CACHE_TTL_SECONDS * 1000, async () => {
    const url = new URL(`${e.VBB_API_BASE}/stops/${encodeURIComponent(stopId)}/departures`);
    url.searchParams.set("duration", String(durationMin));
    url.searchParams.set("results", "40");
    url.searchParams.set("remarks", "true");
    url.searchParams.set("language", "en");
    const json = await fetchJsonWithRetry(url.toString(), { label: "vbb.departures" });
    const body = departuresResponseSchema.parse(json);
    const departures = body.departures.map(normalize).filter((d): d is Departure => d !== null);
    log.info("departures fetched", { stopId, count: departures.length });
    return {
      stopId,
      fetchedAt: new Date().toISOString(),
      realtimeUpdatedAt: body.realtimeDataUpdatedAt ? new Date(body.realtimeDataUpdatedAt * 1000).toISOString() : null,
      departures,
    };
  });
}

/** Station autocomplete (cached 10 min). */
export async function searchStations(query: string): Promise<Station[]> {
  const e = env();
  const q = query.trim().toLowerCase();
  return upstreamCache.wrap(`vbb:locations:${q}`, 10 * 60 * 1000, async () => {
    const url = new URL(`${e.VBB_API_BASE}/locations`);
    url.searchParams.set("query", q);
    url.searchParams.set("results", "8");
    url.searchParams.set("addresses", "false");
    url.searchParams.set("poi", "false");
    url.searchParams.set("stops", "true");
    url.searchParams.set("fuzzy", "true");
    url.searchParams.set("language", "en");
    const json = await fetchJsonWithRetry(url.toString(), { label: "vbb.locations", retries: 1 });
    const arr = z.array(z.unknown()).parse(json);
    return arr
      .map((r) => stationSchema.safeParse(r))
      .filter((r) => r.success && (r.data.type === "stop" || r.data.type === "station"))
      .map((r) => {
        const s = (r as { data: z.infer<typeof stationSchema> }).data;
        return {
          id: s.id,
          name: s.name,
          lat: s.location?.latitude ?? null,
          lon: s.location?.longitude ?? null,
          products: Object.entries(s.products ?? {})
            .filter(([, v]) => v)
            .map(([k]) => k),
        };
      });
  });
}

/** Match a departure against a tracked line (+ optional direction substring). */
export function matchesTrackedLine(d: Departure, lineName: string, direction: string): boolean {
  if (d.line.replace(/\s+/g, "").toUpperCase() !== lineName.replace(/\s+/g, "").toUpperCase()) return false;
  if (direction && !d.direction.toLowerCase().includes(direction.toLowerCase())) return false;
  return true;
}

export interface JourneyLeg {
  line: string | null;
  product: string | null;
  direction: string | null;
  fromName: string;
  fromId: string;
  toName: string;
  toId: string;
  departure: string;
  plannedDeparture: string;
  departureDelayMin: number;
  arrival: string;
  plannedArrival: string;
  arrivalDelayMin: number;
  cancelled: boolean;
  walking: boolean;
  platform: string | null;
  remarks: Remark[];
}

export interface Journey {
  id: string;
  departure: string;
  plannedDeparture: string;
  arrival: string;
  plannedArrival: string;
  durationMin: number;
  legs: JourneyLeg[];
  worstDelayMin: number;
  isCancelled: boolean;
  hasDisruptions: boolean;
  warnings: string[];
}

/** Route journey planner with real-time disruption & delay telemetry (cached 30s). */
export async function getJourneys(
  fromStopId: string,
  toStopId: string,
  departureTime?: string,
): Promise<Journey[]> {
  const e = env();
  const cacheKey = `vbb:journeys:${fromStopId}:${toStopId}:${departureTime || "now"}`;

  return upstreamCache.wrap(cacheKey, 30 * 1000, async () => {
    const url = new URL(`${e.VBB_API_BASE}/journeys`);
    url.searchParams.set("from", fromStopId);
    url.searchParams.set("to", toStopId);
    url.searchParams.set("results", "3");
    url.searchParams.set("remarks", "true");
    url.searchParams.set("language", "en");
    if (departureTime) {
      url.searchParams.set("departure", departureTime);
    }

    const raw = (await fetchJsonWithRetry(url.toString(), { label: "vbb.journeys" })) as any;
    const journeysList = Array.isArray(raw?.journeys) ? raw.journeys : [];

    return journeysList.map((j: any, index: number): Journey => {
      let worstDelayMin = 0;
      let isCancelled = false;
      const warningsSet = new Set<string>();

      const legs: JourneyLeg[] = (Array.isArray(j.legs) ? j.legs : []).map((leg: any): JourneyLeg => {
        const depDelaySec = typeof leg.departureDelay === "number" ? leg.departureDelay : 0;
        const arrDelaySec = typeof leg.arrivalDelay === "number" ? leg.arrivalDelay : 0;
        const depDelayMin = Math.round(depDelaySec / 60);
        const arrDelayMin = Math.round(arrDelaySec / 60);
        const cancelled = leg.cancelled === true;

        if (cancelled) isCancelled = true;
        if (Math.abs(depDelayMin) > worstDelayMin) worstDelayMin = Math.abs(depDelayMin);
        if (Math.abs(arrDelayMin) > worstDelayMin) worstDelayMin = Math.abs(arrDelayMin);

        const remarks: Remark[] = (Array.isArray(leg.remarks) ? leg.remarks : [])
          .filter((r: any) => r && (r.type === "warning" || r.type === "status" || r.summary))
          .map((r: any) => {
            const summary = r.summary || (r.code ? `Notice: ${r.code}` : "Disruption Note");
            const text = (r.text || "").replace(/<[^>]*>/g, "").slice(0, 400);
            if (summary || text) warningsSet.add(summary ? `${summary}: ${text}` : text);
            return { type: r.type || "warning", summary, text };
          });

        return {
          line: leg.line?.name ?? null,
          product: leg.line?.product ?? (leg.walking ? "walking" : null),
          direction: leg.direction ?? null,
          fromName: leg.origin?.name ?? "Origin",
          fromId: leg.origin?.id ?? "",
          toName: leg.destination?.name ?? "Destination",
          toId: leg.destination?.id ?? "",
          departure: leg.departure || leg.plannedDeparture || "",
          plannedDeparture: leg.plannedDeparture || leg.departure || "",
          departureDelayMin: depDelayMin,
          arrival: leg.arrival || leg.plannedArrival || "",
          plannedArrival: leg.plannedArrival || leg.arrival || "",
          arrivalDelayMin: arrDelayMin,
          cancelled,
          walking: Boolean(leg.walking),
          platform: leg.departurePlatform ?? leg.plannedDeparturePlatform ?? null,
          remarks,
        };
      });

      const firstLeg = legs[0];
      const lastLeg = legs[legs.length - 1];
      const depTime = firstLeg?.departure || new Date().toISOString();
      const arrTime = lastLeg?.arrival || depTime;
      const durationMin = Math.max(1, Math.round((Date.parse(arrTime) - Date.parse(depTime)) / 60000)) || 20;

      return {
        id: `journey-${index}-${Date.now()}`,
        departure: depTime,
        plannedDeparture: firstLeg?.plannedDeparture || depTime,
        arrival: arrTime,
        plannedArrival: lastLeg?.plannedArrival || arrTime,
        durationMin,
        legs,
        worstDelayMin,
        isCancelled,
        hasDisruptions: isCancelled || worstDelayMin >= 4 || warningsSet.size > 0,
        warnings: Array.from(warningsSet),
      };
    });
  });
}

