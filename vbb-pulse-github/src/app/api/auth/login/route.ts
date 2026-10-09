import { NextResponse } from "next/server";
import { jsonError, parseBody } from "@/lib/api";
import { verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";
import { loginSchema } from "@/lib/validation";

export const runtime = "nodejs";
const log = createLogger("auth");

export async function POST(req: Request) {
  const e = env();
  const ip = clientIp(req);
  const rl = rateLimit(`login:${ip}`, e.AUTH_RATE_LIMIT_MAX, e.AUTH_RATE_LIMIT_WINDOW_SECONDS);
  if (!rl.allowed) {
    log.warn("login rate limited", { ip });
    return NextResponse.json({ error: "Too many login attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } });
  }

  // Validate shape only loosely on login (don't leak password policy details).
  const { data, res } = await parseBody(req, loginSchema);
  if (res) return res;

  const user = await db.user.findUnique({ where: { email: data.email }, select: { id: true, email: true, passwordHash: true } });
  const ok = await verifyPassword(data.password, user?.passwordHash);
  if (!user || !ok) {
    log.warn("login failed", { ip });
    return jsonError(401, "Invalid email or password");
  }

  log.info("login success", { userId: user.id });
  const token = await signSession({ sub: user.id, email: user.email });
  const response = NextResponse.json({ ok: true, user: { id: user.id, email: user.email } });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
