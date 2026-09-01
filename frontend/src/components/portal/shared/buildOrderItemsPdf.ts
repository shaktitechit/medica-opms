/**
 * @fileoverview Native vector jsPDF builder for Order Items statements.
 * @module components/portal/shared/buildOrderItemsPdf
 */

import type { PdfCompanyLetterhead } from "./pdfCompanyLetterhead";
import type {
  OrderItemsPdfFinanceAmendment,
  OrderItemsPdfLine,
  OrderItemsPdfSalesApproval,
} from "./OrderItemsPdfTemplate";
import {
  DARK,
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

export type BuildOrderItemsPdfInput = {
  letterhead: PdfCompanyLetterhead;
  orderNo: string;
  partyName: string;
  orderDate: string;
  expectedDeliveryDate?: string;
  statusLabel: string;
  salesApproval: OrderItemsPdfSalesApproval;
  financeAmendment?: OrderItemsPdfFinanceAmendment;
  adminAmendment?: OrderItemsPdfFinanceAmendment;
  items: OrderItemsPdfLine[];
  subtotal: string;
  gst: string;
  headerDiscount: string;
  grandTotal: string;
  generatedAt: string;
  portalLabel?: string;
  downloadedBy?: string;
};

const COLS = [
  { label: "Product", w: 52 },
  { label: "Qty", w: 14, align: "right" as const },
  { label: "Free", w: 14, align: "right" as const },
  { label: "Rate", w: 22 },
  { label: "Price", w: 20, align: "right" as const },
  { label: "Disc", w: 18, align: "right" as const },
  { label: "GST", w: 20, align: "right" as const },
  { label: "Total", w: 30, align: "right" as const },
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

export async function buildOrderItemsPdf(input: BuildOrderItemsPdfInput): Promise<JsPDF> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const chrome = await preparePdfChrome(input.letterhead, {
    title: "Order Items Statement",
    subtitle: `Generated on ${input.generatedAt}`,
    generatedAt: input.generatedAt,
    portalLabel: input.portalLabel,
    downloadedBy: input.downloadedBy,
  });

  const m = 10;
  const w = contentWidth(pdf);
  let y = startPdfPage(pdf, chrome, true);

  const pairs: Array<{ label: string; value: string }> = [
    { label: "Order No.", value: input.orderNo },
    { label: "Status", value: input.statusLabel },
    { label: "Party", value: input.partyName },
    { label: "Order Date", value: input.orderDate },
  ];
  if (input.expectedDeliveryDate) {
    pairs.push({ label: "Expected Delivery", value: input.expectedDeliveryDate });
  }
  y = drawKvTable(pdf, m, y, w, pairs, 2);
  y += 2;

  const salesRows: Array<{ label: string; value: string }> = [];
  if (input.salesApproval.approvalNo) {
    salesRows.push({ label: "Approval No.", value: input.salesApproval.approvalNo });
  }
  salesRows.push(
    { label: "Status", value: input.salesApproval.statusLabel },
    { label: "Approved by", value: input.salesApproval.approvedBy },
    { label: "Date & time", value: input.salesApproval.approvedAt },
  );
  y = ensureSpace(pdf, chrome, y, measureInfoBox(pdf, salesRows, w) + 4);
  y = drawInfoBox(pdf, m, y, w, "Sales Approval", salesRows, "green");

  if (input.financeAmendment) {
    const rows = [
      { label: "Amended by", value: input.financeAmendment.amendedBy },
      { label: "Date & time", value: input.financeAmendment.amendedAt },
    ];
    if (input.financeAmendment.amendmentNotes) {
      rows.push({ label: "Notes", value: input.financeAmendment.amendmentNotes });
    }
    y = ensureSpace(pdf, chrome, y, measureInfoBox(pdf, rows, w) + 4);
    y = drawInfoBox(pdf, m, y, w, "Finance Amendment Info", rows, "indigo");
  }

  if (input.adminAmendment) {
    const rows = [
      { label: "Amended by", value: input.adminAmendment.amendedBy },
      { label: "Date & time", value: input.adminAmendment.amendedAt },
    ];
    if (input.adminAmendment.amendmentNotes) {
      rows.push({ label: "Notes", value: input.adminAmendment.amendmentNotes });
    }
    y = ensureSpace(pdf, chrome, y, measureInfoBox(pdf, rows, w) + 4);
    y = drawInfoBox(pdf, m, y, w, "Admin Amendment Info", rows, "violet");
  }

  y = ensureSpace(pdf, chrome, y, 10);
  y = drawTableHead(pdf, COLS, m, y);

  input.items.forEach((line, idx) => {
    const product = line.sku ? `${line.productName}  ·  SKU ${line.sku}` : line.productName;
    const measured = measureCells(pdf, COLS, [
      product,
      line.quantity,
      line.freeQty,
      line.rateType,
      line.unitPrice,
      line.discount,
      line.gst,
      line.lineTotal,
    ]);
    y = drawRow(pdf, chrome, m, y, measured.cells, measured.h, idx);
  });

  y = ensureSpace(pdf, chrome, y, 28);
  y += 4;
  pdf.setDrawColor(...NAVY);
  pdf.setLineWidth(0.5);
  pdf.line(m + 110, y, m + w, y);
  y += 6;
  const totals: Array<{ label: string; value: string; color?: [number, number, number]; bold?: boolean }> = [
    { label: "Subtotal", value: `₹${input.subtotal}` },
    { label: "GST", value: `₹${input.gst}` },
    { label: "Header Discount", value: `-₹${input.headerDiscount}`, color: RED },
    { label: "Grand Total", value: `₹${input.grandTotal}`, bold: true, color: NAVY },
  ];
  for (const row of totals) {
    pdf.setFont("helvetica", row.bold ? "bold" : "normal");
    pdf.setFontSize(row.bold ? 10 : 8);
    pdf.setTextColor(...MUTED);
    pdf.text(row.label, m + 118, y);
    pdf.setTextColor(...(row.color || DARK));
    pdf.text(row.value, m + w, y, { align: "right" });
    y += row.bold ? 6 : 5;
  }

  stampAllPages(pdf, chrome);
  return pdf;
}
