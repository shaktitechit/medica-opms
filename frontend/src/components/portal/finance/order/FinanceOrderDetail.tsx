"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { DashboardCard } from "@/components/widgets";
import {
  buildPartyNameById,
  resolveOrderCounterparty,
} from "@/components/portal/sales/partyDisplay";
import {
  mutationRejectedMessage,
  mutationSuccessCopy,
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

import { OrderTab } from "./components/OrderTab";
import { FlagsTab } from "./components/FlagsTab";
import { AttachmentsTab } from "./components/AttachmentsTab";
import { ApprovalAllocationsTab } from "./components/ApprovalAllocationsTab";
import { DispatchesTab } from "./components/DispatchesTab";
import { TransportsTab } from "./components/TransportsTab";

import { ALL_FLAG_TYPES, ALLOWED_FLAGS_BY_DEPARTMENT, FLAGS_FOR_TARGET_DEPARTMENT } from "@/components/portal/shared/flagTypes";
import { OrderDetailTabsNav } from "@/components/portal/shared/OrderDetailTabsNav";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import {
  computeFinanceApprovalCapabilities,
  orderHasDispatchReviewHandoff,
} from "@/components/portal/shared/financeApprovalStatus";
import { OrderDepartmentFulfillmentPanel } from "@/components/portal/shared/OrderDepartmentFulfillmentPanel";

const inputClass =
  "w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";
const labelClass = "text-xs font-medium text-slate-700 dark:text-slate-300";
const btnSecondaryClass =
  "rounded-lg border border-slate-200/95 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5";

const departmentLabels: Record<string, string> = {
  sales: "Sales",
  finance: "Finance",
  dispatch: "Dispatch",
  admin: "Admin",
};

function pickList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.data)) return o.data;
  }
  return [];
}

