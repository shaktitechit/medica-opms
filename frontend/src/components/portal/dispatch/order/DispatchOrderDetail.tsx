"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { FlagsTab } from "./components/FlagsTab";
import AttachmentsTab from "./components/AttachmentsTab";
import { DispatchesTab } from "./components/DispatchesTab";
import { TransportsTab } from "./components/TransportsTab";
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
  useListUsersQuery,
  useTransitionOrderMutation,
  useListFlagsQuery,
  useCreateFlagMutation,
  useCreateDispatchMutation,
  useListAttachmentsQuery,
  useCreateAttachmentMutation,
  usePatchDispatchMutation,
  useListDispatchesQuery,
  useListTransportsQuery,
  usePatchTransportMutation,
  useGetPartyQuery,
  useListOrderFinanceApprovalsQuery,
  useGetOrderFulfillmentQuery,
} from "@/store/api";

import { ALL_FLAG_TYPES, ALLOWED_FLAGS_BY_DEPARTMENT, FLAGS_FOR_TARGET_DEPARTMENT } from "@/components/portal/shared/flagTypes";
import { OrderDetailPageHeader } from "@/components/portal/shared/OrderDetailPageHeader";
import { OrderDetailTabsNav } from "@/components/portal/shared/OrderDetailTabsNav";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
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

