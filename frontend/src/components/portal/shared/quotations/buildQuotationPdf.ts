/**
 * @fileoverview Pure Vector jsPDF Builder for Quotations.
 * Generates 100% crisp vector PDFs without html2canvas DOM capture or layout shifting.
 * @module components/portal/shared/quotations/buildQuotationPdf
 */

import type { LeadQuotationRecord } from "@/store/api";

type JsPDF = InstanceType<(typeof import("jspdf"))["jsPDF"]>;

export type QuotationCompanyInfo = {
  trade_name?: string;
  legal_name?: string;
  logo_url?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  bank_name?: string;
  account_name?: string;
  account_number?: string;
  ifsc_code?: string;
  branch_name?: string;
  account_type?: string;
  upi_id?: string;
  swift_code?: string;
};

export type BuildQuotationPdfInput = {
  quotation: LeadQuotationRecord;
  company?: QuotationCompanyInfo;
  portalLabel?: string;
  downloadedBy?: string;
};

// Brand Color Palette (RGB)
const NAVY: [number, number, number] = [30, 58, 95];
const BLUE: [number, number, number] = [37, 99, 235];
const DARK: [number, number, number] = [15, 23, 42];
const TEXT: [number, number, number] = [51, 65, 85];
const MUTED: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [203, 213, 225];
const LIGHT_BG: [number, number, number] = [248, 250, 252];
const ACCENT_BG: [number, number, number] = [239, 246, 255];

const PAGE_W = 210;
const PAGE_H = 297;
const M = 10; // 10mm margins
const CONTENT_W = PAGE_W - M * 2; // 190mm

function formatCurrency(amount?: number): string {
  if (amount == null || Number.isNaN(amount)) return "0.00";
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  } catch {
    return dateStr;
  }
}

async function loadLogo(url?: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:image/")) return url;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "") || null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Rich-text run styling produced by the terms RichTextEditor (contentEditable HTML). */
type RichTextStyle = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: [number, number, number];
  highlight: [number, number, number] | null;
};

type RichTextRun = {
  text: string;
  style: RichTextStyle;
};

type RichTextLine = {
  runs: RichTextRun[];
  indentMm: number;
  prefix: string;
};

const DEFAULT_RICH_STYLE: RichTextStyle = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  color: TEXT,
  highlight: null,
};

function isHtmlContent(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(value);
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/<br\s*\/?>/gi, "\n");
}

function parseCssColor(value: string | null | undefined): [number, number, number] | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === "transparent" || v === "inherit" || v === "initial") return null;

  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1];
    if (h.length === 3) {
      return [
        parseInt(h[0] + h[0], 16),
        parseInt(h[1] + h[1], 16),
        parseInt(h[2] + h[2], 16),
      ];
    }
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }

  const rgb = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }

  return null;
}

function cloneRichStyle(style: RichTextStyle): RichTextStyle {
  return {
    ...style,
    color: [...style.color] as [number, number, number],
    highlight: style.highlight
      ? ([...style.highlight] as [number, number, number])
      : null,
  };
}

function applyNodeStyle(el: Element, style: RichTextStyle): RichTextStyle {
  const next = cloneRichStyle(style);
  const tag = el.tagName.toLowerCase();

  if (tag === "b" || tag === "strong") next.bold = true;
  if (tag === "i" || tag === "em") next.italic = true;
  if (tag === "u") next.underline = true;
  if (tag === "s" || tag === "strike" || tag === "del") next.strike = true;

  if (tag === "font") {
    const faceColor = parseCssColor(el.getAttribute("color"));
    if (faceColor) next.color = faceColor;
  }

  const inline = (el.getAttribute("style") || "").toLowerCase();
  if (inline.includes("font-weight") && /bold|[5-9]00/.test(inline)) next.bold = true;
  if (inline.includes("font-style") && inline.includes("italic")) next.italic = true;
  if (inline.includes("text-decoration") && inline.includes("underline")) next.underline = true;
  if (
    inline.includes("text-decoration") &&
    (inline.includes("line-through") || inline.includes("strikethrough"))
  ) {
    next.strike = true;
  }

  const colorMatch = inline.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
  if (colorMatch) {
    const parsed = parseCssColor(colorMatch[1]);
    if (parsed) next.color = parsed;
  }

  const bgMatch = inline.match(
    /(?:^|;)\s*(?:background(?:-color)?)\s*:\s*([^;]+)/i
  );
  if (bgMatch) {
    const parsed = parseCssColor(bgMatch[1]);
    if (parsed) next.highlight = parsed;
  }

  return next;
}

