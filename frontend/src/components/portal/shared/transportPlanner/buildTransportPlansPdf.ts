/**
 * @fileoverview Native vector jsPDF builder for Transport Plans summary reports (landscape).
 * @module components/portal/shared/buildTransportPlansPdf
 */

import type { TransportPlanOrderRecord, TransportPlanRecord } from "@/store/api";
import type { PdfCompanyLetterhead } from "../pdfCompanyLetterhead";
import {
  agentLabel,
  formatMoney,
  formatPlanDate,
  orderNoOf,
  partyLabel,
} from "./transportPlanUtils";
import {
  DARK,
  MUTED,
  NAVY,
  contentWidth,
  drawTableHead,
  drawTableRow,
  ensureSpace,
  measureCells,
  pageMargin,
  preparePdfChrome,
  stampAllPages,
  startPdfPage,
  wrapLines,
  type JsPDF,
  type PdfChromeOpts,
  type PdfCol,
} from "../pdfVectorChrome";

export type BuildTransportPlansPdfInput = {
  letterhead: PdfCompanyLetterhead;
  portalLabel: string;
  downloadedBy: string;
  generatedAt: string;
  plans: TransportPlanRecord[];
  range: { from: string; to: string };
  statusLabelSelected: string;
  agentLabelSelected: string;
};

const COLS: PdfCol[] = [
  { label: "Order", w: 18 },
  { label: "Party", w: 26 },
  { label: "City", w: 16 },
  { label: "Dispatch", w: 20 },
  { label: "Invoice", w: 18 },
  { label: "LR No", w: 16 },
  { label: "Pkg/Wt", w: 18 },
  { label: "Items", w: 42 },
  { label: "Qty", w: 10, align: "right" },
  { label: "Total", w: 18, align: "right" },
  { label: "Status", w: 18, align: "center" },
  { label: "Shipment", w: 18, align: "center" },
  { label: "Delivered", w: 18, align: "center" },
  { label: "Received", w: 16, align: "center" },
];

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function partyCity(party: unknown): string {
  if (!party || typeof party !== "object") return "—";
  const p = party as {
    shipping_address?: { city?: string };
    billing_address?: { city?: string };
    address?: { city?: string };
  };
  return String(p.shipping_address?.city || p.billing_address?.city || p.address?.city || "").trim() || "—";
}

function shipmentStatusOf(line: TransportPlanOrderRecord): string {
  return String(line.transport?.shipment_status || "").toLowerCase();
}

function getItemsAndQty(line: TransportPlanOrderRecord): { itemsStr: string; qty: number } {
  const ord = line.order && typeof line.order === "object" ? asRecord(line.order) : {};
  const ordDispatches = Array.isArray(ord.dispatches) ? (ord.dispatches as unknown[]) : [];
  const disp = line.dispatch && typeof line.dispatch === "object" ? asRecord(line.dispatch) : {};
  let itemsStr = "";
  let qty = 0;
  if (ordDispatches.length > 0) {
    const list: string[] = [];
    for (const d of ordDispatches) {
      const items = Array.isArray(asRecord(d).dispatch_items) ? (asRecord(d).dispatch_items as unknown[]) : [];
      items.forEach((item) => {
        const it = asRecord(item);
        const prod = asRecord(it.product);
        const name = String(prod.product_name || "Unknown Product");
        list.push(`${name} (${it.dispatched_quantity})`);
        qty += Number(it.dispatched_quantity) || 0;
      });
    }
    itemsStr = list.join(", ");
  } else {
    const items = Array.isArray(disp.dispatch_items) ? (disp.dispatch_items as unknown[]) : [];
    itemsStr = items
      .map((item) => {
        const it = asRecord(item);
        const prod = asRecord(it.product);
        const name = String(prod.product_name || "Unknown Product");
        qty += Number(it.dispatched_quantity) || 0;
        return `${name} (${it.dispatched_quantity})`;
      })
      .join(", ");
  }
  return { itemsStr, qty };
}

