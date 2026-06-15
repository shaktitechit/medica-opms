import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import { isOrderClosed } from "@/components/portal/sales/orderUtils";

export type AdminOrderTabCategory =
  | "pending_review"
  | "open"
  | "closed"
  | "on_hold"
  | "cancelled"
  | "rejected";

export const ADMIN_ORDER_TABS: ReadonlyArray<{
  id: AdminOrderTabCategory;
  label: string;
}> = [
  { id: "pending_review", label: "Pending Review" },
  { id: "open", label: "Open" },
  { id: "closed", label: "Closed" },
  { id: "on_hold", label: "On Hold" },
  { id: "rejected", label: "Rejected" },
  { id: "cancelled", label: "Cancelled" },
];

/**
 * Admin list tab bucket. Draft orders are excluded (return null).
 */
export function getAdminOrderTabCategory(order: unknown): AdminOrderTabCategory | null {
  if (!order || typeof order !== "object") return null;
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "draft") return null;
  if (status === "on_hold") return "on_hold";
  if (status === "cancelled") return "cancelled";
  if (status === "finance_rejected") return "rejected";
  if (status === "submitted") return "pending_review";
  if (isOrderClosed(row)) return "closed";

  return "open";
}

export function isAdminOrderTabCategory(value: string): value is AdminOrderTabCategory {
  return ADMIN_ORDER_TABS.some((tab) => tab.id === value);
}

export type AdminOrderStats = Record<
  AdminOrderTabCategory,
  { count: number; quantity: number; amount: number }
>;

export function createEmptyAdminOrderStats(): AdminOrderStats {
  return Object.fromEntries(
    ADMIN_ORDER_TABS.map(({ id }) => [id, { count: 0, quantity: 0, amount: 0 }]),
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

/** Aggregate admin tab counts, quantities, and order value. Skips draft orders. */
export function computeAdminOrderStats(orders: unknown[]): AdminOrderStats {
  const stats = createEmptyAdminOrderStats();

  for (const order of orders) {
    const cat = getAdminOrderTabCategory(order);
    if (!cat) continue;

    stats[cat].count += 1;
    stats[cat].quantity += orderLineQuantity(order);
    stats[cat].amount += orderAmount(order);
  }

  return stats;
}

export const ADMIN_STATUS_COLORS: Record<
  AdminOrderTabCategory,
  { fill: string; hover: string; dot: string; label: string }
> = {
  pending_review: {
    fill: "fill-purple-500/85 dark:fill-purple-500/60",
    hover: "fill-purple-600 dark:fill-purple-400",
    dot: "bg-purple-500 dark:bg-purple-400",
    label: "Pending Review",
  },
  open: {
    fill: "fill-blue-500/85 dark:fill-blue-500/60",
    hover: "fill-blue-600 dark:fill-blue-400",
    dot: "bg-blue-500 dark:bg-blue-400",
    label: "Open",
  },
  closed: {
    fill: "fill-emerald-500/85 dark:fill-emerald-550/60",
    hover: "fill-emerald-600 dark:fill-emerald-400",
    dot: "bg-emerald-500 dark:bg-emerald-450",
    label: "Closed",
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

export type AdminChartBreakdown = AdminOrderStats;

export function createEmptyAdminChartBreakdown(): AdminChartBreakdown {
  return createEmptyAdminOrderStats();
}

export function categorizeOrderForAdminChart(order: unknown): AdminOrderTabCategory | null {
  return getAdminOrderTabCategory(order);
}
