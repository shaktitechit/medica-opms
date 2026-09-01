/**
 * @fileoverview Modal to View and Print Lead Quotation in Letterhead format.
 * Uses isolated iframe printing to guarantee 100% pure PDF content in the print preview.
 * @module components/portal/shared/leads/QuotationViewModal
 */
"use client";

import React, { useRef } from "react";
import { X, Printer, FileText } from "lucide-react";
import type { LeadQuotationRecord } from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import LeadQuotationPdfTemplate from "./LeadQuotationPdfTemplate";

type Props = {
  quotation: LeadQuotationRecord | null;
  open: boolean;
  onClose: () => void;
  portalLabel?: string;
};

export function QuotationViewModal({
  quotation,
  open,
  onClose,
  portalLabel = "Admin Portal",
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const authUser = useAppSelector((s) => s.auth.user);
  const downloadedBy = (authUser as { name?: string })?.name || "Medica Staff";

  if (!open || !quotation) return null;

  /**
   * Pure Isolated Iframe Printing:
   * Writes only the quotation letterhead into an isolated iframe document
   * so the browser print preview contains ZERO surrounding UI or modal chrome.
   */
  const handlePrint = () => {
    if (!containerRef.current) return;

    const printFrame = document.createElement("iframe");
    printFrame.style.position = "fixed";
    printFrame.style.right = "0";
    printFrame.style.bottom = "0";
    printFrame.style.width = "0";
    printFrame.style.height = "0";
    printFrame.style.border = "0";
    document.body.appendChild(printFrame);

    const doc = printFrame.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Quotation_${quotation.ref_no || quotation.quotation_no || "Document"}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 8mm 10mm;
            }
            * {
              box-sizing: border-box;
            }
            html, body {
              margin: 0;
              padding: 0;
              background: #ffffff;
              color: #0f172a;
              font-family: Arial, Helvetica, sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            #lead-quotation-pdf-root {
              width: 100% !important;
              max-width: 794px !important;
              margin: 0 auto !important;
              padding: 0 !important;
              box-shadow: none !important;
              background: #ffffff !important;
            }
          </style>
        </head>
        <body>
          ${containerRef.current.innerHTML}
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      try {
        printFrame.contentWindow?.focus();
        printFrame.contentWindow?.print();
      } catch (err) {
        console.error("Print error:", err);
      } finally {
        setTimeout(() => {
          if (document.body.contains(printFrame)) {
            document.body.removeChild(printFrame);
          }
        }, 1000);
      }
    }, 250);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-900/60 p-3 sm:p-6 backdrop-blur-xs">
      <div className="relative flex max-h-[96vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900 overflow-hidden">
        {/* Top Action Bar */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-3.5 dark:border-white/10">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Quotation Preview: {quotation.ref_no || quotation.quotation_no}
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  {quotation.status}
                </span>
              </h3>
              <p className="text-[11px] text-slate-500">
                Official Letterhead format for {quotation.customer_name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                const { buildLeadQuotationPdf } = await import("./buildLeadQuotationPdf");
                const pdf = await buildLeadQuotationPdf({
                  quotation,
                  portalLabel,
                  downloadedBy,
                });
                pdf.save(`Quotation_${quotation.ref_no || quotation.quotation_no || "document"}.pdf`);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
            >
              Download PDF
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Letterhead Area - Centered A4 Sheet */}
        <div className="flex-1 overflow-y-auto bg-slate-100/70 p-4 sm:p-8 dark:bg-slate-950/60 flex justify-center items-start">
          <div
            ref={containerRef}
            className="w-full max-w-[794px] bg-white shadow-xl rounded-md overflow-hidden flex justify-center"
          >
            <LeadQuotationPdfTemplate
              quotation={quotation}
              portalLabel={portalLabel}
              downloadedBy={downloadedBy}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
