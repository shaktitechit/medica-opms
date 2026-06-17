import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import {
  isOrderClosed,
  resolveApprovalPending,
  type ApprovalPendingStage,
} from "@/components/portal/sales/orderUtils";
import { hasPendingReturns } from "@/components/portal/shared/returnSettlement";
import {
  buildPendingReturnOrderIds,
  groupReturnsByOrderId,
} from "@/components/portal/account/accountOrderUtils";

export type DispatchOrderTabCategory =
  | "pending_approvals"
  | "pending_transport"
  | "pending_delivery"
  | "returns_pending"
  | "closed"
  | "on_hold"
  | "cancelled";

export const DISPATCH_ORDER_TABS: ReadonlyArray<{
  id: DispatchOrderTabCategory;
  label: string;
}> = [
  { id: "pending_approvals", label: "Pending Approvals" },
  { id: "pending_transport", label: "Pending Transport" },
  { id: "pending_delivery", label: "Pending Delivery" },
  { id: "returns_pending", label: "Pending Returns" },
  { id: "closed", label: "Closed Orders" },
  { id: "on_hold", label: "On Hold" },
  { id: "cancelled", label: "Cancelled" },
];

export const DISPATCH_ORDER_TAB_LABELS: Record<DispatchOrderTabCategory, string> = {
  pending_approvals: "Pending Approvals",
  pending_transport: "Pending Transport",
  pending_delivery: "Pending Delivery",
  returns_pending: "Pending Returns",
  closed: "Closed",
  on_hold: "On Hold",
  cancelled: "Cancelled",
};

export type DispatchOrderCategoryOptions = {
  pendingReturnOrderIds?: Set<string>;
  returnsByOrderId?: Map<string, Record<string, unknown>[]>;
};

export { buildPendingReturnOrderIds, groupReturnsByOrderId };

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
  options?: DispatchOrderCategoryOptions,
): boolean {
  const orderId = refId(order._id ?? order.id);
  if (options?.pendingReturnOrderIds?.has(orderId)) return true;
  if (options?.returnsByOrderId && orderId) {
    const rows = options.returnsByOrderId.get(orderId) ?? [];
    return hasPendingReturns(rows);
  }
  return false;
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

function hasAnyPendingApproval(order: unknown): boolean {
  const pending = resolveApprovalPending(order);
  return pending.admin || pending.finance || pending.account;
}

function getDispatchFulfillmentTabCategory(
  row: Record<string, unknown>,
  options?: DispatchOrderCategoryOptions,
): DispatchOrderTabCategory {
  const status = deriveOrderWorkflowStatus(row);

  if (status === "on_hold") return "on_hold";
  if (status === "cancelled") return "cancelled";
  if (isOrderClosed(row)) return "closed";
  if (orderHasPendingReturns(row, options)) return "returns_pending";

  const deliveryStatus = String(row.delivery_status || "");
  const { dispatched, delivered } = fulfillmentQuantities(row);

  const inTransitStatuses = new Set([
    "partially_transported",
    "fully_transported",
    "in_transit",
  ]);

  if (
    inTransitStatuses.has(status) ||
    deliveryStatus === "partial" ||
    (dispatched > 0 && delivered > 0 && delivered < dispatched)
  ) {
    return "pending_delivery";
  }

  return "pending_transport";
}

export function getDispatchOrderTabCategory(
  order: unknown,
  options?: DispatchOrderCategoryOptions,
): DispatchOrderTabCategory {
  if (!order || typeof order !== "object") return "pending_transport";
  const row = order as Record<string, unknown>;

  if (hasAnyPendingApproval(row)) return "pending_approvals";

  return getDispatchFulfillmentTabCategory(row, options);
}

/** Whether an order belongs on the given dispatch list tab. */
export function orderMatchesDispatchTab(
  order: unknown,
  tab: DispatchOrderTabCategory,
  options?: DispatchOrderCategoryOptions,
): boolean {
  if (!order || typeof order !== "object") return false;
  if (deriveOrderWorkflowStatus(order as Record<string, unknown>) === "draft") return false;

  if (tab === "pending_approvals") return hasAnyPendingApproval(order);

  const cat = getDispatchOrderTabCategory(order, options);
  return cat === tab;
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

export type DispatchOrderStats = Record<
  DispatchOrderTabCategory,
  { count: number; quantity: number; amount: number }
>;

export function createEmptyDispatchOrderStats(): DispatchOrderStats {
  return Object.fromEntries(
    DISPATCH_ORDER_TABS.map(({ id }) => [id, { count: 0, quantity: 0, amount: 0 }]),
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

/** Aggregate dispatch tab counts, quantities, and order value. Skips draft orders. */
export function computeDispatchOrderStats(
  orders: unknown[],
  options?: DispatchOrderCategoryOptions,
): DispatchOrderStats {
  const stats = createEmptyDispatchOrderStats();

  for (const order of orders) {
    if (deriveOrderWorkflowStatus(order) === "draft") continue;

    const cat = getDispatchOrderTabCategory(order, options);
    stats[cat].count += 1;
    stats[cat].quantity += orderLineQuantity(order);
    stats[cat].amount += orderAmount(order);
  }

  return stats;
}

export const DISPATCH_STATUS_COLORS: Record<
  DispatchOrderTabCategory,
  { fill: string; hover: string; dot: string; label: string }
> = {
  pending_approvals: {
    fill: "fill-violet-500/85 dark:fill-violet-500/60",
    hover: "fill-violet-600 dark:fill-violet-400",
    dot: "bg-violet-500 dark:bg-violet-400",
    label: "Pending Approvals",
  },
  pending_transport: {
    fill: "fill-amber-500/85 dark:fill-amber-500/60",
    hover: "fill-amber-600 dark:fill-amber-400",
    dot: "bg-amber-500 dark:bg-amber-450",
    label: "Pending Transport",
  },
  pending_delivery: {
    fill: "fill-blue-500/85 dark:fill-blue-500/60",
    hover: "fill-blue-600 dark:fill-blue-400",
    dot: "bg-blue-500 dark:bg-blue-400",
    label: "Pending Delivery",
  },
  returns_pending: {
    fill: "fill-rose-500/85 dark:fill-rose-500/60",
    hover: "fill-rose-600 dark:fill-rose-400",
    dot: "bg-rose-500 dark:bg-rose-400",
    label: "Pending Returns",
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
    fill: "fill-slate-500/85 dark:fill-slate-500/60",
    hover: "fill-slate-600 dark:fill-slate-450",
    dot: "bg-slate-500 dark:bg-slate-400",
    label: "Cancelled",
  },
};

export type DispatchChartBreakdown = DispatchOrderStats;

export function createEmptyDispatchChartBreakdown(): DispatchChartBreakdown {
  return createEmptyDispatchOrderStats();
}

export function categorizeOrderForDispatchChart(
  order: unknown,
  options?: DispatchOrderCategoryOptions,
): DispatchOrderTabCategory | null {
  if (deriveOrderWorkflowStatus(order) === "draft") return null;
  return getDispatchOrderTabCategory(order, options);
}
