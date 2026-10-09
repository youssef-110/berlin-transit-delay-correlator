import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { berlinHHMM, isWithinQuietHours } from "@/lib/time";
import type { CorrelatedDisruption, Insight, TrackedLineRef } from "../correlation/engine";
import { eventInsights, routeLabel } from "../correlation/engine";
import { renderAlertEmail } from "../email/template";
import { sendEmail, type SendResult } from "../email/transport";
import { getEvents } from "../events/aggregator";
import { HUBS, STATIC_ALTERNATIVES } from "../transit/hubs";
import { getAllWeather } from "../weather/open-meteo";
import { decideAlert } from "./dedup";

const log = createLogger("notifier");

export interface AlertUser {
  id: string;
  email: string;
  delayThresholdMin: number;
  cooldownMinutes: number;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  emailEnabled: boolean;
}

interface DispatchArgs {
  user: AlertUser;
  disruption: Pick<CorrelatedDisruption, "routeLabel" | "status" | "delayMin" | "insights" | "alternative" | "tracked"> & {
    plannedWhen: string | null;
    when: string | null;
    platform: string | null;
    direction: string;
  };
  reason: "NEW" | "ESCALATED" | "TEST";
}

/** Render, send and persist an alert email. */
async function dispatch({ user, disruption: d, reason }: DispatchArgs): Promise<SendResult & { logId: string }> {
  const email = renderAlertEmail({
    routeLabel: d.routeLabel,
    lineName: d.tracked.lineName,
    stopName: d.tracked.stopName,
    status: d.status,
    delayMin: d.delayMin,
    plannedTime: d.plannedWhen ? berlinHHMM(d.plannedWhen) : null,
    expectedTime: d.when ? berlinHHMM(d.when) : null,
    platform: d.platform,
    insights: d.insights,
    alternative: d.alternative,
    reason,
    dashboardUrl: `${env().APP_URL}/dashboard`,
    generatedAt: berlinHHMM(),
  });

  const result = await sendEmail({ to: user.email, ...email });
  const entry = await db.alertLog.create({
    data: {
      userId: user.id,
      lineName: d.tracked.lineName,
      stopName: d.tracked.stopName,
      direction: d.direction || null,
      status: d.status,
      delayMin: d.delayMin,
      reason,
      context: JSON.stringify({ insights: d.insights, alternative: d.alternative }),
      subject: email.subject,
      emailHtml: email.html,
      transport: result.transport,
      delivered: result.delivered,
      error: result.error ?? null,
      isTest: reason === "TEST",
    },
  });
  return { ...result, logId: entry.id };
}

/**
 * Apply the dedup policy for one (user, tracked line) and send if warranted.
 * `disruption === null` means the line is currently healthy → resolve state.
 */
