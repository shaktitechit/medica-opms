/**
 * @fileoverview Native vector jsPDF builder for Final Order Statements.
 * @module components/portal/shared/buildFinalOrderStatementPdf
 */

import type { PdfCompanyLetterhead } from "./pdfCompanyLetterhead";
import type {
  FinalOrderStatementPdfFinancialSummary,
  FinalOrderStatementPdfLine,
  FinalOrderStatementPdfTotals,
} from "./FinalOrderStatementPdfTemplate";
import {
  DARK,
  GREEN,
  MUTED,
  NAVY,
  RED,
  contentWidth,
  drawInfoBox,
  drawKvTable,
  drawTableHead,
  drawTableRow,
  ensureSpace,
  measureCells,
  measureInfoBox,
  preparePdfChrome,
  stampAllPages,
  startPdfPage,
  type JsPDF,
  type PdfChromeOpts,
} from "./pdfVectorChrome";

export type BuildFinalOrderStatementPdfInput = {
  letterhead: PdfCompanyLetterhead;
  statementNo: string;
  orderNo: string;
  partyName: string;
  partyCode?: string;
  partyGstin?: string;
  orderDate: string;
  closedAt: string;
  closedBy: string;
  closureRemarks?: string;
  lines: FinalOrderStatementPdfLine[];
  quantityTotals: FinalOrderStatementPdfTotals;
  financialSummary: FinalOrderStatementPdfFinancialSummary;
  generatedAt: string;
  portalLabel?: string;
  downloadedBy?: string;
};

const COLS = [
  { label: "Product", w: 40 },
  { label: "Ord", w: 12, align: "right" as const },
  { label: "Appr", w: 12, align: "right" as const },
  { label: "Disp", w: 12, align: "right" as const },
  { label: "Deliv", w: 12, align: "right" as const },
  { label: "Ret", w: 12, align: "right" as const },
  { label: "Net", w: 12, align: "right" as const },
  { label: "Rate", w: 16, align: "right" as const },
  { label: "Type", w: 12, align: "center" as const },
  { label: "GST%", w: 12, align: "right" as const },
  { label: "GST", w: 16, align: "right" as const },
  { label: "Total", w: 22, align: "right" as const },
];

function drawRow(
  pdf: JsPDF,
  chrome: PdfChromeOpts,
  x: number,
  y: number,
  cells: string[][],
  h: number,
  idx: number,
): number {
  const next = ensureSpace(pdf, chrome, y, h + 1);
  let yy = next;
  if (yy !== y) yy = drawTableHead(pdf, COLS, x, yy);
  drawTableRow(pdf, COLS, cells, x, yy, h, idx % 2 === 1);
  return yy + h;
}

