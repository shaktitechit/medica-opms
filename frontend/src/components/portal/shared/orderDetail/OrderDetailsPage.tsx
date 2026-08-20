/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, AlertTriangle, Truck } from "lucide-react";

import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { Button } from "@/components/ui/Button";
import {
  buildPartyNameById,
  buildPartySraById,
  checkOrderPartySra,
  pickList as pickPartyList,
  resolveOrderCounterparty,
} from "@/components/portal/sales/partyDisplay";
import { isOrderClosed } from "@/components/portal/sales/orderUtils";
import {
  filterAccountApprovalsForUser,
  idFromRef,
} from "@/components/portal/shared/orderDetail/accountDispatchAvailability";
import {
  FINANCE_ORDER_TAB_LABELS,
  getFinanceOrderTabCategory,
  type FinanceOrderTabCategory,
} from "@/components/portal/finance/financeOrderUtils";
import {
  buildOrderWorkflowCategoryOptions,
  getOrderWorkflowTabCategory,
  isFulfillmentComplete,
} from "@/components/portal/shared/orderList/orderWorkflowTabs";
import { withAdminApprovalQuantities } from "@/components/portal/shared/orderAdminApprovalDisplay";
import { OrderDetailTabsNav } from "@/components/portal/shared/OrderDetailTabsNav";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import { computeOrderLifecycleActionCaps } from "@/components/portal/shared/orderLifecycleActions";
import { ItemFulfillmentDetailsModal } from "@/components/portal/shared/ItemFulfillmentDetailsModal";
import {
  OrderFulfillmentPipelineStrip,
  buildOrderFulfillmentPipelineSteps,
  DEFAULT_ORDER_PIPELINE_ICONS,
} from "@/components/portal/shared/FulfillmentCircleStep";
import { computeDepartmentStageBoxes } from "@/components/portal/shared/orderDepartmentStages";
import FinalOrderStatementModal from "@/components/portal/shared/FinalOrderStatementModal";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { buildUserNameById } from "@/components/portal/shared/userDisplay";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/store/hooks";
import {
  useApproveOrderApprovalMutation,
  useCreateOrderApprovalMutation,
  useGetOrderFulfillmentQuery,
  useGetOrderQuery,
  useGetPartyQuery,
  useListAttachmentsQuery,
  useListDispatchesQuery,
  useListEligibleTransportOrdersQuery,
  useListFlagsQuery,
  useListOrderApprovalsQuery,
  useListOrderDeliveriesQuery,
  useListOrderDueSheetsQuery,
  useListOrderReturnsQuery,
  useListPartiesQuery,
  useListRemindersQuery,
  useListTransportAgentsQuery,
  useListTransportsQuery,
  useListUsersQuery,
  usePatchDispatchMutation,
  usePatchOrderMutation,
  usePatchTransportMutation,
  useTransitionOrderMutation,
} from "@/store/api";

import { agentLabel } from "@/components/portal/shared/transportPlanner/transportPlanUtils";
import { OrderDetailTabContent } from "./OrderDetailTabContent";
import OrderDetailsModal from "./modals/OrderDetailsModal";
import PartyDetailsModal from "./modals/PartyDetailsModal";
import TransportPlanModal from "./modals/TransportPlanModal";
import { mobileTabIcon } from "./orderDetailMobileIcons";
import {
  detailRefId,
  filterAttachmentsByVisibility,
  formatDateShort,
  MOBILE_TAB_SHORT_LABELS,
  pickList,
  pickOrderAttachments,
  renderPriorityBadge,
  TAB_LABELS,
} from "./orderDetailUtils";
import {
  hasHeaderAction,
  type OrderDetailTabId,
  type OrderDetailsPageConfig,
} from "./orderDetailsPageConfig";

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
    case "transport_pending":
      bgClass =
        "bg-amber-50 text-amber-700 ring-amber-600/10 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-500/25";
      break;
    case "in_transit":
      bgClass =
        "bg-sky-50 text-sky-700 ring-sky-600/10 dark:bg-sky-950/30 dark:text-sky-400 dark:ring-sky-500/25";
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

