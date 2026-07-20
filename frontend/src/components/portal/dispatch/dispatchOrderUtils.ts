import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import {
  isDueSheetPending,
  isOrderClosedOrDelivered,
  isOrderDelivered,
  normalizeWorkflowTabFromUrl,
  ORDER_WORKFLOW_TAB_LABELS,
  resolveApprovalPending,
  type OrderWorkflowTabCategory,
} from "@/components/portal/shared/orderList/orderWorkflowTabs";
import {
  type ApprovalPendingStage,
} from "@/components/portal/sales/orderUtils";
import {
  buildPendingReturnOrderIds,
  groupReturnsByOrderId,
  isReturnPendingOrder,
  isTransportOrReturnPending,
  isTransportPending,
} from "@/components/portal/account/accountOrderUtils";

export type DispatchOrderTabCategory =
  | OrderWorkflowTabCategory
  | "transport_pending"
  | "return_pending";

export const DISPATCH_ORDER_TABS: ReadonlyArray<{
  id: DispatchOrderTabCategory;
  label: string;
}> = [
  { id: "all", label: "All Orders" },
  { id: "pending_admin_approval", label: "Admin Pending" },
  { id: "due_sheet_pending", label: "Due Sheet Pending" },
  { id: "pending_finance_approval", label: "Finance Pending" },
  { id: "pending_account_approval", label: "Account Pending" },
  { id: "open_dispatched", label: "Dispatch Pending" },
  { id: "transport_pending", label: "Transport Pending" },
  { id: "return_pending", label: "Return Pending" },
  { id: "closed_delivered", label: "Closed/Delivered" },
  { id: "on_hold", label: "On Hold" },
  { id: "cancelled", label: "Cancelled" },
  { id: "rejected", label: "Rejected" },
];

export const DISPATCH_ORDER_TAB_LABELS: Record<DispatchOrderTabCategory, string> = {
  ...ORDER_WORKFLOW_TAB_LABELS,
  transport_pending: "Transport Pending",
  return_pending: "Return Pending",
};

export {
  isDueSheetPending,
  isOrderClosedOrDelivered,
  isOrderDelivered,
};

export { buildPendingReturnOrderIds, groupReturnsByOrderId };
export { isTransportOrReturnPending, isTransportPending, isReturnPendingOrder };

export type DispatchOrderCategoryOptions = {
  pendingReturnOrderIds?: Set<string>;
  returnsByOrderId?: Map<string, Record<string, unknown>[]>;
};

/**
 * Dispatch list tab bucket. Draft orders are excluded (return null).
 * Same exclusive priority as admin/account/finance/sales:
 * terminal → return → transport → closed → approvals → dispatch pending.
 * Open orders are outside workflow tabs (see OpenOrdersModal).
 */
export function getDispatchOrderTabCategory(
  order: unknown,
  options?: DispatchOrderCategoryOptions,
): DispatchOrderTabCategory | null {
  if (!order || typeof order !== "object") return null;
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "draft") return null;

  if (status === "on_hold") return "on_hold";
  if (status === "cancelled") return "cancelled";
  if (status === "finance_rejected") return "rejected";

  if (isReturnPendingOrder(order, options)) return "return_pending";
  if (isTransportPending(order)) return "transport_pending";
  if (isOrderClosedOrDelivered(row)) return "closed_delivered";

  const pending = resolveApprovalPending(row);
  if (pending.admin) return "pending_admin_approval";
  if (isDueSheetPending(row)) return "due_sheet_pending";
  if (pending.finance) return "pending_finance_approval";
  if (pending.account) return "pending_account_approval";

  return "open_dispatched";
}

export function orderMatchesDispatchTab(
  order: unknown,
  tab: DispatchOrderTabCategory,
  options?: DispatchOrderCategoryOptions,
): boolean {
  if (!order || typeof order !== "object") return false;

  if (tab === "all") {
    return deriveOrderWorkflowStatus(order as Record<string, unknown>) !== "draft";
  }

  return getDispatchOrderTabCategory(order, options) === tab;
}

export function dispatchTabQueryParams(
  tab: DispatchOrderTabCategory,
): Record<string, string | undefined> {
  if (tab === "transport_pending" || tab === "return_pending") {
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

export function isDispatchOrderTabCategory(value: string): value is DispatchOrderTabCategory {
  return DISPATCH_ORDER_TABS.some((tab) => tab.id === value);
}

export function normalizeDispatchTabFromUrl(value: string | null): DispatchOrderTabCategory {
  if (!value) return "transport_pending";
  if (value === "transport_return_pending" || value === "pending_transport" || value === "pending_delivery") {
    return "transport_pending";
  }
  if (value === "returns_pending") return "return_pending";
  if (value === "dispatch_pending") return "open_dispatched";
  if (isDispatchOrderTabCategory(value)) return value;
  const normalized = normalizeWorkflowTabFromUrl(value, "all");
  return isDispatchOrderTabCategory(normalized) ? normalized : "transport_pending";
}

export type DispatchOrderStats = Record<
  DispatchOrderTabCategory,
  { count: number; quantity: number; amount: number }
>;

export function createEmptyDispatchOrderStats(): DispatchOrderStats {
  return Object.fromEntries(
    Object.keys(DISPATCH_ORDER_TAB_LABELS).map((id) => [
      id,
      { count: 0, quantity: 0, amount: 0 },
    ]),
  ) as DispatchOrderStats;
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

export function computeDispatchOrderStats(
  orders: unknown[],
  options?: DispatchOrderCategoryOptions,
): DispatchOrderStats {
  const stats = createEmptyDispatchOrderStats();

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

    const cat = getDispatchOrderTabCategory(order, options);
    if (!cat || cat === "all") continue;

    stats[cat].count += 1;
    stats[cat].quantity += qty;
    stats[cat].amount += amount;
  }

  return stats;
}

export const DISPATCH_STATUS_COLORS: Record<
  DispatchOrderTabCategory,
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
    label: "Dispatch Pending",
  },
  transport_pending: {
    fill: "fill-amber-500/85 dark:fill-amber-500/60",
    hover: "fill-amber-600 dark:fill-amber-400",
    dot: "bg-amber-500 dark:bg-amber-400",
    label: "Transport Pending",
  },
  return_pending: {
    fill: "fill-rose-500/85 dark:fill-rose-500/60",
    hover: "fill-rose-600 dark:fill-rose-400",
    dot: "bg-rose-500 dark:bg-rose-400",
    label: "Return Pending",
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
  cancelled: {
    fill: "fill-rose-500/85 dark:fill-rose-500/60",
    hover: "fill-rose-600 dark:fill-rose-450",
    dot: "bg-rose-500 dark:bg-rose-400",
    label: "Cancelled",
  },
  rejected: {
    fill: "fill-red-500/85 dark:fill-red-550/60",
    hover: "fill-red-600 dark:fill-red-400",
    dot: "bg-red-500 dark:bg-red-450",
    label: "Rejected",
  },
};

export const DISPATCH_CHART_TABS = DISPATCH_ORDER_TABS.filter((tab) => tab.id !== "all");

export type DispatchChartBreakdown = DispatchOrderStats;

export function createEmptyDispatchChartBreakdown(): DispatchChartBreakdown {
  return createEmptyDispatchOrderStats();
}

export function categorizeOrderForDispatchChart(
  order: unknown,
  options?: DispatchOrderCategoryOptions,
): DispatchOrderTabCategory | null {
  return getDispatchOrderTabCategory(order, options);
}
