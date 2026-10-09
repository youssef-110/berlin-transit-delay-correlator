import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api";
import { buildDashboard } from "@/services/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { user, res } = await requireUser();
  if (res) return res;
  const data = await buildDashboard(user.id);
  if (!data) return jsonError(404, "User not found");
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
