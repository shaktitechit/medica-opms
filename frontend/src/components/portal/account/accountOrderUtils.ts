import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import {
  isAccountCleared,
  isDueSheetPending,
  isOrderClosedOrDelivered,
  normalizeWorkflowTabFromUrl,
  ORDER_WORKFLOW_TAB_LABELS,
  pendingApprovalStageLabel,
  resolveApprovalPending,
  type ApprovalPendingStage,
  type OrderWorkflowTabCategory,
} from "@/components/portal/shared/orderList/orderWorkflowTabs";
import { hasPendingReturns } from "@/components/portal/shared/returnSettlement";
import { isReturnPending } from "@/constants/orderReturnStatus";

export { pendingApprovalStageLabel };
export type { ApprovalPendingStage };
/** Compatibility re-export — unbilled orders live outside workflow tabs. */
export { isUnbilledOrder } from "@/components/portal/shared/orderList/unbilledOrders";

export type AccountOrderTabCategory =
  | OrderWorkflowTabCategory
  | "transport_pending"
  | "return_pending";

export const ACCOUNT_ORDER_TABS: ReadonlyArray<{
  id: AccountOrderTabCategory;
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

export const ACCOUNT_ORDER_TAB_LABELS: Record<AccountOrderTabCategory, string> = {
  ...ORDER_WORKFLOW_TAB_LABELS,
  transport_pending: "Transport Pending",
  return_pending: "Return Pending",
};

export { isDueSheetPending };

export type AccountOrderCategoryOptions = {
  pendingReturnOrderIds?: Set<string>;
  returnsByOrderId?: Map<string, Record<string, unknown>[]>;
  /** Order ids with ≥1 dispatch batch submitted for transport. */
  submittedDispatchOrderIds?: Set<string>;
};

/**
 * Order workflow statuses set only after a dispatch batch is submitted
 * (draft create alone stays on account/dispatch_pending statuses).
 */
const TRANSPORT_ACTIVE_STATUSES = new Set([
  "partial_dispatch_created",
  "full_dispatch_created",
  "transport_pending",
  "transport_assigned",
  "partially_transported",
  "fully_transported",
  "in_transit",
]);

function refId(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return String(o._id ?? o.id ?? "");
  }
  return String(value);
}

function orderHasPendingReturns(
  order: Record<string, unknown>,
  options?: AccountOrderCategoryOptions,
): boolean {
  const orderId = refId(order._id ?? order.id);
  if (options?.pendingReturnOrderIds?.has(orderId)) return true;
  if (options?.returnsByOrderId && orderId) {
    const rows = options.returnsByOrderId.get(orderId) ?? [];
    return hasPendingReturns(rows);
  }
  return false;
}

/**
 * Transport Pending: ≥1 order dispatch has been created and submitted for transport.
 * Draft-only dispatches remain in Dispatch Pending.
 */
export function isTransportPending(
  order: unknown,
  options?: AccountOrderCategoryOptions,
): boolean {
  if (!order || typeof order !== "object") return false;
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "on_hold" || status === "cancelled" || status === "finance_rejected") {
    return false;
  }
  if (isOrderClosedOrDelivered(row)) return false;

  const orderId = refId(row._id ?? row.id);
  if (orderId && options?.submittedDispatchOrderIds?.has(orderId)) {
    return true;
  }

  // Status transitions to partial/full_dispatch_created only on submit.
  if (TRANSPORT_ACTIVE_STATUSES.has(status)) return true;

  // Order-level fulfillment flags after submitted qty left the warehouse bucket.
  // Require account clearance so approval-stage rows never land here early.
  if (!isAccountCleared(row)) return false;

  const dispatchStatus = String(row.dispatch_status || "").toLowerCase();
  if (dispatchStatus === "partial" || dispatchStatus === "completed") return true;

  return false;
}

export function isReturnPendingOrder(
  order: unknown,
  options?: AccountOrderCategoryOptions,
): boolean {
  if (!order || typeof order !== "object") return false;
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "draft") return false;
  if (status === "on_hold") return false;
  if (status === "cancelled" || status === "finance_rejected") return false;

  return orderHasPendingReturns(row, options);
}

/** @deprecated Prefer isTransportPending / isReturnPendingOrder. */
export function isTransportOrReturnPending(
  order: unknown,
  options?: AccountOrderCategoryOptions,
): boolean {
  return isReturnPendingOrder(order, options) || isTransportPending(order, options);
}

/**
 * Account list tab bucket. Draft orders are excluded (return null).
 * Priority: terminal → return → transport → closed → approvals → dispatch pending.
 * Unbilled orders are outside workflow tabs (see UnbilledOrdersModal).
 */