function pushRun(runs: RichTextRun[], text: string, style: RichTextStyle) {
  if (!text) return;
  const last = runs[runs.length - 1];
  if (
    last &&
    last.style.bold === style.bold &&
    last.style.italic === style.italic &&
    last.style.underline === style.underline &&
    last.style.strike === style.strike &&
    last.style.color[0] === style.color[0] &&
    last.style.color[1] === style.color[1] &&
    last.style.color[2] === style.color[2] &&
    ((last.style.highlight === null && style.highlight === null) ||
      (last.style.highlight &&
        style.highlight &&
        last.style.highlight[0] === style.highlight[0] &&
        last.style.highlight[1] === style.highlight[1] &&
        last.style.highlight[2] === style.highlight[2]))
  ) {
    last.text += text;
    return;
  }
  runs.push({ text, style: cloneRichStyle(style) });
}

function flushLine(
  lines: RichTextLine[],
  runs: RichTextRun[],
  indentMm: number,
  prefix: string
) {
  const meaningful = runs.some((r) => r.text.trim().length > 0);
  if (!meaningful && !prefix) {
    runs.length = 0;
    return;
  }
  lines.push({
    runs: runs.map((r) => ({ text: r.text, style: cloneRichStyle(r.style) })),
    indentMm,
    prefix,
  });
  runs.length = 0;
}

/**
 * Converts rich-editor HTML (or plain text) into drawable PDF lines with style runs.
 */
function parseRichTextToLines(raw: string): RichTextLine[] {
  const cleaned = raw.replace(/^\d+\)\s*/, "").trim();
  if (!cleaned) return [];

  if (!isHtmlContent(cleaned) || typeof DOMParser === "undefined") {
    return [
      {
        runs: [{ text: decodeHtmlEntities(cleaned), style: cloneRichStyle(DEFAULT_RICH_STYLE) }],
        indentMm: 0,
        prefix: "",
      },
    ];
  }

  const doc = new DOMParser().parseFromString(
    `<div id="rich-root">${cleaned}</div>`,
    "text/html"
  );
  const root = doc.getElementById("rich-root");
  if (!root) {
    return [
      {
        runs: [{ text: decodeHtmlEntities(cleaned.replace(/<[^>]+>/g, "")), style: cloneRichStyle(DEFAULT_RICH_STYLE) }],
        indentMm: 0,
        prefix: "",
      },
    ];
  }

  const lines: RichTextLine[] = [];
  const currentRuns: RichTextRun[] = [];
  let listCounters: number[] = [];

  const walk = (
    node: Node,
    style: RichTextStyle,
    listDepth: number,
    listType: "ul" | "ol" | null,
    pendingPrefix: { value: string }
  ) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || "").replace(/\u00a0/g, " ");
      if (!text) return;
      // Collapse excessive whitespace but keep intentional spaces
      const normalized = text.replace(/[ \t\f\v]+/g, " ");
      if (!normalized) return;
      pushRun(currentRuns, normalized, style);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === "br") {
      flushLine(lines, currentRuns, listDepth * 3, pendingPrefix.value);
      pendingPrefix.value = "";
      return;
    }

    if (tag === "ul" || tag === "ol") {
      if (currentRuns.length) {
        flushLine(lines, currentRuns, listDepth * 3, pendingPrefix.value);
        pendingPrefix.value = "";
      }
      if (tag === "ol") listCounters.push(0);
      for (const child of Array.from(el.childNodes)) {
        walk(child, style, listDepth + 1, tag, pendingPrefix);
      }
      if (tag === "ol") listCounters.pop();
      return;
    }

    if (tag === "li") {
      if (currentRuns.length) {
        flushLine(lines, currentRuns, Math.max(0, listDepth - 1) * 3, pendingPrefix.value);
        pendingPrefix.value = "";
      }
      let prefix = "• ";
      if (listType === "ol") {
        const idx = listCounters.length - 1;
        listCounters[idx] = (listCounters[idx] || 0) + 1;
        prefix = `${listCounters[idx]}. `;
      }
      pendingPrefix.value = prefix;
      const nextStyle = applyNodeStyle(el, style);
      for (const child of Array.from(el.childNodes)) {
        walk(child, nextStyle, listDepth, listType, pendingPrefix);
      }
      flushLine(lines, currentRuns, Math.max(0, listDepth - 1) * 3 + (listDepth > 0 ? 3 : 0), pendingPrefix.value);
      pendingPrefix.value = "";
      return;
    }

    if (tag === "div" || tag === "p" || tag === "h1" || tag === "h2" || tag === "h3") {
      if (currentRuns.length) {
        flushLine(lines, currentRuns, listDepth * 3, pendingPrefix.value);
        pendingPrefix.value = "";
      }
      const nextStyle = applyNodeStyle(el, style);
      for (const child of Array.from(el.childNodes)) {
        walk(child, nextStyle, listDepth, listType, pendingPrefix);
      }
      flushLine(lines, currentRuns, listDepth * 3, pendingPrefix.value);
      pendingPrefix.value = "";
      return;
    }

    const nextStyle = applyNodeStyle(el, style);
    for (const child of Array.from(el.childNodes)) {
      walk(child, nextStyle, listDepth, listType, pendingPrefix);
    }
  };

  walk(root, cloneRichStyle(DEFAULT_RICH_STYLE), 0, null, { value: "" });
  flushLine(lines, currentRuns, 0, "");

  return lines.filter(
    (line) => line.prefix || line.runs.some((r) => r.text.trim().length > 0)
  );
}

