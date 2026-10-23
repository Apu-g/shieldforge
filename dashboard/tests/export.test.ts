import { describe, expect, it } from "vitest";
import {
  buildCertInRows,
  certInToCsv,
  certInToJson,
  selectCertInIncidents,
} from "../lib/export";
import type { IncidentView } from "../lib/types";

function incident(overrides: Partial<IncidentView> = {}): IncidentView {
  return {
    id: "i1",
    finding_id: "f1",
    action_taken: "temp_block",
    confidence: 0.912,
    resolved: false,
    created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    finding_title: "Reflected XSS, cookie theft attempt",
    category: "xss",
    severity: "critical",
    origin_url: "https://victim-shop.vercel.app",
    ...overrides,
  };
}

describe("CERT-In incident selection", () => {
  it("keeps only the last six hours, newest first", () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const recent = incident({
      id: "recent",
      created_at: "2026-01-01T11:00:00.000Z",
    });
    const older = incident({
      id: "older",
      created_at: "2026-01-01T10:00:00.000Z",
    });
    const outside = incident({
      id: "outside",
      created_at: "2026-01-01T05:59:00.000Z",
    });

    expect(selectCertInIncidents([older, outside, recent], now).map((i) => i.id)).toEqual([
      "recent",
      "older",
    ]);
  });
});

describe("CERT-In rows", () => {
  it("maps every required field", () => {
    const rows = buildCertInRows([incident()]);
    expect(rows).toHaveLength(1);
    expect(rows[0].origin).toBe("https://victim-shop.vercel.app");
    expect(rows[0].action).toBe("temp_block");
    expect(rows[0].confidence).toBe("0.912");
    expect(rows[0].severity).toBe("CRITICAL");
    expect(rows[0].resolved).toBe("no");
    expect(rows[0].timestamp).toContain("IST");
  });

  it("produces RFC4180-safe CSV with a BOM", () => {
    const csv = certInToCsv(buildCertInRows([incident()]));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"Reflected XSS, cookie theft attempt"');
    expect(csv.split("\r\n")[0]).toContain("Affected origin");
  });

  it("produces JSON with incident count and CERT-In context", () => {
    const rows = buildCertInRows([incident()]);
    const parsed = JSON.parse(
      certInToJson(rows, {
        generatedAt: "2026-01-01T12:00:00.000Z",
        windowStart: "2026-01-01T06:00:00.000Z",
        windowEnd: "2026-01-01T12:00:00.000Z",
        tenant: "ShieldForge Demo",
      }),
    );

    expect(parsed.incident_count).toBe(1);
    expect(parsed.window_hours).toBe(6);
    expect(parsed.requirement).toContain("within 6 hours");
    expect(parsed.incidents[0].affected_origin).toBe(
      "https://victim-shop.vercel.app",
    );
  });

  it("handles an empty window", () => {
    expect(buildCertInRows([])).toEqual([]);
    expect(certInToCsv([]).split("\r\n")[0]).toContain("Timestamp");
  });
});
