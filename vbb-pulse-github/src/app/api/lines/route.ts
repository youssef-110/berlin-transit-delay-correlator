import { NextResponse } from "next/server";
import { jsonError, parseBody, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { trackedLineSchema } from "@/lib/validation";

export const runtime = "nodejs";
const MAX_TRACKED = 12;

export async function GET() {
  const { user, res } = await requireUser();
  if (res) return res;
  const lines = await db.trackedLine.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ lines });
}

export async function POST(req: Request) {
  const { user, res } = await requireUser();
  if (res) return res;
  const { data, res: bad } = await parseBody(req, trackedLineSchema);
  if (bad) return bad;

  const count = await db.trackedLine.count({ where: { userId: user.id } });
  if (count >= MAX_TRACKED) return jsonError(422, `You can track up to ${MAX_TRACKED} lines`);

  try {
    const line = await db.trackedLine.create({ data: { ...data, userId: user.id } });
    return NextResponse.json({ ok: true, line }, { status: 201 });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return jsonError(409, "You already track this line at this stop");
    throw err;
  }
}
