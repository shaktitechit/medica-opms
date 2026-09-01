"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import {
  PdfLetterheadBrand,
  PdfLetterheadFooterCopy,
  PdfLetterheadRule,
  usePdfCompanyLetterhead,
  type PdfCompanyLetterhead,
} from "./pdfCompanyLetterhead";

export type FinalOrderStatementPdfLine = {
  productName: string;
  sku?: string;
  hsnCode?: string;
  isKitShell?: boolean;
  isKitBucket?: boolean;
  ordered: string;
  approved: string;
  dispatched: string;
  delivered: string;
  returned: string;
  net: string;
  unitPrice: string;
  rateType: string;
  gstPercent: string;
  gstAmount: string;
  lineTotal: string;
};

export type FinalOrderStatementPdfTotals = {
  ordered: string;
  approved: string;
  dispatched: string;
  delivered: string;
  returned: string;
  net: string;
  gstAmount: string;
  grandTotal: string;
};

export type FinalOrderStatementPdfFinancialSummary = {
  subtotal: string;
  lineDiscountTotal: string;
  taxableAmount: string;
  gst: string;
  headerDiscount: string;
  extraCharges: string;
  penaltyAmount: string;
  damageCharge: string;
  grandTotal: string;
  paymentStatus: string;
};

export type FinalOrderStatementPdfTemplateProps = {
  companyName?: string;
  logoUrl?: string;
  statementNo: string;
  orderNo: string;
  partyName: string;
  partyCode?: string;
  partyGstin?: string;
  orderDate: string;
  closedAt: string;
  closedBy: string;
  closureRemarks?: string;
  lines: FinalOrderStatementPdfLine[];
  quantityTotals: FinalOrderStatementPdfTotals;
  financialSummary: FinalOrderStatementPdfFinancialSummary;
  generatedAt: string;
  /** Portal the statement was downloaded from (shown on every page footer). */
  portalLabel?: string;
  /** User who downloaded the statement (shown on every page footer). */
  downloadedBy?: string;
};

/** A4 @ 96dpi — each `[data-pdf-page]` is captured as one PDF page. */
const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;
const PAGE_PAD_X = 40;
const PAGE_PAD_Y = 28;
const HEADER_BLOCK_H = 186;
const FOOTER_BLOCK_H = 78;
const BODY_MAX_H = PAGE_HEIGHT - PAGE_PAD_Y * 2 - HEADER_BLOCK_H - FOOTER_BLOCK_H;

const H_META = 118;
const H_TABLE_HEAD = 32;
const H_ROW_BASE = 34;
const H_LINE_TOTALS = 34;
const H_QTY_SUMMARY = 96;
const H_FIN_SUMMARY = 220;

type ContentBlock =
  | { kind: "meta"; height: number }
  | { kind: "thead"; height: number }
  | { kind: "line"; line: FinalOrderStatementPdfLine; height: number }
  | { kind: "line-totals"; height: number }
  | { kind: "qty-summary"; height: number }
  | { kind: "fin-summary"; height: number };

type PageModel = { blocks: ContentBlock[] };

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
  padding: "8px 3px",
  textAlign: "left",
  fontWeight: 700,
  fontSize: "8px",
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
  padding: "7px 3px",
  border: "none",
  verticalAlign: "top",
  fontSize: "9px",
  lineHeight: 1.3,
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  marginBottom: "8px",
  tableLayout: "fixed",
};

function lineHeight(line: FinalOrderStatementPdfLine): number {
  let h = H_ROW_BASE;
  if (line.sku) h += 10;
  if (line.hsnCode) h += 10;
  if (line.isKitShell || line.isKitBucket) h += 4;
  return h;
}

