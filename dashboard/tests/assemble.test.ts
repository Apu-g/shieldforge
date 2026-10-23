import { describe, expect, it } from "vitest";
import { assembleSnapshot } from "../lib/store/assemble";
import type {
  FindingView,
  IncidentView,
  OriginRow,
  PolicyRow,
  TrainingEventRow,
} from "../lib/types";

const origin: OriginRow = {
  id: "o1",
  tenant_id: "t1",
  origin_url: "https://victim-shop.vercel.app",
  proxy_path: "/t/victim-shop",
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
};

const policy: PolicyRow = {
  id: "p1",
  origin_id: "o1",
  auto_block_threshold: 0.9,
  alert_threshold: 0.6,
  mode: "shadow",
};

function finding(id: string, seconds: number, createdAt: string): FindingView {
  return {
    id,
    origin_id: "o1",
    event_id: "e1",
    severity: "high",
    category: "xss",
    title: `Finding ${id}`,
    evidence: {},
    ai_summary: null,
    status: "open",
    created_at: createdAt,
    origin_url: origin.origin_url,
    event_ts: new Date(new Date(createdAt).getTime() - seconds * 1000).toISOString(),
    detection_seconds: seconds,
  };
}

function incident(id: string, createdAt: string): IncidentView {
  return {
    id,
    finding_id: "f1",
    action_taken: "alert",
    confidence: 0.8,
    resolved: false,
    created_at: createdAt,
    finding_title: "Finding f1",
    category: "xss",
    severity: "high",
    origin_url: origin.origin_url,
  };
}

describe("snapshot assembly", () => {
  it("sorts feeds, builds detection points, and filters incidents", () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const trainingEvents: TrainingEventRow[] = [
      { id: "te1", user_id: "u1", event_type: "phishing_sent", ts: "2026-01-01T00:00:00.000Z" },
      { id: "te2", user_id: "u1", event_type: "phishing_clicked", ts: "2026-01-01T01:00:00.000Z" },
    ];

    const snapshot = assembleSnapshot({
      mode: "demo",
      revision: 3,
      tenantName: "ShieldForge Demo",
      origins: [origin],
      policies: [policy],
      findings: [
        finding("f1", 2, "2026-01-01T10:00:02.000Z"),
        finding("f2", 1, "2026-01-01T11:00:01.000Z"),
      ],
      incidents: [
        incident("i-old", "2026-01-01T05:00:00.000Z"),
        incident("i-new", "2026-01-01T11:30:00.000Z"),
      ],
      trainingUsers: [
        { id: "u1", name: "Aarav Mehta", risk_score: 82 },
        { id: "u2", name: "Kabir Shah", risk_score: 9 },
      ],
      trainingEvents,
      audit: [],
      now,
    });

    expect(snapshot.mode).toBe("demo");
    expect(snapshot.revision).toBe(3);
    expect(snapshot.findings.map((f) => f.id)).toEqual(["f2", "f1"]);
    expect(snapshot.detection.map((p) => p.seconds)).toEqual([2, 1]);
    expect(snapshot.incidents6h.map((i) => i.id)).toEqual(["i-new"]);
    expect(snapshot.stats.incidents6h).toBe(1);
    expect(snapshot.training.map((u) => u.id)).toEqual(["u1", "u2"]);
    expect(snapshot.training[0].trend).toEqual([0, 1, 19]);
    expect(snapshot.training[1].trend).toEqual([0]);
  });
});
