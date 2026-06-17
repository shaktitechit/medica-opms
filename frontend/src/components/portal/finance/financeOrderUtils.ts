import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import {
  isOrderClosed,
  resolveApprovalPending,
  type ApprovalPendingStage,
} from "@/components/portal/sales/orderUtils";

export type FinanceOrderTabCategory =
  | "pending_finance_approval"
  | "pending_approvals"
  | "open"
  | "closed"
  | "on_hold"
  | "cancelled"
  | "rejected";

export const FINANCE_ORDER_TABS: ReadonlyArray<{
  id: FinanceOrderTabCategory;
  label: string;
}> = [
  { id: "pending_finance_approval", label: "Pending Finance Approval" },
  { id: "pending_approvals", label: "Pending Approvals" },
  { id: "open", label: "Open Orders" },
  { id: "closed", label: "Closed Orders" },
  { id: "on_hold", label: "On Hold" },
  { id: "rejected", label: "Rejected" },
  { id: "cancelled", label: "Cancelled" },
];

export const FINANCE_ORDER_TAB_LABELS: Record<FinanceOrderTabCategory, string> = {
  pending_finance_approval: "Pending Finance Approval",
  pending_approvals: "Pending Approvals",
  open: "Open",
  closed: "Closed",
  on_hold: "On Hold",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/**
 * Finance list tab bucket. Draft orders are excluded (return null).
 * Finance-pending orders bucket to pending_finance_approval; admin/account-only to pending_approvals.
 */
export function getFinanceOrderTabCategory(order: unknown): FinanceOrderTabCategory | null {
  if (!order || typeof order !== "object") return null;
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "draft") return null;
  if (status === "on_hold") return "on_hold";
  if (status === "cancelled") return "cancelled";
  if (status === "finance_rejected") return "rejected";
  if (isOrderClosed(row)) return "closed";

  const pending = resolveApprovalPending(row);
  if (pending.finance) return "pending_finance_approval";
  if (pending.admin || pending.account) return "pending_approvals";

  return "open";
}

/** Whether an order belongs on the given finance list tab. */
export function orderMatchesFinanceTab(
  order: unknown,
  tab: FinanceOrderTabCategory,
): boolean {
  if (!order || typeof order !== "object") return false;

  const pending = resolveApprovalPending(order);

  if (tab === "pending_finance_approval") return pending.finance;
  if (tab === "pending_approvals") {
    return pending.admin || pending.finance || pending.account;
  }

  const cat = getFinanceOrderTabCategory(order);
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
    if (!order || typeof order !== "object") continue;
    if (deriveOrderWorkflowStatus(order as Record<string, unknown>) === "draft") continue;

    const pending = resolveApprovalPending(order);
    const qty = orderLineQuantity(order);
    const amount = orderAmount(order);

    if (pending.finance) {
      stats.pending_finance_approval.count += 1;
      stats.pending_finance_approval.quantity += qty;
      stats.pending_finance_approval.amount += amount;
    }
    if (pending.admin || pending.finance || pending.account) {
      stats.pending_approvals.count += 1;
      stats.pending_approvals.quantity += qty;
      stats.pending_approvals.amount += amount;
    }

    const cat = getFinanceOrderTabCategory(order);
    if (!cat || cat === "pending_finance_approval" || cat === "pending_approvals") continue;

    stats[cat].count += 1;
    stats[cat].quantity += qty;
    stats[cat].amount += amount;
  }

  return stats;
}

export const FINANCE_STATUS_COLORS: Record<
  FinanceOrderTabCategory,
  { fill: string; hover: string; dot: string; label: string }
> = {
  pending_finance_approval: {
    fill: "fill-purple-500/85 dark:fill-purple-500/60",
    hover: "fill-purple-600 dark:fill-purple-400",
    dot: "bg-purple-500 dark:bg-purple-400",
    label: "Pending Finance Approval",
  },
  pending_approvals: {
    fill: "fill-violet-500/85 dark:fill-violet-500/60",
    hover: "fill-violet-600 dark:fill-violet-400",
    dot: "bg-violet-500 dark:bg-violet-400",
    label: "Pending Approvals",
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
  return getFinanceOrderTabCategory(order);
}
