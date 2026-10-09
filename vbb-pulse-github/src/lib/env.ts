import "server-only";
import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => (v ?? "").toLowerCase() === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168),
  APP_URL: z.string().url().default("http://localhost:3000"),

  EMAIL_FROM: z.string().min(3).default("VBB Pulse <alerts@vbbpulse.local>"),
  RESEND_API_KEY: z.string().optional().transform((v) => v || undefined),
  SMTP_HOST: z.string().optional().transform((v) => v || undefined),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: bool,
  SMTP_USER: z.string().optional().transform((v) => v || undefined),
  SMTP_PASS: z.string().optional().transform((v) => v || undefined),

  VBB_API_BASE: z.string().url().default("https://v6.vbb.transport.rest"),
  OPEN_METEO_BASE: z.string().url().default("https://api.open-meteo.com/v1"),
  TICKETMASTER_API_KEY: z.string().optional().transform((v) => v || undefined),
  UPSTREAM_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  UPSTREAM_MAX_RETRIES: z.coerce.number().int().min(0).max(8).default(3),

  POLLER_ENABLED: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase() !== "false"),
  POLL_INTERVAL_SECONDS: z.coerce.number().int().min(15).default(120),
  DEPARTURE_WINDOW_MIN: z.coerce.number().int().min(5).max(180).default(45),
  ESCALATION_DELTA_MIN: z.coerce.number().int().min(1).default(10),
  ESCALATION_BYPASSES_COOLDOWN: bool,

  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Validated, typed environment. Throws a readable error on misconfiguration. */
export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function reloadEnv(): Env {
  cached = null;
  return env();
}
