/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { Button } from "@/components/ui/Button";

import {
  buildPartyNameById,
  buildPartySraById,
  checkOrderPartySra,
  pickList as pickPartyList,
  resolveOrderCounterparty,
} from "@/components/portal/sales/partyDisplay";
import {
  mutationRejectedMessage,
} from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/store/hooks";
import {
  useGetOrderQuery,
  useListPartiesQuery,
  useGetPartyQuery,
  useListUsersQuery,
  usePatchOrderMutation,
  useTransitionOrderMutation,
  useListFlagsQuery,
  useCreateFlagMutation,
  useGetOrderHistoryQuery,
  useListAttachmentsQuery,
  useCreateAttachmentMutation,
  useCreateOrderApprovalMutation,
  useApproveOrderApprovalMutation,
  useRejectOrderApprovalMutation,
  useListOrderApprovalsQuery,
  useGetOrderFulfillmentQuery,
  useListOrderDueSheetsQuery,
  useListOrderReturnsQuery,
  useListRemindersQuery,
} from "@/store/api";
import {
  buildPendingReturnOrderIds,
  FINANCE_ORDER_TAB_LABELS,
  getFinanceOrderTabCategory,
  type FinanceOrderTabCategory,
} from "@/components/portal/finance/financeOrderUtils";

import { FlagsTab } from "./components/FlagsTab";
import AttachmentsTab from "./components/AttachmentsTab";
import { ApprovalTab } from "./components/ApprovalTab";
import { DispatchesTab } from "./components/DispatchesTab";
import { TransportsTab } from "./components/TransportsTab";
import { DueSheetTab } from "@/components/portal/shared/DueSheetTab";
import { RemindersTab } from "@/components/portal/shared/RemindersTab";

import { ALL_FLAG_TYPES, FLAGS_FOR_TARGET_DEPARTMENT } from "@/components/portal/shared/flagTypes";
import { OrderDetailTabsNav } from "@/components/portal/shared/OrderDetailTabsNav";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import {
  computeFinanceApprovalCapabilities,
} from "@/components/portal/shared/financeApprovalStatus";
import { ItemFulfillmentDetailsModal } from "@/components/portal/shared/ItemFulfillmentDetailsModal";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import {
  OrderFulfillmentPipelineStrip,
  buildOrderFulfillmentPipelineSteps,
  DEFAULT_ORDER_PIPELINE_ICONS,
} from "@/components/portal/shared/FulfillmentCircleStep";
import { computeDepartmentStageBoxes } from "@/components/portal/shared/orderDepartmentStages";
import OrderDetailsModal from "./components/OrderDetailsModal";
import PartyDetailsModal from "./components/PartyDetailsModal";

const inputClass =
  "w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-955 dark:text-slate-50";
const labelClass = "text-xs font-medium text-slate-700 dark:text-slate-300";
const btnSecondaryClass =
  "rounded-lg border border-slate-200/95 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5";

const departmentLabels: Record<string, string> = {
  sales: "Sales",
  finance: "Finance",
  dispatch: "Dispatch",
  admin: "Admin",
};

function pickList(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as Record<string, unknown>[];
    if (Array.isArray(o.data)) return o.data as Record<string, unknown>[];
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

function detailRefId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return String(o._id ?? o.id ?? "");
  }
  return "";
}

function readId(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const row = value as Record<string, unknown>;
  return String(row._id ?? row.id ?? "");
}

