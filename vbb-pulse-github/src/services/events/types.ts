export interface TransitEvent {
  id: string;
  title: string;
  venue: string;
  lat: number;
  lon: number;
  startsAt: string; // ISO
  endsAt: string; // ISO
  expectedAttendance: number | null;
  /** Human-readable stations that will see crowding, e.g. "Warschauer Str." */
  nearbyStops: string[];
  /** Lines most impacted by arrival/departure crowds */
  affectedLines: string[];
  source: string;
}

/** Pluggable event source (seeded venues, Ticketmaster, Berlin Open Data, …). */
export interface EventSource {
  readonly name: string;
  isEnabled(): boolean;
  fetchEvents(from: Date, to: Date): Promise<TransitEvent[]>;
}
