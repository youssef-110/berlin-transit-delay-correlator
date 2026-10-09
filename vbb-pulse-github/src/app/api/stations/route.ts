import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { searchStations } from "@/services/transit/vbb";
import { stationQuerySchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { user, res } = await requireUser();
  if (res) return res;
  const rl = rateLimit(`stations:${user.id}`, 60, 60);
  if (!rl.allowed) return jsonError(429, "Slow down");

  const parsed = stationQuerySchema.safeParse({ q: new URL(req.url).searchParams.get("q") ?? "" });
  if (!parsed.success) return NextResponse.json({ stations: [] });
  try {
    return NextResponse.json({ stations: await searchStations(parsed.data.q) });
  } catch {
    return jsonError(502, "Station search temporarily unavailable");
  }
}
