import { berlinDateKey, berlinWallClock } from "@/lib/time";
import type { EventSource, TransitEvent } from "./types";

/**
 * Seeded venue adapter: real major venues with a deterministic schedule
 * simulation (stable per calendar day, so the dashboard and poller agree).
 */
interface Slot {
  /** 0=Sun … 6=Sat */
  weekdays: number[];
  start: string; // HH:MM Berlin
  durationMin: number;
  probability: number; // chance the slot is "booked" on a matching day
  titles: string[];
  attendance: [number, number];
}

interface Venue {
  id: string;
  name: string;
  lat: number;
  lon: number;
  nearbyStops: string[];
  affectedLines: string[];
  slots: Slot[];
  /** Fixed-date real events (YYYY-MM-DD inclusive ranges). */
  fixed?: { from: string; to: string; start: string; durationMin: number; title: string; attendance: number }[];
}

const VENUES: Venue[] = [
  {
    id: "olympiastadion",
    name: "Olympiastadion Berlin",
    lat: 52.5147,
    lon: 13.2395,
    nearbyStops: ["Olympiastadion", "Pichelsberg", "Westkreuz"],
    affectedLines: ["S3", "S9", "U2"],
    slots: [
      { weekdays: [6], start: "13:00", durationMin: 120, probability: 0.5, titles: ["Hertha BSC – 2. Bundesliga home match"], attendance: [35000, 60000] },
      { weekdays: [0], start: "13:30", durationMin: 120, probability: 0.3, titles: ["Hertha BSC – 2. Bundesliga home match"], attendance: [30000, 55000] },
      { weekdays: [5, 6], start: "19:30", durationMin: 180, probability: 0.15, titles: ["Stadium concert", "Open-air festival night"], attendance: [50000, 70000] },
    ],
  },
  {
    id: "uber-arena",
    name: "Uber Arena",
    lat: 52.5053,
    lon: 13.4436,
    nearbyStops: ["Warschauer Str.", "Ostbahnhof"],
    affectedLines: ["S3", "S5", "S7", "S9", "U1", "U3", "M10"],
    slots: [
      { weekdays: [0, 1, 2, 3, 4, 5, 6], start: "19:30", durationMin: 180, probability: 0.7, titles: ["Eisbären Berlin – DEL home game", "ALBA Berlin – EuroLeague", "Arena concert", "Comedy tour live"], attendance: [9000, 17000] },
      { weekdays: [0, 6], start: "15:00", durationMin: 150, probability: 0.25, titles: ["Family show", "Eisbären Berlin – DEL matinee"], attendance: [7000, 14000] },
    ],
  },
  {
    id: "messe-berlin",
    name: "Messe Berlin / ExpoCenter City",
    lat: 52.5016,
    lon: 13.2707,
    nearbyStops: ["Messe Süd", "Messe Nord/ICC", "Kaiserdamm"],
    affectedLines: ["S3", "S9", "S41", "S42", "S46", "U2"],
    slots: [
      { weekdays: [1, 2, 3, 4, 5], start: "09:00", durationMin: 540, probability: 0.35, titles: ["Trade fair", "Industry congress"], attendance: [8000, 30000] },
    ],
    fixed: [
      { from: "2026-01-16", to: "2026-01-25", start: "10:00", durationMin: 480, title: "Internationale Grüne Woche", attendance: 40000 },
      { from: "2026-03-03", to: "2026-03-05", start: "10:00", durationMin: 480, title: "ITB Berlin", attendance: 35000 },
      { from: "2026-09-04", to: "2026-09-08", start: "10:00", durationMin: 480, title: "IFA Berlin", attendance: 45000 },
      { from: "2026-09-22", to: "2026-09-25", start: "09:00", durationMin: 540, title: "InnoTrans – rail technology fair", attendance: 40000 },
    ],
  },
  {
    id: "park-babelsberg",
    name: "Park Babelsberg / Filmpark Potsdam",
    lat: 52.4006,
    lon: 13.0896,
    nearbyStops: ["Babelsberg", "Griebnitzsee", "Potsdam Hbf"],
    affectedLines: ["S7", "RE1", "RB23", "94", "694"],
    slots: [
      { weekdays: [5, 6], start: "18:30", durationMin: 210, probability: 0.35, titles: ["Open-air cinema & concert", "Filmpark evening show"], attendance: [3000, 9000] },
      { weekdays: [0, 6], start: "11:00", durationMin: 360, probability: 0.3, titles: ["Weekend festival in the park", "Filmpark stunt show day"], attendance: [4000, 12000] },
    ],
  },
];

/** FNV-1a → [0,1) – deterministic pseudo-random per (venue, slot, day). */
function rand(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function dayKeys(from: Date, to: Date): string[] {
  const keys = new Set<string>();
  for (let t = from.getTime() - 86400000; t <= to.getTime() + 86400000; t += 3600000 * 6) keys.add(berlinDateKey(new Date(t)));
  return [...keys];
}

export class SeededVenueSource implements EventSource {
  readonly name = "seeded-venues";
  isEnabled() {
    return true;
  }

  async fetchEvents(from: Date, to: Date): Promise<TransitEvent[]> {
    const events: TransitEvent[] = [];
    for (const day of dayKeys(from, to)) {
      const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
      for (const v of VENUES) {
        const base = { venue: v.name, lat: v.lat, lon: v.lon, nearbyStops: v.nearbyStops, affectedLines: v.affectedLines, source: this.name };

        const fixed = v.fixed?.find((f) => day >= f.from && day <= f.to);
        if (fixed) {
          const s = berlinWallClock(day, fixed.start);
          events.push({ ...base, id: `${v.id}:${day}:fixed`, title: fixed.title, startsAt: s.toISOString(), endsAt: new Date(s.getTime() + fixed.durationMin * 60000).toISOString(), expectedAttendance: fixed.attendance });
          continue; // fixed fair occupies the venue
        }

        v.slots.forEach((slot, i) => {
          if (!slot.weekdays.includes(weekday)) return;
          const r = rand(`${v.id}:${i}:${day}`);
          if (r >= slot.probability) return;
          const s = berlinWallClock(day, slot.start);
          const title = slot.titles[Math.floor(rand(`${v.id}:${i}:${day}:t`) * slot.titles.length)] ?? slot.titles[0]!;
          const [lo, hi] = slot.attendance;
          events.push({
            ...base,
            id: `${v.id}:${day}:${i}`,
            title,
            startsAt: s.toISOString(),
            endsAt: new Date(s.getTime() + slot.durationMin * 60000).toISOString(),
            expectedAttendance: Math.round((lo + (hi - lo) * rand(`${v.id}:${i}:${day}:a`)) / 500) * 500,
          });
        });
      }
    }
    return events.filter((e) => Date.parse(e.endsAt) >= from.getTime() && Date.parse(e.startsAt) <= to.getTime());
  }
}
