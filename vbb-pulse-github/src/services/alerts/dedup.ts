/**
 * Pure alert-deduplication policy (no I/O → trivially unit-testable).
 *
 * Send an email only if ALL of:
 *   1. delay ≥ user threshold (cancellations always qualify)
 *   2. disruption is NEW, or has ESCALATED (delay grew > Δ min, or became CANCELLED)
 *   3. cooldown for this line has elapsed (optionally bypassed by escalations)
 * …and we're not inside the user's quiet hours.
 */
export type AlertStatus = "DELAYED" | "CANCELLED";

export interface PriorAlertState {
  disruptionSignature: string;
  lastStatus: string;
  /** Delay at the time of the last notification */
  lastDelayMin: number;
  lastNotifiedAt: Date | null;
  resolvedAt: Date | null;
}

export interface DecisionInput {
  prior: PriorAlertState | null;
  current: { signature: string; status: AlertStatus; delayMin: number };
  thresholdMin: number;
  cooldownMinutes: number;
  escalationDeltaMin: number;
  escalationBypassesCooldown: boolean;
  inQuietHours: boolean;
  now: Date;
}

export type Decision =
  | { send: true; reason: "NEW" | "ESCALATED" }
  | { send: false; reason: "BELOW_THRESHOLD" | "DUPLICATE" | "COOLDOWN" | "QUIET_HOURS"; detail?: string };

export function decideAlert(i: DecisionInput): Decision {
  const { prior, current } = i;

  // (1) Threshold
  if (current.status === "DELAYED" && current.delayMin < i.thresholdMin) {
    return { send: false, reason: "BELOW_THRESHOLD" };
  }

  // (2) New vs. escalated vs. duplicate
  const priorActive = prior !== null && prior.resolvedAt === null && prior.lastNotifiedAt !== null;
  const escalated =
    priorActive &&
    ((current.status === "CANCELLED" && prior!.lastStatus !== "CANCELLED") ||
      current.delayMin - prior!.lastDelayMin > i.escalationDeltaMin);
  const isNew = !priorActive || (!escalated && prior!.disruptionSignature !== current.signature);

  if (!isNew && !escalated) {
    return { send: false, reason: "DUPLICATE", detail: `already notified at +${prior!.lastDelayMin} min` };
  }

  // (3) Cooldown per line
  if (prior?.lastNotifiedAt) {
    const elapsedMin = (i.now.getTime() - prior.lastNotifiedAt.getTime()) / 60000;
    const bypass = escalated && i.escalationBypassesCooldown;
    if (elapsedMin < i.cooldownMinutes && !bypass) {
      return { send: false, reason: "COOLDOWN", detail: `${Math.ceil(i.cooldownMinutes - elapsedMin)} min remaining` };
    }
  }

  if (i.inQuietHours) return { send: false, reason: "QUIET_HOURS" };

  return { send: true, reason: escalated ? "ESCALATED" : "NEW" };
}
