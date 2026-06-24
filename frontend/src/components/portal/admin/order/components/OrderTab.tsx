import React, { useCallback, useMemo, useRef, useState } from "react";
import { CheckCircle2, Download, Send } from "lucide-react";
import { DashboardCard } from "@/components/widgets";
import { resolveUserDisplay } from "@/components/portal/shared/userDisplay";
import {
  companyLetterheadLogoUrl,
  companyLetterheadName,
  resolvePublicAssetUrl,
} from "@/lib/env";
import { toast } from "@/lib/toast";
import {
  OrderItemsPdfTemplate,
  type OrderItemsPdfLine,
} from "../../../shared/OrderItemsPdfTemplate";
import { downloadOrderItemsPdf } from "../../../shared/downloadOrderItemsPdf";
import {
  MapOrderLinePriceModal,
  type MapOrderLinePriceSuccess,
  type MapOrderLinePriceTarget,
} from "@/components/portal/shared/MapOrderLinePriceModal";
import {
  LineRateStatusBadge,
  rateLookupKey,
  resolveRateDisplayStatus,
} from "@/components/portal/shared/orderLineRateDisplay";
import {
  adminApprovalActionLabel,
  adminAmendmentNotes,
  canOpenAdminApprovalModal,
  isAdminAmended,
  isAdminApprovalContinuation,
  pickLatestAdminSalesApproval,
} from "@/components/portal/shared/orderAdminApprovalDisplay";
import { lineApprovalQuantities } from "@/components/portal/shared/orderLineQuantities";
import {
  useCheckOrderRatesQuery,
  useGetOrderHistoryQuery,
  useListOrderApprovalsQuery,
  useListUsersQuery,
  usePatchOrderMutation,
} from "@/store/api";
import type { CheckOrderRatesItem } from "@/store/api/slices/partyOrderProductsRateApi";
import { mutationRejectedMessage } from "@/lib/mutationMessages";

function pickList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.data)) return o.data;
  }
  return [];
}

