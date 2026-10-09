/**
 * Next.js instrumentation hook – runs once per server process at boot.
 * Starts the background poller only in the Node.js runtime (not Edge).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startPoller } = await import("./services/poller/poller");
  const { createLogger } = await import("./lib/logger");
  try {
    startPoller();
  } catch (err) {
    createLogger("boot").error("failed to start poller", { err });
  }
}
