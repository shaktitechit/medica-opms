/**
 * @fileoverview Native vector jsPDF builder for Unbilled / Process Pending / On Hold reports.
 * @module components/portal/shared/buildUnbilledOrdersPdf
 */

import type { PdfCompanyLetterhead } from "./pdfCompanyLetterhead";
import type {
  UnbilledOrdersPdfListLine,
  UnbilledOrdersPdfUnbilledLine,
} from "./UnbilledOrdersPdfTemplate";
import {
  DARK,
  MUTED,
  NAVY,
  contentBottom,
  contentWidth,
  drawTableHead,
  drawTableRow,
  ensureSpace,
  measureCells,
  preparePdfChrome,
  stampAllPages,
  startPdfPage,
  type JsPDF,
  type PdfChromeOpts,
  type PdfCol,
} from "./pdfVectorChrome";

export type BuildUnbilledOrdersPdfInput = {
  letterhead: PdfCompanyLetterhead;
  portalLabel: string;
  downloadedBy: string;
  generatedAt: string;
  unbilledLines: UnbilledOrdersPdfUnbilledLine[];
  processPendingLines: UnbilledOrdersPdfListLine[];
  onHoldLines: UnbilledOrdersPdfListLine[];
};

const UNBILLED_COLS: PdfCol[] = [
  { label: "Order", w: 24 },
  { label: "Date", w: 22 },
  { label: "Party", w: 32 },
  { label: "Status", w: 24 },
  { label: "Product", w: 44 },
  { label: "Appr", w: 14, align: "right" },
  { label: "Disp", w: 14, align: "right" },
  { label: "Unbilled", w: 16, align: "right" },
];

const LIST_COLS: PdfCol[] = [
  { label: "Order", w: 24 },
  { label: "Date", w: 22 },
  { label: "Party", w: 32 },
  { label: "Status", w: 26 },
  { label: "Product", w: 50 },
  { label: "Ordered", w: 18, align: "right" },
  { label: "Pending", w: 18, align: "right" },
];

function productLabel(name: string, sku?: string): string {
  return sku ? `${name}  ·  SKU ${sku}` : name;
}

function drawSectionTitle(
  pdf: JsPDF,
  chrome: PdfChromeOpts,
  x: number,
  y: number,
  title: string,
  count: number,
): number {
  y = ensureSpace(pdf, chrome, y, 12);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(...NAVY);
  pdf.text(title.toUpperCase(), x, y);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(...MUTED);
  pdf.text(`${count} line${count === 1 ? "" : "s"}`, x, y + 3.6);
  return y + 7;
}

function drawEmptyNote(
  pdf: JsPDF,
  chrome: PdfChromeOpts,
  x: number,
  y: number,
  w: number,
  label: string,
): number {
  y = ensureSpace(pdf, chrome, y, 10);
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(226, 232, 240);
  pdf.rect(x, y, w, 8, "FD");
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...MUTED);
  pdf.text(`No ${label} at the time of download.`, x + 3, y + 5);
  return y + 11;
}

function drawRows<T>(
  pdf: JsPDF,
  chrome: PdfChromeOpts,
  x: number,
  y: number,
  cols: PdfCol[],
  rows: T[],
  toValues: (row: T) => string[],
): number {
  y = ensureSpace(pdf, chrome, y, 10);
  y = drawTableHead(pdf, cols, x, y);
  rows.forEach((row, idx) => {
    const measured = measureCells(pdf, cols, toValues(row));
    const next = ensureSpace(pdf, chrome, y, measured.h + 1);
    if (next !== y) {
      y = drawTableHead(pdf, cols, x, next);
    } else {
      y = next;
    }
    drawTableRow(pdf, cols, measured.cells, x, y, measured.h, idx % 2 === 1);
    y += measured.h;
  });
  return y + 3;
}

export async function buildUnbilledOrdersPdf(input: BuildUnbilledOrdersPdfInput): Promise<JsPDF> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const chrome = await preparePdfChrome(input.letterhead, {
    title: "Unbilled / Process Pending / On Hold Orders",
    subtitle: "Combined report generated from the orders modal",
    generatedAt: input.generatedAt,
    portalLabel: input.portalLabel,
    downloadedBy: input.downloadedBy,
  });

  const m = 10;
  const w = contentWidth(pdf);
  let y = startPdfPage(pdf, chrome, true);

  y = drawSectionTitle(pdf, chrome, m, y, "1. Un Billed Orders", input.unbilledLines.length);
  if (input.unbilledLines.length === 0) {
    y = drawEmptyNote(pdf, chrome, m, y, w, "un billed orders");
  } else {
    y = drawRows(pdf, chrome, m, y, UNBILLED_COLS, input.unbilledLines, (line) => [
      line.orderNo,
      line.refOrderDate,
      line.party,
      line.statusLabel,
      productLabel(line.productName, line.sku),
      String(line.approved),
      String(line.submittedDispatch),
      String(line.remaining),
    ]);
  }

  y = drawSectionTitle(pdf, chrome, m, y, "2. Process Pending Orders", input.processPendingLines.length);
  if (input.processPendingLines.length === 0) {
    y = drawEmptyNote(pdf, chrome, m, y, w, "process pending orders");
  } else {
    y = drawRows(pdf, chrome, m, y, LIST_COLS, input.processPendingLines, (line) => [
      line.orderNo,
      line.refOrderDate,
      line.party,
      line.statusLabel,
      productLabel(line.productName, line.sku),
      String(line.ordered),
      String(line.pending),
    ]);
  }

  y = drawSectionTitle(pdf, chrome, m, y, "3. On Hold Orders", input.onHoldLines.length);
  if (input.onHoldLines.length === 0) {
    y = drawEmptyNote(pdf, chrome, m, y, w, "on hold orders");
  } else {
    y = drawRows(pdf, chrome, m, y, LIST_COLS, input.onHoldLines, (line) => [
      line.orderNo,
      line.refOrderDate,
      line.party,
      line.statusLabel,
      productLabel(line.productName, line.sku),
      String(line.ordered),
      String(line.pending),
    ]);
  }

  const unbilledQty = input.unbilledLines.reduce((s, l) => s + Number(l.remaining || 0), 0);
  const processQty = input.processPendingLines.reduce((s, l) => s + Number(l.pending || 0), 0);
  const holdQty = input.onHoldLines.reduce((s, l) => s + Number(l.pending || 0), 0);
  const total = unbilledQty + processQty + holdQty;

  y = ensureSpace(pdf, chrome, y, 32);
  if (y + 32 > contentBottom(pdf)) y = startPdfPage(pdf, chrome, false);
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(203, 213, 225);
  pdf.rect(m, y, w, 28, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...NAVY);
  pdf.text("QUANTITY SUMMARY", m + 3, y + 5);
  const summary = [
    { label: "Un Billed quantity", value: unbilledQty },
    { label: "Process Pending quantity", value: processQty },
    { label: "On Hold pending quantity", value: holdQty },
    { label: "Total pending quantity (incl. unbilled)", value: total },
  ];
  let sy = y + 10;
  for (const row of summary) {
    const last = row === summary[summary.length - 1];
    pdf.setFont("helvetica", last ? "bold" : "normal");
    pdf.setFontSize(last ? 8.5 : 7.5);
    pdf.setTextColor(...(last ? DARK : MUTED));
    pdf.text(row.label, m + 3, sy);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...DARK);
    pdf.text(String(row.value), m + w - 3, sy, { align: "right" });
    sy += last ? 5 : 4.2;
  }

  stampAllPages(pdf, chrome);
  return pdf;
}
