import { formatDateTime } from "./format";
import { incidentsWithinHours } from "./metrics";
import type { CertInRow, IncidentView } from "./types";

export const CERT_IN_WINDOW_HOURS = 6;

export function certInWindow(now: Date = new Date()): {
  start: Date;
  end: Date;
} {
  return {
    start: new Date(now.getTime() - CERT_IN_WINDOW_HOURS * 60 * 60 * 1000),
    end: now,
  };
}

export function selectCertInIncidents(
  incidents: IncidentView[],
  now: Date = new Date(),
): IncidentView[] {
  return incidentsWithinHours(incidents, CERT_IN_WINDOW_HOURS, now).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export function buildCertInRows(incidents: IncidentView[]): CertInRow[] {
  return selectCertInIncidents(incidents).map((incident) => ({
    timestamp: formatDateTime(incident.created_at),
    origin: incident.origin_url ?? "Unknown origin",
    severity: (incident.severity ?? "unknown").toUpperCase(),
    category: incident.category ?? "unknown",
    finding: incident.finding_title ?? incident.finding_id ?? "Unknown finding",
    action: incident.action_taken ?? "log",
    confidence:
      incident.confidence === null || incident.confidence === undefined
        ? "n/a"
        : incident.confidence.toFixed(3),
    resolved: incident.resolved ? "yes" : "no",
  }));
}

function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function certInToCsv(rows: CertInRow[]): string {
  const header = [
    "Timestamp (IST)",
    "Affected origin",
    "Severity",
    "Category",
    "Finding",
    "Action taken",
    "Confidence",
    "Resolved",
  ];
  const lines = rows.map((row) =>
    [
      row.timestamp,
      row.origin,
      row.severity,
      row.category,
      row.finding,
      row.action,
      row.confidence,
      row.resolved,
    ]
      .map(csvCell)
      .join(","),
  );
  return `\uFEFF${[header.join(","), ...lines].join("\r\n")}\r\n`;
}

export interface CertInExportMeta {
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  tenant: string;
  originFilter?: string;
}

export function certInToJson(
  rows: CertInRow[],
  meta: CertInExportMeta,
): string {
  return JSON.stringify(
    {
      report: "CERT-In 6-hour incident report",
      requirement:
        "CERT-In Directions (April 2022) require reporting specified cyber security incidents to CERT-In within 6 hours of noticing them.",
      generated_at: meta.generatedAt,
      window_hours: CERT_IN_WINDOW_HOURS,
      window_start: meta.windowStart,
      window_end: meta.windowEnd,
      tenant: meta.tenant,
      origin_filter: meta.originFilter ?? null,
      incident_count: rows.length,
      incidents: rows.map((row) => ({
        timestamp_ist: row.timestamp,
        affected_origin: row.origin,
        severity: row.severity,
        category: row.category,
        finding: row.finding,
        action_taken: row.action,
        confidence: row.confidence,
        resolved: row.resolved,
      })),
    },
    null,
    2,
  );
}

export function certInFilename(format: string, now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `shieldforge-certin-6h-${stamp}.${format}`;
}
