/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  buildPartyNameById,
  resolveOrderCounterparty,
} from "@/components/portal/sales/partyDisplay";
import {
  mutationRejectedMessage,
} from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
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
  useCreateOrderFinanceApprovalMutation,
  useApproveOrderFinanceApprovalMutation,
  useRejectOrderFinanceApprovalMutation,
  useListOrderFinanceApprovalsQuery,
  useGetOrderFulfillmentQuery,
} from "@/store/api";

import { FlagsTab } from "./components/FlagsTab";
import AttachmentsTab from "./components/AttachmentsTab";
import { ApprovalAllocationsTab } from "./components/ApprovalAllocationsTab";
import { DispatchesTab } from "./components/DispatchesTab";
import { TransportsTab } from "./components/TransportsTab";

import { ALL_FLAG_TYPES, FLAGS_FOR_TARGET_DEPARTMENT } from "@/components/portal/shared/flagTypes";
import { OrderDetailTabsNav } from "@/components/portal/shared/OrderDetailTabsNav";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import {
  computeFinanceApprovalCapabilities,
  orderHasDispatchReviewHandoff,
} from "@/components/portal/shared/financeApprovalStatus";
import { OrderDepartmentFulfillmentPanel } from "@/components/portal/shared/OrderDepartmentFulfillmentPanel";
import { FulfillmentCircleStep } from "@/components/portal/shared/FulfillmentCircleStep";
import { computeDepartmentStageBoxes } from "@/components/portal/shared/orderDepartmentStages";
import { UserCheck, DollarSign, Package, Truck } from "lucide-react";
import OrderDetailsModal from "./components/OrderDetailsModal";
import PartyDetailsModal from "./components/PartyDetailsModal";
import OrderItemsModal from "./components/OrderItemsModal";

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

