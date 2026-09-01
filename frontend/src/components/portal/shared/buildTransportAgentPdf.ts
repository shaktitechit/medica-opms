/**
 * @fileoverview Native vector jsPDF builder for Transport Agent shipment reports (landscape).
 * @module components/portal/shared/buildTransportAgentPdf
 */

import type { PdfCompanyLetterhead } from "./pdfCompanyLetterhead";
import {
  MUTED,
  drawTableHead,
  drawTableRow,
  ensureSpace,
  measureCells,
  pageMargin,
  preparePdfChrome,
  stampAllPages,
  startPdfPage,
  type JsPDF,
  type PdfChromeOpts,
  type PdfCol,
} from "./pdfVectorChrome";

export type BuildTransportAgentPdfInput = {
  letterhead: PdfCompanyLetterhead;
  portalLabel: string;
  downloadedBy: string;
  generatedAt: string;
  agentName: string;
  agentCode: string;
  shipments: unknown[];
  statusLabelSelected: string;
};

const COLS: PdfCol[] = [
  { label: "Order #", w: 16 },
  { label: "Party", w: 22 },
  { label: "City", w: 14 },
  { label: "Dispatch #", w: 18 },
  { label: "Invoice #", w: 17 },
  { label: "LR #", w: 14 },
  { label: "Ship Date", w: 16 },
  { label: "Pkg / Wt", w: 16 },
  { label: "Items", w: 37 },
  { label: "Qty", w: 10, align: "right" },
  { label: "Total", w: 16, align: "right" },
  { label: "Vehicle", w: 16 },
  { label: "Driver", w: 16 },
  { label: "Shipment", w: 18 },
  { label: "Delivered", w: 16 },
  { label: "Received", w: 19 },
];

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function statusLabel(s: unknown): string {
  return String(s || "created").replace(/_/g, " ").toUpperCase();
}

function fmtDate(d: unknown): string {
  if (!d) return "—";
  const dt = new Date(String(d));
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function shipmentValues(raw: unknown): string[] {
  const tr = asRecord(raw);
  const ord = asRecord(tr.order);
  const disp = asRecord(tr.dispatch);
  const party = asRecord(ord.party || ord.customer);
  const shipAddr = asRecord(party.shipping_address);
  const billAddr = asRecord(party.billing_address);

  const orderNo = String(ord.order_no || "—");
  const partyName = String(party.party_name || "—");
  const partyCity = String(shipAddr.city || billAddr.city || "—");
  const dispatchNo = String(tr.dispatch_no || disp.dispatch_no || "—");
  const invoice = String(tr.bill_number || disp.bill_number || "—");
  const lr = String(tr.lr_number || "—");
  const shipDate = fmtDate(tr.dispatch_date || tr.createdAt || tr.created_at);

  const pkgs =
    tr.packed_boxes != null || tr.open_boxes != null
      ? Number(tr.packed_boxes || 0) + Number(tr.open_boxes || 0)
      : tr.plan_packages ?? null;
  const wt =
    tr.weight != null
      ? `${tr.weight} ${tr.weight_unit || "Kg"}`
      : tr.plan_weight
        ? `${tr.plan_weight} Kg`
        : "—";
  const pkgWt = pkgs != null ? `${pkgs} / ${wt}` : wt;

  const rawItems = Array.isArray(tr.dispatch_items)
    ? tr.dispatch_items
    : Array.isArray(disp.dispatch_items)
      ? disp.dispatch_items
      : [];
  const itemsStr =
    rawItems
      .map((item: unknown) => {
        const it = asRecord(item);
        const prod = asRecord(it.product);
        const name = String(prod.product_name || prod.sku || "Item");
        const qty = it.dispatched_quantity ?? it.allocated_quantity ?? it.quantity ?? 0;
        return `${name} (${qty})`;
      })
      .join(", ") || "—";
  const totalQty = rawItems.reduce((s: number, i: unknown) => {
    const it = asRecord(i);
    return s + Number(it.dispatched_quantity ?? it.allocated_quantity ?? it.quantity ?? 0);
  }, 0);
  const totalAmt = ord.grand_total != null ? fmtMoney(Number(ord.grand_total)) : "—";

  return [
    orderNo,
    partyName,
    partyCity,
    dispatchNo,
    invoice,
    lr,
    shipDate,
    String(pkgWt),
    itemsStr,
    totalQty ? String(totalQty) : "—",
    totalAmt,
    String(tr.vehicle_number || "—"),
    String(tr.driver_name || "—"),
    statusLabel(tr.shipment_status ?? tr.status ?? "created"),
    fmtDate(tr.delivered_at),
    String(tr.received_by || "—"),
  ];
}

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
  drawTableRow(pdf, COLS, cells, x, yy, h, idx % 2 === 1, 2.8);
  return yy + h;
}

export async function buildTransportAgentPdf(input: BuildTransportAgentPdfInput): Promise<JsPDF> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const chrome = await preparePdfChrome(input.letterhead, {
    title: "Transport Agent Shipments",
    subtitle: `Status Filter: ${input.statusLabelSelected}  ·  Generated: ${input.generatedAt}`,
    generatedAt: input.generatedAt,
    portalLabel: input.portalLabel,
    downloadedBy: input.downloadedBy,
    compact: true,
    rightTitle: input.agentName,
    rightSub: input.agentCode ? `Code: ${input.agentCode}` : undefined,
  });

  const m = pageMargin(true);
  let y = startPdfPage(pdf, chrome, true);

  if (input.shipments.length === 0) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(...MUTED);
    pdf.text("No shipments recorded.", m, y + 8);
    stampAllPages(pdf, chrome);
    return pdf;
  }

  y = drawTableHead(pdf, COLS, m, y, 6);
  input.shipments.forEach((row, idx) => {
    const measured = measureCells(pdf, COLS, shipmentValues(row), 3, 2.8, 1);
    y = drawRow(pdf, chrome, m, y, measured.cells, measured.h, idx);
  });

  stampAllPages(pdf, chrome);
  return pdf;
}
