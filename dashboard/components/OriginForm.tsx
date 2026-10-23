"use client";

import { useState } from "react";
import { normalizeOrigin } from "@/lib/origins";
import type { CreateOriginResult } from "@/lib/types";
import { useLive } from "./LiveDataProvider";
import { GlobeIcon, PlusIcon } from "./icons";
import { Tooltip } from "./Tooltip";

export function OriginForm() {
  const { snapshot, refresh } = useLive();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateOriginResult | null>(null);

  let preview: { originUrl: string; proxyPath: string } | null = null;
  if (url.trim()) {
    try {
      preview = normalizeOrigin(url);
    } catch {
      preview = null;
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const response = await fetch("/api/origins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin_url: url }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not connect this origin.");
      }
      setCreated(payload as CreateOriginResult);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not connect this origin.",
      );
    } finally {
      setBusy(false);
    }
  }

  const fullProxyUrl =
    created && snapshot?.proxy_base_url
      ? `${snapshot.proxy_base_url.replace(/\/$/, "")}${created.origin.proxy_path}`
      : null;

  return (
    <form className="card form-card" onSubmit={submit}>
      <div className="card-heading">
        <div>
          <div className="heading-with-tooltip">
            <p className="eyebrow">Connect Origin</p>
            <Tooltip
              title="Origin Onboarding"
              content="Registers upstream target and binds a dedicated proxy listener. Default shadow policies are automatically provisioned."
            />
          </div>
          <h2>Add protected origin</h2>
        </div>
        <span className="card-icon">
          <GlobeIcon size={18} />
        </span>
      </div>

      <p className="muted">
        Enter a deployed origin host URL. The system will initialize reverse-proxy routing and attach default threat inspection policies.
      </p>

      <div className="field">
        <div className="field-label-row">
          <label htmlFor="origin-url">Origin Host URL</label>
          <Tooltip
            title="Host Requirements"
            content="Specify the full domain (e.g. https://example.vercel.app). Must be a valid HTTP/S endpoint accessible from the edge proxy."
            inline
          />
        </div>
        <div className="input-row">
          <input
            id="origin-url"
            name="origin_url"
            type="text"
            inputMode="url"
            autoComplete="url"
            placeholder="https://app-origin.vercel.app"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            spellCheck={false}
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setUrl("https://victim-shop.vercel.app")}
          >
            Sample
          </button>
        </div>
      </div>

      <div className="preview-row">
        <span className="preview-label">
          Assigned Proxy Route
          <Tooltip
            title="Edge Route Mapping"
            content="The derived deterministic path under which the proxy engine will accept incoming requests for this origin."
            inline
          />
        </span>
        <code>{preview ? preview.proxyPath : "—"}</code>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? <span className="spinner" /> : <PlusIcon size={15} />}
          {busy ? "Connecting..." : "Register Origin"}
        </button>
      </div>

      {error && (
        <div className="inline-alert" role="alert">
          {error}
        </div>
      )}

      {created && (
        <div className="success-panel" role="status">
          <strong>Origin successfully connected</strong>
          <p>
            <code>{created.origin.origin_url}</code> mapped to{" "}
            <code>{created.origin.proxy_path}</code>. Initialized policy:{" "}
            {created.policy.mode} mode, block threshold{" "}
            {created.policy.auto_block_threshold.toFixed(2)}, alert threshold{" "}
            {created.policy.alert_threshold.toFixed(2)}.
          </p>
          {fullProxyUrl && (
            <p>
              Proxy entrypoint: <code>{fullProxyUrl}</code>
            </p>
          )}
        </div>
      )}
    </form>
  );
}
