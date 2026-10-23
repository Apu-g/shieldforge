const IST = "Asia/Kolkata";

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: IST,
  }).format(date)} IST`;
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: IST,
  }).format(date);
}

export function formatRelative(
  value: string | null | undefined,
  now: number = Date.now(),
): string {
  if (!value) return "—";
  let ms = new Date(value).getTime();
  if (Number.isNaN(ms)) return "—";

  // If timestamp was stored with IST local time as UTC (+5.5h offset)
  if (ms - now > 5 * 3600 * 1000 && ms - now < 6 * 3600 * 1000) {
    ms -= 5.5 * 3600 * 1000;
  }

  const rawDiff = Math.round((now - ms) / 1000);
  if (rawDiff < 0) {
    // If within a few seconds of clock drift
    return "just now";
  }
  if (rawDiff < 10) return "just now";
  if (rawDiff < 60) return `${rawDiff}s ago`;
  const minutes = Math.floor(rawDiff / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return "n/a";
  }
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds - minutes * 60);
  if (minutes < 60) {
    return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return new Intl.NumberFormat("en-IN").format(value);
}

export function categoryLabel(category: string | null | undefined): string {
  const key = (category ?? "unknown").toLowerCase();
  const labels: Record<string, string> = {
    xss: "XSS",
    sqli: "SQL injection",
    weak_cookie: "Weak cookie",
    php2shell: "PHP-to-shell",
    session_replay: "Session replay",
    credential_stuffing: "Credential stuffing",
    rate_limit: "Rate limiting",
    unknown: "Unknown",
  };
  return labels[key] ?? key.replace(/_/g, " ");
}

export function actionLabel(action: string | null | undefined): string {
  const key = action ?? "log";
  const labels: Record<string, string> = {
    log: "Logged",
    alert: "Alert",
    rate_limit: "Rate limited",
    challenge: "Challenged",
    temp_block: "Temporary block",
    session_invalidate: "Session invalidated",
  };
  return labels[key] ?? key.replace(/_/g, " ");
}

export function modeLabel(mode: string | null | undefined): string {
  return mode === "enforce" ? "Enforce" : "Shadow";
}

export function riskLabel(score: number): string {
  if (score >= 70) return "High risk";
  if (score >= 40) return "Elevated";
  if (score >= 20) return "Watch";
  return "Low risk";
}