function helveticaStyle(style: RichTextStyle): "normal" | "bold" | "italic" | "bolditalic" {
  if (style.bold && style.italic) return "bolditalic";
  if (style.bold) return "bold";
  if (style.italic) return "italic";
  return "normal";
}

function measureStyledWidth(pdf: JsPDF, text: string, style: RichTextStyle, fontSize: number): number {
  pdf.setFont("helvetica", helveticaStyle(style));
  pdf.setFontSize(fontSize);
  return pdf.getTextWidth(text);
}

function splitTokenToFit(
  pdf: JsPDF,
  text: string,
  style: RichTextStyle,
  fontSize: number,
  maxW: number
): { fit: string; rest: string } {
  if (maxW <= 0) return { fit: text.slice(0, 1), rest: text.slice(1) };
  if (measureStyledWidth(pdf, text, style, fontSize) <= maxW) {
    return { fit: text, rest: "" };
  }
  let lo = 1;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measureStyledWidth(pdf, text.slice(0, mid), style, fontSize) <= maxW) lo = mid;
    else hi = mid - 1;
  }
  const count = Math.max(1, lo);
  return { fit: text.slice(0, count), rest: text.slice(count) };
}

/**
 * Draws rich-editor HTML/plain text into the PDF and returns height consumed (mm).
 * Supports bold/italic/underline/strikethrough, colors, highlights, and lists.
 */
