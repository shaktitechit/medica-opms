"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { pdfTdCompactStyle } from "../orderPdfLayout";
import {
  PdfLetterheadBrand,
  PdfLetterheadFooterCopy,
  PdfLetterheadRule,
  usePdfCompanyLetterhead,
  type PdfCompanyLetterhead,
} from "../pdfCompanyLetterhead";
import {
  agentLabel,
  formatMoney,
  formatPlanDate,
  orderNoOf,
  partyLabel,
  planIdOf,
} from "./transportPlanUtils";
import type { TransportPlanRecord, TransportPlanOrderRecord } from "@/store/api";

export type TransportPlansPdfTemplateProps = {
  companyName?: string;
  logoUrl?: string;
  portalLabel: string;
  downloadedBy: string;
  generatedAt: string;
  plans: TransportPlanRecord[];
  range: { from: string; to: string };
  statusLabelSelected: string;
  agentLabelSelected: string;
};

const PAGE_WIDTH = 1123;
const PAGE_HEIGHT = 794;
const PAGE_PAD_X = 30;
const PAGE_PAD_Y = 28;
const HEADER_BLOCK_H = 168;
const FOOTER_BLOCK_H = 70;
const BODY_MAX_H = PAGE_HEIGHT - PAGE_PAD_Y * 2 - HEADER_BLOCK_H - FOOTER_BLOCK_H;

const H_PLAN_HEADER = 54;
const H_EMPTY = 36;
const H_THEAD = 30;
const H_ROW = 42;

type ContentBlock =
  | { kind: "plan-header"; plan: TransportPlanRecord; height: number }
  | { kind: "empty"; label: string; height: number }
  | { kind: "thead"; height: number }
  | { kind: "row"; line: TransportPlanOrderRecord; height: number };

type PageModel = {
  blocks: ContentBlock[];
};

