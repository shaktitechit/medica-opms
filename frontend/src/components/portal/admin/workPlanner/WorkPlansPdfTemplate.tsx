"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import type { WorkPlanRecord, WorkPlanVisitRecord } from "@/store/api";

export type WorkPlansPdfTemplateProps = {
  companyName: string;
  logoUrl: string;
  portalLabel: string;
  downloadedBy: string;
  generatedAt: string;
  periodFrom: string;
  periodTo: string;
  salesUserLabel: string;
  statusLabel: string;
  plans: WorkPlanRecord[];
  totalVisits: number;
};

const PAGE_W = 1123;
const PAGE_H = 794;
const PAD_X = 28;
const PAD_Y = 20;
const HEADER_H = 92;
const FOOTER_H = 36;
const BODY_H = PAGE_H - PAD_Y * 2 - HEADER_H - FOOTER_H;

const H_PLAN = 40;
const H_PLAN_CONT = 24;
const H_THEAD = 22;
const H_EMPTY = 26;
const H_ROW = 34;

type FlatVisitRow = {
  sequence: string;
  partyName: string;
  partyType: string;
  contact: string;
  address: string;
  purpose: string;
  planned: string;
  visitStatus: string;
  actual: string;
  outcomeNotes: string;
  meetings: string;
  followup: string;
};

type ContentBlock =
  | { kind: "plan-header"; plan: WorkPlanRecord; continued?: boolean; height: number }
  | { kind: "empty"; height: number }
  | { kind: "thead"; height: number }
  | { kind: "row"; item: FlatVisitRow; height: number };

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

