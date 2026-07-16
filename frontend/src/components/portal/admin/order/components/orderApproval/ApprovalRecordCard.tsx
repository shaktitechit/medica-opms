"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { CheckCircle2, Download, Pencil, Send } from "lucide-react";

import {
  OrderItemsPdfTemplate,
  type OrderItemsPdfLine,
} from "@/components/portal/shared/OrderItemsPdfTemplate";
import { downloadOrderItemsPdf } from "@/components/portal/shared/downloadOrderItemsPdf";
import {
  accountAmendmentNotes,
  isAccountAmended,
} from "@/components/portal/shared/orderAccountApprovalDisplay";
import {
  adminAmendmentNotes,
  isAdminAmended,
} from "@/components/portal/shared/orderAdminApprovalDisplay";
import { resolveUserDisplay } from "@/components/portal/shared/userDisplay";
import {
  companyLetterheadLogoUrl,
  companyLetterheadName,
  resolvePublicAssetUrl,
} from "@/lib/env";
import { toast } from "@/lib/toast";

type ApprovalRecordCardProps = {
  approval: Record<string, unknown>;
  orderNo: string;
  partyLabel: string;
  orderDate?: unknown;
  expectedDeliveryDate?: unknown;
  userNameById: Record<string, string>;
  portal?: "admin" | "finance" | "account";
  onSendToFinance?: (approvalId: string) => void;
  onSendToAccount?: (approvalId: string) => void;
  onAmend?: (approvalId: string) => void;
  onApprove?: () => void;
  amendBusy?: boolean;
  amendingApprovalId?: string | null;
  sendToFinanceBusy?: boolean;
  sendToAccountBusy?: boolean;
  sendingApprovalId?: string | null;
  isAmendBlocked?: boolean;
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

function statusBadgeClass(status: string): string {
  if (status === "rejected") {
    return "bg-rose-550/10 text-rose-700 ring-1 ring-rose-600/20 dark:bg-rose-950/30 dark:text-rose-355 dark:ring-rose-500/30";
  }
  if (status === "pending_review" || status === "draft") {
    return "bg-amber-500/10 text-amber-700 ring-1 ring-amber-600/20 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-500/30";
  }
  if (status === "approved" || status === "sent_to_finance") {
    return "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-600/20 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-500/30";
  }
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-600/10 dark:bg-slate-900 dark:text-slate-300 dark:ring-white/10";
}

function formatStatus(status: string): string {
  if (!status) return "—";
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function lineApprovalBadgeClass(status: string): string {
  if (status === "rejected") return "text-rose-600 dark:text-rose-400";
  if (status === "partially_approved") return "text-sky-600 dark:text-sky-400";
  if (status === "fully_approved") return "text-emerald-600 dark:text-emerald-400";
  return "text-slate-500 dark:text-slate-400";
}

function approvalItemsList(approval: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(approval.approval_items)
    ? (approval.approval_items as Record<string, unknown>[])
    : [];
}

export function ApprovalRecordCard({
  approval,
  orderNo,
  partyLabel,
  orderDate,
  expectedDeliveryDate,
  userNameById,
  portal = "admin",
  onSendToFinance,
  onSendToAccount,
  onAmend,
  onApprove,
  amendBusy = false,
  amendingApprovalId = null,
  sendToFinanceBusy = false,
  sendToAccountBusy = false,
  sendingApprovalId = null,
  isAmendBlocked = false,
}: ApprovalRecordCardProps) {
  const approvalId = String(approval._id ?? approval.id ?? "");
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
  const pdfTemplateRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => approvalItemsList(approval), [approval]);

  const approvedByLabel = resolveUserDisplay(approval.approved_by, userNameById);
  const approvedAtLabel = formatDate(approval.approved_at);
  const financeAmended = Boolean(approval.finance_amended);
  const financeAmendedByLabel = resolveUserDisplay(
    approval.finance_amended_by,
    userNameById,
  );
  const financeAmendedAtLabel = formatDate(approval.finance_amended_at);
  const accountAmended = isAccountAmended(approval);
  const accountAmendedByLabel = resolveUserDisplay(
    approval.account_amended_by,
    userNameById,
  );
  const accountAmendedAtLabel = formatDate(approval.account_amended_at);
  const accountAmendNotes = accountAmendmentNotes(approval);
  const adminAmended = isAdminAmended(approval);
  const adminAmendedByLabel = resolveUserDisplay(
    approval.admin_amended_by,
    userNameById,
  );
  const adminAmendedAtLabel = formatDate(approval.admin_amended_at);
  const adminAmendNotes = adminAmendmentNotes(approval);
  const financeAssigneeLabel = resolveUserDisplay(
    approval.assigned_finance_user,
    userNameById,
  );
  const sentToFinanceAtLabel = formatDate(approval.sent_to_finance_at);

  const financeApprovedByLabel = resolveUserDisplay(
    approval.finance_approved_by,
    userNameById,
  );
  const financeApprovedAtLabel = formatDate(approval.finance_approved_at);

  const accountApprovedByLabel = resolveUserDisplay(
    approval.account_approved_by,
    userNameById,
  );
  const accountApprovedAtLabel = formatDate(approval.account_approved_at);

  const salesSubmittedByLabel = resolveUserDisplay(
    approval.sales_submitted_by,
    userNameById,
  );
  const salesSubmittedAtLabel = formatDate(approval.sales_submitted_at);

  const isFinancePortal = portal === "finance";
  const isAccountPortal = portal === "account";
  const accountAssigneeLabel = resolveUserDisplay(
    approval.assigned_account_user,
    userNameById,
  );
  const sentToAccountAtLabel = formatDate(approval.sent_to_account_at);

  const canDownloadPdf =
    approvalStatus === "approved" ||
    approvalStatus === "sent_to_finance" ||
    approvalStatus === "fully_approved" ||
    approvalStatus === "partially_approved" ||
    Boolean(approval.is_admin_approved) ||
    Boolean(approval.is_finance_approved) ||
    Boolean(approval.is_account_approved);
  const canSendToFinance =
    !isFinancePortal && !isAccountPortal && approvalStatus === "approved";
  const canSendToAccount =
    isFinancePortal &&
    Boolean(approval.is_finance_approved) &&
    !approval.assigned_account_user &&
    (approvalStatus === "fully_approved" ||
      approvalStatus === "partially_approved" ||
      approvalStatus === "approved");
  const isAdminApproved = Boolean(approval.is_admin_approved);
  const isFinanceApproved = Boolean(approval.is_finance_approved);
  const canFinanceApprove =
    isFinancePortal && !isFinanceApproved && !isAmendBlocked;
  const canFinanceAmend =
    isFinancePortal && isFinanceApproved && !isAmendBlocked;
  const isAccountApproved = Boolean(approval.is_account_approved);
  const canAccountApprove =
    isAccountPortal &&
    !isAccountApproved &&
    !isAmendBlocked;
  const canAccountAmend =
    isAccountPortal && isAccountApproved && !isAmendBlocked;
  const canAmend = isAmendBlocked
    ? false
    : isFinancePortal || isAccountPortal
      ? false
      : approvalStatus === "approved" ||
        approvalStatus === "sent_to_finance" ||
        Boolean(approval.is_admin_approved) ||
        Boolean(approval.is_sales_submited);
  const isAmendingThis = amendBusy && amendingApprovalId === approvalId;

  const pdfLines = useMemo((): OrderItemsPdfLine[] => {
    return items
      .filter((it) => Number(it.approved_quantity ?? 0) > 0)
      .map((it) => {
        const product = it.product as Record<string, unknown> | undefined;
        const qty = Number(it.approved_quantity ?? 0);
        const unitPrice = Number(it.approved_unit_price ?? it.ordered_unit_price ?? 0);
        const discountPercent = Number(it.discount_percent ?? 0);
        const discountAmt = Number(it.discount_amount ?? 0);
        const gstPercent = Number(it.gst_percent ?? 0);
        const freeQtyVal = Number(it.free_quantity ?? 0);
        const gross = qty * unitPrice;
        const actualDiscount = discountPercent > 0 ? (gross * discountPercent) / 100 : discountAmt;
        const taxable = Math.max(0, gross - actualDiscount);
        const actualGst = (taxable * gstPercent) / 100;
        const lineTotal = Number(
          it.approved_total_amount ?? taxable + actualGst,
        );

        return {
          productName: String(product?.product_name ?? "—"),
          sku: typeof product?.sku === "string" ? product.sku : undefined,
          quantity: String(qty),
          freeQty: String(freeQtyVal),
          rateType: String(it.applied_rate_type ?? "MANUAL"),
          unitPrice: pdfMoney(unitPrice),
          discount: pdfMoney(actualDiscount),
          gst: pdfMoney(actualGst),
          lineTotal: pdfMoney(lineTotal),
        };
      });
  }, [items]);

  const orderedTotal = Number(approval.ordered_total_amount ?? 0);
  const approvedTotal = Number(approval.approved_total_amount ?? 0);

  const computedTotals = useMemo(() => {
    let subtotal = 0;
    let gst = 0;
    for (const it of items) {
      if (Number(it.approved_quantity ?? 0) <= 0) continue;
      const qty = Number(it.approved_quantity ?? 0);
      const price = Number(it.approved_unit_price ?? it.ordered_unit_price ?? 0);
      const discountPercent = Number(it.discount_percent ?? 0);
      const discountAmt = Number(it.discount_amount ?? 0);
      const gstPercent = Number(it.gst_percent ?? 0);

      const gross = qty * price;
      const lineDiscount = discountPercent > 0 ? (gross * discountPercent) / 100 : discountAmt;
      const taxable = Math.max(0, gross - lineDiscount);
      const lineGst = (taxable * gstPercent) / 100;

      subtotal += taxable;
      gst += lineGst;
    }
    return { subtotal, gst };
  }, [items]);

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

  const isSendingThis =
    (sendToFinanceBusy || sendToAccountBusy) && sendingApprovalId === approvalId;

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/40">
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
              financeAmendment={
                financeAmended
                  ? {
                    amendedBy: financeAmendedByLabel,
                    amendedAt: financeAmendedAtLabel,
                    amendmentNotes: approval.approval_notes
                      ? String(approval.approval_notes)
                      : undefined,
                  }
                  : undefined
              }
              adminAmendment={
                adminAmended
                  ? {
                    amendedBy: adminAmendedByLabel,
                    amendedAt: adminAmendedAtLabel,
                    amendmentNotes: adminAmendNotes,
                  }
                  : undefined
              }
              items={pdfLines}
              subtotal={pdfMoney(computedTotals.subtotal)}
              gst={pdfMoney(computedTotals.gst)}
              headerDiscount="0.00"
              grandTotal={pdfMoney(approvedTotal)}
              generatedAt={formatDate(new Date())}
            />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-white/5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-100">
            {approvalNo}
          </span>
          <span className="text-slate-300">|</span>
          <span className="font-sans text-[10px] text-slate-500">
            Rev #{String(approval.revision_number ?? 1)}
          </span>
        </div>

      </div>

      {(approvalStatus === "approved" ||
        approvalStatus === "sent_to_finance" ||
        approvalStatus === "fully_approved" ||
        approvalStatus === "partially_approved" ||
        approvalStatus === "pending_review" ||
        Boolean(approval.is_admin_approved) ||
        Boolean(approval.is_finance_approved) ||
        Boolean(approval.is_sales_submited)) && (
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {approval.is_admin_approved ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-600/15 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-500/20">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Admin Approved
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-600/15 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-500/20">
                  Admin Review Pending
                </span>
              )}

              {approval.is_finance_approved ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-600/15 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-500/20">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Finance Approved
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-600/10 dark:bg-slate-900 dark:text-slate-300 dark:ring-white/10">
                  Finance Pending
                </span>
              )}

              {approval.is_account_approved ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-600/15 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-500/20">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Account Approved
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-600/10 dark:bg-slate-900 dark:text-slate-300 dark:ring-white/10">
                  Account Pending
                </span>
              )}

              {financeAmended && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-600/20 dark:bg-indigo-950/30 dark:text-indigo-300">
                  Finance Amended
                </span>
              )}

              {accountAmended && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/10 px-2.5 py-1 text-[11px] font-semibold text-teal-700 ring-1 ring-teal-600/20 dark:bg-teal-950/30 dark:text-teal-300">
                  Account Amended
                </span>
              )}

              {adminAmended && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-600/20 dark:bg-violet-950/30 dark:text-violet-300">
                  Admin Amended
                </span>
              )}
            </div>
            <div className="mt-2 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
              {(Boolean(approval.is_sales_submited) || Boolean(approval.sales_submitted_by)) && (
                <p>
                  <b>Sales:</b> Submitted by <span className="font-medium text-slate-700 dark:text-slate-200">{salesSubmittedByLabel}</span>
                  {salesSubmittedAtLabel && salesSubmittedAtLabel !== "—" ? <span className="tabular-nums"> at {salesSubmittedAtLabel}</span> : null}
                </p>
              )}
              <p>
                <b>Admin:</b>{" "}
                {approval.is_admin_approved ? (
                  <>
                    Approved by <span className="font-medium text-slate-700 dark:text-slate-200">{approvedByLabel}</span>
                    {approvedAtLabel !== "—" ? <span className="tabular-nums"> at {approvedAtLabel}</span> : null}
                  </>
                ) : (
                  "Pending sign-off"
                )}
              </p>
              {Boolean(approval.is_finance_approved) && (
                <p>
                  <b>Finance:</b> Approved by <span className="font-medium text-slate-700 dark:text-slate-200">{financeApprovedByLabel}</span>
                  {financeApprovedAtLabel !== "—" ? <span className="tabular-nums"> at {financeApprovedAtLabel}</span> : null}
                </p>
              )}
              {Boolean(approval.is_account_approved) && (
                <p>
                  <b>Account:</b> Approved by <span className="font-medium text-slate-700 dark:text-slate-200">{accountApprovedByLabel}</span>
                  {accountApprovedAtLabel !== "—" ? <span className="tabular-nums"> at {accountApprovedAtLabel}</span> : null}
                </p>
              )}
              {financeAmended && (
                <p className="text-slate-500 dark:text-slate-400">
                  <b>Finance Amendment:</b> Amended by{" "}
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {financeAmendedByLabel}
                  </span>
                  {financeAmendedAtLabel !== "—" ? (
                    <>
                      {" "}
                      · <span className="tabular-nums">{financeAmendedAtLabel}</span>
                    </>
                  ) : null}
                </p>
              )}
              {accountAmended && (
                <p className="text-slate-500 dark:text-slate-400">
                  <b>Account Amendment:</b> Amended by{" "}
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {accountAmendedByLabel}
                  </span>
                  {accountAmendedAtLabel !== "—" ? (
                    <>
                      {" "}
                      · <span className="tabular-nums">{accountAmendedAtLabel}</span>
                    </>
                  ) : null}
                  {accountAmendNotes ? (
                    <span className="mt-1 block text-[10px] italic text-slate-500 dark:text-slate-400 font-sans">
                      {accountAmendNotes}
                    </span>
                  ) : null}
                </p>
              )}
              {adminAmended && (
                <p className="text-slate-500 dark:text-slate-400">
                  <b>Admin Amendment:</b> Amended by{" "}
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {adminAmendedByLabel}
                  </span>
                  {adminAmendedAtLabel !== "—" ? (
                    <>
                      {" "}
                      · <span className="tabular-nums">{adminAmendedAtLabel}</span>
                    </>
                  ) : null}
                  {adminAmendNotes ? (
                    <span className="mt-1 block text-[10px] italic text-slate-500 dark:text-slate-400 font-sans">
                      {adminAmendNotes}
                    </span>
                  ) : null}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void handleDownloadPdf()}
              disabled={!canDownloadPdf || pdfLines.length === 0 || isDownloadingPdf}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-white/5"
            >
              <Download className="h-3.5 w-3.5" />
              {isDownloadingPdf ? "Generating PDF…" : "Download PDF"}
            </button>
            {onApprove && !approval.is_admin_approved && (
              <button
                type="button"
                onClick={onApprove}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 cursor-pointer"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Approve Order
              </button>
            )}
            {canFinanceApprove && onAmend ? (
              <button
                type="button"
                onClick={() => onAmend(approvalId)}
                disabled={isAmendingThis}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {isAmendingThis ? "Opening…" : "Approve"}
              </button>
            ) : null}
            {canFinanceAmend && onAmend ? (
              <button
                type="button"
                onClick={() => onAmend(approvalId)}
                disabled={isAmendingThis}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-300"
              >
                <Pencil className="h-3.5 w-3.5" />
                {isAmendingThis ? "Opening…" : "Amend"}
              </button>
            ) : null}
            {canAccountApprove && onAmend ? (
              <button
                type="button"
                onClick={() => onAmend(approvalId)}
                disabled={isAmendingThis}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {isAmendingThis ? "Opening…" : "Approve"}
              </button>
            ) : null}
            {canAccountAmend && onAmend ? (
              <button
                type="button"
                onClick={() => onAmend(approvalId)}
                disabled={isAmendingThis}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-300"
              >
                <Pencil className="h-3.5 w-3.5" />
                {isAmendingThis ? "Opening…" : "Amend"}
              </button>
            ) : null}
            {canAmend && onAmend ? (
              <button
                type="button"
                onClick={() => onAmend(approvalId)}
                disabled={isAmendingThis}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-300"
              >
                <Pencil className="h-3.5 w-3.5" />
                {isAmendingThis ? "Opening…" : "Amend"}
              </button>
            ) : null}
            {canSendToFinance && onSendToFinance ? (
              <button
                type="button"
                onClick={() => onSendToFinance(approvalId)}
                disabled={isSendingThis}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                <Send className="h-3.5 w-3.5" />
                {isSendingThis ? "Sending…" : "Send to Finance"}
              </button>
            ) : null}
            {canSendToAccount && onSendToAccount ? (
              <button
                type="button"
                onClick={() => onSendToAccount(approvalId)}
                disabled={isSendingThis}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
              >
                <Send className="h-3.5 w-3.5" />
                {isSendingThis ? "Sending…" : "Send to Account"}
              </button>
            ) : null}
            {!isFinancePortal && approvalStatus === "sent_to_finance" ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300">
                <Send className="h-3.5 w-3.5" />
                Sent to Finance
              </span>
            ) : null}
            {isFinancePortal && Boolean(approval.assigned_account_user) ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 dark:bg-teal-950/30 dark:text-teal-300">
                <Send className="h-3.5 w-3.5" />
                Sent to Account
              </span>
            ) : null}
            {isAccountPortal && Boolean(approval.is_account_approved) ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Account Cleared
              </span>
            ) : null}
          </div>
          {approvalStatus === "sent_to_finance" && financeAssigneeLabel !== "—" ? (
            <p className="mt-2 w-full text-right text-[11px] text-slate-500 dark:text-slate-400">
              Assigned to{" "}
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {financeAssigneeLabel}
              </span>
              {sentToFinanceAtLabel !== "—" ? (
                <>
                  {" "}
                  · <span className="tabular-nums">{sentToFinanceAtLabel}</span>
                </>
              ) : null}
            </p>
          ) : null}
          {isFinancePortal && accountAssigneeLabel !== "—" ? (
            <p className="mt-2 w-full text-right text-[11px] text-slate-500 dark:text-slate-400">
              Account assignee{" "}
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {accountAssigneeLabel}
              </span>
            </p>
          ) : null}
          {isAccountPortal && accountAssigneeLabel !== "—" ? (
            <p className="mt-2 w-full text-right text-[11px] text-slate-500 dark:text-slate-400">
              Assigned to{" "}
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {accountAssigneeLabel}
              </span>
              {sentToAccountAtLabel !== "—" ? (
                <>
                  {" "}
                  · <span className="tabular-nums">{sentToAccountAtLabel}</span>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      )}

      <div className="mt-4 border-t border-slate-200/90 pt-4 dark:border-white/10">
        <div className="mb-3">
          <h4 className="font-sans text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Financial Breakdown
          </h4>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Totals for this approval revision.
          </p>
        </div>
        <div className="grid gap-3 font-sans text-sm sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-slate-950/40">
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              Approved Total
            </span>
            <span className="mt-1 block font-mono text-base font-semibold text-emerald-700 dark:text-emerald-300">
              {approvedTotal.toFixed(2)}
            </span>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-slate-950/40">
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              Batch Ordered
            </span>
            <span className="mt-1 block font-mono text-base font-semibold text-slate-900 dark:text-slate-50">
              {orderedTotal.toFixed(2)}
            </span>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-slate-950/40">
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              Rates Reviewed
            </span>
            <span className="mt-1 block text-base font-semibold text-slate-900 dark:text-slate-50">
              {approval.rates_reviewed ? "Yes" : "No"}
            </span>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-slate-950/40">
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              All Rates Mapped
            </span>
            <span className="mt-1 block text-base font-semibold text-slate-900 dark:text-slate-50">
              {approval.all_rates_mapped ? "Yes" : "No"}
            </span>
          </div>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="mt-4 border-t border-slate-200/90 pt-4 dark:border-white/10">
          <h4 className="mb-2 font-sans text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Approved Items
          </h4>
          <div className="overflow-x-auto rounded-lg border border-slate-200/90 dark:border-white/10">
            <table className="w-full min-w-[960px] text-left font-sans text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950">
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
              <tbody className="divide-y divide-slate-200/80 dark:divide-white/10">
                {items.map((it) => {
                  const rateType = String(it.applied_rate_type ?? "MANUAL");
                  const rateMapped = Boolean(it.rate_mapped);
                  const qty = Number(it.approved_quantity ?? 0);
                  const unitPrice = Number(it.approved_unit_price ?? it.ordered_unit_price ?? 0);
                  const freeQty = Number(it.free_quantity ?? 0);
                  const discountPercent = Number(it.discount_percent ?? 0);
                  const discountAmount = Number(it.discount_amount ?? 0);
                  const gstPercent = Number(it.gst_percent ?? 0);

                  const gross = qty * unitPrice;
                  const lineDiscount = discountPercent > 0 ? (gross * discountPercent) / 100 : discountAmount;
                  const lineTaxable = Math.max(0, gross - lineDiscount);
                  const lineGst = (lineTaxable * gstPercent) / 100;
                  const lineTotal = Number(it.approved_total_amount ?? (lineTaxable + lineGst));

                  return (
                    <tr
                      key={String(it._id ?? it.order_item_id)}
                      className="bg-white dark:bg-slate-900"
                    >
                      <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-200">
                        {String(
                          (it.product as Record<string, unknown> | undefined)
                            ?.product_name ?? "—",
                        )}
                      </td>
                      <td className="px-3 py-2 font-sans">
                        <div className="flex flex-col">
                          <span className="font-semibold">{rateType}</span>
                          {rateMapped ? (
                            <span className="text-[9px] text-emerald-600 font-semibold dark:text-emerald-400 leading-none">
                              Negotiated
                            </span>
                          ) : (
                            <span className="text-[9px] text-slate-400 font-medium dark:text-slate-500 leading-none">
                              Manual
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                        {Number(it.ordered_quantity ?? 0)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                        <div className="flex flex-col">
                          <span className="font-semibold">{qty}</span>
                          {freeQty > 0 ? (
                            <span className="text-[9px] text-indigo-600 dark:text-indigo-400 leading-none">
                              +{freeQty} free
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                        {unitPrice.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                        <div className="flex flex-col">
                          <span>{discountPercent > 0 ? `${discountPercent}%` : "—"}</span>
                          {lineDiscount > 0 ? (
                            <span className="text-[9px] text-slate-500 leading-none">
                              (-{lineDiscount.toFixed(2)})
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                        <div className="flex flex-col">
                          <span>{gstPercent > 0 ? `${gstPercent}%` : "0%"}</span>
                          {lineGst > 0 ? (
                            <span className="text-[9px] text-slate-500 leading-none">
                              (+{lineGst.toFixed(2)})
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-900 dark:text-slate-100 bg-slate-50/20 dark:bg-slate-950/20">
                        {lineTotal.toFixed(2)}
                      </td>
                      <td
                        className="max-w-[150px] truncate px-3 py-2 italic text-slate-500"
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
        <p className="mt-3 rounded-lg border border-slate-100 bg-slate-50/80 p-2.5 font-sans text-xs text-slate-600 dark:border-white/5 dark:bg-slate-950/30 dark:text-slate-300">
          <span className="mr-1.5 font-semibold text-slate-500">
            Approval notes:
          </span>
          {String(approval.approval_notes)}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 font-sans text-[10px] text-slate-400 dark:border-white/5">
        <span>Reviewed {formatDate(approval.reviewed_at || approval.createdAt)}</span>
        {approval.sent_to_finance_at ? (
          <span>Sent to finance {formatDate(approval.sent_to_finance_at)}</span>
        ) : null}
      </div>
    </div>
  );
}

export default ApprovalRecordCard;
