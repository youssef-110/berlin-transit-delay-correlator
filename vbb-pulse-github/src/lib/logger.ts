/**
 * Minimal structured JSON logger (zero deps). One JSON object per line,
 * friendly to Loki / Datadog / CloudWatch. Pretty-prints in development.
 */
type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const lvl = (process.env.LOG_LEVEL ?? "info") as Level;
  return ORDER[lvl] ?? ORDER.info;
}

function serializeError(err: unknown) {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack };
  return err;
}

function emit(level: Level, component: string, msg: string, fields?: Record<string, unknown>) {
  if (ORDER[level] < threshold()) return;
  const record: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    component,
    msg,
    ...fields,
  };
  if (record.err) record.err = serializeError(record.err);

  const line =
    process.env.NODE_ENV === "production"
      ? JSON.stringify(record)
      : `${record.ts} ${level.toUpperCase().padEnd(5)} [${component}] ${msg}${
          fields && Object.keys(fields).length ? " " + JSON.stringify(fields, (_k, v) => (v instanceof Error ? serializeError(v) : v)) : ""
        }`;

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(component: string): Logger;
}

export function createLogger(component: string): Logger {
  return {
    debug: (m, f) => emit("debug", component, m, f),
    info: (m, f) => emit("info", component, m, f),
    warn: (m, f) => emit("warn", component, m, f),
    error: (m, f) => emit("error", component, m, f),
    child: (sub) => createLogger(`${component}:${sub}`),
  };
}

export const logger = createLogger("app");