export async function processLine(user: AlertUser, tracked: TrackedLineRef, disruption: CorrelatedDisruption | null, now = new Date()) {
  const e = env();
  const prior = await db.alertState.findUnique({ where: { userId_lineId: { userId: user.id, lineId: tracked.id } } });

  if (!disruption || (disruption.status === "DELAYED" && disruption.delayMin < user.delayThresholdMin)) {
    if (prior && prior.resolvedAt === null) {
      await db.alertState.update({ where: { id: prior.id }, data: { resolvedAt: now, lastSeenAt: now } });
      log.info("disruption resolved", { userId: user.id, line: tracked.lineName, stop: tracked.stopName });
    }
    return { action: "none" as const };
  }

  const decision = decideAlert({
    prior,
    current: { signature: disruption.signature, status: disruption.status, delayMin: disruption.delayMin },
    thresholdMin: user.delayThresholdMin,
    cooldownMinutes: user.cooldownMinutes,
    escalationDeltaMin: e.ESCALATION_DELTA_MIN,
    escalationBypassesCooldown: e.ESCALATION_BYPASSES_COOLDOWN,
    inQuietHours: isWithinQuietHours(user.quietHoursStart, user.quietHoursEnd, now),
    now,
  });

  if (!decision.send) {
    // Suppressed: record that we saw it, but do NOT touch signature/lastNotifiedAt,
    // so a pending NEW disruption is still sent once the cooldown/quiet hours end.
    if (prior) {
      await db.alertState.update({ where: { id: prior.id }, data: { lastSeenAt: now } });
    } else {
      await db.alertState.create({
        data: {
          userId: user.id,
          lineId: tracked.id,
          disruptionSignature: disruption.signature,
          lastStatus: disruption.status,
          lastDelayMin: disruption.delayMin,
          lastNotifiedAt: null,
          firstSeenAt: now,
          lastSeenAt: now,
        },
      });
    }
    log.info("alert suppressed", { userId: user.id, line: tracked.lineName, reason: decision.reason, detail: decision.detail, delayMin: disruption.delayMin });
    return { action: "suppressed" as const, reason: decision.reason };
  }

  if (!user.emailEnabled) {
    log.info("alert skipped – email disabled by user", { userId: user.id, line: tracked.lineName });
    return { action: "suppressed" as const, reason: "EMAIL_DISABLED" };
  }

  const result = await dispatch({
    user,
    reason: decision.reason,
    disruption: {
      ...disruption,
      plannedWhen: disruption.departure.plannedWhen,
      when: disruption.departure.when,
      platform: disruption.departure.platform ?? disruption.departure.plannedPlatform,
      direction: disruption.departure.direction,
    },
  });

  // Only advance the idempotency record if delivery succeeded – failed sends are retried next cycle.
  if (result.delivered) {
    await db.alertState.upsert({
      where: { userId_lineId: { userId: user.id, lineId: tracked.id } },
      create: {
        userId: user.id,
        lineId: tracked.id,
        disruptionSignature: disruption.signature,
        lastStatus: disruption.status,
        lastDelayMin: disruption.delayMin,
        lastNotifiedAt: now,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: {
        disruptionSignature: disruption.signature,
        lastStatus: disruption.status,
        lastDelayMin: disruption.delayMin,
        lastNotifiedAt: now,
        lastSeenAt: now,
        resolvedAt: null,
        ...(decision.reason === "NEW" ? { firstSeenAt: now } : {}),
      },
    });
  }
  log.info("alert sent", { userId: user.id, line: tracked.lineName, reason: decision.reason, delayMin: disruption.delayMin, delivered: result.delivered });
  return { action: "sent" as const, reason: decision.reason, delivered: result.delivered };
}

// ── Instant test ─────────────────────────────────────────────────────────────

const SCENARIOS: { cause: string; detail: string }[] = [
  { cause: "Signal failure between Wannsee and Griebnitzsee", detail: "Trains are running at reduced frequency; single-track operation in place." },
  { cause: "Switch malfunction at Ostkreuz", detail: "Technicians are on site; trains held at preceding stations." },
  { cause: "Emergency services operation near the tracks", detail: "Police operation at Friedrichstraße; temporary line closure." },
  { cause: "Vehicle defect on the line ahead", detail: "A defective train is being towed; follow-on trains delayed." },
];

const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

/**
 * Build a realistic simulated delay (using the user's first tracked line, live
 * weather & event context when available within 2.5s) and send it immediately.
 * Bypasses dedup/cooldown/quiet hours by design.
 */
export async function sendTestAlert(user: AlertUser) {
  const first = await db.trackedLine.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  const potsdam = HUBS[0]!;
  const tracked: TrackedLineRef = first
    ? { id: first.id, lineName: first.lineName, stopId: first.stopId, stopName: first.stopName, direction: first.direction }
    : { id: "test", lineName: "S7", stopId: potsdam.id, stopName: potsdam.name, direction: "Ahrensfelde" };
  const hub = HUBS.find((h) => h.id === tracked.stopId);
  const direction = tracked.direction || (tracked.lineName === "S7" ? "S Ahrensfelde Bhf (Berlin)" : "City centre");

  const delayMin = Math.max(user.delayThresholdMin, 12) + Math.floor(Math.random() * 9);
  const planned = new Date(Math.ceil((Date.now() + 8 * 60000) / 60000) * 60000);
  const expected = new Date(planned.getTime() + delayMin * 60000);
  const scenario = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)]!;

  const [weather, events] = await Promise.all([
    withTimeout(getAllWeather(), 2500, null),
    withTimeout(getEvents(), 2500, []),
  ]);

  const insights: Insight[] = [{ kind: "operator", severity: "high", message: `[Simulated] ${scenario.cause}`, detail: scenario.detail }];
  const region = hub?.region ?? "potsdam";
  const w = weather?.[region];
  if (w?.available) {
    insights.push(
      ...(w.anomalies.length
        ? w.anomalies.map((a) => ({ kind: "weather" as const, severity: a.severity, message: a.message, detail: a.transitImpact }))
        : [{ kind: "weather" as const, severity: "info" as const, message: `Live weather ${w.label}: ${w.description}, ${Math.round(w.temperatureC)} °C, gusts ${Math.round(w.gustKmh)} km/h`, detail: "No weather anomaly – weather is unlikely to be a factor." }]),
    );
  } else {
    insights.push({ kind: "weather", severity: "severe", message: "[Simulated] Severe thunderstorm warning in Potsdam area", detail: "Lightning strikes on signalling commonly cause S-Bahn suspensions." });
  }
  insights.push(...eventInsights(events, tracked.lineName, { stopName: tracked.stopName, lat: hub?.lat ?? null, lon: hub?.lon ?? null }).slice(0, 2));

  const result = await dispatch({
    user,
    reason: "TEST",
    disruption: {
      tracked,
      routeLabel: routeLabel(tracked.lineName, tracked.stopName, direction),
      status: "DELAYED",
      delayMin,
      insights,
      alternative: STATIC_ALTERNATIVES[tracked.lineName.toUpperCase()] ?? "Check parallel S-Bahn / RE services on the VBB journey planner.",
      plannedWhen: planned.toISOString(),
      when: expected.toISOString(),
      platform: "3",
      direction,
    },
  });
  log.info("test alert dispatched", { userId: user.id, transport: result.transport, delivered: result.delivered });
  return result;
}