function pickList(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as Record<string, unknown>[];
    if (Array.isArray(o.data)) return o.data as Record<string, unknown>[];
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

  const [activeTab, setActiveTab] = useState<"flags" | "dispatches" | "transports" | "attachments">("dispatches");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadRemarks, setUploadRemarks] = useState("");
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





  const [createAttachment, { isLoading: isUploading }] = useCreateAttachmentMutation();
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

  const handleUpdateTransportStatus = useCallback(async (transportId: string, nextStatus: string) => {
    try {
      await patchTransport({
        id: transportId,
        patch: { status: nextStatus },
      }).unwrap();
      toast.success(`Transport status updated to ${nextStatus.replace('_', ' ')}`);
      handleRefetch();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  }, [patchTransport, handleRefetch]);



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

    // If order has pending approved quantities to dispatch, always allow dispatching!
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

  const dispatchHeaderLabel = hasPartialDispatch ? "Continue Dispatch" : "Create Dispatch";

  const canOpenDispatchModal =
    canCreateDispatch && !isOrderFullyDispatched && dispatchableApprovals.length > 0;

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

  const canCreateTransport = useMemo(() => {
    return ["partial_dispatch_created", "full_dispatch_created", "transport_pending"].includes(status);
  }, [status]);

  const canHold = useMemo(() => {
    return ["dispatch_pending", "partial_dispatch_created", "full_dispatch_created", "transport_pending"].includes(status);
  }, [status]);

  const canCancel = useMemo(() => {
    return ["dispatch_pending", "partial_dispatch_created", "on_hold"].includes(status);
  }, [status]);

  const busy = isSubmitting || isUploading || isCreatingDispatch;

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

    const financeApprovals = pickList(financeApprovalsQ.data);
    const financeApprovedQty = financeApprovals.reduce((totalSum: number, approval) => {
      if (!approval || typeof approval !== "object") return totalSum;
      const statusValue = (approval as Record<string, unknown>).approval_status;
      if (statusValue !== "fully_approved" && statusValue !== "partially_approved") {
        return totalSum;
      }
      const items = pickList((approval as Record<string, unknown>).approval_items);
      const approvedForThisApproval = items.reduce((sum: number, item) => {
        if (!item || typeof item !== "object") return sum;
        return sum + Number((item as Record<string, unknown>).approved_quantity || 0);
      }, 0);
      return totalSum + approvedForThisApproval;
    }, 0);

    return {
      totalLines,
      totalQty,
      dispatchedQty,
      pendingQty,
      financeApprovedQty,
      grandTotal,
      openFlags,
    };
  }, [detail, readOnlyItems, rawFlags, financeApprovalsQ.data]);

  return (
    <div className="space-y-6">
      {transitioningTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-xl border border-slate-200/90 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 capitalize font-sans">
              Transition to {transitioningTo.replace("dispatch_", "").replace("_", " ")}
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 font-sans">
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
          <div className="w-full max-w-md rounded-xl border border-slate-200/90 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 font-sans">
              Upload Document / Attachment
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 font-sans">
              Attach files (PDF, Images, etc.) to this order.
            </p>

            <form onSubmit={(e) => void handleUploadSubmit(e)} className="mt-4 space-y-4 font-sans font-normal">
              <div>
                <label className={labelClass}>File</label>
                <input
                  type="file"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full mt-1.5 text-sm text-slate-800 dark:text-slate-200"
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Remarks (Optional)</label>
                <textarea
                  value={uploadRemarks}
                  onChange={(e) => setUploadRemarks(e.target.value)}
                  rows={2}
                  className={inputClass + " mt-1.5"}
                  placeholder="E.g., Delivery challan copy"
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
                  className="rounded-lg border border-slate-200/95 px-3 py-2 text-sm text-slate-800 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white shadow-sm transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
                >
                  {isUploading ? "Uploading..." : "Upload"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


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
                  className="rounded-md text-slate-400 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 p-1"
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
                            <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-400">{approved}</td>
                            <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-400">{alreadyDispatched}</td>
                            <td className="px-4 py-3 text-center font-medium text-blue-600 dark:text-blue-400">{remaining}</td>
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
                  title={
                    modalRemainingTotal <= 0
                      ? "All approved quantities have been dispatched"
                      : !hasDispatchQtyEntered
                        ? "Enter a dispatch quantity for at least one item"
                        : undefined
                  }
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

      {!isFetching && !isError && detail && (
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
              <button
                type="button"
                disabled={busy}
                onClick={() => setIsUploadModalOpen(true)}
                className="rounded-lg bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 px-3 py-1.5 text-xs font-semibold text-white transition disabled:opacity-50"
              >
                Upload Attachment
              </button>
              {canCreateDispatch && (
                <button
                  type="button"
                  disabled={!canOpenDispatchModal || busy}
                  onClick={() => openDispatchModal()}
                  title={
                    isOrderFullyDispatched
                      ? "All approved items and quantities have been dispatched"
                      : dispatchableApprovals.length === 0
                        ? "No finance-approved release available for dispatch"
                        : undefined
                  }
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                >
                  {dispatchHeaderLabel}
                </button>
              )}
              {isOrderFullyDispatched && canCreateDispatch && (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-800 ring-1 ring-emerald-600/15 dark:bg-emerald-950/30 dark:text-emerald-300">
                  Fully dispatched
                </span>
              )}
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
                onClick={() => setTransitioningTo("dispatch_pending")}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Resume Dispatch
              </button>
              <button
                type="button"
                disabled={!canCancel || busy}
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
        <p className="text-sm text-rose-600 dark:text-rose-400 font-sans font-medium">
          Could not load order details.
        </p>
      )}

      {!isFetching && !isError && detail && (
        <>
          {/* <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[
              ["Total Items", String(orderKpis.totalLines), "Catalog lines"],
              ["Total Qty", String(orderKpis.totalQty), "Ordered quantity"],
              ["Pending Qty", String(orderKpis.pendingQty), "Pending dispatch"],
              ["Dispatched", String(orderKpis.dispatchedQty), "Completed qty"],
              ["Finance Approved", String(orderKpis.financeApprovedQty), "Approved quantity"],
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
                <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 font-sans">
                  {help}
                </div>
              </div>
            ))}
          </div> */}

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

          {/* Finance Release History */}
          <DashboardCard
            title="Finance Release History"
            description="Audit records and approved item allocations from the finance department."
          >
            {financeApprovalsQ.isLoading ? (
              <p className="text-xs text-slate-500 font-sans">Loading release history...</p>
            ) : approvals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <svg className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <h3 className="mt-2 text-xs font-semibold text-slate-900 dark:text-slate-200 font-sans">No finance releases</h3>
                <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 font-sans">No releases have been recorded for this order yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {approvals.map((app: any) => (
                  <div
                    key={app._id}
                    className="rounded-xl border border-slate-200/90 bg-slate-50/20 p-4 shadow-sm transition dark:border-white/10 dark:bg-slate-950/20 hover:border-slate-300 dark:hover:border-white/20"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-2.5 dark:border-white/5">
                      <div>
                        <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-100 font-sans">
                          {app.approval_no}
                        </span>
                        <span className="mx-2 text-slate-300 font-sans">|</span>
                        <span className="text-[10px] text-slate-500 font-sans">
                          Rev #{app.revision_number}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(String(app.approval_status || ""))} font-sans`}
                        >
                          {formatFinanceReleaseStatus(app.approval_status)}
                        </span>
                        {isApprovedFinanceRelease(app as Record<string, unknown>) &&
                        canCreateDispatch ? (
                          isReleaseFullyDispatched(app as Record<string, unknown>) ? (
                            <span className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 ring-1 ring-emerald-600/15 px-2 py-0.5 text-[10px] font-semibold font-sans">
                              Dispatch completed
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                openDispatchModal(app as Record<string, unknown>)
                              }
                              className="rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed px-2.5 py-1 text-xs font-semibold text-white font-sans transition"
                            >
                              {releaseHasDispatches(app as Record<string, unknown>)
                                ? "Continue Dispatch"
                                : "Create Dispatch"}
                            </button>
                          )
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 text-[11px] sm:grid-cols-3 font-sans">
                      <div className="rounded-lg bg-white p-2 border border-slate-100 dark:bg-slate-900 dark:border-white/5">
                        <span className="block text-slate-400 text-[9px] uppercase font-semibold">Credit Limit Checked</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {app.credit_limit_checked ? "✅ Yes" : "❌ No"}
                        </span>
                      </div>
                      <div className="rounded-lg bg-white p-2 border border-slate-100 dark:bg-slate-900 dark:border-white/5">
                        <span className="block text-slate-400 text-[9px] uppercase font-semibold">Outstanding Checked</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {app.outstanding_checked ? "✅ Yes" : "❌ No"}
                        </span>
                      </div>
                      <div className="rounded-lg bg-white p-2 border border-slate-100 dark:bg-slate-900 dark:border-white/5">
                        <span className="block text-slate-400 text-[9px] uppercase font-semibold">Approved Total</span>
                        <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                          {app.approved_total_amount ? Number(app.approved_total_amount).toFixed(2) : "0.00"}
                        </span>
                      </div>
                    </div>

                    {app.approval_items && app.approval_items.length > 0 && (
                      <div className="mt-3 overflow-x-auto rounded border border-slate-100 dark:border-white/5 text-[10px] font-sans">
                        <table className="w-full text-left bg-white/40 dark:bg-slate-900/30">
                          <thead>
                            <tr className="bg-slate-100/50 dark:bg-slate-950/40 text-slate-500 font-semibold border-b border-slate-100 dark:border-white/5">
                              <th className="px-2 py-1">Item</th>
                              <th className="px-2 py-1 text-right">Ordered</th>
                              <th className="px-2 py-1 text-right">Approved</th>
                              <th className="px-2 py-1">Remarks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {app.approval_items.map((it: any) => (
                              <tr key={it._id || it.order_item_id}>
                                <td className="px-2 py-1.5 font-medium">{it.product?.product_name || "—"}</td>
                                <td className="px-2 py-1.5 text-right font-medium">{it.ordered_quantity}</td>
                                <td className="px-2 py-1.5 text-right font-medium text-slate-700 dark:text-slate-300">
                                  {it.approved_quantity}
                                </td>
                                <td className="px-2 py-1.5 text-slate-500 italic truncate max-w-[150px]" title={it.remarks || it.rejection_reason || it.hold_reason}>
                                  {it.remarks || it.rejection_reason || it.hold_reason || "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="mt-3 text-xs font-sans text-slate-600 dark:text-slate-300">
                      {app.approval_notes && (
                        <p className="bg-white p-2 rounded-lg border border-slate-100 dark:bg-slate-900 dark:border-white/5">
                          <span className="font-semibold text-slate-500 mr-1">Audit Notes:</span>
                          {app.approval_notes}
                        </p>
                      )}
                    </div>

                    <div className="mt-2 text-[10px] text-slate-500 text-right">
                      Reviewed on {formatDate(app.reviewed_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DashboardCard>

          <OrderDetailTabsNav
            tabs={[
              {
                id: "dispatches",
                name: "Dispatches",
                count: dispatches.length,
              },
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

          {/* TABS CONTENT */}

          {activeTab === "flags" && (
            <FlagsTab
              orderId={orderId}
              flagsQ={flagsQ}
              rawFlags={rawFlags}
              formatDate={formatDate}
              userNameById={userNameById}
              setShowRaiseFlagModal={setShowRaiseFlagModal}
              currentDepartment="dispatch"
              refetchOrder={handleRefetch}
            />
          )}

          {activeTab === "attachments" && (
            <AttachmentsTab
              orderId={orderId}
              attachments={attachments}
              isLoading={attachmentsQ.isFetching}
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
            />
          )}

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

                <form onSubmit={(e) => void handleRaiseFlag(e)} className="mt-4 space-y-4 font-sans font-normal">
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
                          .filter(([val]) => val !== "dispatch")
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

                  <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-white/5 font-medium">
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
        </>
      )}
    </div>
  );
}
