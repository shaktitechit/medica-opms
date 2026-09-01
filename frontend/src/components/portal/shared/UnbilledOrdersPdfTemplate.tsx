"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { pdfTdCompactStyle } from "./orderPdfLayout";
import {
  PdfLetterheadBrand,
  PdfLetterheadFooterCopy,
  PdfLetterheadRule,
  usePdfCompanyLetterhead,
  type PdfCompanyLetterhead,
} from "./pdfCompanyLetterhead";

export type UnbilledOrdersPdfUnbilledLine = {
  orderNo: string;
  party: string;
  statusLabel: string;
  refOrderDate: string;
  productName: string;
  sku?: string;
  approved: number;
  submittedDispatch: number;
  remaining: number;
};

export type UnbilledOrdersPdfListLine = {
  orderNo: string;
  party: string;
  statusLabel: string;
  refOrderDate: string;
  productName: string;
  sku?: string;
  ordered: number;
  pending: number;
};

export type UnbilledOrdersPdfTemplateProps = {
  companyName?: string;
  logoUrl?: string;
  portalLabel: string;
  downloadedBy: string;
  generatedAt: string;
  unbilledLines: UnbilledOrdersPdfUnbilledLine[];
  processPendingLines: UnbilledOrdersPdfListLine[];
  onHoldLines: UnbilledOrdersPdfListLine[];
};

/** A4 @ 96dpi — each `[data-pdf-page]` is captured as one PDF page. */
const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;
const PAGE_PAD_X = 40;
const PAGE_PAD_Y = 28;
const HEADER_BLOCK_H = 186;
const FOOTER_BLOCK_H = 78;
const BODY_MAX_H = PAGE_HEIGHT - PAGE_PAD_Y * 2 - HEADER_BLOCK_H - FOOTER_BLOCK_H;

const H_SECTION = 44;
const H_EMPTY = 40;
const H_TABLE_HEAD = 32;
const H_ROW = 34;
const H_TOTALS = 118;

type TableKind = "unbilled" | "list";

type PendingTotals = {
  unbilled: number;
  processPending: number;
  onHold: number;
  total: number;
};

type ContentBlock =
  | { kind: "section"; title: string; count: number; height: number }
  | { kind: "empty"; label: string; height: number }
  | { kind: "thead"; table: TableKind; height: number }
  | {
      kind: "unbilled-row";
      line: UnbilledOrdersPdfUnbilledLine;
      height: number;
    }
  | { kind: "list-row"; line: UnbilledOrdersPdfListLine; height: number }
  | { kind: "totals"; totals: PendingTotals; height: number };

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
  fontSize: "11px",
  lineHeight: 1.35,
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const thStyle: CSSProperties = {
  padding: "8px 4px",
  textAlign: "left",
  fontWeight: 700,
  fontSize: "9px",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  color: "#1e3a5f",
  backgroundColor: "#f1f5f9",
  border: "none",
  verticalAlign: "middle",
  lineHeight: 1.25,
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  ...pdfTdCompactStyle,
  border: "none",
  borderBottom: "none",
  boxShadow: "none",
  paddingTop: "7px",
  paddingBottom: "7px",
  lineHeight: 1.3,
  verticalAlign: "top",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  marginBottom: "8px",
  tableLayout: "fixed",
};

function rowHeight(sku?: string): number {
  return sku ? H_ROW + 10 : H_ROW;
}

function sumUnbilledRemaining(lines: UnbilledOrdersPdfUnbilledLine[]): number {
  return lines.reduce((sum, line) => sum + Number(line.remaining || 0), 0);
}

function sumListPending(lines: UnbilledOrdersPdfListLine[]): number {
  return lines.reduce((sum, line) => sum + Number(line.pending || 0), 0);
}

