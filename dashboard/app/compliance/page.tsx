"use client";

import { useLive } from "@/components/LiveDataProvider";
import { ExportButtons } from "@/components/ExportButtons";
import {
  ResolvedBadge,
  SeverityBadge,
} from "@/components/badges";
import { FileIcon } from "@/components/icons";
import { Tooltip } from "@/components/Tooltip";
import {
  actionLabel,
  categoryLabel,
  formatDateTime,
  formatRelative,
} from "@/lib/format";

function targetSummary(target: unknown): string {
  if (!target || typeof target !== "object") return "—";
  const record = target as Record<string, unknown>;
  if (typeof record.origin_url === "string") return record.origin_url;
  if (typeof record.origin === "string") return record.origin;
  if (typeof record.finding_id === "string") {
    return `finding ${record.finding_id.slice(0, 8)}…`;
  }
  if (typeof record.origin_id === "string") {
    return `origin ${record.origin_id.slice(0, 8)}…`;
  }
  return "audit entry";
}

export default function CompliancePage() {
  const { snapshot } = useLive();

  if (!snapshot) {
    return (
      <div className="stack">
        <div className="skeleton skeleton-panel" />
      </div>
    );
  }

  const { incidents6h, audit, stats, generated_at, origins } = snapshot;
  const windowStart = new Date(
    new Date(generated_at).getTime() - 6 * 60 * 60 * 1000,
  );
  const unresolved = incidents6h.filter((incident) => !incident.resolved).length;
  const affectedOrigins = new Set(
    incidents6h.map((incident) => incident.origin_url ?? "unknown"),
  ).size;
  const automatedActions = incidents6h.filter((incident) =>
    ["temp_block", "rate_limit", "challenge", "session_invalidate"].includes(
      incident.action_taken ?? "",
    ),
  ).length;

  return (
    <div className="stack">
      <section className="page-head">
        <div>
          <div className="eyebrow-row">
            <p className="eyebrow">Regulatory Compliance</p>
            <Tooltip
              title="CERT-In Statutory Directives"
              content="Section 70B of the Information Technology Act requires designated entities to report specified cyber security incidents to CERT-In within 6 hours."
            />
          </div>
          <h2>CERT-In Statutory Incident Reporting</h2>
          <p className="hero-sub">
            Automated compliance registers capturing rolling 6-hour security incidents, mitigation actions, and targeted origin metadata.
          </p>
        </div>
        <ExportButtons />
      </section>

      <section className="cert-window">
        <div className="cert-window-icon">
          <FileIcon size={22} />
        </div>
        <div className="cert-window-body">
          <div className="heading-with-tooltip">
            <span className="eyebrow">CERT-In 6-hour reporting window</span>
            <Tooltip
              title="Sliding Window Details"
              content="Calculated as (Current Timestamp − 6 Hours) to Current Timestamp. Point-in-time snapshot refreshed upon every export generation."
            />
          </div>
          <strong>
            {formatDateTime(windowStart.toISOString())} →{" "}
            {formatDateTime(generated_at)}
          </strong>
          <p>
            Dynamic rolling register reflecting all qualified security anomalies and mitigation responses.
          </p>
        </div>
        <div className="cert-count">
          <strong>{incidents6h.length}</strong>
          <span>incidents</span>
        </div>
      </section>

      <section className="stat-grid">
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-label">Incidents in window</span>
            <Tooltip
              title="Window Incident Count"
              content="Count of security anomalies detected within the preceding 6-hour statutory window."
            />
          </div>
          <strong>{incidents6h.length}</strong>
          <span className="stat-sub">rolling 6 hours</span>
        </div>
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-label">Automated actions</span>
            <Tooltip
              title="Containment Triggers"
              content="Interventions triggered automatically at the edge (temporary IP blocks, rate limits, cryptographic challenges, or session invalidations)."
            />
          </div>
          <strong>{automatedActions}</strong>
          <span className="stat-sub">block, throttle, challenge, session</span>
        </div>
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-label">Still open</span>
            <Tooltip
              title="Pending Verification"
              content="Incidents marked unresolved requiring security analyst confirmation or patch verification."
            />
          </div>
          <strong>{unresolved}</strong>
          <span className="stat-sub">needs analyst follow-up</span>
        </div>
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-label">Affected origins</span>
            <Tooltip
              title="Origin Impact Ratio"
              content="Unique protected application endpoints targeted within the active reporting window."
            />
          </div>
          <strong>{affectedOrigins}</strong>
          <span className="stat-sub">of {origins.length} connected</span>
        </div>
      </section>

      <section className="card">
        <div className="card-heading">
          <div>
            <div className="heading-with-tooltip">
              <p className="eyebrow">Last 6 hours</p>
              <Tooltip
                title="Audited Register"
                content="Compliant record format containing IST timestamps, origin hostname, threat severity, finding classification, automated action, and confidence score."
              />
            </div>
            <h2>Incident register</h2>
          </div>
          <span className="count-chip">{stats.incidents6h} records</span>
        </div>

        <div className="table-scroll">
          <table className="data-table compliance-table">
            <thead>
              <tr>
                <th>Timestamp (IST)</th>
                <th>Affected origin</th>
                <th>Severity</th>
                <th>Finding</th>
                <th>Action taken</th>
                <th>Confidence</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {incidents6h.map((incident) => (
                <tr key={incident.id}>
                  <td>
                    <time dateTime={incident.created_at}>
                      {formatDateTime(incident.created_at)}
                    </time>
                  </td>
                  <td>
                    <code>{incident.origin_url ?? "unknown"}</code>
                  </td>
                  <td>
                    <SeverityBadge severity={incident.severity} />
                  </td>
                  <td>
                    <div className="finding-title">{incident.finding_title}</div>
                    <div className="finding-meta">
                      {categoryLabel(incident.category)}
                    </div>
                  </td>
                  <td>{actionLabel(incident.action_taken)}</td>
                  <td>
                    {incident.confidence === null
                      ? "—"
                      : incident.confidence.toFixed(3)}
                  </td>
                  <td>
                    <ResolvedBadge resolved={incident.resolved} />
                  </td>
                </tr>
              ))}
              {incidents6h.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    No incidents recorded in the last 6 hours. Export packages will generate with zero incident records.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-heading">
          <div>
            <div className="heading-with-tooltip">
              <p className="eyebrow">Audit trail</p>
              <Tooltip
                title="Immutable Action Ledger"
                content="Cryptographically ordered audit entries logging both automated mitigation steps and operator manual overrides."
              />
            </div>
            <h2>Automated and manual actions</h2>
          </div>
          <span className="count-chip">{audit.length} entries</span>
        </div>
        <ol className="audit-list">
          {audit.slice(0, 20).map((entry) => (
            <li key={entry.id}>
              <span className="audit-dot" />
              <div>
                <div className="audit-top">
                  <strong>{entry.action}</strong>
                  <time
                    dateTime={entry.ts}
                    title={formatDateTime(entry.ts)}
                  >
                    {formatRelative(entry.ts)}
                  </time>
                </div>
                <p>
                  {entry.actor} · {targetSummary(entry.target)}
                </p>
              </div>
            </li>
          ))}
          {audit.length === 0 && (
            <li className="empty-state">No audit entries recorded yet.</li>
          )}
        </ol>
      </section>

      <section className="card note-card">
        <div className="note-card-header">
          <strong>Compliance Export Specifications</strong>
          <Tooltip
            title="Export Format Schemas"
            content="PDF generates official CERT-In incident notice headers and layout. CSV and JSON deliver structured flat and nested schemas for SIEM/SOAR ingestion."
          />
        </div>
        <p>
          Standardized output packages ready for submission to regulatory authorities or ingestion into enterprise SIEM pipelines. Includes ISO timestamps, normalized severity vectors, automated containment status, and origin host routes.
        </p>
      </section>
    </div>
  );
}
