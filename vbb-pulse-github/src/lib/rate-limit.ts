import "server-only";

/**
 * Sliding-window rate limiter (in-memory). Keyed by e.g. `login:<ip>`.
 * For horizontally scaled deployments, back this with Redis (INCR + EXPIRE).
 */
const g = globalThis as unknown as { __rl?: Map<string, number[]> };
const buckets = g.__rl ?? (g.__rl = new Map<string, number[]>());

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, max: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);

  if (hits.length >= max) {
    const oldest = hits[0] ?? now;
    buckets.set(key, hits);
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((oldest + windowMs - now) / 1000) };
  }
  hits.push(now);
  buckets.set(key, hits);

  // Opportunistic GC so the map cannot grow unbounded
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
  }
  return { allowed: true, remaining: max - hits.length, retryAfterSeconds: 0 };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
