"use client";

import { useEffect, useState } from "react";
import type { OriginRow, PolicyRow } from "@/lib/types";
import { ModeBadge } from "./badges";
import { useLive } from "./LiveDataProvider";
import { CheckIcon } from "./icons";
import { Tooltip } from "./Tooltip";

export function PolicyEditor({
  origin,
  policy,
}: {
  origin: OriginRow;
  policy: PolicyRow | null;
}) {
  const { refresh } = useLive();
  const [auto, setAuto] = useState(policy?.auto_block_threshold ?? 0.9);
  const [alert, setAlert] = useState(policy?.alert_threshold ?? 0.6);
  const [mode, setMode] = useState<"shadow" | "enforce">(policy?.mode ?? "shadow");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setAuto(policy?.auto_block_threshold ?? 0.9);
    setAlert(policy?.alert_threshold ?? 0.6);
    setMode(policy?.mode ?? "shadow");
  }, [
    policy?.id,
    policy?.auto_block_threshold,
    policy?.alert_threshold,
    policy?.mode,
  ]);

  const dirty =
    Math.abs(auto - (policy?.auto_block_threshold ?? 0.9)) > 0.0001 ||
    Math.abs(alert - (policy?.alert_threshold ?? 0.6)) > 0.0001 ||
    mode !== (policy?.mode ?? "shadow");

  function changeAuto(value: number) {
    const next = Math.min(1, Math.max(0, value));
    setAuto(next);
    if (alert > next) setAlert(next);
    setSaved(false);
  }

  function changeAlert(value: number) {
    const next = Math.min(1, Math.max(0, value));
    setAlert(next);
    if (next > auto) setAuto(next);
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch(`/api/policies/${origin.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auto_block_threshold: auto,
          alert_threshold: alert,
          mode,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not save the policy.");
      }
      await refresh();
      setSaved(true);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save the policy.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card policy-card">
      <header className="policy-head">
        <div>
          <h3>{origin.origin_url}</h3>
          <p className="muted">
            <code>{origin.proxy_path}</code> · {origin.status} ·{" "}
            {policy ? <ModeBadge mode={policy.mode} /> : "No policy yet"}
          </p>
        </div>
        <span className={`status-pill ${mode}`}>{mode}</span>
      </header>

      <div className="policy-grid">
        <div className="policy-control">
          <div className="control-label">
            <div className="heading-with-tooltip">
              <label htmlFor={`auto-${origin.id}`}>Auto-block threshold</label>
              <Tooltip
                title="Containment Threshold"
                content="Requests scoring at or above this anomaly confidence trigger immediate automated mitigation (HTTP 403 block or challenge) in enforce mode."
                inline
              />
            </div>
            <span className="control-value">{auto.toFixed(2)}</span>
          </div>
          <input
            id={`auto-${origin.id}`}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={auto}
            onChange={(event) => changeAuto(Number(event.target.value))}
          />
        </div>

        <div className="policy-control">
          <div className="control-label">
            <div className="heading-with-tooltip">
              <label htmlFor={`alert-${origin.id}`}>Alert threshold</label>
              <Tooltip
                title="Telemetry Alert Threshold"
                content="Detections meeting or exceeding this confidence generate an incident alert and stream to the realtime compliance register."
                inline
              />
            </div>
            <span className="control-value">{alert.toFixed(2)}</span>
          </div>
          <input
            id={`alert-${origin.id}`}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={alert}
            onChange={(event) => changeAlert(Number(event.target.value))}
          />
        </div>
      </div>

      <div className="policy-scale" aria-hidden="true">
        <div className="scale-track">
          <span className="scale-zone" style={{ width: `${auto * 100}%` }} />
          <span
            className="scale-marker marker-alert"
            style={{ left: `${alert * 100}%` }}
          />
          <span
            className="scale-marker marker-block"
            style={{ left: `${auto * 100}%` }}
          />
        </div>
        <div className="scale-labels">
          <span>0.0</span>
          <span>alert {alert.toFixed(2)}</span>
          <span>auto-block {auto.toFixed(2)}</span>
          <span>1.0</span>
        </div>
      </div>

      <div className="mode-row">
        <div className="heading-with-tooltip">
          <span className="mode-label">Response mode</span>
          <Tooltip
            title="Policy Response Mode"
            content="Shadow mode monitors without blocking. Enforce mode actively intercepts malicious payloads."
            inline
          />
        </div>
        <div className="segmented" role="group" aria-label="Response mode">
          <button
            type="button"
            className={mode === "shadow" ? "is-active" : ""}
            onClick={() => {
              setMode("shadow");
              setSaved(false);
            }}
          >
            Shadow
          </button>
          <button
            type="button"
            className={mode === "enforce" ? "is-active is-enforce" : ""}
            onClick={() => {
              setMode("enforce");
              setSaved(false);
            }}
          >
            Enforce
          </button>
        </div>
      </div>

      <footer className="policy-foot">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => void save()}
          disabled={busy || !dirty}
        >
          {busy ? <span className="spinner" /> : <CheckIcon size={14} />}
          {busy ? "Saving" : dirty ? "Save policy" : "Saved"}
        </button>
        <code className="endpoint">
          PATCH /api/policies/{origin.id.slice(0, 8)}…
        </code>
        {saved && <span className="inline-success">Policy updated</span>}
      </footer>
      {error && (
        <div className="inline-alert" role="alert">
          {error}
        </div>
      )}
    </article>
  );
}
