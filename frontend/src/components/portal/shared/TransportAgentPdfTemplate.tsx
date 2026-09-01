"use client";

import { useMemo, type CSSProperties } from "react";
import {
  PdfLetterheadBrand,
  PdfLetterheadFooterCopy,
  PdfLetterheadRule,
  usePdfCompanyLetterhead,
} from "./pdfCompanyLetterhead";

export type TransportAgentPdfTemplateProps = {
  companyName?: string;
  logoUrl?: string;
  portalLabel: string;
  downloadedBy: string;
  generatedAt: string;
  agentName: string;
  agentCode: string;
  shipments: any[];
  statusLabelSelected: string;
};

const PAGE_WIDTH = 1123;
const PAGE_HEIGHT = 794;
const PAGE_PAD_X = 30;
const PAGE_PAD_Y = 24;
const HEADER_BLOCK_H = 128;
const FOOTER_BLOCK_H = 58;
const BODY_MAX_H = PAGE_HEIGHT - PAGE_PAD_Y * 2 - HEADER_BLOCK_H - FOOTER_BLOCK_H;

const H_THEAD = 28;
const H_ROW = 38;

type ContentBlock =
  | { kind: "thead"; height: number }
  | { kind: "row"; tr: any; height: number };

type PageModel = { blocks: ContentBlock[] };

/* ─── Shared styles ─────────────────────────────────────────────────────── */
const pageShellStyle: CSSProperties = {
  width: `${PAGE_WIDTH}px`,
  height: `${PAGE_HEIGHT}px`,
  padding: `${PAGE_PAD_Y}px ${PAGE_PAD_X}px`,
  backgroundColor: "#ffffff",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  position: "relative",
  overflow: "hidden",
  fontFamily: "'Segoe UI', Arial, sans-serif",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",   // ← key: fixed layout lets col widths be honoured
};

const thBase: CSSProperties = {
  padding: "5px 4px",
  backgroundColor: "#f1f5f9",
  borderBottom: "2px solid #94a3b8",
  borderRight: "1px solid #e2e8f0",
  color: "#334155",
  fontWeight: 700,
  textAlign: "left",
  fontSize: "7.5px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
  overflow: "hidden",
};