export default function FinanceOrderDetail({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { data, isFetching, isError, refetch } = useGetOrderQuery(orderId);
  const partiesQ = useListPartiesQuery({});
  const financeApprovalsQ = useListOrderFinanceApprovalsQuery({ order: orderId });
  const fulfillmentQ = useGetOrderFulfillmentQuery(orderId);

  const detail =
    data && typeof data === "object"
      ? (data as Record<string, unknown>)
      : null;
  const status = deriveOrderWorkflowStatus(detail);

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

  const currentPartyId = useMemo(() => {
    return detail ? detailRefId(detail.party) : "";
  }, [detail]);

  const partyDetailQ = useGetPartyQuery(currentPartyId, {
    skip: !currentPartyId,
  });

  const [transitionOrder, { isLoading: isSubmitting }] =
    useTransitionOrderMutation();
  const [createFinanceApproval] = useCreateOrderFinanceApprovalMutation();
  const [approveFinanceApproval] = useApproveOrderFinanceApprovalMutation();
  const [rejectFinanceApproval] = useRejectOrderFinanceApprovalMutation();

  const [transitioningTo, setTransitioningTo] = useState<string | null>(null);
  const [transitionRemarks, setTransitionRemarks] = useState("");

  const [activeTab, setActiveTab] = useState<"flags" | "attachments" | "approval_allocations" | "dispatches" | "transports">("approval_allocations");
  const [mobileTabOpen, setMobileTabOpen] = useState(false);

  // Order Patch Mutation
  const [patchOrder, { isLoading: isPatching }] = usePatchOrderMutation();

  // Approve & Dispatch state
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [dispatchRemarks, setDispatchRemarks] = useState("");
  const [dispatchAssignee, setDispatchAssignee] = useState("");
  const [dispatchUploadFile, setDispatchUploadFile] = useState<File | null>(null);
  const [isApprovingAndDispatching, setIsApprovingAndDispatching] = useState(false);

  const [showRaiseFlagModal, setShowRaiseFlagModal] = useState(false);
  const [newFlagDept, setNewFlagDept] = useState("sales");
  const [newFlagType, setNewFlagType] = useState("urgent");
  const [newFlagSeverity, setNewFlagSeverity] = useState("medium");
  const [newFlagTitle, setNewFlagTitle] = useState("");
  const [newFlagDesc, setNewFlagDesc] = useState("");
  const [newFlagDueDate, setNewFlagDueDate] = useState("");

  useEffect(() => {
    const allowed = FLAGS_FOR_TARGET_DEPARTMENT[newFlagDept] || [];
    if (allowed.length > 0 && !allowed.includes(newFlagType)) {
      setNewFlagType(allowed[0]);
    }
  }, [newFlagDept]);
  const [createAttachment] = useCreateAttachmentMutation();

  const flagsQ = useListFlagsQuery({ order: orderId });
  const [createFlag, { isLoading: isCreatingFlag }] = useCreateFlagMutation();
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

  const usersQ = useListUsersQuery({});
  const users = useMemo(() => {
    const list = pickList(usersQ.data);
    return list as Record<string, unknown>[];
  }, [usersQ.data]);

  // Modular Modals Overlay states
  const [isFulfillmentModalOpen, setIsFulfillmentModalOpen] = useState(false);
  const [isOrderItemsModalOpen, setIsOrderItemsModalOpen] = useState(false);
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

  // Filtered operators
  const dispatchUsers = useMemo(() => {
    return users.filter(
      (u) =>
        String(u.department).toLowerCase() === "dispatch" ||
        String(u.role).toLowerCase() === "dispatch_operator"
    );
  }, [users]);

  const readOnlyItems = useMemo(() => {
    if (!detail || !Array.isArray(detail.order_items)) return [];
    return detail.order_items as Record<string, unknown>[];
  }, [detail]);

  const handleRefetch = useCallback(() => {
    refetch();
    if (!flagsQ.isUninitialized) flagsQ.refetch();
    if (!historyQ.isUninitialized) historyQ.refetch();
    if (!attachmentsQ.isUninitialized) attachmentsQ.refetch();
    if (!financeApprovalsQ.isUninitialized) financeApprovalsQ.refetch();
    if (!fulfillmentQ.isUninitialized) fulfillmentQ.refetch();
  }, [refetch, flagsQ, historyQ, attachmentsQ, financeApprovalsQ, fulfillmentQ]);

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
        handleRefetch();
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
      handleRefetch,
    ],
  );



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

  const handleApproveAndDispatch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!orderId) return;
      if (!dispatchAssignee) {
        toast.error("Please assign a dispatch operator.");
        return;
      }

      setIsApprovingAndDispatching(true);
      try {
        if (dispatchUploadFile) {
          const formData = new FormData();
          formData.append("file", dispatchUploadFile);
          formData.append("entity_type", "order");
          formData.append("entity_id", orderId);
          formData.append("remarks", dispatchRemarks.trim() || "Uploaded bill during Send to Dispatch");

          await createAttachment(formData).unwrap();
        }

        await patchOrder({
          id: orderId,
          patch: {
            assigned_dispatch_user: dispatchAssignee,
          },
        }).unwrap();

        await transitionOrder({
          id: orderId,
          body: {
            next_status: "dispatch_pending",
            remarks: dispatchRemarks.trim() || "Sent to dispatch from finance dashboard",
          },
        }).unwrap();

        toast.success("Order sent to dispatch successfully.");
        setIsDispatchModalOpen(false);
        setDispatchRemarks("");
        setDispatchAssignee("");
        setDispatchUploadFile(null);
        handleRefetch();
      } catch (err) {
        toast.error(mutationRejectedMessage(err));
      } finally {
        setIsApprovingAndDispatching(false);
      }
    },
    [
      orderId,
      dispatchAssignee,
      dispatchRemarks,
      dispatchUploadFile,
      patchOrder,
      transitionOrder,
      createAttachment,
      handleRefetch,
    ]
  );

  const custLabel = detail
    ? resolveOrderCounterparty(detail, partyNameById)
    : "—";

  const sentToDispatchReview = useMemo(
    () =>
      orderHasDispatchReviewHandoff(detail, {
        statusHistory: historyList,
        fulfillmentSnapshot,
      }),
    [detail, historyList, fulfillmentSnapshot],
  );

  const canClickSendToDispatch = useMemo(() => {
    if (sentToDispatchReview) return false;
    return (
      financeCaps.hasFinanceApprovalRecord &&
      (financeCaps.approvedQty > 0 || hasApprovedFinanceApproval) &&
      financeCaps.financeApprovalStatus !== "rejected"
    );
  }, [
    sentToDispatchReview,
    financeCaps.hasFinanceApprovalRecord,
    financeCaps.approvedQty,
    financeCaps.financeApprovalStatus,
    hasApprovedFinanceApproval,
  ]);

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

  const busy = isPatching || isSubmitting || isApprovingAndDispatching;

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

  const adminBox = useMemo(() => deptBoxes.find((b) => b.id === "admin"), [deptBoxes]);
  const financeBox = useMemo(() => deptBoxes.find((b) => b.id === "finance"), [deptBoxes]);
  const dispatchBox = useMemo(() => deptBoxes.find((b) => b.id === "dispatch"), [deptBoxes]);
  const deliveryBox = useMemo(() => deptBoxes.find((b) => b.id === "delivery"), [deptBoxes]);

  const adminStatusDim = adminBox?.status;
  const financeStatusDim = financeBox?.status;
  const dispatchStatusDim = dispatchBox?.status;
  const deliveryStatusDim = deliveryBox?.status;

  return (
    <div className="h-[calc(100vh-150px)] md:h-[calc(100vh-160px)] flex flex-col min-h-0 overflow-hidden space-y-4 pb-20 md:pb-0">
      {/* Transitions Dialog */}
      {transitioningTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
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
                onClick={() => executeTransition(transitioningTo)}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white shadow-sm transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send to Dispatch Modal */}
      {isDispatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200/90 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-slate-900 transition-all max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 font-sans">
                Send to Dispatch
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsDispatchModalOpen(false);
                  setDispatchRemarks("");
                  setDispatchAssignee("");
                  setDispatchUploadFile(null);
                }}
                className="rounded-md text-slate-400 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 p-1 cursor-pointer"
              >
                <span className="sr-only">Close</span>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={(e) => void handleApproveAndDispatch(e)} className="mt-4 space-y-5">
              <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-white/5 rounded-xl p-4 space-y-3 font-sans">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="block text-slate-500 font-semibold uppercase tracking-wider">Party</span>
                    <span className="block mt-1 font-semibold text-slate-900 dark:text-slate-100">{custLabel}</span>
                  </div>
                  <div>
                    <span className="block text-slate-500 font-semibold uppercase tracking-wider">Order Reference</span>
                    <span className="block mt-1 font-semibold text-slate-900 dark:text-slate-100">#{detail?.order_no ? String(detail.order_no) : "—"}</span>
                  </div>
                </div>
              </div>

              {/* Assign Dispatch Operator */}
              <div className="space-y-1.5">
                <label htmlFor="dispatch-assignee" className={labelClass}>Assign Dispatch Operator *</label>
                <select
                  id="dispatch-assignee"
                  value={dispatchAssignee}
                  onChange={(e) => setDispatchAssignee(e.target.value)}
                  className={inputClass}
                  required
                >
                  <option value="">— Select Dispatch Operator —</option>
                  {dispatchUsers.map((u) => {
                    const uid = String(u._id ?? u.id ?? "");
                    return (
                      <option key={uid} value={uid}>
                        {String(u.username || u.name || uid)}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Remarks */}
              <div className="space-y-1.5">
                <label htmlFor="dispatch-remarks" className={labelClass}>Remarks (Optional)</label>
                <textarea
                  id="dispatch-remarks"
                  rows={3}
                  value={dispatchRemarks}
                  onChange={(e) => setDispatchRemarks(e.target.value)}
                  className={inputClass}
                  placeholder="Add remarks or notes for this dispatch..."
                />
              </div>

              {/* Upload Bill Attachment (Optional) */}
              <div className="space-y-1.5">
                <label className={labelClass}>Upload Bill Document (Optional)</label>
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-5 text-center hover:border-blue-500 transition cursor-pointer relative bg-slate-50/20 dark:bg-slate-950/10">
                  <input
                    type="file"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setDispatchUploadFile(e.target.files[0]);
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="mt-2 text-xs font-semibold text-blue-600">Select bill file</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">PDF, Image, or DOC up to 50MB</p>
                </div>

                {dispatchUploadFile && (
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-white/5 font-sans text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <svg className="h-4 w-4 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-slate-700 dark:text-slate-300 truncate max-w-[280px]" title={dispatchUploadFile.name}>
                        {dispatchUploadFile.name}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">({(dispatchUploadFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDispatchUploadFile(null)}
                      className="text-xs font-semibold text-rose-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>

              {/* Submit Actions */}
              <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-white/5 font-sans font-medium">
                <button
                  type="button"
                  onClick={() => {
                    setIsDispatchModalOpen(false);
                    setDispatchRemarks("");
                    setDispatchAssignee("");
                    setDispatchUploadFile(null);
                  }}
                  className={btnSecondaryClass}
                  disabled={isApprovingAndDispatching}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isApprovingAndDispatching || !dispatchAssignee}
                  className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isApprovingAndDispatching ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Processing...
                    </>
                  ) : (
                    "Confirm & Send to Dispatch"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Item Fulfillment Details Modal */}
      {isFulfillmentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-4xl rounded-xl border border-slate-200/90 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900 transition-all max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5 font-sans">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-555 dark:text-slate-50">
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

      <OrderItemsModal
        isOpen={isOrderItemsModalOpen}
        onClose={() => setIsOrderItemsModalOpen(false)}
        detail={detail}
        status={status}
        readOnlyItems={readOnlyItems}
        refetchOrder={handleRefetch}
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

      {/* Loading & Error Indicators */}
      {(isFetching || isError || !detail) && (
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => router.back()} className={btnSecondaryClass}>
            Back
          </button>
        </div>
      )}

      {isFetching && (
        <p className="text-sm text-slate-500 dark:text-slate-400 font-sans">Loading order...</p>
      )}
      {isError && (
        <p className="text-sm text-rose-600 dark:text-rose-400 font-sans font-medium">
          Could not load order details.
        </p>
      )}

      {/* Order Main Content */}
      {!isFetching && !isError && detail && (
        <>
          <div className="flex-shrink-0 space-y-3">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">

              {/* ── Top row: breadcrumb + title + meta ── */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {/* Breadcrumb */}
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
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
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate text-lg sm:text-xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
                      {detail.order_no ? String(detail.order_no) : "Order"}
                    </h1>
                    <span className="shrink-0">
                      {renderPriorityBadge(typeof detail.priority === "string" ? detail.priority : "normal")}
                    </span>
                  </div>

                  {/* Meta info */}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>
                      Party:{" "}
                      <b className="font-semibold text-slate-700 dark:text-slate-200">{custLabel}</b>
                    </span>
                    <span>Date: {formatDateShort(detail.order_date)}</span>
                    <span>EDD: {formatDateShort(detail.expected_delivery_date)}</span>
                  </div>
                </div>

                {/* Refresh button – top-right on all sizes */}
                <button
                  type="button"
                  onClick={handleRefetch}
                  className="shrink-0 rounded-lg border border-slate-200/95 p-2 text-slate-500 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/5"
                  title="Refresh"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>

              {/* ── Info buttons: 2-col grid on mobile, inline on sm+ ── */}
              <div className="mt-3 grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:gap-2 font-sans font-medium">
                <button
                  type="button"
                  onClick={() => setIsOrderDetailsModalOpen(true)}
                  className="inline-flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white px-2 py-2 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-semibold text-slate-700 shadow-sm transition dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-white/5 cursor-pointer active:scale-[0.97]"
                >
                  <svg className="h-4 w-4 sm:h-3.5 sm:w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Order Info</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPartyDetailsModalOpen(true)}
                  className="inline-flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white px-2 py-2 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-semibold text-slate-700 shadow-sm transition dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-white/5 cursor-pointer active:scale-[0.97]"
                >
                  <svg className="h-4 w-4 sm:h-3.5 sm:w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span>Party Info</span>
                </button>
              </div>

              {/* ── Fulfillment pipeline ── */}
              <div className="mt-4 border-t border-slate-100 pt-4 dark:border-white/10 flex flex-col w-full bg-slate-50/50 p-3 sm:p-4 rounded-2xl dark:bg-slate-950/20">
                <div className="flex items-center justify-between mb-3 w-full gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">
                    Fulfillment Pipeline
                    <span className="hidden sm:inline"> (vs {orderKpis.totalQty} ordered)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsFulfillmentModalOpen(true)}
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-blue-200/80 bg-white hover:bg-slate-50 px-2.5 py-1.5 text-[10px] sm:text-xs font-bold text-blue-600 shadow-sm transition dark:border-white/10 dark:bg-slate-950 dark:text-blue-400 dark:hover:bg-white/5 cursor-pointer active:scale-[0.98]"
                  >
                    Details
                  </button>
                </div>
                {/* Horizontally scrollable on mobile */}
                <div className="overflow-x-auto -mx-1 px-1 pb-1">
                  <div className="grid grid-cols-7 items-center justify-items-center min-w-[280px] w-full max-w-4xl mx-auto py-1">
                    <FulfillmentCircleStep label="Admin" status={adminStatusDim} completed={adminBox?.completedQty} total={orderKpis.totalQty} icon={UserCheck} />
                    <span className="text-slate-300 dark:text-slate-600 text-xs font-semibold">→</span>
                    <FulfillmentCircleStep label="Finance" status={financeStatusDim} completed={financeBox?.completedQty} total={orderKpis.totalQty} icon={DollarSign} />
                    <span className="text-slate-300 dark:text-slate-600 text-xs font-semibold">→</span>
                    <FulfillmentCircleStep label="Dispatch" status={dispatchStatusDim} completed={dispatchBox?.completedQty} total={orderKpis.totalQty} icon={Package} />
                    <span className="text-slate-300 dark:text-slate-600 text-xs font-semibold">→</span>
                    <FulfillmentCircleStep label="Delivery" status={deliveryStatusDim} completed={deliveryBox?.completedQty} total={orderKpis.totalQty} icon={Truck} />
                  </div>
                </div>
              </div>

              {/* ── Action buttons bar ── */}
              <div className="mt-4 border-t border-slate-100 pt-3 dark:border-white/10">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 font-sans font-medium">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setIsOrderItemsModalOpen(true)}
                    className="rounded-lg bg-emerald-600 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-emerald-500 dark:hover:bg-emerald-400 active:scale-[0.98]"
                  >
                    Approved Items
                  </button>
                  {detail ? (
                    <button
                      type="button"
                      disabled={!canClickSendToDispatch || busy}
                      title={
                        sentToDispatchReview
                          ? "Already sent to dispatch review"
                          : !financeCaps.hasFinanceApprovalRecord
                            ? "Create at least one finance approval in Approval & Allocations first"
                            : !hasApprovedFinanceApproval && financeCaps.approvedQty <= 0
                              ? "Approve a finance approval with quantities before sending to dispatch"
                              : financeCaps.financeApprovalStatus === "rejected"
                                ? "Finance approval was rejected"
                                : undefined
                      }
                      onClick={() => setIsDispatchModalOpen(true)}
                      className="rounded-lg bg-emerald-600 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-emerald-500 dark:hover:bg-emerald-400 active:scale-[0.98]"
                    >
                      Send to Dispatch
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={!canReject || busy}
                    onClick={() => setTransitioningTo("finance_rejected")}
                    className="rounded-lg bg-rose-600 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={!canHold || busy}
                    onClick={() => setTransitioningTo("on_hold")}
                    className="rounded-lg bg-amber-600 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
                  >
                    Hold
                  </button>
                  <button
                    type="button"
                    disabled={status !== "on_hold" || busy}
                    onClick={() => setTransitioningTo("finance_review")}
                    className="rounded-lg bg-blue-600 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
                  >
                    Resume
                  </button>
                  <button
                    type="button"
                    disabled={!(status === "on_hold" || status === "dispatch_pending") || busy}
                    onClick={() => setTransitioningTo("cancelled")}
                    className="rounded-lg bg-rose-600 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
                  >
                    Cancel
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* ── DESKTOP: Independently Scrollable Tab Content ── */}
          <div className="hidden md:block flex-1 min-h-0 overflow-y-auto pr-1">
            {activeTab === "flags" && (
              <FlagsTab
                orderId={orderId}
                flagsQ={flagsQ}
                rawFlags={rawFlags}
                formatDate={formatDate}
                userNameById={userNameById}
                setShowRaiseFlagModal={setShowRaiseFlagModal}
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

            {activeTab === "approval_allocations" && (
              <ApprovalAllocationsTab
                orderId={orderId}
                detail={detail}
                refetchOrder={handleRefetch}
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
          </div>

          {/* ── DESKTOP: Fixed Footer Tab Nav ── */}
          <div className="hidden md:block flex-shrink-0 pt-2 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-slate-955/20 p-2 rounded-xl">
            <OrderDetailTabsNav
              tabs={[
                {
                  id: "flags",
                  name: "Flags",
                  count: rawFlags.filter((f) => f.status === "open").length,
                  dangerBadge: true,
                },
                { id: "attachments", name: "Attachments", count: attachments.length },
                { id: "approval_allocations", name: "Approval & Allocations" },
                { id: "dispatches", name: "Dispatches" },
                { id: "transports", name: "Transports" },
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
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50 capitalize">
                  {activeTab === "flags" && "Flags"}
                  {activeTab === "attachments" && "Attachments"}
                  {activeTab === "approval_allocations" && "Approval & Allocations"}
                  {activeTab === "dispatches" && "Dispatches"}
                  {activeTab === "transports" && "Transports"}
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
                    setShowRaiseFlagModal={setShowRaiseFlagModal}
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
                {activeTab === "approval_allocations" && (
                  <ApprovalAllocationsTab
                    orderId={orderId}
                    detail={detail}
                    refetchOrder={handleRefetch}
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
              </div>
            </div>
          )}
        </>
      )}

      {/* ── MOBILE: Bottom-fixed Tab Navigation Bar ── */}
      {!isFetching && !isError && detail && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-2 pb-safe">
          <nav className="flex items-stretch justify-around">
            {([
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
                id: "approval_allocations" as const,
                name: "Approvals",
                count: undefined,
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
    </div>
  );
}
