import { NextResponse } from "next/server";
import { jsonError, parseBody } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";
import { credentialsSchema } from "@/lib/validation";

export const runtime = "nodejs";
const log = createLogger("auth");

export async function POST(req: Request) {
  const e = env();
  const ip = clientIp(req);
  const rl = rateLimit(`register:${ip}`, e.AUTH_RATE_LIMIT_MAX, e.AUTH_RATE_LIMIT_WINDOW_SECONDS);
  if (!rl.allowed) {
    log.warn("register rate limited", { ip });
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } });
  }

  const { data, res } = await parseBody(req, credentialsSchema);
  if (res) return res;

  const existing = await db.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (existing) return jsonError(409, "An account with this email already exists");

  const user = await db.user.create({
    data: { email: data.email, passwordHash: await hashPassword(data.password) },
    select: { id: true, email: true },
  });
  log.info("user registered", { userId: user.id });

  const token = await signSession({ sub: user.id, email: user.email });
  const response = NextResponse.json({ ok: true, user }, { status: 201 });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
