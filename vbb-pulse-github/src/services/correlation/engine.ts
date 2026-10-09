import "server-only";
import { berlinHHMM } from "@/lib/time";
import type { TransitEvent } from "../events/types";
import { STATIC_ALTERNATIVES, haversineKm, regionFor } from "../transit/hubs";
import { matchesTrackedLine, type Departure, type DepartureBoard } from "../transit/vbb";
import type { Region, Severity, WeatherResult } from "../weather/open-meteo";

export type LineHealth = "ON_TIME" | "MINOR" | "DELAYED" | "CANCELLED" | "NO_DATA";
export type DisruptionStatus = "DELAYED" | "CANCELLED";

export interface TrackedLineRef {
  id: string;
  lineName: string;
  stopId: string;
  stopName: string;
  direction: string;
}

export interface Insight {
  kind: "weather" | "event" | "operator";
  severity: Severity | "info";
  message: string;
  detail?: string;
}

export interface LineAnalysis {
  tracked: TrackedLineRef;
  health: LineHealth;
  departures: Departure[];
  worst: Departure | null;
  worstDelayMin: number;
  cancelledCount: number;
  delayedCount: number;
}

export interface CorrelatedDisruption {
  tracked: TrackedLineRef;
  status: DisruptionStatus;
  delayMin: number;
  routeLabel: string;
  departure: Departure;
  affectedCount: number;
  observedCount: number;
  insights: Insight[];
  alternative: string | null;
  signature: string;
}

const MINOR_DELAY_MIN = 2;

/** Compare scheduled vs. realtime for one tracked line on a departure board. */
export function analyzeLine(tracked: TrackedLineRef, board: DepartureBoard | null, delayThresholdMin: number): LineAnalysis {
  if (!board) {
    return { tracked, health: "NO_DATA", departures: [], worst: null, worstDelayMin: 0, cancelledCount: 0, delayedCount: 0 };
  }
  const departures = board.departures
    .filter((d) => matchesTrackedLine(d, tracked.lineName, tracked.direction))
    .sort((a, b) => (a.plannedWhen ?? "").localeCompare(b.plannedWhen ?? ""));

  const cancelled = departures.filter((d) => d.cancelled);
  const delayed = departures.filter((d) => !d.cancelled && (d.delayMin ?? 0) >= delayThresholdMin);
  const maxDelay = departures.reduce((m, d) => (d.cancelled ? m : Math.max(m, d.delayMin ?? 0)), 0);
  const worst =
    cancelled[0] ??
    departures.reduce<Departure | null>((w, d) => (!d.cancelled && (d.delayMin ?? 0) > (w?.delayMin ?? -1) ? d : w), null);

  let health: LineHealth = "ON_TIME";
  if (departures.length === 0) health = "NO_DATA";
  else if (cancelled.length) health = "CANCELLED";
  else if (maxDelay >= delayThresholdMin) health = "DELAYED";
  else if (maxDelay >= MINOR_DELAY_MIN) health = "MINOR";

  return { tracked, health, departures, worst, worstDelayMin: maxDelay, cancelledCount: cancelled.length, delayedCount: delayed.length };
}

export function routeLabel(lineName: string, stopName: string, direction: string): string {
  const stop = stopName.replace(/^(S\+U|S|U)\s+/, "").replace(/\s*\(Berlin\)$/, "").replace(/ Bhf$/, "");
  const dir = direction.replace(/^(S\+U|S|U)\s+/, "").replace(/\s*\(Berlin\)$/, "").replace(/ Bhf$/, "");
  return `${lineName} – ${stop}${dir ? ` → ${dir}` : ""}`;
}

function hashTo32Hex(str: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch;
    h2 = Math.imul(h2, 0x5bd1e995);
  }
  const p1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const p2 = (h2 >>> 0).toString(16).padStart(8, "0");
  const p3 = ((h1 ^ h2) >>> 0).toString(16).padStart(8, "0");
  const p4 = ((h1 + h2) >>> 0).toString(16).padStart(8, "0");
  return `${p1}${p2}${p3}${p4}`;
}

export function disruptionSignature(t: TrackedLineRef, status: DisruptionStatus, remarks: string[]): string {
  const remarkKey = remarks.map((r) => r.toLowerCase().replace(/\s+/g, " ").trim()).sort()[0] ?? "";
  const raw = [t.lineName.toUpperCase(), t.stopId, t.direction.toLowerCase(), status, remarkKey].join("|");
  return hashTo32Hex(raw);
}

// ── Correlation ──────────────────────────────────────────────────────────────

function weatherInsights(weather: Record<Region, WeatherResult>, dep: Departure): Insight[] {
  const region = regionFor(dep.lat, dep.lon);
  const w = weather[region];
  if (!w?.available) return [];
  return w.anomalies.map((a) => ({ kind: "weather" as const, severity: a.severity, message: a.message, detail: a.transitImpact }));
}

function stationMatches(stopName: string, candidates: string[]): boolean {
  const s = stopName.toLowerCase();
  return candidates.some((c) => s.includes(c.toLowerCase().replace(/\.$/, "")));
}

