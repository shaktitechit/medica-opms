import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import {
  getOrderWorkflowTabCategory,
  isDueSheetPending,
  isOrderClosedOrDelivered,
  isOrderDelivered,
  normalizeWorkflowTabFromUrl,
  ORDER_WORKFLOW_TAB_LABELS,
  orderMatchesWorkflowTab,
  resolveApprovalPending,
  type OrderWorkflowTabCategory,
} from "@/components/portal/shared/orderList/orderWorkflowTabs";
import {
  type ApprovalPendingStage,
} from "@/components/portal/sales/orderUtils";
import {
  buildPendingReturnOrderIds,
  isTransportOrReturnPending,
  type AccountOrderCategoryOptions,
} from "@/components/portal/account/accountOrderUtils";

export type AdminOrderTabCategory = OrderWorkflowTabCategory | "transport_return_pending";

export type AdminOrderCategoryOptions = AccountOrderCategoryOptions;

export { buildPendingReturnOrderIds };

export const ADMIN_ORDER_TABS: ReadonlyArray<{
  id: AdminOrderTabCategory;
  label: string;
}> = [
  { id: "all", label: "All Orders" },
  { id: "pending_admin_approval", label: "Admin Pending" },
  { id: "open_dispatched", label: "Open/Dispatch Pending" },
  { id: "transport_return_pending", label: "Transport/Return Pending" },
  { id: "closed_delivered", label: "Closed/Delivered" },
  { id: "on_hold", label: "On Hold" },
  { id: "cancelled", label: "Cancelled" },
  { id: "rejected", label: "Rejected" },
];

export const ADMIN_ORDER_TAB_LABELS: Record<AdminOrderTabCategory, string> = {
  ...ORDER_WORKFLOW_TAB_LABELS,
  transport_return_pending: "Transport/Return Pending",
};

export {
  isDueSheetPending,
  isOrderClosedOrDelivered,
  isOrderDelivered,
};

export function getAdminOrderTabCategory(
  order: unknown,
  options?: AdminOrderCategoryOptions,
): AdminOrderTabCategory | null {
  if (!order || typeof order !== "object") return null;

  const workflowCat = getOrderWorkflowTabCategory(order);
  if (!workflowCat) return null;

  if (isTransportOrReturnPending(order, options)) return "transport_return_pending";
  return workflowCat;
}

export function orderMatchesAdminTab(
  order: unknown,
  tab: AdminOrderTabCategory,
  options?: AdminOrderCategoryOptions,
): boolean {
  if (!order || typeof order !== "object") return false;

  if (tab === "transport_return_pending") {
    return isTransportOrReturnPending(order, options);
  }

  if (tab === "open_dispatched") {
    return (
      getOrderWorkflowTabCategory(order) === "open_dispatched" &&
      !isTransportOrReturnPending(order, options)
    );
  }

  if (tab === "all") {
    return deriveOrderWorkflowStatus(order as Record<string, unknown>) !== "draft";
  }

  return orderMatchesWorkflowTab(order, tab);
}

export function adminTabQueryParams(
  tab: AdminOrderTabCategory,
): Record<string, string | undefined> {
  if (tab === "transport_return_pending") {
    return { exclude_status: "draft,on_hold,cancelled,finance_rejected" };
  }

  switch (tab) {
    case "all":
      return { exclude_status: "draft" };
    case "pending_admin_approval":
      return { status: "pending_review" };
    case "due_sheet_pending":
      return { exclude_status: "draft,submitted,on_hold,cancelled,finance_rejected" };
    case "pending_finance_approval":
      return { status: "pending_finance_review" };
    case "pending_account_approval":
      return { status: "pending_account_review" };
    case "on_hold":
      return { status: "on_hold" };
    case "cancelled":
      return { status: "cancelled" };
    case "rejected":
      return { status: "finance_rejected" };
    case "open_dispatched":
      return { status: "open" };
    case "closed_delivered":
      return { exclude_status: "draft,submitted,on_hold,cancelled,finance_rejected" };
    default:
      return {};
  }
}

export function pendingApprovalStageLabel(stage: ApprovalPendingStage): string {
  switch (stage) {
    case "admin":
      return "Admin";
    case "finance":
      return "Finance";
    case "account":
      return "Account";
    default:
      return "Approval";
  }
}

