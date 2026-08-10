"use client";

import { useMemo, type CSSProperties } from "react";
import type { WorkPlanExpenseRecord } from "@/store/api";

export type ExpensesPdfTemplateProps = {
  companyName: string;
  logoUrl: string;
  portalLabel: string;
  downloadedBy: string;
  generatedAt: string;
  periodFrom: string;
  periodTo: string;
  salesUserLabel: string;
  expenses: WorkPlanExpenseRecord[];
  totalAmount: number;
};

const PAGE_WIDTH = 1123;
const PAGE_HEIGHT = 794;
const PAGE_PAD_X = 30;
const PAGE_PAD_Y = 24;
const HEADER_BLOCK_H = 110;
const FOOTER_BLOCK_H = 44;
const BODY_MAX_H = PAGE_HEIGHT - PAGE_PAD_Y * 2 - HEADER_BLOCK_H - FOOTER_BLOCK_H;

const H_THEAD = 28;
const H_ROW = 38;

type ContentBlock =
  | { kind: "thead"; height: number }
  | { kind: "row"; exp: WorkPlanExpenseRecord; height: number };

type PageModel = { blocks: ContentBlock[] };

/* ─── Shared styles matching TransportAgentPdfTemplate ──────────────────── */
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
  tableLayout: "fixed",
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
  wordBreak: "break-word",
  overflowWrap: "break-word",
  whiteSpace: "normal",
  overflow: "visible",
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function fmtDate(d: unknown): string {
  if (!d) return "—";
  const dt = new Date(String(d));
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

function fmtMoney(n: unknown): string {
  const v = Number(n) || 0;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);
}

function planRef(exp: WorkPlanExpenseRecord) {
  const wp = exp.work_plan;
  if (!wp || typeof wp === "string") {
    return { plan_date: undefined as unknown, sales_user: undefined as unknown, location: "" };
  }
  return { plan_date: (wp as any).plan_date, sales_user: (wp as any).sales_user, location: (wp as any).location || "" };
}

function salesName(user: unknown): string {
  if (!user) return "—";
  if (typeof user === "string") return user;
  const u = user as Record<string, unknown>;
  return String(u.name || u.email || "—");
}

function visitLabel(exp: WorkPlanExpenseRecord): string {
  const visit = exp.work_plan_visit;
  if (!visit) return "Plan-level";
  if (typeof visit === "string") return "Visit";
  const v = visit as any;
  const party = (typeof v.party === "object" && v.party?.party_name) || v.party_name || "";
  const seq = v.sequence != null ? `#${v.sequence}` : "Visit";
  return party ? `${seq} — ${party}` : seq;
}

function statusLabel(status: string | undefined): string {
  return String(status || "pending").replace(/_/g, " ").toUpperCase();
}

/* ─── Column definitions (total width ≈ 1063 usable) ───────────────────── */
const COLS = [
  { label: "Expense Date", w: 65 },
  { label: "Plan Date",    w: 65 },
  { label: "Sales Exec",   w: 90 },
  { label: "Location",     w: 75 },
  { label: "Visit",        w: 95 },
  { label: "Category",     w: 80 },
  { label: "Sub-Category", w: 80 },
  { label: "Reading",      w: 65 },
  { label: "Amount",       w: 60, right: true },
  { label: "Payment",      w: 60 },
  { label: "Status",       w: 60 },
  { label: "Approved By",  w: 85 },
  { label: "Vendor",       w: 80 },
  { label: "Bill #",       w: 58 },
  { label: "Description",  w: 45 },
];

