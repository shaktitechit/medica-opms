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

const PAGE_W = 1123;
const PAGE_H = 794;
const PAD_X = 28;
const PAD_Y = 20;
const HEADER_H = 92;
const FOOTER_H = 36;
const BODY_H = PAGE_H - PAD_Y * 2 - HEADER_H - FOOTER_H;

const H_THEAD = 22;
const H_ROW = 32;

type ContentBlock =
  | { kind: "thead"; height: number }
  | { kind: "row"; exp: WorkPlanExpenseRecord; height: number };

type PageModel = { blocks: ContentBlock[] };

const pageShell: CSSProperties = {
  width: `${PAGE_W}px`,
  height: `${PAGE_H}px`,
  padding: `${PAD_Y}px ${PAD_X}px`,
  backgroundColor: "#ffffff",
  color: "#0f172a",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  fontFamily: "Arial, Helvetica, sans-serif",
};

const clamp2: CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  wordBreak: "break-word",
  lineHeight: 1.25,
};

const th: CSSProperties = {
  padding: "4px 5px",
  backgroundColor: "#f1f5f9",
  color: "#1e3a5f",
  fontWeight: 700,
  fontSize: "7.5px",
  textAlign: "left",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  whiteSpace: "nowrap",
  borderBottom: "1.5px solid #1e3a5f",
  verticalAlign: "middle",
};

const td: CSSProperties = {
  padding: "4px 5px",
  fontSize: "8px",
  verticalAlign: "top",
  borderBottom: "1px solid #e2e8f0",
};

function fmtDate(d: unknown): string {
  if (!d) return "—";
  const dt = new Date(String(d));
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtMoney(n: unknown): string {
  const v = Number(n) || 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(v);
}

function planRef(exp: WorkPlanExpenseRecord) {
  const wp = exp.work_plan;
  if (!wp || typeof wp === "string") {
    return { plan_date: undefined as unknown, sales_user: undefined as unknown, location: "" };
  }
  return {
    plan_date: (wp as { plan_date?: unknown }).plan_date,
    sales_user: (wp as { sales_user?: unknown }).sales_user,
    location: (wp as { location?: string }).location || "",
  };
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
  const party =
    (typeof visit.party === "object" && visit.party?.party_name) || visit.party_name || "";
  const seq = visit.sequence != null ? `#${visit.sequence}` : "Visit";
  return party ? `${seq} ${party}` : seq;
}

function statusLabel(status: string | undefined): string {
  return String(status || "pending").replace(/_/g, " ");
}

function paginate(expenses: WorkPlanExpenseRecord[]): PageModel[] {
  if (expenses.length === 0) return [{ blocks: [] }];
  const rowsPerPage = Math.max(1, Math.floor((BODY_H - H_THEAD) / H_ROW));
  const pages: PageModel[] = [];
  for (let i = 0; i < expenses.length; i += rowsPerPage) {
    const slice = expenses.slice(i, i + rowsPerPage);
    pages.push({
      blocks: [
        { kind: "thead", height: H_THEAD },
        ...slice.map((exp) => ({ kind: "row" as const, exp, height: H_ROW })),
      ],
    });
  }
  return pages;
}

function PageHeader({
  companyName,
  logoUrl,
  salesUserLabel,
  totalAmount,
  periodFrom,
  periodTo,
  generatedAt,
  pageNo,
  pageCount,
}: {
  companyName: string;
  logoUrl: string;
  salesUserLabel: string;
  totalAmount: number;
  periodFrom: string;
  periodTo: string;
  generatedAt: string;
  pageNo: number;
  pageCount: number;
}) {
  return (
    <header
      style={{
        flexShrink: 0,
        height: `${HEADER_H}px`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        boxSizing: "border-box",
        paddingBottom: "8px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              crossOrigin="anonymous"
              style={{ height: "36px", width: "auto", maxWidth: "90px", objectFit: "contain" }}
            />
          ) : null}
          <div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#1e3a5f", lineHeight: 1.15 }}>
              {companyName || "Company"}
            </div>
            <div
              style={{
                marginTop: "2px",
                fontSize: "9px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#64748b",
              }}
            >
              Expenses Report
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#0f172a" }}>
            {salesUserLabel || "All sales users"}
          </div>
          <div style={{ marginTop: "2px", fontSize: "9px", color: "#475569" }}>
            Total {fmtMoney(totalAmount)}
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "8px",
          color: "#475569",
          borderTop: "2px solid #1e3a5f",
          borderBottom: "1px solid #cbd5e1",
          padding: "5px 0",
        }}
      >
        <span>
          Period: <strong>{periodFrom || "—"}</strong>
          {periodTo ? `  →  ${periodTo}` : ""}
        </span>
        <span>
          Generated: <strong>{generatedAt || "—"}</strong>
        </span>
        <span>
          Page <strong>{pageNo}</strong> of <strong>{pageCount}</strong>
        </span>
      </div>
    </header>
  );
}

function PageFooter({
  portalLabel,
  downloadedBy,
  pageNo,
  pageCount,
}: {
  portalLabel: string;
  downloadedBy: string;
  pageNo: number;
  pageCount: number;
}) {
  return (
    <footer
      style={{
        flexShrink: 0,
        height: `${FOOTER_H}px`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxSizing: "border-box",
        borderTop: "1px solid #cbd5e1",
        paddingTop: "6px",
        fontSize: "8px",
        color: "#64748b",
      }}
    >
      <span>
        {portalLabel || "Portal"}
        {"  ·  "}
        Downloaded by {downloadedBy || "—"}
      </span>
      <span>
        Page {pageNo} of {pageCount}
      </span>
      <span>Generated electronically — no signature required</span>
    </footer>
  );
}

