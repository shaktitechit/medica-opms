"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { FlagsTab } from "./components/FlagsTab";
import AttachmentsTab from "./components/AttachmentsTab";
import { DispatchesTab } from "./components/DispatchesTab";
import { TransportsTab } from "./components/TransportsTab";
import { FinanceReleasesTab } from "./components/FinanceReleasesTab";
import { DashboardCard } from "@/components/widgets";
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
  useListUsersQuery,
  useTransitionOrderMutation,
  useListFlagsQuery,
  useCreateFlagMutation,
  useCreateDispatchMutation,
  useListAttachmentsQuery,
  usePatchDispatchMutation,
  useListDispatchesQuery,
  useListTransportsQuery,
  usePatchTransportMutation,
  useGetPartyQuery,
  useListOrderFinanceApprovalsQuery,
  useGetOrderFulfillmentQuery,
} from "@/store/api";

import { ALL_FLAG_TYPES, FLAGS_FOR_TARGET_DEPARTMENT } from "@/components/portal/shared/flagTypes";
import { OrderDetailTabsNav } from "@/components/portal/shared/OrderDetailTabsNav";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import { OrderDepartmentFulfillmentPanel } from "@/components/portal/shared/OrderDepartmentFulfillmentPanel";
import { FulfillmentCircleStep } from "@/components/portal/shared/FulfillmentCircleStep";
import { computeDepartmentStageBoxes } from "@/components/portal/shared/orderDepartmentStages";
import { UserCheck, DollarSign, Package, Truck } from "lucide-react";

import OrderDetailsModal from "./components/OrderDetailsModal";
import PartyDetailsModal from "./components/PartyDetailsModal";
import OrderItemsModal from "./components/OrderItemsModal";

const inputClass =
  "w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";
const labelClass = "text-xs font-medium text-slate-700 dark:text-slate-300";
const btnSecondaryClass =
  "rounded-lg border border-slate-200/95 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5";

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

// Format status label to readable text
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
    return "bg-rose-50 text-rose-700 ring-1 ring-rose-600/15 dark:bg-rose-955/30 dark:text-rose-300 dark:ring-rose-500/20";
  }
  if (status === "on_hold" || status === "submitted") {
    return "bg-amber-50 text-amber-700 ring-1 ring-amber-600/15 dark:bg-amber-955/30 dark:text-amber-305 dark:ring-amber-500/20";
  }
  if (status.includes("dispatch") || status.includes("transport")) {
    return "bg-blue-50 text-blue-700 ring-1 ring-blue-600/15 dark:bg-blue-955/30 dark:text-blue-300 dark:ring-blue-500/20";
  }
  if (status === "delivered" || status.includes("approved")) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15 dark:bg-emerald-955/30 dark:text-emerald-300 dark:ring-emerald-500/25";
  }
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-600/10 dark:bg-slate-900 dark:text-slate-300 dark:ring-white/10";
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

function partyIdFromDetail(detail: Record<string, unknown> | null): string {
  if (!detail) return "";
  const p = detail.party;
  if (typeof p === "string") return p.trim();
  if (p && typeof p === "object" && "_id" in p)
    return String((p as { _id: unknown })._id ?? "");
  return "";
}

function resolveUserId(userVal: unknown): string {
  if (!userVal) return "";
  if (typeof userVal === "string") return userVal;
  if (typeof userVal === "object" && userVal !== null) {
    const o = userVal as Record<string, unknown>;
    return String(o._id ?? o.id ?? "");
  }
  return "";
}

function isApprovedFinanceRelease(app: Record<string, unknown>): boolean {
  const s = String(app.approval_status || "").toLowerCase();
  return (
    s === "fully_approved" || s === "partially_approved" || s === "approved"
  );
}

function financeApprovalId(app: Record<string, unknown>): string {
  return String(app._id ?? app.id ?? "");
}

function normalizeOrderItemId(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return String(o._id ?? o.id ?? "");
  }
  return String(value);
}

function formatFinanceReleaseStatus(status: unknown): string {
  const s = String(status || "").toLowerCase();
  const labels: Record<string, string> = {
    fully_approved: "Fully approved",
    partially_approved: "Partially approved",
    pending_review: "Pending review",
    draft: "Draft",
    rejected: "Rejected",
    hold: "On hold",
    cancelled: "Cancelled",
    approved: "Approved",
  };
  return labels[s] || formatStatusLabel(s);
}

const departmentLabels: Record<string, string> = {
  sales: "Sales",
  finance: "Finance",
  dispatch: "Dispatch",
  admin: "Admin",
};

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

