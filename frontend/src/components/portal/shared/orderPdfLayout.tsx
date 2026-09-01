"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  PdfLetterheadBrand,
  PdfLetterheadFooterCopy,
  PdfLetterheadRule,
  usePdfCompanyLetterhead,
} from "./pdfCompanyLetterhead";

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
  companyName?: string;
  logoUrl?: string;
};

export function PdfCompanyLetterhead(_props: PdfCompanyLetterheadProps) {
  const letterhead = usePdfCompanyLetterhead();
  return (
    <header style={{ marginBottom: "28px" }}>
      <div style={{ marginBottom: "16px" }}>
        <PdfLetterheadBrand letterhead={letterhead} />
      </div>
      <PdfLetterheadRule />
    </header>
  );
}

type PdfCompanyFooterProps = {
  companyName?: string;
};

export function PdfCompanyFooter(_props: PdfCompanyFooterProps) {
  const letterhead = usePdfCompanyLetterhead();
  return (
    <footer
      style={{
        marginTop: "48px",
        paddingTop: "12px",
        borderTop: "1px solid #e2e8f0",
        fontSize: "9px",
        color: "#94a3b8",
      }}
    >
      <PdfLetterheadFooterCopy letterhead={letterhead} />
    </footer>
  );
}

type PdfDocumentShellProps = {
  companyName?: string;
  logoUrl?: string;
  children: ReactNode;
  rootId?: string;
};

export function PdfDocumentShell({
  children,
  rootId,
}: PdfDocumentShellProps) {
  return (
    <div id={rootId} style={pdfPageStyle}>
      <PdfCompanyLetterhead />
      {children}
      <PdfCompanyFooter />
    </div>
  );
}
