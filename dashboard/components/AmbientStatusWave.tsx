"use client";

import { useLive } from "./LiveDataProvider";

interface AmbientStatusWaveProps {
  forceStatus?: "health" | "anomaly" | null;
}

export function AmbientStatusWave({ forceStatus }: AmbientStatusWaveProps) {
  const { effectiveStatus, setSimulatedStatus, attackCount, snapshot } = useLive();

  const currentStatus = forceStatus ?? effectiveStatus;
  const criticalCount =
    snapshot?.findings.filter((f) => f.severity === "critical" && f.status === "open").length ?? 0;

  return (
    <>
      {/* Liquid Ambient Wave Background Container */}
      <div
        className={`ambient-wave-canvas ${currentStatus === "anomaly" ? "is-anomaly" : "is-healthy"}`}
        aria-hidden="true"
      >
        <div className="wave-orb wave-orb-1" />
        <div className="wave-orb wave-orb-2" />
        <div className="wave-orb wave-orb-3" />
        <div className="wave-orb wave-orb-4" />
        <div className="wave-mesh-grid" />
      </div>

      {/* Subtle Health / Anomaly Status Interactive Pill on bottom-right */}
      <div className="ambient-status-hud" role="status" aria-live="polite">
        <button
          type="button"
          className={`status-hud-toggle ${currentStatus === "anomaly" ? "hud-anomaly" : "hud-healthy"}`}
          onClick={() =>
            setSimulatedStatus((prev) => (currentStatus === "anomaly" ? "health" : "anomaly"))
          }
          title="Click to toggle between Nominal Health (Green) and Anomaly Alert (Red) ambient waves & globe attack vector animation"
        >
          <span className="hud-beacon-dot" />
          <span className="hud-label">
            {currentStatus === "anomaly"
              ? `Threat Anomaly Alert (${attackCount > 0 ? attackCount : criticalCount} Attacks Active)`
              : "System Health Nominal"}
          </span>
          <span className="hud-mode-switch">
            {currentStatus === "anomaly" ? "Switch Green" : "Simulate Red"}
          </span>
        </button>
      </div>
    </>
  );
}
