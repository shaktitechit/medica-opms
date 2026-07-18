"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";

import {
  OrderItemsPdfTemplate,
  type OrderItemsPdfLine,
} from "@/components/portal/shared/OrderItemsPdfTemplate";
import { downloadOrderItemsPdf } from "@/components/portal/shared/downloadOrderItemsPdf";
import {
  accountAmendmentNotes,
  isAccountAmended,
} from "@/components/portal/shared/orderAccountApprovalDisplay";
import { resolveUserDisplay } from "@/components/portal/shared/userDisplay";
import {
  companyLetterheadLogoUrl,
  companyLetterheadName,
  resolvePublicAssetUrl,
} from "@/lib/env";
import { toast } from "@/lib/toast";
import { AccountAmendFinanceApprovalModal } from "./AccountAmendFinanceApprovalModal";

type AccountApprovalRecordCardProps = {
  approval: Record<string, any>;
  orderNo: string;
  partyLabel: string;
  orderDate?: unknown;
  expectedDeliveryDate?: unknown;
  userNameById: Record<string, string>;
  detail: Record<string, any> | null;
  refetchOrder?: () => void;
};

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
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function pdfMoney(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function formatStatus(status: string): string {
  if (!status) return "—";
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function statusBadgeClass(status: string): string {
  const s = String(status).toLowerCase();
  if (s === "rejected" || s === "finance_rejected") {
    return "bg-rose-50 text-rose-700 ring-1 ring-rose-600/15 dark:bg-rose-955/30 dark:text-rose-300 dark:ring-rose-500/20";
  }
  if (s === "pending_review" || s === "pending") {
    return "bg-amber-50 text-amber-700 ring-1 ring-amber-600/15 dark:bg-amber-955/30 dark:text-amber-300 dark:ring-amber-500/20";
  }
  if (s === "fully_approved" || s === "approved") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15 dark:bg-emerald-955/30 dark:text-emerald-300 dark:ring-emerald-500/20";
  }
  if (s === "partially_approved") {
    return "bg-sky-50 text-sky-700 ring-1 ring-sky-600/15 dark:bg-sky-955/30 dark:text-sky-300 dark:ring-sky-500/20";
  }
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-600/10 dark:bg-slate-900 dark:text-slate-300 dark:ring-white/10";
}

export function AccountApprovalRecordCard({
  approval,
  orderNo,
  partyLabel,
  orderDate,
  expectedDeliveryDate,
  userNameById,
  detail,
  refetchOrder,
}: AccountApprovalRecordCardProps) {
  const approvalStatus = useMemo(() => {
    if (approval.rejected_by || approval.rejection_reason) {
      return "rejected";
    }
    if (approval.is_finance_approved) {
      const items = Array.isArray(approval.approval_items) ? approval.approval_items : [];
      const allRejected = items.length > 0 && items.every(item => Number((item as any).approved_quantity || 0) <= 0);
      const allFullyApproved = items.length > 0 && items.every(item => Number((item as any).approved_quantity || 0) >= Number((item as any).ordered_quantity || 0));
      const hasPartial = items.some(item => Number((item as any).approved_quantity || 0) < Number((item as any).ordered_quantity || 0));
      if (allRejected) return "rejected";
      if (allFullyApproved && !hasPartial) return "fully_approved";
      return "partially_approved";
    }
    if (approval.is_admin_approved) {
      if (approval.assigned_finance_user) {
        return "sent_to_finance";
      }
      return "approved";
    }
    return "pending_review";
  }, [approval]);
  const approvalNo = String(approval.approval_no ?? "—");
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [amendModalOpen, setAmendModalOpen] = useState(false);
  const pdfTemplateRef = useRef<HTMLDivElement>(null);

  const canAmend =
    approvalStatus === "approved" ||
    approvalStatus === "fully_approved" ||
    approvalStatus === "partially_approved";

  const items = useMemo(() => {
    return Array.isArray(approval.approval_items)
      ? (approval.approval_items as Record<string, any>[])
      : [];
  }, [approval]);

  const approvedByLabel = resolveUserDisplay(
    approval.admin_approved_by ?? approval.approved_by ?? approval.reviewed_by,
    userNameById,
  );
  const approvedAtLabel = formatDate(
    approval.admin_approved_at ?? approval.approved_at ?? approval.reviewed_at ?? approval.createdAt,
  );
  const financeApprovedByLabel = resolveUserDisplay(approval.finance_approved_by, userNameById);
  const financeApprovedAtLabel = formatDate(approval.finance_approved_at);
  const accountApprovedByLabel = resolveUserDisplay(approval.account_approved_by, userNameById);
  const accountApprovedAtLabel = formatDate(approval.account_approved_at);
  const financeAmended = Boolean(approval.finance_amended);
  const financeAmendedByLabel = resolveUserDisplay(approval.finance_amended_by, userNameById);
  const financeAmendedAtLabel = formatDate(approval.finance_amended_at);
  const accountAmended = isAccountAmended(approval);
  const accountAmendedByLabel = resolveUserDisplay(approval.account_amended_by, userNameById);
  const accountAmendedAtLabel = formatDate(approval.account_amended_at);
  const accountAmendNotes = accountAmendmentNotes(approval);

  const canDownloadPdf =
    approvalStatus === "approved" || approvalStatus === "fully_approved" || approvalStatus === "partially_approved";

  const computedTotals = useMemo(() => {
    let subtotal = 0;
    let gst = 0;
    for (const it of items) {
      if (Number(it.approved_quantity ?? 0) <= 0) continue;
      const baseItem = detail?.order_items?.find((x: any) => String(x._id ?? x.id) === String(it.order_item_id)) || {};
      const qty = Number(it.approved_quantity ?? 0);
      const price = Number(it.approved_unit_price ?? it.ordered_unit_price ?? 0);
      const discountPercent = Number(baseItem.discount_percent ?? 0);
      const discountAmt = Number(baseItem.discount_amount ?? 0);
      const gstPercent = Number(baseItem.gst_percent ?? 0);

      const gross = qty * price;
      const lineDiscount = discountPercent > 0 
        ? (gross * discountPercent) / 100 
        : (baseItem.ordered_quantity > 0 ? (discountAmt * qty) / baseItem.ordered_quantity : 0);
      const taxable = Math.max(0, gross - lineDiscount);
      const lineGst = (taxable * gstPercent) / 100;

      subtotal += taxable;
      gst += lineGst;
    }
    return { subtotal, gst };
  }, [items, detail]);

  const pdfLines = useMemo((): OrderItemsPdfLine[] => {
    return items
      .filter((it) => Number(it.approved_quantity ?? 0) > 0)
      .map((it) => {
        const baseItem = detail?.order_items?.find((x: any) => String(x._id ?? x.id) === String(it.order_item_id)) || {};
        const product = it.product as Record<string, unknown> | undefined;
        const qty = Number(it.approved_quantity ?? 0);
        const unitPrice = Number(it.approved_unit_price ?? it.ordered_unit_price ?? 0);
        const discountPercent = Number(baseItem.discount_percent ?? 0);
        const discountAmt = Number(baseItem.discount_amount ?? 0);
        const gstPercent = Number(baseItem.gst_percent ?? 0);
        const freeQtyVal = Number(baseItem.free_quantity ?? 0);
        const gross = qty * unitPrice;
        const actualDiscount = discountPercent > 0 
          ? (gross * discountPercent) / 100 
          : (baseItem.ordered_quantity > 0 ? (discountAmt * qty) / baseItem.ordered_quantity : 0);
        const taxable = Math.max(0, gross - actualDiscount);
        const actualGst = (taxable * gstPercent) / 100;
        const lineTotal = Number(
          it.approved_total_amount ?? taxable + actualGst,
        );

        return {
          productName: String(product?.product_name ?? baseItem.product_name ?? "—"),
          sku: typeof product?.sku === "string" ? product.sku : (typeof baseItem.sku === "string" ? baseItem.sku : undefined),
          quantity: String(qty),
          freeQty: String(freeQtyVal),
          rateType: String(baseItem.applied_rate_type ?? "MANUAL"),
          unitPrice: pdfMoney(unitPrice),
          discount: pdfMoney(actualDiscount),
          gst: pdfMoney(actualGst),
          lineTotal: pdfMoney(lineTotal),
        };
      });
  }, [items, detail]);

  const companyName = companyLetterheadName();
  const logoUrl = resolvePublicAssetUrl(companyLetterheadLogoUrl());

  const handleDownloadPdf = useCallback(async () => {
    if (!canDownloadPdf || !pdfTemplateRef.current || pdfLines.length === 0) {
      return;
    }
    setIsDownloadingPdf(true);
    try {
      const safeNo = approvalNo.replace(/\s+/g, "-");
      const safeOrder = orderNo.replace(/\s+/g, "-");
      await downloadOrderItemsPdf(
        pdfTemplateRef.current,
        `${safeOrder}-${safeNo}.pdf`,
        { salesApproved: true },
      );
      toast.success("Approval PDF downloaded.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not generate PDF.";
      toast.error(message);
    } finally {
      setIsDownloadingPdf(false);
    }
  }, [approvalNo, canDownloadPdf, orderNo, pdfLines.length]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/40">
      <div
        aria-hidden
        className="pointer-events-none fixed -left-[9999px] top-0 overflow-hidden"
      >
        {canDownloadPdf ? (
          <div ref={pdfTemplateRef}>
            <OrderItemsPdfTemplate
              companyName={companyName}
              logoUrl={logoUrl}
              orderNo={orderNo}
              partyName={partyLabel}
              orderDate={formatDateShort(orderDate)}
              expectedDeliveryDate={
                expectedDeliveryDate
                  ? formatDateShort(expectedDeliveryDate)
                  : undefined
              }
              statusLabel={formatStatus(approvalStatus)}
              salesApproval={{
                statusLabel: formatStatus(approvalStatus),
                approvalNo,
                approvedBy: approvedByLabel,
                approvedAt: approvedAtLabel,
              }}
              items={pdfLines}
              subtotal={pdfMoney(computedTotals.subtotal)}
              gst={pdfMoney(computedTotals.gst)}
              headerDiscount="0.00"
              grandTotal={pdfMoney(computedTotals.subtotal + computedTotals.gst)}
              generatedAt={formatDate(new Date())}
            />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-white/5">
        <div className="flex flex-wrap items-center gap-2 font-sans">
          <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-100 font-sans">
            {approvalNo}
          </span>
          <span className="text-slate-300">|</span>
          <span className="font-sans text-2xs text-slate-500 font-sans">
            Rev #{String(approval.revision_number ?? 1)}
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold ${statusBadgeClass(approvalStatus)}`}>
            {formatStatus(approvalStatus)}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {approval.is_finance_approved ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/15 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-500/20">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Finance Approved
              </span>
            ) : null}
            {approval.is_account_approved ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/15 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-500/20">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Account Approved
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-600/10 dark:bg-slate-900 dark:text-slate-300 dark:ring-white/10">
                Account Pending
              </span>
            )}
            {financeAmended ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-600/20 dark:bg-indigo-950/30 dark:text-indigo-300">
                Finance Amended
              </span>
            ) : null}
            {accountAmended ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/10 px-2.5 py-1 text-xs font-semibold text-teal-700 ring-1 ring-teal-600/20 dark:bg-teal-950/30 dark:text-teal-300">
                Account Amended
              </span>
            ) : null}
          </div>
          <div className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400 font-sans">
            {Boolean(approval.is_finance_approved) ? (
              <p>
                <b>Finance:</b> Approved by{" "}
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {financeApprovedByLabel}
                </span>
                {financeApprovedAtLabel !== "—" ? (
                  <span className="tabular-nums"> at {financeApprovedAtLabel}</span>
                ) : null}
              </p>
            ) : null}
            {Boolean(approval.is_account_approved) ? (
              <p>
                <b>Account:</b> Approved by{" "}
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {accountApprovedByLabel}
                </span>
                {accountApprovedAtLabel !== "—" ? (
                  <span className="tabular-nums"> at {accountApprovedAtLabel}</span>
                ) : null}
              </p>
            ) : approvalStatus === "rejected" ? (
              <p>
                <b>Rejected:</b>{" "}
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {resolveUserDisplay(approval.rejected_by || approval.reviewed_by, userNameById)}
                </span>
                {" "}
                ·{" "}
                <span className="tabular-nums">
                  {formatDate(approval.rejected_at || approval.reviewed_at || approval.createdAt)}
                </span>
              </p>
            ) : (
              <p>
                <b>Admin:</b> Approved by{" "}
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {approvedByLabel}
                </span>
                {" "}
                · <span className="tabular-nums">{approvedAtLabel}</span>
              </p>
            )}
            {financeAmended ? (
              <p>
                <b>Finance Amendment:</b> Amended by{" "}
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {financeAmendedByLabel}
                </span>
                {financeAmendedAtLabel !== "—" ? (
                  <span className="tabular-nums"> · {financeAmendedAtLabel}</span>
                ) : null}
              </p>
            ) : null}
            {accountAmended ? (
              <p>
                <b>Account Amendment:</b> Amended by{" "}
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {accountAmendedByLabel}
                </span>
                {accountAmendedAtLabel !== "—" ? (
                  <span className="tabular-nums"> · {accountAmendedAtLabel}</span>
                ) : null}
                {accountAmendNotes ? (
                  <span className="mt-1 block text-2xs italic text-slate-500 dark:text-slate-400">
                    {accountAmendNotes}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canAmend ? (
            <button
              type="button"
              onClick={() => setAmendModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              Amend
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void handleDownloadPdf()}
            disabled={!canDownloadPdf || pdfLines.length === 0 || isDownloadingPdf}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-white/5"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {isDownloadingPdf ? "Generating PDF…" : "Download PDF"}
          </button>
        </div>
      </div>

      <div className="mt-4 border-t border-slate-200/90 pt-4 dark:border-white/10">
        <div className="mb-3">
          <h4 className="font-sans text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Financial Breakdown
          </h4>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Totals for this approval revision.
          </p>
        </div>
        <div className="grid gap-3 font-sans text-sm sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-slate-900/40">
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              Credit Checked
            </span>
            <span className="mt-1 block font-semibold text-slate-900 dark:text-slate-100">
              {approval.credit_limit_checked ? "✅ Yes" : "❌ No"}
            </span>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-slate-900/40">
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              Outstanding Checked
            </span>
            <span className="mt-1 block font-semibold text-slate-900 dark:text-slate-100">
              {approval.outstanding_checked ? "✅ Yes" : "❌ No"}
            </span>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-slate-900/40">
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              Risk Level
            </span>
            <span className="mt-1 block font-semibold text-slate-900 dark:text-slate-100 capitalize">
              {approval.risk_level ?? "low"}
            </span>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-slate-900/40">
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              Taxable Subtotal
            </span>
            <span className="mt-1 block font-mono font-semibold text-slate-900 dark:text-slate-100">
              ₹{computedTotals.subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-slate-900/40">
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              GST Total
            </span>
            <span className="mt-1 block font-mono font-semibold text-slate-900 dark:text-slate-100">
              ₹{computedTotals.gst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-emerald-50/10 p-3 dark:border-white/10 dark:bg-emerald-950/10">
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              Approved Total
            </span>
            <span className="mt-1 block font-mono font-semibold text-emerald-700 dark:text-emerald-300">
              ₹{(computedTotals.subtotal + computedTotals.gst).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="mt-4 border-t border-slate-200 pt-4 dark:border-white/10">
          <h4 className="mb-2 font-sans text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Approved Items
          </h4>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-white/10">
            <table className="w-full min-w-[960px] text-left font-sans text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Rate Type</th>
                  <th className="px-3 py-2 font-medium text-right">Batch Qty</th>
                  <th className="px-3 py-2 font-medium text-right">Approve Qty</th>
                  <th className="px-3 py-2 font-medium text-right">Unit Price</th>
                  <th className="px-3 py-2 font-medium text-right">Discount</th>
                  <th className="px-3 py-2 font-medium text-right">GST</th>
                  <th className="px-3 py-2 font-medium text-right">Net Total</th>
                  <th className="px-3 py-2 font-medium">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                {items.map((it) => {
                  const baseItem = detail?.order_items?.find((x: any) => String(x._id ?? x.id) === String(it.order_item_id)) || {};
                  const rateType = String(baseItem.applied_rate_type ?? "MANUAL");
                  const rateMapped = Boolean(baseItem.rate_mapped);
                  const qty = Number(it.approved_quantity ?? 0);
                  const unitPrice = Number(it.approved_unit_price ?? it.ordered_unit_price ?? 0);
                  const freeQty = Number(baseItem.free_quantity ?? 0);
                  const discountPercent = Number(baseItem.discount_percent ?? 0);
                  const discountAmount = Number(baseItem.discount_amount ?? 0);
                  const gstPercent = Number(baseItem.gst_percent ?? 0);

                  const gross = qty * unitPrice;
                  const lineDiscount = discountPercent > 0 
                    ? (gross * discountPercent) / 100 
                    : (baseItem.ordered_quantity > 0 ? (discountAmount * qty) / baseItem.ordered_quantity : 0);
                  const lineTaxable = Math.max(0, gross - lineDiscount);
                  const lineGst = (lineTaxable * gstPercent) / 100;
                  const lineTotal = lineTaxable + lineGst;

                  const scaledFreeQty = baseItem.sales_approved_quantity > 0 
                    ? Math.floor((freeQty * qty) / baseItem.sales_approved_quantity)
                    : 0;

                  return (
                    <tr
                      key={String(it._id ?? it.order_item_id)}
                      className="bg-white dark:bg-slate-900 hover:bg-slate-50/50 dark:hover:bg-white/5"
                    >
                      <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-200 font-sans">
                        {String(it.product?.product_name ?? baseItem.product_name ?? "—")}
                      </td>
                      <td className="px-3 py-2 font-sans">
                        <div className="flex flex-col font-sans">
                          <span className="font-semibold">{rateType}</span>
                          {rateMapped ? (
                            <span className="text-2xs text-emerald-600 font-semibold dark:text-emerald-400 leading-none">
                              Negotiated
                            </span>
                          ) : (
                            <span className="text-2xs text-slate-400 font-medium dark:text-slate-500 leading-none">
                              Manual
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400 font-sans">
                        {Number(it.ordered_quantity ?? 0)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-800 dark:text-slate-100 font-sans">
                        <div className="flex flex-col font-sans">
                          <span className="font-semibold">{qty}</span>
                          {scaledFreeQty > 0 ? (
                            <span className="text-2xs text-indigo-600 dark:text-indigo-400 leading-none">
                              +{scaledFreeQty} free
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300 font-sans">
                        ₹{unitPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300 font-sans">
                        <div className="flex flex-col font-sans">
                          <span>{discountPercent > 0 ? `${discountPercent}%` : "—"}</span>
                          {lineDiscount > 0 ? (
                            <span className="text-2xs text-slate-500 leading-none">
                              (-₹{lineDiscount.toLocaleString("en-IN", { minimumFractionDigits: 2 })})
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300 font-sans">
                        <div className="flex flex-col font-sans">
                          <span>{gstPercent > 0 ? `${gstPercent}%` : "0%"}</span>
                          {lineGst > 0 ? (
                            <span className="text-2xs text-slate-500 leading-none">
                              (+₹{lineGst.toLocaleString("en-IN", { minimumFractionDigits: 2 })})
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-900 dark:text-slate-100 bg-slate-50/20 dark:bg-slate-900/20 font-sans">
                        ₹{lineTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        className="max-w-[150px] truncate px-3 py-2 italic text-slate-500 font-sans"
                        title={String(it.remarks ?? it.rejection_reason ?? "")}
                      >
                        {String(it.remarks ?? it.rejection_reason ?? "—")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {approval.approval_notes ? (
        <p className="mt-3 rounded-lg border border-slate-100 bg-slate-50/80 p-2.5 font-sans text-xs text-slate-650 dark:border-white/5 dark:bg-slate-900/30 dark:text-slate-300 leading-relaxed">
          <span className="mr-1.5 font-semibold text-slate-500">
            Approval notes:
          </span>
          {String(approval.approval_notes)}
        </p>
      ) : null}
      
      {approval.rejection_reason ? (
        <p className="mt-3 rounded-lg border border-rose-100 bg-rose-50/30 p-2.5 font-sans text-xs text-rose-700 dark:border-rose-900/20 dark:bg-rose-950/10 leading-relaxed">
          <span className="mr-1.5 font-semibold">
            Rejection reason:
          </span>
          {String(approval.rejection_reason)}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 font-sans text-2xs text-slate-400 dark:border-white/5">
        <span>Reviewed {formatDate(approval.reviewed_at || approval.createdAt)}</span>
      </div>

      <AccountAmendFinanceApprovalModal
        open={amendModalOpen}
        onClose={() => setAmendModalOpen(false)}
        approval={approval}
        orderId={detail?._id ?? detail?.id ?? ""}
        detail={detail}
        readOnlyItems={detail?.order_items ?? []}
        refetchOrder={refetchOrder}
      />
    </div>
  );
}

export default AccountApprovalRecordCard;
