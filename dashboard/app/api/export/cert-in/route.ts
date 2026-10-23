import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { renderCertInPdf } from "@/lib/cert-in-pdf";
import {
  buildCertInRows,
  certInFilename,
  certInToCsv,
  certInToJson,
  certInWindow,
  selectCertInIncidents,
} from "@/lib/export";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FORMATS = ["csv", "json", "pdf"] as const;
type Format = (typeof FORMATS)[number];

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requested = (url.searchParams.get("format") ?? "pdf").toLowerCase();
    const format = FORMATS.includes(requested as Format)
      ? (requested as Format)
      : null;
    if (!format) {
      return NextResponse.json(
        { error: "format must be one of csv, json, pdf." },
        { status: 400 },
      );
    }

    const store = getStore();
    const now = new Date();
    const window = certInWindow(now);

    const [snapshot, sinceIncidents] = await Promise.all([
      store.getSnapshot(),
      store.getIncidentsSince(window.start),
    ]);

    const incidents = selectCertInIncidents(sinceIncidents, now);
    const rows = buildCertInRows(incidents);
    const meta = {
      generatedAt: now.toISOString(),
      windowStart: window.start.toISOString(),
      windowEnd: window.end.toISOString(),
      tenant: snapshot.tenant_name,
    };

    const filename = certInFilename(format, now);
    const commonHeaders = {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
    };

    if (format === "csv") {
      return new NextResponse(certInToCsv(rows), {
        headers: {
          ...commonHeaders,
          "Content-Type": "text/csv; charset=utf-8",
        },
      });
    }

    if (format === "json") {
      return new NextResponse(certInToJson(rows, meta), {
        headers: {
          ...commonHeaders,
          "Content-Type": "application/json; charset=utf-8",
        },
      });
    }

    const pdf = await renderCertInPdf(rows, meta);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        ...commonHeaders,
        "Content-Type": "application/pdf",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