export default function ExpensesPdfTemplate({
  companyName,
  logoUrl,
  portalLabel,
  downloadedBy,
  generatedAt,
  periodFrom,
  periodTo,
  salesUserLabel,
  expenses,
  totalAmount,
}: ExpensesPdfTemplateProps) {
  const pages = useMemo(() => paginate(expenses), [expenses]);
  const pageCount = Math.max(pages.length, 1);

  return (
    <div id="expenses-pdf-root" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {pages.map((page, pageIdx) => (
        <div key={pageIdx} data-pdf-page style={pageShell}>
          <PageHeader
            companyName={companyName}
            logoUrl={logoUrl}
            salesUserLabel={salesUserLabel}
            totalAmount={totalAmount}
            periodFrom={periodFrom}
            periodTo={periodTo}
            generatedAt={generatedAt}
            pageNo={pageIdx + 1}
            pageCount={pageCount}
          />
          <div
            style={{
              height: `${BODY_H}px`,
              flexShrink: 0,
              overflow: "hidden",
              boxSizing: "border-box",
            }}
          >
            {page.blocks.length === 0 ? (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#94a3b8",
                  fontSize: "11px",
                }}
              >
                No expenses recorded
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th style={{ ...th, width: "8%" }}>Expense date</th>
                    <th style={{ ...th, width: "8%" }}>Plan date</th>
                    <th style={{ ...th, width: "10%" }}>Sales exec</th>
                    <th style={{ ...th, width: "8%" }}>Location</th>
                    <th style={{ ...th, width: "11%" }}>Visit</th>
                    <th style={{ ...th, width: "8%" }}>Category</th>
                    <th style={{ ...th, width: "8%" }}>Sub-category</th>
                    <th style={{ ...th, width: "7%" }}>Reading</th>
                    <th style={{ ...th, width: "7%", textAlign: "right" }}>Amount</th>
                    <th style={{ ...th, width: "6%" }}>Payment</th>
                    <th style={{ ...th, width: "7%" }}>Status</th>
                    <th style={{ ...th, width: "8%" }}>Approved by</th>
                    <th style={{ ...th, width: "4%" }}>Bill #</th>
                  </tr>
                </thead>
                <tbody>
                  {page.blocks
                    .filter(
                      (b): b is { kind: "row"; exp: WorkPlanExpenseRecord; height: number } =>
                        b.kind === "row",
                    )
                    .map((b, rowIdx) => {
                      const exp = b.exp;
                      const plan = planRef(exp);
                      const isPrivateBike = exp.sub_category === "Private Bike";
                      const meterReading = isPrivateBike
                        ? `${exp.start_reading ?? "—"} → ${exp.closing_reading ?? "—"}`
                        : "—";
                      const approvedBy =
                        exp.status === "approved" || exp.status === "rejected"
                          ? salesName(exp.approved_by)
                          : "—";
                      return (
                        <tr
                          key={String(exp._id || rowIdx)}
                          style={{
                            backgroundColor: rowIdx % 2 === 0 ? "#ffffff" : "#f8fafc",
                            height: `${H_ROW}px`,
                          }}
                        >
                          <td style={{ ...td, fontFamily: "monospace", fontSize: "7.5px" }}>
                            {fmtDate(exp.expense_date)}
                          </td>
                          <td style={{ ...td, fontFamily: "monospace", fontSize: "7.5px" }}>
                            {fmtDate(plan.plan_date)}
                          </td>
                          <td style={td}>
                            <div style={clamp2}>{salesName(plan.sales_user)}</div>
                          </td>
                          <td style={td}>
                            <div style={clamp2}>{plan.location || "—"}</div>
                          </td>
                          <td style={td}>
                            <div style={clamp2}>{visitLabel(exp)}</div>
                          </td>
                          <td style={td}>
                            <div style={clamp2}>{exp.category || "—"}</div>
                          </td>
                          <td style={td}>
                            <div style={clamp2}>{exp.sub_category || "—"}</div>
                          </td>
                          <td style={{ ...td, fontFamily: "monospace", fontSize: "7.5px" }}>
                            {meterReading}
                          </td>
                          <td
                            style={{
                              ...td,
                              textAlign: "right",
                              fontWeight: 700,
                              fontFamily: "monospace",
                            }}
                          >
                            {fmtMoney(exp.amount)}
                          </td>
                          <td style={td}>{exp.payment_mode || "—"}</td>
                          <td style={{ ...td, textTransform: "capitalize" }}>
                            {statusLabel(exp.status)}
                          </td>
                          <td style={td}>
                            <div style={clamp2}>{approvedBy}</div>
                          </td>
                          <td style={{ ...td, fontFamily: "monospace", fontSize: "7.5px" }}>
                            {exp.bill_number || "—"}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
          </div>
          <PageFooter
            portalLabel={portalLabel}
            downloadedBy={downloadedBy}
            pageNo={pageIdx + 1}
            pageCount={pageCount}
          />
        </div>
      ))}
    </div>
  );
}