export function eventInsights(events: TransitEvent[], lineName: string, dep: Pick<Departure, "stopName" | "lat" | "lon">, now = new Date()): Insight[] {
  const t = now.getTime();
  const out: Insight[] = [];
  for (const ev of events) {
    const start = Date.parse(ev.startsAt);
    const end = Date.parse(ev.endsAt);
    const lineHit = ev.affectedLines.some((l) => l.toUpperCase() === lineName.toUpperCase());
    const stopHit = stationMatches(dep.stopName, ev.nearbyStops);
    const near = dep.lat !== null && dep.lon !== null && haversineKm(dep.lat, dep.lon, ev.lat, ev.lon) <= 3;
    if (!lineHit && !stopHit && !near) continue;

    const crowdAt = ev.nearbyStops[0] ?? ev.venue;
    const att = ev.expectedAttendance ? ` (~${ev.expectedAttendance.toLocaleString("en-US")} visitors)` : "";
    if (t >= start - 90 * 60000 && t < start) {
      out.push({
        kind: "event",
        severity: lineHit ? "high" : "moderate",
        message: `${ev.title} at ${ev.venue} starting at ${berlinHHMM(start)}${att}`,
        detail: `Expect arrival crowds and longer dwell times around ${crowdAt}.`,
      });
    } else if (t >= end - 30 * 60000 && t <= end + 60 * 60000) {
      out.push({
        kind: "event",
        severity: lineHit ? "high" : "moderate",
        message: `Event at ${ev.venue} ending at ${berlinHHMM(end)}${att}`,
        detail: `Expect platform overcrowding at ${crowdAt}.`,
      });
    } else if (t >= start && t < end - 30 * 60000) {
      out.push({ kind: "event", severity: "info", message: `${ev.title} ongoing at ${ev.venue} until ${berlinHHMM(end)}`, detail: `Crowds expected at ${crowdAt} after the event.` });
    }
  }
  return out;
}

function tokens(s: string): Set<string> {
  const stop = new Set(["s", "u", "s+u", "bhf", "berlin", "hbf", "str.", "platz"]);
  return new Set(
    s
      .toLowerCase()
      .replace(/[(),]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stop.has(w)),
  );
}

/** Live alternative from the same departure board, else a static corridor hint. */
export function suggestAlternative(board: DepartureBoard | null, disrupted: Departure, lineName: string): string | null {
  if (board) {
    const now = Date.now();
    const target = tokens(disrupted.direction);
    const candidates = board.departures.filter((d) => {
      if (d.cancelled || (d.delayMin ?? 0) >= 3 || !d.when) return false;
      if (d.tripId === disrupted.tripId) return false;
      const when = Date.parse(d.when);
      if (when < now || when > now + 25 * 60000) return false;
      // Any other punctual trip heading the same way (incl. the next trip of the same line).
      return [...tokens(d.direction)].some((w) => target.has(w));
    });
    candidates.sort((a, b) => Date.parse(a.when!) - Date.parse(b.when!));
    const alt = candidates[0];
    if (alt) {
      const plat = alt.platform ? `, platform ${alt.platform}` : "";
      const punct = alt.delayMin && alt.delayMin > 0 ? `+${alt.delayMin} min` : "on time";
      return `Take ${alt.line} → ${alt.direction} at ${berlinHHMM(alt.when!)}${plat} (${punct}).`;
    }
  }
  return STATIC_ALTERNATIVES[lineName.toUpperCase()] ?? null;
}

/** Build a fully-correlated disruption, or null if the line is healthy. */
export function correlate(
  analysis: LineAnalysis,
  board: DepartureBoard | null,
  weather: Record<Region, WeatherResult>,
  events: TransitEvent[],
): CorrelatedDisruption | null {
  if (!analysis.worst || (analysis.health !== "DELAYED" && analysis.health !== "CANCELLED")) return null;
  const dep = analysis.worst;
  const status: DisruptionStatus = analysis.health === "CANCELLED" ? "CANCELLED" : "DELAYED";
  const remarkTexts = [...new Set(analysis.departures.flatMap((d) => d.remarks.map((r) => r.summary || r.text)).filter(Boolean))];

  const insights: Insight[] = [
    ...weatherInsights(weather, dep),
    ...eventInsights(events, analysis.tracked.lineName, dep),
    ...remarkTexts.slice(0, 3).map((m) => ({ kind: "operator" as const, severity: "info" as const, message: m })),
  ];

  return {
    tracked: analysis.tracked,
    status,
    delayMin: status === "CANCELLED" ? Math.max(analysis.worstDelayMin, 0) : analysis.worstDelayMin,
    routeLabel: routeLabel(analysis.tracked.lineName, analysis.tracked.stopName, dep.direction),
    departure: dep,
    affectedCount: analysis.cancelledCount + analysis.delayedCount,
    observedCount: analysis.departures.length,
    insights,
    alternative: suggestAlternative(board, dep, analysis.tracked.lineName),
    signature: disruptionSignature(analysis.tracked, status, remarkTexts),
  };
}