/* ─── Component ─────────────────────────────────────────────────────────── */
export default function ExpensesPdfTemplate({
  companyName,
  logoUrl,
  portalLabel,
  downloadedBy,
  generatedAt,
  periodFrom,
  periodTo,
  salesUserLabel: salesUserLabelProp,
  expenses,
  totalAmount,
}: ExpensesPdfTemplateProps) {
  const pages: PageModel[] = useMemo(() => {
    if (expenses.length === 0) return [{ blocks: [] }];

    const all: ContentBlock[] = [
      { kind: "thead", height: H_THEAD },
      ...expenses.map((exp) => ({ kind: "row" as const, exp, height: H_ROW })),
    ];

    const result: PageModel[] = [];
    let cur: ContentBlock[] = [];
    let h = 0;

    const flush = () => {
      if (cur.length) result.push({ blocks: cur });
      cur = [];
      h = 0;
    };

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
  }, [expenses]);

  return (
    <div
      id="expenses-pdf-root"
      style={{ display: "flex", flexDirection: "column", backgroundColor: "#94a3b8", gap: "16px" }}
    >
      {pages.map((page, pageIdx) => (
        <div key={pageIdx} data-pdf-page style={pageShellStyle}>
          {/* ── Header ── */}
          <header
            style={{
              flexShrink: 0,
              height: `${HEADER_BLOCK_H}px`,
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              {/* Left: logo + title */}
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                {logoUrl && (
                  <img
                    src={logoUrl}
                    alt="Logo"
                    style={{ height: "32px", width: "auto", objectFit: "contain" }}
                  />
                )}
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", lineHeight: 1.1 }}>
                    {companyName}
                  </div>
                  <div
                    style={{
                      fontSize: "7.5px",
                      color: "#64748b",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginTop: "2px",
                    }}
                  >
                    Expenses Report
                  </div>
                </div>
              </div>

              {/* Right: metadata */}
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#0f172a" }}>
                  {salesUserLabelProp}
                </div>
                <div style={{ fontSize: "8px", color: "#475569", marginTop: "2px" }}>
                  Total Amount: {fmtMoney(totalAmount)}
                </div>
              </div>
            </div>

            {/* Meta bar */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "7.5px",
                color: "#475569",
                borderTop: "1px solid #cbd5e1",
                borderBottom: "1px solid #cbd5e1",
                padding: "4px 2px",
                marginTop: "4px",
              }}
            >
              <span>
                <strong>Period:</strong> {periodFrom} to {periodTo}
              </span>
              <span>
                <strong>Generated:</strong> {generatedAt}
              </span>
              <span>
                <strong>Page:</strong> {pageIdx + 1} / {pages.length}
              </span>
            </div>
          </header>

          {/* ── Table body ── */}
          <main style={{ flexGrow: 1, minHeight: 0, overflow: "hidden" }}>
            {page.blocks.length === 0 ? (
              <div style={{ padding: "24px 0", textAlign: "center", color: "#64748b", fontSize: "10px" }}>
                No expenses recorded.
              </div>
            ) : (
              <table style={tableStyle}>
                <colgroup>
                  {COLS.map((c, i) => (
                    <col key={i} style={{ width: `${c.w}px` }} />
                  ))}
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
                    .filter((b): b is { kind: "row"; exp: WorkPlanExpenseRecord; height: number } => b.kind === "row")
                    .map((b, rowIdx) => {
                      const exp = b.exp;
                      const plan = planRef(exp);
                      const isPrivateBike = exp.sub_category === "Private Bike";
                      const bg = rowIdx % 2 === 0 ? "#ffffff" : "#f8fafc";
                      const meterReading = isPrivateBike
                        ? [exp.start_reading ?? "—", exp.closing_reading ?? "—"].join(" → ")
                        : "—";
                      const approvedBy =
                        exp.status === "approved" || exp.status === "rejected"
                          ? salesName(exp.approved_by)
                          : "—";

                      return (
                        <tr key={String((exp as any)._id || rowIdx)} style={{ backgroundColor: bg }}>
                          <td style={{ ...tdBase, fontFamily: "monospace", fontSize: "7.5px" }}>{fmtDate(exp.expense_date)}</td>
                          <td style={{ ...tdBase, fontFamily: "monospace", fontSize: "7.5px" }}>{fmtDate(plan.plan_date)}</td>
                          <td style={{ ...tdBase, fontSize: "7.5px" }}>{salesName(plan.sales_user)}</td>
                          <td style={{ ...tdBase, fontSize: "7.5px" }}>{plan.location || "—"}</td>
                          <td style={{ ...tdBase, fontSize: "7.5px" }}>{visitLabel(exp)}</td>
                          <td style={{ ...tdBase, fontSize: "7.5px" }}>{exp.category || "—"}</td>
                          <td style={{ ...tdBase, fontSize: "7.5px" }}>{exp.sub_category || "—"}</td>
                          <td style={{ ...tdBase, fontSize: "7.5px", fontFamily: "monospace" }}>{meterReading}</td>
                          <td style={{ ...tdBase, textAlign: "right", fontWeight: 600, fontFamily: "monospace" }}>
                            {fmtMoney(exp.amount)}
                          </td>
                          <td style={{ ...tdBase, fontSize: "7.5px" }}>{exp.payment_mode || "—"}</td>
                          <td style={{ ...tdBase, fontSize: "7px", fontWeight: 500, color: "#334155" }}>
                            {statusLabel(exp.status)}
                          </td>
                          <td style={{ ...tdBase, fontSize: "7.5px" }}>{approvedBy}</td>
                          <td style={{ ...tdBase, fontSize: "7.5px" }}>{exp.vendor_name || "—"}</td>
                          <td style={{ ...tdBase, fontFamily: "monospace", fontSize: "7.5px" }}>{exp.bill_number || "—"}</td>
                          <td style={{ ...tdBase, fontSize: "7px", lineHeight: "1.3" }}>{exp.description || "—"}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
          </main>

          {/* ── Footer ── */}
          <footer
            style={{
              flexShrink: 0,
              height: `${FOOTER_BLOCK_H}px`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "1px solid #e2e8f0",
              paddingTop: "6px",
              fontSize: "7.5px",
              color: "#64748b",
            }}
          >
            <span>
              Portal: {portalLabel} &nbsp;|&nbsp; Downloaded by: {downloadedBy}
            </span>
            <span>
              Page {pageIdx + 1} of {pages.length}
            </span>
            <span>Generated electronically — no signature required.</span>
          </footer>
        </div>
      ))}
    </div>
  );
}
