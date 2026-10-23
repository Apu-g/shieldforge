import { describe, expect, it } from "vitest";
import {
  MANUAL_REVIEW_BASELINE_SECONDS,
  buildDetectionPoints,
  buildRiskTrend,
  computeStats,
  detectionSeconds,
  incidentsWithinHours,
  median,
} from "../lib/metrics";
import type {
  FindingView,
  IncidentView,
  OriginRow,
  TrainingEventRow,
} from "../lib/types";

function finding(overrides: Partial<FindingView> = {}): FindingView {
  return {
    id: "f1",
    origin_id: "o1",
    event_id: "e1",
    severity: "high",
    category: "xss",
    title: "XSS",
    evidence: {},
    ai_summary: null,
    status: "open",
    created_at: "2026-01-01T12:00:02.000Z",
    origin_url: "https://victim.vercel.app",
    event_ts: "2026-01-01T12:00:00.000Z",
    detection_seconds: 2,
    ...overrides,
  };
}

function origin(overrides: Partial<OriginRow> = {}): OriginRow {
  return {
    id: "o1",
    tenant_id: "t1",
    origin_url: "https://victim.vercel.app",
    proxy_path: "/t/victim",
    status: "active",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function incident(overrides: Partial<IncidentView> = {}): IncidentView {
  return {
    id: "i1",
    finding_id: "f1",
    action_taken: "temp_block",
    confidence: 0.9,
    resolved: false,
    created_at: "2026-01-01T11:00:00.000Z",
    finding_title: "XSS",
    category: "xss",
    severity: "high",
    origin_url: "https://victim.vercel.app",
    ...overrides,
  };
}

describe("detection timing", () => {
  it("calculates seconds between the event and the finding", () => {
    expect(
      detectionSeconds(
        "2026-01-01T12:00:00.000Z",
        "2026-01-01T12:00:01.250Z",
      ),
    ).toBe(1.25);
  });

  it("returns null for missing or reversed timestamps", () => {
    expect(detectionSeconds(null, "2026-01-01T12:00:00.000Z")).toBeNull();
    expect(
      detectionSeconds(
        "2026-01-01T12:00:02.000Z",
        "2026-01-01T12:00:00.000Z",
      ),
    ).toBeNull();
  });

  it("computes medians for odd and even sets", () => {
    expect(median([4, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("builds a chronological detection series with labels", () => {
    const points = buildDetectionPoints([
      finding({ id: "b", created_at: "2026-01-01T12:10:00.000Z", detection_seconds: 3 }),
      finding({ id: "a", created_at: "2026-01-01T12:00:00.000Z", detection_seconds: 1 }),
    ]);
    expect(points.map((p) => p.id)).toEqual(["a", "b"]);
    expect(points[0].label).toBe("#1");
  });
});

describe("dashboard stats", () => {
  it("computes the improvement against the 15 minute baseline", () => {
    const detection = buildDetectionPoints([
      finding({ id: "a", detection_seconds: 1 }),
      finding({ id: "b", detection_seconds: 2 }),
      finding({ id: "c", detection_seconds: 3 }),
    ]);
    const stats = computeStats({
      origins: [origin(), origin({ id: "o2", status: "paused" })],
      findings: [
        finding(),
        finding({ id: "f2", status: "actioned" }),
        finding({ id: "f3", status: "fixed_verified" }),
      ],
      incidents6h: [incident()],
      detection,
    });

    expect(stats.activeOrigins).toBe(1);
    expect(stats.openFindings).toBe(1);
    expect(stats.actionedFindings).toBe(1);
    expect(stats.fixedVerified).toBe(1);
    expect(stats.medianDetectionSeconds).toBe(2);
    expect(stats.baselineSeconds).toBe(MANUAL_REVIEW_BASELINE_SECONDS);
    expect(stats.improvementPct).toBe(99.8);
  });

  it("filters incidents to the rolling window", () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const recent = incident({ id: "recent", created_at: "2026-01-01T11:30:00.000Z" });
    const old = incident({ id: "old", created_at: "2026-01-01T05:00:00.000Z" });
    expect(incidentsWithinHours([recent, old], 6, now).map((i) => i.id)).toEqual([
      "recent",
    ]);
  });
});

describe("training risk trend", () => {
  it("raises risk on a click and lowers it on lesson completion", () => {
    const events: TrainingEventRow[] = [
      { id: "1", user_id: "u1", event_type: "phishing_sent", ts: "2026-01-01T00:00:00Z" },
      { id: "2", user_id: "u1", event_type: "phishing_clicked", ts: "2026-01-02T00:00:00Z" },
      { id: "3", user_id: "u1", event_type: "lesson_completed", ts: "2026-01-03T00:00:00Z" },
    ];
    expect(buildRiskTrend(events)).toEqual([0, 1, 19, 7]);
  });

  it("returns a flat line when there are no events", () => {
    expect(buildRiskTrend([])).toEqual([0]);
  });
});
