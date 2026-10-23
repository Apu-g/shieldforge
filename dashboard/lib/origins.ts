import { ValidationError } from "./errors";
import { round } from "./metrics";
import type { PolicyMode } from "./types";

export interface NormalizedOrigin {
  originUrl: string;
  host: string;
  proxyPath: string;
}

const VERCEL_HOST =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.vercel\.app$/i;

/**
 * Onboarding is intentionally DNS-free: we only accept a deployed Vercel URL
 * and derive the proxy route from its hostname.
 */
export function normalizeOrigin(
  raw: string,
  strictVercel = false,
): NormalizedOrigin {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    throw new ValidationError("Paste a website URL to connect an origin.");
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new ValidationError(
      "That is not a valid URL. Try https://aisummit.ieeebangalore.org or https://victim-shop.vercel.app.",
    );
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new ValidationError("Origin must use http or https.");
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  const isVercel = VERCEL_HOST.test(host);

  if (strictVercel && !isVercel) {
    throw new ValidationError(
      "Origin must be a *.vercel.app URL, for example https://victim-shop.vercel.app.",
    );
  }

  if (!/^[a-z0-9.-]+$/.test(host)) {
    throw new ValidationError("Invalid domain name.");
  }

  const slug = (
    isVercel
      ? host.slice(0, -".vercel.app".length)
      : host.split(".")[0] || host
  )
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  if (!slug) {
    throw new ValidationError("Could not derive a proxy path from that URL.");
  }

  return {
    originUrl: `${parsed.protocol}//${host}${parsed.port ? `:${parsed.port}` : ""}`,
    host,
    proxyPath: `/t/${slug}`,
  };
}

export function normalizeVercelOrigin(raw: string): NormalizedOrigin {
  return normalizeOrigin(raw, true);
}


export interface PolicyPatch {
  auto_block_threshold: number;
  alert_threshold: number;
  mode: PolicyMode;
}

function readNumber(
  value: unknown,
  fallback: number,
  field: string,
): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ValidationError(`${field} must be a number between 0 and 1.`);
  }
  if (parsed < 0 || parsed > 1) {
    throw new ValidationError(`${field} must be between 0 and 1.`);
  }
  return parsed;
}

export function validatePolicyPatch(
  body: unknown,
  current?: Partial<PolicyPatch>,
): PolicyPatch {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ValidationError("Expected a JSON object.");
  }

  const input = body as Record<string, unknown>;
  const auto = readNumber(
    input.auto_block_threshold,
    current?.auto_block_threshold ?? 0.9,
    "auto_block_threshold",
  );
  const alert = readNumber(
    input.alert_threshold,
    current?.alert_threshold ?? 0.6,
    "alert_threshold",
  );

  if (alert > auto) {
    throw new ValidationError(
      "alert_threshold cannot be higher than auto_block_threshold.",
    );
  }

  const rawMode = input.mode ?? current?.mode ?? "shadow";
  if (rawMode !== "shadow" && rawMode !== "enforce") {
    throw new ValidationError("mode must be either shadow or enforce.");
  }

  return {
    auto_block_threshold: round(auto, 2),
    alert_threshold: round(alert, 2),
    mode: rawMode,
  };
}
