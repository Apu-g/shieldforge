import type {
  DashboardStats,
  DetectionPoint,
  FindingView,
  IncidentView,
  OriginRow,
  TrainingEventRow,
} from "./types";

/** Hardcoded "manual security review" baseline used for the 50%-improvement proof slide. */
export const MANUAL_REVIEW_BASELINE_SECONDS = 15 * 60;

export function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function detectionSeconds(
  eventTimestamp: string | null | undefined,
  findingTimestamp: string,
): number | null {
  if (!eventTimestamp) return null;
  const eventMs = new Date(eventTimestamp).getTime();
  const findingMs = new Date(findingTimestamp).getTime();
  if (!Number.isFinite(eventMs) || !Number.isFinite(findingMs)) return null;
  const seconds = (findingMs - eventMs) / 1000;
  return seconds >= 0 ? round(seconds, 2) : null;
}

export function median(values: number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

export function buildDetectionPoints(findings: FindingView[]): DetectionPoint[] {
  return findings
    .filter(
      (finding) =>
        finding.detection_seconds !== null && finding.detection_seconds >= 0,
    )
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
    .map((finding, index) => ({
      id: finding.id,
      label: `#${index + 1}`,
      category: finding.category ?? "unknown",
      seconds: Math.max(finding.detection_seconds ?? 0, 0.1),
      created_at: finding.created_at,
    }));
}

export function computeStats(params: {
  origins: OriginRow[];
  findings: FindingView[];
  incidents6h: IncidentView[];
  detection: DetectionPoint[];
}): DashboardStats {
  const { origins, findings, incidents6h, detection } = params;
  const latencies = detection.map((point) => point.seconds);
  const medianLatency = median(latencies);
  const improvement =
    medianLatency === null
      ? null
      : round(
          ((MANUAL_REVIEW_BASELINE_SECONDS - medianLatency) /
            MANUAL_REVIEW_BASELINE_SECONDS) *
            100,
          1,
        );

  return {
    activeOrigins: origins.filter((origin) => origin.status === "active").length,
    openFindings: findings.filter((finding) => finding.status === "open").length,
    actionedFindings: findings.filter((finding) => finding.status === "actioned")
      .length,
    fixedVerified: findings.filter(
      (finding) => finding.status === "fixed_verified",
    ).length,
    incidents6h: incidents6h.length,
    medianDetectionSeconds: medianLatency === null ? null : round(medianLatency, 2),
    baselineSeconds: MANUAL_REVIEW_BASELINE_SECONDS,
    improvementPct: improvement,
  };
}

export function incidentsWithinHours(
  incidents: IncidentView[],
  hours: number,
  now: Date = new Date(),
): IncidentView[] {
  const cutoff = now.getTime() - hours * 60 * 60 * 1000;
  return incidents.filter(
    (incident) => new Date(incident.created_at).getTime() >= cutoff,
  );
}

/**
 * Training "risk trend" derived from Part 4's event stream.
 * A click raises risk, completing the assigned lesson lowers it. The array is
 * the cumulative risk path used by the sparkline (one point per event).
 */
export function buildRiskTrend(events: TrainingEventRow[]): number[] {
  const weights: Record<string, number> = {
    phishing_sent: 1,
    phishing_clicked: 18,
    lesson_assigned: 0,
    lesson_completed: -12,
  };

  const ordered = [...events].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
  );

  let score = 0;
  const trend: number[] = [0];
  for (const event of ordered) {
    const weight = weights[event.event_type ?? ""] ?? 0;
    score = Math.min(100, Math.max(0, score + weight));
    trend.push(score);
  }
  return trend;
}
