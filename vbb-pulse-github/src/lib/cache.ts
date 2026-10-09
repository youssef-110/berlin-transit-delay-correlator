import { createLogger } from "./logger";

const log = createLogger("cache");

interface Entry<T> {
  value: T;
  expiresAt: number;
}

/**
 * In-memory TTL cache with request coalescing ("single-flight"):
 * concurrent misses for the same key share ONE upstream request, which
 * protects VBB / Open-Meteo from bursts (e.g. 50 users on the same stop).
 *
 * For multi-instance deployments swap this for Redis with the same interface.
 */
export class TtlCache {
  private store = new Map<string, Entry<unknown>>();
  private inflight = new Map<string, Promise<unknown>>();
  private hits = 0;
  private misses = 0;

  constructor(private readonly maxEntries = 1000) {}

  get<T>(key: string): T | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return e.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number) {
    if (this.store.size >= this.maxEntries) {
      // Evict oldest insertion (Map preserves insertion order)
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async wrap<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const cachedValue = this.get<T>(key);
    if (cachedValue !== undefined) {
      this.hits++;
      log.debug("cache hit", { key });
      return cachedValue;
    }
    const pending = this.inflight.get(key);
    if (pending) {
      this.hits++;
      log.debug("cache coalesced", { key });
      return pending as Promise<T>;
    }
    this.misses++;
    log.debug("cache miss", { key });
    const p = loader()
      .then((v) => {
        this.set(key, v, ttlMs);
        return v;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  stats() {
    const total = this.hits + this.misses;
    return {
      size: this.store.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total ? Number((this.hits / total).toFixed(3)) : 0,
    };
  }
}

const g = globalThis as unknown as { __upstreamCache?: TtlCache };
export const upstreamCache = g.__upstreamCache ?? (g.__upstreamCache = new TtlCache());
