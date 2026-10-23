import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { CertInExportMeta } from "./export";
import { formatDateTime } from "./format";
import type { CertInRow } from "./types";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const INK = rgb(0.08, 0.11, 0.16);
const MUTED = rgb(0.42, 0.47, 0.55);
const ACCENT = rgb(0.02, 0.55, 0.62);
const RULE = rgb(0.85, 0.88, 0.92);
const DANGER = rgb(0.78, 0.2, 0.2);

function sanitize(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, " ");
}

function wrap(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = sanitize(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    while (font.widthOfTextAtSize(current, size) > maxWidth && current.length > 1) {
      let cut = current.length - 1;
      while (
        cut > 1 &&
        font.widthOfTextAtSize(current.slice(0, cut), size) > maxWidth
      ) {
        cut -= 1;
      }
      lines.push(current.slice(0, cut));
      current = current.slice(cut);
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function severityColor(severity: string) {
  const value = severity.toLowerCase();
  if (value === "critical") return DANGER;
  if (value === "high") return rgb(0.85, 0.42, 0.12);
  if (value === "medium") return rgb(0.65, 0.55, 0.1);
  return MUTED;
}

export async function renderCertInPdf(
  rows: CertInRow[],
  meta: CertInExportMeta,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - 52;

  const ensureSpace = (needed: number) => {
    if (y - needed < 62) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - 52;
    }
  };

  const text = (
    value: string,
    options: {
      x?: number;
      size?: number;
      font?: PDFFont;
      color?: ReturnType<typeof rgb>;
      maxWidth?: number;
      lineHeight?: number;
    } = {},
  ) => {
    const size = options.size ?? 9;
    const usedFont = options.font ?? font;
    const x = options.x ?? MARGIN;
    const maxWidth = options.maxWidth ?? CONTENT_WIDTH;
    const lineHeight = options.lineHeight ?? size + 3.5;
    for (const line of wrap(value, usedFont, size, maxWidth)) {
      ensureSpace(lineHeight);
      page.drawText(line, {
        x,
        y,
        size,
        font: usedFont,
        color: options.color ?? INK,
      });
      y -= lineHeight;
    }
  };

  text("SHIELDFORGE", {
    size: 9,
    font: bold,
    color: ACCENT,
    lineHeight: 14,
  });
  text("CERT-In 6-Hour Incident Report", {
    size: 20,
    font: bold,
    lineHeight: 25,
  });
  y -= 2;
  text(
    "Prepared for CERT-In reporting under the Directions dated 28 April 2022: specified cyber security incidents must be reported within 6 hours of noticing them. This report covers the rolling 6-hour window below and includes the automated action taken for each affected origin.",
    { size: 8.5, color: MUTED, lineHeight: 12 },
  );
  y -= 6;

  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.7,
    color: RULE,
  });
  y -= 16;

  const metaLeft = [
    `Tenant: ${meta.tenant}`,
    `Generated: ${formatDateTime(meta.generatedAt)}`,
    `Window end: ${formatDateTime(meta.windowEnd)}`,
  ];
  const metaRight = [
    `Window start: ${formatDateTime(meta.windowStart)}`,
    `Window: 6 hours`,
    `Incidents: ${rows.length}`,
  ];
  const metaTop = y;
  for (const line of metaLeft) {
    page.drawText(sanitize(line), {
      x: MARGIN,
      y,
      size: 8.5,
      font,
      color: INK,
    });
    y -= 12;
  }
  let rightY = metaTop;
  for (const line of metaRight) {
    page.drawText(sanitize(line), {
      x: PAGE_WIDTH / 2 + 12,
      y: rightY,
      size: 8.5,
      font,
      color: INK,
    });
    rightY -= 12;
  }
  y -= 6;

  ensureSpace(28);
  page.drawRectangle({
    x: MARGIN,
    y: y - 4,
    width: CONTENT_WIDTH,
    height: 18,
    color: rgb(0.95, 0.97, 0.98),
  });
  page.drawText("TIMESTAMP", {
    x: MARGIN + 8,
    y: y + 1,
    size: 7.5,
    font: bold,
    color: MUTED,
  });
  page.drawText("SEVERITY / CATEGORY", {
    x: MARGIN + 150,
    y: y + 1,
    size: 7.5,
    font: bold,
    color: MUTED,
  });
  page.drawText("ACTION", {
    x: MARGIN + 330,
    y: y + 1,
    size: 7.5,
    font: bold,
    color: MUTED,
  });
  y -= 22;

  if (rows.length === 0) {
    text("No incidents were recorded in the last 6 hours.", {
      size: 10,
      color: MUTED,
    });
  }

  rows.forEach((row, index) => {
    ensureSpace(58);
    if (index > 0) {
      page.drawLine({
        start: { x: MARGIN, y: y + 7 },
        end: { x: PAGE_WIDTH - MARGIN, y: y + 7 },
        thickness: 0.4,
        color: RULE,
      });
    }

    page.drawText(sanitize(row.timestamp), {
      x: MARGIN + 8,
      y,
      size: 8,
      font,
      color: INK,
    });
    page.drawText(sanitize(`${row.severity} / ${row.category}`), {
      x: MARGIN + 150,
      y,
      size: 8,
      font: bold,
      color: severityColor(row.severity),
    });
    page.drawText(sanitize(row.action), {
      x: MARGIN + 330,
      y,
      size: 8,
      font,
      color: INK,
    });
    const resolved = row.resolved === "yes" ? "resolved" : "open";
    page.drawText(`Confidence ${sanitize(row.confidence)} - ${resolved}`, {
      x: MARGIN + 430,
      y,
      size: 7.5,
      font,
      color: MUTED,
    });
    y -= 12;

    text(row.finding, { size: 9.5, font: bold, lineHeight: 12 });
    text(`Affected origin: ${row.origin}`, {
      size: 8,
      color: MUTED,
      lineHeight: 10.5,
    });
    y -= 6;
  });

  const pages = doc.getPages();
  pages.forEach((current, index) => {
    current.drawLine({
      start: { x: MARGIN, y: 38 },
      end: { x: PAGE_WIDTH - MARGIN, y: 38 },
      thickness: 0.5,
      color: RULE,
    });
    current.drawText(
      sanitize(
        `ShieldForge control plane | CERT-In 6-hour report | Page ${index + 1} of ${pages.length}`,
      ),
      {
        x: MARGIN,
        y: 26,
        size: 7,
        font,
        color: MUTED,
      },
    );
    current.drawText("CONFIDENTIAL", {
      x: PAGE_WIDTH - MARGIN - 62,
      y: 26,
      size: 7,
      font: bold,
      color: MUTED,
    });
  });

  return doc.save();
}
