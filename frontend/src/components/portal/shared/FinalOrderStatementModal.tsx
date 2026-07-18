"use client";

import { LargeModalPortal } from "./LargeModalPortal";
import { useCallback, useMemo, useRef, useState } from "react";
import { useGetFinalOrderStatementQuery } from "@/store/api";
import { toast } from "@/lib/toast";
import {
  companyLetterheadLogoUrl,
  companyLetterheadName,
  resolvePublicAssetUrl,
} from "@/lib/env";
import { downloadOrderItemsPdf } from "@/components/portal/shared/downloadOrderItemsPdf";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import FinalOrderStatementPdfTemplate, {
  type FinalOrderStatementPdfLine,
} from "@/components/portal/shared/FinalOrderStatementPdfTemplate";

type FinalOrderStatementModalProps = {
  orderId: string;
  isOpen: boolean;
  onClose: () => void;
};

function formatMoney(v: number): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(v) ? v : 0);
}

function pdfMoney(v: number): string {
  return formatMoney(v);
}

function formatDate(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function formatDateShort(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function formatRateType(v: unknown): string {
  const raw = String(v || "MANUAL").toUpperCase();
  if (raw === "SR") return "SR";
  if (raw === "SRA") return "SRA";
  if (raw === "CR") return "CR";
  if (raw === "MANUAL") return "Manual";
  return raw;
}

function formatGstPercent(v: unknown): string {
  const n = num(v);
  return n % 1 === 0 ? `${n}%` : `${n.toFixed(2)}%`;
}

export default function FinalOrderStatementModal({
  orderId,
  isOpen,
  onClose,
}: FinalOrderStatementModalProps) {
  const pdfTemplateRef = useRef<HTMLDivElement>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const { data, isLoading, isFetching, isError, error, refetch } = useGetFinalOrderStatementQuery(orderId, {
    skip: !isOpen || !orderId,
  });

  const companyName = companyLetterheadName();
  const logoUrl = resolvePublicAssetUrl(companyLetterheadLogoUrl());

  const statement = asRecord(data);
  const order = asRecord(statement.order);
  const party = asRecord(order.party);
  const closedBy = asRecord(order.closed_by);
  const lines = Array.isArray(statement.lines)
    ? (statement.lines as Record<string, unknown>[])
    : [];
  const qty = asRecord(statement.quantity_summary);
  const fin = asRecord(statement.financial_summary);

  const totalLineGst = lines.reduce((sum, line) => sum + num(line.gst_amount), 0);
  const canDownloadPdf = !isLoading && !isError && lines.length > 0;

  const pdfLines = useMemo((): FinalOrderStatementPdfLine[] => {
    return lines.map((line) => ({
      productName: String(line.product_name || "—"),
      sku: line.sku ? String(line.sku) : undefined,
      hsnCode: line.hsn_code ? String(line.hsn_code) : undefined,
      ordered: String(num(line.ordered_quantity)),
      approved: String(num(line.approved_quantity)),
      dispatched: String(num(line.dispatched_quantity)),
      delivered: String(num(line.delivered_quantity)),
      returned: String(num(line.returned_quantity)),
      net: String(num(line.net_delivered_quantity)),
      unitPrice: pdfMoney(num(line.unit_price)),
      rateType: formatRateType(line.applied_rate_type),
      gstPercent: formatGstPercent(line.gst_percent),
      gstAmount: pdfMoney(num(line.gst_amount)),
      lineTotal: pdfMoney(num(line.total_amount)),
    }));
  }, [lines]);

  const orderNo = String(order.order_no || orderId);
  const statementNo = String(statement.statement_no || `FOS-${orderNo}`);

  const handleDownloadPdf = useCallback(async () => {
    if (!canDownloadPdf || !pdfTemplateRef.current) return;
    setIsDownloadingPdf(true);
    try {
      const safeOrder = orderNo.replace(/\s+/g, "-");
      const safeStatement = statementNo.replace(/\s+/g, "-");
      await downloadOrderItemsPdf(
        pdfTemplateRef.current,
        `${safeOrder}-${safeStatement}.pdf`,
      );
      toast.success("Final order statement PDF downloaded.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not generate PDF.";
      toast.error(message);
    } finally {
      setIsDownloadingPdf(false);
    }
  }, [canDownloadPdf, orderNo, statementNo]);

  if (!isOpen) return null;

  return (
    <LargeModalPortal>
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
      <PortalBusyOverlay active={isLoading} message="Loading final statement…" />
      <div
        aria-hidden
        className="pointer-events-none fixed -left-[9999px] top-0 overflow-hidden"
      >
        {canDownloadPdf ? (
          <div ref={pdfTemplateRef}>
            <FinalOrderStatementPdfTemplate
              companyName={companyName}
              logoUrl={logoUrl}
              statementNo={statementNo}
              orderNo={orderNo}
              partyName={String(party.party_name || "—")}
              partyCode={party.party_code ? String(party.party_code) : undefined}
              partyGstin={party.gstin ? String(party.gstin) : undefined}
              orderDate={formatDateShort(order.order_date)}
              closedAt={formatDate(order.closed_at)}
              closedBy={String(closedBy.name || "—")}
              closureRemarks={
                order.closure_remarks ? String(order.closure_remarks) : undefined
              }
              lines={pdfLines}
              quantityTotals={{
                ordered: String(num(qty.ordered)),
                approved: String(num(qty.approved)),
                dispatched: String(num(qty.dispatched)),
                delivered: String(num(qty.delivered)),
                returned: String(num(qty.returned)),
                net: String(num(qty.net_delivered)),
                gstAmount: pdfMoney(totalLineGst || num(fin.gst_amount)),
                grandTotal: pdfMoney(num(fin.grand_total)),
              }}
              financialSummary={{
                subtotal: pdfMoney(num(fin.subtotal)),
                lineDiscountTotal: pdfMoney(num(fin.line_discount_total)),
                taxableAmount: pdfMoney(num(fin.taxable_amount) || num(fin.subtotal)),
                gst: pdfMoney(num(fin.gst_amount)),
                headerDiscount: pdfMoney(num(fin.header_discount_amount)),
                extraCharges: pdfMoney(num(fin.extra_charges)),
                penaltyAmount: pdfMoney(num(fin.penalty_amount)),
                damageCharge: pdfMoney(num(fin.damage_charge)),
                grandTotal: pdfMoney(num(fin.grand_total)),
                paymentStatus: String(fin.payment_status || "—"),
              }}
              generatedAt={formatDate(statement.generated_at || new Date())}
            />
          </div>
        ) : null}
      </div>

      <div className="w-full max-w-6xl rounded-xl border border-slate-200/90 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900 max-h-[92vh] flex flex-col font-sans">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Final Order Statement
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {statementNo}
              {statement.generated_at ? (
                <>
                  {" · "}
                  Generated {formatDate(statement.generated_at)}
                </>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {isError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
              <p className="font-semibold">Could not load statement</p>
              <p className="mt-1 text-xs opacity-90">
                {error && typeof error === "object" && "data" in error
                  ? String((error as { data?: unknown }).data)
                  : "The order may not be closed yet."}
              </p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="mt-3 text-xs font-semibold underline"
              >
                Retry
              </button>
            </div>
          ) : !isLoading ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-white/10 dark:bg-slate-950/30 text-xs">
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Order
                  </h4>
                  <dl className="space-y-1">
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Order No</dt>
                      <dd className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {orderNo}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Order Date</dt>
                      <dd className="text-slate-800 dark:text-slate-200">{formatDate(order.order_date)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Closed At</dt>
                      <dd className="text-slate-800 dark:text-slate-200">{formatDate(order.closed_at)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Closed By</dt>
                      <dd className="text-slate-800 dark:text-slate-200">
                        {String(closedBy.name || "—")}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Party
                  </h4>
                  <dl className="space-y-1">
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Name</dt>
                      <dd className="font-semibold text-slate-900 dark:text-slate-100 text-right">
                        {String(party.party_name || "—")}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Code</dt>
                      <dd className="font-mono text-slate-800 dark:text-slate-200">
                        {String(party.party_code || "—")}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">GSTIN</dt>
                      <dd className="font-mono text-slate-800 dark:text-slate-200">
                        {String(party.gstin || "—")}
                      </dd>
                    </div>
                  </dl>
                </div>
                {order.closure_remarks ? (
                  <div className="sm:col-span-2 border-t border-slate-200/70 pt-3 dark:border-white/10">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Closure Remarks
                    </span>
                    <p className="mt-1 text-slate-700 dark:text-slate-300 italic">
                      {String(order.closure_remarks)}
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200/70 dark:border-white/10">
                <table className="w-full min-w-[960px] text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-semibold border-b border-slate-200/60 dark:border-white/5">
                    <tr>
                      <th className="px-3 py-2.5">Product</th>
                      <th className="px-3 py-2.5 text-center">Ordered</th>
                      <th className="px-3 py-2.5 text-center">Approved</th>
                      <th className="px-3 py-2.5 text-center">Dispatched</th>
                      <th className="px-3 py-2.5 text-center">Delivered</th>
                      <th className="px-3 py-2.5 text-center">Returns</th>
                      <th className="px-3 py-2.5 text-center">Net</th>
                      <th className="px-3 py-2.5 text-right">Rate</th>
                      <th className="px-3 py-2.5 text-center">Rate Type</th>
                      <th className="px-3 py-2.5 text-center">GST %</th>
                      <th className="px-3 py-2.5 text-right">GST Amt</th>
                      <th className="px-3 py-2.5 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {lines.map((line, idx) => (
                      <tr key={String(line.order_item_id ?? idx)} className="bg-white dark:bg-slate-900">
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {String(line.product_name || "—")}
                          </div>
                          {line.sku ? (
                            <div className="text-[10px] font-mono text-slate-400">{String(line.sku)}</div>
                          ) : null}
                          {line.hsn_code ? (
                            <div className="text-[10px] text-slate-400">HSN: {String(line.hsn_code)}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-center tabular-nums">{num(line.ordered_quantity)}</td>
                        <td className="px-3 py-2.5 text-center tabular-nums">{num(line.approved_quantity)}</td>
                        <td className="px-3 py-2.5 text-center tabular-nums">{num(line.dispatched_quantity)}</td>
                        <td className="px-3 py-2.5 text-center tabular-nums">
                          {num(line.delivered_quantity)}
                        </td>
                        <td className="px-3 py-2.5 text-center tabular-nums text-rose-600 dark:text-rose-400">
                          {num(line.returned_quantity)}
                        </td>
                        <td className="px-3 py-2.5 text-center tabular-nums font-semibold">
                          {num(line.net_delivered_quantity)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                          ₹{formatMoney(num(line.unit_price))}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            {formatRateType(line.applied_rate_type)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center tabular-nums text-slate-600 dark:text-slate-400">
                          {formatGstPercent(line.gst_percent)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                          ₹{formatMoney(num(line.gst_amount))}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                          ₹{formatMoney(num(line.total_amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50/80 dark:bg-slate-950/50 text-[11px] font-semibold border-t border-slate-200/60 dark:border-white/5">
                    <tr>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">Totals</td>
                      <td className="px-3 py-2.5 text-center tabular-nums">{num(qty.ordered)}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums">{num(qty.approved)}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums">{num(qty.dispatched)}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums">
                        {num(qty.delivered)}
                      </td>
                      <td className="px-3 py-2.5 text-center tabular-nums text-rose-600 dark:text-rose-400">
                        {num(qty.returned)}
                      </td>
                      <td className="px-3 py-2.5 text-center tabular-nums font-semibold">
                        {num(qty.net_delivered)}
                      </td>
                      <td className="px-3 py-2.5" colSpan={2} />
                      <td className="px-3 py-2.5" />
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        ₹{formatMoney(totalLineGst || num(fin.gst_amount))}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        ₹{formatMoney(num(fin.grand_total))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-4 dark:border-emerald-900/30 dark:bg-emerald-950/20">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Financial Summary
                </h4>
                <dl className="space-y-1.5 text-sm max-w-md ml-auto">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Subtotal (settled net lines)</dt>
                    <dd className="font-medium">₹{formatMoney(num(fin.subtotal))}</dd>
                  </div>
                  {num(fin.line_discount_total) > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Line Discount Total</dt>
                      <dd className="font-medium text-rose-600">
                        −₹{formatMoney(num(fin.line_discount_total))}
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Taxable Amount</dt>
                    <dd className="font-medium">₹{formatMoney(num(fin.taxable_amount) || num(fin.subtotal))}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">GST</dt>
                    <dd className="font-medium">₹{formatMoney(num(fin.gst_amount))}</dd>
                  </div>
                  {num(fin.header_discount_amount) > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Header Discount</dt>
                      <dd className="font-medium text-rose-600">
                        −₹{formatMoney(num(fin.header_discount_amount))}
                      </dd>
                    </div>
                  )}
                  {num(fin.extra_charges) > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Extra Charges</dt>
                      <dd className="font-medium">+₹{formatMoney(num(fin.extra_charges))}</dd>
                    </div>
                  )}
                  {num(fin.penalty_amount) > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Penalty</dt>
                      <dd className="font-medium">+₹{formatMoney(num(fin.penalty_amount))}</dd>
                    </div>
                  )}
                  {num(fin.damage_charge) > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Damage Charge</dt>
                      <dd className="font-medium">+₹{formatMoney(num(fin.damage_charge))}</dd>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-emerald-200/80 pt-2 dark:border-emerald-900/40">
                    <dt className="font-semibold text-slate-800 dark:text-slate-200">Grand Total</dt>
                    <dd className="text-base font-bold text-emerald-700 dark:text-emerald-400">
                      ₹{formatMoney(num(fin.grand_total))}
                    </dd>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 pt-1">
                    <dt>Payment Status</dt>
                    <dd className="capitalize">{String(fin.payment_status || "—")}</dd>
                  </div>
                </dl>
              </div>
            </>
          ) : null}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 px-5 py-4 dark:border-white/5">
          {canDownloadPdf && (
            <button
              type="button"
              onClick={() => void handleDownloadPdf()}
              disabled={isDownloadingPdf}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              {isDownloadingPdf ? "Generating PDF..." : "Download PDF"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
          >
            Close
          </button>
        </div>
      </div>
    </div>
    </LargeModalPortal>
  );
}
