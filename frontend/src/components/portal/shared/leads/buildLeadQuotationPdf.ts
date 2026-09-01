/**
 * @fileoverview Pure Vector jsPDF Builder for Lead Quotations.
 * Generates 100% crisp vector PDFs without html2canvas DOM capture or layout shifting.
 * @module components/portal/shared/leads/buildLeadQuotationPdf
 */

import type { LeadQuotationRecord } from "@/store/api";

type JsPDF = InstanceType<(typeof import("jspdf"))["jsPDF"]>;

export type LeadQuotationCompanyInfo = {
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
};

export type BuildLeadQuotationPdfInput = {
  quotation: LeadQuotationRecord;
  company?: LeadQuotationCompanyInfo;
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

/**
 * Builds a vector-based jsPDF document for Lead Quotation.
 */
export async function buildLeadQuotationPdf(input: BuildLeadQuotationPdfInput): Promise<JsPDF> {
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

  // -------------------------------------------------------------
  // Helper: Draw Header & Brand
  // -------------------------------------------------------------
  const drawHeader = () => {
    // Logo (if available)
    if (logoData) {
      try {
        pdf.addImage(logoData, "PNG", M, currentY, 28, 12, undefined, "FAST");
      } catch {
        // Fallback gracefully if image add fails
      }
    }

    // Company Name (Centered)
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.setTextColor(...NAVY);
    pdf.text(companyName.toUpperCase(), PAGE_W / 2, currentY + 4, { align: "center" });

    // Address & Contact
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(...TEXT);
    if (companyAddress) {
      pdf.text(companyAddress, PAGE_W / 2, currentY + 8, { align: "center" });
    }
    if (contactLine) {
      pdf.text(contactLine, PAGE_W / 2, currentY + 11.5, { align: "center" });
    }

    // Divider bar
    currentY += 14;
    pdf.setDrawColor(...NAVY);
    pdf.setLineWidth(0.5);
    pdf.line(M, currentY, PAGE_W - M, currentY);

    currentY += 4;
  };

  // -------------------------------------------------------------
  // Helper: Draw Quotation Title & Ref Bar
  // -------------------------------------------------------------
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

  // -------------------------------------------------------------
  // Helper: Draw Customer & Proposal Box
  // -------------------------------------------------------------
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

    // Estimate box height
    const leftH = Math.max(leftLines.length * 3.5 + 4, 18);
    const rightH = Math.max(rightLines.length * 4.5 + 4, 18);
    const boxH = Math.max(leftH, rightH);

    // Box Background and border
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(...LINE);
    pdf.setLineWidth(0.3);
    pdf.rect(boxX, currentY, boxW, boxH, "FD");

    // Middle column line
    pdf.line(boxX + col1W, currentY, boxX + col1W, currentY + boxH);

    // Render Left Content
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

    // Render Right Content
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

  // -------------------------------------------------------------
  // Initial Page Draw
  // -------------------------------------------------------------
  drawHeader();
  drawTitleBar();
  drawCustomerBox();

  // -------------------------------------------------------------
  // Items Table Columns Definition (Sum = 190mm)
  // -------------------------------------------------------------
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

  // -------------------------------------------------------------
  // Render Item Rows
  // -------------------------------------------------------------
  const items = quotation.items || [];
  let rowIndex = 0;

  for (const it of items) {
    rowIndex += 1;
    // Calculate description height
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    const titleLines = pdf.splitTextToSize(it.product_name || "Item", 51);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    const descLines = it.description ? pdf.splitTextToSize(it.description, 51) : [];

    const totalTextLines = titleLines.length + descLines.length;
    const rHeight = Math.max(totalTextLines * 3.2 + 3, 7);

    checkPageBreak(rHeight);

    // Row zebra background
    if (rowIndex % 2 === 0) {
      pdf.setFillColor(...LIGHT_BG);
      pdf.rect(M, currentY, CONTENT_W, rHeight, "F");
    }

    // Row borders
    pdf.setDrawColor(...LINE);
    pdf.setLineWidth(0.2);
    pdf.rect(M, currentY, CONTENT_W, rHeight, "S");

    // Vertical column lines
    let x = M;
    for (const c of cols) {
      pdf.line(x + c.w, currentY, x + c.w, currentY + rHeight);
      x += c.w;
    }

    // Draw cell contents
    x = M;

    // Sr.
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(...MUTED);
    pdf.text(String(rowIndex), x + cols[0].w / 2, currentY + 4.2, { align: "center" });
    x += cols[0].w;

    // Description
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

    // HSN
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(...TEXT);
    pdf.text(it.hsn_code || "—", x + cols[2].w / 2, currentY + 4.2, { align: "center" });
    x += cols[2].w;

    // Qty
    pdf.setFont("helvetica", "bold");
    pdf.text(`${it.quantity} ${it.unit || ""}`.trim(), x + cols[3].w / 2, currentY + 4.2, { align: "center" });
    x += cols[3].w;

    // Rate
    pdf.setFont("helvetica", "normal");
    pdf.text(formatCurrency(it.rate), x + cols[4].w - 1.5, currentY + 4.2, { align: "right" });
    x += cols[4].w;

    // Taxable Subtotal
    pdf.text(formatCurrency(it.taxable_amount), x + cols[5].w - 1.5, currentY + 4.2, { align: "right" });
    x += cols[5].w;

    // GST %
    pdf.text(`${it.gst_rate}%`, x + cols[6].w / 2, currentY + 4.2, { align: "center" });
    x += cols[6].w;

    // GST Amount
    pdf.text(formatCurrency(it.total_gst_amount), x + cols[7].w - 1.5, currentY + 4.2, { align: "right" });
    x += cols[7].w;

    // Line Total
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...DARK);
    pdf.text(formatCurrency(it.line_total), x + cols[8].w - 1.5, currentY + 4.2, { align: "right" });

    currentY += rHeight;
  }

  // -------------------------------------------------------------
  // Calculation & Totals Block (2 Columns)
  // -------------------------------------------------------------
  const summaryH = 22;
  checkPageBreak(summaryH + 4);

  const leftW = 112;
  const rightW = CONTENT_W - leftW; // 78mm

  // Border and outer box
  pdf.setDrawColor(...LINE);
  pdf.setLineWidth(0.3);
  pdf.rect(M, currentY, CONTENT_W, summaryH, "S");
  pdf.line(M + leftW, currentY, M + leftW, currentY + summaryH);

  // Left: Amount in words
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

  // Right: Calculation list
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

  // -------------------------------------------------------------
  // Terms & Conditions Block
  // -------------------------------------------------------------
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

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(...TEXT);

    for (let i = 0; i < terms.length; i += 1) {
      const termRaw = terms[i].replace(/^\d+\)\s*/, "").trim();
      const wrapped = pdf.splitTextToSize(`${i + 1})  ${termRaw}`, CONTENT_W - 4);
      const needH = wrapped.length * 2.8 + 1;
      checkPageBreak(needH);

      pdf.text(wrapped, M + 1, currentY);
      currentY += needH;
    }
    currentY += 4;
  }

  // -------------------------------------------------------------
  // Dual Signatures Block
  // -------------------------------------------------------------
  checkPageBreak(24);
  pdf.setDrawColor(...LINE);
  pdf.setLineWidth(0.4);
  pdf.setLineDashPattern([2, 2], 0);
  pdf.line(M, currentY, PAGE_W - M, currentY);
  pdf.setLineDashPattern([], 0); // reset

  currentY += 4;

  // Left: Company Signatory
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

  // Right: Order Acceptance
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

  // -------------------------------------------------------------
  // Global Footer on Every Page
  // -------------------------------------------------------------
  const totalPages = pdf.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    pdf.setPage(p);
    pdf.setDrawColor(...LINE);
    pdf.setLineWidth(0.2);
    pdf.line(M, PAGE_H - M - 3, PAGE_W - M, PAGE_H - M - 3);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6);
    pdf.setTextColor(...MUTED);
    pdf.text(`Ref: ${refNumber} • Generated via ${portalLabel}`, M, PAGE_H - M);
    pdf.text(`Page ${p} of ${totalPages}`, PAGE_W / 2, PAGE_H - M, { align: "center" });

    const auditRight = `${downloadedBy ? `Issued By: ${downloadedBy} • ` : ""}${new Date().toLocaleDateString("en-IN")}`;
    pdf.text(auditRight, PAGE_W - M, PAGE_H - M, { align: "right" });
  }

  return pdf;
}