export default function DispatchOrderDetail({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { data, isFetching, isError, refetch } = useGetOrderQuery(orderId);

  const salesUsersQ = useListUsersQuery({ department: "sales" });
  const financeUsersQ = useListUsersQuery({ department: "finance" });
  const dispatchUsersQ = useListUsersQuery({ department: "dispatch" });
  const adminUsersQ = useListUsersQuery({ department: "admin" });
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

  const currentPartyId = useMemo(() => {
    return detail ? partyIdFromDetail(detail) : "";
  }, [detail]);

  const partyDetailQ = useGetPartyQuery(currentPartyId, {
    skip: !currentPartyId,
  });

  const salesUsers = useMemo(() => pickList(salesUsersQ.data), [salesUsersQ.data]);
  const financeUsers = useMemo(() => pickList(financeUsersQ.data), [financeUsersQ.data]);
  const dispatchUsers = useMemo(() => pickList(dispatchUsersQ.data), [dispatchUsersQ.data]);
  const adminUsers = useMemo(() => pickList(adminUsersQ.data), [adminUsersQ.data]);

  const users = useMemo(() => {
    return [
      ...salesUsers,
      ...financeUsers,
      ...dispatchUsers,
      ...adminUsers,
    ] as Record<string, unknown>[];
  }, [salesUsers, financeUsers, dispatchUsers, adminUsers]);

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

  const partyNameById = useMemo(
    () => buildPartyNameById(partiesQ.data),
    [partiesQ.data],
  );

  const [transitionOrder, { isLoading: isSubmitting }] =
    useTransitionOrderMutation();

  const [transitioningTo, setTransitioningTo] = useState<string | null>(null);
  const [transitionRemarks, setTransitionRemarks] = useState("");

  const [activeTab, setActiveTab] = useState<"finance_releases" | "dispatches" | "transports" | "flags" | "attachments">("finance_releases");
  const [mobileTabOpen, setMobileTabOpen] = useState(false);
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

  // Create Dispatch form state variables
  const [isCreateDispatchModalOpen, setIsCreateDispatchModalOpen] = useState(false);
  const [dispatchDate, setDispatchDate] = useState("");
  const [warehouseLocation, setWarehouseLocation] = useState("");
  const [dispatchRemarks, setDispatchRemarks] = useState("");
  const [dispatchItemsQuantities, setDispatchItemsQuantities] = useState<Record<string, number>>({});
  const [activeApproval, setActiveApproval] = useState<any | null>(null);

  const handleCloseCreateDispatchModal = useCallback(() => {
    setIsCreateDispatchModalOpen(false);
    setWarehouseLocation("");
    setDispatchRemarks("");
    setDispatchItemsQuantities({});
    setActiveApproval(null);
  }, []);

  const attachmentsQ = useListAttachmentsQuery({ entity_type: "order", entity_id: orderId });
  const attachments = useMemo(() => {
    const arr = pickList(attachmentsQ.data);
    return arr;
  }, [attachmentsQ.data]);

  const attachmentsCount = useMemo(() => {
    return attachments.filter((att: any) => {
      const dept = att.uploaded_by?.department;
      return dept === "finance" || dept === "dispatch";
    }).length;
  }, [attachments]);

  const flagsQ = useListFlagsQuery({ order: orderId });
  const [createFlag, { isLoading: isCreatingFlag }] = useCreateFlagMutation();
  const rawFlags = useMemo(() => {
    const arr = pickList(flagsQ.data);
    return arr as Record<string, unknown>[];
  }, [flagsQ.data]);

  // Dispatch / Transport mutations & queries
  const dispatchesQ = useListDispatchesQuery({ order: orderId });
  const transportsQ = useListTransportsQuery({ order: orderId });
  const [createDispatch, { isLoading: isCreatingDispatch }] = useCreateDispatchMutation();
  const [patchDispatch, { isLoading: isPatchingDispatch }] = usePatchDispatchMutation();
  const [patchTransport, { isLoading: isPatchingTransport }] = usePatchTransportMutation();

  const dispatches = useMemo(() => pickList(dispatchesQ.data), [dispatchesQ.data]);
  const transports = useMemo(() => pickList(transportsQ.data), [transportsQ.data]);
  const approvals = useMemo(() => pickList(financeApprovalsQ.data), [financeApprovalsQ.data]);

  const dispatchedQtyByItemForActiveApproval = useMemo(() => {
    if (!activeApproval || !dispatches) return {};
    const map: Record<string, number> = {};

    const filteredDispatches = dispatches.filter((disp: any) => {
      const statusValue = String(disp.dispatch_status ?? disp.status ?? "partially_dispatched");
      if (statusValue === "cancelled") return false;

      const dispApprovalId = typeof disp.finance_approval === "object" && disp.finance_approval !== null
        ? String(disp.finance_approval._id ?? disp.finance_approval.id ?? "")
        : String(disp.finance_approval ?? "");

      return dispApprovalId === String(activeApproval._id);
    });

    filteredDispatches.forEach((disp: any) => {
      const items = Array.isArray(disp.dispatch_items) ? disp.dispatch_items : disp.items || [];
      items.forEach((item: any) => {
        const lineId = String(item.order_item_id);
        const qty = Number(item.dispatched_quantity ?? item.dispatch_quantity ?? 0);
        map[lineId] = (map[lineId] || 0) + qty;
      });
    });

    return map;
  }, [activeApproval, dispatches]);

  const getReleaseDispatches = useCallback(
    (appId: string) => {
      return dispatches.filter((disp: Record<string, unknown>) => {
        const statusValue = String(
          disp.dispatch_status ?? disp.status ?? "partially_dispatched",
        );
        if (statusValue === "cancelled") return false;

        const dispApproval = disp.finance_approval;
        const dispApprovalId =
          typeof dispApproval === "object" && dispApproval !== null
            ? String(
              (dispApproval as Record<string, unknown>)._id ??
              (dispApproval as Record<string, unknown>).id ??
              "",
            )
            : String(dispApproval ?? "");

        return dispApprovalId === appId;
      });
    },
    [dispatches],
  );

  const isReleaseFullyDispatched = useCallback(
    (app: Record<string, unknown>) => {
      const items = Array.isArray(app.approval_items)
        ? (app.approval_items as Record<string, unknown>[])
        : [];
      if (items.length === 0) return false;

      const appId = financeApprovalId(app);
      const releaseDispatches = getReleaseDispatches(appId);

      const dispatchedMap: Record<string, number> = {};
      releaseDispatches.forEach((disp) => {
        const rawItems = Array.isArray(disp.dispatch_items)
          ? disp.dispatch_items
          : (disp.items as unknown[]) || [];
        (rawItems as Record<string, unknown>[]).forEach((item) => {
          const lineId = normalizeOrderItemId(item.order_item_id);
          const qty = Number(item.dispatched_quantity ?? item.dispatch_quantity ?? 0);
          dispatchedMap[lineId] = (dispatchedMap[lineId] || 0) + qty;
        });
      });

      const linesWithApproval = items.filter(
        (ai) => Number(ai.approved_quantity || 0) > 0,
      );
      if (linesWithApproval.length === 0) return false;

      return linesWithApproval.every((ai) => {
        const approvedQty = Number(ai.approved_quantity || 0);
        const lineId = normalizeOrderItemId(ai.order_item_id);
        const dispatchedQty = dispatchedMap[lineId] || 0;
        return dispatchedQty >= approvedQty;
      });
    },
    [getReleaseDispatches],
  );

  const releaseHasDispatches = useCallback(
    (app: Record<string, unknown>) => {
      return getReleaseDispatches(financeApprovalId(app)).length > 0;
    },
    [getReleaseDispatches],
  );

  const handleRefetch = useCallback(() => {
    refetch();
    if (!fulfillmentQ.isUninitialized) fulfillmentQ.refetch();
    if (!flagsQ.isUninitialized) flagsQ.refetch();
    if (!attachmentsQ.isUninitialized) attachmentsQ.refetch();
    if (!dispatchesQ.isUninitialized) dispatchesQ.refetch();
    if (!transportsQ.isUninitialized) transportsQ.refetch();
    if (!financeApprovalsQ.isUninitialized) financeApprovalsQ.refetch();
  }, [refetch, fulfillmentQ, flagsQ, attachmentsQ, dispatchesQ, transportsQ, financeApprovalsQ]);

  const handleUpdateDispatchStatus = useCallback(async (dispatchId: string, nextStatus: string) => {
    try {
      await patchDispatch({
        id: dispatchId,
        patch: { status: nextStatus },
      }).unwrap();
      toast.success(`Dispatch status updated to ${nextStatus.replace('_', ' ')}`);
      handleRefetch();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  }, [patchDispatch, handleRefetch]);

  const handleUpdateTransportStatus = useCallback(async (transportId: string, nextStatus: string, remarks?: string) => {
    try {
      await patchTransport({
        id: transportId,
        patch: { status: nextStatus, ...(remarks ? { remarks } : {}) },
      }).unwrap();
      toast.success(`Transport status updated to ${nextStatus.replace(/_/g, ' ')}`);
      handleRefetch();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  }, [patchTransport, handleRefetch]);





  const handleCreateDispatch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId) return;

    const items = Object.entries(dispatchItemsQuantities)
      .map(([order_item_id, qty]) => ({
        order_item_id,
        dispatch_quantity: qty,
      }))
      .filter((item) => item.dispatch_quantity > 0);

    if (items.length === 0) {
      toast.error("Please enter a dispatch quantity for at least one item.");
      return;
    }

    try {
      await createDispatch({
        order: orderId,
        finance_approval: activeApproval?._id || undefined,
        dispatch_date: dispatchDate ? new Date(dispatchDate).toISOString() : new Date().toISOString(),
        warehouse_location: warehouseLocation.trim() || undefined,
        remarks: dispatchRemarks.trim() || undefined,
        items,
      }).unwrap();

      toast.success("Dispatch created successfully.");
      setIsCreateDispatchModalOpen(false);
      setWarehouseLocation("");
      setDispatchRemarks("");
      setDispatchItemsQuantities({});
      setActiveApproval(null);
      handleRefetch();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  }, [orderId, activeApproval, dispatchItemsQuantities, dispatchDate, warehouseLocation, dispatchRemarks, createDispatch, handleRefetch]);

  const userNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of users) {
      const id = String(u._id ?? u.id ?? "");
      if (id) map[id] = String(u.username || u.name || id);
    }
    return map;
  }, [users]);

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
      try {
        await transitionOrder({
          id: orderId,
          body: {
            next_status: nextStatus,
            remarks: transitionRemarks.trim() || undefined,
          },
        }).unwrap();
        toast.success(`Order transitioned to ${nextStatus.replace("dispatch_", "").replace("_", " ")}`);
        setTransitioningTo(null);
        setTransitionRemarks("");
        handleRefetch();
      } catch (rejected) {
        toast.error(mutationRejectedMessage(rejected));
      }
    },
    [orderId, transitionRemarks, transitionOrder, handleRefetch],
  );

  const custLabel = detail
    ? resolveOrderCounterparty(detail, partyNameById)
    : "—";

  const readOnlyItems = useMemo(() => {
    if (!detail || !Array.isArray(detail.order_items)) return [];
    return detail.order_items as Record<string, unknown>[];
  }, [detail]);

  const allowedTransitions = useMemo(() => {
    if (status === "dispatch_pending") {
      return ["on_hold", "cancelled"];
    }
    if (status === "partial_dispatch_created") {
      return ["on_hold"];
    }
    if (status === "on_hold") {
      return ["dispatch_pending", "cancelled"];
    }
    return [];
  }, [status]);

  const buildInitialDispatchQuantities = useCallback(
    (app: Record<string, unknown> | null) => {
      const init: Record<string, number> = {};
      const appId = app ? financeApprovalId(app) : "";
      const releaseDispatches = appId ? getReleaseDispatches(appId) : [];

      readOnlyItems.forEach((line) => {
        const lineId = String(line._id ?? line.id ?? "");
        const appItem = app?.approval_items
          ? (app.approval_items as Record<string, unknown>[]).find(
            (ai) => normalizeOrderItemId(ai.order_item_id) === lineId,
          )
          : undefined;

        const approved = appItem
          ? Number(appItem.approved_quantity || 0)
          : line.approved_quantity !== undefined
            ? Number(line.approved_quantity || 0)
            : Number(line.ordered_quantity ?? line.quantity ?? 0);

        let alreadyDispatched = 0;
        if (app) {
          releaseDispatches.forEach((disp) => {
            const items = Array.isArray(disp.dispatch_items)
              ? disp.dispatch_items
              : (disp.items as unknown[]) || [];
            (items as Record<string, unknown>[]).forEach((item) => {
              if (normalizeOrderItemId(item.order_item_id) === lineId) {
                alreadyDispatched += Number(
                  item.dispatched_quantity ?? item.dispatch_quantity ?? 0,
                );
              }
            });
          });
        } else {
          alreadyDispatched = Number(line.dispatched_quantity || 0);
        }

        const remaining = Math.max(0, approved - alreadyDispatched);
        if (remaining > 0) {
          init[lineId] = remaining;
        }
      });

      return init;
    },
    [readOnlyItems, getReleaseDispatches],
  );

  const dispatchableApprovals = useMemo(() => {
    return approvals.filter(
      (app) =>
        isApprovedFinanceRelease(app as Record<string, unknown>) &&
        !isReleaseFullyDispatched(app),
    );
  }, [approvals, isReleaseFullyDispatched]);

  const primaryDispatchApproval = dispatchableApprovals[0] ?? null;

  const dispatchFulfillment = useMemo(() => {
    const totals =
      fulfillmentSnapshot?.totals &&
        typeof fulfillmentSnapshot.totals === "object"
        ? (fulfillmentSnapshot.totals as Record<string, unknown>)
        : null;

    if (totals) {
      const approved = Number(totals.approved ?? 0);
      const dispatched = Number(totals.dispatched ?? 0);
      const pendingDispatch = Number(
        totals.pending_dispatch ?? totals.pendingDispatch ?? Math.max(0, approved - dispatched),
      );
      return { approved, dispatched, pendingDispatch };
    }

    const approved = readOnlyItems.reduce(
      (sum, line) => sum + Number(line.approved_quantity || 0),
      0,
    );
    const dispatched = readOnlyItems.reduce(
      (sum, line) => sum + Number(line.dispatched_quantity || 0),
      0,
    );
    return {
      approved,
      dispatched,
      pendingDispatch: Math.max(0, approved - dispatched),
    };
  }, [fulfillmentSnapshot, readOnlyItems]);

  const isOrderFullyDispatched = useMemo(() => {
    const approvedReleases = approvals.filter((app) =>
      isApprovedFinanceRelease(app as Record<string, unknown>),
    );
    if (approvedReleases.length > 0) {
      return approvedReleases.every((app) => isReleaseFullyDispatched(app));
    }
    if (dispatchFulfillment.approved > 0) {
      return dispatchFulfillment.pendingDispatch <= 0;
    }
    return false;
  }, [approvals, isReleaseFullyDispatched, dispatchFulfillment]);

  const canCreateDispatch = useMemo(() => {
    if (status === "cancelled" || status === "on_hold") return false;

    if (!isOrderFullyDispatched && approvals.some(app => isApprovedFinanceRelease(app as Record<string, unknown>))) {
      return true;
    }

    const dispatchableStatuses = [
      "finance_approved",
      "fully_finance_approved",
      "partially_finance_approved",
      "dispatch_pending",
      "partial_dispatch_created",
      "full_dispatch_created",
      "transport_pending",
      "partially_transported",
      "transport_assigned",
      "in_transit",
    ];
    if (dispatchableStatuses.includes(status)) return true;

    const stage = String(detail?.workflow_stage ?? "");
    if (stage === "dispatch_review" || stage === "dispatch_execution") {
      const fas = String(detail?.finance_approval_status ?? "");
      return fas === "partial" || fas === "full" || status !== "finance_review";
    }

    return false;
  }, [status, detail, isOrderFullyDispatched, approvals]);

  const hasPartialDispatch = dispatchFulfillment.dispatched > 0 && !isOrderFullyDispatched;

  const openDispatchModal = useCallback(
    (app?: Record<string, unknown> | null) => {
      const approval =
        app ??
        (primaryDispatchApproval as Record<string, unknown> | null) ??
        null;

      if (!approval && dispatchableApprovals.length === 0) {
        toast.error("No finance-approved quantities remain to dispatch.");
        return;
      }

      setDispatchItemsQuantities(buildInitialDispatchQuantities(approval));
      setDispatchDate(new Date().toISOString().split("T")[0]);
      setActiveApproval(approval);
      setIsCreateDispatchModalOpen(true);
    },
    [
      primaryDispatchApproval,
      dispatchableApprovals.length,
      buildInitialDispatchQuantities,
    ],
  );

  const modalRemainingTotal = useMemo(() => {
    if (!isCreateDispatchModalOpen) return 0;

    let total = 0;
    readOnlyItems.forEach((line) => {
      const orderItemId = String(line._id || "");
      const appItem = activeApproval?.approval_items?.find(
        (ai: Record<string, unknown>) =>
          normalizeOrderItemId(ai.order_item_id) === orderItemId,
      );

      const approved = appItem
        ? Number(appItem.approved_quantity || 0)
        : line.approved_quantity !== undefined
          ? Number(line.approved_quantity || 0)
          : Number(line.ordered_quantity ?? line.quantity ?? 0);

      const alreadyDispatched = activeApproval
        ? (dispatchedQtyByItemForActiveApproval[orderItemId] ?? 0)
        : Number(line.dispatched_quantity || 0);

      total += Math.max(0, approved - alreadyDispatched);
    });
    return total;
  }, [
    isCreateDispatchModalOpen,
    readOnlyItems,
    activeApproval,
    dispatchedQtyByItemForActiveApproval,
  ]);

  const hasDispatchQtyEntered = useMemo(
    () => Object.values(dispatchItemsQuantities).some((qty) => qty > 0),
    [dispatchItemsQuantities],
  );

  const canSubmitCreateDispatch =
    modalRemainingTotal > 0 && hasDispatchQtyEntered && !isCreatingDispatch;

  const canHold = useMemo(() => {
    return ["dispatch_pending", "partial_dispatch_created", "full_dispatch_created", "transport_pending"].includes(status);
  }, [status]);

  const canCancel = useMemo(() => {
    return ["dispatch_pending", "partial_dispatch_created", "on_hold"].includes(status);
  }, [status]);

  const busy = isSubmitting || isCreatingDispatch;

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
    const pendingQty = readOnlyItems.reduce((sum, line) => {
      const explicit = line.pending_dispatch_quantity;
      if (explicit != null && explicit !== "") return sum + Number(explicit || 0);
      return (
        sum +
        Math.max(
          0,
          Number(line.ordered_quantity ?? line.quantity ?? 0) - Number(line.dispatched_quantity || 0),
        )
      );
    }, 0);
    const grandTotal = Number(detail?.grand_total || 0);
    const openFlags = rawFlags.filter((f) => f.status === "open").length;

    return {
      totalLines,
      totalQty,
      dispatchedQty,
      pendingQty,
      grandTotal,
      openFlags,
    };
  }, [detail, readOnlyItems, rawFlags]);

  const createdBy = useMemo(() => {
    const id = resolveUserId(detail?.created_by);
    const found = users.find((u) => String((u as any)._id ?? (u as any).id ?? "") === id);
    return (found && String((found as any).name || (found as any).username || "")) || "Sales";
  }, [detail, resolveUserId, users]);

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

  const [isFulfillmentModalOpen, setIsFulfillmentModalOpen] = useState(false);
  const [isOrderItemsModalOpen, setIsOrderItemsModalOpen] = useState(false);
  const [isOrderDetailsModalOpen, setIsOrderDetailsModalOpen] = useState(false);
  const [isPartyDetailsModalOpen, setIsPartyDetailsModalOpen] = useState(false);

  return (
    <div className="h-[calc(100vh-150px)] md:h-[calc(100vh-160px)] flex flex-col min-h-0 overflow-hidden pb-20 md:pb-0 space-y-4">
      {/* Transitions Dialog */}
      {transitioningTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-xl border border-slate-200/90 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-550 dark:text-slate-50 capitalize">
              Transition to {transitioningTo.replace("dispatch_", "").replace("_", " ")}
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Confirm transition and add comments.
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 font-sans">
                  Remarks (Optional)
                </label>
                <textarea
                  value={transitionRemarks}
                  onChange={(e) => setTransitionRemarks(e.target.value)}
                  rows={3}
                  className="w-full mt-1.5 rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 font-sans"
                  placeholder="Type remarks..."
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

      {/* Create Dispatch Modal */}
      {isCreateDispatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200/90 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-slate-900 transition-all max-h-[90vh] overflow-y-auto">
            <div className="flex flex-col gap-1.5 border-b border-slate-100 pb-3 dark:border-white/5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 font-sans">
                  {hasPartialDispatch ? "Continue Dispatch" : "Create Dispatch"}
                </h3>
                <button
                  type="button"
                  onClick={handleCloseCreateDispatchModal}
                  className="rounded-md text-slate-400 hover:text-slate-505 hover:bg-slate-100 dark:hover:bg-white/5 p-1"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {activeApproval && (
                <div className="flex items-center gap-1 text-[11px] font-sans text-slate-500 dark:text-slate-400">
                  <span>Linked Release:</span>
                  <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded">
                    {activeApproval.approval_no} (Rev #{activeApproval.revision_number})
                  </span>
                </div>
              )}
            </div>

            <form onSubmit={handleCreateDispatch} className="mt-4 space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 font-sans">
                  <label htmlFor="dispatch-date-input" className={labelClass}>Dispatch Date *</label>
                  <input
                    id="dispatch-date-input"
                    type="date"
                    value={dispatchDate}
                    onChange={(e) => setDispatchDate(e.target.value)}
                    className={inputClass}
                    required
                  />
                </div>
                <div className="space-y-1.5 font-sans">
                  <label htmlFor="warehouse-location-input" className={labelClass}>Warehouse Location</label>
                  <input
                    id="warehouse-location-input"
                    type="text"
                    value={warehouseLocation}
                    onChange={(e) => setWarehouseLocation(e.target.value)}
                    className={inputClass}
                    placeholder="E.g., Aisle 4, Shelf B"
                  />
                </div>
              </div>

              <div className="space-y-1.5 font-sans">
                <label htmlFor="dispatch-remarks-input" className={labelClass}>Remarks / Special Instructions</label>
                <textarea
                  id="dispatch-remarks-input"
                  rows={2}
                  value={dispatchRemarks}
                  onChange={(e) => setDispatchRemarks(e.target.value)}
                  className={inputClass}
                  placeholder="E.g., Fragile items, pack with bubble wrap"
                />
              </div>

              <div className="border-t border-slate-200/90 pt-4 dark:border-white/10">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 font-sans mb-3">
                  Select Quantities to Dispatch
                </h4>
                <div className="overflow-x-auto rounded-lg border border-slate-200/60 dark:border-white/5">
                  <table className="w-full text-left text-xs font-sans">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-medium">
                      <tr>
                        <th className="px-4 py-2.5">Product</th>
                        <th className="px-4 py-2.5 text-center">Approved</th>
                        <th className="px-4 py-2.5 text-center">Already Dispatched</th>
                        <th className="px-4 py-2.5 text-center">Remaining</th>
                        <th className="px-4 py-2.5 text-right w-32">Dispatch Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {modalRemainingTotal === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400"
                          >
                            All approved quantities for this release have been dispatched.
                          </td>
                        </tr>
                      ) : null}
                      {readOnlyItems.map((line: Record<string, unknown>) => {
                        const orderItemId = String(line._id || "");
                        const appItem = activeApproval?.approval_items?.find(
                          (ai: Record<string, unknown>) =>
                            normalizeOrderItemId(ai.order_item_id) === orderItemId,
                        );

                        const approved = appItem
                          ? Number(appItem.approved_quantity || 0)
                          : line.approved_quantity !== undefined
                            ? Number(line.approved_quantity || 0)
                            : Number(line.ordered_quantity ?? line.quantity ?? 0);

                        const alreadyDispatched = activeApproval
                          ? (dispatchedQtyByItemForActiveApproval[orderItemId] ?? 0)
                          : Number(line.dispatched_quantity || 0);
                        const remaining = Math.max(0, approved - alreadyDispatched);
                        if (remaining <= 0) return null;

                        const currentVal = dispatchItemsQuantities[orderItemId] ?? 0;

                        return (
                          <tr key={orderItemId} className="bg-white dark:bg-slate-900">
                            <td className="px-4 py-3">
                              <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                                {String(line.product_name || "—")}
                              </span>
                              {line.sku ? (
                                <span className="text-[10px] text-slate-400">
                                  SKU {String(line.sku)}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 text-center text-slate-655 text-slate-500">{approved}</td>
                            <td className="px-4 py-3 text-center text-slate-655 text-slate-500">{alreadyDispatched}</td>
                            <td className="px-4 py-3 text-center font-semibold text-blue-600 dark:text-blue-400">{remaining}</td>
                            <td className="px-4 py-3 text-right">
                              <input
                                type="number"
                                min={0}
                                max={remaining}
                                value={currentVal || ""}
                                onChange={(e) => {
                                  const val = Math.min(remaining, Math.max(0, parseInt(e.target.value) || 0));
                                  setDispatchItemsQuantities((prev) => ({
                                    ...prev,
                                    [orderItemId]: val,
                                  }));
                                }}
                                className="w-20 text-right rounded border border-slate-200 px-2 py-1 text-xs dark:border-white/10 dark:bg-slate-950 text-slate-900 dark:text-slate-50 focus:border-blue-600 focus:outline-none"
                                placeholder="0"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-white/5 font-sans font-medium">
                <button
                  type="button"
                  onClick={handleCloseCreateDispatchModal}
                  className={btnSecondaryClass}
                  disabled={isCreatingDispatch}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canSubmitCreateDispatch}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
                >
                  {isCreatingDispatch
                    ? "Creating Dispatch..."
                    : hasPartialDispatch
                      ? "Continue Dispatch"
                      : "Create Dispatch"}
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
              <h3 className="text-lg font-semibold text-slate-905 text-slate-900 dark:text-slate-50">
                Item Fulfillment Details
              </h3>
              <button
                type="button"
                onClick={() => setIsFulfillmentModalOpen(false)}
                className="rounded-md text-slate-400 hover:text-slate-505 hover:bg-slate-100 dark:hover:bg-white/5 p-1 cursor-pointer"
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
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/5 cursor-pointer font-sans"
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
        <p className="text-sm text-rose-600 dark:text-rose-455 font-sans font-semibold">
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
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <button type="button" onClick={() => router.back()} className="font-medium text-blue-600 hover:underline dark:text-blue-400">Orders</button>
                    <span>/</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Order Details</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate text-lg sm:text-xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
                      {detail.order_no ? String(detail.order_no) : "Order"}
                    </h1>
                    <span className="shrink-0">{renderPriorityBadge(typeof detail.priority === "string" ? detail.priority : "normal")}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>Party: <b className="font-semibold text-slate-700 dark:text-slate-200">{custLabel}</b></span>
                    <span>Date: {formatDateShort(detail.order_date)}</span>
                    <span>EDD: {formatDateShort(detail.expected_delivery_date)}</span>
                  </div>
                </div>
                <button type="button" onClick={handleRefetch} className="shrink-0 rounded-lg border border-slate-200/95 p-2 text-slate-500 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/5" title="Refresh">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
              </div>

              {/* ── Info buttons: 2-col on mobile, inline on sm+ ── */}
              <div className="mt-3 grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:gap-2 font-sans font-medium">
                <button type="button" onClick={() => setIsOrderDetailsModalOpen(true)} className="inline-flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white px-2 py-2 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-semibold text-slate-700 shadow-sm transition dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-white/5 cursor-pointer active:scale-[0.97]">
                  <svg className="h-4 w-4 sm:h-3.5 sm:w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  <span>Order Info</span>
                </button>
                <button type="button" onClick={() => setIsPartyDetailsModalOpen(true)} className="inline-flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white px-2 py-2 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-semibold text-slate-700 shadow-sm transition dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-white/5 cursor-pointer active:scale-[0.97]">
                  <svg className="h-4 w-4 sm:h-3.5 sm:w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                  <span>Party Info</span>
                </button>
              </div>

              {/* ── Fulfillment pipeline ── */}
              <div className="mt-4 border-t border-slate-100 pt-4 dark:border-white/10 flex flex-col w-full bg-slate-50/50 p-3 sm:p-4 rounded-2xl dark:bg-slate-950/20">
                <div className="flex items-center justify-between mb-3 w-full gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">Fulfillment Pipeline<span className="hidden sm:inline"> (vs {orderKpis.totalQty} ordered)</span></span>
                  <button type="button" onClick={() => setIsFulfillmentModalOpen(true)} className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-amber-200/80 bg-white hover:bg-slate-50 px-2.5 py-1.5 text-[10px] sm:text-xs font-bold text-amber-600 shadow-sm transition dark:border-white/10 dark:bg-slate-950 dark:text-amber-400 dark:hover:bg-white/5 cursor-pointer active:scale-[0.98]">Details</button>
                </div>
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
                    className="rounded-lg bg-emerald-600 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-emerald-500 dark:hover:bg-emerald-400 active:scale-[0.98] cursor-pointer"
                  >
                    Approved Items
                  </button>
                  {isOrderFullyDispatched && canCreateDispatch && (<span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-800 ring-1 ring-emerald-600/15 dark:bg-emerald-950/30 dark:text-emerald-300 font-sans">Fully dispatched</span>)}
                  <button type="button" disabled={!canHold || busy} onClick={() => setTransitioningTo("on_hold")} className="rounded-lg bg-amber-600 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]">Hold</button>
                  <button type="button" disabled={status !== "on_hold" || busy} onClick={() => setTransitioningTo("dispatch_pending")} className="rounded-lg bg-blue-600 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]">Resume</button>
                  <button type="button" disabled={!canCancel || busy} onClick={() => setTransitioningTo("cancelled")} className="rounded-lg bg-rose-600 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]">Cancel</button>
                </div>
              </div>

            </div>
          </div>

          {/* ── DESKTOP: Tab Content ── */}
          <div className="hidden md:block flex-1 min-h-0 overflow-y-auto pr-1">
            {activeTab === "flags" && (<FlagsTab orderId={orderId} flagsQ={flagsQ} rawFlags={rawFlags} formatDate={formatDate} userNameById={userNameById} setShowRaiseFlagModal={setShowRaiseFlagModal} currentDepartment="dispatch" refetchOrder={handleRefetch} />)}
            {activeTab === "attachments" && (<AttachmentsTab
              orderId={orderId}
              attachments={attachments}
              isLoading={attachmentsQ.isFetching}
              onUploadSuccess={handleRefetch}
            />
            )}

            {activeTab === "dispatches" && (
              <DispatchesTab
                dispatches={dispatches}
                transports={transports}
                isFetching={dispatchesQ.isFetching}
                isPatchingDispatch={isPatchingDispatch}
                onUpdateStatus={handleUpdateDispatchStatus}
                formatDate={formatDate}
                userNameById={userNameById}
                orderItems={readOnlyItems}
                orderId={orderId}
                orderStatus={status}
                expectedDeliveryDate={detail?.expected_delivery_date ? String(detail.expected_delivery_date) : undefined}
                shippingAddress={(partyDetailQ.data as any)?.shipping_address}
                onRefetch={handleRefetch}
              />
            )}

            {activeTab === "transports" && (
              <TransportsTab
                transports={transports}
                isFetching={transportsQ.isFetching}
                isPatchingTransport={isPatchingTransport}
                onUpdateStatus={handleUpdateTransportStatus}
                formatDate={formatDate}
                orderId={orderId}
                onRefetch={handleRefetch}
              />
            )}

            {activeTab === "finance_releases" && (
              <FinanceReleasesTab
                approvals={approvals}
                isLoading={financeApprovalsQ.isLoading}
                canCreateDispatch={canCreateDispatch}
                busy={busy}
                openDispatchModal={openDispatchModal}
                formatDate={formatDate}
                isReleaseFullyDispatched={isReleaseFullyDispatched}
                releaseHasDispatches={releaseHasDispatches}
              />
            )}
          </div>

          {/* ── DESKTOP: Footer Tab Nav ── */}
          <div className="hidden md:block flex-shrink-0 pt-2 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-slate-955/20 p-2 rounded-xl">
            <OrderDetailTabsNav
              tabs={[
                { id: "finance_releases", name: "Finance Releases", count: approvals.length },
                { id: "dispatches", name: "Dispatches", count: dispatches.length },
                { id: "transports", name: "Transports", count: transports.length },
                {
                  id: "flags",
                  name: "Flags",
                  count: rawFlags.filter((f) => f.status === "open").length,
                  dangerBadge: true,
                },
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
                  {activeTab === "finance_releases" && "Finance Releases"}{activeTab === "flags" && "Flags"}{activeTab === "attachments" && "Attachments"}{activeTab === "dispatches" && "Dispatches"}{activeTab === "transports" && "Transports"}
                </h2>
                <button type="button" onClick={() => setMobileTabOpen(false)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 transition" aria-label="Close panel">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 pb-24">
                {activeTab === "flags" && (<FlagsTab orderId={orderId} flagsQ={flagsQ} rawFlags={rawFlags} formatDate={formatDate} userNameById={userNameById} setShowRaiseFlagModal={setShowRaiseFlagModal} currentDepartment="dispatch" refetchOrder={handleRefetch} />)}
                {activeTab === "attachments" && (<AttachmentsTab orderId={orderId} attachments={attachments} isLoading={attachmentsQ.isFetching} onUploadSuccess={handleRefetch} />)}
                {activeTab === "dispatches" && (<DispatchesTab dispatches={dispatches} transports={transports} isFetching={dispatchesQ.isFetching} isPatchingDispatch={isPatchingDispatch} onUpdateStatus={handleUpdateDispatchStatus} formatDate={formatDate} userNameById={userNameById} orderItems={readOnlyItems} orderId={orderId} orderStatus={status} expectedDeliveryDate={detail?.expected_delivery_date ? String(detail.expected_delivery_date) : undefined} shippingAddress={(partyDetailQ.data as any)?.shipping_address} onRefetch={handleRefetch} />)}
                {activeTab === "transports" && (<TransportsTab transports={transports} isFetching={transportsQ.isFetching} isPatchingTransport={isPatchingTransport} onUpdateStatus={handleUpdateTransportStatus} formatDate={formatDate} orderId={orderId} onRefetch={handleRefetch} />)}
                {activeTab === "finance_releases" && (
                  <DashboardCard title="Finance Release History" description="Audit records and approved item allocations from the finance department.">
                    {financeApprovalsQ.isLoading ? (<p className="text-xs text-slate-500 font-sans">Loading release history...</p>) : approvals.length === 0 ? (<div className="flex flex-col items-center justify-center py-6 text-center"><h3 className="mt-2 text-xs font-semibold text-slate-900 dark:text-slate-200 font-sans">No finance releases</h3></div>) : (<div className="space-y-3 text-xs font-sans">{approvals.map((app: any) => (<div key={app._id} className="rounded-xl border border-slate-200/90 p-3">{app.approval_no}</div>))}</div>)}
                  </DashboardCard>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── MOBILE: Bottom Tab Nav ── */}
      {!isFetching && !isError && detail && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-2">
          <nav className="flex items-stretch justify-around">
            {([
              { id: "finance_releases" as const, name: "Releases", count: approvals.length, dangerBadge: false, icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
              { id: "dispatches" as const, name: "Dispatch", count: dispatches.length, dangerBadge: false, icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg> },
              { id: "transports" as const, name: "Transport", count: transports.length, dangerBadge: false, icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2.556-2.556M13 16H9m4 0h2m2 0h.01M13 16V6m0 0h3l3 4v6h-1M6 16H5m8-10H5" /></svg> },
              { id: "flags" as const, name: "Flags", count: rawFlags.filter((f) => f.status === "open").length, dangerBadge: true, icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" /></svg> },
              { id: "attachments" as const, name: "Files", count: attachmentsCount, dangerBadge: false, icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg> },
            ]).map((tab) => {
              const isActive = activeTab === tab.id && mobileTabOpen;
              return (
                <button key={tab.id} type="button" onClick={() => { if (activeTab === tab.id && mobileTabOpen) { setMobileTabOpen(false); } else { setActiveTab(tab.id); setMobileTabOpen(true); } }} className={`relative flex flex-col items-center justify-center gap-0.5 py-2.5 px-1 flex-1 min-w-0 transition-colors ${isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-slate-400"}`}>
                  <span className={`relative transition-transform ${isActive ? "scale-110" : ""}`}>
                    {tab.icon}
                    {tab.count !== undefined && tab.count > 0 && (<span className={`absolute -top-1.5 -right-1.5 min-w-[1rem] h-4 flex items-center justify-center rounded-full px-1 text-[9px] font-bold ${tab.dangerBadge ? "bg-rose-500 text-white" : "bg-slate-600 text-white dark:bg-slate-300 dark:text-slate-900"}`}>{tab.count}</span>)}
                  </span>
                  <span className={`text-[10px] font-semibold leading-none truncate max-w-full ${isActive ? "text-blue-600 dark:text-blue-400" : ""}`}>{tab.name}</span>
                  {isActive && <span className="absolute top-0 left-2 right-2 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400" />}
                </button>
              );
            })}
          </nav>
        </div>
      )}

      {showRaiseFlagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-lg rounded-xl border border-slate-200/90 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-555 dark:text-slate-50 font-sans">
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

            <form onSubmit={handleRaiseFlag} className="mt-4 space-y-4 font-sans font-normal">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 font-sans">
                  <label htmlFor="flag-dept" className={labelClass}>Target Department</label>
                  <select
                    id="flag-dept"
                    value={newFlagDept}
                    onChange={(e) => setNewFlagDept(e.target.value)}
                    className={inputClass}
                    required
                  >
                    {Object.entries(departmentLabels)
                      .filter(([val]) => val !== "dispatch")
                      .map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                  </select>
                </div>

                <div className="space-y-1.5 font-sans">
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
                <div className="space-y-1.5 font-sans">
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

                <div className="space-y-1.5 font-sans">
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

              <div className="space-y-1.5 font-sans">
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

              <div className="space-y-1.5 font-sans">
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
