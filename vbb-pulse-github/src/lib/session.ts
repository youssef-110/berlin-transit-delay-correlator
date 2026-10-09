/**
 * Edge-safe session helpers (used by middleware AND server code).
 * HS256-signed JWT stored in an HTTP-only, SameSite=Strict cookie.
 */
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "vbb_session";

export interface SessionPayload {
  sub: string; // user id
  email: string;
}

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters long");
  }
  return new TextEncoder().encode(secret);
}

export function sessionTtlSeconds(): number {
  const hours = Number(process.env.SESSION_TTL_HOURS ?? 168);
  return Math.max(1, Math.floor(hours * 3600));
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setIssuer("vbb-pulse")
    .setAudience("vbb-pulse:web")
    .setExpirationTime(`${sessionTtlSeconds()}s`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
      issuer: "vbb-pulse",
      audience: "vbb-pulse:web",
    });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    return { sub: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAgeSeconds = sessionTtlSeconds()) {
  const isLocal = process.env.APP_URL?.startsWith("http://localhost") || process.env.APP_URL?.startsWith("http://127.0.0.1");
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && !isLocal,
    sameSite: "strict" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
