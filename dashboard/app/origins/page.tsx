"use client";

import Link from "next/link";
import { OriginForm } from "@/components/OriginForm";
import { useLive } from "@/components/LiveDataProvider";
import { ModeBadge } from "@/components/badges";
import { GlobeIcon } from "@/components/icons";
import { Tooltip } from "@/components/Tooltip";
import { formatRelative } from "@/lib/format";

export default function OriginsPage() {
  const { snapshot } = useLive();

  if (!snapshot) {
    return (
      <div className="split-grid origins-layout">
        <div className="skeleton skeleton-panel" />
        <div className="skeleton skeleton-panel" />
      </div>
    );
  }

  const { origins, policies, findings } = snapshot;

  return (
    <div className="stack">
      <section className="page-head">
        <div>
          <div className="eyebrow-row">
            <p className="eyebrow">Origin Management</p>
            <Tooltip
              title="Zero-Touch Ingress Routing"
              content="Upstream web applications are protected through transparent reverse-proxy listeners with zero DNS downtime or certificate re-issuance."
            />
          </div>
          <h2>Connect and protect origin domains</h2>
          <p className="hero-sub">
            Deploy edge inspection across upstream applications with automatic proxy path routing and default containment policies.
          </p>
        </div>
        <div className="head-badges">
          <span className="count-chip">{origins.length} origins</span>
          <span className="count-chip">{policies.length} policies</span>
        </div>
      </section>

      <section className="split-grid origins-layout">
        <OriginForm />

        <div className="card origin-list">
          <div className="card-heading">
            <div>
              <div className="heading-with-tooltip">
                <p className="eyebrow">Workspace</p>
                <Tooltip
                  title="Connected Fleet"
                  content="Origins currently receiving reverse-proxy traffic with active threat telemetry inspection."
                />
              </div>
              <h2>Connected origins</h2>
            </div>
            <span className="card-icon">
              <GlobeIcon size={18} />
            </span>
          </div>

          <div className="origin-items">
            {origins.map((origin) => {
              const policy = policies.find((p) => p.origin_id === origin.id);
              const findingCount = findings.filter(
                (finding) => finding.origin_id === origin.id,
              ).length;
              return (
                <article className="origin-item" key={origin.id}>
                  <span className="origin-glyph">
                    <GlobeIcon size={18} />
                  </span>
                  <div className="origin-body">
                    <div className="origin-top">
                      <h3>{origin.origin_url}</h3>
                      <span className={`status-pill ${origin.status}`}>
                        {origin.status}
                      </span>
                    </div>
                    <div className="origin-meta">
                      <code>{origin.proxy_path}</code>
                      <span>{findingCount} findings</span>
                      <span>added {formatRelative(origin.created_at)}</span>
                    </div>
                    <div className="origin-policy">
                      <ModeBadge mode={policy?.mode ?? null} />
                      <span>
                        auto-block {(policy?.auto_block_threshold ?? 0.9).toFixed(2)}
                      </span>
                      <span>
                        alert {(policy?.alert_threshold ?? 0.6).toFixed(2)}
                      </span>
                      <Link href="/policies" className="text-link">
                        Edit policy
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
            {origins.length === 0 && (
              <p className="empty-state">
                No origins connected yet. Enter an origin host URL above to start protection.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="card how-card">
        <div className="card-heading">
          <div>
            <div className="heading-with-tooltip">
              <p className="eyebrow">Architecture</p>
              <Tooltip
                title="Proxy Resolution Workflow"
                content="Edge proxies dynamically resolve routing rules and threshold configurations without requiring proxy service restarts or redeployments."
              />
            </div>
            <h2>Ingress Routing & Policy Enforcement</h2>
          </div>
        </div>
        <ol className="step-list">
          <li>
            <span>1</span>
            <div>
              <div className="step-title-row">
                <strong>Origin Registration</strong>
                <Tooltip
                  title="Route Sanitization"
                  content="Validates host domain syntax and maps a deterministic prefix (e.g. /t/app-name) for incoming edge reverse proxy requests."
                />
              </div>
              <p>
                Derives deterministic proxy path mapping for edge traffic forwarding.
              </p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <div className="step-title-row">
                <strong>Policy Initialization</strong>
                <Tooltip
                  title="Default Safeguards"
                  content="Initializes in non-disruptive shadow mode with recommended baseline thresholds (0.90 block, 0.60 alert) to baseline legitimate traffic."
                />
              </div>
              <p>
                Generates default shadow inspection rules with baseline anomaly thresholds.
              </p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <div className="step-title-row">
                <strong>Edge Synchronization</strong>
                <Tooltip
                  title="Dynamic Ingress Sync"
                  content="The edge proxy engine monitors policy tables and adapts routing behavior in sub-millisecond intervals."
                />
              </div>
              <p>
                Edge proxy instances resolve route destinations and policy actions instantaneously.
              </p>
            </div>
          </li>
        </ol>
      </section>
    </div>
  );
}
