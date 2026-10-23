"use client";

import { useState } from "react";
import { useLive } from "./LiveDataProvider";

export function VerifyFixButton({
  findingId,
  status,
}: {
  findingId: string;
  status: string | null;
}) {
  const { refresh } = useLive();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "fixed_verified") {
    return <span className="badge badge-emerald" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '2px 8px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' }}>✓ Mitigated</span>;
  }

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/findings/${findingId}/verify`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not verify the fix.");
      }
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not verify the fix.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="verify-wrap">
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => void verify()}
        disabled={busy}
      >
        {busy ? (
          <>
            <span className="spinner" /> Re-checking
          </>
        ) : (
          "Verify fix"
        )}
      </button>
      {error && (
        <span className="inline-error" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}
