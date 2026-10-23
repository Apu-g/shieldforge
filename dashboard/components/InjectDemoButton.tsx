"use client";

import { useState } from "react";
import { useLive } from "./LiveDataProvider";
import { PlusIcon } from "./icons";

export function InjectDemoButton() {
  const { refresh } = useLive();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function inject() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/demo/inject", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not inject a finding.");
      }
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not inject a finding.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inject-wrap">
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => void inject()}
        disabled={busy}
        title="Simulates the proxy + ML pipeline writing a new finding"
      >
        {busy ? <span className="spinner" /> : <PlusIcon size={14} />}
        {busy ? "Injecting" : "Inject test finding"}
      </button>
      {error && <span className="inline-error">{error}</span>}
    </div>
  );
}