function buildPendingTotals(
  unbilledLines: UnbilledOrdersPdfUnbilledLine[],
  processPendingLines: UnbilledOrdersPdfListLine[],
  onHoldLines: UnbilledOrdersPdfListLine[],
): PendingTotals {
  const unbilled = sumUnbilledRemaining(unbilledLines);
  const processPending = sumListPending(processPendingLines);
  const onHold = sumListPending(onHoldLines);
  return {
    unbilled,
    processPending,
    onHold,
    total: unbilled + processPending + onHold,
  };
}

function buildContentBlocks(
  unbilledLines: UnbilledOrdersPdfUnbilledLine[],
  processPendingLines: UnbilledOrdersPdfListLine[],
  onHoldLines: UnbilledOrdersPdfListLine[],
): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  const pushListSection = (
    title: string,
    lines: UnbilledOrdersPdfListLine[],
    emptyLabel: string,
  ) => {
    blocks.push({
      kind: "section",
      title,
      count: lines.length,
      height: H_SECTION,
    });
    if (lines.length === 0) {
      blocks.push({ kind: "empty", label: emptyLabel, height: H_EMPTY });
      return;
    }
    blocks.push({ kind: "thead", table: "list", height: H_TABLE_HEAD });
    for (const line of lines) {
      blocks.push({
        kind: "list-row",
        line,
        height: rowHeight(line.sku),
      });
    }
  };

  blocks.push({
    kind: "section",
    title: "1. Un Billed Orders",
    count: unbilledLines.length,
    height: H_SECTION,
  });
  if (unbilledLines.length === 0) {
    blocks.push({
      kind: "empty",
      label: "un billed orders",
      height: H_EMPTY,
    });
  } else {
    blocks.push({ kind: "thead", table: "unbilled", height: H_TABLE_HEAD });
    for (const line of unbilledLines) {
      blocks.push({
        kind: "unbilled-row",
        line,
        height: rowHeight(line.sku),
      });
    }
  }

  pushListSection(
    "2. Process Pending Orders",
    processPendingLines,
    "process pending orders",
  );
  pushListSection("3. On Hold Orders", onHoldLines, "on hold orders");

  blocks.push({
    kind: "totals",
    totals: buildPendingTotals(
      unbilledLines,
      processPendingLines,
      onHoldLines,
    ),
    height: H_TOTALS,
  });

  return blocks;
}