const pageShellStyle: CSSProperties = {
  width: `${PAGE_WIDTH}px`,
  height: `${PAGE_HEIGHT}px`,
  padding: `${PAGE_PAD_Y}px ${PAGE_PAD_X}px`,
  backgroundColor: "#ffffff",
  color: "#0f172a",
  fontFamily: "Arial, Helvetica, sans-serif",
  fontSize: "10px",
  lineHeight: 1.3,
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const thStyle: CSSProperties = {
  padding: "6px 4px",
  textAlign: "left",
  fontWeight: 700,
  fontSize: "8px",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  color: "#1e3a5f",
  backgroundColor: "#f1f5f9",
  border: "none",
  verticalAlign: "middle",
  lineHeight: 1.2,
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  ...pdfTdCompactStyle,
  border: "none",
  borderBottom: "1px solid #f1f5f9",
  paddingTop: "5px",
  paddingBottom: "5px",
  lineHeight: 1.25,
  verticalAlign: "top",
  fontSize: "9px",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  marginBottom: "12px",
  tableLayout: "fixed",
};

function partyCity(party: unknown): string {
  if (!party || typeof party !== "object") return "—";
  const p = party as {
    shipping_address?: any;
    billing_address?: any;
    address?: any;
  };
  const city =
    p.shipping_address?.city ||
    p.billing_address?.city ||
    p.address?.city ||
    "";
  return String(city).trim() || "—";
}

function shipmentStatusOf(line: TransportPlanOrderRecord): string {
  return String(line.transport?.shipment_status || "").toLowerCase();
}

function getItemsAndQty(line: TransportPlanOrderRecord) {
  const ord = line.order && typeof line.order === "object" ? line.order : null;
  const ordDispatches = ord && Array.isArray((ord as any).dispatches) ? (ord as any).dispatches : [];
  const disp = line.dispatch && typeof line.dispatch === "object" ? line.dispatch : null;

  let itemsStr = "";
  let qty = 0;
  if (ordDispatches.length > 0) {
    const list: string[] = [];
    for (const d of ordDispatches) {
      const items = Array.isArray(d.dispatch_items) ? d.dispatch_items : [];
      items.forEach((item: any) => {
        const name = item.product?.product_name || "Unknown Product";
        list.push(`${name} (${item.dispatched_quantity})`);
        qty += Number(item.dispatched_quantity) || 0;
      });
    }
    itemsStr = list.join(", ");
  } else {
    const items = disp && Array.isArray((disp as any).dispatch_items) ? (disp as any).dispatch_items : [];
    itemsStr = items.map((item: any) => {
      const name = item.product?.product_name || "Unknown Product";
      qty += Number(item.dispatched_quantity) || 0;
      return `${name} (${item.dispatched_quantity})`;
    }).join(", ");
  }
  return { itemsStr, qty };
}

function buildContentBlocks(plans: TransportPlanRecord[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  for (const p of plans) {
    blocks.push({
      kind: "plan-header",
      plan: p,
      height: H_PLAN_HEADER,
    });

    const orders = (p.orders ?? []).filter((o) => o.status !== "cancelled");
    if (orders.length === 0) {
      blocks.push({
        kind: "empty",
        label: "orders attached to this plan",
        height: H_EMPTY,
      });
    } else {
      blocks.push({
        kind: "thead",
        height: H_THEAD,
      });
      for (const line of orders) {
        const { itemsStr } = getItemsAndQty(line);
        // compute dynamic height roughly
        const lineCount = Math.max(Math.ceil((itemsStr || "").length / 28), 1);
        const dynamicHeight = H_ROW + (lineCount - 1) * 11;

        blocks.push({
          kind: "row",
          line,
          height: Math.min(dynamicHeight, 120),
        });
      }
    }
  }

  return blocks;
}

function paginateBlocks(blocks: ContentBlock[]): PageModel[] {
  const pages: PageModel[] = [];
  let current: ContentBlock[] = [];
  let used = 0;

  const flush = () => {
    if (current.length === 0) return;
    pages.push({ blocks: current });
    current = [];
    used = 0;
  };

  for (const block of blocks) {
    let chunk: ContentBlock[] = [block];

    // If starting a page directly with a row, prepend the header.
    if (current.length === 0 && block.kind === "row") {
      chunk = [{ kind: "thead", height: H_THEAD }, block];
    }

    let chunkH = chunk.reduce((sum, b) => sum + b.height, 0);

    if (used + chunkH > BODY_MAX_H && current.length > 0) {
      flush();
      if (block.kind === "row") {
        chunk = [{ kind: "thead", height: H_THEAD }, block];
        chunkH = chunk.reduce((sum, b) => sum + b.height, 0);
      } else {
        chunk = [block];
        chunkH = block.height;
      }
    }

    for (const b of chunk) {
      current.push(b);
      used += b.height;
    }
  }

  flush();
  return pages.length > 0 ? pages : [{ blocks: [] }];
}

function PlanHeaderSection({ plan }: { plan: TransportPlanRecord }) {
  const agent = plan.transport_agent && typeof plan.transport_agent === "object" ? (plan.transport_agent as any) : null;
  const agentName = agentLabel(plan.transport_agent) || "—";
  const agentPhone = String(agent?.phone || agent?.mobile || agent?.contact_person_phone || "");

  const orders = (plan.orders ?? []).filter((o) => o.status !== "cancelled");
  const totalOrdersCount = orders.length;

  const totalPackages = orders.reduce((sum, o) => {
    const t = o.transport as any;
    const pkgs = t?.packed_boxes != null || t?.open_boxes != null
      ? Number(t?.packed_boxes || 0) + Number(t?.open_boxes || 0)
      : o.packages ?? 0;
    return sum + Number(pkgs || 0);
  }, 0);

  const totalWeight = orders.reduce((sum, o) => {
    const t = o.transport as any;
    const wt = t?.weight ?? o.weight ?? 0;
    return sum + Number(wt || 0);
  }, 0);

  const totalAmount = orders.reduce((sum, o) => {
    const ord = o.order && typeof o.order === "object" ? o.order : null;
    return sum + Number(ord?.grand_total || 0);
  }, 0);

  const driverNames = Array.from(new Set(orders.map((o) => {
    const t = o.transport as any;
    return String(t?.driver_name || (o as any).driver_name || "");
  }).filter(Boolean))).join(", ") || "Not assigned";

  const vehicleNos = Array.from(new Set(orders.map((o) => {
    const t = o.transport as any;
    return String(t?.vehicle_number || t?.vehicle_no || (o as any).vehicle_number || (o as any).vehicle_no || "");
  }).filter(Boolean))).join(", ") || "Not assigned";

  return (
    <div
      style={{
        marginTop: "12px",
        marginBottom: "8px",
        padding: "8px 10px",
        backgroundColor: "#f8fafc",
        borderLeft: "3.5px solid #1e3a5f",
        borderRadius: "4px",
      }}
    >
      {/* Row 1: Plan Date & Agent info */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
        <div>
          <span style={{ fontWeight: 700, color: "#1e3a5f", fontSize: "11px" }}>
            {formatPlanDate(plan.plan_date)}
          </span>
          <span style={{ marginLeft: "14px", color: "#475569" }}>
            Agent: <strong>{agentName}</strong>
          </span>
          {agentPhone ? (
            <span style={{ marginLeft: "10px", color: "#64748b" }}>
              Contact: ({agentPhone})
            </span>
          ) : null}
          <span style={{ marginLeft: "14px", color: "#64748b" }}>
            Vehicle: <strong>{vehicleNos}</strong>
          </span>
          <span style={{ marginLeft: "14px", color: "#64748b" }}>
            Driver: <strong>{driverNames}</strong>
          </span>
        </div>
        <div style={{ textTransform: "uppercase", fontSize: "9px", fontWeight: 700, color: plan.status === "completed" ? "#16a34a" : "#2563eb" }}>
          {plan.status || "Planned"}
        </div>
      </div>

      {/* Row 2: Stats summary */}
      <div style={{ fontSize: "10px", color: "#334155", display: "flex", gap: "10px", alignItems: "center" }}>
        <span><strong>{totalOrdersCount}</strong> orders</span>
        <span style={{ color: "#cbd5e1" }}>·</span>
        <span><strong>{totalPackages}</strong> pkg</span>
        <span style={{ color: "#cbd5e1" }}>·</span>
        <span><strong>{totalWeight}</strong> kg</span>
        <span style={{ color: "#cbd5e1" }}>·</span>
        <span style={{ fontSize: "11px", fontWeight: 700, color: "#0e7490" }}>
          {formatMoney(totalAmount)}
        </span>
        {plan.remarks ? (
          <>
            <span style={{ color: "#cbd5e1" }}>·</span>
            <span style={{ color: "#64748b", fontStyle: "italic" }}>
              Remarks: {plan.remarks}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

function EmptySectionNote({ label }: { label: string }) {
  return (
    <p
      style={{
        margin: "0 0 10px",
        padding: "6px 10px",
        backgroundColor: "#fafafa",
        border: "1px dashed #e2e8f0",
        borderRadius: "4px",
        color: "#94a3b8",
        fontSize: "9px",
      }}
    >
      No {label} at the time of download.
    </p>
  );
}

function TableHead() {
  return (
    <thead>
      <tr>
        <th style={{ ...thStyle, width: "7%" }}>Order</th>
        <th style={{ ...thStyle, width: "11%" }}>Party</th>
        <th style={{ ...thStyle, width: "8%" }}>City</th>
        <th style={{ ...thStyle, width: "9%" }}>Dispatch</th>
        <th style={{ ...thStyle, width: "8%" }}>Invoice</th>
        <th style={{ ...thStyle, width: "7%" }}>LR No</th>
        <th style={{ ...thStyle, width: "7%" }}>Pkg/Wt</th>
        <th style={{ ...thStyle, width: "14%" }}>Items</th>
        <th style={{ ...thStyle, width: "4%", textAlign: "right" }}>Qty</th>
        <th style={{ ...thStyle, width: "8%", textAlign: "right" }}>Total</th>
        <th style={{ ...thStyle, width: "6%", textAlign: "center" }}>Status</th>
        <th style={{ ...thStyle, width: "6%", textAlign: "center" }}>Shipment</th>
        <th style={{ ...thStyle, width: "8%", textAlign: "center" }}>Delivered At</th>
        <th style={{ ...thStyle, width: "7%", textAlign: "center" }}>Received By</th>
      </tr>
    </thead>
  );
}

function PageHeader({
  letterhead,
  range,
  statusLabelSelected,
  agentLabelSelected,
}: {
  letterhead: PdfCompanyLetterhead;
  range: { from: string; to: string };
  statusLabelSelected: string;
  agentLabelSelected: string;
}) {
  return (
    <header style={{ flexShrink: 0, marginBottom: "8px" }}>
      <div style={{ marginBottom: "6px" }}>
        <PdfLetterheadBrand letterhead={letterhead} compact />
      </div>
      <div style={{ marginBottom: "8px" }}>
        <PdfLetterheadRule compact />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1
          style={{
            margin: 0,
            fontSize: "13px",
            fontWeight: 700,
            color: "#0f172a",
          }}
        >
          Transport Plans Summary Report
        </h1>
        <div style={{ fontSize: "8px", color: "#64748b", textAlign: "right" }}>
          Range: {range.from} to {range.to} | Status: {statusLabelSelected} | Agent: {agentLabelSelected}
        </div>
      </div>
    </header>
  );
}

function PageFooter({
  letterhead,
  portalLabel,
  downloadedBy,
  generatedAt,
  pageNo,
  pageCount,
}: {
  letterhead: PdfCompanyLetterhead;
  portalLabel: string;
  downloadedBy: string;
  generatedAt: string;
  pageNo: number;
  pageCount: number;
}) {
  return (
    <footer
      style={{
        flexShrink: 0,
        marginTop: "auto",
        paddingTop: "6px",
        borderTop: "1px solid #e2e8f0",
        fontSize: "8px",
        color: "#64748b",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          alignItems: "flex-end",
        }}
      >
        <PdfLetterheadFooterCopy letterhead={letterhead} compact />
        <div style={{ textAlign: "right", flexShrink: 0, fontSize: "7.5px", color: "#94a3b8" }}>
          <div>Portal: {portalLabel}</div>
          <div>Downloaded by: {downloadedBy}</div>
          <div>{generatedAt}</div>
          <div>
            Page {pageNo} of {pageCount}
          </div>
        </div>
      </div>
    </footer>
  );
}

function renderTableChunk(
  blocks: ContentBlock[],
  start: number,
): { node: ReactNode; end: number } {
  const head = blocks[start];
  if (!head || head.kind !== "thead") {
    return { node: null, end: start };
  }

  const rows: ReactNode[] = [];
  let i = start + 1;
  while (i < blocks.length) {
    const b = blocks[i]!;
    if (b.kind === "row") {
      const line = b.line;
      const ord = line.order && typeof line.order === "object" ? line.order : null;
      const ordDispatches = ord && Array.isArray((ord as any).dispatches) ? (ord as any).dispatches : [];
      const disp = line.dispatch && typeof line.dispatch === "object" ? line.dispatch : null;
      const transport = line.transport || null;
      const shipmentStatus = shipmentStatusOf(line);

      const dispatchNo = ordDispatches.length > 0
        ? ordDispatches.map((d: any) => d.dispatch_no).filter(Boolean).join(", ")
        : (disp?.dispatch_no || "—");
      const invoice = ordDispatches.length > 0
        ? ordDispatches.map((d: any) => d.bill_number).filter(Boolean).join(", ")
        : (disp?.bill_number || "—");
      const lr = transport?.lr_number || line.lr_number || "—";
      const pkgs =
        transport?.packed_boxes != null || transport?.open_boxes != null
          ? Number(transport?.packed_boxes || 0) + Number(transport?.open_boxes || 0)
          : line.packages ?? "—";
      const wt = transport?.weight ?? line.weight ?? "—";
      const lineRecord = line as unknown as Record<string, unknown>;
      const deliveredAt = lineRecord.delivered_at ? formatPlanDate(lineRecord.delivered_at) : "—";
      const receivedBy = String(lineRecord.received_by || "—");

      const isDelivered = deliveredAt !== "—" || shipmentStatus === "delivered";
      const isDispatched = !isDelivered && ["dispatched", "in_transit", "out_for_delivery", "picked_up"].includes(shipmentStatus);
      const statusVal = line.status === "cancelled" ? "cancelled" : isDelivered ? "delivered" : isDispatched ? "dispatched" : (line.status || "pending");

      const { itemsStr, qty } = getItemsAndQty(line);

      rows.push(
        <tr key={`row-${planIdOf(line) || i}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
          <td style={{ ...tdStyle, fontWeight: 600 }}>{orderNoOf(line.order)}</td>
          <td style={tdStyle}>{partyLabel(line.party || ord?.party)}</td>
          <td style={tdStyle}>{partyCity(line.party || ord?.party)}</td>
          <td style={{ ...tdStyle, fontFamily: "monospace" }}>{dispatchNo}</td>
          <td style={{ ...tdStyle, fontFamily: "monospace" }}>{invoice}</td>
          <td style={{ ...tdStyle, fontFamily: "monospace" }}>{lr}</td>
          <td style={tdStyle}>{pkgs} pkg / {wt} kg</td>
          <td style={{ ...tdStyle, whiteSpace: "normal", wordBreak: "break-word" }}>{itemsStr || "—"}</td>
          <td style={{ ...tdStyle, textAlign: "right" }}>{qty || "—"}</td>
          <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>
            {ord?.grand_total != null ? formatMoney(Number(ord.grand_total)) : "—"}
          </td>
          <td style={{ ...tdStyle, textAlign: "center", textTransform: "capitalize" }}>
            {statusVal}
          </td>
          <td style={{ ...tdStyle, textAlign: "center" }}>
            {transport ? (
              <span style={{ fontSize: "8px", fontWeight: 600, textTransform: "capitalize" }}>
                {(shipmentStatus || "created").replaceAll("_", " ")}
              </span>
            ) : (
              "—"
            )}
          </td>
          <td style={{ ...tdStyle, textAlign: "center" }}>{deliveredAt}</td>
          <td style={{ ...tdStyle, textAlign: "center" }}>{receivedBy}</td>
        </tr>,
      );
      i += 1;
      continue;
    }
    break;
  }

  return {
    end: i,
    node: (
      <table style={tableStyle}>
        <TableHead />
        <tbody>{rows}</tbody>
      </table>
    ),
  };
}

function PageBody({ blocks }: { blocks: ContentBlock[] }) {
  const nodes: ReactNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i]!;
    if (block.kind === "plan-header") {
      nodes.push(<PlanHeaderSection key={`plan-h-${i}`} plan={block.plan} />);
      i += 1;
      continue;
    }
    if (block.kind === "empty") {
      nodes.push(<EmptySectionNote key={`empty-${i}`} label={block.label} />);
      i += 1;
      continue;
    }
    if (block.kind === "thead") {
      const chunk = renderTableChunk(blocks, i);
      nodes.push(<div key={`tbl-${i}`}>{chunk.node}</div>);
      i = chunk.end;
      continue;
    }
    i += 1;
  }

  return (
    <div style={{ flex: "1 1 auto", minHeight: 0, overflow: "hidden" }}>
      {nodes}
    </div>
  );
}

export function TransportPlansPdfTemplate({
  portalLabel,
  downloadedBy,
  generatedAt,
  plans,
  range,
  statusLabelSelected,
  agentLabelSelected,
}: TransportPlansPdfTemplateProps) {
  const letterhead = usePdfCompanyLetterhead();
  const pages = useMemo(() => {
    const blocks = buildContentBlocks(plans);
    return paginateBlocks(blocks);
  }, [plans]);

  return (
    <div id="transport-plans-pdf-root">
      {pages.map((page, idx) => (
        <div
          key={`pdf-page-${idx}`}
          data-pdf-page
          style={{
            ...pageShellStyle,
            marginBottom: idx < pages.length - 1 ? "12px" : 0,
          }}
        >
          <PageHeader
            letterhead={letterhead}
            range={range}
            statusLabelSelected={statusLabelSelected}
            agentLabelSelected={agentLabelSelected}
          />
          <PageBody blocks={page.blocks} />
          <PageFooter
            letterhead={letterhead}
            portalLabel={portalLabel}
            downloadedBy={downloadedBy}
            generatedAt={generatedAt}
            pageNo={idx + 1}
            pageCount={pages.length}
          />
        </div>
      ))}
    </div>
  );
}

export default TransportPlansPdfTemplate;
