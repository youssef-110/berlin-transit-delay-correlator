import { NextResponse } from "next/server";
import { parseBody, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { settingsSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  const { user, res } = await requireUser();
  if (res) return res;
  return NextResponse.json({ user });
}

export async function PATCH(req: Request) {
  const { user, res } = await requireUser();
  if (res) return res;
  const { data, res: bad } = await parseBody(req, settingsSchema);
  if (bad) return bad;

  if (data.email && data.email !== user.email) {
    const existing = await db.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return NextResponse.json({ ok: false, error: "This email address is already in use by another account." }, { status: 400 });
    }
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data,
    select: { email: true, delayThresholdMin: true, cooldownMinutes: true, quietHoursStart: true, quietHoursEnd: true, emailEnabled: true, cityAlertsEnabled: true },
  });
  return NextResponse.json({ ok: true, settings: updated });
}