function drawRichTextBlock(
  pdf: JsPDF,
  rawHtml: string,
  startX: number,
  startY: number,
  maxWidth: number,
  options: {
    fontSize?: number;
    lineHeight?: number;
    /** Called before each visual row; may add a page and must return the Y to draw at. */
    ensureSpace?: (neededH: number, proposedY: number) => number;
  } = {}
): { height: number; endY: number } {
  const fontSize = options.fontSize ?? 6.5;
  const lineHeight = options.lineHeight ?? 2.8;
  const lines = parseRichTextToLines(rawHtml);
  if (lines.length === 0) return { height: 0, endY: startY };

  let y = startY;
  const originY = startY;

  for (const line of lines) {
    const baseX = startX + line.indentMm;
    const width = Math.max(18, maxWidth - line.indentMm);
    const prefixW = line.prefix
      ? measureStyledWidth(pdf, line.prefix, DEFAULT_RICH_STYLE, fontSize)
      : 0;

    type Placed = { text: string; style: RichTextStyle; x: number; w: number };
    const visualRows: Array<{ prefix: string; cells: Placed[] }> = [];
    let cells: Placed[] = [];
    let cursor = baseX + prefixW;
    let rowHasPrefix = Boolean(line.prefix);

    const pushVisualRow = () => {
      visualRows.push({
        prefix: rowHasPrefix ? line.prefix : "",
        cells,
      });
      cells = [];
      cursor = baseX;
      rowHasPrefix = false;
    };

    const tokens: Array<{ text: string; style: RichTextStyle; isSpace: boolean }> = [];
    for (const run of line.runs) {
      for (const part of run.text.split(/(\s+)/)) {
        if (!part) continue;
        tokens.push({ text: part, style: run.style, isSpace: /^\s+$/.test(part) });
      }
    }

    if (tokens.length === 0 && line.prefix) {
      visualRows.push({ prefix: line.prefix, cells: [] });
    }

    for (const token of tokens) {
      if (token.isSpace && cells.length === 0) continue;

      let remaining = token.text;
      while (remaining) {
        const rightEdge = baseX + width;
        const available = rightEdge - cursor;

        if (!token.isSpace && available < 1.5 && cells.length > 0) {
          pushVisualRow();
          continue;
        }

        const { fit, rest } = splitTokenToFit(pdf, remaining, token.style, fontSize, Math.max(available, 1));
        const fitW = measureStyledWidth(pdf, fit, token.style, fontSize);

        if (!token.isSpace && fitW > available && cells.length > 0 && rest === remaining) {
          // Nothing fits on this row — wrap first
          pushVisualRow();
          continue;
        }

        cells.push({ text: fit, style: token.style, x: cursor, w: fitW });
        cursor += fitW;
        remaining = rest;

        if (remaining) pushVisualRow();
      }
    }

    if (cells.length > 0 || (visualRows.length === 0 && line.prefix)) {
      pushVisualRow();
    }

    for (const visual of visualRows) {
      if (options.ensureSpace) {
        y = options.ensureSpace(lineHeight, y);
      }

      if (visual.prefix) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(fontSize);
        pdf.setTextColor(...TEXT);
        pdf.text(visual.prefix, baseX, y);
      }

      for (const cell of visual.cells) {
        if (cell.style.highlight) {
          pdf.setFillColor(...cell.style.highlight);
          pdf.rect(cell.x, y - fontSize * 0.28, cell.w, lineHeight * 0.85, "F");
        }
        pdf.setFont("helvetica", helveticaStyle(cell.style));
        pdf.setFontSize(fontSize);
        pdf.setTextColor(...cell.style.color);
        pdf.text(cell.text, cell.x, y);

        if (cell.style.underline) {
          pdf.setDrawColor(...cell.style.color);
          pdf.setLineWidth(0.15);
          pdf.line(cell.x, y + 0.4, cell.x + cell.w, y + 0.4);
        }
        if (cell.style.strike) {
          pdf.setDrawColor(...cell.style.color);
          pdf.setLineWidth(0.15);
          pdf.line(cell.x, y - 0.7, cell.x + cell.w, y - 0.7);
        }
      }

      y += lineHeight;
    }

    y += 0.35;
  }

  return { height: y - originY, endY: y };
}

/**
 * Builds a vector-based jsPDF document for Quotation.
 */
