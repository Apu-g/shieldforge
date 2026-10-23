import {
  buildDetectionPoints,
  buildRiskTrend,
  computeStats,
  incidentsWithinHours,
} from "../metrics";
import type {
  AuditView,
  FindingView,
  IncidentView,
  OriginRow,
  PolicyRow,
  Snapshot,
  StoreMode,
  TrainingEventRow,
  TrainingUserView,
} from "../types";

export interface AssembleInput {
  mode: StoreMode;
  revision: number;
  tenantName: string;
  origins: OriginRow[];
  policies: PolicyRow[];
  findings: FindingView[];
  incidents: IncidentView[];
  trainingUsers: Array<Pick<TrainingUserView, "id" | "name" | "risk_score">>;
  trainingEvents: TrainingEventRow[];
  audit: AuditView[];
  proxyBaseUrl?: string | null;
  now?: Date;
}

export function assembleSnapshot(input: AssembleInput): Snapshot {
  const now = input.now ?? new Date();

  const findings = [...input.findings].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const incidents = [...input.incidents].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const origins = [...input.origins].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const detection = buildDetectionPoints(findings);
  const incidents6h = incidentsWithinHours(incidents, 6, now);

  const eventsByUser = new Map<string, TrainingEventRow[]>();
  for (const event of input.trainingEvents) {
    if (!event.user_id) continue;
    const list = eventsByUser.get(event.user_id) ?? [];
    list.push(event);
    eventsByUser.set(event.user_id, list);
  }

  const training: TrainingUserView[] = [...input.trainingUsers]
    .map((user) => {
      const events = eventsByUser.get(user.id) ?? [];
      const ordered = [...events].sort(
        (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
      );
      return {
        id: user.id,
        name: user.name,
        risk_score: user.risk_score,
        trend: buildRiskTrend(events),
        event_count: events.length,
        last_event_at: ordered.at(-1)?.ts ?? null,
      };
    })
    .sort((a, b) => b.risk_score - a.risk_score || a.name.localeCompare(b.name));

  return {
    mode: input.mode,
    revision: input.revision,
    generated_at: now.toISOString(),
    tenant_name: input.tenantName,
    origins,
    policies: input.policies,
    findings,
    incidents,
    incidents6h,
    detection,
    stats: computeStats({ origins, findings, incidents6h, detection }),
    training,
    audit: [...input.audit].sort(
      (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime(),
    ),
    proxy_base_url: input.proxyBaseUrl ?? null,
  };
}
