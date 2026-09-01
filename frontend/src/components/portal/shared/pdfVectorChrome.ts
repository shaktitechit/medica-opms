/**
 * @fileoverview Shared vector jsPDF helpers: company letterhead chrome, wrapping tables, pagination.
 * @module components/portal/shared/pdfVectorChrome
 */

import type { PdfCompanyLetterhead } from "./pdfCompanyLetterhead";

export type JsPDF = InstanceType<(typeof import("jspdf"))["jsPDF"]>;

export const NAVY: [number, number, number] = [30, 58, 95];
export const BLUE: [number, number, number] = [59, 130, 246];
export const DARK: [number, number, number] = [15, 23, 42];
export const TEXT: [number, number, number] = [51, 65, 85];
export const MUTED: [number, number, number] = [100, 116, 139];
export const LINE: [number, number, number] = [203, 213, 225];
export const BAND: [number, number, number] = [241, 245, 249];
export const ZEBRA: [number, number, number] = [248, 250, 252];
export const GREEN: [number, number, number] = [4, 120, 87];
export const GREEN_BG: [number, number, number] = [236, 253, 245];
export const GREEN_BD: [number, number, number] = [167, 243, 208];
export const INDIGO: [number, number, number] = [67, 56, 202];
export const INDIGO_BG: [number, number, number] = [224, 231, 255];
export const INDIGO_BD: [number, number, number] = [199, 210, 254];
export const VIOLET: [number, number, number] = [109, 40, 217];
export const VIOLET_BG: [number, number, number] = [245, 243, 255];
export const VIOLET_BD: [number, number, number] = [221, 214, 254];
export const RED: [number, number, number] = [185, 28, 28];

export type PdfChromeOpts = {
  letterhead: PdfCompanyLetterhead;
  logo: string | null;
  title: string;
  subtitle?: string;
  generatedAt: string;
  portalLabel?: string;
  downloadedBy?: string;
  compact?: boolean;
  rightTitle?: string;
  rightSub?: string;
};

export type PdfCol = {
  label: string;
  w: number;
  align?: "left" | "right" | "center";
};

export async function loadPdfLogo(url?: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:image/")) return url;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "") || null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function preparePdfChrome(
  letterhead: PdfCompanyLetterhead,
  rest: Omit<PdfChromeOpts, "letterhead" | "logo">,
): Promise<PdfChromeOpts> {
  const logo = await loadPdfLogo(letterhead.logoUrl);
  return { letterhead, logo, ...rest };
}

export function pageMargin(compact?: boolean): number {
  return compact ? 8 : 10;
}

export function headerReserve(compact?: boolean): number {
  return compact ? 32 : 42;
}

export function footerReserve(compact?: boolean): number {
  return compact ? 14 : 18;
}

export function contentTop(compact?: boolean): number {
  return pageMargin(compact) + headerReserve(compact);
}

export function contentBottom(pdf: JsPDF, compact?: boolean): number {
  return pdf.internal.pageSize.getHeight() - pageMargin(compact) - footerReserve(compact);
}

export function contentWidth(pdf: JsPDF, compact?: boolean): number {
  return pdf.internal.pageSize.getWidth() - pageMargin(compact) * 2;
}

export function wrapLines(
  pdf: JsPDF,
  text: string,
  width: number,
  maxLines = 4,
): string[] {
  const raw = String(text || "").replace(/\s+/g, " ").trim() || "—";
  const lines = pdf.splitTextToSize(raw, Math.max(width, 4)) as string[];
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1] || "";
  kept[maxLines - 1] =
    last.length > 3 ? `${last.slice(0, Math.max(last.length - 1, 1))}…` : last;
  return kept;
}

export function rowHeightFromLines(
  lineSets: string[][],
  lineH = 3.2,
  pad = 1.2,
): number {
  const n = Math.max(1, ...lineSets.map((l) => l.length));
  return pad * 2 + n * lineH;
}

function logoFormat(data: string): "PNG" | "JPEG" {
  return data.includes("image/png") ? "PNG" : "JPEG";
}

