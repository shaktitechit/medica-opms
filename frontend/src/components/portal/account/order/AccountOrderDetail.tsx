/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  buildPartyNameById,
  buildPartySraById,
  checkOrderPartySra,
  resolveOrderCounterparty,
} from "@/components/portal/sales/partyDisplay";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/store/hooks";
import {
  useGetOrderQuery,
  useListPartiesQuery,
  useGetPartyQuery,
  useListUsersQuery,
  useListDispatchesQuery,
  useListTransportsQuery,
  useListOrderDeliveriesQuery,
  useListOrderReturnsQuery,
  useListOrderApprovalsQuery,
  useTransitionOrderMutation,
  useListFlagsQuery,
  useCreateFlagMutation,
  useListAttachmentsQuery,
  useGetOrderFulfillmentQuery,
} from "@/store/api";

import { buildUserNameById } from "@/components/portal/shared/userDisplay";
import { FlagsTab } from "./components/FlagsTab";
import AttachmentsTab from "./components/AttachmentsTab";
import { DispatchesTab } from "./components/DispatchesTab";
import { TransportsTab } from "./components/TransportsTab";
import { DeliveriesTab } from "./components/DeliveriesTab";
import { ReturnsTab } from "./components/ReturnsTab";
import { CloseAccountOrderModal } from "./components/CloseAccountOrderModal";
import { isOrderClosed } from "@/components/portal/sales/orderUtils";
import { canSettleAccountOrder, filterReturnsReceivedAtWarehouse } from "@/components/portal/shared/returnSettlement";
import { ApprovalTab } from "./components/ApprovalTab";
import {
  filterAccountApprovalsForUser,
  hasAccountDispatchReleases,
  idFromRef,
} from "./components/accountDispatchAvailability";

import { ALL_FLAG_TYPES, FLAGS_FOR_TARGET_DEPARTMENT } from "@/components/portal/shared/flagTypes";
import { OrderDetailTabsNav } from "@/components/portal/shared/OrderDetailTabsNav";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import { OrderDepartmentFulfillmentPanel } from "@/components/portal/shared/OrderDepartmentFulfillmentPanel";
import {
  OrderFulfillmentPipelineStrip,
  buildOrderFulfillmentPipelineSteps,
  DEFAULT_ORDER_PIPELINE_ICONS,
} from "@/components/portal/shared/FulfillmentCircleStep";
import { computeDepartmentStageBoxes } from "@/components/portal/shared/orderDepartmentStages";
import { AlertTriangle } from "lucide-react";
import OrderDetailsModal from "./components/OrderDetailsModal";
import PartyDetailsModal from "./components/PartyDetailsModal";
import FinalOrderStatementModal from "@/components/portal/shared/FinalOrderStatementModal";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-955 dark:text-slate-555 dark:text-slate-50";
const labelClass = "text-xs font-semibold text-slate-700 dark:text-slate-300";
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

function renderPriorityBadge(priority: string) {
  const p = String(priority || "normal").toLowerCase();
  if (p === "urgent") {
    return (
      <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700 ring-1 ring-inset ring-rose-700/10 dark:bg-rose-955/30 dark:text-rose-455/90 dark:ring-rose-500/25">
        Urgent
      </span>
    );
  }
  if (p === "high") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-inset ring-amber-700/10 dark:bg-amber-955/30 dark:text-amber-455/90 dark:ring-amber-500/20">
        High
      </span>
    );
  }
  if (p === "normal") {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-955/30 dark:text-blue-455/90 dark:ring-blue-500/20">
        Normal
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 ring-1 ring-inset ring-slate-500/10 dark:bg-white/5 dark:text-slate-400 dark:ring-white/10">
      Low
    </span>
  );
}

