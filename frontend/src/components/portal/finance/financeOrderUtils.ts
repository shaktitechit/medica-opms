import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import { isOrderClosed } from "@/components/portal/sales/orderUtils";

export type FinanceOrderTabCategory =
  | "pending_finance_review"
  | "open"
  | "closed"
  | "on_hold"
  | "cancelled"
  | "rejected";

export const FINANCE_ORDER_TABS: ReadonlyArray<{
  id: FinanceOrderTabCategory;
  label: string;
}> = [
  { id: "pending_finance_review", label: "Pending Finance Review" },
  { id: "open", label: "Open Orders" },
  { id: "closed", label: "Closed Orders" },
  { id: "on_hold", label: "On Hold" },
  { id: "rejected", label: "Rejected" },
  { id: "cancelled", label: "Cancelled" },
];

export const FINANCE_ORDER_TAB_LABELS: Record<FinanceOrderTabCategory, string> = {
  pending_finance_review: "Pending Finance Review",
  open: "Open",
  closed: "Closed",
  on_hold: "On Hold",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export function getFinanceOrderTabCategory(order: unknown): FinanceOrderTabCategory {
  if (!order || typeof order !== "object") return "open";
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "on_hold") return "on_hold";
  if (status === "cancelled") return "cancelled";
  if (status === "finance_rejected") return "rejected";
  if (
    status === "finance_review" ||
    status === "submitted" ||
    status === "sales_approved" ||
    row.workflow_stage === "finance_review"
  ) {
    return "pending_finance_review";
  }
  if (isOrderClosed(row)) return "closed";

  return "open";
}

export function isFinanceOrderTabCategory(value: string): value is FinanceOrderTabCategory {
  return FINANCE_ORDER_TABS.some((tab) => tab.id === value);
}

export type FinanceOrderStats = Record<
  FinanceOrderTabCategory,
  { count: number; quantity: number; amount: number }
>;

export function createEmptyFinanceOrderStats(): FinanceOrderStats {
  return Object.fromEntries(
    FINANCE_ORDER_TABS.map(({ id }) => [id, { count: 0, quantity: 0, amount: 0 }]),
  ) as FinanceOrderStats;
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

/** Aggregate finance tab counts, quantities, and order value. Skips draft orders. */
export function computeFinanceOrderStats(orders: unknown[]): FinanceOrderStats {
  const stats = createEmptyFinanceOrderStats();

  for (const order of orders) {
    if (deriveOrderWorkflowStatus(order) === "draft") continue;

    const cat = getFinanceOrderTabCategory(order);
    stats[cat].count += 1;
    stats[cat].quantity += orderLineQuantity(order);
    stats[cat].amount += orderAmount(order);
  }

  return stats;
}

export const FINANCE_STATUS_COLORS: Record<
  FinanceOrderTabCategory,
  { fill: string; hover: string; dot: string; label: string }
> = {
  pending_finance_review: {
    fill: "fill-purple-500/85 dark:fill-purple-500/60",
    hover: "fill-purple-600 dark:fill-purple-400",
    dot: "bg-purple-500 dark:bg-purple-400",
    label: "Pending Finance Review",
  },
  open: {
    fill: "fill-teal-500/85 dark:fill-teal-500/60",
    hover: "fill-teal-600 dark:fill-teal-400",
    dot: "bg-teal-500 dark:bg-teal-400",
    label: "Open Orders",
  },
  closed: {
    fill: "fill-emerald-500/85 dark:fill-emerald-550/60",
    hover: "fill-emerald-600 dark:fill-emerald-400",
    dot: "bg-emerald-500 dark:bg-emerald-450",
    label: "Closed Orders",
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

export type FinanceChartBreakdown = FinanceOrderStats;

export function createEmptyFinanceChartBreakdown(): FinanceChartBreakdown {
  return createEmptyFinanceOrderStats();
}

export function categorizeOrderForFinanceChart(order: unknown): FinanceOrderTabCategory | null {
  if (deriveOrderWorkflowStatus(order) === "draft") return null;
  return getFinanceOrderTabCategory(order);
}
