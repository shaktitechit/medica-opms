"use client";

import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAppSelector } from "@/store";
import {
  useGetOrderQuery,
  useListFlagsQuery,
  useGetOrderHistoryQuery,
  useSubmitOrderMutation,
  useCreateOrderApprovalMutation,
  useLazyGetOrderApprovalsQuery,
  useListAttachmentsQuery,
  useListUsersQuery,
  useListPartiesQuery,
  useGetPartyQuery,
  useGetOrderFulfillmentQuery,
} from "@/store/api";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { contactsFromParty } from "@/lib/partyContacts";

import {
  buildPartyNameById,
  buildPartySraById,
  checkOrderPartySra,
  resolveOrderCounterparty,
} from "@/components/portal/sales/partyDisplay";
import { OrderDetailTabsNav } from "@/components/portal/shared/OrderDetailTabsNav";
import { ItemFulfillmentDetailsModal } from "@/components/portal/shared/ItemFulfillmentDetailsModal";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import {
  OrderFulfillmentPipelineStrip,
  buildOrderFulfillmentPipelineSteps,
  DEFAULT_ORDER_PIPELINE_ICONS,
} from "@/components/portal/shared/FulfillmentCircleStep";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import { computeDepartmentStageBoxes } from "@/components/portal/shared/orderDepartmentStages";
import { type OrderStatusDimension } from "@/components/portal/shared/orderStatusDimensions";
import OrderTab from "./components/OrderTab";
import EditOrderModal from "./components/EditOrderModal";
import FlagsTab from "./components/FlagsTab";
import AttachmentsTab from "./components/AttachmentsTab";
import DispatchesTab from "./components/DispatchesTab";
import TransportsTab from "./components/TransportsTab";
import ApprovalTab from "./components/ApprovalTab";
import SubmitOrderPreviewModal from "./components/SubmitOrderPreviewModal";

const btnSecondaryClass =
  "rounded-lg border border-slate-200/95 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5";

function pickList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.data)) return o.data;
  }
  return [];
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
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatStatusLabel(v: string): string {
  return v
    ? v
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
    : "—";
}

function statusBadgeClass(status: string): string {
  if (status === "cancelled" || status.includes("rejected")) {
    return "bg-rose-50 text-rose-700 ring-1 ring-rose-600/15 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-500/20";
  }
  if (status === "on_hold" || status === "submitted") {
    return "bg-amber-50 text-amber-700 ring-1 ring-amber-600/15 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-500/20";
  }
  if (status.includes("dispatch") || status.includes("transport")) {
    return "bg-blue-50 text-blue-700 ring-1 ring-blue-600/15 dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-500/20";
  }
  if (status === "delivered" || status.includes("approved")) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-500/20";
  }
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-600/10 dark:bg-slate-900 dark:text-slate-300 dark:ring-white/10";
}

function formatStructuredAddress(addr: unknown): string {
  if (!addr || typeof addr !== "object") return "—";
  const a = addr as Record<string, unknown>;
  const parts: string[] = [];
  if (a.address_line_1) parts.push(String(a.address_line_1).trim());
  if (a.address_line_2) parts.push(String(a.address_line_2).trim());
  const cityLine = [a.city, a.state, a.pincode]
    .map((x) => (x ? String(x).trim() : ""))
    .filter(Boolean)
    .join(", ");
  if (cityLine) parts.push(cityLine);
  if (a.country && String(a.country).trim() !== "India") {
    parts.push(String(a.country).trim());
  }
  return parts.length ? parts.join("\n") : "—";
}

function detailRefId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return String(o._id ?? o.id ?? "");
  }
  return "";
}


function displayText(value: unknown): string {
  if (value == null || value === "") return "—";
  return String(value);
}