export async function buildFinalOrderStatementPdf(
  input: BuildFinalOrderStatementPdfInput,
): Promise<JsPDF> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const chrome = await preparePdfChrome(input.letterhead, {
    title: "Final Order Statement",
    subtitle: input.statementNo,
    generatedAt: input.generatedAt,
    portalLabel: input.portalLabel,
    downloadedBy: input.downloadedBy,
  });

  const m = 10;
  const w = contentWidth(pdf);
  let y = startPdfPage(pdf, chrome, true);

  const pairs: Array<{ label: string; value: string }> = [
    { label: "Order No.", value: input.orderNo },
    { label: "Order Date", value: input.orderDate },
    { label: "Party", value: input.partyName },
    { label: "Closed At", value: input.closedAt },
    { label: "Party Code", value: input.partyCode || "—" },
    { label: "Closed By", value: input.closedBy },
  ];
  if (input.partyGstin) pairs.push({ label: "GSTIN", value: input.partyGstin });
  if (input.closureRemarks) pairs.push({ label: "Closure Remarks", value: input.closureRemarks });
  y = drawKvTable(pdf, m, y, w, pairs, 2);
  y += 2;

  y = ensureSpace(pdf, chrome, y, 10);
  y = drawTableHead(pdf, COLS, m, y);

  input.lines.forEach((line, idx) => {
    const kit =
      line.isKitShell ? " [KIT]" : line.isKitBucket ? " [KIT BUCKET]" : "";
    const sku = line.sku ? ` · SKU ${line.sku}` : "";
    const hsn = line.hsnCode ? ` · HSN ${line.hsnCode}` : "";
    const measured = measureCells(pdf, COLS, [
      `${line.productName}${kit}${sku}${hsn}`,
      line.ordered,
      line.approved,
      line.dispatched,
      line.delivered,
      line.returned,
      line.net,
      line.unitPrice,
      line.rateType,
      line.gstPercent,
      line.gstAmount,
      line.lineTotal,
    ]);
    y = drawRow(pdf, chrome, m, y, measured.cells, measured.h, idx);
  });

  const tot = input.quantityTotals;
  const totMeasured = measureCells(pdf, COLS, [
    "Totals",
    tot.ordered,
    tot.approved,
    tot.dispatched,
    tot.delivered,
    tot.returned,
    tot.net,
    "",
    "",
    "",
    tot.gstAmount,
    tot.grandTotal,
  ]);
  y = ensureSpace(pdf, chrome, y, totMeasured.h + 2);
  drawTableRow(pdf, COLS, totMeasured.cells, m, y, totMeasured.h, false);
  y += totMeasured.h + 4;

  const qtyRows = [
    { label: "Ordered", value: tot.ordered },
    { label: "Approved", value: tot.approved },
    { label: "Dispatched", value: tot.dispatched },
    { label: "Delivered", value: tot.delivered },
    { label: "Returns", value: tot.returned },
    { label: "Net", value: tot.net },
  ];
  y = ensureSpace(pdf, chrome, y, measureInfoBox(pdf, qtyRows, w) + 4);
  y = drawInfoBox(pdf, m, y, w, "Quantity Summary (Settled)", qtyRows, "blue");

  const fin = input.financialSummary;
  y = ensureSpace(pdf, chrome, y, 56);
  const boxX = m + 78;
  const boxW = w - 78;
  pdf.setFillColor(236, 253, 245);
  pdf.setDrawColor(167, 243, 208);
  pdf.setLineWidth(0.3);
  pdf.rect(m, y, w, 54, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.5);
  pdf.setTextColor(...GREEN);
  pdf.text("FINANCIAL SUMMARY (SETTLED)", m + 3, y + 5);

  const financeRows: Array<{ label: string; value: string; tone?: "deduct" | "add" }> = [
    { label: "Subtotal (settled net lines)", value: fin.subtotal },
    { label: "Line Discount Total", value: fin.lineDiscountTotal, tone: "deduct" },
    { label: "Taxable Amount", value: fin.taxableAmount },
    { label: "GST Amount", value: fin.gst },
    { label: "Header Discount", value: fin.headerDiscount, tone: "deduct" },
    { label: "Extra Charges", value: fin.extraCharges, tone: "add" },
    { label: "Penalty Amount", value: fin.penaltyAmount, tone: "add" },
    { label: "Damage Charge", value: fin.damageCharge, tone: "add" },
  ];
  let fy = y + 9;
  pdf.setFontSize(7.2);
  for (const row of financeRows) {
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...GREEN);
    pdf.text(row.label, boxX, fy);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...(row.tone === "deduct" ? RED : DARK));
    pdf.text(`₹${row.value}`, m + w - 3, fy, { align: "right" });
    fy += 3.8;
  }
  pdf.setDrawColor(...GREEN);
  pdf.setLineWidth(0.4);
  pdf.line(boxX, fy, m + w - 3, fy);
  fy += 4.5;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(...NAVY);
  pdf.text("Grand Total", boxX, fy);
  pdf.text(`₹${fin.grandTotal}`, m + w - 3, fy, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(...MUTED);
  pdf.text(`Payment: ${fin.paymentStatus}`, m + 3, fy);

  stampAllPages(pdf, chrome);
  return pdf;
}
