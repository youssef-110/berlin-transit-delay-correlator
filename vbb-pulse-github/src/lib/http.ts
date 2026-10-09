import { createLogger } from "./logger";

const log = createLogger("http");

export class UpstreamError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryable = true,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

export interface RetryOptions {
  retries?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  label?: string;
  headers?: Record<string, string>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET JSON with per-attempt timeout and exponential backoff + full jitter.
 * Retries on network errors, timeouts, 408, 429 and 5xx. Honors Retry-After.
 */
export async function fetchJsonWithRetry<T = unknown>(url: string, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? Number(process.env.UPSTREAM_MAX_RETRIES ?? 3);
  const timeoutMs = opts.timeoutMs ?? Number(process.env.UPSTREAM_TIMEOUT_MS ?? 8000);
  const base = opts.baseDelayMs ?? 400;
  const maxDelay = opts.maxDelayMs ?? 8000;
  const label = opts.label ?? new URL(url).host;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const started = Date.now();
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "vbb-pulse/1.0 (+transit-delay-correlator)", ...opts.headers },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      if (!res.ok) {
        const retryable = res.status === 408 || res.status === 429 || res.status >= 500;
        const retryAfter = Number(res.headers.get("retry-after"));
        const err = new UpstreamError(`${label} responded ${res.status}`, res.status, retryable);
        if (!retryable || attempt === retries) throw err;
        lastErr = err;
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, maxDelay) : backoff(attempt, base, maxDelay);
        log.warn("upstream retry", { label, attempt: attempt + 1, status: res.status, waitMs: wait });
        await sleep(wait);
        continue;
      }
      const json = (await res.json()) as T;
      log.debug("upstream ok", { label, ms: Date.now() - started, attempt: attempt + 1 });
      return json;
    } catch (err) {
      if (err instanceof UpstreamError && !err.retryable) throw err;
      lastErr = err;
      if (attempt === retries) break;
      const wait = backoff(attempt, base, maxDelay);
      log.warn("upstream retry", { label, attempt: attempt + 1, err: (err as Error).message, waitMs: wait });
      await sleep(wait);
    }
  }
  log.error("upstream failed", { label, err: lastErr });
  throw lastErr instanceof Error ? lastErr : new UpstreamError(`${label} failed`);
}

function backoff(attempt: number, base: number, max: number) {
  const exp = Math.min(max, base * 2 ** attempt);
  return Math.round(Math.random() * exp); // full jitter
}
