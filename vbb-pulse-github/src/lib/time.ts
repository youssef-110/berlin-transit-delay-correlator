export const BERLIN_TZ = "Europe/Berlin";

const hhmmFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: BERLIN_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "HH:MM" in Berlin local time. */
export function berlinHHMM(date: Date | string | number = new Date()): string {
  return hhmmFmt.format(new Date(date));
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * True if `now` (Berlin local) falls within [start, end). Supports windows
 * that wrap past midnight, e.g. 22:00 → 06:30.
 */
export function isWithinQuietHours(start: string | null | undefined, end: string | null | undefined, now = new Date()): boolean {
  if (!start || !end || start === end) return false;
  const cur = toMinutes(berlinHHMM(now));
  const s = toMinutes(start);
  const e = toMinutes(end);
  return s < e ? cur >= s && cur < e : cur >= s || cur < e;
}

/** Berlin calendar date "YYYY-MM-DD". */
export function berlinDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BERLIN_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Build a Date for a Berlin-local wall-clock time on the given Berlin date. */
export function berlinWallClock(dateKey: string, hhmm: string): Date {
  // Determine Berlin's UTC offset on that date (handles CET/CEST).
  const probe = new Date(`${dateKey}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: BERLIN_TZ, timeZoneName: "shortOffset" }).formatToParts(probe);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
  const match = /GMT([+-]\d{1,2})(?::(\d{2}))?/.exec(tz);
  const offH = match ? Number(match[1]) : 1;
  const offM = match?.[2] ? Number(match[2]) : 0;
  const sign = offH < 0 ? "-" : "+";
  const off = `${sign}${String(Math.abs(offH)).padStart(2, "0")}:${String(offM).padStart(2, "0")}`;
  return new Date(`${dateKey}T${hhmm}:00${off}`);
}
