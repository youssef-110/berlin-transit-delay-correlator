import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, res } = await requireUser();
  if (res) return res;
  const { id } = await ctx.params;
  // Scope by userId → users can never delete someone else's line (IDOR-safe).
  const result = await db.trackedLine.deleteMany({ where: { id, userId: user.id } });
  if (result.count === 0) return jsonError(404, "Line not found");
  return NextResponse.json({ ok: true });
}
