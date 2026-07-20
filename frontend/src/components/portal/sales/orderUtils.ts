import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import {
  isDueSheetPending,
  isOrderClosedOrDelivered,
  normalizeWorkflowTabFromUrl,
  ORDER_WORKFLOW_TAB_LABELS,
  workflowTabQueryParams,
  type OrderWorkflowTabCategory,
  isOrderClosed,
  resolveApprovalPending,
  hasAnyPendingApproval,
  pendingApprovalStageLabel,
  type ApprovalPendingStage,
  type ApprovalPendingSummary,
} from "@/components/portal/shared/orderList/orderWorkflowTabs";
import {
  buildPendingReturnOrderIds,
  isReturnPendingOrder,
  isTransportPending,
  type AccountOrderCategoryOptions,
} from "@/components/portal/account/accountOrderUtils";

export type SalesOrderTabCategory =
  | "draft"
  | OrderWorkflowTabCategory
  | "transport_pending"
  | "return_pending";

export type SalesOrderCategoryOptions = AccountOrderCategoryOptions;

export { buildPendingReturnOrderIds };

function resolveRefId(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return String(o._id ?? o.id ?? "");
  }
  return String(value);
}

/** Orders owned by / assigned to this sales user (matches sales dashboard scope). */
export function filterOrdersForSalesUser(
  orders: unknown[],
  user: unknown,
): unknown[] {
  const userId = resolveRefId(
    user && typeof user === "object"
      ? (user as Record<string, unknown>)._id ??
          (user as Record<string, unknown>).id
      : user,
  );
  if (!userId) return [];

  return orders.filter((order) => {
    if (!order || typeof order !== "object") return false;
    const row = order as Record<string, unknown>;
    const assignedId = resolveRefId(row.assigned_sales_user);
    const createdId = resolveRefId(row.created_by);
    return assignedId === userId || createdId === userId;
  });
}

export {
  isOrderClosed,
  resolveApprovalPending,
  hasAnyPendingApproval,
  pendingApprovalStageLabel,
  isDueSheetPending,
};
export type { ApprovalPendingStage, ApprovalPendingSummary };

/**
 * Sales list tab bucket — same exclusive priority as other portals:
 * draft → terminal → return → transport → closed → approvals → dispatch pending.
 * Open orders are outside workflow tabs (see OpenOrdersModal).
 */
export function getOrderTabCategory(
  order: unknown,
  options?: SalesOrderCategoryOptions,
): SalesOrderTabCategory {
  if (!order || typeof order !== "object") return "open_dispatched";
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "draft") return "draft";

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

export const SALES_ORDER_TABS: ReadonlyArray<{
  id: SalesOrderTabCategory;
  label: string;
}> = [
  { id: "draft", label: "Draft" },
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

export const SALES_ORDER_TAB_LABELS: Record<SalesOrderTabCategory, string> = {
  draft: "Draft",
  ...ORDER_WORKFLOW_TAB_LABELS,
  transport_pending: "Transport Pending",
  return_pending: "Return Pending",
};

export function orderMatchesSalesTab(
  order: unknown,
  tab: SalesOrderTabCategory,
  options?: SalesOrderCategoryOptions,
): boolean {
  if (!order || typeof order !== "object") return false;

  if (tab === "draft") {
    return deriveOrderWorkflowStatus(order as Record<string, unknown>) === "draft";
  }
  if (tab === "all") return true;

  return getOrderTabCategory(order, options) === tab;
}

export function salesTabQueryParams(
  tab: SalesOrderTabCategory,
): Record<string, string | undefined> {
  if (tab === "draft") return { status: "draft" };
  if (tab === "all") return {};
  if (tab === "transport_pending" || tab === "return_pending") {
    return { exclude_status: "draft,on_hold,cancelled,finance_rejected" };
  }
  return workflowTabQueryParams(tab);
}

export function normalizeSalesTabFromUrl(
  value: string | null,
  defaultTab: SalesOrderTabCategory = "all",
): SalesOrderTabCategory {
  if (!value) return defaultTab;
  if (value === "draft") return "draft";
  if (
    value === "pending_approval" ||
    value === "pending_approvals" ||
    value === "approval_pending"
  ) {
    return "pending_admin_approval";
  }
  if (value === "transport_return_pending" || value === "pending_transport" || value === "pending_delivery") {
    return "transport_pending";
  }
  if (value === "returns_pending") return "return_pending";
  if (value === "dispatch_pending") return "open_dispatched";
  if (isSalesOrderTabCategory(value)) return value;
  const workflowDefault: OrderWorkflowTabCategory =
    defaultTab === "draft" ||
    defaultTab === "transport_pending" ||
    defaultTab === "return_pending"
      ? "all"
      : defaultTab;
  const normalized = normalizeWorkflowTabFromUrl(value, workflowDefault);
  return isSalesOrderTabCategory(normalized) ? normalized : defaultTab;
}

export type SalesOrderStats = Record<
  SalesOrderTabCategory,
  { count: number; quantity: number }
>;

export function createEmptySalesOrderStats(): SalesOrderStats {
  return Object.fromEntries(
    Object.keys(SALES_ORDER_TAB_LABELS).map((id) => [id, { count: 0, quantity: 0 }]),
  ) as SalesOrderStats;
}

/** Aggregate order counts and line quantities by sales tab bucket. */
export function computeSalesOrderStats(
  orders: unknown[],
  options?: SalesOrderCategoryOptions,
): SalesOrderStats {
  const stats = createEmptySalesOrderStats();

  for (const order of orders) {
    if (!order || typeof order !== "object") continue;

    const cat = getOrderTabCategory(order, options);
    const row = order as { order_items?: unknown[] };
    const items = Array.isArray(row.order_items) ? row.order_items : [];
    let orderQty = 0;
    for (const item of items) {
      const line = item as { ordered_quantity?: unknown; quantity?: unknown };
      orderQty += Number(line.ordered_quantity ?? line.quantity ?? 0);
    }

    stats.all.count += 1;
    stats.all.quantity += orderQty;

    stats[cat].count += 1;
    stats[cat].quantity += orderQty;
  }

  return stats;
}

export function isSalesOrderTabCategory(value: string): value is SalesOrderTabCategory {
  return SALES_ORDER_TABS.some((tab) => tab.id === value);
}

export const SALES_CHART_TABS = SALES_ORDER_TABS.filter((tab) => tab.id !== "all");

export const SALES_STATUS_COLORS: Record<
  SalesOrderTabCategory,
  { fill: string; hover: string; dot: string; label: string }
> = {
  draft: {
    fill: "fill-slate-400/85 dark:fill-slate-500/60",
    hover: "fill-slate-500 dark:fill-slate-400",
    dot: "bg-slate-400 dark:bg-slate-500",
    label: "Draft",
  },
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