export default function AccountOrderDetail({ orderId }: { orderId: string }) {
  const router = useRouter();
  const currentUser = useAppSelector((state) => state.auth.user);
  const currentUserId = useMemo(() => {
    return String(currentUser?._id ?? currentUser?.id ?? "");
  }, [currentUser]);

  const { data, isLoading, isFetching, isError, refetch } = useGetOrderQuery(orderId);
  const partiesQ = useListPartiesQuery({});
  const usersQ = useListUsersQuery({});
  const fulfillmentQ = useGetOrderFulfillmentQuery(orderId);
  const dispatchesQ = useListDispatchesQuery({ order: orderId });
  const transportsQ = useListTransportsQuery({ order: orderId });
  const deliveriesQ = useListOrderDeliveriesQuery({ order: orderId });
  const returnsQ = useListOrderReturnsQuery({ order: orderId });
  const approvalsQ = useListOrderApprovalsQuery(
    { order: orderId },
    { skip: !orderId },
  );
  const detail =
    data && typeof data === "object"
      ? (data as Record<string, unknown>)
      : null;
  const status = deriveOrderWorkflowStatus(detail);

  const userNameById = useMemo(
    () => buildUserNameById(usersQ.data),
    [usersQ.data],
  );

  const users = useMemo(() => {
    return pickList(usersQ.data) as Record<string, unknown>[];
  }, [usersQ.data]);

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
      const found = users.find((u) => String(u._id ?? u.id ?? "") === userId);
      if (found) {
        return {
          name: String(found.name || found.username || "—"),
          phone: String(found.phone || ""),
        };
      }
      return { name: "—", phone: "" };
    },
    [users]
  );

  const createdBy = useMemo(() => {
    const id = detailRefId(detail?.created_by);
    return (id && userNameById[id]) || "Admin";
  }, [detail, userNameById]);

  const fulfillmentSnapshot = useMemo(
    () =>
      fulfillmentQ.data && typeof fulfillmentQ.data === "object"
        ? (fulfillmentQ.data as Record<string, unknown>)
        : null,
    [fulfillmentQ.data],
  );

  const isAssignedToMe = useMemo(() => {
    if (!detail || !currentUserId) return false;
    if (idFromRef(detail.assigned_account_user) === currentUserId) return true;
    const dept = String(detail.current_department ?? detail.pending_with_role ?? "");
    return dept === "account" && idFromRef(detail.current_assignee) === currentUserId;
  }, [detail, currentUserId]);

  const currentPartyId = useMemo(() => {
    return detail ? detailRefId(detail.party) : "";
  }, [detail]);

  const partyDetailQ = useGetPartyQuery(currentPartyId, {
    skip: !currentPartyId,
  });

  const [transitionOrder, { isLoading: isSubmitting }] =
    useTransitionOrderMutation();
  const [transitioningTo, setTransitioningTo] = useState<string | null>(null);
  const [transitionRemarks, setTransitionRemarks] = useState("");

  const [activeTab, setActiveTab] = useState<
    | "approvals"
    | "dispatches"
    | "transports"
    | "deliveries"
    | "returns"
    | "flags"
    | "attachments"
  >("approvals");
  const [mobileTabOpen, setMobileTabOpen] = useState(false);

  // Flags raise state
  const [showRaiseFlagModal, setShowRaiseFlagModal] = useState(false);
  const [newFlagDept, setNewFlagDept] = useState("sales");
  const [newFlagType, setNewFlagType] = useState("urgent");
  const [newFlagSeverity, setNewFlagSeverity] = useState("medium");
  const [newFlagTitle, setNewFlagTitle] = useState("");
  const [newFlagDesc, setNewFlagDesc] = useState("");
  const [newFlagDueDate, setNewFlagDueDate] = useState("");

  const [createFlag, { isLoading: isCreatingFlag }] = useCreateFlagMutation();

  const handleRaiseFlag = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!orderId || !newFlagTitle.trim()) return;

      try {
        await createFlag({
          order: orderId,
          flag_type: newFlagType,
          severity: newFlagSeverity,
          title: newFlagTitle.trim(),
          description: newFlagDesc.trim(),
          blocks_order: false,
          department: newFlagDept,
          due_date: newFlagDueDate ? new Date(newFlagDueDate).toISOString() : undefined,
        }).unwrap();

        toast.success("Flag raised successfully.");
        setShowRaiseFlagModal(false);
        setNewFlagTitle("");
        setNewFlagDesc("");
        setNewFlagType("urgent");
        setNewFlagSeverity("medium");
        setNewFlagDept("sales");
        setNewFlagDueDate("");
        refetch();
      } catch (err) {
        toast.error(mutationRejectedMessage(err));
      }
    },
    [
      orderId,
      newFlagType,
      newFlagSeverity,
      newFlagTitle,
      newFlagDesc,
      newFlagDept,
      newFlagDueDate,
      createFlag,
      refetch,
    ],
  );

  // Attachment count
  const attachQ = useListAttachmentsQuery({
    entity_type: "order",
    entity_id: orderId,
  });
  const attachCount = useMemo(
    () => pickList(attachQ.data).length,
    [attachQ.data],
  );

  const dispatches = useMemo(() => pickList(dispatchesQ.data), [dispatchesQ.data]);
  const transports = useMemo(() => pickList(transportsQ.data), [transportsQ.data]);
  const deliveries = useMemo(() => pickList(deliveriesQ.data), [deliveriesQ.data]);
  const returns = useMemo(() => pickList(returnsQ.data), [returnsQ.data]);
  const accountApprovals = useMemo(() => {
    return filterAccountApprovalsForUser(pickList(approvalsQ.data));
  }, [approvalsQ.data]);

  const handleRefetch = useCallback(() => {
    refetch();
    if (!fulfillmentQ.isUninitialized) fulfillmentQ.refetch();
    if (!attachQ.isUninitialized) attachQ.refetch();
    if (!dispatchesQ.isUninitialized) void dispatchesQ.refetch();
    if (!transportsQ.isUninitialized) void transportsQ.refetch();
    if (!deliveriesQ.isUninitialized) void deliveriesQ.refetch();
    if (!returnsQ.isUninitialized) void returnsQ.refetch();
    if (!approvalsQ.isUninitialized) void approvalsQ.refetch();
  }, [refetch, fulfillmentQ, attachQ, dispatchesQ, transportsQ, deliveriesQ, returnsQ, approvalsQ]);

  const onSettleAndCloseSuccess = useCallback(async () => {
    handleRefetch();
  }, [handleRefetch]);

  // Handle order transition
  const handleTransition = useCallback(
    async (nextStatus: string) => {
      try {
        await transitionOrder({
          id: orderId,
          body: {
            next_status: nextStatus,
            remarks: transitionRemarks.trim() || undefined,
          },
        }).unwrap();
        toast.success(`Order successfully transitioned to ${nextStatus.split("_").join(" ")}`);
        setTransitioningTo(null);
        setTransitionRemarks("");
        handleRefetch();
      } catch (rejected) {
        toast.error(mutationRejectedMessage(rejected));
      }
    },
    [orderId, transitionRemarks, transitionOrder, handleRefetch],
  );

  const partyNameById = useMemo(
    () => buildPartyNameById(partiesQ.data),
    [partiesQ.data],
  );
  const partySraById = useMemo(
    () => buildPartySraById(partiesQ.data),
    [partiesQ.data],
  );

  const custLabel = detail
    ? resolveOrderCounterparty(detail, partyNameById)
    : "—";

  const orderNo = detail
    ? String(detail.order_no || detail.order_number || `ID: ${orderId.slice(0, 8)}`)
    : "";

  const stageBoxes = useMemo(
    () =>
      computeDepartmentStageBoxes(detail, fulfillmentSnapshot, {
        returns,
        dispatches,
      }),
    [detail, fulfillmentSnapshot, returns, dispatches],
  );

  const orderItems = useMemo(() => {
    if (!detail || !Array.isArray(detail.order_items)) return [];
    return detail.order_items as Record<string, unknown>[];
  }, [detail]);

  const orderKpis = useMemo(() => {
    const totals =
      fulfillmentSnapshot?.totals && typeof fulfillmentSnapshot.totals === "object"
        ? (fulfillmentSnapshot.totals as Record<string, unknown>)
        : null;

    const totalQty = Number(totals?.ordered ?? orderItems.reduce(
      (sum, line) => sum + Number(line.ordered_quantity ?? line.quantity ?? 0),
      0,
    ));
    const adminApprovedQty = Number(
      totals?.salesApproved ??
        orderItems.reduce((sum, line) => {
          const sales = Number(line.sales_approved_quantity ?? 0);
          if (sales > 0) return sum + sales;
          return sum + Number(line.approved_quantity || 0);
        }, 0),
    );
    const financeApprovedQty = Number(
      totals?.approved ??
        orderItems.reduce(
          (sum, line) => sum + Number(line.approved_quantity || 0),
          0,
        ),
    );
    const dispatchedQty = Number(totals?.dispatched ?? orderItems.reduce(
      (sum, line) => sum + Number(line.dispatched_quantity || 0),
      0,
    ));

    return {
      totalQty,
      adminApprovedQty,
      financeApprovedQty,
      dispatchedQty,
    };
  }, [fulfillmentSnapshot, orderItems]);

  const pipelineSteps = useMemo(
    () =>
      buildOrderFulfillmentPipelineSteps(stageBoxes, DEFAULT_ORDER_PIPELINE_ICONS, {
        defaultTotal: orderKpis.totalQty,
      }),
    [stageBoxes, orderKpis.totalQty],
  );

  // Flags count
  const flagsQ = useListFlagsQuery({ order: orderId });
  const openFlags = useMemo(() => {
    const list = pickList(flagsQ.data);
    return list.filter((f) => f.status === "open" || f.status === "in_progress");
  }, [flagsQ.data]);

  const rawFlags = useMemo(() => {
    return pickList(flagsQ.data) as Record<string, unknown>[];
  }, [flagsQ.data]);

  // Modal Overlay States
  const [isFulfillmentModalOpen, setIsFulfillmentModalOpen] = useState(false);
  const [isOrderDetailsModalOpen, setIsOrderDetailsModalOpen] = useState(false);
  const [isPartyDetailsModalOpen, setIsPartyDetailsModalOpen] = useState(false);
  const [isFinalStatementOpen, setIsFinalStatementOpen] = useState(false);
  const [isCloseSettleOpen, setIsCloseSettleOpen] = useState(false);

  const orderIsAccountClosed = useMemo(() => isOrderClosed(detail), [detail]);

  const receivedReturns = useMemo(
    () => filterReturnsReceivedAtWarehouse(returns),
    [returns],
  );

  const hasDispatchReleases = useMemo(
    () => hasAccountDispatchReleases(accountApprovals, dispatches),
    [accountApprovals, dispatches],
  );

  const canSettleOrder = useMemo(
    () => canSettleAccountOrder(detail, returns),
    [detail, returns],
  );

  const canActivateSettleClose = hasDispatchReleases && canSettleOrder;

  // Can this user perform actions?
  const canPerformAction = useMemo(() => {
    if (!detail) return false;
    const isAdminApproved = Boolean(detail.is_admin_approved);
    const isFinanceApproved =
      Boolean(detail.is_finance_approved) ||
      ["fully_finance_approved", "partially_finance_approved"].includes(status);
    return (
      isAdminApproved &&
      isFinanceApproved &&
      ["fully_finance_approved", "partially_finance_approved", "on_hold"].includes(status)
    );
  }, [detail, status]);

  const busy = isSubmitting;

  if (isError || (!isLoading && !detail)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-4 font-sans">
        <AlertTriangle className="h-10 w-10 text-red-500 mb-2" />
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
          Failed to load order
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
          The order record could not be found or you have insufficient access permissions.
        </p>
        <button
          type="button"
          onClick={() => router.push("/account/orders")}
          className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue-650 hover:underline dark:text-blue-400"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Orders
        </button>
      </div>
    );
  }

  if (!detail) {
    return <PortalBusyOverlay active message="Loading order details…" />;
  }

  return (
    <div className="h-[calc(100vh-150px)] md:h-[calc(100vh-160px)] flex flex-col min-h-0 overflow-hidden space-y-0 pb-20 md:pb-0 font-sans select-none">
      {/* Transitions Dialog */}
      {transitioningTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-xl border border-slate-200/90 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-555 dark:text-slate-50 capitalize">
              Transition to {transitioningTo.replace("_", " ")}
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Confirm transition and add comments.
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 font-sans">
                  Remarks / Action Notes (Optional)
                </label>
                <textarea
                  value={transitionRemarks}
                  onChange={(e) => setTransitionRemarks(e.target.value)}
                  rows={3}
                  className="w-full mt-1.5 rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-955 dark:text-slate-555 dark:text-slate-50 font-sans"
                  placeholder="Provide notes or reasons for this clearance transition..."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 font-sans font-medium">
              <button
                type="button"
                onClick={() => {
                  setTransitioningTo(null);
                  setTransitionRemarks("");
                }}
                className="rounded-lg border border-slate-200/95 px-3 py-2 text-sm text-slate-800 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleTransition(transitioningTo)}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white shadow-sm transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item Fulfillment Details Modal */}
      {isFulfillmentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-4xl rounded-xl border border-slate-200/90 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900 transition-all max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5 font-sans">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                Item Fulfillment Details
              </h3>
              <button
                type="button"
                onClick={() => setIsFulfillmentModalOpen(false)}
                className="rounded-md text-slate-400 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 p-1 cursor-pointer"
              >
                <span className="sr-only">Close</span>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="mt-4 overflow-y-auto flex-1 pr-1">
              <OrderDepartmentFulfillmentPanel
                order={detail}
                fulfillmentSnapshot={fulfillmentSnapshot}
                returns={returns}
                dispatches={dispatches}
                showDepartmentBoxes={false}
                showItemsTable={true}
              />
            </div>

            <div className="mt-5 flex justify-end border-t border-slate-100 pt-3 dark:border-white/5">
              <button
                type="button"
                onClick={() => setIsFulfillmentModalOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/5 cursor-pointer font-sans"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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

      <FinalOrderStatementModal
        orderId={orderId}
        isOpen={isFinalStatementOpen}
        onClose={() => setIsFinalStatementOpen(false)}
      />

      {isCloseSettleOpen && (
        <CloseAccountOrderModal
          orderId={orderId}
          returnRecord={receivedReturns[0] ?? null}
          detail={detail}
          allReturns={returns}
          approvals={accountApprovals}
          dispatches={dispatches}
          onClose={() => setIsCloseSettleOpen(false)}
          onSuccess={onSettleAndCloseSuccess}
        />
      )}



      {/* Assignment warning banner */}
      {/* {!canPerformAction && !orderIsAccountClosed && status !== "cancelled" && (
        <div className="rounded-xl border border-amber-200/50 bg-amber-50/70 p-4 text-xs font-medium text-amber-800 dark:border-amber-900/30 dark:bg-amber-955/20 dark:text-amber-400 flex items-start gap-3 flex-shrink-0">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold">Awaiting prior clearance</h4>
            <p className="mt-1 leading-relaxed">
              Account actions unlock after admin and finance have approved this order.
            </p>
          </div>
        </div>
      )} */}

      {/* Order Main Content */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-shrink-0 space-y-1">
          <div className="rounded-lg border border-slate-200/80 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-slate-900">
            {/* ── Top row: order details + inline fulfillment pipeline ── */}
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                  <button type="button" onClick={() => router.push("/account/orders")} className="font-medium text-blue-600 hover:underline dark:text-blue-400">Orders</button>
                  <span>/</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">Order Details</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <h1 className="truncate text-base sm:text-lg font-bold tracking-tight text-slate-950 dark:text-slate-50">{orderNo}</h1>
                  <span className="shrink-0">{renderPriorityBadge(typeof detail.priority === "string" ? detail.priority : "normal")}</span>
                </div>
                <div className="mt-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    Party: <b className="font-semibold text-slate-700 dark:text-slate-200">{custLabel}</b>
                    {detail && (checkOrderPartySra(detail, partySraById) || (partyDetailQ.data as any)?.sra === true) && (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-400 shrink-0">
                        SRA
                      </span>
                    )}
                  </span>
                  <span>Date: {formatDateShort(detail.order_date)}</span>
                  <span>EDD: {formatDateShort(detail.expected_delivery_date)}</span>
                </div>
              </div>

              <div className="flex min-w-0 items-center gap-1.5 lg:shrink-0">
                <div className="min-w-0 flex-1 overflow-x-auto lg:flex-none lg:min-w-[420px]">
                  <OrderFulfillmentPipelineStrip steps={pipelineSteps} size="sm" />
                </div>
                <button type="button" onClick={() => setIsFulfillmentModalOpen(true)} className="shrink-0 rounded-md border border-amber-200/80 bg-white px-1.5 py-0.5 text-[9px] font-bold text-amber-600 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-950 dark:text-amber-400 dark:hover:bg-white/5" title="Fulfillment details">Details</button>
                <button type="button" onClick={handleRefetch} className="shrink-0 rounded-md border border-slate-200/95 p-1 text-slate-500 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/5" title="Refresh">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
              </div>
            </div>

            {/* ── Info buttons ── */}
            <div className="mt-1 grid grid-cols-2 gap-1 sm:flex sm:flex-wrap sm:gap-1.5 font-sans font-medium">
              <button type="button" onClick={() => setIsOrderDetailsModalOpen(true)} className="inline-flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-white px-2 py-1 sm:px-2 sm:py-1 text-[10px] font-semibold text-slate-700 shadow-sm transition dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-white/5 cursor-pointer active:scale-[0.97]">
                <svg className="h-3.5 w-3.5 sm:h-3 sm:w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <span>Order Info</span>
              </button>
              <button type="button" onClick={() => setIsPartyDetailsModalOpen(true)} className="inline-flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-white px-2 py-1 sm:px-2 sm:py-1 text-[10px] font-semibold text-slate-700 shadow-sm transition dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-white/5 cursor-pointer active:scale-[0.97]">
                <svg className="h-3.5 w-3.5 sm:h-3 sm:w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                <span>Party Info</span>
              </button>
              {orderIsAccountClosed && (
                <button type="button" onClick={() => setIsFinalStatementOpen(true)} className="inline-flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-1 rounded-md border border-emerald-200 bg-emerald-50 hover:bg-emerald-100/80 px-2 py-1 sm:px-2 sm:py-1 text-[10px] font-semibold text-emerald-800 shadow-sm transition dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/50 cursor-pointer active:scale-[0.97]">
                  <svg className="h-3.5 w-3.5 sm:h-3 sm:w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  <span>Final Order Statement</span>
                </button>
              )}
            </div>

            {/* ── Action buttons bar ── */}
            <div className="mt-2 border-t border-slate-100 pt-2 dark:border-white/10">
              <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 font-sans font-medium">
                {!orderIsAccountClosed && (
                  <button
                    type="button"
                    disabled={!canActivateSettleClose || busy}
                    onClick={() => setIsCloseSettleOpen(true)}
                    title={
                      !hasDispatchReleases
                        ? "Record dispatch against a finance release to enable settle & close"
                        : !canSettleOrder
                          ? "Pending returns must be received at warehouse before settling"
                          : undefined
                    }
                    className="rounded-md bg-emerald-600 px-2 sm:px-2 py-0.5 text-[11px] font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98] dark:bg-emerald-500 dark:hover:bg-emerald-400 disabled:hover:bg-emerald-600"
                  >
                    Settle & Close
                  </button>
                )}
                {status !== "on_hold" && (
                  <button type="button" disabled={!canPerformAction || busy} onClick={() => setTransitioningTo("on_hold")} className="rounded-md bg-amber-600 px-2 sm:px-2 py-0.5 text-[11px] font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]">Hold</button>
                )}
                <button type="button" disabled={!canPerformAction || busy} onClick={() => setTransitioningTo("cancelled")} className="rounded-md bg-rose-600 px-2 sm:px-2 py-0.5 text-[11px] font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]">Cancel</button>
              </div>
            </div>
          </div>
        </div>

      {/* DESKTOP: Independently Scrollable Tab Content */}
      <div className="hidden md:block flex-1 min-h-0 overflow-y-auto pr-1">
        {activeTab === "approvals" && (
          <ApprovalTab
            orderId={orderId}
            detail={detail}
            readOnlyItems={orderItems}
            refetchOrder={handleRefetch}
            partyLabel={custLabel}
          />
        )}

        {activeTab === "dispatches" && (
          <DispatchesTab
            orderId={orderId}
            detail={detail}
            refetchOrder={handleRefetch}
            partyLabel={custLabel}
            isAssignedToMe={isAssignedToMe}
          />
        )}

        {activeTab === "transports" && (
          <TransportsTab
            orderId={orderId}
            detail={detail}
            refetchOrder={handleRefetch}
          />
        )}

        {activeTab === "deliveries" && (
          <DeliveriesTab
            orderId={orderId}
            detail={detail}
            refetchOrder={handleRefetch}
          />
        )}

        {activeTab === "returns" && (
          <ReturnsTab
            orderId={orderId}
            detail={detail}
          />
        )}

        {activeTab === "flags" && (
          <FlagsTab
            orderId={orderId}
            flagsQ={flagsQ}
            rawFlags={rawFlags}
            formatDate={formatDate}
            userNameById={userNameById}
            setShowRaiseFlagModal={setShowRaiseFlagModal}
            currentDepartment="account"
            refetchOrder={handleRefetch}
          />
        )}

        {activeTab === "attachments" && (
          <AttachmentsTab
            orderId={orderId}
            attachments={pickList(attachQ.data)}
            isLoading={attachQ.isFetching}
            onUploadSuccess={handleRefetch}
          />
        )}
      </div>

      {/* DESKTOP: Fixed Footer Tab Nav */}
      <div className="hidden md:block mb-0 flex-shrink-0 border-t border-slate-100 dark:border-white/5 bg-slate-50/95 dark:bg-slate-955/90 backdrop-blur-md px-2 pt-1.5 pb-0 [&_nav]:pb-0">
        <OrderDetailTabsNav className="!mb-0 !rounded-none !border-0 !bg-transparent !p-0"
          tabs={[
            {
              id: "approvals",
              name: "Approvals",
              count: accountApprovals.length,
            },
            {
              id: "dispatches",
              name: "Dispatches",
              count: dispatches.length,
            },
            {
              id: "transports",
              name: "Transports",
              count: transports.length,
            },
            {
              id: "deliveries",
              name: "Deliveries",
              count: deliveries.length,
            },
            {
              id: "returns",
              name: "Returns",
              count: returns.length,
            },
            {
              id: "flags",
              name: "Flags",
              count: rawFlags.filter((f) => f.status === "open").length,
              dangerBadge: true,
            },
            {
              id: "attachments",
              name: "Attachments",
              count: attachCount,
            },
          ]}
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as typeof activeTab)}
        />
      </div>

      {/* MOBILE: Full-screen tab content popup */}
      {mobileTabOpen && (
        <div className="md:hidden fixed inset-0 z-[60] flex flex-col bg-white dark:bg-slate-900 animate-in slide-in-from-bottom duration-300">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 sticky top-0 z-10">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-550 capitalize">
              {activeTab === "approvals" && "Order Approvals"}
              {activeTab === "flags" && "Flags"}
              {activeTab === "attachments" && "Attachments"}
              {activeTab === "dispatches" && "Dispatches"}
              {activeTab === "transports" && "Transports"}
              {activeTab === "deliveries" && "Deliveries"}
              {activeTab === "returns" && "Returns"}
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

          <div className="flex-1 overflow-y-auto p-4 pb-24">
            {activeTab === "approvals" && (
              <ApprovalTab
                orderId={orderId}
                detail={detail}
                readOnlyItems={orderItems}
                refetchOrder={handleRefetch}
                partyLabel={custLabel}
              />
            )}
            {activeTab === "dispatches" && (
              <DispatchesTab
                orderId={orderId}
                detail={detail}
                refetchOrder={handleRefetch}
                partyLabel={custLabel}
                isAssignedToMe={isAssignedToMe}
              />
            )}
            {activeTab === "transports" && (
              <TransportsTab
                orderId={orderId}
                detail={detail}
                refetchOrder={handleRefetch}
              />
            )}
            {activeTab === "deliveries" && (
              <DeliveriesTab
                orderId={orderId}
                detail={detail}
                refetchOrder={handleRefetch}
              />
            )}
            {activeTab === "returns" && (
              <ReturnsTab
                orderId={orderId}
                detail={detail}
              />
            )}
            {activeTab === "flags" && (
              <FlagsTab
                orderId={orderId}
                flagsQ={flagsQ}
                rawFlags={rawFlags}
                formatDate={formatDate}
                userNameById={userNameById}
                setShowRaiseFlagModal={setShowRaiseFlagModal}
                currentDepartment="account"
                refetchOrder={handleRefetch}
              />
            )}
            {activeTab === "attachments" && (
              <AttachmentsTab
                orderId={orderId}
                attachments={pickList(attachQ.data)}
                isLoading={attachQ.isFetching}
                onUploadSuccess={handleRefetch}
              />
            )}
          </div>
        </div>
      )}

      {/* MOBILE: Bottom-fixed Tab Navigation Bar */}
      {!isFetching && !isError && detail && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-2 pb-safe">
          <nav className="flex items-stretch justify-around">
            {([
              {
                id: "approvals" as const,
                name: "Approvals",
                count: accountApprovals.length,
                dangerBadge: false,
                icon: (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ),
              },
              {
                id: "dispatches" as const,
                name: "Dispatch",
                count: dispatches.length,
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
                count: transports.length,
                dangerBadge: false,
                icon: (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2.556-2.556M13 16H9m4 0h2m2 0h.01M13 16V6m0 0h3l3 4v6h-1M6 16H5m8-10H5" />
                  </svg>
                ),
              },
              {
                id: "deliveries" as const,
                name: "Delivery",
                count: deliveries.length,
                dangerBadge: false,
                icon: (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                ),
              },
              {
                id: "returns" as const,
                name: "Return",
                count: returns.length,
                dangerBadge: false,
                icon: (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
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
                count: attachCount,
                dangerBadge: false,
                icon: (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
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
                  className={`relative flex flex-col items-center justify-center gap-0.5 py-2.5 px-2 flex-1 min-w-0 transition-colors ${
                    isActive
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  }`}
                >
                  <span className={`relative transition-transform ${isActive ? "scale-110" : ""}`}>
                    {tab.icon}
                    {tab.count !== undefined && tab.count > 0 && (
                      <span
                        className={`absolute -top-1.5 -right-1.5 min-w-[1rem] h-4 flex items-center justify-center rounded-full px-1 text-[9px] font-bold ${
                          tab.dangerBadge
                            ? "bg-rose-500 text-white"
                            : "bg-slate-600 text-white dark:bg-slate-300 dark:text-slate-900"
                        }`}
                      >
                        {tab.count}
                      </span>
                    )}
                  </span>
                  <span className={`text-[10px] font-semibold leading-none truncate max-w-full ${
                    isActive ? "text-blue-600 dark:text-blue-400" : ""
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

      {/* Close main flex wrapper */}
      </div>

      {/* Raise Flag Modal overlay */}
      {showRaiseFlagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-lg rounded-xl border border-slate-200/90 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <h3 className="text-lg font-semibold text-slate-950 dark:text-slate-50">
                Raise Departmental Flag
              </h3>
              <button
                type="button"
                onClick={() => setShowRaiseFlagModal(false)}
                className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-350 dark:hover:text-slate-300"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={(e) => void handleRaiseFlag(e)} className="mt-4 space-y-4 font-sans text-xs">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="flag-dept" className={labelClass}>Target Department</label>
                  <select
                    id="flag-dept"
                    value={newFlagDept}
                    onChange={(e) => setNewFlagDept(e.target.value)}
                    className={inputClass}
                    required
                  >
                    {Object.entries(departmentLabels)
                      .filter(([val]) => val !== "account")
                      .map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="flag-type" className={labelClass}>Flag Type</label>
                  <select
                    id="flag-type"
                    value={newFlagType}
                    onChange={(e) => setNewFlagType(e.target.value)}
                    className={inputClass}
                    required
                  >
                    {(FLAGS_FOR_TARGET_DEPARTMENT[newFlagDept] ?? Object.keys(ALL_FLAG_TYPES)).map((val) => (
                      <option key={val} value={val}>
                        {ALL_FLAG_TYPES[val]?.label || val}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="flag-severity" className={labelClass}>Severity</label>
                  <select
                    id="flag-severity"
                    value={newFlagSeverity}
                    onChange={(e) => setNewFlagSeverity(e.target.value)}
                    className={inputClass}
                    required
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="flag-due" className={labelClass}>Due Date (Optional)</label>
                  <input
                    id="flag-due"
                    type="date"
                    value={newFlagDueDate}
                    onChange={(e) => setNewFlagDueDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="flag-title" className={labelClass}>Flag Title</label>
                <input
                  id="flag-title"
                  type="text"
                  value={newFlagTitle}
                  onChange={(e) => setNewFlagTitle(e.target.value)}
                  className={inputClass}
                  placeholder="E.g., Missing delivery address details"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="flag-desc" className={labelClass}>Description / Instructions</label>
                <textarea
                  id="flag-desc"
                  rows={3}
                  value={newFlagDesc}
                  onChange={(e) => setNewFlagDesc(e.target.value)}
                  className={inputClass}
                  placeholder="Add detailed context for the assigned department..."
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-white/5 font-sans font-medium">
                <button
                  type="button"
                  onClick={() => setShowRaiseFlagModal(false)}
                  className={btnSecondaryClass}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingFlag}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
                >
                  {isCreatingFlag ? "Raising Flag..." : "Raise Flag"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