function pdfMoney(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function formatStatusLabel(status: string): string {
  return status
    ? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "—";
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

function formatDate(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isAdminItemsApprovedStatus(status: string): boolean {
  return [
    "sales_approved",
    "finance_review",
    "finance_approved",
    "partially_finance_approved",
    "fully_finance_approved",
    "finance_rejected",
    "dispatch_pending",
    "partial_dispatch_created",
    "full_dispatch_created",
    "transport_pending",
    "transport_assigned",
    "partially_transported",
    "fully_transported",
    "in_transit",
    "delivered",
  ].includes(status);
}

function isFinanceReviewSentStatus(status: string): boolean {
  return [
    "finance_review",
    "finance_approved",
    "partially_finance_approved",
    "fully_finance_approved",
    "finance_rejected",
    "dispatch_pending",
    "partial_dispatch_created",
    "full_dispatch_created",
    "transport_pending",
    "transport_assigned",
    "partially_transported",
    "fully_transported",
    "in_transit",
    "delivered",
  ].includes(status);
}

function idFromRef(ref: unknown): string {
  if (typeof ref === "string") return ref.trim();
  if (ref && typeof ref === "object" && "_id" in ref) {
    return String((ref as { _id: unknown })._id ?? "").trim();
  }
  if (ref && typeof ref === "object" && "id" in ref) {
    return String((ref as { id: unknown }).id ?? "").trim();
  }
  return "";
}

interface OrderTabProps {
  detail: Record<string, unknown> | null;
  status: string;
  formatMoney: (v: unknown) => string;
  readOnlyItems: unknown[];
  refetchOrder?: () => void;
  partyLabel?: string;
  /** Show download PDF control (admin approvals tab). */
  showPdfDownload?: boolean;
  /** Show sales-approved / sent-to-finance badges. */
  showApprovalBadges?: boolean;
  /** Show Approve Items action at bottom of items section. */
  showApproveAction?: boolean;
  /** Opens partial admin approval modal (required when showApproveAction). */
  onApproveItems?: () => void;
  /** Show approved / remaining quantity columns for partial approval progress. */
  showApprovalProgress?: boolean;
  /** Show Send to Finance action at bottom of items section. */
  showSendToFinanceAction?: boolean;
  canSendToFinance?: boolean;
  onSendToFinance?: () => void;
  sendToFinanceBusy?: boolean;
}

export function OrderTab({
  detail,
  status,
  formatMoney,
  readOnlyItems,
  refetchOrder,
  partyLabel = "—",
  showPdfDownload = false,
  showApprovalBadges = false,
  showApproveAction = false,
  onApproveItems,
  showApprovalProgress = false,
  showSendToFinanceAction = false,
  canSendToFinance = false,
  onSendToFinance,
  sendToFinanceBusy = false,
}: OrderTabProps) {
  const orderId = String(detail?._id ?? detail?.id ?? "");
  const partyId = idFromRef(detail?.party);

  const rateCheckQ = useCheckOrderRatesQuery(orderId, { skip: !orderId });
  const historyQ = useGetOrderHistoryQuery(orderId, { skip: !orderId });
  const adminApprovalsQ = useListOrderApprovalsQuery(
    { order: orderId },
    { skip: !orderId },
  );
  const usersQ = useListUsersQuery({});
  const [patchOrder, { isLoading: isPatching }] = usePatchOrderMutation();
  const [mapTarget, setMapTarget] = useState<MapOrderLinePriceTarget | null>(
    null,
  );
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [inlineCancelItem, setInlineCancelItem] = useState<{
    order_item_id: string;
    product_name: string;
  } | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const pdfTemplateRef = useRef<HTMLDivElement>(null);

  const canMapPrice =
    (status === "submitted" || status === "on_hold") && Boolean(partyId);
  const canApprove = canOpenAdminApprovalModal(
    status,
    readOnlyItems as Record<string, unknown>[],
  );
  const approveActionLabel = adminApprovalActionLabel(
    status,
    readOnlyItems as Record<string, unknown>[],
  );

  const linesForNegotiationCheck = useMemo(() => {
    if (isAdminApprovalContinuation(readOnlyItems as Record<string, unknown>[])) {
      return readOnlyItems.filter((lineRaw) => {
        const line = lineRaw as Record<string, unknown>;
        return lineApprovalQuantities(line).pendingAdmin > 0;
      });
    }
    return readOnlyItems;
  }, [readOnlyItems]);

  const rateItemByLine = useMemo(() => {
    const map = new Map<string, CheckOrderRatesItem>();
    for (const item of rateCheckQ.data?.items ?? []) {
      map.set(rateLookupKey(item.product, item.applied_rate_type), item);
    }
    return map;
  }, [rateCheckQ.data]);

  const allItemsNegotiated = useMemo(() => {
    if (linesForNegotiationCheck.length === 0) return true;
    return linesForNegotiationCheck.every((lineRaw) => {
      const line = lineRaw as Record<string, unknown>;
      const productId = idFromRef(line.product);
      const rateType = String(line.applied_rate_type ?? "MANUAL");
      const rateItem = rateItemByLine.get(rateLookupKey(productId, rateType));
      return resolveRateDisplayStatus(rateItem) === "negotiated";
    });
  }, [linesForNegotiationCheck, rateItemByLine]);

  const openMapModal = useCallback(
    (line: Record<string, unknown>) => {
      if (!canMapPrice) return;
      const productId = idFromRef(line.product);
      if (!productId) {
        toast.error("This line has no product reference.");
        return;
      }
      const appliedRateType = String(line.applied_rate_type ?? "SR");
      const rateItem = rateItemByLine.get(
        rateLookupKey(productId, appliedRateType),
      );
      setMapTarget({
        productId,
        productName: String(line.product_name ?? "Product"),
        sku: typeof line.sku === "string" ? line.sku : undefined,
        appliedRateType,
        unitPrice: Number(line.unit_price ?? 0),
        mappingId: rateItem?.mappingId ?? null,
        isMapped: Boolean(rateItem?.isMapped),
        hasRate: Boolean(rateItem?.hasRate),
      });
      setMapModalOpen(true);
    },
    [canMapPrice, rateItemByLine],
  );

  const closeMapModal = useCallback(() => {
    setMapModalOpen(false);
    setMapTarget(null);
  }, []);

  const handleMapPriceSuccess = useCallback(
    async (result: MapOrderLinePriceSuccess) => {
      if (!orderId || !detail || !Array.isArray(detail.order_items)) return;

      const orderItems = (detail.order_items as Record<string, unknown>[]).map(
        (item) => {
          const pid = idFromRef(item.product);
          const rt = String(item.applied_rate_type ?? "MANUAL");
          if (
            pid === result.productId &&
            rt === result.appliedRateType
          ) {
            return { ...item, unit_price: result.negotiatedRate };
          }
          return item;
        },
      );

      try {
        await patchOrder({
          id: orderId,
          patch: { order_items: orderItems },
        }).unwrap();
        toast.success("Line price updated to negotiated rate.");
        if (!rateCheckQ.isUninitialized) {
          void rateCheckQ.refetch();
        }
        refetchOrder?.();
      } catch (rejected) {
        toast.error(mutationRejectedMessage(rejected));
      }
    },
    [detail, orderId, patchOrder, rateCheckQ, refetchOrder],
  );

  const handleInlineCancelSubmit = useCallback(async () => {
    if (!inlineCancelItem || !detail || !Array.isArray(detail.order_items)) return;
    try {
      const updatedItems = detail.order_items.filter(
        (item: any) => String(item._id ?? item.id) !== inlineCancelItem.order_item_id
      );

      await patchOrder({
        id: orderId,
        patch: { order_items: updatedItems },
      }).unwrap();

      toast.success(`${inlineCancelItem.product_name} removed from order.`);
      setInlineCancelItem(null);
      refetchOrder?.();
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [detail, inlineCancelItem, orderId, patchOrder, refetchOrder]);

  const financialBreakdown = useMemo(
    () => ({
      grandTotal: detail?.grand_total,
      subtotal: detail?.subtotal,
      gst: detail?.gst_amount,
      discount: detail?.discount_amount,
    }),
    [detail],
  );

  const userNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of pickList(usersQ.data)) {
      const row = u as Record<string, unknown>;
      const id = String(row._id ?? row.id ?? "");
      if (id) map[id] = String(row.username || row.name || id);
    }
    return map;
  }, [usersQ.data]);

  const latestAdminApprovalRecord = useMemo(
    () => pickLatestAdminSalesApproval(pickList(adminApprovalsQ.data)),
    [adminApprovalsQ.data],
  );

  const adminApproval = useMemo(() => {
    if (latestAdminApprovalRecord?.approved_at || latestAdminApprovalRecord?.approved_by) {
      return {
        changed_by: latestAdminApprovalRecord.approved_by,
        createdAt: latestAdminApprovalRecord.approved_at,
      };
    }
    const history = pickList(historyQ.data) as Record<string, unknown>[];
    const matches = history.filter(
      (entry) => String(entry.to_status) === "sales_approved",
    );
    if (matches.length > 0) return matches[matches.length - 1];
    if (detail?.approved_at || detail?.approved_by) {
      return {
        changed_by: detail.approved_by,
        createdAt: detail.approved_at,
      };
    }
    return null;
  }, [historyQ.data, detail, latestAdminApprovalRecord]);

  const financeReviewSent = useMemo(() => {
    if (
      latestAdminApprovalRecord &&
      String(latestAdminApprovalRecord.approval_status) === "sent_to_finance"
    ) {
      return {
        changed_by: latestAdminApprovalRecord.sent_to_finance_by,
        createdAt: latestAdminApprovalRecord.sent_to_finance_at,
      };
    }
    const history = pickList(historyQ.data) as Record<string, unknown>[];
    const matches = history.filter(
      (entry) => String(entry.to_status) === "finance_review",
    );
    if (matches.length > 0) return matches[matches.length - 1];
    return null;
  }, [historyQ.data, latestAdminApprovalRecord]);

  const showApprovedMark =
    Boolean(adminApproval) || isAdminItemsApprovedStatus(status);
  const approvedByLabel = adminApproval
    ? resolveUserDisplay(adminApproval.changed_by, userNameById)
    : "—";
  const approvedAtLabel = adminApproval
    ? formatDate(adminApproval.createdAt)
    : "—";

  const showFinanceSentMark =
    Boolean(financeReviewSent) || isFinanceReviewSentStatus(status);
  const financeAssigneeLabel = resolveUserDisplay(
    detail?.assigned_finance_user,
    userNameById,
  );
  const financeSentAtLabel = financeReviewSent
    ? formatDate(financeReviewSent.createdAt)
    : "—";
  const financeSentByLabel = financeReviewSent
    ? resolveUserDisplay(financeReviewSent.changed_by, userNameById)
    : "—";

  const latestFinanceAmended = Boolean(latestAdminApprovalRecord?.finance_amended);
  const latestFinanceAmendedByLabel = latestAdminApprovalRecord
    ? resolveUserDisplay(latestAdminApprovalRecord.finance_amended_by, userNameById)
    : "—";
  const latestFinanceAmendedAtLabel = latestAdminApprovalRecord
    ? formatDate(latestAdminApprovalRecord.finance_amended_at)
    : "—";

  const latestAdminAmended = latestAdminApprovalRecord ? isAdminAmended(latestAdminApprovalRecord) : false;
  const latestAdminAmendedByLabel = latestAdminApprovalRecord
    ? resolveUserDisplay(latestAdminApprovalRecord.admin_amended_by, userNameById)
    : "—";
  const latestAdminAmendedAtLabel = latestAdminApprovalRecord
    ? formatDate(latestAdminApprovalRecord.admin_amended_at)
    : "—";
  const latestAdminAmendNotes = latestAdminApprovalRecord
    ? adminAmendmentNotes(latestAdminApprovalRecord)
    : undefined;

  const pdfLines = useMemo((): OrderItemsPdfLine[] => {
    return readOnlyItems.map((lineRaw) => {
      const line = lineRaw as Record<string, unknown>;
      const productId = idFromRef(line.product);
      const rateType = String(line.applied_rate_type ?? "MANUAL");
      const rateItem = rateItemByLine.get(rateLookupKey(productId, rateType));
      const latestNegotiated =
        rateItem?.hasRate &&
        rateItem.currentMappedRate != null &&
        Number.isFinite(Number(rateItem.currentMappedRate))
          ? Number(rateItem.currentMappedRate)
          : null;
      const displayPrice = latestNegotiated ?? line.unit_price;
      const disc =
        Number(line.discount_percent ?? 0) > 0
          ? `${String(line.discount_percent)}%`
          : pdfMoney(line.discount_amount);

      return {
        productName:
          typeof line.product_name === "string" ? line.product_name : "—",
        sku: typeof line.sku === "string" ? line.sku : undefined,
        quantity: String(line.ordered_quantity ?? line.quantity ?? "—"),
        freeQty: String(line.free_quantity ?? line.free_qty ?? "0"),
        rateType,
        unitPrice: pdfMoney(displayPrice),
        discount: disc,
        gst: pdfMoney(line.gst_amount),
        lineTotal: pdfMoney(line.total_amount),
      };
    });
  }, [readOnlyItems, rateItemByLine]);

  const canDownloadPdf = showPdfDownload && showApprovedMark;

  const salesApprovalPdf = useMemo(
    () => ({
      statusLabel: "Sales Approved",
      approvedBy: approvedByLabel,
      approvedAt: approvedAtLabel,
    }),
    [approvedByLabel, approvedAtLabel],
  );

  const handleDownloadPdf = useCallback(async () => {
    if (!canDownloadPdf || !pdfTemplateRef.current || readOnlyItems.length === 0) {
      return;
    }
    setIsDownloadingPdf(true);
    try {
      const orderNo = String(detail?.order_no ?? orderId ?? "order");
      await downloadOrderItemsPdf(
        pdfTemplateRef.current,
        `${orderNo.replace(/\s+/g, "-")}-items.pdf`,
        { salesApproved: canDownloadPdf },
      );
      toast.success("Order items PDF downloaded.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not generate PDF.";
      toast.error(message);
    } finally {
      setIsDownloadingPdf(false);
    }
  }, [
    canDownloadPdf,
    detail?.order_no,
    orderId,
    readOnlyItems.length,
    salesApprovalPdf,
  ]);

  if (!detail) return null;

  const hasItems = readOnlyItems.length > 0;
  const busy = isPatching || sendToFinanceBusy;
  const showItemActions =
    (showApproveAction && canApprove) ||
    (showSendToFinanceAction && canSendToFinance);

  const companyName = companyLetterheadName();
  const logoUrl = resolvePublicAssetUrl(companyLetterheadLogoUrl());

  return (
    <div className="space-y-6">
      <div
        aria-hidden
        className="pointer-events-none fixed -left-[9999px] top-0 overflow-hidden"
      >
        {canDownloadPdf ? (
          <div ref={pdfTemplateRef}>
            <OrderItemsPdfTemplate
              companyName={companyName}
              logoUrl={logoUrl}
              orderNo={String(detail.order_no ?? orderId)}
              partyName={partyLabel}
              orderDate={formatDateShort(detail.order_date)}
              expectedDeliveryDate={
                detail.expected_delivery_date
                  ? formatDateShort(detail.expected_delivery_date)
                  : undefined
              }
              statusLabel={formatStatusLabel(status)}
              salesApproval={salesApprovalPdf}
              financeAmendment={
                latestFinanceAmended
                  ? {
                      amendedBy: latestFinanceAmendedByLabel,
                      amendedAt: latestFinanceAmendedAtLabel,
                      amendmentNotes: latestAdminApprovalRecord?.approval_notes
                        ? String(latestAdminApprovalRecord.approval_notes)
                        : undefined,
                    }
                  : undefined
              }
              adminAmendment={
                latestAdminAmended
                  ? {
                      amendedBy: latestAdminAmendedByLabel,
                      amendedAt: latestAdminAmendedAtLabel,
                      amendmentNotes: latestAdminAmendNotes,
                    }
                  : undefined
              }
              items={pdfLines}
              subtotal={pdfMoney(financialBreakdown.subtotal)}
              gst={pdfMoney(financialBreakdown.gst)}
              headerDiscount={pdfMoney(financialBreakdown.discount)}
              grandTotal={pdfMoney(financialBreakdown.grandTotal)}
              generatedAt={formatDate(new Date())}
            />
          </div>
        ) : null}
      </div>

      <DashboardCard
        title="Order Items"
        description="Catalog lines, negotiated pricing status, map rates, and financial totals."
      >
        <div className="space-y-5 text-sm">
          {showPdfDownload ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {!canDownloadPdf ? (
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  PDF available after sales approval
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => void handleDownloadPdf()}
                disabled={!canDownloadPdf || !hasItems || isDownloadingPdf || busy}
                title={
                  !canDownloadPdf
                    ? "Approve order items before downloading PDF"
                    : undefined
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-white/5"
              >
                <Download className="h-3.5 w-3.5" />
                {isDownloadingPdf ? "Generating PDF…" : "Download PDF"}
              </button>
            </div>
          ) : null}

          <div>
            <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Line items
              </h3>
              {showApprovalBadges && (showApprovedMark || showFinanceSentMark) ? (
                <div className="ml-auto flex flex-col items-end gap-2 text-right">
                  {showApprovedMark ? (
                    <div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-600/15 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-500/20">
                        <CheckCircle2
                          className="h-3.5 w-3.5 shrink-0"
                          aria-hidden
                        />
                        Approved
                      </span>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        Approved by{" "}
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          {approvedByLabel}
                        </span>
                        {approvedAtLabel !== "—" ? (
                          <>
                            {" "}
                            ·{" "}
                            <span className="tabular-nums">{approvedAtLabel}</span>
                          </>
                        ) : null}
                      </p>
                    </div>
                  ) : null}
                  {showFinanceSentMark ? (
                    <div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-600/15 dark:bg-indigo-950/30 dark:text-indigo-300 dark:ring-indigo-500/20">
                        <Send className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Sent for Finance Review
                      </span>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        Sent to{" "}
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          {financeAssigneeLabel}
                        </span>
                        {financeSentAtLabel !== "—" ? (
                          <>
                            {" "}
                            ·{" "}
                            <span className="tabular-nums">
                              {financeSentAtLabel}
                            </span>
                          </>
                        ) : null}
                      </p>
                      {financeSentByLabel !== "—" ? (
                        <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                          by {financeSentByLabel}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {!hasItems ? (
              <p className="text-slate-500 dark:text-slate-400">No lines.</p>
            ) : (
              <div className="overflow-x-auto rounded-md ring-1 ring-slate-200/90 dark:ring-white/10">
                <table className="w-full min-w-[1020px] text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950">
                    <tr>
                      <th className="px-3 py-2 font-medium">Product</th>
                      <th className="px-3 py-2 font-medium">Qty</th>
                      {showApprovalProgress ? (
                        <>
                          <th className="px-3 py-2 font-medium">Approved</th>
                          <th className="px-3 py-2 font-medium">Remaining</th>
                        </>
                      ) : null}
                      <th className="px-3 py-2 font-medium">Free</th>
                      <th className="px-3 py-2 font-medium">Rate type</th>
                      <th className="px-3 py-2 font-medium">Rate status</th>
                      <th className="px-3 py-2 font-medium text-right">
                        Price
                      </th>
                      <th className="px-3 py-2 font-medium text-right">
                        Disc
                      </th>
                      <th className="px-3 py-2 font-medium text-right">
                        GST
                      </th>
                      <th className="px-3 py-2 font-medium text-right">
                        Line total
                      </th>
                      <th className="px-3 py-2 font-medium text-center w-36">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 dark:divide-white/10">
                    {readOnlyItems.map((lineRaw, idx) => {
                      const line = lineRaw as Record<string, unknown>;
                      const name =
                        typeof line.product_name === "string"
                          ? line.product_name
                          : "—";
                      const qty = line.ordered_quantity ?? line.quantity;
                      const lineQty = lineApprovalQuantities(line);
                      const orderedQty = lineQty.ordered;
                      const approvedQty = lineQty.salesApproved;
                      const financeApprovedQty = lineQty.financeApproved;
                      const remainingQty = lineQty.pendingAdmin;
                      const price = line.unit_price;
                      const lt = line.total_amount;
                      const productId = idFromRef(line.product);
                      const rateType = String(
                        line.applied_rate_type ?? "MANUAL",
                      );
                      const rateItem = rateItemByLine.get(
                        rateLookupKey(productId, rateType),
                      );
                      const displayStatus = resolveRateDisplayStatus(rateItem);
                      const latestNegotiated =
                        rateItem?.hasRate &&
                        rateItem.currentMappedRate != null &&
                        Number.isFinite(Number(rateItem.currentMappedRate))
                          ? Number(rateItem.currentMappedRate)
                          : null;
                      const displayPrice =
                        latestNegotiated ?? price;
                      const key =
                        line._id != null ? String(line._id) : `line-${idx}`;

                      return (
                        <tr
                          key={key}
                          className="bg-white dark:bg-slate-900"
                        >
                          <td className="max-w-[200px] px-3 py-2">
                            <span className="line-clamp-2 font-medium">
                              {name}
                            </span>
                            {typeof line.sku === "string" && line.sku ? (
                              <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">
                                SKU {line.sku}
                              </span>
                            ) : null}
                            {typeof line.remarks === "string" &&
                            line.remarks.trim() ? (
                              <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">
                                {line.remarks}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {String(qty ?? "—")}
                          </td>
                          {showApprovalProgress ? (
                            <>
                              <td className="px-3 py-2 tabular-nums text-emerald-700 dark:text-emerald-300">
                                {approvedQty > 0 ? String(approvedQty) : "—"}
                              </td>
                              <td
                                className={`px-3 py-2 tabular-nums ${
                                  remainingQty > 0
                                    ? "font-semibold text-amber-700 dark:text-amber-300"
                                    : "text-slate-500 dark:text-slate-400"
                                }`}
                                title={
                                  financeApprovedQty > 0
                                    ? `${financeApprovedQty} finance approved`
                                    : undefined
                                }
                              >
                                {remainingQty > 0 ? String(remainingQty) : "—"}
                              </td>
                            </>
                          ) : null}
                          <td className="px-3 py-2 tabular-nums">
                            {String(
                              line.free_quantity ?? line.free_qty ?? "0",
                            )}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {rateType}
                          </td>
                          <td className="px-3 py-2">
                            <LineRateStatusBadge
                              status={displayStatus}
                              rateItem={rateItem}
                              formatMoney={formatMoney}
                            />
                          </td>
                          <td
                            className="px-3 py-2 text-right tabular-nums"
                            title={
                              latestNegotiated != null &&
                              Number(price) !== latestNegotiated
                                ? `Order line: ${formatMoney(price)} · Latest negotiated: ${formatMoney(latestNegotiated)}`
                                : undefined
                            }
                          >
                            {formatMoney(displayPrice)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {Number(line.discount_percent ?? 0) > 0
                              ? `${String(line.discount_percent)}%`
                              : formatMoney(line.discount_amount)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatMoney(line.gst_amount)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-mono">
                            {formatMoney(lt)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {canMapPrice && productId && (
                                <button
                                  type="button"
                                  onClick={() => openMapModal(line)}
                                  disabled={busy}
                                  className="inline-flex items-center justify-center rounded bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm hover:bg-blue-700 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed dark:bg-blue-500 dark:hover:bg-blue-400 cursor-pointer transition-colors"
                                >
                                  Map
                                </button>
                              )}
                              {status === "submitted" && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setInlineCancelItem({
                                      order_item_id: String(
                                        line._id ?? line.id ?? key
                                      ),
                                      product_name: name,
                                    })
                                  }
                                  disabled={busy}
                                  className="inline-flex items-center justify-center rounded bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600 shadow-sm hover:bg-rose-100 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed dark:bg-rose-950/30 dark:text-rose-455 dark:hover:bg-rose-900/50 cursor-pointer transition-colors font-sans"
                                >
                                  Cancel
                                </button>
                              )}
                              {!canMapPrice && status !== "submitted" && (
                                <span
                                  className="text-[10px] text-slate-400 dark:text-slate-500"
                                  title={
                                    status !== "submitted"
                                      ? "Mapping is locked after admin approval"
                                      : "Link a party to map prices"
                                  }
                                >
                                  —
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {status === "submitted" && !partyId ? (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                No party linked — map price requires a party on the order.
              </p>
            ) : null}

            {showItemActions ? (
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200/90 pt-4 dark:border-white/10">
                {canApprove && !allItemsNegotiated ? (
                  <span className="mr-auto text-[11px] font-medium text-rose-600 dark:text-rose-400">
                    {isAdminApprovalContinuation(
                      readOnlyItems as Record<string, unknown>[],
                    )
                      ? "Remaining items must be negotiated to continue approval"
                      : "All items must be negotiated to approve"}
                  </span>
                ) : null}
                {showApproveAction && canApprove && onApproveItems ? (
                  <button
                    type="button"
                    onClick={onApproveItems}
                    disabled={busy || !allItemsNegotiated}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                    title={
                      !allItemsNegotiated
                        ? isAdminApprovalContinuation(
                            readOnlyItems as Record<string, unknown>[],
                          )
                          ? "Remaining items must be negotiated before continuing approval"
                          : "All items must be negotiated before approving"
                        : undefined
                    }
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {approveActionLabel}
                  </button>
                ) : null}
                {showSendToFinanceAction && canSendToFinance ? (
                  <button
                    type="button"
                    onClick={() => onSendToFinance?.()}
                    disabled={busy}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                  >
                    {sendToFinanceBusy ? "Sending…" : "Send to Finance"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="border-t border-slate-200/90 pt-5 dark:border-white/10">
            <div className="mb-3">
              <h3 className="font-sans text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Financial Breakdown
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Aggregated totals and payment state.
              </p>
            </div>

            <div className="grid gap-3 text-sm font-normal font-sans sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-slate-950/40">
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  Grand Total
                </span>
                <span className="mt-1 block font-mono text-base font-semibold text-slate-900 dark:text-slate-50">
                  {formatMoney(financialBreakdown.grandTotal)}
                </span>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-slate-950/40">
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  Subtotal
                </span>
                <span className="mt-1 block font-mono text-base font-semibold text-slate-900 dark:text-slate-50">
                  {formatMoney(financialBreakdown.subtotal)}
                </span>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-slate-950/40">
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  GST
                </span>
                <span className="mt-1 block font-mono text-base font-semibold text-slate-900 dark:text-slate-50">
                  {formatMoney(financialBreakdown.gst)}
                </span>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-slate-950/40">
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  Header Discount
                </span>
                <span className="mt-1 block font-mono text-base font-semibold text-rose-700 dark:text-rose-300">
                  -{formatMoney(financialBreakdown.discount)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </DashboardCard>

      <MapOrderLinePriceModal
        open={mapModalOpen}
        onClose={closeMapModal}
        partyId={partyId}
        target={mapTarget}
        onSuccess={(result) => void handleMapPriceSuccess(result)}
      />

      {/* Inline Cancel Confirmation Modal */}
      {inlineCancelItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-xl border border-slate-200/90 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900 font-sans">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 font-sans">
              Confirm Remove Item from Order
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 font-sans">
              Are you sure you want to remove <strong>{inlineCancelItem.product_name}</strong> from this order? This will permanently delete this item from the order.
            </p>
            <div className="mt-6 flex justify-end gap-3 font-medium font-sans">
              <button
                type="button"
                onClick={() => setInlineCancelItem(null)}
                className="rounded-lg border border-slate-200/95 px-3 py-2 text-sm text-slate-800 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5 cursor-pointer font-sans"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={() => void handleInlineCancelSubmit()}
                disabled={isPatching}
                className="rounded-lg bg-rose-600 px-3 py-2 text-sm text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50 cursor-pointer font-sans"
              >
                {isPatching ? "Removing..." : "Yes, Remove Item"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