export function drawLetterheadHeader(pdf: JsPDF, opts: PdfChromeOpts): number {
  const compact = Boolean(opts.compact);
  const m = pageMargin(compact);
  const w = pdf.internal.pageSize.getWidth();
  const logoW = compact ? 18 : 28;
  const logoH = compact ? 8 : 12;
  let y = m;

  if (opts.logo) {
    try {
      pdf.addImage(opts.logo, logoFormat(opts.logo), m, y, logoW, logoH, undefined, "FAST");
    } catch {
      /* skip broken logo */
    }
  }

  const name = String(opts.letterhead.companyName || "").trim();
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(compact ? 10 : 13);
  pdf.setTextColor(...NAVY);
  if (name) {
    pdf.text(name.toUpperCase(), w / 2, y + (compact ? 3.2 : 4.2), { align: "center" });
  }

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(compact ? 6 : 6.5);
  pdf.setTextColor(...TEXT);
  let metaY = y + (compact ? 6.8 : 8.2);
  if (opts.letterhead.addressLine) {
    const addrLines = wrapLines(pdf, opts.letterhead.addressLine, w - m * 2 - logoW * 2, 2);
    for (const line of addrLines) {
      pdf.text(line, w / 2, metaY, { align: "center" });
      metaY += compact ? 2.6 : 3;
    }
  }
  if (opts.letterhead.contactLine) {
    const contactLines = wrapLines(pdf, opts.letterhead.contactLine, w - m * 2 - logoW * 2, 2);
    for (const line of contactLines) {
      pdf.text(line, w / 2, metaY, { align: "center" });
      metaY += compact ? 2.5 : 2.8;
    }
  }

  if (opts.rightTitle) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(compact ? 8 : 9);
    pdf.setTextColor(...DARK);
    pdf.text(opts.rightTitle, w - m, y + 3.4, { align: "right" });
    if (opts.rightSub) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(6.5);
      pdf.setTextColor(...MUTED);
      pdf.text(opts.rightSub, w - m, y + 7.2, { align: "right" });
    }
  }

  const ruleY = Math.max(y + logoH + 2, metaY + 1.4);
  pdf.setFillColor(...NAVY);
  pdf.rect(m, ruleY, w - m * 2, compact ? 0.45 : 0.6, "F");
  pdf.setFillColor(...BLUE);
  pdf.rect(m, ruleY + (compact ? 0.45 : 0.6), w - m * 2, 0.25, "F");

  let titleY = ruleY + (compact ? 5.2 : 6.5);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(compact ? 10 : 12);
  pdf.setTextColor(...DARK);
  pdf.text(opts.title, m, titleY);

  if (opts.subtitle) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(compact ? 6.5 : 7.5);
    pdf.setTextColor(...MUTED);
    const subLines = wrapLines(pdf, opts.subtitle, w - m * 2, 2);
    let sy = titleY + (compact ? 3.4 : 4);
    for (const line of subLines) {
      pdf.text(line, m, sy);
      sy += compact ? 2.8 : 3.2;
    }
    titleY = sy;
  } else {
    titleY += 2;
  }

  return titleY + 2;
}

export function drawLetterheadFooter(pdf: JsPDF, opts: PdfChromeOpts, pageNo: number, pageCount: number) {
  const compact = Boolean(opts.compact);
  const m = pageMargin(compact);
  const w = pdf.internal.pageSize.getWidth();
  const h = pdf.internal.pageSize.getHeight();
  const fy = h - m;
  const lineY = fy - (compact ? 10 : 13);

  pdf.setDrawColor(...LINE);
  pdf.setLineWidth(0.25);
  pdf.line(m, lineY, w - m, lineY);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(compact ? 6.5 : 7);
  pdf.setTextColor(...TEXT);
  const name = String(opts.letterhead.companyName || "").trim();
  if (name) pdf.text(name, m, lineY + 3.2);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(compact ? 5.8 : 6.2);
  pdf.setTextColor(...MUTED);
  let metaY = lineY + 5.8;
  if (opts.letterhead.addressLine) {
    const addr = wrapLines(pdf, opts.letterhead.addressLine, w * 0.58, 1);
    pdf.text(addr[0] || "", m, metaY);
    metaY += compact ? 2.4 : 2.6;
  }
  const contact = opts.letterhead.contactLine || opts.letterhead.footerNote;
  if (contact) {
    const c = wrapLines(pdf, contact, w * 0.58, 1);
    pdf.text(c[0] || "", m, metaY);
  }

  pdf.setFontSize(compact ? 5.8 : 6.2);
  pdf.setTextColor(...MUTED);
  const right: string[] = [];
  if (opts.portalLabel) right.push(`Portal: ${opts.portalLabel}`);
  if (opts.downloadedBy) right.push(`Downloaded by: ${opts.downloadedBy}`);
  if (opts.generatedAt) right.push(opts.generatedAt);
  right.push(`Page ${pageNo} of ${pageCount}`);
  let ry = lineY + 3.2;
  for (const line of right) {
    pdf.text(line, w - m, ry, { align: "right" });
    ry += compact ? 2.5 : 2.7;
  }
}

export function stampAllPages(pdf: JsPDF, opts: PdfChromeOpts) {
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    pdf.setPage(i);
    drawLetterheadFooter(pdf, opts, i, total);
  }
}

export function startPdfPage(pdf: JsPDF, opts: PdfChromeOpts, first: boolean): number {
  if (!first) pdf.addPage();
  return drawLetterheadHeader(pdf, opts);
}

export function ensureSpace(
  pdf: JsPDF,
  opts: PdfChromeOpts,
  y: number,
  needed: number,
): number {
  if (y + needed <= contentBottom(pdf, opts.compact)) return y;
  return startPdfPage(pdf, opts, false);
}