function formatMoney(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : "—";
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

function partyIdFromDetail(detail: Record<string, unknown> | null): string {
  if (!detail) return "";
  const p = detail.party;
  if (typeof p === "string") return p.trim();
  if (p && typeof p === "object" && "_id" in p)
    return String((p as { _id: unknown })._id ?? "");
  return "";
}

function readId(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const row = value as Record<string, unknown>;
  return String(row._id ?? row.id ?? "");
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
    return detail ? partyIdFromDetail(detail) : "";
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

  // Order Patch Mutation
  const [patchOrder] = usePatchOrderMutation();

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
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadRemarks, setUploadRemarks] = useState("");
  const [createAttachment, { isLoading: isUploading }] = useCreateAttachmentMutation();

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

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      toast.error("Please select a file first");
      return;
    }
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("entity_type", "order");
      formData.append("entity_id", orderId);
      formData.append("remarks", uploadRemarks.trim());

      await createAttachment(formData).unwrap();
      toast.success("Attachment uploaded successfully");
      setUploadFile(null);
      setUploadRemarks("");
      setIsUploadModalOpen(false);
      handleRefetch();
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  };

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

  const busy = isSubmitting || isApprovingAndDispatching;

  const resolveUserId = useCallback((userVal: unknown): string => {
    if (!userVal) return "";
    if (typeof userVal === "string") return userVal;
    if (typeof userVal === "object" && userVal !== null) {
      const o = userVal as Record<string, unknown>;
      return String(o._id ?? o.id ?? "");
    }
    return "";
  }, []);

  const adminName = useMemo(() => {
    const id = resolveUserId(detail?.assigned_admin_user);
    return (id && userNameById[id]) || "Admin";
  }, [detail, resolveUserId, userNameById]);

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

  return (
    <div className="space-y-6">
      {transitioningTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-xl border border-slate-200/90 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 capitalize">
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
                  className="w-full mt-1.5 rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 font-sans"
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
                onClick={() => setTransitioningTo(null)}
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

      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-xl border border-slate-200/90 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900 transition-all">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                Upload Attachment
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsUploadModalOpen(false);
                  setUploadFile(null);
                  setUploadRemarks("");
                }}
                className="rounded-md text-slate-400 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 p-1"
              >
                <span className="sr-only">Close</span>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="mt-4 space-y-4">
              <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 p-6 text-center hover:border-blue-500 transition cursor-pointer relative">
                <input
                  type="file"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setUploadFile(e.target.files[0]);
                    }
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                
                <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>

                <div className="mt-4 flex text-sm text-slate-600 dark:text-slate-400 font-sans">
                  <span className="relative rounded-md font-semibold text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                    Upload a file
                  </span>
                  <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-slate-500 font-sans">Any file up to 50MB</p>
              </div>

              {uploadFile && (
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950 border border-slate-100 dark:border-white/5 flex items-center justify-between font-sans">
                  <div className="flex items-center space-x-2 min-w-0">
                    <svg className="h-5 w-5 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div className="min-w-0 text-left">
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[200px]" title={uploadFile.name}>
                        {uploadFile.name}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUploadFile(null)}
                    className="text-xs text-rose-500 hover:underline font-medium"
                  >
                    Remove
                  </button>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 font-sans">
                  Remarks (Optional)
                </label>
                <textarea
                  value={uploadRemarks}
                  onChange={(e) => setUploadRemarks(e.target.value)}
                  rows={2}
                  className="w-full mt-1.5 rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 font-sans"
                  placeholder="Add remarks or notes for this attachment..."
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 font-sans font-medium">
                <button
                  type="button"
                  onClick={() => {
                    setIsUploadModalOpen(false);
                    setUploadFile(null);
                    setUploadRemarks("");
                  }}
                  className={btnSecondaryClass}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !uploadFile}
                  className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Uploading...
                    </>
                  ) : (
                    "Upload"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {!isFetching && !isError && detail && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Orders
                  </button>
                  <span>/</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    Order Details
                  </span>
                </div>
                <h1 className="truncate text-xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
                  {detail.order_no ? String(detail.order_no) : "Order"}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <span>
                    Party:{" "}
                    <b className="font-semibold text-slate-700 dark:text-slate-200">
                      {custLabel}
                    </b>
                  </span>
                  <span>Order Date: {formatDateShort(detail.order_date)}</span>
                  <span>
                    Expected: {formatDateShort(detail.expected_delivery_date)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-right text-[10px] text-slate-500 dark:text-slate-400 sm:grid-cols-4">
                <div>
                  <span className="block uppercase tracking-wide">Created By</span>
                  <b className="text-[11px] text-slate-800 dark:text-slate-100">
                    Sales
                  </b>
                </div>
                <div>
                  <span className="block uppercase tracking-wide">Created On</span>
                  <b className="text-[11px] text-slate-800 dark:text-slate-100">
                    {formatDateShort(detail.createdAt)}
                  </b>
                </div>
                <div>
                  <span className="block uppercase tracking-wide">Last Modified</span>
                  <b className="text-[11px] text-slate-800 dark:text-slate-100">
                    {formatDateShort(detail.updatedAt)}
                  </b>
                </div>
                <div>
                  <span className="block uppercase tracking-wide">Priority</span>
                  <b className="capitalize text-[11px] text-slate-800 dark:text-slate-100">
                    {String(detail.priority || "normal")}
                  </b>
                </div>
              </div>
            </div>

            <OrderDepartmentFulfillmentPanel
              className="mt-3"
              order={detail}
              fulfillmentSnapshot={fulfillmentSnapshot}
            />

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-white/10">
              <div className="flex flex-wrap items-center gap-2">
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
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                  >
                    Send to Dispatch
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={!canReject || busy}
                  onClick={() => setTransitioningTo("finance_rejected")}
                  className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Reject
                </button>
                <button
                  type="button"
                  disabled={!canHold || busy}
                  onClick={() => setTransitioningTo("on_hold")}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Hold
                </button>
                <button
                  type="button"
                  disabled={status !== "on_hold" || busy}
                  onClick={() => setTransitioningTo("finance_review")}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Resume to Review
                </button>
                <button
                  type="button"
                  disabled={!(status === "on_hold" || status === "dispatch_pending") || busy}
                  onClick={() => setTransitioningTo("cancelled")}
                  className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
              <button type="button" onClick={handleRefetch} className={btnSecondaryClass}>
                Refresh
              </button>
            </div>
          </div>

          {/* <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8">
            {[
              ["Total Items", String(orderKpis.totalLines), "Catalog lines"],
              ["Total Qty", String(orderKpis.totalQty), "Ordered quantity"],
              ["Pending Finance", String(orderKpis.pendingFinanceQty), "Qty awaiting finance"],
              ["Finance Approved", String(orderKpis.financeApprovedQty), "Approved by finance"],
              ["Pending Dispatch", String(orderKpis.pendingDispatchQty), "Approved but not dispatched"],
              ["Dispatched", String(orderKpis.dispatchedQty), "Dispatched qty"],
              ["Total Amount", formatMoney(orderKpis.grandTotal), "Grand total"],
              [
                "Risk / Flags",
                String(orderKpis.openFlags),
                orderKpis.openFlags > 0 ? "Needs attention" : "No open flags",
              ],
            ].map(([label, value, help]) => (
              <div
                key={label}
                className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-slate-900"
              >
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {label}
                </div>
                <div className="mt-1 text-base font-bold tabular-nums text-slate-950 dark:text-slate-50">
                  {value}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                  {help}
                </div>
              </div>
            ))}
          </div> */}
        </div>
      )}

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
        <p className="text-sm text-rose-600 dark:text-rose-400 font-sans">
          Could not load order details.
        </p>
      )}

      {!isFetching && !isError && detail && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-white/10">
                <div>
                  <h2 className="text-sm font-bold text-slate-950 dark:text-slate-50">
                    Order Details
                  </h2>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Status, routing, and delivery information.
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(status)}`}
                >
                  {formatStatusLabel(status)}
                </span>
              </div>

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
                  <dd className="mt-0.5 min-h-8 whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-slate-900 dark:bg-slate-950/40 dark:text-slate-100 font-sans">
                    {typeof detail.remarks === "string" && detail.remarks.trim()
                      ? detail.remarks
                      : "—"}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-white/10">
                <div>
                  <h2 className="text-sm font-bold text-slate-950 dark:text-slate-50">
                    Party Details
                  </h2>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Counterparty profile and delivery addresses.
                  </p>
                </div>
                {partyDetailQ.data && typeof partyDetailQ.data === "object" && "party_type" in partyDetailQ.data ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-700 ring-1 ring-slate-600/10 dark:bg-slate-950 dark:text-slate-300 dark:ring-white/10">
                    {String((partyDetailQ.data as Record<string, unknown>).party_type ?? "party")}
                  </span>
                ) : null}
              </div>

              {partyDetailQ.isFetching ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 font-sans">
                  Loading party details...
                </p>
              ) : partyDetailQ.isError ? (
                <p className="text-xs text-rose-600 dark:text-rose-400 font-sans">
                  Error loading party details.
                </p>
              ) : partyDetailQ.data ? (
                (() => {
                  const p = partyDetailQ.data as Record<string, unknown>;
                  return (
                    <div className="space-y-3 text-xs">
                      <dl className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-medium text-slate-500">
                            Party Name
                          </dt>
                          <dd className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                            {(p.party_name as string) || custLabel}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">
                            Contact
                          </dt>
                          <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                            {(p.contact_person as string) || "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">
                            Mobile
                          </dt>
                          <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                            {(p.mobile as string) || "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">
                            Email
                          </dt>
                          <dd className="mt-0.5 truncate text-slate-900 dark:text-slate-100">
                            {(p.email as string) || "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">
                            GST Number
                          </dt>
                          <dd className="mt-0.5 font-mono text-slate-900 dark:text-slate-100">
                            {(p.gst_no as string) || "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">
                            Payment Terms
                          </dt>
                          <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                            {(p.payment_terms as string) || "—"}
                          </dd>
                        </div>
                      </dl>
                      <div className="grid gap-3 border-t border-slate-100 pt-3 dark:border-white/10 sm:grid-cols-2 font-sans">
                        <div>
                          <dt className="text-xs font-medium text-slate-500">
                            Billing Address
                          </dt>
                          <dd className="mt-1 whitespace-pre-line rounded-lg bg-slate-50 p-2 text-[11px] text-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
                            {formatStructuredAddress(p.billing_address)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">
                            Shipping Address
                          </dt>
                          <dd className="mt-1 whitespace-pre-line rounded-lg bg-slate-50 p-2 text-[11px] text-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
                            {formatStructuredAddress(p.shipping_address)}
                          </dd>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 font-sans">
                  No party linked on this order.
                </p>
              )}
            </section>
          </div>

          <OrderTab
            detail={detail}
            status={status}
            formatMoney={formatMoney}
            readOnlyItems={readOnlyItems}
            refetchOrder={handleRefetch}
          />

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

          {/* TABS CONTENT */}

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
              onUploadClick={() => setIsUploadModalOpen(true)}
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

          {/* Raise Flag Modal Dialog */}
          {showRaiseFlagModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
              <div className="w-full max-w-lg rounded-xl border border-slate-200/90 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                    Raise Departmental Flag
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowRaiseFlagModal(false)}
                    className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <form onSubmit={(e) => void handleRaiseFlag(e)} className="mt-4 space-y-4">
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
                          .filter(([val]) => val !== "finance")
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
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
                    >
                      {isCreatingFlag ? "Raising Flag..." : "Raise Flag"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}



          {/* Approve & Dispatch Modal Dialog */}
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
                    className="rounded-md text-slate-400 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 p-1"
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
        </>
      )}
    </div>
  );
}
