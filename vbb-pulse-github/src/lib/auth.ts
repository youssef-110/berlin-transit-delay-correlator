import "server-only";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { db } from "./db";
import { SESSION_COOKIE, verifySession } from "./session";

export const BCRYPT_ROUNDS = 12;

// Pre-computed hash used to equalize timing when the user does not exist
// (prevents account enumeration via response-time differences).
const DUMMY_HASH = bcrypt.hashSync("vbb-pulse-timing-equalizer", BCRYPT_ROUNDS);

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  const ok = await bcrypt.compare(plain, hash ?? DUMMY_HASH);
  return Boolean(hash) && ok;
}

/** Returns the authenticated user (without password hash) or null. */
export async function getSessionUser() {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  return db.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      email: true,
      delayThresholdMin: true,
      cooldownMinutes: true,
      quietHoursStart: true,
      quietHoursEnd: true,
      emailEnabled: true,
      createdAt: true,
    },
  });
}

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;
