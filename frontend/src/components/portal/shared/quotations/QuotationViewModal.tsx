/**
 * @fileoverview Modal to View and Print Quotation in Letterhead format.
 * Uses isolated iframe printing to guarantee 100% pure PDF content in the print preview.
 * @module components/portal/shared/quotations/QuotationViewModal
 */
"use client";

import React, { useRef } from "react";
import { X, Printer, FileText, Lock } from "lucide-react";
import type { LeadQuotationRecord } from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import QuotationPdfTemplate from "./QuotationPdfTemplate";
import { canViewQuotationPdf } from "./quotationUtils";

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

  const isPdfAllowed = canViewQuotationPdf(authUser, quotation);

  /**
   * Pure Isolated Iframe Printing:
   * Writes only the quotation letterhead into an isolated iframe document
   * so the browser print preview contains ZERO surrounding UI or modal chrome.
   */
  const handlePrint = () => {
    if (!containerRef.current || !isPdfAllowed) return;

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
            #quotation-pdf-root {
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
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                  quotation.approval_status === "approved" || quotation.status === "approved"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                }`}>
                  {quotation.approval_status || quotation.status}
                </span>
              </h3>
              <p className="text-[11px] text-slate-500">
                Official Letterhead format for {quotation.customer_name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isPdfAllowed && (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    const { buildQuotationPdf } = await import("./buildQuotationPdf");
                    const pdf = await buildQuotationPdf({
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
              </>
            )}
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
          {!isPdfAllowed ? (
            <div className="my-12 w-full max-w-md rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-xl dark:border-amber-900/40 dark:bg-slate-900">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
                <Lock className="h-7 w-7" />
              </div>
              <h4 className="mt-4 text-base font-bold text-slate-900 dark:text-white">
                PDF Preview Restricted
              </h4>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                This quotation is currently <strong>Pending Signatory Approval</strong>.
              </p>
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 p-3 rounded-xl dark:bg-amber-950/40 font-semibold">
                Only the assigned signatory (<strong>{quotation.signatory_name || "Authorized Signatory"}</strong>) or Super Admin can preview or download the PDF prior to approval.
              </p>
            </div>
          ) : (
            <div
              ref={containerRef}
              className="w-full max-w-[794px] bg-white shadow-xl rounded-md overflow-hidden flex justify-center"
            >
              <QuotationPdfTemplate
                quotation={quotation}
                portalLabel={portalLabel}
                downloadedBy={downloadedBy}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
