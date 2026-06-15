"use client";

import type { CSSProperties, ReactNode } from "react";

export const pdfPageStyle: CSSProperties = {
  width: "794px",
  minHeight: "1123px",
  padding: "40px 48px",
  backgroundColor: "#ffffff",
  color: "#0f172a",
  fontFamily: "Arial, Helvetica, sans-serif",
  fontSize: "11px",
  lineHeight: 1.45,
  boxSizing: "border-box",
};

export const pdfThStyle: CSSProperties = {
  padding: "8px 6px",
  textAlign: "left",
  fontWeight: 700,
  fontSize: "10px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  borderBottom: "2px solid #1e3a5f",
  color: "#1e3a5f",
};

export const pdfTdStyle: CSSProperties = {
  padding: "7px 6px",
  borderBottom: "1px solid #e2e8f0",
  verticalAlign: "top",
};

export const pdfThCompactStyle: CSSProperties = {
  ...pdfThStyle,
  padding: "5px 3px",
  fontSize: "8px",
};

export const pdfTdCompactStyle: CSSProperties = {
  ...pdfTdStyle,
  padding: "5px 3px",
  fontSize: "9px",
};

type PdfCompanyLetterheadProps = {
  companyName: string;
  logoUrl: string;
};

export function PdfCompanyLetterhead({ companyName, logoUrl }: PdfCompanyLetterheadProps) {
  return (
    <header style={{ marginBottom: "28px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          marginBottom: "16px",
        }}
      >
        <img
          src={logoUrl}
          alt={companyName}
          crossOrigin="anonymous"
          style={{
            width: "128px",
            height: "52px",
            objectFit: "contain",
            objectPosition: "left center",
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, textAlign: "center" }}>
          <div
            style={{
              fontSize: "26px",
              fontWeight: 700,
              color: "#1e3a5f",
              letterSpacing: "0.02em",
            }}
          >
            {companyName}
          </div>
          <div
            style={{
              marginTop: "6px",
              fontSize: "12px",
              color: "#64748b",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Order Management Portal
          </div>
        </div>
        <div style={{ width: "128px", flexShrink: 0 }} aria-hidden />
      </div>
      <div
        style={{
          height: "3px",
          background: "linear-gradient(90deg, #1e3a5f 0%, #3b82f6 50%, #1e3a5f 100%)",
          borderRadius: "2px",
        }}
      />
    </header>
  );
}

type PdfCompanyFooterProps = {
  companyName: string;
};

export function PdfCompanyFooter({ companyName }: PdfCompanyFooterProps) {
  return (
    <footer
      style={{
        marginTop: "48px",
        paddingTop: "12px",
        borderTop: "1px solid #e2e8f0",
        fontSize: "9px",
        color: "#94a3b8",
        textAlign: "center",
      }}
    >
      This document was generated electronically by {companyName} OPMS and does not require a
      signature.
    </footer>
  );
}

type PdfDocumentShellProps = {
  companyName: string;
  logoUrl: string;
  children: ReactNode;
  rootId?: string;
};

export function PdfDocumentShell({
  companyName,
  logoUrl,
  children,
  rootId,
}: PdfDocumentShellProps) {
  return (
    <div id={rootId} style={pdfPageStyle}>
      <PdfCompanyLetterhead companyName={companyName} logoUrl={logoUrl} />
      {children}
      <PdfCompanyFooter companyName={companyName} />
    </div>
  );
}
