import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness/readiness probe – intentionally exposes no sensitive details. */
export async function GET() {
  let database = "ok";
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    database = "error";
  }
  return NextResponse.json({ status: database === "ok" ? "ok" : "degraded", database, time: new Date().toISOString() }, { status: database === "ok" ? 200 : 503 });
}
