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

const PAGE_WIDTH = 1123;
const PAGE_HEIGHT = 794;
const PAGE_PAD_X = 30;
const PAGE_PAD_Y = 24;
const HEADER_BLOCK_H = 110;
const FOOTER_BLOCK_H = 44;
/** Leave slack so estimated rows never overflow the designed page. */
const BODY_MAX_H = PAGE_HEIGHT - PAGE_PAD_Y * 2 - HEADER_BLOCK_H - FOOTER_BLOCK_H - 28;

const H_PLAN_HEADER = 48;
const H_PLAN_CONTINUED = 28;
const H_THEAD = 26;
const H_EMPTY = 28;

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
  | { kind: "plan-header"; plan: WorkPlanRecord; height: number; continued?: boolean }
  | { kind: "empty"; height: number }
  | { kind: "thead"; height: number }
  | { kind: "row"; item: FlatVisitRow; height: number };

type PageModel = { blocks: ContentBlock[] };

const pageShellStyle: CSSProperties = {
  width: `${PAGE_WIDTH}px`,
  minHeight: `${PAGE_HEIGHT}px`,
  padding: `${PAGE_PAD_Y}px ${PAGE_PAD_X}px`,
  backgroundColor: "#ffffff",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  position: "relative",
  overflow: "visible",
  fontFamily: "'Segoe UI', Arial, sans-serif",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
  marginBottom: "4px",
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
};

