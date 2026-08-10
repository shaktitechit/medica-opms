"use client";

import { useMemo, type CSSProperties } from "react";
import type { WorkPlanRecord } from "@/store/api";

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
const BODY_MAX_H = PAGE_HEIGHT - PAGE_PAD_Y * 2 - HEADER_BLOCK_H - FOOTER_BLOCK_H;

const H_THEAD = 28;
const H_ROW = 38;

type FlatVisitRow = {
  planDate: string;
  salesUser: string;
  location: string;
  planStatus: string;
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
  | { kind: "thead"; height: number }
  | { kind: "row"; item: FlatVisitRow; height: number };

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

function visitPartyName(v: any): string {
  if (!v.party) return v.party_name || "—";
  if (typeof v.party === "string") return v.party;
  return v.party.party_name || v.party.name || "—";
}

function statusLabel(s: string): string {
  return String(s || "planned").replace(/_/g, " ").toUpperCase();
}

/* ─── Column definitions (total width ≈ 1063 usable) ───────────────────── */
const COLS = [
  { label: "Plan Date",   w: 62 },
  { label: "Sales Exec",  w: 80 },
  { label: "Location",    w: 65 },
  { label: "#",           w: 25 },
  { label: "Party",       w: 100 },
  { label: "Contact",     w: 85 },
  { label: "Address",     w: 95 },
  { label: "Purpose",     w: 80 },
  { label: "Planned",     w: 75 },
  { label: "Status",      w: 60 },
  { label: "Actual",      w: 75 },
  { label: "Outcome / Notes", w: 100 },
  { label: "Meetings & Flags", w: 100 },
  { label: "Follow-up",   w: 61 },
];

/* ─── Component ─────────────────────────────────────────────────────────── */
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
  const flatRows = useMemo(() => {
    const list: FlatVisitRow[] = [];
    for (const p of plans) {
      const pDate = fmtDate(p.plan_date);
      const sUser = salesName(p.sales_user);
      const loc = p.location || "—";
      const pStat = statusLabel(p.status || "draft");
      const visits = Array.isArray(p.visits) ? p.visits : [];

      if (visits.length === 0) {
        list.push({
          planDate: pDate,
          salesUser: sUser,
          location: loc,
          planStatus: pStat,
          sequence: "—",
          partyName: "No visits",
          partyType: "—",
          contact: "—",
          address: "—",
          purpose: "—",
          planned: "—",
          visitStatus: "—",
          actual: "—",
          outcomeNotes: p.remarks || "—",
          meetings: "—",
          followup: "—",
        });
      } else {
        for (const v of visits) {
          const meetingParts: string[] = [];
          if (v.meeting_with_doctor != null) meetingParts.push(`Doc: ${yn(v.meeting_with_doctor)}`);
          if (v.meeting_with_purchase != null) meetingParts.push(`Pur: ${yn(v.meeting_with_purchase)}`);
          if (v.meeting_with_finance != null) meetingParts.push(`Fin: ${yn(v.meeting_with_finance)}`);
          if (v.meeting_with_engineer != null) meetingParts.push(`Eng: ${yn(v.meeting_with_engineer)}`);
          if (v.new_product_introduced != null) meetingParts.push(`New Prod: ${yn(v.new_product_introduced)}`);
          if (v.order_received != null) meetingParts.push(`Order: ${yn(v.order_received)}`);

          const contactStr = [v.contact_person, v.contact_number, v.contact_email].filter(Boolean).join(" · ");
          const outcomeStr = [v.outcome, v.notes].filter(Boolean).join(" | ");

          list.push({
            planDate: pDate,
            salesUser: sUser,
            location: loc,
            planStatus: pStat,
            sequence: v.sequence != null ? `#${v.sequence}` : "—",
            partyName: visitPartyName(v),
            partyType: v.party_type || "",
            contact: contactStr || "—",
            address: v.address || "—",
            purpose: v.purpose || "—",
            planned: [fmtDateTime(v.planned_start_time), fmtDateTime(v.planned_end_time)].filter((x) => x !== "—").join(" - ") || "—",
            visitStatus: statusLabel(v.status || "planned"),
            actual: [
              v.actual_check_in ? `In: ${fmtDateTime(v.actual_check_in)}` : "",
              v.actual_check_out ? `Out: ${fmtDateTime(v.actual_check_out)}` : "",
            ].filter(Boolean).join("\n") || "—",
            outcomeNotes: outcomeStr || "—",
            meetings: meetingParts.join(", ") || "—",
            followup: fmtDate(v.next_followup_date),
          });
        }
      }
    }
    return list;
  }, [plans]);

  const pages: PageModel[] = useMemo(() => {
    if (flatRows.length === 0) return [{ blocks: [] }];

    const all: ContentBlock[] = [
      { kind: "thead", height: H_THEAD },
      ...flatRows.map((item) => ({ kind: "row" as const, item, height: H_ROW })),
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
  }, [flatRows]);

  return (
    <div
      id="work-plans-pdf-root"
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
                    Work Plans Report
                  </div>
                </div>
              </div>

              {/* Right: summary */}
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#0f172a" }}>
                  {salesUserLabelProp}
                </div>
                <div style={{ fontSize: "8px", color: "#475569", marginTop: "2px" }}>
                  Plans: {plans.length} · Visits: {totalVisits}
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
                <strong>Period:</strong> {periodFrom} to {periodTo} &nbsp;|&nbsp; <strong>Status:</strong> {statusFilterLabel}
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
                No work plans recorded.
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
                        <th key={i} style={thBase}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  )}
                </thead>

                <tbody>
                  {page.blocks
                    .filter((b): b is { kind: "row"; item: FlatVisitRow; height: number } => b.kind === "row")
                    .map((b, rowIdx) => {
                      const item = b.item;
                      const bg = rowIdx % 2 === 0 ? "#ffffff" : "#f8fafc";

                      return (
                        <tr key={`row-${rowIdx}`} style={{ backgroundColor: bg }}>
                          <td style={{ ...tdBase, fontFamily: "monospace", fontSize: "7.5px" }}>{item.planDate}</td>
                          <td style={{ ...tdBase, fontSize: "7.5px" }}>{item.salesUser}</td>
                          <td style={{ ...tdBase, fontSize: "7.5px" }}>{item.location}</td>
                          <td style={{ ...tdBase, textAlign: "center", fontFamily: "monospace", fontSize: "7.5px" }}>{item.sequence}</td>
                          <td style={{ ...tdBase, fontSize: "7.5px" }}>
                            <div>{item.partyName}</div>
                            {item.partyType ? <div style={{ fontSize: "6.5px", color: "#64748b" }}>{item.partyType}</div> : null}
                          </td>
                          <td style={{ ...tdBase, fontSize: "7.5px" }}>{item.contact}</td>
                          <td style={{ ...tdBase, fontSize: "7.5px" }}>{item.address}</td>
                          <td style={{ ...tdBase, fontSize: "7.5px" }}>{item.purpose}</td>
                          <td style={{ ...tdBase, fontSize: "7px", fontFamily: "monospace" }}>{item.planned}</td>
                          <td style={{ ...tdBase, fontSize: "7px", fontWeight: 500, color: "#334155" }}>{item.visitStatus}</td>
                          <td style={{ ...tdBase, fontSize: "7px", fontFamily: "monospace", whiteSpace: "pre-line" }}>{item.actual}</td>
                          <td style={{ ...tdBase, fontSize: "7px", lineHeight: "1.3" }}>{item.outcomeNotes}</td>
                          <td style={{ ...tdBase, fontSize: "7px", lineHeight: "1.3" }}>{item.meetings}</td>
                          <td style={{ ...tdBase, fontFamily: "monospace", fontSize: "7.5px" }}>{item.followup}</td>
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
