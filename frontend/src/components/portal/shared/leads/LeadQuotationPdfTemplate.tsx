/**
 * @fileoverview High-Precision A4 Letterhead Template for Lead Quotations.
 * Pure CSS Flexbox & Div Box-Model architecture to eliminate html2canvas table rendering glitches.
 * @module components/portal/shared/leads/LeadQuotationPdfTemplate
 */
"use client";

import React, { type CSSProperties } from "react";
import { useGetCompanyInfoQuery, type LeadQuotationRecord } from "@/store/api";

type Props = {
  quotation: LeadQuotationRecord;
  portalLabel?: string;
  downloadedBy?: string;
};

const PAGE_WIDTH = 794;

const pageStyle: CSSProperties = {
  width: `${PAGE_WIDTH}px`,
  minHeight: "1123px",
  padding: "20px 28px 24px 28px",
  backgroundColor: "#ffffff",
  color: "#0f172a",
  fontFamily: "Arial, Helvetica, sans-serif",
  fontSize: "9px",
  lineHeight: "14px",
  boxSizing: "border-box",
  display: "block",
  position: "relative",
  margin: "0 auto",
};

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

export default function LeadQuotationPdfTemplate({
  quotation,
  portalLabel = "OPMS",
  downloadedBy,
}: Props) {
  const { data: companyData } = useGetCompanyInfoQuery();
  const company = companyData as Record<string, unknown> | undefined;

  const companyName =
    (company?.trade_name as string) ||
    (company?.legal_name as string) ||
    quotation.company_name ||
    "Medica Enterprises";

  const logoUrl = (company?.logo_url as string) || "";

  const companyRegdAddress = company?.address
    ? [
        company.address,
        company.city,
        company.state && company.pincode
          ? `${company.state} - ${company.pincode}`
          : (company.state as string) || (company.pincode as string),
        company.country as string,
      ]
        .filter(Boolean)
        .join(", ")
    : quotation.company_regd_address || "";

  const companyPhone = (company?.phone as string) || quotation.company_phone || "";
  const companyEmail = (company?.email as string) || quotation.company_email || "";
  const companyGstin = (company?.gstin as string) || quotation.company_gstin || "";

  const contactLine = [
    companyPhone ? `Phone: ${companyPhone}` : "",
    companyEmail ? `Email: ${companyEmail}` : "",
    companyGstin ? `GSTIN: ${companyGstin}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const customerDisplay = quotation.customer_name
    ? quotation.customer_name.startsWith("M/s")
      ? quotation.customer_name
      : `M/s. ${quotation.customer_name}`
    : "";

  const custAddress = quotation.address
    ? [
        quotation.address.address_line_1,
        quotation.address.city,
        quotation.address.state,
        quotation.address.pincode,
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  const signatoryContacts = [
    quotation.signatory_phone || "",
    quotation.signatory_email || "",
  ]
    .filter(Boolean)
    .join(" | ");

  const items = quotation.items || [];
  const terms = quotation.terms_and_conditions || [];

  return (
    <>
      <style>{`
        @media print {
          #lead-quotation-pdf-root {
            width: 100% !important;
            max-width: 100% !important;
            min-height: auto !important;
            padding: 0 !important;
            margin: 0 !important;
            position: static !important;
            box-sizing: border-box !important;
          }
        }
      `}</style>

      <div
        id="lead-quotation-pdf-root"
        data-pdf-page
        style={pageStyle}
      >
        {/* ============================================================ */}
        {/* 1. HEADER SECTION (Flexbox Row)                              */}
        {/* ============================================================ */}
        <div style={{ marginBottom: "12px", width: "100%", boxSizing: "border-box" }}>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
            {/* Logo Left */}
            <div style={{ width: "120px", flexShrink: 0 }}>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={companyName || "Logo"}
                  crossOrigin="anonymous"
                  style={{
                    width: "115px",
                    height: "44px",
                    objectFit: "contain",
                    objectPosition: "left center",
                    display: "block",
                  }}
                />
              ) : null}
            </div>

            {/* Company Info Center */}
            <div style={{ flex: 1, textAlign: "center", padding: "0 10px" }}>
              {companyName && (
                <div
                  style={{
                    fontSize: "17px",
                    fontWeight: 800,
                    color: "#1e3a5f",
                    letterSpacing: "0.02em",
                    textTransform: "uppercase",
                    lineHeight: "20px",
                  }}
                >
                  {companyName}
                </div>
              )}
              {companyRegdAddress && (
                <div
                  style={{
                    marginTop: "2px",
                    fontSize: "8px",
                    color: "#475569",
                    lineHeight: "11px",
                  }}
                >
                  {companyRegdAddress}
                </div>
              )}
              {contactLine && (
                <div
                  style={{
                    marginTop: "2px",
                    fontSize: "7.5px",
                    color: "#64748b",
                    lineHeight: "11px",
                  }}
                >
                  {contactLine}
                </div>
              )}
            </div>

            {/* Right Spacer */}
            <div style={{ width: "120px", flexShrink: 0 }} />
          </div>

          {/* Accent Divider Bar */}
          <div
            style={{
              width: "100%",
              height: "2px",
              backgroundColor: "#1e3a5f",
              marginTop: "8px",
            }}
          />
        </div>

        {/* ============================================================ */}
        {/* 2. TITLE & REF BAR (Flexbox Row)                             */}
        {/* ============================================================ */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
            borderBottom: "1.5px solid #cbd5e1",
            paddingBottom: "5px",
            marginBottom: "12px",
            boxSizing: "border-box",
          }}
        >
          <div>
            <span
              style={{
                fontSize: "13px",
                fontWeight: 800,
                color: "#1e3a5f",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                lineHeight: "16px",
              }}
            >
              QUOTATION
            </span>
          </div>
          <div style={{ textAlign: "right", fontSize: "8.5px", color: "#334155", lineHeight: "13px" }}>
            <div>
              <strong>Ref. No. :</strong>{" "}
              <span style={{ fontWeight: 700, color: "#1e40af" }}>
                {quotation.ref_no || quotation.quotation_no || ""}
              </span>
            </div>
            {quotation.quotation_date && (
              <div style={{ marginTop: "1px" }}>
                <strong>Date :</strong> {formatDate(quotation.quotation_date)}
              </div>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* 3. CUSTOMER & PROPOSAL DETAILS CARD (Flexbox 2-Col Card)     */}
        {/* ============================================================ */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            width: "100%",
            border: "1px solid #cbd5e1",
            borderRadius: "4px",
            marginBottom: "12px",
            boxSizing: "border-box",
            backgroundColor: "#ffffff",
          }}
        >
          {/* Customer Details (Left 55%) */}
          <div
            style={{
              width: "55%",
              padding: "7px 10px",
              borderRight: "1px solid #cbd5e1",
              boxSizing: "border-box",
            }}
          >
            {customerDisplay && (
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#0f172a", lineHeight: "14px" }}>
                {customerDisplay}
              </div>
            )}
            {custAddress && (
              <div style={{ marginTop: "2px", fontSize: "8px", color: "#475569", lineHeight: "11.5px" }}>
                {custAddress}
              </div>
            )}
            <div style={{ marginTop: "4px", fontSize: "8px", color: "#334155", lineHeight: "12px" }}>
              {quotation.gstin && (
                <div>
                  <strong>GSTIN :</strong> {quotation.gstin}
                </div>
              )}
              {quotation.phone && (
                <div>
                  <strong>Tel. :</strong> {quotation.phone}
                </div>
              )}
              {quotation.cell && (
                <div>
                  <strong>Cell :</strong> {quotation.cell}
                </div>
              )}
              {quotation.email && (
                <div>
                  <strong>E-mail :</strong> {quotation.email}
                </div>
              )}
            </div>
          </div>

          {/* Proposal Details (Right 45%) */}
          <div
            style={{
              width: "45%",
              padding: "7px 10px",
              fontSize: "8px",
              color: "#334155",
              lineHeight: "12.5px",
              boxSizing: "border-box",
            }}
          >
            {quotation.kind_attn && (
              <div style={{ marginBottom: "4px" }}>
                <strong>Kind Attn :</strong>{" "}
                <span style={{ fontWeight: 600, color: "#0f172a" }}>{quotation.kind_attn}</span>
              </div>
            )}
            {quotation.subject && (
              <div style={{ marginBottom: "4px" }}>
                <strong>Sub. :</strong>{" "}
                <span style={{ fontWeight: 700, color: "#1e3a5f" }}>{quotation.subject}</span>
              </div>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* 4. ITEMS GRID (Flexbox Rows with Strict Percentage Columns)   */}
        {/* ============================================================ */}
        <div
          style={{
            width: "100%",
            border: "1px solid #cbd5e1",
            borderBottom: "none",
            boxSizing: "border-box",
            backgroundColor: "#ffffff",
          }}
        >
          {/* Header Row */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              width: "100%",
              backgroundColor: "#f8fafc",
              borderBottom: "1px solid #cbd5e1",
              fontWeight: 700,
              fontSize: "8.5px",
              color: "#1e3a5f",
              textTransform: "uppercase",
              letterSpacing: "0.02em",
              boxSizing: "border-box",
            }}
          >
            <div style={{ width: "5%", padding: "6px 4px", textAlign: "center", borderRight: "1px solid #cbd5e1", boxSizing: "border-box" }}>Sr.</div>
            <div style={{ width: "27%", padding: "6px 6px", textAlign: "left", borderRight: "1px solid #cbd5e1", boxSizing: "border-box" }}>Description of Goods</div>
            <div style={{ width: "9%", padding: "6px 4px", textAlign: "center", borderRight: "1px solid #cbd5e1", boxSizing: "border-box" }}>HSN/SAC</div>
            <div style={{ width: "7%", padding: "6px 4px", textAlign: "center", borderRight: "1px solid #cbd5e1", boxSizing: "border-box" }}>QTY</div>
            <div style={{ width: "11%", padding: "6px 4px", textAlign: "right", borderRight: "1px solid #cbd5e1", boxSizing: "border-box" }}>Rate (Rs.)</div>
            <div style={{ width: "12%", padding: "6px 4px", textAlign: "right", borderRight: "1px solid #cbd5e1", boxSizing: "border-box" }}>Sub Total (Rs.)</div>
            <div style={{ width: "7%", padding: "6px 4px", textAlign: "center", borderRight: "1px solid #cbd5e1", boxSizing: "border-box" }}>GST %</div>
            <div style={{ width: "10%", padding: "6px 4px", textAlign: "right", borderRight: "1px solid #cbd5e1", boxSizing: "border-box" }}>GST Amt (Rs.)</div>
            <div style={{ width: "12%", padding: "6px 4px", textAlign: "right", boxSizing: "border-box" }}>Total (Rs.)</div>
          </div>

          {/* Item Rows */}
          {items.map((item, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                flexDirection: "row",
                width: "100%",
                borderBottom: "1px solid #cbd5e1",
                fontSize: "8.5px",
                lineHeight: "12.5px",
                color: "#334155",
                backgroundColor: "#ffffff",
                boxSizing: "border-box",
              }}
            >
              <div style={{ width: "5%", padding: "6px 4px", textAlign: "center", color: "#64748b", borderRight: "1px solid #cbd5e1", boxSizing: "border-box" }}>
                {index + 1}
              </div>
              <div style={{ width: "27%", padding: "6px 6px", textAlign: "left", borderRight: "1px solid #cbd5e1", boxSizing: "border-box" }}>
                <div style={{ fontWeight: 700, color: "#0f172a", lineHeight: "12px" }}>
                  {item.product_name}
                </div>
                {item.description && (
                  <div
                    style={{
                      fontSize: "7.5px",
                      color: "#64748b",
                      marginTop: "2px",
                      whiteSpace: "pre-line",
                      lineHeight: "11px",
                    }}
                  >
                    {item.description}
                  </div>
                )}
              </div>
              <div style={{ width: "9%", padding: "6px 4px", textAlign: "center", color: "#475569", borderRight: "1px solid #cbd5e1", boxSizing: "border-box" }}>
                {item.hsn_code || "—"}
              </div>
              <div style={{ width: "7%", padding: "6px 4px", textAlign: "center", fontWeight: 600, borderRight: "1px solid #cbd5e1", boxSizing: "border-box" }}>
                {item.quantity} {item.unit || ""}
              </div>
              <div style={{ width: "11%", padding: "6px 4px", textAlign: "right", borderRight: "1px solid #cbd5e1", boxSizing: "border-box" }}>
                {formatCurrency(item.rate)}
              </div>
              <div style={{ width: "12%", padding: "6px 4px", textAlign: "right", fontWeight: 600, borderRight: "1px solid #cbd5e1", boxSizing: "border-box" }}>
                {formatCurrency(item.taxable_amount)}
              </div>
              <div style={{ width: "7%", padding: "6px 4px", textAlign: "center", color: "#475569", borderRight: "1px solid #cbd5e1", boxSizing: "border-box" }}>
                {item.gst_rate}%
              </div>
              <div style={{ width: "10%", padding: "6px 4px", textAlign: "right", borderRight: "1px solid #cbd5e1", boxSizing: "border-box" }}>
                {formatCurrency(item.total_gst_amount)}
              </div>
              <div style={{ width: "12%", padding: "6px 4px", textAlign: "right", fontWeight: 700, color: "#0f172a", boxSizing: "border-box" }}>
                {formatCurrency(item.line_total)}
              </div>
            </div>
          ))}
        </div>

        {/* ============================================================ */}
        {/* 4B. SUMMARY & TOTALS (Flexbox 2-Col Card)                    */}
        {/* ============================================================ */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            width: "100%",
            border: "1px solid #cbd5e1",
            borderTop: "none",
            marginBottom: "12px",
            boxSizing: "border-box",
            backgroundColor: "#ffffff",
          }}
        >
          {/* Left Side: Amount in Words */}
          <div
            style={{
              width: "59%",
              padding: "8px 10px",
              borderRight: "1px solid #cbd5e1",
              boxSizing: "border-box",
            }}
          >
            <div style={{ fontSize: "7.5px", textTransform: "uppercase", fontWeight: 700, color: "#64748b", lineHeight: "10px" }}>
              Amount in words:
            </div>
            <div
              style={{
                fontSize: "9px",
                fontWeight: 700,
                color: "#1e3a5f",
                marginTop: "3px",
                lineHeight: "13px",
                textTransform: "capitalize",
              }}
            >
              {quotation.amount_in_words || "—"}
            </div>
          </div>

          {/* Right Side: Calculation Totals */}
          <div style={{ width: "41%", boxSizing: "border-box" }}>
            <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", padding: "4px 6px", fontSize: "8.5px", borderBottom: "1px solid #cbd5e1", boxSizing: "border-box" }}>
              <span style={{ color: "#475569", fontWeight: 600 }}>Sub Total (Taxable):</span>
              <span style={{ fontWeight: 700 }}>Rs. {formatCurrency(quotation.subtotal)}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", padding: "4px 6px", fontSize: "8.5px", borderBottom: "1px solid #cbd5e1", boxSizing: "border-box" }}>
              <span style={{ color: "#475569", fontWeight: 600 }}>Total GST:</span>
              <span style={{ fontWeight: 700 }}>Rs. {formatCurrency(quotation.total_gst)}</span>
            </div>
            {quotation.round_off !== undefined && quotation.round_off !== 0 && (
              <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", padding: "4px 6px", fontSize: "8.5px", borderBottom: "1px solid #cbd5e1", boxSizing: "border-box" }}>
                <span style={{ color: "#475569" }}>Round Off:</span>
                <span>Rs. {formatCurrency(quotation.round_off)}</span>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", padding: "5px 6px", fontSize: "9.5px", fontWeight: 800, color: "#1e3a5f", backgroundColor: "#f8fafc", boxSizing: "border-box" }}>
              <span>Grand Total:</span>
              <span>Rs. {formatCurrency(quotation.grand_total)}</span>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* 5. GENERAL TERMS & CONDITIONS (Flexbox List)                 */}
        {/* ============================================================ */}
        {terms.length > 0 && (
          <div style={{ marginBottom: "12px", width: "100%", boxSizing: "border-box" }}>
            <div
              style={{
                fontSize: "9px",
                fontWeight: 800,
                color: "#1e3a5f",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                borderBottom: "1px solid #cbd5e1",
                paddingBottom: "3px",
                marginBottom: "5px",
              }}
            >
              General Terms &amp; Conditions
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
              {terms.map((term, index) => (
                <div key={index} style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", fontSize: "7.5px", lineHeight: "11.5px" }}>
                  <span style={{ width: "16px", fontWeight: 700, color: "#1e3a5f", flexShrink: 0 }}>
                    {index + 1})
                  </span>
                  <span style={{ color: "#334155", whiteSpace: "pre-line", wordBreak: "break-word" }}>
                    {term.replace(/^\d+\)\s*/, "")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* 6. DUAL SIGNATURES (Flexbox 2-Col Row)                       */}
        {/* ============================================================ */}
        <div style={{ marginBottom: "12px", paddingTop: "8px", borderTop: "1.5px dashed #cbd5e1", width: "100%", boxSizing: "border-box" }}>
          <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", width: "100%" }}>
            {/* Company Signatory (Left) */}
            <div style={{ width: "55%", fontSize: "8px", lineHeight: "12px", boxSizing: "border-box" }}>
              <div style={{ fontWeight: 700, color: "#1e3a5f", marginBottom: "1px" }}>
                Thanks and Regards,
              </div>
              {companyName && (
                <div style={{ fontWeight: 800, color: "#0f172a" }}>For {companyName}</div>
              )}
              <div style={{ height: "24px" }} />
              {quotation.signatory_name && (
                <div style={{ fontWeight: 700, color: "#0f172a" }}>{quotation.signatory_name}</div>
              )}
              {signatoryContacts && <div style={{ color: "#475569", lineHeight: "11px" }}>{signatoryContacts}</div>}
              {companyRegdAddress && (
                <div
                  style={{
                    color: "#64748b",
                    fontSize: "7.5px",
                    marginTop: "1px",
                    maxWidth: "340px",
                    lineHeight: "10.5px",
                  }}
                >
                  {companyRegdAddress}
                </div>
              )}
              {companyPhone && (
                <div style={{ color: "#64748b", fontSize: "7.5px", lineHeight: "10.5px" }}>Off Phone: {companyPhone}</div>
              )}
            </div>

            {/* Order Acceptance (Right) */}
            <div style={{ width: "45%", textAlign: "right", fontSize: "8px", lineHeight: "12px", boxSizing: "border-box" }}>
              <div style={{ fontWeight: 700, color: "#1e3a5f", marginBottom: "1px" }}>
                Order Acceptance
              </div>
              {customerDisplay && (
                <div style={{ fontWeight: 700, color: "#0f172a" }}>{customerDisplay}</div>
              )}
              <div style={{ height: "24px" }} />
              <div
                style={{
                  borderTop: "1px solid #94a3b8",
                  paddingTop: "3px",
                  color: "#64748b",
                  fontSize: "7.5px",
                  display: "inline-block",
                  minWidth: "180px",
                  lineHeight: "11px",
                }}
              >
                ( Authorized Signatory / Company Seal )
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* 7. FOOTER AUDIT LINE (Flexbox Row)                           */}
        {/* ============================================================ */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            paddingTop: "5px",
            borderTop: "1px solid #e2e8f0",
            fontSize: "7px",
            color: "#94a3b8",
            lineHeight: "10px",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          <div>
            Ref: {quotation.quotation_no || quotation.ref_no || ""} • Generated via {portalLabel}
          </div>
          <div style={{ textAlign: "right" }}>
            {downloadedBy ? `Issued By: ${downloadedBy} • ` : ""}
            {new Date().toLocaleDateString("en-IN")}
          </div>
        </div>
      </div>
    </>
  );
}