function renderPriorityBadge(priority: string) {
  const p = String(priority || "normal").toLowerCase();
  if (p === "urgent") {
    return (
      <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-rose-700 ring-1 ring-inset ring-rose-600/10 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-500/20">
        Urgent
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-slate-500/10 dark:bg-slate-800/30 dark:text-slate-400 dark:ring-slate-700/10">
      Normal
    </span>
  );
}

export default function SalesOrderDetail({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { data, isLoading, isFetching, isError, refetch } = useGetOrderQuery(orderId);
  const user = useAppSelector((s) => s.auth.user);

  const [activeTab, setActiveTab] = useState<
    "flags" | "attachments" | "dispatches" | "transports" | "approvals"
  >("approvals");
  const [mobileTabOpen, setMobileTabOpen] = useState(false);

  const [isSubmitPreviewOpen, setIsSubmitPreviewOpen] = useState(false);
  const [isFulfillmentModalOpen, setIsFulfillmentModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isOrderItemsModalOpen, setIsOrderItemsModalOpen] = useState(false);
  const [isOrderDetailsModalOpen, setIsOrderDetailsModalOpen] = useState(false);
  const [isPartyDetailsModalOpen, setIsPartyDetailsModalOpen] = useState(false);
  const [submitRemarks, setSubmitRemarks] = useState("");
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [submitIssue, setSubmitIssue] = useState<{
    kind: "submit" | "approval";
    message: string;
  } | null>(null);
  const [lastSubmitBody, setLastSubmitBody] = useState<Record<
    string,
    unknown
  > | null>(null);

  const usersQ = useListUsersQuery({});
  const users = useMemo(() => pickList(usersQ.data), [usersQ.data]);

  const resolveUser = useCallback(
    (userVal: unknown): { name: string; phone: string } => {
      if (!userVal) return { name: "—", phone: "" };
      if (typeof userVal === "object" && userVal !== null) {
        const u = userVal as Record<string, unknown>;
        if (u.name || u.phone) {
          return {
            name: String(u.name || u.username || "—"),
            phone: String(u.phone || ""),
          };
        }
      }
      const userId = typeof userVal === "string" ? userVal : String((userVal as any)?._id ?? (userVal as any)?.id ?? "");
      if (!userId) return { name: "—", phone: "" };
      const found = users.find((u) => String((u as any)._id ?? (u as any).id ?? "") === userId);
      if (found) {
        return {
          name: String((found as any).name || (found as any).username || "—"),
          phone: String((found as any).phone || ""),
        };
      }
      return { name: "—", phone: "" };
    },
    [users]
  );
  const partiesQ = useListPartiesQuery({});
  const partyNameById = useMemo(
    () => buildPartyNameById(partiesQ.data),
    [partiesQ.data],
  );
  const partySraById = useMemo(
    () => buildPartySraById(partiesQ.data),
    [partiesQ.data],
  );

  const attachmentsQ = useListAttachmentsQuery({
    entity_type: "order",
    entity_id: orderId,
  });
  const attachmentsList = useMemo(() => pickList(attachmentsQ.data), [attachmentsQ.data]);
  const attachmentsCount = attachmentsList.length;

  const flagsQ = useListFlagsQuery({ order: orderId });
  const openFlagsCount = useMemo(() => {
    const arr = pickList(flagsQ.data);
    return arr.filter((f) => {
      if (!f || typeof f !== "object") return false;
      return (f as Record<string, unknown>).status === "open";
    }).length;
  }, [flagsQ.data]);

  const historyQ = useGetOrderHistoryQuery(orderId);
  const historyCount = useMemo(() => {
    const arr = pickList(historyQ.data);
    return arr.length;
  }, [historyQ.data]);

  const fulfillmentQ = useGetOrderFulfillmentQuery(orderId);

  const [submitOrder] = useSubmitOrderMutation();
  const [createOrderApproval] = useCreateOrderApprovalMutation();
  const [fetchOrderApprovals] = useLazyGetOrderApprovalsQuery();

  const detail =
    data && typeof data === "object"
      ? (data as Record<string, unknown>)
      : null;

  const status = deriveOrderWorkflowStatus(detail);
  const isDraft = status === "draft";

  const fulfillmentSnapshot = useMemo(
    () =>
      fulfillmentQ.data && typeof fulfillmentQ.data === "object"
        ? (fulfillmentQ.data as Record<string, unknown>)
        : null,
    [fulfillmentQ.data],
  );

  const deptBoxes = useMemo(() => {
    if (!detail) return [];
    return computeDepartmentStageBoxes(detail, fulfillmentSnapshot);
  }, [detail, fulfillmentSnapshot]);

  const currentPartyId = detail ? detailRefId(detail.party) : "";
  const partyDetailQ = useGetPartyQuery(currentPartyId, {
    skip: !currentPartyId,
  });

  const custLabel = useMemo(
    () =>
      detail ? resolveOrderCounterparty(detail, partyNameById) : "—",
    [detail, partyNameById],
  );

  const resolveUserId = useCallback((userVal: unknown): string => {
    if (!userVal) return "";
    if (typeof userVal === "string") return userVal;
    if (typeof userVal === "object" && userVal !== null) {
      const o = userVal as Record<string, unknown>;
      return String(o._id ?? o.id ?? "");
    }
    return "";
  }, []);



  const readOnlyItems = useMemo(() => {
    if (!detail || !Array.isArray(detail.order_items)) return [];
    return detail.order_items as Record<string, unknown>[];
  }, [detail]);

  const orderKpis = useMemo(() => {
    const fulfillment =
      fulfillmentQ.data && typeof fulfillmentQ.data === "object"
        ? (fulfillmentQ.data as Record<string, unknown>)
        : null;
    const totals =
      fulfillment?.totals && typeof fulfillment.totals === "object"
        ? (fulfillment.totals as Record<string, unknown>)
        : null;

    const totalLines = readOnlyItems.length;
    const totalQty = Number(totals?.ordered ?? readOnlyItems.reduce(
      (sum, line) => sum + Number(line.ordered_quantity ?? line.quantity ?? 0),
      0,
    ));
    const financeApprovedQty = Number(totals?.approved ?? readOnlyItems.reduce(
      (sum, line) => sum + Number(line.approved_quantity || 0),
      0,
    ));
    const dispatchedQty = Number(totals?.dispatched ?? readOnlyItems.reduce(
      (sum, line) => sum + Number(line.dispatched_quantity || 0),
      0,
    ));
    const pendingQty = Number(
      totals?.pendingDispatch ??
      readOnlyItems.reduce((sum, line) => {
        const approved = Number(line.approved_quantity || 0);
        const cap = approved > 0 ? approved : Number(line.ordered_quantity ?? line.quantity ?? 0);
        return sum + Math.max(0, cap - Number(line.dispatched_quantity || 0));
      }, 0),
    );

    return {
      totalLines,
      totalQty,
      dispatchedQty,
      pendingQty,
      financeApprovedQty,
      openFlags: openFlagsCount,
    };
  }, [fulfillmentQ.data, openFlagsCount, readOnlyItems]);

  const pipelineSteps = useMemo(
    () =>
      buildOrderFulfillmentPipelineSteps(deptBoxes, DEFAULT_ORDER_PIPELINE_ICONS, {
        defaultTotal: orderKpis.totalQty,
      }),
    [deptBoxes, orderKpis.totalQty],
  );

  const handleRefetch = useCallback(() => {
    refetch();
    if (!flagsQ.isUninitialized) flagsQ.refetch();
    if (!historyQ.isUninitialized) historyQ.refetch();
    if (!attachmentsQ.isUninitialized) attachmentsQ.refetch();
    if (!fulfillmentQ.isUninitialized) fulfillmentQ.refetch();
  }, [attachmentsQ, fulfillmentQ, flagsQ, historyQ, refetch]);



  const buildSubmitPayload = useCallback(() => {
    const orderItemsPayload = readOnlyItems.map((line) => {
      const item: Record<string, unknown> = {
        product: detailRefId(line.product),
        product_name: String(line.product_name ?? "—"),
        sku: typeof line.sku === "string" ? line.sku : "",
        ordered_quantity: Number(line.ordered_quantity ?? line.quantity ?? 0),
        free_quantity: Number(line.free_quantity ?? line.free_qty ?? 0),
        unit_price: Number(line.unit_price ?? 0),
        discount_percent: Number(line.discount_percent ?? 0),
        discount_amount: Number(line.discount_amount ?? 0),
        gst_percent: Number(line.gst_percent ?? 18),
        applied_rate_type:
          !line.applied_rate_type || line.applied_rate_type === "MANUAL"
            ? "SR"
            : String(line.applied_rate_type),
        remarks: typeof line.remarks === "string" ? line.remarks.trim() : "",
      };
      const id = line._id ?? line.id;
      if (id) item._id = String(id);
      return item;
    });

    const getLineTotal = (line: Record<string, unknown>) => {
      const qty = Number(line.ordered_quantity ?? line.quantity ?? 0);
      const unitPrice = Number(line.unit_price ?? 0);
      const gross = qty * unitPrice;
      let discount = Number(line.discount_amount ?? 0);
      const discPercent = Number(line.discount_percent ?? 0);
      if (discPercent > 0) discount = (gross * discPercent) / 100;
      const taxable = Math.max(0, gross - discount);
      const gst = (taxable * Number(line.gst_percent ?? 0)) / 100;
      return taxable + gst;
    };

    const approvedTotal = readOnlyItems.reduce(
      (sum, line) => sum + getLineTotal(line),
      0,
    );

    const approvalItems = readOnlyItems.map((line) => {
      const item: Record<string, unknown> = {
        product: detailRefId(line.product),
        ordered_quantity: Number(line.ordered_quantity ?? line.quantity ?? 0),
        approved_quantity: Number(line.ordered_quantity ?? line.quantity ?? 0),
        approved_unit_price: Number(line.unit_price ?? 0),
        ordered_unit_price: Number(line.unit_price ?? 0),
        free_quantity: Number(line.free_quantity ?? line.free_qty ?? 0),
        discount_percent: Number(line.discount_percent ?? 0),
        discount_amount: Number(line.discount_amount ?? 0),
        gst_percent: Number(line.gst_percent ?? 18),
        applied_rate_type:
          !line.applied_rate_type || line.applied_rate_type === "MANUAL"
            ? "SR"
            : String(line.applied_rate_type),
        approved_total_amount: getLineTotal(line),
        approval_status: "fully_approved",
        remarks: typeof line.remarks === "string" ? line.remarks.trim() : "",
      };
      const id = line._id ?? line.id;
      if (id) item.order_item_id = String(id);
      return item;
    });

    const partyContacts = contactsFromParty(partyDetailQ.data);
    const selectedContacts: string[] = [];
    const selectedContactNames: string[] = [];
    const firstWithPhone = partyContacts.find((c) => c.phone.trim());
    if (firstWithPhone) {
      selectedContacts.push(firstWithPhone.phone.trim());
      selectedContactNames.push(firstWithPhone.name.trim());
    }

    return {
      order_items: orderItemsPayload,
      remarks: submitRemarks.trim() || undefined,
      approved_total_amount: approvedTotal,
      approval_items: approvalItems,
      contact_number: selectedContacts,
      contact_name: selectedContactNames,
    };
  }, [readOnlyItems, partyDetailQ.data, submitRemarks]);

  const verifyApprovalExists = useCallback(
    async (id: string) => {
      try {
        const raw = await fetchOrderApprovals(id).unwrap();
        return pickList(raw).length > 0;
      } catch {
        return false;
      }
    },
    [fetchOrderApprovals],
  );

  const finishSubmitSuccess = useCallback(() => {
    toast.success("Order submitted successfully.");
    setSubmitIssue(null);
    setLastSubmitBody(null);
    setIsSubmitPreviewOpen(false);
    setSubmitRemarks("");
    handleRefetch();
  }, [handleRefetch]);

  const handleRetryApproval = useCallback(async () => {
    if (!orderId) return;
    const body = lastSubmitBody || buildSubmitPayload();
    setIsSubmittingOrder(true);
    setSubmitIssue(null);
    try {
      await createOrderApproval({
        order: orderId,
        approve_immediately: false,
        replace_snapshot: true,
        approval_notes:
          typeof body.remarks === "string" ? body.remarks : undefined,
        approved_total_amount: Number(body.approved_total_amount ?? 0) || 0,
        approval_items: (body.approval_items as any[]) || [],
        contact_number: (body.contact_number as string[]) || [],
        contact_name: (body.contact_name as string[]) || [],
        order_items: (body.order_items as any[]) || [],
      }).unwrap();
      const ok = await verifyApprovalExists(orderId);
      if (!ok) {
        throw new Error("Approval still missing after retry");
      }
      finishSubmitSuccess();
    } catch (rejected) {
      const message = mutationRejectedMessage(rejected);
      setSubmitIssue({
        kind: "approval",
        message:
          message ||
          "Order was submitted but approval could not be created. Retry.",
      });
      toast.error(message || "Failed to create order approval");
    } finally {
      setIsSubmittingOrder(false);
    }
  }, [
    orderId,
    lastSubmitBody,
    buildSubmitPayload,
    createOrderApproval,
    verifyApprovalExists,
    finishSubmitSuccess,
  ]);

  const handleSubmitOrder = useCallback(async () => {
    if (!orderId) return;
    if (!readOnlyItems.length) {
      toast.error("Add at least one line item before submitting.");
      return;
    }
    setIsSubmittingOrder(true);
    setSubmitIssue(null);
    const body = buildSubmitPayload();
    setLastSubmitBody(body);
    try {
      const result = (await submitOrder({
        id: orderId,
        body,
      }).unwrap()) as {
        approval_created?: boolean;
        approval_error?: string | null;
      };

      if (result?.approval_created === false) {
        setSubmitIssue({
          kind: "approval",
          message:
            result.approval_error ||
            "Order was submitted but approval was not created. Please retry.",
        });
        toast.error("Submitted, but approval creation failed — retry below.");
        return;
      }

      // Belt-and-suspenders: confirm approval exists (covers older API shapes).
      const exists = await verifyApprovalExists(orderId);
      if (!exists && result?.approval_created !== true) {
        // Short poll in case of eventual consistency / queued fallback.
        let found = false;
        for (let i = 0; i < 3; i += 1) {
          await new Promise((r) => setTimeout(r, 800));
          found = await verifyApprovalExists(orderId);
          if (found) break;
        }
        if (!found) {
          setSubmitIssue({
            kind: "approval",
            message:
              "Order was submitted but approval is missing. Please retry approval creation.",
          });
          toast.error("Approval missing after submit — use Retry.");
          return;
        }
      }

      finishSubmitSuccess();
    } catch (rejected) {
      const message = mutationRejectedMessage(rejected);
      setSubmitIssue({ kind: "submit", message });
      toast.error(message);
    } finally {
      setIsSubmittingOrder(false);
    }
  }, [
    orderId,
    readOnlyItems.length,
    buildSubmitPayload,
    submitOrder,
    verifyApprovalExists,
    finishSubmitSuccess,
  ]);

  const handleSubmitRetry = useCallback(async () => {
    if (submitIssue?.kind === "approval") {
      await handleRetryApproval();
      return;
    }
    await handleSubmitOrder();
  }, [submitIssue, handleRetryApproval, handleSubmitOrder]);

  if (isError || (!isLoading && !detail)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-4 font-sans">
        <p className="text-sm text-rose-600 dark:text-rose-400">
          Could not load order details.
        </p>
        <button type="button" onClick={() => router.back()} className={`${btnSecondaryClass} mt-4`}>
          Back
        </button>
      </div>
    );
  }

  if (!detail) {
    return <PortalBusyOverlay active message="Loading order details…" />;
  }

  return (
    <div className="h-[calc(100vh-150px)] md:h-[calc(100vh-160px)] flex flex-col min-h-0 overflow-hidden space-y-0 pb-20 md:pb-0">
      <EditOrderModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        orderId={orderId}
        detail={detail}
        user={user}
        refetchOrder={handleRefetch}
      />

      <SubmitOrderPreviewModal
        isOpen={isSubmitPreviewOpen}
        onClose={() => {
          if (isSubmittingOrder) return;
          setIsSubmitPreviewOpen(false);
          setSubmitRemarks("");
          setSubmitIssue(null);
          setLastSubmitBody(null);
        }}
        detail={detail}
        partyLabel={custLabel}
        submitRemarks={submitRemarks}
        onSubmitRemarksChange={setSubmitRemarks}
        onSubmit={() => void handleSubmitOrder()}
        onRetry={() => void handleSubmitRetry()}
        isSubmitting={isSubmittingOrder}
        submitIssue={submitIssue}
      />

      <ItemFulfillmentDetailsModal
        isOpen={isFulfillmentModalOpen}
        onClose={() => setIsFulfillmentModalOpen(false)}
        order={detail}
        fulfillmentSnapshot={fulfillmentSnapshot}
      />

      {isOrderItemsModalOpen && (
        <LargeModalPortal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-4xl rounded-xl border border-slate-200/90 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900 transition-all max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-550 dark:text-slate-50">
                Order Items
              </h3>
              <button
                type="button"
                onClick={() => setIsOrderItemsModalOpen(false)}
                className="rounded-md text-slate-400 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 p-1 cursor-pointer"
              >
                <span className="sr-only">Close</span>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4 overflow-y-auto flex-1 pr-1">
              <OrderTab
                orderId={orderId}
                detail={detail}
                isDraft={isDraft}
                user={user}
                refetchOrder={handleRefetch}
              />
            </div>

            <div className="mt-5 flex justify-end border-t border-slate-100 pt-3 dark:border-white/5">
              <button
                type="button"
                onClick={() => setIsOrderItemsModalOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/5 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
        </LargeModalPortal>
      )}

      {isOrderDetailsModalOpen && detail && (
        <LargeModalPortal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-4xl rounded-xl border border-slate-200/90 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900 transition-all max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                Order Details
              </h3>
              <button
                type="button"
                onClick={() => setIsOrderDetailsModalOpen(false)}
                className="rounded-md text-slate-400 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 p-1 cursor-pointer"
              >
                <span className="sr-only">Close</span>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4 overflow-y-auto flex-1 pr-1">
              <dl className="grid gap-3 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium text-slate-500">Order No</dt>
                  <dd className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {String(detail.order_no ?? "—")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Priority</dt>
                  <dd className="mt-0.5 capitalize font-semibold text-slate-900 dark:text-slate-100">
                    {typeof detail.priority === "string" ? detail.priority : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Order Date</dt>
                  <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                    {formatDate(detail.order_date)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Expected Delivery</dt>
                  <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                    {formatDate(detail.expected_delivery_date)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Assigned Sales</dt>
                  <dd className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                    {resolveUser(detail.assigned_sales_user).name}
                    {resolveUser(detail.assigned_sales_user).phone && (
                      <span className="ml-1 text-slate-500 font-normal">
                        ({resolveUser(detail.assigned_sales_user).phone})
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Assigned Admin</dt>
                  <dd className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                    {resolveUser(detail.assigned_admin_user).name}
                    {resolveUser(detail.assigned_admin_user).phone && (
                      <span className="ml-1 text-slate-500 font-normal">
                        ({resolveUser(detail.assigned_admin_user).phone})
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Assigned Finance</dt>
                  <dd className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                    {resolveUser(detail.assigned_finance_user).name}
                    {resolveUser(detail.assigned_finance_user).phone && (
                      <span className="ml-1 text-slate-500 font-normal">
                        ({resolveUser(detail.assigned_finance_user).phone})
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Assigned Dispatch</dt>
                  <dd className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                    {resolveUser(detail.assigned_dispatch_user).name}
                    {resolveUser(detail.assigned_dispatch_user).phone && (
                      <span className="ml-1 text-slate-500 font-normal">
                        ({resolveUser(detail.assigned_dispatch_user).phone})
                      </span>
                    )}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-slate-500">Remarks</dt>
                  <dd className="mt-0.5 min-h-8 whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-slate-900 dark:bg-slate-950/40 dark:text-slate-100">
                    {typeof detail.remarks === "string" && detail.remarks.trim()
                      ? detail.remarks
                      : "—"}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="mt-5 flex justify-end border-t border-slate-100 pt-3 dark:border-white/5">
              <button
                type="button"
                onClick={() => setIsOrderDetailsModalOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/5 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
        </LargeModalPortal>
      )}

      {isPartyDetailsModalOpen && (
        <LargeModalPortal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200/90 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900 transition-all max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-550 dark:text-slate-50">
                Party Details
              </h3>
              <button
                type="button"
                onClick={() => setIsPartyDetailsModalOpen(false)}
                className="rounded-md text-slate-400 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 p-1 cursor-pointer"
              >
                <span className="sr-only">Close</span>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4 overflow-y-auto flex-1 pr-1">
              {partyDetailQ.isFetching ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Loading party details...
                </p>
              ) : partyDetailQ.isError ? (
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  Error loading party details.
                </p>
              ) : partyDetailQ.data ? (
                (() => {
                  const p = partyDetailQ.data as Record<string, unknown>;
                  return (
                    <div className="space-y-3 text-xs">
                      <dl className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-medium text-slate-500">Party Name</dt>
                          <dd className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                            {displayText(p.party_name) !== "—" ? displayText(p.party_name) : custLabel}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">Contact</dt>
                          <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                            {displayText(p.contact_person)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">Mobile</dt>
                          <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                            {displayText(p.mobile)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">Email</dt>
                          <dd className="mt-0.5 truncate text-slate-900 dark:text-slate-100">
                            {displayText(p.email)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">GST Number</dt>
                          <dd className="mt-0.5 font-mono text-slate-900 dark:text-slate-100">
                            {displayText(p.gst_no)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">Payment Terms</dt>
                          <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                            {displayText(p.payment_terms)}
                          </dd>
                        </div>
                      </dl>
                      <div className="grid gap-3 border-t border-slate-100 pt-3 dark:border-white/10 sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-medium text-slate-500">Billing Address</dt>
                          <dd className="mt-1 whitespace-pre-line rounded-lg bg-slate-50 p-2 text-xs text-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
                            {formatStructuredAddress(p.billing_address)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">Shipping Address</dt>
                          <dd className="mt-1 whitespace-pre-line rounded-lg bg-slate-50 p-2 text-xs text-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
                            {formatStructuredAddress(p.shipping_address)}
                          </dd>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No party linked on this order.
                </p>
              )}
            </div>

            <div className="mt-5 flex justify-end border-t border-slate-100 pt-3 dark:border-white/5">
              <button
                type="button"
                onClick={() => setIsPartyDetailsModalOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/5 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
        </LargeModalPortal>
      )}

      {detail && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-shrink-0 space-y-1">
            <div className="rounded-lg border border-slate-200/80 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-slate-900">

              {/* ── Top row: order details + inline fulfillment pipeline ── */}
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-1 text-2xs text-slate-500 dark:text-slate-400">
                    <button type="button" onClick={() => router.back()} className="font-medium text-blue-600 hover:underline dark:text-blue-400">Orders</button>
                    <span>/</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Order Details</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h1 className="truncate text-base sm:text-lg font-bold tracking-tight text-slate-950 dark:text-slate-50">
                      {custLabel}
                    </h1>
                    {detail && (checkOrderPartySra(detail, partySraById) || (partyDetailQ.data as any)?.sra === true) && (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-2xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-400 shrink-0">
                        SRA
                      </span>
                    )}
                    <span className="shrink-0">{renderPriorityBadge(typeof detail.priority === "string" ? detail.priority : "normal")}</span>
                  </div>
                  <div className="mt-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-lg text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      Order No:{" "}
                      <b className="font-bold text-blue-700 dark:text-blue-400">
                        {detail.order_no ? String(detail.order_no) : "Order"}
                      </b>
                    </span>
                    <span>Date: {formatDateShort(detail.order_date)}</span>
                    <span>EDD: {formatDateShort(detail.expected_delivery_date)}</span>
                  </div>
                </div>

                <div className="flex min-w-0 items-center gap-1.5 lg:shrink-0">
                  <div className="min-w-0 flex-1 overflow-x-auto lg:flex-none lg:min-w-[420px]">
                    <OrderFulfillmentPipelineStrip steps={pipelineSteps} size="sm" />
                  </div>
                  <button type="button" onClick={() => setIsFulfillmentModalOpen(true)} className="shrink-0 rounded-md border border-amber-200/80 bg-white px-1.5 py-0.5 text-2xs font-bold text-amber-600 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-950 dark:text-amber-400 dark:hover:bg-white/5" title="Fulfillment details">Details</button>
                  <button type="button" onClick={handleRefetch} className="shrink-0 rounded-md border border-slate-200/95 p-1 text-slate-500 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/5" title="Refresh">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  </button>
                </div>
              </div>

              {/* ── Info buttons: 3-col on mobile, inline on sm+ ── */}
              <div className="mt-1 grid grid-cols-3 gap-1 sm:flex sm:flex-wrap sm:gap-1.5 font-sans font-medium">
                <button type="button" onClick={() => setIsOrderDetailsModalOpen(true)} className="inline-flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-white px-2 py-1 sm:px-2 sm:py-1 text-2xs font-semibold text-slate-700 shadow-sm transition dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-white/5 cursor-pointer active:scale-[0.97]">
                  <svg className="h-3.5 w-3.5 sm:h-3 sm:w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  <span>Order Info</span>
                </button>
                <button type="button" onClick={() => setIsPartyDetailsModalOpen(true)} className="inline-flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-white px-2 py-1 sm:px-2 sm:py-1 text-2xs font-semibold text-slate-700 shadow-sm transition dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-white/5 cursor-pointer active:scale-[0.97]">
                  <svg className="h-3.5 w-3.5 sm:h-3 sm:w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                  <span>Party Info</span>
                </button>
                <button type="button" onClick={() => setIsOrderItemsModalOpen(true)} className="inline-flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-white px-2 py-1 sm:px-2 sm:py-1 text-2xs font-semibold text-slate-700 shadow-sm transition dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-white/5 cursor-pointer active:scale-[0.97]">
                  <svg className="h-3.5 w-3.5 sm:h-3 sm:w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                  <span>Items List</span>
                </button>
                {isDraft && (
                  <button type="button" onClick={() => setIsEditModalOpen(true)} className="inline-flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-1 rounded-md bg-blue-600 hover:bg-blue-700 px-2 py-1 sm:px-2 sm:py-1 text-2xs font-semibold text-white shadow-sm transition active:scale-[0.97] cursor-pointer dark:bg-blue-500 dark:hover:bg-blue-400">
                    <svg className="h-3.5 w-3.5 sm:h-3 sm:w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    <span>Edit Draft</span>
                  </button>
                )}
              </div>

              {/* ── Action buttons ── */}
              <div className="mt-2 border-t border-slate-100 pt-2 dark:border-white/10">
                <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 font-sans font-medium">
                  <button type="button" disabled={status !== "draft"} onClick={() => { setSubmitRemarks(""); setIsSubmitPreviewOpen(true); }} className="rounded-md bg-emerald-600 px-2 sm:px-2 py-0.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-emerald-500 dark:hover:bg-emerald-400 active:scale-[0.98]">Submit Order</button>
                </div>
              </div>

            </div>
          </div>

          {/* ── DESKTOP: Tab Content ── */}
          <div className="hidden md:block flex-1 min-h-0 overflow-y-auto pr-1">
            {activeTab === "approvals" && (<ApprovalTab orderId={orderId} detail={detail} />)}
            {activeTab === "dispatches" && (<DispatchesTab orderId={orderId} detail={detail} refetchOrder={handleRefetch} />)}
            {activeTab === "transports" && (<TransportsTab orderId={orderId} detail={detail} refetchOrder={handleRefetch} />)}
            {activeTab === "flags" && (<FlagsTab orderId={orderId} refetchOrder={handleRefetch} />)}
            {activeTab === "attachments" && (<AttachmentsTab orderId={orderId} attachments={attachmentsList} isLoading={attachmentsQ.isLoading} onUploadSuccess={handleRefetch} />)}
          </div>

          {/* ── DESKTOP: Footer Tab Nav ── */}
          <div className="hidden md:block mb-0 flex-shrink-0 border-t border-slate-100 dark:border-white/5 bg-slate-50/95 dark:bg-slate-955/90 backdrop-blur-md px-2 pt-1.5 pb-0 [&_nav]:pb-0">
            <OrderDetailTabsNav className="!mb-0 !rounded-none !border-0 !bg-transparent !p-0"
              tabs={[
                { id: "approvals", name: "Order Approval" },
                { id: "dispatches", name: "Dispatches" },
                { id: "transports", name: "Transports" },
                { id: "flags", name: "Flags", count: openFlagsCount, dangerBadge: true },
                { id: "attachments", name: "Attachments", count: attachmentsCount },
              ]}
              activeId={activeTab}
              onChange={(id) => setActiveTab(id as typeof activeTab)}
            />
          </div>

          {/* ── MOBILE: Full-screen popup ── */}
          {mobileTabOpen && (
            <div className="md:hidden fixed inset-0 z-[60] flex flex-col bg-white dark:bg-slate-900">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 sticky top-0 z-10">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">
                  {activeTab === "approvals" && "Order Approval"}{activeTab === "dispatches" && "Dispatches"}{activeTab === "transports" && "Transports"}{activeTab === "flags" && "Flags"}{activeTab === "attachments" && "Attachments"}
                </h2>
                <button type="button" onClick={() => setMobileTabOpen(false)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 transition" aria-label="Close panel">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 pb-24">
                {activeTab === "approvals" && (<ApprovalTab orderId={orderId} detail={detail} />)}
                {activeTab === "dispatches" && (<DispatchesTab orderId={orderId} detail={detail} refetchOrder={handleRefetch} />)}
                {activeTab === "transports" && (<TransportsTab orderId={orderId} detail={detail} refetchOrder={handleRefetch} />)}
                {activeTab === "flags" && (<FlagsTab orderId={orderId} refetchOrder={handleRefetch} />)}
                {activeTab === "attachments" && (<AttachmentsTab orderId={orderId} attachments={attachmentsList} isLoading={attachmentsQ.isLoading} onUploadSuccess={handleRefetch} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MOBILE: Bottom Tab Nav ── */}
      {!isFetching && !isError && detail && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-2">
          <nav className="flex items-stretch justify-around">
            {([
              { id: "approvals" as const, name: "Approval", count: undefined, dangerBadge: false, icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
              { id: "dispatches" as const, name: "Dispatch", count: undefined, dangerBadge: false, icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg> },
              { id: "transports" as const, name: "Transport", count: undefined, dangerBadge: false, icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2.556-2.556M13 16H9m4 0h2m2 0h.01M13 16V6m0 0h3l3 4v6h-1M6 16H5m8-10H5" /></svg> },
              { id: "flags" as const, name: "Flags", count: openFlagsCount, dangerBadge: true, icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" /></svg> },
              { id: "attachments" as const, name: "Files", count: attachmentsCount, dangerBadge: false, icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg> },
            ]).map((tab) => {
              const isActive = activeTab === tab.id && mobileTabOpen;
              return (
                <button key={tab.id} type="button" onClick={() => { if (activeTab === tab.id && mobileTabOpen) { setMobileTabOpen(false); } else { setActiveTab(tab.id); setMobileTabOpen(true); } }} className={`relative flex flex-col items-center justify-center gap-0.5 py-2.5 px-2 flex-1 min-w-0 transition-colors ${isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-slate-400"}`}>
                  <span className={`relative transition-transform ${isActive ? "scale-110" : ""}`}>
                    {tab.icon}
                    {tab.count !== undefined && tab.count > 0 && (<span className={`absolute -top-1.5 -right-1.5 min-w-[1rem] h-4 flex items-center justify-center rounded-full px-1 text-2xs font-bold ${tab.dangerBadge ? "bg-rose-500 text-white" : "bg-slate-600 text-white dark:bg-slate-300 dark:text-slate-900"}`}>{tab.count}</span>)}
                  </span>
                  <span className={`text-2xs font-semibold leading-none truncate max-w-full ${isActive ? "text-blue-600 dark:text-blue-400" : ""}`}>{tab.name}</span>
                  {isActive && <span className="absolute top-0 left-2 right-2 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400" />}
                </button>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}