export function isAdminOrderTabCategory(value: string): value is AdminOrderTabCategory {
  return ADMIN_ORDER_TABS.some((tab) => tab.id === value);
}

export function normalizeAdminTabFromUrl(value: string | null): AdminOrderTabCategory {
  if (!value) return "pending_admin_approval";
  if (
    value === "transport_pending" ||
    value === "returns_pending" ||
    value === "pending_transport" ||
    value === "pending_delivery"
  ) {
    return "transport_return_pending";
  }
  if (isAdminOrderTabCategory(value)) return value;
  const normalized = normalizeWorkflowTabFromUrl(value, "all");
  return isAdminOrderTabCategory(normalized) ? normalized : "pending_admin_approval";
}

export type AdminOrderStats = Record<
  AdminOrderTabCategory,
  { count: number; quantity: number; amount: number }
>;

export function createEmptyAdminOrderStats(): AdminOrderStats {
  // Keyed by every category (not just visible tabs) so stats[cat] is always defined
  // even for orders whose category tab isn't rendered on the admin strip.
  return Object.fromEntries(
    Object.keys(ADMIN_ORDER_TAB_LABELS).map((id) => [
      id,
      { count: 0, quantity: 0, amount: 0 },
    ]),
  ) as AdminOrderStats;
}

export function orderLineQuantity(order: unknown): number {
  const row = order as { order_items?: unknown[] };
  const items = Array.isArray(row.order_items) ? row.order_items : [];
  return items.reduce((sum: number, item) => {
    const line = item as { ordered_quantity?: unknown; quantity?: unknown };
    return sum + Number(line.ordered_quantity ?? line.quantity ?? 0);
  }, 0);
}

function orderAmount(order: unknown): number {
  const row = order as { grand_total?: unknown; total?: unknown };
  return Number(row.grand_total ?? row.total ?? 0);
}

export function computeAdminOrderStats(
  orders: unknown[],
  options?: AdminOrderCategoryOptions,
): AdminOrderStats {
  const stats = createEmptyAdminOrderStats();

  for (const order of orders) {
    if (!order || typeof order !== "object") continue;
    const row = order as Record<string, unknown>;
    const status = deriveOrderWorkflowStatus(row);
    if (status === "draft") continue;

    const qty = orderLineQuantity(order);
    const amount = orderAmount(order);

    stats.all.count += 1;
    stats.all.quantity += qty;
    stats.all.amount += amount;

    if (status === "on_hold") {
      stats.on_hold.count += 1;
      stats.on_hold.quantity += qty;
      stats.on_hold.amount += amount;
    }
    if (status === "cancelled") {
      stats.cancelled.count += 1;
      stats.cancelled.quantity += qty;
      stats.cancelled.amount += amount;
    }
    if (status === "finance_rejected") {
      stats.rejected.count += 1;
      stats.rejected.quantity += qty;
      stats.rejected.amount += amount;
    }
    if (orderMatchesAdminTab(order, "transport_return_pending", options)) {
      stats.transport_return_pending.count += 1;
      stats.transport_return_pending.quantity += qty;
      stats.transport_return_pending.amount += amount;
    }
    if (isOrderClosedOrDelivered(row)) {
      stats.closed_delivered.count += 1;
      stats.closed_delivered.quantity += qty;
      stats.closed_delivered.amount += amount;
    }

    const isPipelineActive =
      status !== "on_hold" &&
      status !== "cancelled" &&
      status !== "finance_rejected" &&
      !isOrderClosedOrDelivered(row);

    const pending = resolveApprovalPending(row);
    if (isPipelineActive && pending.admin) {
      stats.pending_admin_approval.count += 1;
      stats.pending_admin_approval.quantity += qty;
      stats.pending_admin_approval.amount += amount;
    }
    if (isPipelineActive && isDueSheetPending(row)) {
      stats.due_sheet_pending.count += 1;
      stats.due_sheet_pending.quantity += qty;
      stats.due_sheet_pending.amount += amount;
    }
    if (isPipelineActive && pending.finance) {
      stats.pending_finance_approval.count += 1;
      stats.pending_finance_approval.quantity += qty;
      stats.pending_finance_approval.amount += amount;
    }
    if (isPipelineActive && pending.account) {
      stats.pending_account_approval.count += 1;
      stats.pending_account_approval.quantity += qty;
      stats.pending_account_approval.amount += amount;
    }
    // Match list/tab logic — not legacy status === "open" (derive rarely returns that).
    if (orderMatchesAdminTab(order, "open_dispatched", options)) {
      stats.open_dispatched.count += 1;
      stats.open_dispatched.quantity += qty;
      stats.open_dispatched.amount += amount;
    }
  }

  return stats;
}