export function drawTableHead(
  pdf: JsPDF,
  cols: PdfCol[],
  x: number,
  y: number,
  h = 6.4,
): number {
  const totalW = cols.reduce((s, c) => s + c.w, 0);
  pdf.setFillColor(...BAND);
  pdf.rect(x, y, totalW, h, "F");
  pdf.setDrawColor(148, 163, 184);
  pdf.setLineWidth(0.3);
  pdf.line(x, y + h, x + totalW, y + h);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.4);
  pdf.setTextColor(...NAVY);
  let cx = x;
  for (const col of cols) {
    const label = col.label.toUpperCase();
    const tx =
      col.align === "right"
        ? cx + col.w - 1
        : col.align === "center"
          ? cx + col.w / 2
          : cx + 1;
    pdf.text(label, tx, y + h - 2, { align: col.align || "left" });
    cx += col.w;
  }
  return y + h;
}

export function drawTableRow(
  pdf: JsPDF,
  cols: PdfCol[],
  cells: string[][],
  x: number,
  y: number,
  h: number,
  zebra: boolean,
  lineH = 3.1,
) {
  const totalW = cols.reduce((s, c) => s + c.w, 0);
  if (zebra) {
    pdf.setFillColor(...ZEBRA);
    pdf.rect(x, y, totalW, h, "F");
  }
  pdf.setDrawColor(...LINE);
  pdf.setLineWidth(0.15);
  pdf.line(x, y + h, x + totalW, y + h);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.6);
  pdf.setTextColor(...TEXT);
  let cx = x;
  for (let i = 0; i < cols.length; i += 1) {
    const col = cols[i]!;
    const lines = cells[i] || ["—"];
    let ly = y + 3.2;
    for (const line of lines) {
      const tx =
        col.align === "right"
          ? cx + col.w - 1
          : col.align === "center"
            ? cx + col.w / 2
            : cx + 1;
      pdf.text(line, tx, ly, { align: col.align || "left" });
      ly += lineH;
    }
    cx += col.w;
  }
}

export function measureCells(
  pdf: JsPDF,
  cols: PdfCol[],
  values: string[],
  maxLines = 3,
  lineH = 3.1,
  pad = 1.15,
): { cells: string[][]; h: number } {
  const cells = cols.map((col, i) =>
    wrapLines(pdf, values[i] ?? "—", col.w - 2.2, maxLines),
  );
  return { cells, h: rowHeightFromLines(cells, lineH, pad) };
}

export type InfoBoxTone = "green" | "indigo" | "violet" | "blue" | "slate";

const BOX_TONES: Record<
  InfoBoxTone,
  { fg: [number, number, number]; bg: [number, number, number]; bd: [number, number, number] }
> = {
  green: { fg: GREEN, bg: GREEN_BG, bd: GREEN_BD },
  indigo: { fg: INDIGO, bg: INDIGO_BG, bd: INDIGO_BD },
  violet: { fg: VIOLET, bg: VIOLET_BG, bd: VIOLET_BD },
  blue: { fg: [29, 78, 216], bg: [239, 246, 255], bd: [191, 219, 254] },
  slate: { fg: NAVY, bg: BAND, bd: LINE },
};

export function measureInfoBox(
  pdf: JsPDF,
  rows: Array<{ label: string; value: string }>,
  boxW: number,
): number {
  const valueW = boxW - 42;
  let h = 8;
  for (const row of rows) {
    const lines = wrapLines(pdf, row.value || "—", valueW, 6);
    h += Math.max(4, lines.length * 3.3);
  }
  return h + 2;
}

export function drawInfoBox(
  pdf: JsPDF,
  x: number,
  y: number,
  w: number,
  title: string,
  rows: Array<{ label: string; value: string }>,
  tone: InfoBoxTone,
): number {
  const colors = BOX_TONES[tone];
  const h = measureInfoBox(pdf, rows, w);
  pdf.setFillColor(...colors.bg);
  pdf.setDrawColor(...colors.bd);
  pdf.setLineWidth(0.3);
  pdf.rect(x, y, w, h, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.5);
  pdf.setTextColor(...colors.fg);
  pdf.text(title.toUpperCase(), x + 3, y + 4.5);

  let ry = y + 8;
  for (const row of rows) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(...colors.fg);
    pdf.text(row.label, x + 3, ry);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...DARK);
    const lines = wrapLines(pdf, row.value || "—", w - 42, 6);
    pdf.text(lines, x + 38, ry);
    ry += Math.max(4, lines.length * 3.3);
  }
  return y + h + 3;
}

export function drawKvTable(
  pdf: JsPDF,
  x: number,
  y: number,
  w: number,
  pairs: Array<{ label: string; value: string }>,
  cols = 2,
): number {
  const colW = w / cols;
  const rowH = 5.2;
  const rows = Math.ceil(pairs.length / cols);
  pdf.setFontSize(7.2);
  for (let i = 0; i < pairs.length; i += 1) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const px = x + c * colW;
    const py = y + r * rowH;
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...MUTED);
    pdf.text(pairs[i]!.label, px, py);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...DARK);
    const valLines = wrapLines(pdf, pairs[i]!.value || "—", colW - 32, 2);
    pdf.text(valLines[0] || "—", px + 28, py);
  }
  return y + rows * rowH + 2;
}