export async function buildQuotationPdf(input: BuildQuotationPdfInput): Promise<JsPDF> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const { quotation, company, portalLabel = "Medica OPMS", downloadedBy } = input;

  const companyName =
    company?.trade_name ||
    company?.legal_name ||
    quotation.company_name ||
    "Medica Enterprises";

  const companyAddress = company?.address
    ? [
        company.address,
        company.city,
        company.state && company.pincode ? `${company.state} - ${company.pincode}` : company.state || company.pincode,
        company.country,
      ]
        .filter(Boolean)
        .join(", ")
    : quotation.company_regd_address || "";

  const companyPhone = company?.phone || quotation.company_phone || "";
  const companyEmail = company?.email || quotation.company_email || "";
  const companyGstin = company?.gstin || quotation.company_gstin || "";

  const contactLine = [
    companyPhone ? `Phone: ${companyPhone}` : "",
    companyEmail ? `Email: ${companyEmail}` : "",
    companyGstin ? `GSTIN: ${companyGstin}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const customerName = quotation.customer_name
    ? quotation.customer_name.startsWith("M/s")
      ? quotation.customer_name
      : `M/s. ${quotation.customer_name}`
    : "";

  const customerAddress = quotation.address
    ? [
        quotation.address.address_line_1,
        quotation.address.city,
        quotation.address.state,
        quotation.address.pincode,
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  const refNumber = quotation.ref_no || quotation.quotation_no || "";
  const quotationDate = formatDate(quotation.quotation_date);

  const logoData = await loadLogo(company?.logo_url);

  let currentY = M;

  // Helper: Draw Header & Brand
  const drawHeader = () => {
    if (logoData) {
      try {
        pdf.addImage(logoData, "PNG", M, currentY, 28, 12, undefined, "FAST");
      } catch {
        // Fallback gracefully
      }
    }

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.setTextColor(...NAVY);
    pdf.text(companyName.toUpperCase(), PAGE_W / 2, currentY + 4, { align: "center" });

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(...TEXT);
    if (companyAddress) {
      pdf.text(companyAddress, PAGE_W / 2, currentY + 8, { align: "center" });
    }
    if (contactLine) {
      pdf.text(contactLine, PAGE_W / 2, currentY + 11.5, { align: "center" });
    }

    currentY += 14;
    pdf.setDrawColor(...NAVY);
    pdf.setLineWidth(0.5);
    pdf.line(M, currentY, PAGE_W - M, currentY);

    currentY += 4;
  };

  // Helper: Draw Quotation Title & Ref Bar
  const drawTitleBar = () => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(...NAVY);
    pdf.text("QUOTATION", M, currentY + 3);

    pdf.setFontSize(7.5);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...TEXT);
    pdf.text("Ref. No. :", PAGE_W - M - 30, currentY + 1, { align: "right" });
    pdf.setTextColor(...BLUE);
    pdf.text(refNumber, PAGE_W - M, currentY + 1, { align: "right" });

    if (quotationDate) {
      pdf.setTextColor(...TEXT);
      pdf.text("Date :", PAGE_W - M - 30, currentY + 4.5, { align: "right" });
      pdf.setFont("helvetica", "normal");
      pdf.text(quotationDate, PAGE_W - M, currentY + 4.5, { align: "right" });
    }

    currentY += 7;
    pdf.setDrawColor(...LINE);
    pdf.setLineWidth(0.3);
    pdf.line(M, currentY, PAGE_W - M, currentY);
    currentY += 3;
  };

  // Helper: Draw Customer & Proposal Box
  const drawCustomerBox = () => {
    const boxX = M;
    const boxW = CONTENT_W;
    const col1W = 105;
    const col2W = boxW - col1W;

    const leftLines: Array<{ label?: string; val: string; bold?: boolean; color?: [number, number, number] }> = [];
    if (customerName) {
      leftLines.push({ val: customerName, bold: true, color: DARK });
    }
    if (customerAddress) {
      leftLines.push({ val: customerAddress, bold: false, color: TEXT });
    }
    if (quotation.gstin) {
      leftLines.push({ label: "GSTIN: ", val: quotation.gstin });
    }
    if (quotation.phone) {
      leftLines.push({ label: "Tel: ", val: quotation.phone });
    }
    if (quotation.cell) {
      leftLines.push({ label: "Cell: ", val: quotation.cell });
    }
    if (quotation.email) {
      leftLines.push({ label: "E-mail: ", val: quotation.email });
    }

    const rightLines: Array<{ label: string; val: string; bold?: boolean; color?: [number, number, number] }> = [];
    if (quotation.kind_attn) {
      rightLines.push({ label: "Kind Attn : ", val: quotation.kind_attn, bold: true });
    }
    if (quotation.subject) {
      rightLines.push({ label: "Sub. : ", val: quotation.subject, bold: true, color: NAVY });
    }

    const leftH = Math.max(leftLines.length * 3.5 + 4, 18);
    const rightH = Math.max(rightLines.length * 4.5 + 4, 18);
    const boxH = Math.max(leftH, rightH);

    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(...LINE);
    pdf.setLineWidth(0.3);
    pdf.rect(boxX, currentY, boxW, boxH, "FD");

    pdf.line(boxX + col1W, currentY, boxX + col1W, currentY + boxH);

    let y = currentY + 4;
    for (const line of leftLines) {
      pdf.setFont("helvetica", line.bold ? "bold" : "normal");
      pdf.setFontSize(line.bold ? 8 : 6.8);
      pdf.setTextColor(...(line.color || TEXT));
      const fullText = line.label ? `${line.label}${line.val}` : line.val;
      const wrapped = pdf.splitTextToSize(fullText, col1W - 6);
      pdf.text(wrapped, boxX + 3, y);
      y += wrapped.length * 3.2;
    }

    y = currentY + 4;
    for (const line of rightLines) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7);
      pdf.setTextColor(...TEXT);
      pdf.text(line.label, boxX + col1W + 3, y);
      const labelW = pdf.getTextWidth(line.label);

      pdf.setFont("helvetica", line.bold ? "bold" : "normal");
      pdf.setTextColor(...(line.color || DARK));
      const wrapped = pdf.splitTextToSize(line.val, col2W - labelW - 6);
      pdf.text(wrapped, boxX + col1W + 3 + labelW, y);
      y += wrapped.length * 3.6 + 1;
    }

    currentY += boxH + 4;
  };

  drawHeader();
  drawTitleBar();
  drawCustomerBox();

  const cols = [
    { key: "sr", label: "Sr.", w: 8, align: "center" as const },
    { key: "desc", label: "Description of Goods", w: 54, align: "left" as const },
    { key: "hsn", label: "HSN/SAC", w: 16, align: "center" as const },
    { key: "qty", label: "QTY", w: 14, align: "center" as const },
    { key: "rate", label: "Rate (Rs.)", w: 20, align: "right" as const },
    { key: "sub", label: "Sub Total", w: 22, align: "right" as const },
    { key: "gstRate", label: "GST %", w: 14, align: "center" as const },
    { key: "gstAmt", label: "GST Amt", w: 18, align: "right" as const },
    { key: "total", label: "Total (Rs.)", w: 24, align: "right" as const },
  ];

  const checkPageBreak = (neededH: number) => {
    if (currentY + neededH > PAGE_H - M - 12) {
      pdf.addPage();
      currentY = M;
      drawHeader();
      drawTableHeaders();
    }
  };

  const drawTableHeaders = () => {
    pdf.setFillColor(...NAVY);
    pdf.rect(M, currentY, CONTENT_W, 6, "F");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.8);
    pdf.setTextColor(255, 255, 255);

    let x = M;
    for (const c of cols) {
      const textX = c.align === "center" ? x + c.w / 2 : c.align === "right" ? x + c.w - 1.5 : x + 1.5;
      pdf.text(c.label, textX, currentY + 4.2, { align: c.align });
      x += c.w;
    }
    currentY += 6;
  };

  drawTableHeaders();

  const items = quotation.items || [];
  let rowIndex = 0;

  for (const it of items) {
    rowIndex += 1;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    const titleLines = pdf.splitTextToSize(it.product_name || "Item", 51);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    const descLines = it.description ? pdf.splitTextToSize(it.description, 51) : [];

    const totalTextLines = titleLines.length + descLines.length;
    const rHeight = Math.max(totalTextLines * 3.2 + 3, 7);

    checkPageBreak(rHeight);

    if (rowIndex % 2 === 0) {
      pdf.setFillColor(...LIGHT_BG);
      pdf.rect(M, currentY, CONTENT_W, rHeight, "F");
    }

    pdf.setDrawColor(...LINE);
    pdf.setLineWidth(0.2);
    pdf.rect(M, currentY, CONTENT_W, rHeight, "S");

    let x = M;
    for (const c of cols) {
      pdf.line(x + c.w, currentY, x + c.w, currentY + rHeight);
      x += c.w;
    }

    x = M;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(...MUTED);
    pdf.text(String(rowIndex), x + cols[0].w / 2, currentY + 4.2, { align: "center" });
    x += cols[0].w;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.setTextColor(...DARK);
    let descY = currentY + 3.8;
    for (const tl of titleLines) {
      pdf.text(tl, x + 1.5, descY);
      descY += 3.2;
    }
    if (descLines.length > 0) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(6.5);
      pdf.setTextColor(...MUTED);
      for (const dl of descLines) {
        pdf.text(dl, x + 1.5, descY);
        descY += 2.8;
      }
    }
    x += cols[1].w;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(...TEXT);
    pdf.text(it.hsn_code || "—", x + cols[2].w / 2, currentY + 4.2, { align: "center" });
    x += cols[2].w;

    pdf.setFont("helvetica", "bold");
    pdf.text(`${it.quantity} ${it.unit || ""}`.trim(), x + cols[3].w / 2, currentY + 4.2, { align: "center" });
    x += cols[3].w;

    pdf.setFont("helvetica", "normal");
    pdf.text(formatCurrency(it.rate), x + cols[4].w - 1.5, currentY + 4.2, { align: "right" });
    x += cols[4].w;

    pdf.text(formatCurrency(it.taxable_amount), x + cols[5].w - 1.5, currentY + 4.2, { align: "right" });
    x += cols[5].w;

    pdf.text(`${it.gst_rate}%`, x + cols[6].w / 2, currentY + 4.2, { align: "center" });
    x += cols[6].w;

    pdf.text(formatCurrency(it.total_gst_amount), x + cols[7].w - 1.5, currentY + 4.2, { align: "right" });
    x += cols[7].w;

    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...DARK);
    pdf.text(formatCurrency(it.line_total), x + cols[8].w - 1.5, currentY + 4.2, { align: "right" });

    currentY += rHeight;
  }

  const summaryH = 22;
  checkPageBreak(summaryH + 4);

  const leftW = 112;
  const rightW = CONTENT_W - leftW;

  pdf.setDrawColor(...LINE);
  pdf.setLineWidth(0.3);
  pdf.rect(M, currentY, CONTENT_W, summaryH, "S");
  pdf.line(M + leftW, currentY, M + leftW, currentY + summaryH);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.8);
  pdf.setTextColor(...MUTED);
  pdf.text("AMOUNT CHARGEABLE (IN WORDS):", M + 3, currentY + 4.5);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...NAVY);
  const words = quotation.amount_in_words || "—";
  const wrappedWords = pdf.splitTextToSize(words, leftW - 6);
  pdf.text(wrappedWords, M + 3, currentY + 8.5);

  let rightY = currentY;
  const renderSummaryRow = (label: string, val: string, isGrand = false) => {
    if (isGrand) {
      pdf.setFillColor(...ACCENT_BG);
      pdf.rect(M + leftW, rightY, rightW, 6.5, "F");
      pdf.setDrawColor(...LINE);
      pdf.line(M + leftW, rightY, M + CONTENT_W, rightY);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.5);
      pdf.setTextColor(...NAVY);
      pdf.text(label, M + leftW + 3, rightY + 4.5);
      pdf.text(val, PAGE_W - M - 2, rightY + 4.5, { align: "right" });
      rightY += 6.5;
    } else {
      pdf.setDrawColor(...LINE);
      pdf.line(M + leftW, rightY + 5, M + CONTENT_W, rightY + 5);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(...TEXT);
      pdf.text(label, M + leftW + 3, rightY + 3.8);
      pdf.setFont("helvetica", "bold");
      pdf.text(val, PAGE_W - M - 2, rightY + 3.8, { align: "right" });
      rightY += 5;
    }
  };

  renderSummaryRow("Sub Total (Taxable):", `Rs. ${formatCurrency(quotation.subtotal)}`);
  renderSummaryRow("Total GST:", `Rs. ${formatCurrency(quotation.total_gst)}`);
  if (quotation.round_off !== undefined && quotation.round_off !== 0) {
    renderSummaryRow("Round Off:", `Rs. ${formatCurrency(quotation.round_off)}`);
  }
  renderSummaryRow("Grand Total (INR):", `Rs. ${formatCurrency(quotation.grand_total)}`, true);

  currentY += summaryH + 4;

  const terms = quotation.terms_and_conditions || [];
  if (terms.length > 0) {
    checkPageBreak(15);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.setTextColor(...NAVY);
    pdf.text("GENERAL TERMS & CONDITIONS", M, currentY + 3);

    pdf.setDrawColor(...LINE);
    pdf.setLineWidth(0.3);
    pdf.line(M, currentY + 4.5, PAGE_W - M, currentY + 4.5);
    currentY += 6.5;

    for (let i = 0; i < terms.length; i += 1) {
      checkPageBreak(4);

      const indexLabel = `${i + 1})`;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(6.5);
      pdf.setTextColor(...NAVY);
      pdf.text(indexLabel, M + 1, currentY);
      const indexW = pdf.getTextWidth(indexLabel) + 1.5;

      const drawn = drawRichTextBlock(
        pdf,
        terms[i],
        M + 1 + indexW,
        currentY,
        CONTENT_W - 4 - indexW,
        {
          fontSize: 6.5,
          lineHeight: 2.8,
          ensureSpace: (neededH, proposedY) => {
            currentY = proposedY;
            checkPageBreak(neededH);
            return currentY;
          },
        }
      );
      currentY = drawn.endY + 0.8;
    }
    currentY += 3;
  }

  // COMPANY BANK DETAILS
  const bankName = (company?.bank_name as string) || quotation.bank_name || "";
  const accountNumber = (company?.account_number as string) || quotation.account_number || "";
  const ifscCode = (company?.ifsc_code as string) || quotation.ifsc_code || "";
  const accountName = (company?.account_name as string) || quotation.account_name || companyName || "";
  const branchName = (company?.branch_name as string) || quotation.branch_name || "";
  const accountType = (company?.account_type as string) || quotation.account_type || "";

  if (bankName || accountNumber || ifscCode) {
    checkPageBreak(18);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.setTextColor(...NAVY);
    pdf.text("COMPANY BANK DETAILS", M, currentY + 3);

    pdf.setDrawColor(...LINE);
    pdf.setLineWidth(0.3);
    pdf.line(M, currentY + 4.5, PAGE_W - M, currentY + 4.5);
    currentY += 6.5;

    pdf.setFillColor(...LIGHT_BG);
    pdf.rect(M, currentY, CONTENT_W, 10, "F");
    pdf.setDrawColor(...LINE);
    pdf.rect(M, currentY, CONTENT_W, 10, "S");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(...TEXT);

    const bankItems = [
      bankName ? `Bank Name: ${bankName}` : "",
      accountName ? `A/c Name: ${accountName}` : "",
      accountNumber ? `A/c No: ${accountNumber}` : "",
      ifscCode ? `IFSC: ${ifscCode}` : "",
      branchName ? `Branch: ${branchName}` : "",
      accountType ? `Type: ${accountType}` : "",
    ].filter(Boolean);

    const bankStr = bankItems.join("  |  ");
    const wrappedBank = pdf.splitTextToSize(bankStr, CONTENT_W - 4);
    pdf.text(wrappedBank, M + 2, currentY + 4);

    currentY += 14;
  }

  checkPageBreak(24);
  pdf.setDrawColor(...LINE);
  pdf.setLineWidth(0.4);
  pdf.setLineDashPattern([2, 2], 0);
  pdf.line(M, currentY, PAGE_W - M, currentY);
  pdf.setLineDashPattern([], 0);

  currentY += 4;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...NAVY);
  pdf.text("Thanks and Regards,", M, currentY + 2);
  pdf.setTextColor(...DARK);
  pdf.text(`For ${companyName}`, M, currentY + 5.5);

  const sigName = quotation.signatory_name || "Authorized Signatory";
  const sigDesig = quotation.signatory_designation || "";
  const sigContacts = [quotation.signatory_phone || companyPhone, quotation.signatory_email || companyEmail]
    .filter(Boolean)
    .join(" | ");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.text(sigName, M, currentY + 16);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.5);
  pdf.setTextColor(...MUTED);
  if (sigDesig) {
    pdf.text(sigDesig, M, currentY + 19);
  }
  if (sigContacts) {
    pdf.text(sigContacts, M, currentY + 22);
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...NAVY);
  pdf.text("Order Acceptance", PAGE_W - M, currentY + 2, { align: "right" });

  if (customerName) {
    pdf.setTextColor(...DARK);
    pdf.text(customerName, PAGE_W - M, currentY + 5.5, { align: "right" });
  }

  pdf.setDrawColor(...MUTED);
  pdf.setLineWidth(0.3);
  pdf.line(PAGE_W - M - 55, currentY + 16, PAGE_W - M, currentY + 16);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.5);
  pdf.setTextColor(...MUTED);
  pdf.text("( Authorized Signatory / Company Seal )", PAGE_W - M, currentY + 19.5, { align: "right" });

  const totalPages = pdf.getNumberOfPages();
  const now = new Date();
  const timestampStr = `${now.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })} ${now.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })}`;
  const auditRight = `${downloadedBy ? `Generated By: ${downloadedBy} • ` : "Generated: "}${timestampStr}`;

  for (let p = 1; p <= totalPages; p += 1) {
    pdf.setPage(p);

    // System-generated notice above footer line
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(5.5);
    pdf.setTextColor(...MUTED);
    pdf.text("* This is a system-generated quotation; physical signature is not required. *", PAGE_W / 2, PAGE_H - M - 4.5, { align: "center" });

    // Footer border line
    pdf.setDrawColor(...LINE);
    pdf.setLineWidth(0.2);
    pdf.line(M, PAGE_H - M - 3, PAGE_W - M, PAGE_H - M - 3);

    // Left: Ref & Portal
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6);
    pdf.setTextColor(...MUTED);
    pdf.text(`Ref: ${refNumber} • Generated via ${portalLabel}`, M, PAGE_H - M);

    // Center: Page count (Only shown if totalPages > 1)
    if (totalPages > 1) {
      pdf.text(`Page ${p} / ${totalPages}`, PAGE_W / 2, PAGE_H - M, { align: "center" });
    }

    // Right: Generated By with Timestamp
    pdf.text(auditRight, PAGE_W - M, PAGE_H - M, { align: "right" });
  }

  return pdf;
}
