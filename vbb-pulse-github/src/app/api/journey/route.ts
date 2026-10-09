import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api";
import { getJourneys } from "@/services/transit/vbb";
import { getAllWeather } from "@/services/weather/open-meteo";
import { getEvents } from "@/services/events/aggregator";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { res } = await requireUser();
  if (res) return res;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const departure = searchParams.get("departure") || undefined;

  if (!from || !to) {
    return jsonError(400, "Both 'from' and 'to' stop IDs are required");
  }

  try {
    const [journeys, weather, events] = await Promise.all([
      getJourneys(from, to, departure),
      getAllWeather(),
      getEvents(),
    ]);

    return NextResponse.json({
      ok: true,
      journeys,
      weather,
      events: events.slice(0, 5),
    });
  } catch (err) {
    return jsonError(500, `Failed to load journeys: ${(err as Error).message}`);
  }
}
