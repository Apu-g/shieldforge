import type { FindingStatus, PolicyMode } from "@/lib/types";

export function SeverityBadge({ severity }: { severity: string | null }) {
  const value = (severity ?? "unknown").toLowerCase();
  return (
    <span className={`badge badge-sev badge-sev-${value}`}>
      <span className="badge-dot" />
      {value}
    </span>
  );
}

export function StatusBadge({ status }: { status: string | null }) {
  const value = (status ?? "open") as FindingStatus | string;
  const label =
    value === "fixed_verified"
      ? "Fixed & verified"
      : value === "actioned"
        ? "Actioned"
        : value === "open"
          ? "Open"
          : value;
  return (
    <span className={`badge badge-status badge-status-${value}`}>{label}</span>
  );
}

export function ModeBadge({ mode }: { mode: PolicyMode | string | null }) {
  const value = mode === "enforce" ? "enforce" : "shadow";
  return (
    <span className={`badge badge-mode badge-mode-${value}`}>
      {value === "enforce" ? "Enforce" : "Shadow"}
    </span>
  );
}

export function ResolvedBadge({ resolved }: { resolved: boolean }) {
  return (
    <span className={`badge ${resolved ? "badge-resolved" : "badge-unresolved"}`}>
      {resolved ? "Resolved" : "Open"}
    </span>
  );
}

export function LiveDot({ label = "Live" }: { label?: string }) {
  return (
    <span className="live-dot-wrap">
      <span className="live-dot" />
      {label}
    </span>
  );
}