function planHeaderText(plan: TransportPlanRecord): { line1: string; line2: string; status: string } {
  const agent = plan.transport_agent && typeof plan.transport_agent === "object" ? asRecord(plan.transport_agent) : {};
  const agentName = agentLabel(plan.transport_agent) || "—";
  const agentPhone = String(agent.phone || agent.mobile || agent.contact_person_phone || "");
  const orders = (plan.orders ?? []).filter((o) => o.status !== "cancelled");
  const totalPackages = orders.reduce((sum, o) => {
    const t = asRecord(o.transport);
    const pkgs =
      t.packed_boxes != null || t.open_boxes != null
        ? Number(t.packed_boxes || 0) + Number(t.open_boxes || 0)
        : o.packages ?? 0;
    return sum + Number(pkgs || 0);
  }, 0);
  const totalWeight = orders.reduce((sum, o) => {
    const t = asRecord(o.transport);
    return sum + Number(t.weight ?? o.weight ?? 0);
  }, 0);
  const totalAmount = orders.reduce((sum, o) => {
    const ord = o.order && typeof o.order === "object" ? asRecord(o.order) : {};
    return sum + Number(ord.grand_total || 0);
  }, 0);
  const driverNames =
    Array.from(
      new Set(
        orders
          .map((o) => String(asRecord(o.transport).driver_name || asRecord(o).driver_name || ""))
          .filter(Boolean),
      ),
    ).join(", ") || "Not assigned";
  const vehicleNos =
    Array.from(
      new Set(
        orders
          .map((o) => {
            const t = asRecord(o.transport);
            return String(t.vehicle_number || t.vehicle_no || asRecord(o).vehicle_number || asRecord(o).vehicle_no || "");
          })
          .filter(Boolean),
      ),
    ).join(", ") || "Not assigned";

  const phoneBit = agentPhone ? `  ·  Contact: (${agentPhone})` : "";
  return {
    line1: `${formatPlanDate(plan.plan_date)}    Agent: ${agentName}${phoneBit}    Vehicle: ${vehicleNos}    Driver: ${driverNames}`,
    line2: `${orders.length} orders  ·  ${totalPackages} pkg  ·  ${totalWeight} kg  ·  ${formatMoney(totalAmount)}${plan.remarks ? `  ·  Remarks: ${plan.remarks}` : ""}`,
    status: String(plan.status || "Planned"),
  };
}

function orderValues(line: TransportPlanOrderRecord): string[] {
  const ord = line.order && typeof line.order === "object" ? asRecord(line.order) : {};
  const ordDispatches = Array.isArray(ord.dispatches) ? (ord.dispatches as unknown[]) : [];
  const disp = line.dispatch && typeof line.dispatch === "object" ? asRecord(line.dispatch) : {};
  const transport = line.transport || null;
  const shipmentStatus = shipmentStatusOf(line);
  const dispatchNo =
    ordDispatches.length > 0
      ? ordDispatches.map((d) => asRecord(d).dispatch_no).filter(Boolean).join(", ")
      : String(disp.dispatch_no || "—");
  const invoice =
    ordDispatches.length > 0
      ? ordDispatches.map((d) => asRecord(d).bill_number).filter(Boolean).join(", ")
      : String(disp.bill_number || "—");
  const lr = String(transport?.lr_number || line.lr_number || "—");
  const pkgs =
    transport?.packed_boxes != null || transport?.open_boxes != null
      ? Number(transport?.packed_boxes || 0) + Number(transport?.open_boxes || 0)
      : line.packages ?? "—";
  const wt = transport?.weight ?? line.weight ?? "—";
  const lineRecord = line as unknown as Record<string, unknown>;
  const deliveredAt = lineRecord.delivered_at ? formatPlanDate(lineRecord.delivered_at) : "—";
  const receivedBy = String(lineRecord.received_by || "—");
  const isDelivered = deliveredAt !== "—" || shipmentStatus === "delivered";
  const isDispatched =
    !isDelivered && ["dispatched", "in_transit", "out_for_delivery", "picked_up"].includes(shipmentStatus);
  const statusVal =
    line.status === "cancelled"
      ? "cancelled"
      : isDelivered
        ? "delivered"
        : isDispatched
          ? "dispatched"
          : line.status || "pending";
  const { itemsStr, qty } = getItemsAndQty(line);
  return [
    orderNoOf(line.order),
    partyLabel(line.party || (ord.party as never)),
    partyCity(line.party || ord.party),
    String(dispatchNo || "—"),
    String(invoice || "—"),
    lr,
    `${pkgs} pkg / ${wt} kg`,
    itemsStr || "—",
    qty ? String(qty) : "—",
    ord.grand_total != null ? formatMoney(Number(ord.grand_total)) : "—",
    String(statusVal),
    transport ? (shipmentStatus || "created").replaceAll("_", " ") : "—",
    deliveredAt,
    receivedBy,
  ];
}

