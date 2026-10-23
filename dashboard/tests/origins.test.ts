import { describe, expect, it } from "vitest";
import {
  normalizeVercelOrigin,
  validatePolicyPatch,
} from "../lib/origins";
import { ValidationError } from "../lib/errors";

describe("origin onboarding", () => {
  it("accepts a bare Vercel hostname and derives the proxy path", () => {
    expect(normalizeVercelOrigin("victim-shop.vercel.app")).toEqual({
      originUrl: "https://victim-shop.vercel.app",
      host: "victim-shop.vercel.app",
      proxyPath: "/t/victim-shop",
    });
  });

  it("normalizes scheme, casing, and strips paths", () => {
    expect(
      normalizeVercelOrigin("http://Checkout-Lab.Vercel.App/some/path?q=1"),
    ).toEqual({
      originUrl: "https://checkout-lab.vercel.app",
      host: "checkout-lab.vercel.app",
      proxyPath: "/t/checkout-lab",
    });
  });

  it("rejects non-Vercel hosts", () => {
    expect(() => normalizeVercelOrigin("https://example.com")).toThrow(
      ValidationError,
    );
    expect(() => normalizeVercelOrigin("https://evil.vercel.app.evil.com")).toThrow(
      ValidationError,
    );
  });

  it("rejects empty values", () => {
    expect(() => normalizeVercelOrigin("   ")).toThrow(
      "Paste a Vercel URL",
    );
  });
});

describe("policy validation", () => {
  it("merges a partial patch with current values", () => {
    expect(
      validatePolicyPatch(
        { mode: "enforce" },
        { auto_block_threshold: 0.85, alert_threshold: 0.5, mode: "shadow" },
      ),
    ).toEqual({
      auto_block_threshold: 0.85,
      alert_threshold: 0.5,
      mode: "enforce",
    });
  });

  it("rounds thresholds and uses defaults when none exist", () => {
    expect(validatePolicyPatch({})).toEqual({
      auto_block_threshold: 0.9,
      alert_threshold: 0.6,
      mode: "shadow",
    });
  });

  it("rejects out-of-range thresholds", () => {
    expect(() =>
      validatePolicyPatch({ auto_block_threshold: 1.2 }),
    ).toThrow(ValidationError);
    expect(() =>
      validatePolicyPatch({ alert_threshold: -0.1 }),
    ).toThrow(ValidationError);
  });

  it("rejects alert above auto-block", () => {
    expect(() =>
      validatePolicyPatch({ auto_block_threshold: 0.5, alert_threshold: 0.7 }),
    ).toThrow("cannot be higher");
  });

  it("rejects invalid modes", () => {
    expect(() => validatePolicyPatch({ mode: "monitor" })).toThrow(
      ValidationError,
    );
  });
});