function fmtDateTime(d: unknown): string {
  if (!d) return "";
  const dt = new Date(String(d));
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function salesName(user: unknown): string {
  if (!user) return "—";
  if (typeof user === "string") return user;
  const u = user as Record<string, unknown>;
  return String(u.name || u.email || "—");
}

function yn(v: boolean | null | undefined): string {
  if (v == null) return "";
  return v ? "Y" : "N";
}

function visitPartyName(v: WorkPlanVisitRecord): string {
  if (!v.party) return v.party_name || "—";
  if (typeof v.party === "string") return v.party;
  return v.party.party_name || "—";
}

function statusLabel(s: string | undefined): string {
  return String(s || "planned").replace(/_/g, " ");
}

function planVisits(plan: WorkPlanRecord): WorkPlanVisitRecord[] {
  return Array.isArray(plan.visits) ? plan.visits : [];
}

function flattenVisit(v: WorkPlanVisitRecord): FlatVisitRow {
  const flags = [
    v.meeting_with_doctor != null ? `Doc ${yn(v.meeting_with_doctor)}` : "",
    v.meeting_with_purchase != null ? `Pur ${yn(v.meeting_with_purchase)}` : "",
    v.meeting_with_finance != null ? `Fin ${yn(v.meeting_with_finance)}` : "",
    v.meeting_with_engineer != null ? `Eng ${yn(v.meeting_with_engineer)}` : "",
    v.new_product_introduced != null ? `New ${yn(v.new_product_introduced)}` : "",
    v.order_received != null ? `Ord ${yn(v.order_received)}` : "",
  ].filter(Boolean);

  const planned = [fmtDateTime(v.planned_start_time), fmtDateTime(v.planned_end_time)]
    .filter(Boolean)
    .join(" – ");
  const actual = [
    v.actual_check_in ? `In ${fmtDateTime(v.actual_check_in)}` : "",
    v.actual_check_out ? `Out ${fmtDateTime(v.actual_check_out)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    sequence: v.sequence != null ? String(v.sequence) : "—",
    partyName: visitPartyName(v),
    partyType: v.party_type ? String(v.party_type).replace(/_/g, " ") : "",
    contact: [v.contact_person, v.contact_number].filter(Boolean).join(" · ") || "—",
    address: v.address || "—",
    purpose: v.purpose || "—",
    planned: planned || "—",
    visitStatus: statusLabel(v.status),
    actual: actual || "—",
    outcomeNotes: [v.outcome, v.notes].filter(Boolean).join(" · ") || "—",
    meetings: flags.join(" · ") || "—",
    followup: v.next_followup_date ? fmtDate(v.next_followup_date) : "—",
  };
}

function buildBlocks(plans: WorkPlanRecord[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  for (const plan of plans) {
    blocks.push({ kind: "plan-header", plan, height: H_PLAN });
    const visits = planVisits(plan);
    if (visits.length === 0) {
      blocks.push({ kind: "empty", height: H_EMPTY });
      continue;
    }
    blocks.push({ kind: "thead", height: H_THEAD });
    for (const v of visits) {
      blocks.push({ kind: "row", item: flattenVisit(v), height: H_ROW });
    }
  }
  return blocks;
}

function paginate(blocks: ContentBlock[]): PageModel[] {
  const pages: PageModel[] = [];
  let cur: ContentBlock[] = [];
  let used = 0;
  let activePlan: WorkPlanRecord | null = null;

  const flush = () => {
    if (!cur.length) return;
    const hasContent = cur.some(
      (b) => b.kind === "row" || b.kind === "empty" || (b.kind === "plan-header" && !b.continued),
    );
    if (hasContent) pages.push({ blocks: cur });
    cur = [];
    used = 0;
  };

  const roomFor = (h: number) => used + h <= BODY_H;

  for (const block of blocks) {
    if (block.kind === "plan-header") {
      activePlan = block.plan;
      const need = H_PLAN + Math.min(H_THEAD + H_ROW, H_EMPTY);
      if (cur.length > 0 && !roomFor(need)) flush();
      cur.push(block);
      used += block.height;
      continue;
    }

    if (block.kind === "thead") {
      if (cur.length > 0 && !roomFor(H_THEAD + H_ROW)) flush();
      if (cur.length === 0 && activePlan) {
        cur.push({ kind: "plan-header", plan: activePlan, continued: true, height: H_PLAN_CONT });
        used += H_PLAN_CONT;
      }
      cur.push(block);
      used += block.height;
      continue;
    }

    if (block.kind === "row" || block.kind === "empty") {
      const prefix =
        cur.length === 0
          ? (activePlan ? H_PLAN_CONT : 0) + (block.kind === "row" ? H_THEAD : 0)
          : 0;
      if (cur.length > 0 && !roomFor(prefix + block.height)) flush();
      if (cur.length === 0) {
        if (activePlan) {
          cur.push({ kind: "plan-header", plan: activePlan, continued: true, height: H_PLAN_CONT });
          used += H_PLAN_CONT;
        }
        if (block.kind === "row") {
          cur.push({ kind: "thead", height: H_THEAD });
          used += H_THEAD;
        }
      }
      cur.push(block);
      used += block.height;
    }
  }
  flush();
  return pages.length ? pages : [{ blocks: [] }];
}

function PageHeader({
  companyName,
  logoUrl,
  title,
  salesUserLabel,
  summary,
  periodFrom,
  periodTo,
  statusLabel,
  generatedAt,
  pageNo,
  pageCount,
}: {
  companyName: string;
  logoUrl: string;
  title: string;
  salesUserLabel: string;
  summary: string;
  periodFrom: string;
  periodTo: string;
  statusLabel: string;
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
              {title}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#0f172a" }}>
            {salesUserLabel || "All sales users"}
          </div>
          <div style={{ marginTop: "2px", fontSize: "9px", color: "#475569" }}>{summary}</div>
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
          {"  ·  "}
          Status: <strong>{statusLabel || "All"}</strong>
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

function PlanBar({ plan, continued }: { plan: WorkPlanRecord; continued?: boolean }) {
  const n = planVisits(plan).length || Number(plan.visit_count) || 0;
  return (
    <div
      style={{
        height: continued ? `${H_PLAN_CONT}px` : `${H_PLAN}px`,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "10px",
        padding: "0 10px",
        margin: 0,
        backgroundColor: "#f8fafc",
        borderLeft: "3px solid #1e3a5f",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
        <strong style={{ fontSize: "10px", color: "#1e3a5f", whiteSpace: "nowrap" }}>
          {fmtDate(plan.plan_date)}
          {continued ? "  ·  continued" : ""}
        </strong>
        <span style={{ fontSize: "9px", color: "#334155" }}>{salesName(plan.sales_user)}</span>
        <span style={{ fontSize: "8px", color: "#64748b" }}>{plan.location || "—"}</span>
        {!continued && plan.remarks ? (
          <span
            style={{
              fontSize: "8px",
              color: "#64748b",
              fontStyle: "italic",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "280px",
            }}
          >
            {plan.remarks}
          </span>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
        <span style={{ fontSize: "8px", color: "#334155" }}>
          {n} visit{n === 1 ? "" : "s"}
        </span>
        <span
          style={{
            fontSize: "8px",
            fontWeight: 700,
            textTransform: "uppercase",
            color: "#1d4ed8",
          }}
        >
          {statusLabel(plan.status)}
        </span>
      </div>
    </div>
  );
}

function VisitHead() {
  return (
    <thead>
      <tr>
        <th style={{ ...th, width: "3%" }}>#</th>
        <th style={{ ...th, width: "13%" }}>Party</th>
        <th style={{ ...th, width: "12%" }}>Contact</th>
        <th style={{ ...th, width: "12%" }}>Address</th>
        <th style={{ ...th, width: "10%" }}>Purpose</th>
        <th style={{ ...th, width: "10%" }}>Planned</th>
        <th style={{ ...th, width: "8%" }}>Status</th>
        <th style={{ ...th, width: "10%" }}>Actual</th>
        <th style={{ ...th, width: "11%" }}>Outcome / notes</th>
        <th style={{ ...th, width: "7%" }}>Flags</th>
        <th style={{ ...th, width: "4%" }}>Follow-up</th>
      </tr>
    </thead>
  );
}

function VisitRow({ item, zebra }: { item: FlatVisitRow; zebra: boolean }) {
  return (
    <tr style={{ backgroundColor: zebra ? "#f8fafc" : "#ffffff", height: `${H_ROW}px` }}>
      <td style={{ ...td, textAlign: "center", fontFamily: "monospace" }}>{item.sequence}</td>
      <td style={td}>
        <div style={clamp2}>
          {item.partyName}
          {item.partyType ? (
            <span style={{ color: "#64748b" }}>{` · ${item.partyType}`}</span>
          ) : null}
        </div>
      </td>
      <td style={td}>
        <div style={clamp2}>{item.contact}</div>
      </td>
      <td style={td}>
        <div style={clamp2}>{item.address}</div>
      </td>
      <td style={td}>
        <div style={clamp2}>{item.purpose}</div>
      </td>
      <td style={{ ...td, fontFamily: "monospace", fontSize: "7.5px" }}>
        <div style={clamp2}>{item.planned}</div>
      </td>
      <td style={{ ...td, textTransform: "capitalize" }}>{item.visitStatus}</td>
      <td style={{ ...td, fontFamily: "monospace", fontSize: "7.5px" }}>
        <div style={clamp2}>{item.actual}</div>
      </td>
      <td style={td}>
        <div style={clamp2}>{item.outcomeNotes}</div>
      </td>
      <td style={td}>
        <div style={clamp2}>{item.meetings}</div>
      </td>
      <td style={{ ...td, fontFamily: "monospace", fontSize: "7.5px" }}>{item.followup}</td>
    </tr>
  );
}

function PageBody({ blocks }: { blocks: ContentBlock[] }) {
  const nodes: ReactNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i]!;
    if (b.kind === "plan-header") {
      nodes.push(<PlanBar key={`p-${i}`} plan={b.plan} continued={b.continued} />);
      i += 1;
      continue;
    }
    if (b.kind === "empty") {
      nodes.push(
        <div
          key={`e-${i}`}
          style={{
            height: `${H_EMPTY}px`,
            display: "flex",
            alignItems: "center",
            padding: "0 10px",
            fontSize: "8px",
            color: "#94a3b8",
            border: "1px dashed #e2e8f0",
            backgroundColor: "#fafafa",
          }}
        >
          No visits on this plan
        </div>,
      );
      i += 1;
      continue;
    }
    if (b.kind === "thead") {
      const rows: ReactNode[] = [];
      let j = i + 1;
      let n = 0;
      while (j < blocks.length && blocks[j]!.kind === "row") {
        const row = blocks[j] as Extract<ContentBlock, { kind: "row" }>;
        rows.push(<VisitRow key={`r-${j}`} item={row.item} zebra={n % 2 === 1} />);
        n += 1;
        j += 1;
      }
      nodes.push(
        <table
          key={`t-${i}`}
          style={{
            width: "100%",
            borderCollapse: "collapse",
            tableLayout: "fixed",
          }}
        >
          <VisitHead />
          <tbody>{rows}</tbody>
        </table>,
      );
      i = j;
      continue;
    }
    i += 1;
  }

  return (
    <div
      style={{
        height: `${BODY_H}px`,
        flexShrink: 0,
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {nodes}
    </div>
  );
}

export default function WorkPlansPdfTemplate({
  companyName,
  logoUrl,
  portalLabel,
  downloadedBy,
  generatedAt,
  periodFrom,
  periodTo,
  salesUserLabel,
  statusLabel: statusFilterLabel,
  plans,
  totalVisits,
}: WorkPlansPdfTemplateProps) {
  const pages = useMemo(() => paginate(buildBlocks(plans)), [plans]);
  const pageCount = Math.max(pages.length, 1);

  return (
    <div id="work-plans-pdf-root" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {pages.map((page, idx) => (
        <div key={idx} data-pdf-page style={pageShell}>
          <PageHeader
            companyName={companyName}
            logoUrl={logoUrl}
            title="Work Plans Report"
            salesUserLabel={salesUserLabel}
            summary={`${plans.length} plan${plans.length === 1 ? "" : "s"}  ·  ${totalVisits} visit${totalVisits === 1 ? "" : "s"}`}
            periodFrom={periodFrom}
            periodTo={periodTo}
            statusLabel={statusFilterLabel}
            generatedAt={generatedAt}
            pageNo={idx + 1}
            pageCount={pageCount}
          />
          {page.blocks.length === 0 ? (
            <div
              style={{
                height: `${BODY_H}px`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#94a3b8",
                fontSize: "11px",
              }}
            >
              No work plans recorded
            </div>
          ) : (
            <PageBody blocks={page.blocks} />
          )}
          <PageFooter
            portalLabel={portalLabel}
            downloadedBy={downloadedBy}
            pageNo={idx + 1}
            pageCount={pageCount}
          />
        </div>
      ))}
    </div>
  );
}
