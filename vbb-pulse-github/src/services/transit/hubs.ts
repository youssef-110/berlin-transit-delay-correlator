/**
 * Curated Berlin/Potsdam hubs (IDs verified against v6.vbb.transport.rest).
 * Used for quick-add in the UI, event-proximity mapping and demo seeding.
 */
export interface Hub {
  id: string;
  name: string;
  short: string;
  lat: number;
  lon: number;
  region: "berlin" | "potsdam";
  lines: string[];
}

export const HUBS: Hub[] = [
  { id: "900230999", name: "S Potsdam Hauptbahnhof", short: "Potsdam Hbf", lat: 52.391443, lon: 13.06716, region: "potsdam", lines: ["S7", "RE1", "RB21", "RB23", "91", "92", "96"] },
  { id: "900230000", name: "S Babelsberg", short: "Babelsberg", lat: 52.391452, lon: 13.094631, region: "potsdam", lines: ["S7", "RB23"] },
  { id: "900230003", name: "S Griebnitzsee Bhf", short: "Griebnitzsee", lat: 52.393942, lon: 13.128808, region: "potsdam", lines: ["S7", "RE1"] },
  { id: "900100003", name: "S+U Alexanderplatz Bhf", short: "Alexanderplatz", lat: 52.521508, lon: 13.411267, region: "berlin", lines: ["S3", "S5", "S7", "S9", "U2", "U5", "U8", "RE1", "M4", "M5", "M6"] },
  { id: "900100001", name: "S+U Friedrichstr. Bhf", short: "Friedrichstraße", lat: 52.520304, lon: 13.387257, region: "berlin", lines: ["S1", "S2", "S3", "S5", "S7", "S9", "S25", "S26", "U6", "RE1", "M1", "12"] },
  { id: "900023201", name: "S+U Zoologischer Garten Bhf", short: "Zoologischer Garten", lat: 52.506919, lon: 13.332711, region: "berlin", lines: ["S3", "S5", "S7", "S9", "U2", "U9", "RE1", "M45", "100", "200"] },
  { id: "900003201", name: "S+U Berlin Hauptbahnhof", short: "Hauptbahnhof", lat: 52.525607, lon: 13.369072, region: "berlin", lines: ["S3", "S5", "S7", "S9", "U5", "RE1", "M5", "M8", "M10"] },
  { id: "900120004", name: "S+U Warschauer Str.", short: "Warschauer Str.", lat: 52.505768, lon: 13.449157, region: "berlin", lines: ["S3", "S5", "S7", "S9", "U1", "U3", "M10"] },
  { id: "900120003", name: "S Ostkreuz Bhf", short: "Ostkreuz", lat: 52.503116, lon: 13.469221, region: "berlin", lines: ["S3", "S5", "S7", "S8", "S9", "S41", "S42", "RE1"] },
  { id: "900025321", name: "S Olympiastadion", short: "Olympiastadion", lat: 52.511135, lon: 13.241111, region: "berlin", lines: ["S3", "S9"] },
  { id: "900025423", name: "S Messe Süd", short: "Messe Süd", lat: 52.498774, lon: 13.270451, region: "berlin", lines: ["S3", "S9"] },
  { id: "900130002", name: "S+U Pankow", short: "Pankow", lat: 52.567281, lon: 13.412283, region: "berlin", lines: ["S2", "S8", "S85", "U2"] },
];

export const POPULAR_LINES = ["S7", "S1", "S3", "S5", "S9", "S41", "U2", "U5", "U8", "RE1", "M10", "M4"];

/** Static fallback alternatives when no live alternative is found on the board. */
export const STATIC_ALTERNATIVES: Record<string, string> = {
  S7: "Between Potsdam Hbf and Berlin, RE1 (every 20 min) runs on the parallel mainline via Wannsee, Zoo and Friedrichstraße.",
  RE1: "S7 serves the same corridor Potsdam ↔ Berlin city (slower but every 10 min).",
  S1: "U2/U6 or the S2 corridor (Nord-Süd tunnel) cover large parts of the S1 route.",
  S3: "S5/S7/S9 share the Stadtbahn trunk between Ostkreuz and Westkreuz.",
  S5: "S3/S7/S9 share the Stadtbahn trunk between Ostkreuz and Westkreuz.",
  S9: "S3/S5/S7 share the Stadtbahn trunk; U5 connects Alexanderplatz ↔ Hauptbahnhof.",
  S41: "The opposite Ring direction S42 or crosstown U-Bahn lines (U7, U8) may be faster.",
  S42: "The opposite Ring direction S41 or crosstown U-Bahn lines (U7, U8) may be faster.",
  U2: "The S-Bahn Stadtbahn (S3/S5/S7/S9) parallels U2 between Alexanderplatz and Zoo.",
  U5: "S-Bahn Stadtbahn lines connect Alexanderplatz ↔ Hauptbahnhof in 6 minutes.",
  U8: "M8 tram or S-Bahn Ring connections can bypass the U8 trunk.",
  M10: "U1/U3 at Warschauer Str. or S-Bahn Ring (S41/S42) via Frankfurter Allee.",
};

export function regionFor(lat: number | null, lon: number | null): "berlin" | "potsdam" {
  if (lat === null || lon === null) return "berlin";
  // Potsdam lies west of ~13.15°E and south of ~52.43°N.
  return lon < 13.15 && lat < 52.43 ? "potsdam" : "berlin";
}

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