const tdBase: CSSProperties = {
  padding: "5px 4px",
  borderBottom: "1px solid #e2e8f0",
  borderRight: "1px solid #f1f5f9",
  fontSize: "8px",
  verticalAlign: "top",
  // allow text to wrap so nothing is hidden
  wordBreak: "break-word",
  overflowWrap: "break-word",
  whiteSpace: "normal",
  overflow: "visible",
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function statusLabel(s: string) {
  return String(s || "created").replace(/_/g, " ").toUpperCase();
}

function fmtDate(d: any) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

/* ─── Column definitions (width in px, total ≈ 1063 usable) ─────────────── */
const COLS = [
  { label: "Order #",       w: 56  },
  { label: "Party",         w: 82  },
  { label: "City",          w: 52  },
  { label: "Dispatch #",    w: 64  },
  { label: "Invoice #",     w: 64  },
  { label: "LR #",          w: 56  },
  { label: "Shipment Date", w: 62  },
  { label: "Pkg / Wt",      w: 54  },
  { label: "Items",         w: 150 },
  { label: "Qty",           w: 28, right: true },
  { label: "Total",         w: 54, right: true },
  { label: "Vehicle",       w: 62  },
  { label: "Driver",        w: 62  },
  { label: "Shipment",      w: 60  },
  { label: "Delivered At",  w: 62  },
  { label: "Received By",   w: 59  },
];

/* ─── Component ─────────────────────────────────────────────────────────── */
export default function TransportAgentPdfTemplate({
  portalLabel, downloadedBy, generatedAt,
  agentName, agentCode, shipments, statusLabelSelected,
}: TransportAgentPdfTemplateProps) {
  const letterhead = usePdfCompanyLetterhead();

  const pages: PageModel[] = useMemo(() => {
    if (shipments.length === 0) return [{ blocks: [] }];

    const all: ContentBlock[] = [
      { kind: "thead", height: H_THEAD },
      ...shipments.map((tr) => ({ kind: "row" as const, tr, height: H_ROW })),
    ];

    const result: PageModel[] = [];
    let cur: ContentBlock[] = [];
    let h = 0;

    const flush = () => { if (cur.length) result.push({ blocks: cur }); cur = []; h = 0; };

    for (const block of all) {
      if (h + block.height > BODY_MAX_H) {
        flush();
        cur.push({ kind: "thead", height: H_THEAD });
        h = H_THEAD;
      }
      cur.push(block);
      h += block.height;
    }
    flush();

    return result.length ? result : [{ blocks: [] }];
  }, [shipments]);

  return (
    <div id="transport-agent-pdf-root" style={{ display: "flex", flexDirection: "column", backgroundColor: "#94a3b8", gap: "16px" }}>
      {pages.map((page, pageIdx) => (
        <div key={pageIdx} data-pdf-page style={pageShellStyle}>

          {/* ── Header ── */}
          <header style={{ flexShrink: 0, height: `${HEADER_BLOCK_H}px`, display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <PdfLetterheadBrand letterhead={letterhead} compact />
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#0f172a" }}>{agentName}</div>
                {agentCode && (
                  <div style={{ fontSize: "8px", color: "#475569", marginTop: "2px" }}>Code: {agentCode}</div>
                )}
              </div>
            </div>
            <PdfLetterheadRule compact />

            {/* Meta bar */}
            <div style={{
              display: "flex", justifyContent: "space-between",
              fontSize: "7.5px", color: "#475569",
              borderTop: "1px solid #cbd5e1", borderBottom: "1px solid #cbd5e1",
              padding: "4px 2px", marginTop: "4px",
            }}>
              <span><strong>Transport Agent Shipments</strong></span>
              <span><strong>Status Filter:</strong> {statusLabelSelected}</span>
              <span><strong>Generated:</strong> {generatedAt}</span>
              <span><strong>Page:</strong> {pageIdx + 1} / {pages.length}</span>
            </div>
          </header>

          {/* ── Table body ── */}
          <main style={{ flexGrow: 1, minHeight: 0, overflow: "hidden" }}>
            {page.blocks.length === 0 ? (
              <div style={{ padding: "24px 0", textAlign: "center", color: "#64748b", fontSize: "10px" }}>
                No shipments recorded.
              </div>
            ) : (
              <table style={tableStyle}>
                {/* Fixed-width column hints */}
                <colgroup>
                  {COLS.map((c, i) => <col key={i} style={{ width: `${c.w}px` }} />)}
                </colgroup>

                <thead>
                  {page.blocks.find((b) => b.kind === "thead") && (
                    <tr>
                      {COLS.map((c, i) => (
                        <th key={i} style={{ ...thBase, textAlign: c.right ? "right" : "left" }}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  )}
                </thead>

                <tbody>
                  {page.blocks
                    .filter((b): b is { kind: "row"; tr: any; height: number } => b.kind === "row")
                    .map((b, rowIdx) => {
                      const tr = b.tr;
                      const ord = tr.order && typeof tr.order === "object" ? tr.order : null;
                      const disp = tr.dispatch && typeof tr.dispatch === "object" ? tr.dispatch : null;

                      const orderNo   = ord?.order_no || "—";
                      const partyName = ord?.party?.party_name || ord?.customer?.party_name || "—";
                      const partyCity = ord?.party?.shipping_address?.city || ord?.party?.billing_address?.city || "—";
                      const dispatchNo = tr.dispatch_no || disp?.dispatch_no || "—";
                      const invoice   = tr.bill_number || disp?.bill_number || "—";
                      const lr        = tr.lr_number || "—";
                      const shipDate  = fmtDate(tr.dispatch_date || tr.createdAt || tr.created_at);

                      const pkgs = tr.packed_boxes != null || tr.open_boxes != null
                        ? Number(tr.packed_boxes || 0) + Number(tr.open_boxes || 0)
                        : tr.plan_packages ?? null;
                      const wt = tr.weight != null
                        ? `${tr.weight} ${tr.weight_unit || "Kg"}`
                        : tr.plan_weight ? `${tr.plan_weight} Kg` : "—";
                      const pkgWt = pkgs != null ? `${pkgs} / ${wt}` : wt;

                      const rawItems = Array.isArray(tr.dispatch_items)
                        ? tr.dispatch_items
                        : disp && Array.isArray(disp.dispatch_items) ? disp.dispatch_items : [];

                      const itemsStr = rawItems.map((item: any) => {
                        const prod = item.product && typeof item.product === "object" ? item.product : null;
                        const name = prod?.product_name || prod?.sku || "Item";
                        const qty  = item.dispatched_quantity ?? item.allocated_quantity ?? item.quantity ?? 0;
                        return `${name} (${qty})`;
                      }).join(", ") || "—";

                      const totalQty = rawItems.reduce(
                        (s: number, i: any) => s + Number(i.dispatched_quantity ?? i.allocated_quantity ?? i.quantity ?? 0), 0
                      );
                      const totalAmt = ord?.grand_total != null ? fmtMoney(Number(ord.grand_total)) : "—";

                      const vehicle   = tr.vehicle_number || "—";
                      const driver    = tr.driver_name || "—";
                      const shipSt    = statusLabel(tr.shipment_status ?? tr.status ?? "created");
                      const delivAt   = fmtDate(tr.delivered_at);
                      const recvBy    = String(tr.received_by || "—");

                      const bg = rowIdx % 2 === 0 ? "#ffffff" : "#f8fafc";

                      return (
                        <tr key={`row-${tr._id || rowIdx}`} style={{ backgroundColor: bg }}>
                          <td style={{ ...tdBase, fontWeight: 700, fontFamily: "monospace", fontSize: "7.5px" }}>{orderNo}</td>
                          <td style={{ ...tdBase, fontSize: "7.5px" }}>{partyName}</td>
                          <td style={{ ...tdBase, fontSize: "7.5px" }}>{partyCity}</td>
                          <td style={{ ...tdBase, fontFamily: "monospace", fontSize: "7.5px" }}>{dispatchNo}</td>
                          <td style={{ ...tdBase, fontFamily: "monospace", fontSize: "7.5px" }}>{invoice}</td>
                          <td style={{ ...tdBase, fontFamily: "monospace", fontSize: "7.5px" }}>{lr}</td>
                          <td style={{ ...tdBase, fontFamily: "monospace", fontSize: "7.5px" }}>{shipDate}</td>
                          <td style={{ ...tdBase, fontSize: "7.5px" }}>{pkgWt}</td>
                          <td style={{ ...tdBase, fontSize: "7px", lineHeight: "1.3" }}>{itemsStr}</td>
                          <td style={{ ...tdBase, textAlign: "right", fontFamily: "monospace" }}>{totalQty || "—"}</td>
                          <td style={{ ...tdBase, textAlign: "right", fontWeight: 600 }}>{totalAmt}</td>
                          <td style={{ ...tdBase, fontSize: "7.5px" }}>{vehicle}</td>
                          <td style={{ ...tdBase, fontSize: "7.5px" }}>{driver}</td>
                          <td style={{ ...tdBase, fontSize: "7px", fontWeight: 500, color: "#334155" }}>{shipSt}</td>
                          <td style={{ ...tdBase, fontFamily: "monospace", fontSize: "7.5px" }}>{delivAt}</td>
                          <td style={{ ...tdBase, fontSize: "7.5px" }}>{recvBy}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
          </main>

          {/* ── Footer ── */}
          <footer style={{
            flexShrink: 0, height: `${FOOTER_BLOCK_H}px`,
            display: "flex", justifyContent: "space-between", alignItems: "flex-end",
            borderTop: "1px solid #e2e8f0", paddingTop: "6px", gap: "12px",
            fontSize: "7.5px", color: "#64748b",
          }}>
            <PdfLetterheadFooterCopy letterhead={letterhead} compact />
            <div style={{ textAlign: "right", flexShrink: 0, color: "#94a3b8" }}>
              <div>Portal: {portalLabel} | Downloaded by: {downloadedBy}</div>
              <div>Page {pageIdx + 1} of {pages.length}</div>
            </div>
          </footer>

        </div>
      ))}
    </div>
  );
}