function drawPlanHeader(
  pdf: JsPDF,
  chrome: PdfChromeOpts,
  x: number,
  y: number,
  w: number,
  plan: TransportPlanRecord,
): number {
  const info = planHeaderText(plan);
  const line1 = wrapLines(pdf, info.line1, w - 28, 2);
  const line2 = wrapLines(pdf, info.line2, w - 8, 2);
  const h = 6 + line1.length * 3.2 + line2.length * 3.1;
  y = ensureSpace(pdf, chrome, y, h + 2);
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(...NAVY);
  pdf.setLineWidth(0.7);
  pdf.rect(x, y, w, h, "F");
  pdf.line(x, y, x, y + h);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...NAVY);
  let ly = y + 4.2;
  for (const line of line1) {
    pdf.text(line, x + 3, ly);
    ly += 3.2;
  }
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(...DARK);
  for (const line of line2) {
    pdf.text(line, x + 3, ly);
    ly += 3.1;
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.setTextColor(...NAVY);
  pdf.text(info.status.toUpperCase(), x + w - 3, y + 4.5, { align: "right" });
  return y + h + 2;
}

function drawEmpty(
  pdf: JsPDF,
  chrome: PdfChromeOpts,
  x: number,
  y: number,
  w: number,
  label: string,
): number {
  y = ensureSpace(pdf, chrome, y, 8);
  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(7);
  pdf.setTextColor(...MUTED);
  pdf.text(`No ${label} at the time of download.`, x + 2, y + 4);
  void w;
  return y + 8;
}

function drawOrderRows(
  pdf: JsPDF,
  chrome: PdfChromeOpts,
  x: number,
  y: number,
  orders: TransportPlanOrderRecord[],
): number {
  y = ensureSpace(pdf, chrome, y, 10);
  y = drawTableHead(pdf, COLS, x, y, 6);
  orders.forEach((line, idx) => {
    const measured = measureCells(pdf, COLS, orderValues(line), 3, 2.8, 1);
    const next = ensureSpace(pdf, chrome, y, measured.h + 1);
    if (next !== y) y = drawTableHead(pdf, COLS, x, next, 6);
    else y = next;
    drawTableRow(pdf, COLS, measured.cells, x, y, measured.h, idx % 2 === 1, 2.8);
    y += measured.h;
  });
  return y + 3;
}

export async function buildTransportPlansPdf(input: BuildTransportPlansPdfInput): Promise<JsPDF> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const chrome = await preparePdfChrome(input.letterhead, {
    title: "Transport Plans Summary Report",
    subtitle: `Range: ${input.range.from} to ${input.range.to}  |  Status: ${input.statusLabelSelected}  |  Agent: ${input.agentLabelSelected}`,
    generatedAt: input.generatedAt,
    portalLabel: input.portalLabel,
    downloadedBy: input.downloadedBy,
    compact: true,
  });

  const m = pageMargin(true);
  const w = contentWidth(pdf, true);
  let y = startPdfPage(pdf, chrome, true);

  if (input.plans.length === 0) {
    y = drawEmpty(pdf, chrome, m, y, w, "transport plans");
    stampAllPages(pdf, chrome);
    return pdf;
  }

  for (const plan of input.plans) {
    y = drawPlanHeader(pdf, chrome, m, y, w, plan);
    const orders = (plan.orders ?? []).filter((o) => o.status !== "cancelled");
    if (orders.length === 0) {
      y = drawEmpty(pdf, chrome, m, y, w, "orders");
    } else {
      y = drawOrderRows(pdf, chrome, m, y, orders);
    }
  }

  stampAllPages(pdf, chrome);
  return pdf;
}