function paginateBlocks(blocks: ContentBlock[]): PageModel[] {
  const pages: PageModel[] = [];
  let current: ContentBlock[] = [];
  let used = 0;
  let activeTable: TableKind | null = null;

  const flush = () => {
    if (current.length === 0) return;
    pages.push({ blocks: current });
    current = [];
    used = 0;
  };

  for (const block of blocks) {
    if (
      block.kind === "section" ||
      block.kind === "empty" ||
      block.kind === "totals"
    ) {
      activeTable = null;
    } else if (block.kind === "thead") {
      activeTable = block.table;
    }

    let chunk: ContentBlock[] = [block];

    // Continuing a table on a fresh page — repeat column headers.
    if (
      current.length === 0 &&
      (block.kind === "unbilled-row" || block.kind === "list-row") &&
      activeTable
    ) {
      chunk = [
        { kind: "thead", table: activeTable, height: H_TABLE_HEAD },
        block,
      ];
    }

    let chunkH = chunk.reduce((sum, b) => sum + b.height, 0);

    if (used + chunkH > BODY_MAX_H && current.length > 0) {
      flush();
      if (block.kind === "unbilled-row" || block.kind === "list-row") {
        const table: TableKind =
          block.kind === "unbilled-row" ? "unbilled" : "list";
        activeTable = table;
        chunk = [
          { kind: "thead", table, height: H_TABLE_HEAD },
          block,
        ];
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

function SectionHeading({ title, count }: { title: string; count: number }) {
  return (
    <div
      style={{
        margin: "0 0 8px",
        padding: "6px 0 5px",
        borderBottom: "1.5px solid #94a3b8",
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: "12px",
          fontWeight: 700,
          color: "#1e3a5f",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {title}
      </h2>
      <p style={{ margin: "2px 0 0", fontSize: "9px", color: "#64748b" }}>
        {count} line{count === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function EmptySectionNote({ label }: { label: string }) {
  return (
    <p
      style={{
        margin: "0 0 10px",
        padding: "8px 10px",
        backgroundColor: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: "4px",
        color: "#64748b",
        fontSize: "10px",
      }}
    >
      No {label} at the time of download.
    </p>
  );
}

function TotalsSummary({ totals }: { totals: PendingTotals }) {
  const rows: { label: string; value: number; emphasis?: boolean }[] = [
    { label: "Un Billed quantity", value: totals.unbilled },
    { label: "Process Pending quantity", value: totals.processPending },
    { label: "On Hold pending quantity", value: totals.onHold },
    {
      label: "Total pending quantity (incl. unbilled)",
      value: totals.total,
      emphasis: true,
    },
  ];

  return (
    <div
      style={{
        marginTop: "14px",
        padding: "12px 14px",
        backgroundColor: "#f8fafc",
        border: "1px solid #cbd5e1",
        borderRadius: "6px",
      }}
    >
      <div
        style={{
          margin: "0 0 8px",
          fontSize: "11px",
          fontWeight: 700,
          color: "#1e3a5f",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        Quantity summary
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td
                style={{
                  padding: "4px 0",
                  fontSize: row.emphasis ? "11px" : "10px",
                  fontWeight: row.emphasis ? 700 : 500,
                  color: row.emphasis ? "#0f172a" : "#475569",
                }}
              >
                {row.label}
              </td>
              <td
                style={{
                  padding: "4px 0",
                  textAlign: "right",
                  fontSize: row.emphasis ? "14px" : "11px",
                  fontWeight: 700,
                  color: row.emphasis ? "#0e7490" : "#334155",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UnbilledTableHead() {
  return (
    <thead>
      <tr>
        <th style={{ ...thStyle, width: "12%" }}>Order</th>
        <th style={{ ...thStyle, width: "11%" }}>Date</th>
        <th style={{ ...thStyle, width: "16%" }}>Party</th>
        <th style={{ ...thStyle, width: "12%" }}>Status</th>
        <th style={{ ...thStyle, width: "21%" }}>Product</th>
        <th style={{ ...thStyle, textAlign: "right" }}>Appr</th>
        <th style={{ ...thStyle, textAlign: "right" }}>Disp</th>
        <th style={{ ...thStyle, textAlign: "right" }}>Unbilled</th>
      </tr>
    </thead>
  );
}

function ListTableHead() {
  return (
    <thead>
      <tr>
        <th style={{ ...thStyle, width: "12%" }}>Order</th>
        <th style={{ ...thStyle, width: "11%" }}>Date</th>
        <th style={{ ...thStyle, width: "16%" }}>Party</th>
        <th style={{ ...thStyle, width: "14%" }}>Status</th>
        <th style={{ ...thStyle, width: "25%" }}>Product</th>
        <th style={{ ...thStyle, textAlign: "right" }}>Ordered</th>
        <th style={{ ...thStyle, textAlign: "right" }}>Pending</th>
      </tr>
    </thead>
  );
}

function ProductCell({ name, sku }: { name: string; sku?: string }) {
  return (
    <td style={tdStyle}>
      <div style={{ fontWeight: 600 }}>{name}</div>
      {sku ? (
        <div style={{ fontSize: "8px", color: "#64748b", marginTop: "1px" }}>
          SKU {sku}
        </div>
      ) : null}
    </td>
  );
}

function PageHeader({ letterhead }: { letterhead: PdfCompanyLetterhead }) {
  return (
    <header style={{ flexShrink: 0, marginBottom: "10px" }}>
      <div style={{ marginBottom: "10px" }}>
        <PdfLetterheadBrand letterhead={letterhead} />
      </div>
      <div style={{ marginBottom: "12px" }}>
        <PdfLetterheadRule />
      </div>
      <h1
        style={{
          margin: 0,
          fontSize: "15px",
          fontWeight: 700,
          color: "#0f172a",
        }}
      >
        Unbilled / Process Pending / On Hold Orders
      </h1>
      <p style={{ margin: "3px 0 0", color: "#64748b", fontSize: "10px" }}>
        Combined report generated from the orders modal
      </p>
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
        paddingTop: "8px",
        borderTop: "1px solid #cbd5e1",
        fontSize: "9px",
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
        <PdfLetterheadFooterCopy letterhead={letterhead} />
        <div style={{ textAlign: "right", flexShrink: 0, fontSize: "8px", color: "#94a3b8" }}>
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
    if (b.kind === "unbilled-row") {
      const line = b.line;
      rows.push(
        <tr key={`u-${line.orderNo}-${i}`}>
          <td style={{ ...tdStyle, fontWeight: 600 }}>{line.orderNo}</td>
          <td style={tdStyle}>{line.refOrderDate}</td>
          <td style={tdStyle}>{line.party}</td>
          <td style={tdStyle}>{line.statusLabel}</td>
          <ProductCell name={line.productName} sku={line.sku} />
          <td style={{ ...tdStyle, textAlign: "right" }}>{line.approved}</td>
          <td style={{ ...tdStyle, textAlign: "right" }}>
            {line.submittedDispatch}
          </td>
          <td
            style={{
              ...tdStyle,
              textAlign: "right",
              fontWeight: 700,
              color: "#0e7490",
            }}
          >
            {line.remaining}
          </td>
        </tr>,
      );
      i += 1;
      continue;
    }
    if (b.kind === "list-row") {
      const line = b.line;
      rows.push(
        <tr key={`l-${line.orderNo}-${i}`}>
          <td style={{ ...tdStyle, fontWeight: 600 }}>{line.orderNo}</td>
          <td style={tdStyle}>{line.refOrderDate}</td>
          <td style={tdStyle}>{line.party}</td>
          <td style={tdStyle}>{line.statusLabel}</td>
          <ProductCell name={line.productName} sku={line.sku} />
          <td style={{ ...tdStyle, textAlign: "right" }}>{line.ordered}</td>
          <td
            style={{
              ...tdStyle,
              textAlign: "right",
              fontWeight: 700,
              color: "#0e7490",
            }}
          >
            {line.pending}
          </td>
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
        {head.table === "unbilled" ? <UnbilledTableHead /> : <ListTableHead />}
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
    if (block.kind === "section") {
      nodes.push(
        <SectionHeading
          key={`sec-${i}`}
          title={block.title}
          count={block.count}
        />,
      );
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
    if (block.kind === "totals") {
      nodes.push(<TotalsSummary key={`totals-${i}`} totals={block.totals} />);
      i += 1;
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

export function UnbilledOrdersPdfTemplate({
  portalLabel,
  downloadedBy,
  generatedAt,
  unbilledLines,
  processPendingLines,
  onHoldLines,
}: UnbilledOrdersPdfTemplateProps) {
  const letterhead = usePdfCompanyLetterhead();
  const pages = useMemo(() => {
    const blocks = buildContentBlocks(
      unbilledLines,
      processPendingLines,
      onHoldLines,
    );
    return paginateBlocks(blocks);
  }, [unbilledLines, processPendingLines, onHoldLines]);

  return (
    <div id="unbilled-orders-pdf-root">
      {pages.map((page, idx) => (
        <div
          key={`pdf-page-${idx}`}
          data-pdf-page
          style={{
            ...pageShellStyle,
            marginBottom: idx < pages.length - 1 ? "12px" : 0,
          }}
        >
          <PageHeader letterhead={letterhead} />
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

export default UnbilledOrdersPdfTemplate;