function buildContentBlocks(
  lines: FinalOrderStatementPdfLine[],
  closureRemarks?: string,
  partyGstin?: string,
): ContentBlock[] {
  const metaH =
    H_META + (partyGstin ? 18 : 0) + (closureRemarks ? 28 : 0);
  const blocks: ContentBlock[] = [{ kind: "meta", height: metaH }];

  if (lines.length > 0) {
    blocks.push({ kind: "thead", height: H_TABLE_HEAD });
    for (const line of lines) {
      blocks.push({ kind: "line", line, height: lineHeight(line) });
    }
    blocks.push({ kind: "line-totals", height: H_LINE_TOTALS });
  }

  blocks.push({ kind: "qty-summary", height: H_QTY_SUMMARY });
  blocks.push({ kind: "fin-summary", height: H_FIN_SUMMARY });
  return blocks;
}

function paginateBlocks(blocks: ContentBlock[]): PageModel[] {
  const pages: PageModel[] = [];
  let current: ContentBlock[] = [];
  let used = 0;
  let inLines = false;

  const flush = () => {
    if (current.length === 0) return;
    pages.push({ blocks: current });
    current = [];
    used = 0;
  };

  for (const block of blocks) {
    if (block.kind === "thead") inLines = true;
    if (
      block.kind === "meta" ||
      block.kind === "qty-summary" ||
      block.kind === "fin-summary"
    ) {
      inLines = false;
    }

    let chunk: ContentBlock[] = [block];

    if (current.length === 0 && block.kind === "line" && inLines) {
      chunk = [
        { kind: "thead", height: H_TABLE_HEAD },
        block,
      ];
    }

    let chunkH = chunk.reduce((sum, b) => sum + b.height, 0);

    if (used + chunkH > BODY_MAX_H && current.length > 0) {
      flush();
      if (block.kind === "line") {
        chunk = [
          { kind: "thead", height: H_TABLE_HEAD },
          block,
        ];
        chunkH = chunk.reduce((sum, b) => sum + b.height, 0);
        inLines = true;
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

function PageHeader({
  letterhead,
  statementNo,
}: {
  letterhead: PdfCompanyLetterhead;
  statementNo: string;
}) {
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
        Final Order Statement
      </h1>
      <p style={{ margin: "3px 0 0", color: "#64748b", fontSize: "10px" }}>
        {statementNo}
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

function MetaBlock({
  orderNo,
  orderDate,
  partyName,
  partyCode,
  partyGstin,
  closedAt,
  closedBy,
  closureRemarks,
}: {
  orderNo: string;
  orderDate: string;
  partyName: string;
  partyCode?: string;
  partyGstin?: string;
  closedAt: string;
  closedBy: string;
  closureRemarks?: string;
}) {
  const label: CSSProperties = { padding: "4px 0", width: "22%", color: "#64748b" };
  const value: CSSProperties = { padding: "4px 0", fontWeight: 600 };

  return (
    <table
      style={{
        width: "100%",
        marginBottom: "14px",
        borderCollapse: "collapse",
      }}
    >
      <tbody>
        <tr>
          <td style={label}>Order No.</td>
          <td style={value}>{orderNo}</td>
          <td style={label}>Order Date</td>
          <td style={value}>{orderDate}</td>
        </tr>
        <tr>
          <td style={label}>Party</td>
          <td style={value}>{partyName}</td>
          <td style={label}>Closed At</td>
          <td style={value}>{closedAt}</td>
        </tr>
        <tr>
          <td style={label}>Party Code</td>
          <td style={value}>{partyCode || "—"}</td>
          <td style={label}>Closed By</td>
          <td style={value}>{closedBy}</td>
        </tr>
        {partyGstin ? (
          <tr>
            <td style={label}>GSTIN</td>
            <td colSpan={3} style={value}>
              {partyGstin}
            </td>
          </tr>
        ) : null}
        {closureRemarks ? (
          <tr>
            <td style={{ ...label, verticalAlign: "top" }}>Closure Remarks</td>
            <td colSpan={3} style={{ ...value, fontStyle: "italic", fontWeight: 500 }}>
              {closureRemarks}
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

function LinesTableHead() {
  return (
    <thead>
      <tr>
        <th style={{ ...thStyle, width: "18%" }}>Product</th>
        <th style={{ ...thStyle, textAlign: "right" }}>Ord</th>
        <th style={{ ...thStyle, textAlign: "right" }}>Appr</th>
        <th style={{ ...thStyle, textAlign: "right" }}>Disp</th>
        <th style={{ ...thStyle, textAlign: "right" }}>Deliv</th>
        <th style={{ ...thStyle, textAlign: "right" }}>Ret</th>
        <th style={{ ...thStyle, textAlign: "right" }}>Net</th>
        <th style={{ ...thStyle, textAlign: "right" }}>Rate</th>
        <th style={{ ...thStyle, textAlign: "center" }}>Type</th>
        <th style={{ ...thStyle, textAlign: "right" }}>GST%</th>
        <th style={{ ...thStyle, textAlign: "right" }}>GST</th>
        <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
      </tr>
    </thead>
  );
}

function LineRow({ line, idx }: { line: FinalOrderStatementPdfLine; idx: number }) {
  const kitBadge =
    line.isKitShell || line.isKitBucket ? (
      <span
        style={{
          marginLeft: 6,
          fontSize: "7px",
          fontWeight: 700,
          color: "#6d28d9",
          backgroundColor: "#f5f3ff",
          padding: "1px 4px",
          borderRadius: 3,
          letterSpacing: "0.02em",
        }}
      >
        {line.isKitShell ? "KIT" : "KIT BUCKET"}
      </span>
    ) : null;

  return (
    <tr key={`${line.productName}-${idx}`}>
      <td style={tdStyle}>
        <div
          style={
            line.isKitBucket
              ? {
                  marginLeft: 10,
                  paddingLeft: 8,
                  borderLeft: "2px solid #c4b5fd",
                }
              : undefined
          }
        >
          <div style={{ fontWeight: 600 }}>
            {line.productName}
            {kitBadge}
          </div>
          {line.sku ? (
            <div style={{ fontSize: "8px", color: "#64748b" }}>SKU {line.sku}</div>
          ) : null}
          {line.hsnCode ? (
            <div style={{ fontSize: "8px", color: "#64748b" }}>
              HSN {line.hsnCode}
            </div>
          ) : null}
        </div>
      </td>
      <td style={{ ...tdStyle, textAlign: "right" }}>{line.ordered}</td>
      <td style={{ ...tdStyle, textAlign: "right" }}>{line.approved}</td>
      <td style={{ ...tdStyle, textAlign: "right" }}>{line.dispatched}</td>
      <td style={{ ...tdStyle, textAlign: "right" }}>{line.delivered}</td>
      <td style={{ ...tdStyle, textAlign: "right" }}>{line.returned}</td>
      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{line.net}</td>
      <td style={{ ...tdStyle, textAlign: "right" }}>
        {line.isKitBucket ? "—" : line.unitPrice}
      </td>
      <td style={{ ...tdStyle, textAlign: "center" }}>
        {line.isKitBucket ? "—" : line.rateType}
      </td>
      <td style={{ ...tdStyle, textAlign: "right" }}>
        {line.isKitBucket ? "—" : line.gstPercent}
      </td>
      <td style={{ ...tdStyle, textAlign: "right" }}>
        {line.isKitBucket ? "—" : line.gstAmount}
      </td>
      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>
        {line.isKitBucket ? "—" : line.lineTotal}
      </td>
    </tr>
  );
}

function LineTotalsRow({
  quantityTotals,
}: {
  quantityTotals: FinalOrderStatementPdfTotals;
}) {
  return (
    <tr>
      <td style={{ ...tdStyle, fontWeight: 700 }}>Totals</td>
      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>
        {quantityTotals.ordered}
      </td>
      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>
        {quantityTotals.approved}
      </td>
      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>
        {quantityTotals.dispatched}
      </td>
      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>
        {quantityTotals.delivered}
      </td>
      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>
        {quantityTotals.returned}
      </td>
      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>
        {quantityTotals.net}
      </td>
      <td colSpan={3} style={tdStyle} />
      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>
        {quantityTotals.gstAmount}
      </td>
      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>
        {quantityTotals.grandTotal}
      </td>
    </tr>
  );
}

function QtySummary({
  quantityTotals,
}: {
  quantityTotals: FinalOrderStatementPdfTotals;
}) {
  return (
    <div
      style={{
        marginBottom: "12px",
        padding: "12px 14px",
        borderRadius: "8px",
        border: "1px solid #bfdbfe",
        backgroundColor: "#eff6ff",
      }}
    >
      <div
        style={{
          fontSize: "10px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#1d4ed8",
          marginBottom: "8px",
        }}
      >
        Quantity Summary (Settled)
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ padding: "3px 0", color: "#1e40af" }}>Ordered</td>
            <td style={{ padding: "3px 0", fontWeight: 600 }}>
              {quantityTotals.ordered}
            </td>
            <td style={{ padding: "3px 0", color: "#1e40af" }}>Approved</td>
            <td style={{ padding: "3px 0", fontWeight: 600 }}>
              {quantityTotals.approved}
            </td>
            <td style={{ padding: "3px 0", color: "#1e40af" }}>Dispatched</td>
            <td style={{ padding: "3px 0", fontWeight: 600 }}>
              {quantityTotals.dispatched}
            </td>
          </tr>
          <tr>
            <td style={{ padding: "3px 0", color: "#1e40af" }}>Delivered</td>
            <td style={{ padding: "3px 0", fontWeight: 600 }}>
              {quantityTotals.delivered}
            </td>
            <td style={{ padding: "3px 0", color: "#1e40af" }}>Returns</td>
            <td style={{ padding: "3px 0", fontWeight: 600 }}>
              {quantityTotals.returned}
            </td>
            <td style={{ padding: "3px 0", color: "#1e40af" }}>Net</td>
            <td style={{ padding: "3px 0", fontWeight: 600 }}>
              {quantityTotals.net}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function FinSummary({
  financialSummary,
}: {
  financialSummary: FinalOrderStatementPdfFinancialSummary;
}) {
  const fin = financialSummary;
  const financeRows: {
    label: string;
    value: string;
    tone?: "deduct" | "add";
  }[] = [
    { label: "Subtotal (settled net lines)", value: fin.subtotal },
    { label: "Line Discount Total", value: fin.lineDiscountTotal, tone: "deduct" },
    { label: "Taxable Amount", value: fin.taxableAmount },
    { label: "GST Amount", value: fin.gst },
    { label: "Header Discount", value: fin.headerDiscount, tone: "deduct" },
    { label: "Extra Charges", value: fin.extraCharges, tone: "add" },
    { label: "Penalty Amount", value: fin.penaltyAmount, tone: "add" },
    { label: "Damage Charge", value: fin.damageCharge, tone: "add" },
  ];

  return (
    <div
      style={{
        marginTop: "4px",
        padding: "14px 16px",
        borderRadius: "8px",
        border: "1px solid #a7f3d0",
        backgroundColor: "#ecfdf5",
      }}
    >
      <div
        style={{
          fontSize: "10px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#047857",
          marginBottom: "10px",
        }}
      >
        Financial Summary (Settled)
      </div>
      <div style={{ marginLeft: "auto", width: "320px" }}>
        {financeRows.map((row) => (
          <div
            key={row.label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "4px 0",
              fontSize: "11px",
            }}
          >
            <span style={{ color: "#065f46" }}>{row.label}</span>
            <span
              style={{
                fontWeight: 600,
                color: row.tone === "deduct" ? "#b91c1c" : "#0f172a",
              }}
            >
              ₹{row.value}
            </span>
          </div>
        ))}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "10px 0 0",
            marginTop: "8px",
            borderTop: "2px solid #047857",
            fontSize: "14px",
          }}
        >
          <span style={{ fontWeight: 700, color: "#065f46" }}>
            Settled Grand Total
          </span>
          <span style={{ fontWeight: 700, color: "#1e3a5f" }}>
            ₹{fin.grandTotal}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "8px 0 0",
            fontSize: "10px",
            color: "#047857",
          }}
        >
          <span>Payment Status</span>
          <span style={{ fontWeight: 600, textTransform: "capitalize" }}>
            {fin.paymentStatus}
          </span>
        </div>
      </div>
    </div>
  );
}

function renderLineChunk(
  blocks: ContentBlock[],
  start: number,
  quantityTotals: FinalOrderStatementPdfTotals,
): { node: ReactNode; end: number } {
  if (blocks[start]?.kind !== "thead") {
    return { node: null, end: start };
  }

  const rows: ReactNode[] = [];
  let i = start + 1;
  while (i < blocks.length) {
    const b = blocks[i]!;
    if (b.kind === "line") {
      rows.push(<LineRow key={`line-${i}`} line={b.line} idx={i} />);
      i += 1;
      continue;
    }
    if (b.kind === "line-totals") {
      rows.push(
        <LineTotalsRow key={`totals-${i}`} quantityTotals={quantityTotals} />,
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
        <LinesTableHead />
        <tbody>{rows}</tbody>
      </table>
    ),
  };
}

function PageBody({
  blocks,
  props,
}: {
  blocks: ContentBlock[];
  props: FinalOrderStatementPdfTemplateProps;
}) {
  const nodes: ReactNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i]!;
    if (block.kind === "meta") {
      nodes.push(
        <MetaBlock
          key={`meta-${i}`}
          orderNo={props.orderNo}
          orderDate={props.orderDate}
          partyName={props.partyName}
          partyCode={props.partyCode}
          partyGstin={props.partyGstin}
          closedAt={props.closedAt}
          closedBy={props.closedBy}
          closureRemarks={props.closureRemarks}
        />,
      );
      i += 1;
      continue;
    }
    if (block.kind === "thead") {
      const chunk = renderLineChunk(blocks, i, props.quantityTotals);
      nodes.push(<div key={`tbl-${i}`}>{chunk.node}</div>);
      i = chunk.end;
      continue;
    }
    if (block.kind === "qty-summary") {
      nodes.push(
        <QtySummary key={`qty-${i}`} quantityTotals={props.quantityTotals} />,
      );
      i += 1;
      continue;
    }
    if (block.kind === "fin-summary") {
      nodes.push(
        <FinSummary
          key={`fin-${i}`}
          financialSummary={props.financialSummary}
        />,
      );
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

export function FinalOrderStatementPdfTemplate(
  props: FinalOrderStatementPdfTemplateProps,
) {
  const letterhead = usePdfCompanyLetterhead();
  const {
    statementNo,
    lines,
    partyGstin,
    closureRemarks,
    generatedAt,
    portalLabel = "Portal",
    downloadedBy = "—",
  } = props;

  const pages = useMemo(
    () =>
      paginateBlocks(
        buildContentBlocks(lines, closureRemarks, partyGstin),
      ),
    [lines, closureRemarks, partyGstin],
  );

  return (
    <div id="final-order-statement-pdf-root">
      {pages.map((page, idx) => (
        <div
          key={`fos-page-${idx}`}
          data-pdf-page
          style={{
            ...pageShellStyle,
            marginBottom: idx < pages.length - 1 ? "12px" : 0,
          }}
        >
          <PageHeader letterhead={letterhead} statementNo={statementNo} />
          <PageBody blocks={page.blocks} props={props} />
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

export default FinalOrderStatementPdfTemplate;