export const ADMIN_STATUS_COLORS: Record<
  AdminOrderTabCategory,
  { fill: string; hover: string; dot: string; label: string }
> = {
  all: {
    fill: "fill-slate-500/85 dark:fill-slate-500/60",
    hover: "fill-slate-600 dark:fill-slate-400",
    dot: "bg-slate-500 dark:bg-slate-400",
    label: "All Orders",
  },
  pending_admin_approval: {
    fill: "fill-indigo-500/85 dark:fill-indigo-500/60",
    hover: "fill-indigo-600 dark:fill-indigo-400",
    dot: "bg-indigo-500 dark:bg-indigo-400",
    label: "Admin Pending",
  },
  due_sheet_pending: {
    fill: "fill-orange-500/85 dark:fill-orange-500/60",
    hover: "fill-orange-600 dark:fill-orange-400",
    dot: "bg-orange-500 dark:bg-orange-400",
    label: "Due Sheet Pending",
  },
  pending_finance_approval: {
    fill: "fill-purple-500/85 dark:fill-purple-500/60",
    hover: "fill-purple-600 dark:fill-purple-400",
    dot: "bg-purple-500 dark:bg-purple-400",
    label: "Finance Pending",
  },
  pending_account_approval: {
    fill: "fill-violet-500/85 dark:fill-violet-500/60",
    hover: "fill-violet-600 dark:fill-violet-400",
    dot: "bg-violet-500 dark:bg-violet-400",
    label: "Account Pending",
  },
  open_dispatched: {
    fill: "fill-teal-500/85 dark:fill-teal-500/60",
    hover: "fill-teal-600 dark:fill-teal-400",
    dot: "bg-teal-500 dark:bg-teal-400",
    label: "Open/Dispatch Pending",
  },
  transport_return_pending: {
    fill: "fill-amber-500/85 dark:fill-amber-500/60",
    hover: "fill-amber-600 dark:fill-amber-400",
    dot: "bg-amber-500 dark:bg-amber-400",
    label: "Transport/Return Pending",
  },
  closed_delivered: {
    fill: "fill-emerald-500/85 dark:fill-emerald-550/60",
    hover: "fill-emerald-600 dark:fill-emerald-400",
    dot: "bg-emerald-500 dark:bg-emerald-450",
    label: "Closed/Delivered",
  },
  on_hold: {
    fill: "fill-amber-500/85 dark:fill-amber-500/60",
    hover: "fill-amber-600 dark:fill-amber-400",
    dot: "bg-amber-500 dark:bg-amber-450",
    label: "On Hold",
  },
  rejected: {
    fill: "fill-red-500/85 dark:fill-red-550/60",
    hover: "fill-red-600 dark:fill-red-400",
    dot: "bg-red-500 dark:bg-red-450",
    label: "Rejected",
  },
  cancelled: {
    fill: "fill-rose-500/85 dark:fill-rose-500/60",
    hover: "fill-rose-600 dark:fill-rose-450",
    dot: "bg-rose-500 dark:bg-rose-400",
    label: "Cancelled",
  },
};

export const ADMIN_CHART_TABS = ADMIN_ORDER_TABS.filter((tab) => tab.id !== "all");

export type AdminChartBreakdown = AdminOrderStats;

export function createEmptyAdminChartBreakdown(): AdminChartBreakdown {
  return createEmptyAdminOrderStats();
}

export function categorizeOrderForAdminChart(
  order: unknown,
  options?: AdminOrderCategoryOptions,
): AdminOrderTabCategory | null {
  return getAdminOrderTabCategory(order, options);
}
