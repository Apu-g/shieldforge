"use client";

import { PolicyEditor } from "@/components/PolicyEditor";
import { useLive } from "@/components/LiveDataProvider";
import { SlidersIcon } from "@/components/icons";
import { Tooltip } from "@/components/Tooltip";

export default function PoliciesPage() {
  const { snapshot } = useLive();

  if (!snapshot) {
    return (
      <div className="stack">
        <div className="skeleton skeleton-panel" />
        <div className="skeleton skeleton-panel" />
      </div>
    );
  }

  const { origins, policies } = snapshot;
  const enforceCount = policies.filter((policy) => policy.mode === "enforce").length;

  return (
    <div className="stack">
      <section className="page-head">
        <div>
          <div className="eyebrow-row">
            <p className="eyebrow">Control Plane</p>
            <Tooltip
              title="Autonomous Policy Enforcement"
              content="Policies specify real-time threat response actions executed at the reverse proxy layer when classification confidence exceeds defined thresholds."
            />
          </div>
          <h2>Response Policies & Containment Rules</h2>
          <p className="hero-sub">
            Configure per-origin confidence thresholds and mitigation modes. Changes propagate to edge proxy nodes with zero restart downtime.
          </p>
        </div>
        <div className="head-badges">
          <span className="count-chip">{policies.length} policies</span>
          <span className="count-chip">{enforceCount} enforcing</span>
        </div>
      </section>

      <section className="info-strip">
        <span className="info-icon">
          <SlidersIcon size={18} />
        </span>
        <div>
          <div className="heading-with-tooltip">
            <strong>Operational Modes: Shadow vs Enforce</strong>
            <Tooltip
              title="Execution Semantics"
              content="Shadow mode is ideal for baselining and false-positive evaluation. Enforce mode actively intercepts malicious traffic with HTTP 403 or challenge responses."
            />
          </div>
          <p>
            <strong>Shadow mode</strong> evaluates traffic and logs telemetry without altering client responses.{" "}
            <strong>Enforce mode</strong> empowers edge proxies to block, rate-limit, or challenge requests when anomaly confidence crosses thresholds.
          </p>
        </div>
      </section>

      <section className="policy-list">
        {origins.map((origin) => (
          <PolicyEditor
            key={origin.id}
            origin={origin}
            policy={policies.find((policy) => policy.origin_id === origin.id) ?? null}
          />
        ))}
        {origins.length === 0 && (
          <div className="card empty-state">
            No origins configured. Connect an origin first to generate its response policy.
          </div>
        )}
      </section>
    </div>
  );
}
