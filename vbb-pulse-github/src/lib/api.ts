import "server-only";
import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";
import { getSessionUser, type SessionUser } from "./auth";

export function jsonError(status: number, error: string, details?: unknown) {
  return NextResponse.json({ error, ...(details ? { details } : {}) }, { status });
}

/** Parse + validate a JSON body. Returns either data or a ready 400 response. */
export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<{ data: T; res?: never } | { data?: never; res: NextResponse }> {
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > 16_384) return { res: jsonError(413, "Payload too large") };
    raw = text ? JSON.parse(text) : {};
  } catch {
    return { res: jsonError(400, "Invalid JSON body") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { res: jsonError(400, parsed.error.issues[0]?.message ?? "Invalid input", parsed.error.flatten().fieldErrors) };
  }
  return { data: parsed.data };
}

/** Resolve the session user for a route handler, or a 401 response. */
export async function requireUser(): Promise<{ user: SessionUser; res?: never } | { user?: never; res: NextResponse }> {
  const user = await getSessionUser();
  if (!user) return { res: jsonError(401, "Unauthorized") };
  return { user };
}
