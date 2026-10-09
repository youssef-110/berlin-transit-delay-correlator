import "server-only";
import { db } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { analyzeLine, correlate, eventInsights, type Insight, type LineHealth } from "./correlation/engine";
import { activeTransport } from "./email/transport";
import { getEvents } from "./events/aggregator";
import type { TransitEvent } from "./events/types";
import { pollerStatus } from "./poller/poller";
import { getDepartures, type DepartureBoard } from "./transit/vbb";
import { getAllWeather, type Region, type WeatherResult } from "./weather/open-meteo";

const log = createLogger("status");

export interface LineStatusDTO {
  id: string;
  lineName: string;
  stopId: string;
  stopName: string;
  direction: string;
  health: LineHealth;
  worstDelayMin: number;
  routeLabel: string | null;
  departures: {
    tripId: string;
    direction: string;
    plannedWhen: string | null;
    when: string | null;
    delayMin: number | null;
    cancelled: boolean;
    platform: string | null;
  }[];
  insights: Insight[];
  alternative: string | null;
  error: string | null;
}

export interface AlertLogDTO {
  id: string;
  lineName: string;
  stopName: string;
  status: string;
  delayMin: number;
  reason: string;
  subject: string;
  transport: string;
  delivered: boolean;
  error: string | null;
  isTest: boolean;
  createdAt: string;
}

export interface DashboardDTO {
  generatedAt: string;
  settings: {
    email: string;
    delayThresholdMin: number;
    cooldownMinutes: number;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
    emailEnabled: boolean;
    cityAlertsEnabled: boolean;
  };
  lines: LineStatusDTO[];
  weather: Record<Region, WeatherResult>;
  events: TransitEvent[];
  alerts: AlertLogDTO[];
  system: {
    emailTransport: string;
    poller: ReturnType<typeof pollerStatus>;
  };
}

export async function buildDashboard(userId: string): Promise<DashboardDTO | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      trackedLines: { orderBy: { createdAt: "asc" } },
      alertLogs: { orderBy: { createdAt: "desc" }, take: 25, omit: { emailHtml: true, context: true } },
    },
  });
  if (!user) return null;

  const stopIds = [...new Set(user.trackedLines.map((t) => t.stopId))];
  const [boardEntries, weather, events] = await Promise.all([
    Promise.all(
      stopIds.map(async (id) => {
        try {
          return [id, await getDepartures(id)] as const;
        } catch (err) {
          log.warn("dashboard departures failed", { stopId: id, err: (err as Error).message });
          return [id, null] as const;
        }
      }),
    ),
    getAllWeather(),
    getEvents(),
  ]);
  const boards = new Map<string, DepartureBoard | null>(boardEntries);

  const lines: LineStatusDTO[] = user.trackedLines.map((t) => {
    const board = boards.get(t.stopId) ?? null;
    const analysis = analyzeLine(t, board, user.delayThresholdMin);
    const disruption = correlate(analysis, board, weather, events);
    const ref = analysis.departures[0];
    const contextual = disruption?.insights ?? (ref ? eventInsights(events, t.lineName, ref) : []);
    return {
      id: t.id,
      lineName: t.lineName,
      stopId: t.stopId,
      stopName: t.stopName,
      direction: t.direction,
      health: analysis.health,
      worstDelayMin: analysis.worstDelayMin,
      routeLabel: disruption?.routeLabel ?? null,
      departures: analysis.departures.slice(0, 5).map((d) => ({
        tripId: d.tripId,
        direction: d.direction,
        plannedWhen: d.plannedWhen,
        when: d.when,
        delayMin: d.delayMin,
        cancelled: d.cancelled,
        platform: d.platform ?? d.plannedPlatform,
      })),
      insights: contextual,
      alternative: disruption?.alternative ?? null,
      error: board ? null : "Live data temporarily unavailable",
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    settings: {
      email: user.email,
      delayThresholdMin: user.delayThresholdMin,
      cooldownMinutes: user.cooldownMinutes,
      quietHoursStart: user.quietHoursStart,
      quietHoursEnd: user.quietHoursEnd,
      emailEnabled: user.emailEnabled,
      cityAlertsEnabled: user.cityAlertsEnabled,
    },
    lines,
    weather,
    events: events.filter((e) => Date.parse(e.endsAt) > Date.now() - 60 * 60000).slice(0, 8),
    alerts: user.alertLogs.map((a) => ({
      id: a.id,
      lineName: a.lineName,
      stopName: a.stopName,
      status: a.status,
      delayMin: a.delayMin,
      reason: a.reason,
      subject: a.subject,
      transport: a.transport,
      delivered: a.delivered,
      error: a.error,
      isTest: a.isTest,
      createdAt: a.createdAt.toISOString(),
    })),
    system: { emailTransport: activeTransport(), poller: pollerStatus() },
  };
}