export function getAccountOrderTabCategory(
  order: unknown,
  options?: AccountOrderCategoryOptions,
): AccountOrderTabCategory | null {
  if (!order || typeof order !== "object") return null;
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "draft") return null;

  if (status === "on_hold") return "on_hold";
  if (status === "cancelled") return "cancelled";
  if (status === "finance_rejected") return "rejected";

  if (isReturnPendingOrder(order, options)) return "return_pending";
  if (isTransportPending(order, options)) return "transport_pending";
  if (isOrderClosedOrDelivered(row)) return "closed_delivered";

  // Exclusive sequential pipeline: admin → due sheet → finance → account → dispatch.
  const pending = resolveApprovalPending(row);
  if (pending.admin) return "pending_admin_approval";
  if (isDueSheetPending(row)) return "due_sheet_pending";
  if (pending.finance) return "pending_finance_approval";
  if (pending.account) return "pending_account_approval";

  return "open_dispatched";
}

/** Whether an order belongs on the given account list tab. */
export function orderMatchesAccountTab(
  order: unknown,
  tab: AccountOrderTabCategory,
  options?: AccountOrderCategoryOptions,
): boolean {
  if (!order || typeof order !== "object") return false;

  if (tab === "all") {
    return deriveOrderWorkflowStatus(order as Record<string, unknown>) !== "draft";
  }

  return getAccountOrderTabCategory(order, options) === tab;
}

export function accountTabQueryParams(
  tab: AccountOrderTabCategory,
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
      return { exclude_status: "draft,submitted,on_hold,cancelled,finance_rejected" };
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

/** Build a set of order ids that still have pending warehouse returns. */
export function buildPendingReturnOrderIds(returns: unknown[]): Set<string> {
  const ids = new Set<string>();
  for (const raw of returns) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (!isReturnPending(row.return_status)) continue;
    const orderId = refId(row.order);
    if (orderId) ids.add(orderId);
  }
  return ids;
}

/** Group return records by parent order id. */
export function groupReturnsByOrderId(returns: unknown[]): Map<string, Record<string, unknown>[]> {
  const map = new Map<string, Record<string, unknown>[]>();
  for (const raw of returns) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const orderId = refId(row.order);
    if (!orderId) continue;
    const list = map.get(orderId) ?? [];
    list.push(row);
    map.set(orderId, list);
  }
  return map;
}

export function isAccountOrderTabCategory(value: string): value is AccountOrderTabCategory {
  return ACCOUNT_ORDER_TABS.some((tab) => tab.id === value);
}

export function normalizeAccountTabFromUrl(value: string | null): AccountOrderTabCategory {
  if (!value) return "pending_account_approval";
  if (value === "transport_return_pending" || value === "pending_transport" || value === "pending_delivery") {
    return "transport_pending";
  }
  if (value === "returns_pending") return "return_pending";
  if (value === "dispatch_pending") return "open_dispatched";
  if (isAccountOrderTabCategory(value)) return value;
  const normalized = normalizeWorkflowTabFromUrl(value, "all");
  return isAccountOrderTabCategory(normalized) ? normalized : "pending_account_approval";
}

export type AccountOrderStats = Record<
  AccountOrderTabCategory,
  { count: number; quantity: number; amount: number }
>;

export function createEmptyAccountOrderStats(): AccountOrderStats {
  return Object.fromEntries(
    Object.keys(ACCOUNT_ORDER_TAB_LABELS).map((id) => [
      id,
      { count: 0, quantity: 0, amount: 0 },
    ]),
  ) as AccountOrderStats;
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

export function computeAccountOrderStats(
  orders: unknown[],
  options?: AccountOrderCategoryOptions,
): AccountOrderStats {
  const stats = createEmptyAccountOrderStats();

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

    const cat = getAccountOrderTabCategory(order, options);
    if (!cat || cat === "all") continue;

    stats[cat].count += 1;
    stats[cat].quantity += qty;
    stats[cat].amount += amount;
  }

  return stats;
}

export const ACCOUNT_STATUS_COLORS: Record<
  AccountOrderTabCategory,
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

export const ACCOUNT_CHART_TABS = ACCOUNT_ORDER_TABS.filter((tab) => tab.id !== "all");

export type AccountChartBreakdown = AccountOrderStats;

export function createEmptyAccountChartBreakdown(): AccountChartBreakdown {
  return createEmptyAccountOrderStats();
}

export function categorizeOrderForAccountChart(
  order: unknown,
  options?: AccountOrderCategoryOptions,
): AccountOrderTabCategory | null {
  return getAccountOrderTabCategory(order, options);
}