export default function OrderDetailsPage({
  orderId,
  config,
}: {
  orderId: string;
  config: OrderDetailsPageConfig;
}) {
  const router = useRouter();
  const currentUser = useAppSelector((state) => state.auth.user);
  const currentUserId = useMemo(
    () => String(currentUser?._id ?? currentUser?.id ?? ""),
    [currentUser],
  );

  const needsApprovals =
    Boolean(config.approvalsMode) ||
    config.dispatchesMode === "dispatch_ops";
  const needsDeliveries = config.tabs.includes("deliveries");
  const needsReturns = config.tabs.includes("returns");
  const needsReminders = config.tabs.includes("reminders");
  const needsDueSheets = config.tabs.includes("due_sheet");
  const needsFinanceExtras = config.approvalsMode === "finance";
  const needsAdminApprovals = config.approvalsMode === "admin";
  const needsDispatchOps =
    config.dispatchesMode === "dispatch_ops" ||
    config.transportsMode === "dispatch_ops";

  const { data, isLoading, isFetching, isError, refetch } =
    useGetOrderQuery(orderId);
  const partiesQ = useListPartiesQuery({});
  const usersQ = useListUsersQuery({});
  const fulfillmentQ = useGetOrderFulfillmentQuery(orderId);
  const dispatchesQ = useListDispatchesQuery({ order: orderId });
  const transportsQ = useListTransportsQuery({ order: orderId });
  const deliveriesQ = useListOrderDeliveriesQuery(
    { order: orderId },
    { skip: !needsDeliveries },
  );
  const returnsQ = useListOrderReturnsQuery(
    { order: orderId },
    { skip: !needsReturns },
  );
  const approvalsQ = useListOrderApprovalsQuery(
    { order: orderId },
    { skip: !orderId || !needsApprovals },
  );
  const financeApprovalsQ = useListOrderApprovalsQuery(
    { order: orderId, is_admin_approved: true },
    { skip: !orderId || !needsFinanceExtras },
  );
  const adminApprovalsQ = useListOrderApprovalsQuery(
    { order: orderId },
    { skip: !orderId || !needsAdminApprovals },
  );
  const financeAssignedApprovalsQ = useListOrderApprovalsQuery(
    { order: orderId, assigned_finance_user: currentUserId },
    { skip: !orderId || !currentUserId || !needsFinanceExtras },
  );
  const remindersQ = useListRemindersQuery(
    { order: orderId },
    { skip: !orderId || !needsReminders },
  );
  const dueSheetsQ = useListOrderDueSheetsQuery(
    { order: orderId },
    { skip: !orderId || !needsDueSheets },
  );
  const attachQ = useListAttachmentsQuery({
    entity_type: "order",
    entity_id: orderId,
  });
  const flagsQ = useListFlagsQuery({ order: orderId });

  const detail =
    data && typeof data === "object"
      ? (data as Record<string, unknown>)
      : null;
  const status = deriveOrderWorkflowStatus(detail);

  const [transitionOrder, { isLoading: isSubmitting }] =
    useTransitionOrderMutation();
  const [patchOrder, { isLoading: isPatching }] = usePatchOrderMutation();
  const [patchDispatch, { isLoading: isPatchingDispatch }] =
    usePatchDispatchMutation();
  const [patchTransport, { isLoading: isPatchingTransport }] =
    usePatchTransportMutation();
  const [createFinanceApproval] = useCreateOrderApprovalMutation();
  const [approveFinanceApproval] = useApproveOrderApprovalMutation();

  const [transitioningTo, setTransitioningTo] = useState<string | null>(null);
  const [transitionRemarks, setTransitionRemarks] = useState("");
  const [confirmResolveOpen, setConfirmResolveOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<OrderDetailTabId>(
    config.defaultTab,
  );
  const [mobileTabOpen, setMobileTabOpen] = useState(false);
  const [isFulfillmentModalOpen, setIsFulfillmentModalOpen] = useState(false);
  const [isOrderDetailsModalOpen, setIsOrderDetailsModalOpen] = useState(false);
  const [isPartyDetailsModalOpen, setIsPartyDetailsModalOpen] = useState(false);
  const [isTransportPlanModalOpen, setIsTransportPlanModalOpen] = useState(false);
  const [isFinalStatementOpen, setIsFinalStatementOpen] = useState(false);

  const userNameById = useMemo(
    () => buildUserNameById(usersQ.data),
    [usersQ.data],
  );
  const users = useMemo(
    () => pickList(usersQ.data) as Record<string, unknown>[],
    [usersQ.data],
  );

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
      const userId =
        typeof userVal === "string"
          ? userVal
          : String(
              (userVal as { _id?: unknown; id?: unknown } | null)?._id ??
                (userVal as { id?: unknown } | null)?.id ??
                "",
            );
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
    [users],
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
    const dept = String(
      detail.current_department ?? detail.pending_with_role ?? "",
    );
    return (
      dept === "account" && idFromRef(detail.current_assignee) === currentUserId
    );
  }, [detail, currentUserId]);

  const currentPartyId = useMemo(
    () => (detail ? detailRefId(detail.party) : ""),
    [detail],
  );
  const partyDetailQ = useGetPartyQuery(currentPartyId, {
    skip: !currentPartyId,
  });

  const eligibleTransportQ = useListEligibleTransportOrdersQuery(
    { limit: 200 },
    { skip: !orderId },
  );

  const dispatches = useMemo(
    () => pickList(dispatchesQ.data),
    [dispatchesQ.data],
  );
  const transports = useMemo(
    () => pickList(transportsQ.data),
    [transportsQ.data],
  );

  const agentsQ = useListTransportAgentsQuery({});

  const agentNameById = useMemo(() => {
    const map = new Map<string, string>();
    const list = Array.isArray(agentsQ.data) ? agentsQ.data : [];
    for (const a of list) {
      if (!a || typeof a !== "object") continue;
      const id = String(a._id || a.id || "");
      const name = a.agent_name || a.agent_code || id;
      if (id && name) map.set(id, name);
    }
    return map;
  }, [agentsQ.data]);

  const resolveAgentName = useCallback(
    (agentVal: unknown): string => {
      if (!agentVal) return "";
      const label = agentLabel(agentVal as any);
      if (label && label !== "—" && !/^[0-9a-fA-F]{24}$/.test(label)) {
        return label;
      }
      const rawId =
        typeof agentVal === "string"
          ? agentVal
          : String((agentVal as { _id?: unknown; id?: unknown })?._id ?? (agentVal as { id?: unknown })?.id ?? "");
      if (rawId && agentNameById.has(rawId)) {
        return agentNameById.get(rawId)!;
      }
      return label !== "—" ? label : "";
    },
    [agentNameById],
  );

  const activeTransportInfo = useMemo(() => {
    // Check direct transports list first
    for (const t of transports) {
      if (!t || typeof t !== "object") continue;
      const row = t as Record<string, unknown>;
      if (row.shipment_status === "cancelled" || row.status === "cancelled") continue;
      const agent = row.transport_agent;
      const date = row.dispatch_date || row.expected_delivery_date;
      const resolvedName = resolveAgentName(agent);
      if (resolvedName || date) {
        return {
          agentName: resolvedName || undefined,
          scheduledDate: date ? String(date) : undefined,
        };
      }
    }

    // Check transport plan / eligible orders enrichment
    const eligibleOrders = eligibleTransportQ.data?.data ?? [];
    const match = eligibleOrders.find((r) => String(r._id || r.id || "") === orderId);
    if (match) {
      const plan = match.transport_plan;
      const shipment = match.transport;
      if (plan || shipment) {
        const agent = shipment?.transport_agent || plan?.transport_agent;
        const date = shipment?.dispatch_date || plan?.plan_date;
        const resolvedName = resolveAgentName(agent);
        if (resolvedName || date) {
          return {
            agentName: resolvedName || undefined,
            scheduledDate: date ? String(date) : undefined,
          };
        }
      }
    }

    return null;
  }, [transports, eligibleTransportQ.data, orderId, resolveAgentName]);
  const deliveries = useMemo(
    () => pickList(deliveriesQ.data),
    [deliveriesQ.data],
  );
  const returns = useMemo(() => pickList(returnsQ.data), [returnsQ.data]);
  const accountApprovals = useMemo(
    () => filterAccountApprovalsForUser(pickList(approvalsQ.data)),
    [approvalsQ.data],
  );

  const attachmentsList = useMemo(() => {
    const all = pickOrderAttachments(attachQ.data, orderId);
    return filterAttachmentsByVisibility(all, config.attachmentVisibility);
  }, [attachQ.data, orderId, config.attachmentVisibility]);

  const attachCount = attachmentsList.length;
  const remindersCount = useMemo(
    () => pickList(remindersQ.data).length,
    [remindersQ.data],
  );
  const dueSheetsCount = useMemo(
    () => pickList(dueSheetsQ.data).length,
    [dueSheetsQ.data],
  );
  const rawFlags = useMemo(
    () => pickList(flagsQ.data) as Record<string, unknown>[],
    [flagsQ.data],
  );

  const orderItems = useMemo(() => {
    if (!detail || !Array.isArray(detail.order_items)) return [];
    return detail.order_items as Record<string, unknown>[];
  }, [detail]);

  const adminReadOnlyItems = useMemo(() => {
    if (!needsAdminApprovals) return orderItems;
    return withAdminApprovalQuantities(
      orderItems,
      pickList(adminApprovalsQ.data),
    );
  }, [needsAdminApprovals, orderItems, adminApprovalsQ.data]);

  const financeAssignedCount = useMemo(() => {
    return pickList(financeAssignedApprovalsQ.data).filter((app) => {
      const assigneeId =
        typeof app.assigned_finance_user === "string"
          ? app.assigned_finance_user
          : String(
              (
                app.assigned_finance_user as
                  | { _id?: unknown; id?: unknown }
                  | undefined
              )?._id ??
                (app.assigned_finance_user as { id?: unknown } | undefined)
                  ?.id ??
                "",
            );
      return assigneeId && assigneeId === currentUserId;
    }).length;
  }, [financeAssignedApprovalsQ.data, currentUserId]);

  const categoryOptions = useMemo(
    () =>
      buildOrderWorkflowCategoryOptions({
        transports: pickPartyList(transportsQ.data),
        dispatches: pickPartyList(dispatchesQ.data),
      }),
    [transportsQ.data, dispatchesQ.data],
  );
  const workflowTabCategory = useMemo(
    () =>
      config.showFinanceWorkflowBadge
        ? getFinanceOrderTabCategory(detail, categoryOptions)
        : null,
    [config.showFinanceWorkflowBadge, detail, categoryOptions],
  );

  const totalApproved = useMemo(() => {
    if (!detail || !Array.isArray(detail.order_items)) return 0;
    return detail.order_items.reduce(
      (sum, item: any) => sum + Number(item.approved_quantity ?? 0),
      0,
    );
  }, [detail]);
  const hasRemainingQty = useMemo(() => {
    if (!detail || !Array.isArray(detail.order_items)) return false;
    return detail.order_items.some((item: any) => {
      const approvedSoFar = Number(item.approved_quantity ?? 0);
      const remainingQty = Math.max(
        0,
        Number(item.sales_approved_quantity ?? 0) - approvedSoFar,
      );
      return remainingQty > 0;
    });
  }, [detail]);

  const handleRefetch = useCallback(() => {
    refetch();
    if (!fulfillmentQ.isUninitialized) fulfillmentQ.refetch();
    if (!attachQ.isUninitialized) attachQ.refetch();
    if (!dispatchesQ.isUninitialized) void dispatchesQ.refetch();
    if (!transportsQ.isUninitialized) void transportsQ.refetch();
    if (!deliveriesQ.isUninitialized) void deliveriesQ.refetch();
    if (!returnsQ.isUninitialized) void returnsQ.refetch();
    if (!approvalsQ.isUninitialized) void approvalsQ.refetch();
    if (!financeApprovalsQ.isUninitialized) void financeApprovalsQ.refetch();
    if (!adminApprovalsQ.isUninitialized) void adminApprovalsQ.refetch();
    if (!financeAssignedApprovalsQ.isUninitialized)
      void financeAssignedApprovalsQ.refetch();
    if (!remindersQ.isUninitialized) void remindersQ.refetch();
    if (!dueSheetsQ.isUninitialized) void dueSheetsQ.refetch();
    if (!flagsQ.isUninitialized) void flagsQ.refetch();
  }, [
    refetch,
    fulfillmentQ,
    attachQ,
    dispatchesQ,
    transportsQ,
    deliveriesQ,
    returnsQ,
    approvalsQ,
    financeApprovalsQ,
    adminApprovalsQ,
    financeAssignedApprovalsQ,
    remindersQ,
    dueSheetsQ,
    flagsQ,
  ]);

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
        patch: { order_items: updatedItems },
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

  const handleUpdateDispatchStatus = useCallback(
    async (dispatchId: string, nextStatus: string) => {
      try {
        await patchDispatch({
          id: dispatchId,
          patch: { status: nextStatus },
        }).unwrap();
        toast.success(
          `Dispatch status updated to ${nextStatus.replace("_", " ")}`,
        );
        handleRefetch();
      } catch (err) {
        toast.error(mutationRejectedMessage(err));
      }
    },
    [patchDispatch, handleRefetch],
  );

  const handleUpdateTransportStatus = useCallback(
    async (
      transportId: string,
      nextStatus: string,
      remarks?: string,
      suppressToast?: boolean,
    ) => {
      try {
        await patchTransport({
          id: transportId,
          patch: { status: nextStatus, ...(remarks ? { remarks } : {}) },
        }).unwrap();
        const refreshed = await refetch();
        const order = refreshed.data as Record<string, unknown> | undefined;
        const orderClosed = isOrderClosed(order);
        if (!suppressToast && !orderClosed) {
          toast.success(
            `Transport status updated to ${nextStatus.replace(/_/g, " ")}`,
          );
        }
        handleRefetch();
      } catch (err) {
        toast.error(mutationRejectedMessage(err));
      }
    },
    [patchTransport, refetch, handleRefetch],
  );

  const handleTransition = useCallback(
    async (nextStatus: string) => {
      if (nextStatus === "finance_rejected" && !transitionRemarks.trim()) {
        toast.error("Rejection reason is required.");
        return;
      }
      try {
        // Cancel / reject must only update workflow + status — never rewrite
        // order / line quantities via finance approval create/decide.
        if (
          config.approvalsMode === "finance" &&
          nextStatus === "finance_approved"
        ) {
          const approvalItems = orderItems
            .map((line) => {
              const ordered = Number(
                line.ordered_quantity ?? line.quantity ?? 0,
              );
              const alreadyApproved = Number(line.approved_quantity || 0);
              const remaining = Math.max(0, ordered - alreadyApproved);
              const approveQty = remaining > 0 ? remaining : ordered;
              if (approveQty <= 0) return null;
              return {
                order_item_id: line._id,
                approved_quantity: approveQty,
                approval_status:
                  approveQty >= ordered
                    ? "fully_approved"
                    : "partially_approved",
              };
            })
            .filter(Boolean);

          const approval = await createFinanceApproval({
            order: orderId,
            approval_status: "pending_review",
            approval_notes: transitionRemarks.trim() || undefined,
            approval_items: approvalItems,
          }).unwrap();
          const approvalId = readId(approval);
          if (!approvalId)
            throw new Error("Finance approval id missing from response");

          await approveFinanceApproval({
            id: approvalId,
            body: {
              approval_notes: transitionRemarks.trim() || undefined,
            },
          }).unwrap();
        } else {
          await transitionOrder({
            id: orderId,
            body: {
              next_status: nextStatus,
              remarks: transitionRemarks.trim() || undefined,
              ...(nextStatus === "finance_rejected"
                ? { rejection_reason: transitionRemarks.trim() }
                : {}),
            },
          }).unwrap();
        }
        toast.success(
          `Order successfully transitioned to ${nextStatus.split("_").join(" ")}`,
        );
        setTransitioningTo(null);
        setTransitionRemarks("");
        handleRefetch();
      } catch (rejected) {
        toast.error(mutationRejectedMessage(rejected));
      }
    },
    [
      config.approvalsMode,
      orderId,
      transitionRemarks,
      transitionOrder,
      handleRefetch,
      orderItems,
      createFinanceApproval,
      approveFinanceApproval,
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
  const custLabel = detail
    ? resolveOrderCounterparty(detail, partyNameById)
    : "—";
  const orderNo = detail
    ? String(
        detail.order_no || detail.order_number || `ID: ${orderId.slice(0, 8)}`,
      )
    : "";

  const stageBoxes = useMemo(
    () =>
      computeDepartmentStageBoxes(detail, fulfillmentSnapshot, {
        returns,
        dispatches,
      }),
    [detail, fulfillmentSnapshot, returns, dispatches],
  );

  const orderKpis = useMemo(() => {
    const totals =
      fulfillmentSnapshot?.totals &&
      typeof fulfillmentSnapshot.totals === "object"
        ? (fulfillmentSnapshot.totals as Record<string, unknown>)
        : null;
    const totalQty = Number(
      totals?.ordered ??
        orderItems.reduce(
          (sum, line) =>
            sum + Number(line.ordered_quantity ?? line.quantity ?? 0),
          0,
        ),
    );
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
    const dispatchedQty = Number(
      totals?.dispatched ??
        orderItems.reduce(
          (sum, line) => sum + Number(line.dispatched_quantity || 0),
          0,
        ),
    );
    return { totalQty, adminApprovedQty, financeApprovedQty, dispatchedQty };
  }, [fulfillmentSnapshot, orderItems]);

  const pipelineSteps = useMemo(
    () =>
      buildOrderFulfillmentPipelineSteps(
        stageBoxes,
        DEFAULT_ORDER_PIPELINE_ICONS,
        { defaultTotal: orderKpis.totalQty },
      ),
    [stageBoxes, orderKpis.totalQty],
  );

  const canShowFinalStatement = useMemo(
    () => isFulfillmentComplete(detail),
    [detail],
  );

  const sharedLifecycleCaps = useMemo(
    () => computeOrderLifecycleActionCaps({ status, dispatches }),
    [status, dispatches],
  );

  const canHold = sharedLifecycleCaps.canHold;
  const canCancel = sharedLifecycleCaps.canCancel;
  const canReject = sharedLifecycleCaps.canReject;
  const lockReason = sharedLifecycleCaps.lockReason;

  const adminAllowedTransitions = useMemo(() => {
    if (status === "draft") return ["submitted", "cancelled"];
    if (status === "submitted")
      return ["sales_approved", "finance_review", "on_hold", "cancelled"];
    if (status === "sales_approved")
      return ["finance_review", "on_hold", "cancelled"];
    if (status === "on_hold") return ["submitted", "finance_review", "cancelled"];
    if (status === "finance_rejected") return ["submitted", "cancelled"];
    return [];
  }, [status]);

  const canResume = useMemo(() => {
    if (!hasHeaderAction(config, "resume") || !config.resumeTargetStatus)
      return false;
    if (config.approvalsMode === "admin") {
      return adminAllowedTransitions.includes(config.resumeTargetStatus);
    }
    if (config.approvalsMode === "finance") {
      return status === "on_hold" && !sharedLifecycleCaps.hasSubmittedDispatch;
    }
    if (config.lifecycleCapsMode === "dispatch") {
      return status === "on_hold";
    }
    return false;
  }, [
    config,
    adminAllowedTransitions,
    status,
    sharedLifecycleCaps.hasSubmittedDispatch,
  ]);

  const resumeLabel = useMemo(() => {
    if (config.approvalsMode === "admin") {
      if (status === "draft") return "Submit Order";
      if (status === "finance_rejected") return "Resubmit Order";
      if (status === "on_hold") return "Resume Order";
      return "Submit / Resume Order";
    }
    return "Resume";
  }, [config.approvalsMode, status]);

  const busy = isSubmitting || isPatching;

  const tabCounts = useMemo(() => {
    const map: Partial<Record<OrderDetailTabId, number>> = {
      approvals:
        config.approvalsMode === "finance"
          ? financeAssignedCount
          : config.approvalsMode === "admin"
            ? pickList(adminApprovalsQ.data).length
            : accountApprovals.length,
      dispatches: dispatches.length,
      transports: transports.length,
      deliveries: deliveries.length,
      returns: returns.length,
      due_sheet: dueSheetsCount,
      flags: rawFlags.filter((f) => f.status === "open").length,
      attachments: attachCount,
      reminders: remindersCount,
    };
    return map;
  }, [
    config.approvalsMode,
    financeAssignedCount,
    adminApprovalsQ.data,
    accountApprovals.length,
    dispatches.length,
    transports.length,
    deliveries.length,
    returns.length,
    dueSheetsCount,
    rawFlags,
    attachCount,
    remindersCount,
  ]);

  const desktopTabs = useMemo(
    () =>
      config.tabs.map((id) => ({
        id,
        name:
          id === "approvals" && config.approvalsMode === "admin"
            ? "Order Approval"
            : TAB_LABELS[id] ?? id,
        count: tabCounts[id],
        dangerBadge: id === "flags",
      })),
    [config.tabs, config.approvalsMode, tabCounts],
  );

  const partyData = partyDetailQ.data as Record<string, unknown> | undefined;
  const partyMobile = partyData ? String(partyData.mobile ?? "") : undefined;
  const partyEmail = partyData ? String(partyData.email ?? "") : undefined;

  const tabContentProps = {
    config,
    activeTab,
    orderId,
    detail: detail as Record<string, unknown>,
    orderItems,
    status,
    partyLabel: custLabel,
    isAssignedToMe,
    adminReadOnlyItems,
    flagsQ,
    rawFlags,
    userNameById,
    attachments: attachmentsList,
    attachmentsLoading: attachQ.isFetching,
    refetchOrder: handleRefetch,
    dispatches,
    transports,
    returns,
    dispatchesFetching: dispatchesQ.isFetching,
    transportsFetching: transportsQ.isFetching,
    returnsFetching: returnsQ.isFetching,
    isPatchingDispatch: needsDispatchOps ? isPatchingDispatch : undefined,
    isPatchingTransport: needsDispatchOps ? isPatchingTransport : undefined,
    onUpdateDispatchStatus: needsDispatchOps
      ? handleUpdateDispatchStatus
      : undefined,
    onUpdateTransportStatus: needsDispatchOps
      ? handleUpdateTransportStatus
      : undefined,
    expectedDeliveryDate: detail?.expected_delivery_date
      ? String(detail.expected_delivery_date)
      : undefined,
    shippingAddress: partyData?.shipping_address,
    partyMobile,
    partyEmail,
    orderNo,
  };

  if (isError || (!isLoading && !detail)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-4 font-sans">
        <AlertTriangle className="h-10 w-10 text-red-500 mb-2" />
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
          Failed to load order
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
          The order record could not be found or you have insufficient access
          permissions.
        </p>
        <button
          type="button"
          onClick={() => router.push(config.ordersListPath)}
          className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue-650 hover:underline dark:text-blue-400"
        >
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
      {transitioningTo && (
        <LargeModalPortal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
            <div className="w-full max-w-md rounded-xl border border-slate-200/90 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 capitalize">
                Transition to {transitioningTo.replace(/_/g, " ")}
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
                      : "Remarks / Action Notes (Optional)"}
                  </label>
                  <textarea
                    value={transitionRemarks}
                    onChange={(e) => setTransitionRemarks(e.target.value)}
                    rows={3}
                    className="w-full mt-1.5 rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-955 dark:text-slate-50 font-sans"
                    placeholder={
                      transitioningTo === "finance_rejected"
                        ? "Type rejection reason..."
                        : "Provide notes for this transition..."
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
                <Button onClick={() => void handleTransition(transitioningTo)}>
                  Confirm
                </Button>
              </div>
            </div>
          </div>
        </LargeModalPortal>
      )}

      {confirmResolveOpen && (
        <LargeModalPortal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
            <div className="w-full max-w-md rounded-xl border border-slate-200/90 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                Confirm Resolve Partial Release
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                This will set ordered quantities to the approved amounts and mark
                the order as fully finance approved.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={() => setConfirmResolveOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={() => void handleResolveOrder()}>
                  Confirm Resolve
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
        returns={returns}
        dispatches={dispatches}
      />

      <OrderDetailsModal
        isOpen={isOrderDetailsModalOpen}
        onClose={() => setIsOrderDetailsModalOpen(false)}
        detail={detail}
        createdBy={createdBy}
        resolveUser={resolveUser}
        activeTransportInfo={activeTransportInfo}
      />

      <PartyDetailsModal
        isOpen={isPartyDetailsModalOpen}
        onClose={() => setIsPartyDetailsModalOpen(false)}
        isFetching={partyDetailQ.isFetching}
        isError={partyDetailQ.isError}
        partyData={partyDetailQ.data}
        custLabel={custLabel}
      />

      <TransportPlanModal
        isOpen={isTransportPlanModalOpen}
        onClose={() => setIsTransportPlanModalOpen(false)}
        orderId={orderId}
        orderNo={orderNo}
        custLabel={custLabel}
      />

      {hasHeaderAction(config, "final_statement") && (
        <FinalOrderStatementModal
          orderId={orderId}
          isOpen={isFinalStatementOpen}
          onClose={() => setIsFinalStatementOpen(false)}
          portalLabel={config.portalLabel}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-shrink-0 space-y-1">
          <div className="rounded-lg border border-slate-200/80 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-1.5 text-2xs text-slate-500 dark:text-slate-400">
                  <button
                    type="button"
                    onClick={() => {
                      const workflowTab = detail ? getOrderWorkflowTabCategory(detail, categoryOptions) : null;
                      const targetUrl = workflowTab && workflowTab !== "all"
                        ? `${config.ordersListPath}?tab=${workflowTab}`
                        : config.ordersListPath;
                      router.push(targetUrl);
                    }}
                    className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20 transition"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    <span>Back</span>
                  </button>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={() => router.push(config.ordersListPath)}
                    className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Orders
                  </button>
                  <span>/</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    Order Details
                  </span>
                  <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wider text-slate-600 dark:bg-white/10 dark:text-slate-300">
                    {config.portalLabel}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <h1 className="truncate text-base sm:text-lg font-bold tracking-tight text-slate-950 dark:text-slate-50">
                    {custLabel}
                  </h1>
                  {detail &&
                    (checkOrderPartySra(detail, partySraById) ||
                      (partyDetailQ.data as any)?.sra === true) && (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-2xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-400 shrink-0">
                        SRA
                      </span>
                    )}
                  <span className="shrink-0">
                    {renderPriorityBadge(
                      typeof detail.priority === "string"
                        ? detail.priority
                        : "normal",
                    )}
                  </span>
                  {config.showFinanceWorkflowBadge
                    ? renderWorkflowStatusBadge(workflowTabCategory)
                    : null}
                </div>
                <div className="mt-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-lg text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    Order No:{" "}
                    <b className="font-bold text-blue-700 dark:text-blue-400">
                      {orderNo}
                    </b>
                  </span>
                  <span>Date: {formatDateShort(detail.order_date)}</span>
                  <span>
                    EDD: {formatDateShort(detail.expected_delivery_date)}
                  </span>
                </div>
              </div>

              <div className="flex min-w-0 items-center gap-1.5 lg:shrink-0">
                <div className="min-w-0 flex-1 overflow-x-auto lg:flex-none lg:min-w-[420px]">
                  <OrderFulfillmentPipelineStrip
                    steps={pipelineSteps}
                    size="sm"
                  />
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
                  <svg
                    className="h-3 w-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
              </div>
            </div>

            <div className="mt-1 grid grid-cols-2 gap-1 sm:flex sm:flex-wrap sm:gap-1.5 font-sans font-medium">
              <button
                type="button"
                onClick={() => setIsOrderDetailsModalOpen(true)}
                className="inline-flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-white px-2 py-1 sm:px-2 sm:py-1 text-2xs font-semibold text-slate-700 shadow-sm transition dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-white/5 cursor-pointer active:scale-[0.97]"
              >
                <span>Order Info</span>
              </button>
              <button
                type="button"
                onClick={() => setIsPartyDetailsModalOpen(true)}
                className="inline-flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-white px-2 py-1 sm:px-2 sm:py-1 text-2xs font-semibold text-slate-700 shadow-sm transition dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-white/5 cursor-pointer active:scale-[0.97]"
              >
                <span>Party Info</span>
              </button>
              {hasHeaderAction(config, "final_statement") &&
                canShowFinalStatement && (
                <button
                  type="button"
                  onClick={() => setIsFinalStatementOpen(true)}
                  className="inline-flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-1 rounded-md border border-emerald-200 bg-emerald-50 hover:bg-emerald-100/80 px-2 py-1 sm:px-2 sm:py-1 text-2xs font-semibold text-emerald-800 shadow-sm transition dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/50 cursor-pointer active:scale-[0.97]"
                >
                  <span>Final Order Statement</span>
                </button>
              )}
            </div>

            <div className="mt-2 border-t border-slate-100 pt-2 dark:border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-1 sm:gap-1.5 font-sans font-medium">
                <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
                  {!(activeTransportInfo?.agentName || activeTransportInfo?.scheduledDate) && (
                    <button
                      type="button"
                      onClick={() => setIsTransportPlanModalOpen(true)}
                      className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 hover:bg-blue-100/80 px-2 py-0.5 text-xs font-semibold text-blue-800 shadow-sm transition dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/50 cursor-pointer active:scale-[0.98]"
                    >
                      <Truck className="h-3 w-3" />
                      <span>Transport Plan</span>
                    </button>
                  )}
                  {hasHeaderAction(config, "resolve_order") &&
                    totalApproved > 0 &&
                    hasRemainingQty && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmResolveOpen(true)}
                        className="rounded-md bg-indigo-600 px-2 sm:px-2 py-0.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
                      >
                        Resolve Order
                      </button>
                    )}
                  {hasHeaderAction(config, "hold") && (
                    <button
                      type="button"
                      disabled={!canHold || busy}
                      title={lockReason}
                      onClick={() => setTransitioningTo("on_hold")}
                      className="rounded-md bg-amber-600 px-2 sm:px-2 py-0.5 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
                    >
                      Hold
                    </button>
                  )}
                  {hasHeaderAction(config, "resume") &&
                    config.resumeTargetStatus && (
                      <button
                        type="button"
                        disabled={!canResume || busy}
                        onClick={() =>
                          setTransitioningTo(config.resumeTargetStatus!)
                        }
                        className="rounded-md bg-blue-600 px-2 sm:px-2 py-0.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
                      >
                        {resumeLabel}
                      </button>
                    )}
                  {hasHeaderAction(config, "reject") && (
                    <button
                      type="button"
                      disabled={!canReject || busy}
                      title={lockReason}
                      onClick={() => setTransitioningTo("finance_rejected")}
                      className="rounded-md bg-rose-600 px-2 sm:px-2 py-0.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
                    >
                      Reject
                    </button>
                  )}
                  {hasHeaderAction(config, "cancel") && (
                    <button
                      type="button"
                      disabled={!canCancel || busy}
                      title={lockReason}
                      onClick={() => setTransitioningTo("cancelled")}
                      className="rounded-md bg-rose-600 px-2 sm:px-2 py-0.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {activeTransportInfo?.agentName || activeTransportInfo?.scheduledDate ? (
                  <div className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 ring-1 ring-inset ring-amber-600/25 shadow-xs">
                    <Truck className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="flex flex-wrap items-center gap-1">
                      {activeTransportInfo.agentName ? (
                        <span>Agent: <b>{activeTransportInfo.agentName}</b></span>
                      ) : null}
                      {activeTransportInfo.scheduledDate ? (
                        <span>
                          {activeTransportInfo.agentName ? " • " : ""}Dispatch: <b>{formatDateShort(activeTransportInfo.scheduledDate)}</b>
                        </span>
                      ) : null}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="hidden md:block flex-1 min-h-0 overflow-y-auto pr-1">
          <OrderDetailTabContent {...tabContentProps} />
        </div>

        <div className="hidden md:block mb-0 flex-shrink-0 border-t border-slate-100 dark:border-white/5 bg-slate-50/95 dark:bg-slate-955/90 backdrop-blur-md px-2 pt-1.5 pb-0 [&_nav]:pb-0">
          <OrderDetailTabsNav
            className="!mb-0 !rounded-none !border-0 !bg-transparent !p-0"
            tabs={desktopTabs}
            activeId={activeTab}
            onChange={(id) => setActiveTab(id as OrderDetailTabId)}
          />
        </div>

        {mobileTabOpen && (
          <div className="md:hidden fixed inset-0 z-[60] flex flex-col bg-white dark:bg-slate-900 animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 sticky top-0 z-10">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-550 capitalize">
                {TAB_LABELS[activeTab] ?? activeTab}
              </h2>
              <button
                type="button"
                onClick={() => setMobileTabOpen(false)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 transition active:scale-95"
                aria-label="Close panel"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 pb-24">
              <OrderDetailTabContent {...tabContentProps} />
            </div>
          </div>
        )}

        {!isFetching && !isError && detail && (
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-2 pb-safe">
            <nav className="flex items-stretch justify-around overflow-x-auto">
              {config.tabs.map((tabId) => {
                const isActive = activeTab === tabId && mobileTabOpen;
                const count = tabCounts[tabId];
                const dangerBadge = tabId === "flags";
                return (
                  <button
                    key={tabId}
                    type="button"
                    onClick={() => {
                      if (activeTab === tabId && mobileTabOpen) {
                        setMobileTabOpen(false);
                      } else {
                        setActiveTab(tabId);
                        setMobileTabOpen(true);
                      }
                    }}
                    className={`relative flex flex-col items-center justify-center gap-0.5 py-2.5 px-2 flex-1 min-w-0 transition-colors ${
                      isActive
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    }`}
                  >
                    <span
                      className={`relative transition-transform ${isActive ? "scale-110" : ""}`}
                    >
                      {mobileTabIcon(tabId)}
                      {count !== undefined && count > 0 && (
                        <span
                          className={`absolute -top-1.5 -right-1.5 min-w-[1rem] h-4 flex items-center justify-center rounded-full px-1 text-2xs font-bold ${
                            dangerBadge
                              ? "bg-rose-500 text-white"
                              : "bg-slate-600 text-white dark:bg-slate-300 dark:text-slate-900"
                          }`}
                        >
                          {count}
                        </span>
                      )}
                    </span>
                    <span
                      className={`text-2xs font-semibold leading-none truncate max-w-full ${
                        isActive ? "text-blue-600 dark:text-blue-400" : ""
                      }`}
                    >
                      {MOBILE_TAB_SHORT_LABELS[tabId] ?? tabId}
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
    </div>
  );
}
