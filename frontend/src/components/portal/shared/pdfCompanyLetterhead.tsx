/**
 * @fileoverview Resolve PDF letterhead from Company Info and render header/footer brand blocks.
 * @module components/portal/shared/pdfCompanyLetterhead
 */
"use client";

import { useMemo, type CSSProperties } from "react";
import { useGetCompanyInfoQuery, type CompanyInfoRecord } from "@/store/api";
import { resolvePublicAssetUrl } from "@/lib/env";

export type PdfCompanyLetterhead = {
  companyName: string;
  logoUrl: string;
  addressLine: string;
  contactLine: string;
  phone: string;
  email: string;
  gstin: string;
  website: string;
  footerNote: string;
};

export function companyInfoToLetterhead(
  company?: CompanyInfoRecord | null,
): PdfCompanyLetterhead {
  const companyName = String(company?.trade_name || company?.legal_name || "").trim();
  const logoRaw = String(company?.logo_url || "").trim();
  const logoUrl = logoRaw ? resolvePublicAssetUrl(logoRaw) : "";

  const statePin =
    company?.state && company?.pincode
      ? `${company.state} - ${company.pincode}`
      : String(company?.state || company?.pincode || "").trim();

  const addressLine = [
    company?.address,
    company?.city,
    statePin,
    company?.country,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");

  const phone = String(company?.phone || "").trim();
  const email = String(company?.email || "").trim();
  const gstin = String(company?.gstin || "").trim();
  const website = String(company?.website || "").trim();

  const contactLine = [
    phone ? `Phone: ${phone}` : "",
    email ? `Email: ${email}` : "",
    gstin ? `GSTIN: ${gstin}` : "",
    website,
  ]
    .filter(Boolean)
    .join("  |  ");

  const footerNote = String(company?.invoice_footer_note || "").trim();

  return {
    companyName,
    logoUrl,
    addressLine,
    contactLine,
    phone,
    email,
    gstin,
    website,
    footerNote,
  };
}

export function usePdfCompanyLetterhead(): PdfCompanyLetterhead {
  const { data } = useGetCompanyInfoQuery();
  return useMemo(() => companyInfoToLetterhead(data), [data]);
}

type BrandProps = {
  letterhead: PdfCompanyLetterhead;
  compact?: boolean;
};

export function PdfLetterheadBrand({ letterhead, compact = false }: BrandProps) {
  const logoW = compact ? 90 : 112;
  const logoH = compact ? 38 : 46;
  const nameSize = compact ? "16px" : "20px";
  const metaSize = compact ? "8px" : "9px";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: compact ? "10px" : "14px",
      }}
    >
      {letterhead.logoUrl ? (
        <img
          src={letterhead.logoUrl}
          alt={letterhead.companyName || "Company logo"}
          crossOrigin="anonymous"
          style={{
            width: `${logoW}px`,
            height: `${logoH}px`,
            objectFit: "contain",
            objectPosition: "left center",
            flexShrink: 0,
          }}
        />
      ) : (
        <div style={{ width: `${logoW}px`, height: `${logoH}px`, flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
        {letterhead.companyName ? (
          <div
            style={{
              fontSize: nameSize,
              fontWeight: 700,
              color: "#1e3a5f",
              letterSpacing: "0.01em",
              lineHeight: 1.2,
            }}
          >
            {letterhead.companyName}
          </div>
        ) : null}
        {letterhead.addressLine ? (
          <div
            style={{
              marginTop: "3px",
              fontSize: metaSize,
              color: "#475569",
              lineHeight: 1.35,
            }}
          >
            {letterhead.addressLine}
          </div>
        ) : null}
        {letterhead.contactLine ? (
          <div
            style={{
              marginTop: "2px",
              fontSize: compact ? "7.5px" : "8.5px",
              color: "#64748b",
              lineHeight: 1.35,
            }}
          >
            {letterhead.contactLine}
          </div>
        ) : null}
      </div>
      <div style={{ width: `${logoW}px`, flexShrink: 0 }} aria-hidden />
    </div>
  );
}

export function PdfLetterheadRule({ compact = false }: { compact?: boolean }) {
  const bar: CSSProperties = {
    height: compact ? "2px" : "3px",
    background: "linear-gradient(90deg, #1e3a5f 0%, #3b82f6 50%, #1e3a5f 100%)",
    borderRadius: compact ? "1px" : "2px",
  };
  return <div style={bar} />;
}

export function PdfLetterheadFooterCopy({
  letterhead,
  compact = false,
}: BrandProps) {
  const size = compact ? "7.5px" : "8.5px";
  return (
    <div style={{ minWidth: 0, flex: 1 }}>
      {letterhead.companyName ? (
        <div style={{ fontWeight: 700, color: "#334155", fontSize: size }}>
          {letterhead.companyName}
        </div>
      ) : null}
      {letterhead.addressLine ? (
        <div style={{ color: "#64748b", fontSize: size, lineHeight: 1.35 }}>
          {letterhead.addressLine}
        </div>
      ) : null}
      {letterhead.contactLine ? (
        <div style={{ color: "#64748b", fontSize: size, lineHeight: 1.35 }}>
          {letterhead.contactLine}
        </div>
      ) : null}
      {letterhead.footerNote ? (
        <div style={{ color: "#94a3b8", fontSize: size, marginTop: "2px" }}>
          {letterhead.footerNote}
        </div>
      ) : null}
    </div>
  );
}