function renderWorkflowStatusBadge(category: FinanceOrderTabCategory | null) {
  if (!category) return null;
  const label = FINANCE_ORDER_TAB_LABELS[category] ?? category;
  let bgClass =
    "bg-slate-50 text-slate-700 ring-slate-500/10 dark:bg-white/5 dark:text-slate-400 dark:ring-white/10";
  switch (category) {
    case "open_dispatched":
      bgClass =
        "bg-teal-50 text-teal-700 ring-teal-600/10 dark:bg-teal-950/30 dark:text-teal-400 dark:ring-teal-500/25";
      break;
    case "transport_return_pending":
      bgClass =
        "bg-amber-50 text-amber-700 ring-amber-600/10 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-500/25";
      break;
    case "pending_finance_approval":
      bgClass =
        "bg-purple-50 text-purple-700 ring-purple-600/10 dark:bg-purple-950/30 dark:text-purple-400 dark:ring-purple-500/25";
      break;
    case "closed_delivered":
      bgClass =
        "bg-emerald-50 text-emerald-700 ring-emerald-600/10 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-500/25";
      break;
    case "on_hold":
      bgClass =
        "bg-amber-50 text-amber-700 ring-amber-600/10 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-500/25";
      break;
    case "rejected":
      bgClass =
        "bg-red-50 text-red-700 ring-red-600/10 dark:bg-red-950/30 dark:text-red-400 dark:ring-red-500/25";
      break;
    case "cancelled":
      bgClass =
        "bg-rose-50 text-rose-700 ring-rose-600/10 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-500/25";
      break;
    default:
      break;
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wider ring-1 ring-inset ${bgClass}`}
    >
      {label}
    </span>
  );
}

function renderPriorityBadge(priority: string) {
  const p = String(priority || "normal").toLowerCase();
  if (p === "urgent") {
    return (
      <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-rose-700 ring-1 ring-inset ring-rose-700/10 dark:bg-rose-955/30 dark:text-rose-455/90 dark:ring-rose-500/25">
        Urgent
      </span>
    );
  }
  if (p === "high") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-amber-700 ring-1 ring-inset ring-amber-700/10 dark:bg-amber-955/30 dark:text-amber-455/90 dark:ring-amber-500/20">
        High
      </span>
    );
  }
  if (p === "normal") {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-955/30 dark:text-blue-455/90 dark:ring-blue-500/20">
        Normal
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-slate-700 ring-1 ring-inset ring-slate-500/10 dark:bg-white/5 dark:text-slate-400 dark:ring-white/10">
      Low
    </span>
  );
}

export default function FinanceOrderDetail({ orderId }: { orderId: string }) {
  const router = useRouter();
  const currentUser = useAppSelector((state) => state.auth.user);
  const currentUserId = useMemo(() => {
    return String(currentUser?._id ?? currentUser?.id ?? "");
  }, [currentUser]);

  const { data, isLoading, isFetching, isError, refetch } = useGetOrderQuery(orderId);
  const partiesQ = useListPartiesQuery({});
  const financeApprovalsQ = useListOrderApprovalsQuery({ order: orderId, is_admin_approved: true });
  const fulfillmentQ = useGetOrderFulfillmentQuery(orderId);
  const dueSheetsQ = useListOrderDueSheetsQuery({ order: orderId });
  const remindersQ = useListRemindersQuery({ order: orderId });
  const reminders = remindersQ.data || [];
  const { data: returnsData } = useListOrderReturnsQuery({});
  const adminApprovalsQ = useListOrderApprovalsQuery(
    { order: orderId, assigned_finance_user: currentUserId },
    { skip: !orderId || !currentUserId },
  );

  const categoryOptions = useMemo(
    () => ({
      pendingReturnOrderIds: buildPendingReturnOrderIds(pickPartyList(returnsData)),
    }),
    [returnsData],
  );

  const adminApprovalsCount = useMemo(() => {
    return pickList(adminApprovalsQ.data).filter((app) => {
      const assigneeId =
        typeof app.assigned_finance_user === "string"
          ? app.assigned_finance_user
          : String(
            (app.assigned_finance_user as { _id?: unknown; id?: unknown } | undefined)
              ?._id ??
            (app.assigned_finance_user as { id?: unknown } | undefined)?.id ??
            "",
          );
      return assigneeId && assigneeId === currentUserId;
    }).length;
  }, [adminApprovalsQ.data, currentUserId]);

  const detail =
    data && typeof data === "object"
      ? (data as Record<string, unknown>)
      : null;
  const status = deriveOrderWorkflowStatus(detail);
  const workflowTabCategory = useMemo(
    () => getFinanceOrderTabCategory(detail, categoryOptions),
    [detail, categoryOptions],
  );

  const fulfillmentSnapshot = useMemo(
    () =>
      fulfillmentQ.data && typeof fulfillmentQ.data === "object"
        ? (fulfillmentQ.data as Record<string, unknown>)
        : null,
    [fulfillmentQ.data],
  );

  const fulfillmentTotals = useMemo(() => {
    if (!fulfillmentSnapshot?.totals || typeof fulfillmentSnapshot.totals !== "object") {
      return null;
    }
    return fulfillmentSnapshot.totals as Record<string, unknown>;
  }, [fulfillmentSnapshot]);

  const financeApprovalRecords = useMemo(
    () => pickList(financeApprovalsQ.data) as Record<string, unknown>[],
    [financeApprovalsQ.data],
  );

  const hasApprovedFinanceApproval = useMemo(
    () =>
      financeApprovalRecords.some((row) => {
        const s = String(row.approval_status ?? "").toLowerCase();
        return (
          s === "fully_approved" ||
          s === "partially_approved" ||
          s === "approved"
        );
      }),
    [financeApprovalRecords],
  );

  const financeCaps = useMemo(
    () =>
      computeFinanceApprovalCapabilities(detail, fulfillmentTotals, {
        financeApprovalCount: financeApprovalRecords.length,
        hasApprovedFinanceApproval,
      }),
    [
      detail,
      fulfillmentTotals,
      financeApprovalRecords.length,
      hasApprovedFinanceApproval,
    ],
  );

  const partyNameById = useMemo(
    () => buildPartyNameById(partiesQ.data),
    [partiesQ.data],
  );
  const partySraById = useMemo(
    () => buildPartySraById(partiesQ.data),
    [partiesQ.data],
  );

  const currentPartyId = useMemo(() => {
    return detail ? detailRefId(detail.party) : "";
  }, [detail]);

  const partyDetailQ = useGetPartyQuery(currentPartyId, {
    skip: !currentPartyId,
  });

  const [transitionOrder, { isLoading: isSubmitting }] =
    useTransitionOrderMutation();
  const [createFinanceApproval] = useCreateOrderApprovalMutation();
  const [approveFinanceApproval] = useApproveOrderApprovalMutation();
  const [rejectFinanceApproval] = useRejectOrderApprovalMutation();

  const [transitioningTo, setTransitioningTo] = useState<string | null>(null);
  const [transitionRemarks, setTransitionRemarks] = useState("");

  const [activeTab, setActiveTab] = useState<
    | "approvals"
    | "dispatches"
    | "transports"
    | "due_sheet"
    | "flags"
    | "attachments"
    | "reminders"
  >("approvals");
  const [mobileTabOpen, setMobileTabOpen] = useState(false);

  // Order Patch Mutation
  const [patchOrder, { isLoading: isPatching }] = usePatchOrderMutation();
  const [confirmResolveOpen, setConfirmResolveOpen] = useState(false);



  const flagsQ = useListFlagsQuery({ order: orderId });
  const rawFlags = useMemo(() => {
    const arr = pickList(flagsQ.data);
    return arr as Record<string, unknown>[];
  }, [flagsQ.data]);

  const historyQ = useGetOrderHistoryQuery(orderId);
  const historyList = useMemo(() => {
    const arr = pickList(historyQ.data);
    return arr as Record<string, unknown>[];
  }, [historyQ.data]);

  const attachmentsQ = useListAttachmentsQuery({ entity_type: "order", entity_id: orderId });
  const attachments = useMemo(() => {
    return pickList(attachmentsQ.data) as Record<string, unknown>[];
  }, [attachmentsQ.data]);

  const dueSheets = useMemo(() => pickList(dueSheetsQ.data), [dueSheetsQ.data]);
  const dueSheetCount = dueSheets.length;

  const usersQ = useListUsersQuery({});
  const users = useMemo(() => {
    const list = pickList(usersQ.data);
    return list as Record<string, unknown>[];
  }, [usersQ.data]);

  // Modular Modals Overlay states
  const [isFulfillmentModalOpen, setIsFulfillmentModalOpen] = useState(false);
  const [isOrderDetailsModalOpen, setIsOrderDetailsModalOpen] = useState(false);
  const [isPartyDetailsModalOpen, setIsPartyDetailsModalOpen] = useState(false);

  const resolveUserId = useCallback((userVal: unknown): string => {
    if (!userVal) return "";
    if (typeof userVal === "string") return userVal;
    if (typeof userVal === "object" && userVal !== null) {
      const o = userVal as Record<string, unknown>;
      return String(o._id ?? o.id ?? "");
    }
    return "";
  }, []);

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

  const userNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of users) {
      const id = String(u._id ?? u.id ?? "");
      if (id) map[id] = String(u.username || u.name || id);
    }
    return map;
  }, [users]);



  const readOnlyItems = useMemo(() => {
    if (!detail || !Array.isArray(detail.order_items)) return [];
    return detail.order_items as Record<string, unknown>[];
  }, [detail]);

  const totalApproved = useMemo(() => {
    if (!detail || !Array.isArray(detail.order_items)) return 0;
    return detail.order_items.reduce(
      (sum, item: any) => sum + Number(item.approved_quantity ?? 0),
      0
    );
  }, [detail]);

  const hasRemainingQty = useMemo(() => {
    if (!detail || !Array.isArray(detail.order_items)) return false;
    return detail.order_items.some((item: any) => {
      const approvedSoFar = Number(item.approved_quantity ?? 0);
      const remainingQty = Math.max(0, Number(item.sales_approved_quantity ?? 0) - approvedSoFar);
      return remainingQty > 0;
    });
  }, [detail]);

  const handleRefetch = useCallback(() => {
    refetch();
    if (!flagsQ.isUninitialized) flagsQ.refetch();
    if (!historyQ.isUninitialized) historyQ.refetch();
    if (!attachmentsQ.isUninitialized) attachmentsQ.refetch();
    if (!financeApprovalsQ.isUninitialized) financeApprovalsQ.refetch();
    if (!fulfillmentQ.isUninitialized) fulfillmentQ.refetch();
    if (!adminApprovalsQ.isUninitialized) adminApprovalsQ.refetch();
    if (!dueSheetsQ.isUninitialized) dueSheetsQ.refetch();
    if (!remindersQ.isUninitialized) remindersQ.refetch();
  }, [refetch, flagsQ, historyQ, attachmentsQ, financeApprovalsQ, fulfillmentQ, adminApprovalsQ, dueSheetsQ, remindersQ]);

  const handleResolveOrder = useCallback(async () => {
    if (!detail || !Array.isArray(detail.order_items)) return;
    try {
      const updatedItems = detail.order_items.map((item: any) => ({
        ...item,
        ordered_quantity: Number(item.approved_quantity ?? 0),
        quantity: Number(item.approved_quantity ?? 0),
      }));

      await patchOrder({
        id: orderId,
        patch: {
          order_items: updatedItems,
        },
      }).unwrap();

      await transitionOrder({
        id: orderId,
        body: {
          next_status: "fully_finance_approved",
          remarks: "Resolved partial release to match approved quantities",
        },
      }).unwrap();

      toast.success("Order resolved to approved quantities.");
      setConfirmResolveOpen(false);
      handleRefetch();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  }, [detail, orderId, patchOrder, transitionOrder, handleRefetch]);





  const executeTransition = useCallback(
    async (nextStatus: string) => {
      if (!orderId) return;
      if (nextStatus === "finance_rejected" && !transitionRemarks.trim()) {
        toast.error("Rejection reason is required.");
        return;
      }
      try {
        if (nextStatus === "finance_approved" || nextStatus === "finance_rejected") {
          const approvalItems =
            nextStatus === "finance_approved"
              ? readOnlyItems
                .map((line) => {
                  const ordered = Number(line.ordered_quantity ?? line.quantity ?? 0);
                  const alreadyApproved = Number(line.approved_quantity || 0);
                  const remaining = Math.max(0, ordered - alreadyApproved);
                  const approveQty = remaining > 0 ? remaining : ordered;
                  if (approveQty <= 0) return null;
                  return {
                    order_item_id: line._id,
                    approved_quantity: approveQty,
                    approval_status:
                      approveQty >= ordered ? "fully_approved" : "partially_approved",
                  };
                })
                .filter(Boolean)
              : undefined;

          const approval = await createFinanceApproval({
            order: orderId,
            approval_status: "pending_review",
            approval_notes: transitionRemarks.trim() || undefined,
            rejection_reason: nextStatus === "finance_rejected" ? transitionRemarks.trim() : undefined,
            approval_items: approvalItems,
          }).unwrap();
          const approvalId = readId(approval);
          if (!approvalId) throw new Error("Finance approval id missing from response");

          if (nextStatus === "finance_rejected") {
            await rejectFinanceApproval({
              id: approvalId,
              body: { rejection_reason: transitionRemarks.trim() },
            }).unwrap();
          } else {
            await approveFinanceApproval({
              id: approvalId,
              body: { approval_notes: transitionRemarks.trim() || undefined },
            }).unwrap();
          }
        } else {
          await transitionOrder({
            id: orderId,
            body: {
              next_status: nextStatus,
              remarks: transitionRemarks.trim() || undefined,
            },
          }).unwrap();
        }
        toast.success(`Order transitioned to ${nextStatus}`);
        setTransitioningTo(null);
        setTransitionRemarks("");
        handleRefetch();
      } catch (rejected) {
        toast.error(mutationRejectedMessage(rejected));
      }
    },
    [
      orderId,
      transitionRemarks,
      readOnlyItems,
      createFinanceApproval,
      approveFinanceApproval,
      rejectFinanceApproval,
      transitionOrder,
      handleRefetch,
    ],
  );



  const custLabel = detail
    ? resolveOrderCounterparty(detail, partyNameById)
    : "—";



  const canReject = useMemo(() => {
    if (financeCaps.isFullyApproved) return false;
    return (
      financeCaps.canReviewAndApprove ||
      financeCaps.isPartiallyApproved ||
      status === "finance_review"
    );
  }, [financeCaps, status]);

  const canHold = useMemo(() => {
    return [
      "finance_review",
      "finance_approved",
      "partially_finance_approved",
      "fully_finance_approved",
      "dispatch_pending",
      "partial_dispatch_created",
      "full_dispatch_created",
      "transport_pending",
      "transport_assigned",
      "partially_transported",
      "fully_transported",
      "in_transit",
    ].includes(status);
  }, [status]);

  const busy = isPatching || isSubmitting;

  const orderKpis = useMemo(() => {
    const totalLines = readOnlyItems.length;
    const totalQty = readOnlyItems.reduce(
      (sum, line) => sum + Number(line.ordered_quantity ?? line.quantity ?? 0),
      0,
    );
    const dispatchedQty = readOnlyItems.reduce(
      (sum, line) => sum + Number(line.dispatched_quantity || 0),
      0,
    );
    const pendingDispatchQty = Number(
      fulfillmentTotals?.pendingDispatch ??
      readOnlyItems.reduce((sum, line) => {
        const approved = Number(line.approved_quantity || 0);
        const cap = approved > 0 ? approved : Number(line.ordered_quantity ?? line.quantity ?? 0);
        return sum + Math.max(0, cap - Number(line.dispatched_quantity || 0));
      }, 0),
    );
    const pendingFinanceQty = Number(
      fulfillmentTotals?.pendingFinance ?? financeCaps.pendingFinanceQty,
    );
    const financeApprovedQty = Number(
      fulfillmentTotals?.approved ?? financeCaps.approvedQty,
    );
    const grandTotal = Number(detail?.grand_total || 0);
    const openFlags = rawFlags.filter((f) => f.status === "open").length;

    return {
      totalLines,
      totalQty,
      dispatchedQty,
      pendingDispatchQty,
      pendingFinanceQty,
      financeApprovedQty,
      grandTotal,
      openFlags,
    };
  }, [detail, financeCaps, fulfillmentTotals, readOnlyItems, rawFlags]);

  const createdBy = useMemo(() => {
    const id = resolveUserId(detail?.created_by);
    return (id && userNameById[id]) || "Sales";
  }, [detail, resolveUserId, userNameById]);

  const deptBoxes = useMemo(() => {
    if (!detail) return [];
    return computeDepartmentStageBoxes(detail, fulfillmentSnapshot);
  }, [detail, fulfillmentSnapshot]);

  const pipelineSteps = useMemo(
    () =>
      buildOrderFulfillmentPipelineSteps(deptBoxes, DEFAULT_ORDER_PIPELINE_ICONS, {
        defaultTotal: orderKpis.totalQty,
      }),
    [deptBoxes, orderKpis.totalQty],
  );

  if (isError || (!isLoading && !detail)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-4 font-sans">
        <p className="text-sm text-rose-600 dark:text-rose-400 font-medium">
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
      {/* Transitions Dialog */}
      {transitioningTo && (
        <LargeModalPortal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-xl border border-slate-200/90 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-555 dark:text-slate-50 capitalize">
              Transition to {transitioningTo.replace("_", " ")}
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {transitioningTo === "finance_rejected"
                ? "Please specify the reason for rejection (required)."
                : "Confirm transition and add comments."}
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 font-sans">
                  {transitioningTo === "finance_rejected"
                    ? "Rejection Reason (Required)"
                    : "Remarks (Optional)"}
                </label>
                <textarea
                  value={transitionRemarks}
                  onChange={(e) => setTransitionRemarks(e.target.value)}
                  rows={3}
                  className="w-full mt-1.5 rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-550 dark:text-slate-50 font-sans"
                  placeholder={
                    transitioningTo === "finance_rejected"
                      ? "Type rejection reason..."
                      : "Type remarks..."
                  }
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 font-sans font-medium">
              <Button
                variant="secondary"
                onClick={() => {
                  setTransitioningTo(null);
                  setTransitionRemarks("");
                }}
              >
                Cancel
              </Button>
              <Button onClick={() => executeTransition(transitioningTo)}>
                Confirm
              </Button>
            </div>
          </div>
        </div>
        </LargeModalPortal>
      )}

      {/* Resolve Confirmation Modal */}
      {confirmResolveOpen && (
        <LargeModalPortal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-xl border border-slate-200/90 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900 font-sans">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-555 dark:text-slate-50 font-sans font-medium">
              Confirm Resolve Partial Release
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Are you sure you want to resolve this order? This will adjust the ordered quantity of all items to match their currently approved quantities, completing the order releases.
            </p>
            <div className="mt-6 flex justify-end gap-3 font-medium">
              <Button
                variant="secondary"
                className="cursor-pointer font-sans"
                onClick={() => setConfirmResolveOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="cursor-pointer font-sans"
                onClick={handleResolveOrder}
                disabled={isPatching || isSubmitting}
              >
                {isPatching || isSubmitting ? "Resolving..." : "Yes, Resolve Order"}
              </Button>
            </div>
          </div>
        </div>
        </LargeModalPortal>
      )}

      <ItemFulfillmentDetailsModal
        isOpen={isFulfillmentModalOpen}
        onClose={() => setIsFulfillmentModalOpen(false)}
        order={detail}
        fulfillmentSnapshot={fulfillmentSnapshot}
      />

      <OrderDetailsModal
        isOpen={isOrderDetailsModalOpen}
        onClose={() => setIsOrderDetailsModalOpen(false)}
        detail={detail}
        createdBy={createdBy}
        resolveUser={resolveUser}
      />

      <PartyDetailsModal
        isOpen={isPartyDetailsModalOpen}
        onClose={() => setIsPartyDetailsModalOpen(false)}
        isFetching={partyDetailQ.isFetching}
        isError={partyDetailQ.isError}
        partyData={partyDetailQ.data}
        custLabel={custLabel}
      />

      {/* Order Main Content */}
      {detail && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-shrink-0 space-y-1">
            <div className="rounded-lg border border-slate-200/80 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-slate-900">

              {/* ── Top row: breadcrumb + title + meta + inline pipeline ── */}
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                  {/* Breadcrumb */}
                  <div className="mb-1 flex flex-wrap items-center gap-1 text-2xs text-slate-500 dark:text-slate-400">
                    <button
                      type="button"
                      onClick={() => router.back()}
                      className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Orders
                    </button>
                    <span>/</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Order Details</span>
                  </div>

                  {/* Title + priority inline */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h1 className="truncate text-base sm:text-lg font-bold tracking-tight text-slate-950 dark:text-slate-50">
                      {custLabel}
                    </h1>
                    {detail && (checkOrderPartySra(detail, partySraById) || (partyDetailQ.data as any)?.sra === true) && (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-2xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-400 shrink-0">
                        SRA
                      </span>
                    )}
                    <span className="shrink-0">
                      {renderPriorityBadge(typeof detail.priority === "string" ? detail.priority : "normal")}
                    </span>
                    <span className="shrink-0">
                      {renderWorkflowStatusBadge(workflowTabCategory)}
                    </span>
                  </div>

                  {/* Meta info */}
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

                  <button
                    type="button"
                    onClick={() => setIsFulfillmentModalOpen(true)}
                    className="shrink-0 rounded-md border border-amber-200/80 bg-white px-1.5 py-0.5 text-2xs font-bold text-amber-600 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-950 dark:text-amber-400 dark:hover:bg-white/5"
                    title="Fulfillment details"
                  >
                    Details
                  </button>
                  <button
                    type="button"
                    onClick={handleRefetch}
                    className="shrink-0 rounded-md border border-slate-200/95 p-1 text-slate-500 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/5"
                    title="Refresh"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* ── Info buttons: 2-col grid on mobile, inline on sm+ ── */}
              <div className="mt-1 grid grid-cols-2 gap-1 sm:flex sm:flex-wrap sm:gap-1.5 font-sans font-medium">
                <button
                  type="button"
                  onClick={() => setIsOrderDetailsModalOpen(true)}
                  className="inline-flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-white px-2 py-1 sm:px-2 sm:py-1 text-2xs font-semibold text-slate-700 shadow-sm transition dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-white/5 cursor-pointer active:scale-[0.97]"
                >
                  <svg className="h-3.5 w-3.5 sm:h-3 sm:w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Order Info</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPartyDetailsModalOpen(true)}
                  className="inline-flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-white px-2 py-1 sm:px-2 sm:py-1 text-2xs font-semibold text-slate-700 shadow-sm transition dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-white/5 cursor-pointer active:scale-[0.97]"
                >
                  <svg className="h-3.5 w-3.5 sm:h-3 sm:w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span>Party Info</span>
                </button>
              </div>

              {/* ── Action buttons bar ── */}
              <div className="mt-2 border-t border-slate-100 pt-2 dark:border-white/10">
                <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 font-sans font-medium">
                  {totalApproved > 0 && hasRemainingQty && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmResolveOpen(true)}
                      className="rounded-md bg-indigo-600 px-2 sm:px-2 py-0.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
                    >
                      Resolve Order
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!canReject || busy}
                    onClick={() => setTransitioningTo("finance_rejected")}
                    className="rounded-md bg-rose-600 px-2 sm:px-2 py-0.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={!canHold || busy}
                    onClick={() => setTransitioningTo("on_hold")}
                    className="rounded-md bg-amber-600 px-2 sm:px-2 py-0.5 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
                  >
                    Hold
                  </button>
                  <button
                    type="button"
                    disabled={status !== "on_hold" || busy}
                    onClick={() => setTransitioningTo("finance_review")}
                    className="rounded-md bg-blue-600 px-2 sm:px-2 py-0.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
                  >
                    Resume
                  </button>
                  <button
                    type="button"
                    disabled={!(status === "on_hold" || status === "dispatch_pending") || busy}
                    onClick={() => setTransitioningTo("cancelled")}
                    className="rounded-md bg-rose-600 px-2 sm:px-2 py-0.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
                  >
                    Cancel
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* ── DESKTOP: Independently Scrollable Tab Content ── */}
          <div className="hidden md:block flex-1 min-h-0 overflow-y-auto pr-1">


            {activeTab === "approvals" && (
              <ApprovalTab
                orderId={orderId}
                detail={detail}
                readOnlyItems={readOnlyItems}
                refetchOrder={handleRefetch}
                partyLabel={custLabel}
              />
            )}

            {activeTab === "dispatches" && (
              <DispatchesTab
                orderId={orderId}
                detail={detail}
                refetchOrder={handleRefetch}
              />
            )}

            {activeTab === "transports" && (
              <TransportsTab
                orderId={orderId}
                detail={detail}
                refetchOrder={handleRefetch}
              />
            )}

            {activeTab === "due_sheet" && (
              <DueSheetTab orderId={orderId} onUploadSuccess={handleRefetch} />
            )}

            {activeTab === "flags" && (
              <FlagsTab
                orderId={orderId}
                flagsQ={flagsQ}
                rawFlags={rawFlags}
                formatDate={formatDate}
                userNameById={userNameById}
                currentDepartment="finance"
                refetchOrder={handleRefetch}
              />
            )}

            {activeTab === "attachments" && (
              <AttachmentsTab
                orderId={orderId}
                attachments={attachments}
                isLoading={attachmentsQ.isFetching}
                onUploadSuccess={handleRefetch}
              />
            )}

            {activeTab === "reminders" && (
              <RemindersTab orderId={orderId} />
            )}
          </div>

          {/* ── DESKTOP: Fixed Footer Tab Nav ── */}
          <div className="hidden md:block mb-0 flex-shrink-0 border-t border-slate-100 dark:border-white/5 bg-slate-50/95 dark:bg-slate-955/90 backdrop-blur-md px-2 pt-1.5 pb-0 [&_nav]:pb-0">
            <OrderDetailTabsNav className="!mb-0 !rounded-none !border-0 !bg-transparent !p-0"
              tabs={[
                {
                  id: "approvals",
                  name: "Order Approval",
                  count: adminApprovalsCount,
                },
                { id: "dispatches", name: "Dispatches" },
                { id: "transports", name: "Transports" },
                { id: "due_sheet", name: "Due Sheet", count: dueSheetCount },
                {
                  id: "flags",
                  name: "Flags",
                  count: rawFlags.filter((f) => f.status === "open").length,
                  dangerBadge: true,
                },
                { id: "attachments", name: "Attachments", count: attachments.length },
                {
                  id: "reminders",
                  name: "Reminders",
                  count: reminders.filter((r: any) => r.status === "active").length,
                },
              ]}
              activeId={activeTab}
              onChange={(id) => setActiveTab(id as typeof activeTab)}
            />
          </div>

          {/* ── MOBILE: Full-screen tab content popup ── */}
          {mobileTabOpen && (
            <div className="md:hidden fixed inset-0 z-[60] flex flex-col bg-white dark:bg-slate-900 animate-in slide-in-from-bottom duration-300">
              {/* Mobile popup header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 sticky top-0 z-10">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-555 dark:text-slate-50 capitalize">
                  {activeTab === "approvals" && "Order Approval"}
                  {activeTab === "flags" && "Flags"}
                  {activeTab === "attachments" && "Attachments"}
                  {activeTab === "dispatches" && "Dispatches"}
                  {activeTab === "transports" && "Transports"}
                  {activeTab === "due_sheet" && "Due Sheet"}
                  {activeTab === "reminders" && "Reminders"}
                </h2>
                <button
                  type="button"
                  onClick={() => setMobileTabOpen(false)}
                  className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 transition active:scale-95"
                  aria-label="Close panel"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* Mobile popup scrollable content */}
              <div className="flex-1 overflow-y-auto p-4 pb-24">
                {activeTab === "flags" && (
                  <FlagsTab
                    orderId={orderId}
                    flagsQ={flagsQ}
                    rawFlags={rawFlags}
                    formatDate={formatDate}
                    userNameById={userNameById}
                    currentDepartment="finance"
                    refetchOrder={handleRefetch}
                  />
                )}
                {activeTab === "attachments" && (
                  <AttachmentsTab
                    orderId={orderId}
                    attachments={attachments}
                    isLoading={attachmentsQ.isFetching}
                    onUploadSuccess={handleRefetch}
                  />
                )}
                {activeTab === "approvals" && (
                  <ApprovalTab
                    orderId={orderId}
                    detail={detail}
                    readOnlyItems={readOnlyItems}
                    refetchOrder={handleRefetch}
                    partyLabel={custLabel}
                  />
                )}
                {activeTab === "dispatches" && (
                  <DispatchesTab
                    orderId={orderId}
                    detail={detail}
                    refetchOrder={handleRefetch}
                  />
                )}
                {activeTab === "transports" && (
                  <TransportsTab
                    orderId={orderId}
                    detail={detail}
                    refetchOrder={handleRefetch}
                  />
                )}
                {activeTab === "due_sheet" && (
                  <DueSheetTab orderId={orderId} onUploadSuccess={handleRefetch} />
                )}
                {activeTab === "reminders" && (
                  <RemindersTab orderId={orderId} />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MOBILE: Bottom-fixed Tab Navigation Bar ── */}
      {!isFetching && !isError && detail && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-2 pb-safe">
          <nav className="flex items-stretch justify-around">
            {([
              {
                id: "approvals" as const,
                name: "Approval",
                count: adminApprovalsCount,
                dangerBadge: false,
                icon: (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9h6m-6 4h6" />
                  </svg>
                ),
              },
              {
                id: "dispatches" as const,
                name: "Dispatch",
                count: undefined,
                dangerBadge: false,
                icon: (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                ),
              },
              {
                id: "transports" as const,
                name: "Transport",
                count: undefined,
                dangerBadge: false,
                icon: (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2.556-2.556M13 16H9m4 0h2m2 0h.01M13 16V6m0 0h3l3 4v6h-1M6 16H5m8-10H5" />
                  </svg>
                ),
              },
              {
                id: "due_sheet" as const,
                name: "Due",
                count: dueSheetCount,
                dangerBadge: false,
                icon: (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                ),
              },
              {
                id: "flags" as const,
                name: "Flags",
                count: rawFlags.filter((f) => f.status === "open").length,
                dangerBadge: true,
                icon: (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                  </svg>
                ),
              },
              {
                id: "attachments" as const,
                name: "Files",
                count: attachments.length,
                dangerBadge: false,
                icon: (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                ),
              },
              {
                id: "reminders" as const,
                name: "Reminders",
                count: reminders.filter((r: any) => r.status === "active").length,
                dangerBadge: false,
                icon: (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ),
              },
            ]).map((tab) => {
              const isActive = activeTab === tab.id && mobileTabOpen;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    if (activeTab === tab.id && mobileTabOpen) {
                      setMobileTabOpen(false);
                    } else {
                      setActiveTab(tab.id);
                      setMobileTabOpen(true);
                    }
                  }}
                  className={`relative flex flex-col items-center justify-center gap-0.5 py-2.5 px-2 flex-1 min-w-0 transition-colors ${isActive
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    }`}
                >
                  <span className={`relative transition-transform ${isActive ? "scale-110" : ""}`}>
                    {tab.icon}
                    {tab.count !== undefined && tab.count > 0 && (
                      <span
                        className={`absolute -top-1.5 -right-1.5 min-w-[1rem] h-4 flex items-center justify-center rounded-full px-1 text-2xs font-bold ${tab.dangerBadge
                            ? "bg-rose-500 text-white"
                            : "bg-slate-600 text-white dark:bg-slate-300 dark:text-slate-900"
                          }`}
                      >
                        {tab.count}
                      </span>
                    )}
                  </span>
                  <span className={`text-2xs font-semibold leading-none truncate max-w-full ${isActive ? "text-blue-600 dark:text-blue-400" : ""
                    }`}>
                    {tab.name}
                  </span>
                  {isActive && (
                    <span className="absolute top-0 left-2 right-2 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
