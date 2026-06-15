import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import { isOrderClosed } from "@/components/portal/sales/orderUtils";
import { hasPendingReturns } from "@/components/portal/shared/returnSettlement";

export type AccountOrderTabCategory =
  | "dispatch_pending"
  | "dispatched"
  | "pending_delivery"
  | "returns_pending"
  | "closed"
  | "on_hold"
  | "cancelled";

export const ACCOUNT_ORDER_TABS: ReadonlyArray<{
  id: AccountOrderTabCategory;
  label: string;
}> = [
  { id: "dispatch_pending", label: "Dispatch Pending" },
  { id: "dispatched", label: "Dispatched" },
  { id: "pending_delivery", label: "Pending Delivery" },
  { id: "returns_pending", label: "Returns Pending" },
  { id: "closed", label: "Closed Orders" },
  { id: "on_hold", label: "On Hold" },
  { id: "cancelled", label: "Cancelled" },
];

export const ACCOUNT_ORDER_TAB_LABELS: Record<AccountOrderTabCategory, string> = {
  dispatch_pending: "Dispatch Pending",
  dispatched: "Dispatched",
  pending_delivery: "Pending Delivery",
  returns_pending: "Returns Pending",
  closed: "Closed",
  on_hold: "On Hold",
  cancelled: "Cancelled",
};

export type AccountOrderCategoryOptions = {
  /** Order ids with at least one warehouse return still in `pending` status. */
  pendingReturnOrderIds?: Set<string>;
  /** Return rows keyed by order — used when categorizing a single order with its returns. */
  returnsByOrderId?: Map<string, Record<string, unknown>[]>;
};

function refId(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return String(o._id ?? o.id ?? "");
  }
  return String(value);
}

/** Build a set of order ids that still have pending warehouse returns. */
export function buildPendingReturnOrderIds(returns: unknown[]): Set<string> {
  const ids = new Set<string>();
  for (const raw of returns) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (String(row.return_status || "") !== "pending") continue;
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

/** Delivery finished on the order but account has not closed / settled yet. */
function isDeliveredNotClosed(
  row: Record<string, unknown>,
  status: string,
): boolean {
  const deliveryStatus = String(row.delivery_status || "");
  const { dispatched, delivered } = fulfillmentQuantities(row);

  if (status === "delivered") return true;
  if (deliveryStatus === "completed") return true;
  if (dispatched > 0 && delivered >= dispatched) return true;

  return false;
}

function isReturnsPending(
  row: Record<string, unknown>,
  status: string,
  options?: AccountOrderCategoryOptions,
): boolean {
  return orderHasPendingReturns(row, options) || isDeliveredNotClosed(row, status);
}

function fulfillmentQuantities(order: Record<string, unknown>): {
  dispatched: number;
  delivered: number;
} {
  const items = Array.isArray(order.order_items) ? order.order_items : [];
  let dispatched = 0;
  let delivered = 0;

  for (const item of items) {
    const line = item as { dispatched_quantity?: unknown; delivered_quantity?: unknown };
    dispatched += Number(line.dispatched_quantity ?? 0);
    delivered += Number(line.delivered_quantity ?? 0);
  }

  return { dispatched, delivered };
}

export function getAccountOrderTabCategory(
  order: unknown,
  options?: AccountOrderCategoryOptions,
): AccountOrderTabCategory {
  if (!order || typeof order !== "object") return "dispatch_pending";
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "on_hold") return "on_hold";
  if (status === "cancelled") return "cancelled";
  if (isOrderClosed(row)) return "closed";
  if (isReturnsPending(row, status, options)) return "returns_pending";

  const dispatchStatus = String(row.dispatch_status || "");
  const deliveryStatus = String(row.delivery_status || "");
  const { dispatched, delivered } = fulfillmentQuantities(row);

  const inTransitStatuses = new Set([
    "partially_transported",
    "fully_transported",
    "in_transit",
    "transport_assigned",
    "transport_pending",
  ]);

  if (
    inTransitStatuses.has(status) ||
    deliveryStatus === "partial" ||
    (dispatched > 0 && delivered > 0 && delivered < dispatched)
  ) {
    return "pending_delivery";
  }

  if (
    status === "partial_dispatch_created" ||
    status === "full_dispatch_created" ||
    dispatchStatus === "partial" ||
    dispatchStatus === "completed" ||
    (dispatched > 0 && delivered === 0)
  ) {
    return "dispatched";
  }

  return "dispatch_pending";
}