function fmtDate(d: unknown): string {
  if (!d) return "—";
  const dt = new Date(String(d));
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

function fmtDateTime(d: unknown): string {
  if (!d) return "—";
  const dt = new Date(String(d));
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "2-digit",
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
  if (v == null) return "—";
  return v ? "Yes" : "No";
}

function visitPartyName(v: WorkPlanVisitRecord): string {
  if (!v.party) return v.party_name || "—";
  if (typeof v.party === "string") return v.party;
  return v.party.party_name || "—";
}

function statusLabel(s: string): string {
  return String(s || "planned").replace(/_/g, " ").toUpperCase();
}

const COLS = [
  { label: "#", w: "4%" },
  { label: "Party", w: "12%" },
  { label: "Contact", w: "12%" },
  { label: "Address", w: "12%" },
  { label: "Purpose", w: "10%" },
  { label: "Planned", w: "9%" },
  { label: "Status", w: "7%" },
  { label: "Actual", w: "9%" },
  { label: "Outcome / Notes", w: "11%" },
  { label: "Meetings & Flags", w: "10%" },
  { label: "Follow-up", w: "4%" },
];

function flattenVisit(v: WorkPlanVisitRecord): FlatVisitRow {
  const meetingParts: string[] = [];
  if (v.meeting_with_doctor != null) meetingParts.push(`Doc: ${yn(v.meeting_with_doctor)}`);
  if (v.meeting_with_purchase != null) meetingParts.push(`Pur: ${yn(v.meeting_with_purchase)}`);
  if (v.meeting_with_finance != null) meetingParts.push(`Fin: ${yn(v.meeting_with_finance)}`);
  if (v.meeting_with_engineer != null) meetingParts.push(`Eng: ${yn(v.meeting_with_engineer)}`);
  if (v.new_product_introduced != null) meetingParts.push(`New Prod: ${yn(v.new_product_introduced)}`);
  if (v.order_received != null) meetingParts.push(`Order: ${yn(v.order_received)}`);

  const contactStr = [v.contact_person, v.contact_number, v.contact_email].filter(Boolean).join(" · ");
  const outcomeStr = [v.outcome, v.notes].filter(Boolean).join(" | ");

  return {
    sequence: v.sequence != null ? `#${v.sequence}` : "—",
    partyName: visitPartyName(v),
    partyType: v.party_type || "",
    contact: contactStr || "—",
    address: v.address || "—",
    purpose: v.purpose || "—",
    planned:
      [fmtDateTime(v.planned_start_time), fmtDateTime(v.planned_end_time)]
        .filter((x) => x !== "—")
        .join(" - ") || "—",
    visitStatus: statusLabel(v.status || "planned"),
    actual:
      [
        v.actual_check_in ? `In: ${fmtDateTime(v.actual_check_in)}` : "",
        v.actual_check_out ? `Out: ${fmtDateTime(v.actual_check_out)}` : "",
      ]
        .filter(Boolean)
        .join("\n") || "—",
    outcomeNotes: outcomeStr || "—",
    meetings: meetingParts.join(", ") || "—",
    followup: fmtDate(v.next_followup_date),
  };
}

function estimateVisitRowHeight(item: FlatVisitRow): number {
  const linesFor = (text: string, charsPerLine: number) =>
    Math.max(1, Math.ceil((text || "").length / charsPerLine));

  const maxLines = Math.max(
    1,
    linesFor(item.partyName, 16),
    linesFor(item.contact, 18),
    linesFor(item.address, 18),
    linesFor(item.purpose, 14),
    (item.actual || "").split("\n").length,
    linesFor(item.outcomeNotes, 16),
    linesFor(item.meetings, 16),
  );

  return Math.max(52, Math.min(28 + maxLines * 13, 180));
}

function planVisits(plan: WorkPlanRecord): WorkPlanVisitRecord[] {
  return Array.isArray(plan.visits) ? plan.visits : [];
}

function buildContentBlocks(plans: WorkPlanRecord[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  for (const plan of plans) {
    blocks.push({ kind: "plan-header", plan, height: H_PLAN_HEADER });
    const visits = planVisits(plan);
    if (visits.length === 0) {
      blocks.push({ kind: "empty", height: H_EMPTY });
      continue;
    }
    blocks.push({ kind: "thead", height: H_THEAD });
    for (const v of visits) {
      const item = flattenVisit(v);
      blocks.push({ kind: "row", item, height: estimateVisitRowHeight(item) });
    }
  }
  return blocks;
}

function paginateBlocks(blocks: ContentBlock[]): PageModel[] {
  const pages: PageModel[] = [];
  let current: ContentBlock[] = [];
  let used = 0;
  let activePlan: WorkPlanRecord | null = null;

  const flush = () => {
    if (current.length) pages.push({ blocks: current });
    current = [];
    used = 0;
  };

  const continuedPrefix = (): ContentBlock[] => {
    if (!activePlan) return [{ kind: "thead", height: H_THEAD }];
    return [
      { kind: "plan-header", plan: activePlan, height: H_PLAN_CONTINUED, continued: true },
      { kind: "thead", height: H_THEAD },
    ];
  };

  for (const block of blocks) {
    if (block.kind === "plan-header" && !block.continued) {
      activePlan = block.plan;
    }

    const prefix =
      current.length === 0 && (block.kind === "row" || block.kind === "thead")
        ? continuedPrefix()
        : [];
    const prefixH = prefix.reduce((s, b) => s + b.height, 0);

    if (used + prefixH + block.height > BODY_MAX_H && current.length > 0) {
      flush();
    }

    if (current.length === 0 && (block.kind === "row" || block.kind === "thead")) {
      const cont = continuedPrefix();
      // Avoid duplicating thead if the block itself is a thead
      const toAdd = block.kind === "thead" ? cont.filter((b) => b.kind !== "thead") : cont;
      for (const b of toAdd) {
        current.push(b);
        used += b.height;
      }
    }

    current.push(block);
    used += block.height;
  }
  flush();
  return pages.length ? pages : [{ blocks: [] }];
}

function PlanHeader({ plan, continued }: { plan: WorkPlanRecord; continued?: boolean }) {
  const visits = planVisits(plan);
  const count = visits.length || Number(plan.visit_count) || 0;
  return (
    <div
      style={{
        marginTop: continued ? "4px" : "8px",
        marginBottom: "6px",
        padding: continued ? "5px 8px" : "8px 10px",
        backgroundColor: "#f8fafc",
        borderLeft: "3.5px solid #1e3a5f",
        borderRadius: "4px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{ fontWeight: 700, color: "#1e3a5f", fontSize: "11px" }}>
            {fmtDate(plan.plan_date)}
            {continued ? " (continued)" : ""}
          </span>
          <span style={{ marginLeft: "12px", color: "#475569", fontSize: "9px" }}>
            {salesName(plan.sales_user)}
          </span>
          <span style={{ marginLeft: "12px", color: "#64748b", fontSize: "9px" }}>
            {plan.location || "No location"}
          </span>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <span style={{ fontSize: "9px", color: "#334155" }}>
            <strong>{count}</strong> visit{count === 1 ? "" : "s"}
          </span>
          <span
            style={{
              textTransform: "uppercase",
              fontSize: "8px",
              fontWeight: 700,
              color: "#2563eb",
            }}
          >
            {statusLabel(plan.status || "draft")}
          </span>
        </div>
      </div>
      {!continued && plan.remarks ? (
        <div style={{ marginTop: "3px", fontSize: "8px", color: "#64748b", fontStyle: "italic" }}>
          {plan.remarks}
        </div>
      ) : null}
    </div>
  );
}

function VisitTableHead() {
  return (
    <thead>
      <tr>
        {COLS.map((c) => (
          <th key={c.label} style={{ ...thBase, width: c.w }}>
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function VisitRow({ item, zebra }: { item: FlatVisitRow; zebra: boolean }) {
  return (
    <tr style={{ backgroundColor: zebra ? "#f8fafc" : "#ffffff" }}>
      <td style={{ ...tdBase, textAlign: "center", fontFamily: "monospace", fontSize: "7.5px" }}>
        {item.sequence}
      </td>
      <td style={{ ...tdBase, fontSize: "7.5px" }}>
        <div>{item.partyName}</div>
        {item.partyType ? (
          <div style={{ fontSize: "6.5px", color: "#64748b" }}>{item.partyType}</div>
        ) : null}
      </td>
      <td style={{ ...tdBase, fontSize: "7.5px" }}>{item.contact}</td>
      <td style={{ ...tdBase, fontSize: "7.5px" }}>{item.address}</td>
      <td style={{ ...tdBase, fontSize: "7.5px" }}>{item.purpose}</td>
      <td style={{ ...tdBase, fontSize: "7px", fontFamily: "monospace" }}>{item.planned}</td>
      <td style={{ ...tdBase, fontSize: "7px", fontWeight: 500 }}>{item.visitStatus}</td>
      <td style={{ ...tdBase, fontSize: "7px", fontFamily: "monospace", whiteSpace: "pre-line" }}>
        {item.actual}
      </td>
      <td style={{ ...tdBase, fontSize: "7px", lineHeight: "1.3" }}>{item.outcomeNotes}</td>
      <td style={{ ...tdBase, fontSize: "7px", lineHeight: "1.3" }}>{item.meetings}</td>
      <td style={{ ...tdBase, fontFamily: "monospace", fontSize: "7.5px" }}>{item.followup}</td>
    </tr>
  );
}

function PageBody({ blocks }: { blocks: ContentBlock[] }) {
  const nodes: ReactNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i]!;
    if (block.kind === "plan-header") {
      nodes.push(
        <PlanHeader
          key={`plan-h-${i}`}
          plan={block.plan}
          continued={block.continued}
        />,
      );
      i += 1;
      continue;
    }
    if (block.kind === "empty") {
      nodes.push(
        <p
          key={`empty-${i}`}
          style={{
            margin: "0 0 8px",
            padding: "6px 10px",
            backgroundColor: "#fafafa",
            border: "1px dashed #e2e8f0",
            borderRadius: "4px",
            color: "#94a3b8",
            fontSize: "9px",
          }}
        >
          No visits on this plan.
        </p>,
      );
      i += 1;
      continue;
    }
    if (block.kind === "thead") {
      const rows: ReactNode[] = [];
      let j = i + 1;
      let rowIdx = 0;
      while (j < blocks.length && blocks[j]!.kind === "row") {
        const row = blocks[j] as Extract<ContentBlock, { kind: "row" }>;
        rows.push(
          <VisitRow key={`row-${j}`} item={row.item} zebra={rowIdx % 2 === 1} />,
        );
        rowIdx += 1;
        j += 1;
      }
      nodes.push(
        <table key={`tbl-${i}`} style={tableStyle}>
          <VisitTableHead />
          <tbody>{rows}</tbody>
        </table>,
      );
      i = j;
      continue;
    }
    i += 1;
  }

  return <div style={{ flex: "1 1 auto", overflow: "visible" }}>{nodes}</div>;
}

export default function WorkPlansPdfTemplate({
  companyName,
  logoUrl,
  portalLabel,
  downloadedBy,
  generatedAt,
  periodFrom,
  periodTo,
  salesUserLabel: salesUserLabelProp,
  statusLabel: statusFilterLabel,
  plans,
  totalVisits,
}: WorkPlansPdfTemplateProps) {
  const pages: PageModel[] = useMemo(
    () => paginateBlocks(buildContentBlocks(plans)),
    [plans],
  );

  return (
    <div
      id="work-plans-pdf-root"
      style={{ display: "flex", flexDirection: "column", backgroundColor: "#94a3b8", gap: "16px" }}
    >
      {pages.map((page, pageIdx) => (
        <div key={pageIdx} data-pdf-page style={pageShellStyle}>
          <header
            style={{
              flexShrink: 0,
              minHeight: `${HEADER_BLOCK_H}px`,
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Logo"
                    style={{ height: "32px", width: "auto", objectFit: "contain" }}
                  />
                ) : null}
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
                    Work Plans Report
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#0f172a" }}>
                  {salesUserLabelProp}
                </div>
                <div style={{ fontSize: "8px", color: "#475569", marginTop: "2px" }}>
                  Plans: {plans.length} · Visits: {totalVisits}
                </div>
              </div>
            </div>
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
                <strong>Period:</strong> {periodFrom} to {periodTo} &nbsp;|&nbsp;{" "}
                <strong>Status:</strong> {statusFilterLabel}
              </span>
              <span>
                <strong>Generated:</strong> {generatedAt}
              </span>
              <span>
                <strong>Page:</strong> {pageIdx + 1} / {pages.length}
              </span>
            </div>
          </header>

          {page.blocks.length === 0 ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: "#64748b", fontSize: "10px" }}>
              No work plans recorded.
            </div>
          ) : (
            <PageBody blocks={page.blocks} />
          )}

          <footer
            style={{
              flexShrink: 0,
              minHeight: `${FOOTER_BLOCK_H}px`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "1px solid #e2e8f0",
              paddingTop: "6px",
              marginTop: "auto",
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