export function isAccountOrderTabCategory(value: string): value is AccountOrderTabCategory {
  return ACCOUNT_ORDER_TABS.some((tab) => tab.id === value);
}

export type AccountOrderStats = Record<
  AccountOrderTabCategory,
  { count: number; quantity: number; amount: number }
>;

export function createEmptyAccountOrderStats(): AccountOrderStats {
  return Object.fromEntries(
    ACCOUNT_ORDER_TABS.map(({ id }) => [id, { count: 0, quantity: 0, amount: 0 }]),
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

/** Aggregate account tab counts, quantities, and order value. Skips draft orders. */
export function computeAccountOrderStats(
  orders: unknown[],
  options?: AccountOrderCategoryOptions,
): AccountOrderStats {
  const stats = createEmptyAccountOrderStats();

  for (const order of orders) {
    if (deriveOrderWorkflowStatus(order) === "draft") continue;

    const cat = getAccountOrderTabCategory(order, options);
    stats[cat].count += 1;
    stats[cat].quantity += orderLineQuantity(order);
    stats[cat].amount += orderAmount(order);
  }

  return stats;
}

export const ACCOUNT_STATUS_COLORS: Record<
  AccountOrderTabCategory,
  { fill: string; hover: string; dot: string; label: string }
> = {
  dispatch_pending: {
    fill: "fill-amber-500/85 dark:fill-amber-500/60",
    hover: "fill-amber-600 dark:fill-amber-400",
    dot: "bg-amber-500 dark:bg-amber-450",
    label: "Dispatch Pending",
  },
  dispatched: {
    fill: "fill-blue-500/85 dark:fill-blue-500/60",
    hover: "fill-blue-600 dark:fill-blue-400",
    dot: "bg-blue-500 dark:bg-blue-400",
    label: "Dispatched",
  },
  pending_delivery: {
    fill: "fill-indigo-500/85 dark:fill-indigo-500/60",
    hover: "fill-indigo-600 dark:fill-indigo-400",
    dot: "bg-indigo-500 dark:bg-indigo-400",
    label: "Pending Delivery",
  },
  returns_pending: {
    fill: "fill-rose-500/85 dark:fill-rose-500/60",
    hover: "fill-rose-600 dark:fill-rose-400",
    dot: "bg-rose-500 dark:bg-rose-400",
    label: "Returns Pending",
  },
  closed: {
    fill: "fill-emerald-500/85 dark:fill-emerald-550/60",
    hover: "fill-emerald-600 dark:fill-emerald-400",
    dot: "bg-emerald-500 dark:bg-emerald-450",
    label: "Closed Orders",
  },
  on_hold: {
    fill: "fill-orange-500/85 dark:fill-orange-500/60",
    hover: "fill-orange-600 dark:fill-orange-400",
    dot: "bg-orange-500 dark:bg-orange-450",
    label: "On Hold",
  },
  cancelled: {
    fill: "fill-rose-500/85 dark:fill-rose-500/60",
    hover: "fill-rose-600 dark:fill-rose-450",
    dot: "bg-rose-500 dark:bg-rose-400",
    label: "Cancelled",
  },
};

export type AccountChartBreakdown = AccountOrderStats;

export function createEmptyAccountChartBreakdown(): AccountChartBreakdown {
  return createEmptyAccountOrderStats();
}

export function categorizeOrderForAccountChart(
  order: unknown,
  options?: AccountOrderCategoryOptions,
): AccountOrderTabCategory | null {
  if (deriveOrderWorkflowStatus(order) === "draft") return null;
  return getAccountOrderTabCategory(order, options);
}
