import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import {
  hasAnyPendingApproval,
  isOrderClosed,
  resolveApprovalPending,
  type ApprovalPendingStage,
} from "@/components/portal/sales/orderUtils";

export type AdminOrderTabCategory =
  | "pending_admin_approval"
  | "pending_approvals"
  | "open"
  | "closed"
  | "on_hold"
  | "cancelled"
  | "rejected";

export const ADMIN_ORDER_TABS: ReadonlyArray<{
  id: AdminOrderTabCategory;
  label: string;
}> = [
  { id: "pending_admin_approval", label: "Pending Admin Approval" },
  { id: "pending_approvals", label: "Pending Approvals" },
  { id: "open", label: "Open" },
  { id: "closed", label: "Closed" },
  { id: "on_hold", label: "On Hold" },
  { id: "rejected", label: "Rejected" },
  { id: "cancelled", label: "Cancelled" },
];

/**
 * Admin list tab bucket. Draft orders are excluded (return null).
 * Admin-pending orders bucket to pending_admin_approval; finance/account-only to pending_approvals.
 */
export function getAdminOrderTabCategory(order: unknown): AdminOrderTabCategory | null {
  if (!order || typeof order !== "object") return null;
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "draft") return null;
  if (status === "on_hold") return "on_hold";
  if (status === "cancelled") return "cancelled";
  if (status === "finance_rejected") return "rejected";
  if (isOrderClosed(row)) return "closed";

  const pending = resolveApprovalPending(row);
  if (pending.admin) return "pending_admin_approval";
  if (pending.finance || pending.account) return "pending_approvals";

  return "open";
}

/** Whether an order belongs on the given admin list tab. */
export function orderMatchesAdminTab(
  order: unknown,
  tab: AdminOrderTabCategory,
): boolean {
  if (!order || typeof order !== "object") return false;

  const pending = resolveApprovalPending(order);

  if (tab === "pending_admin_approval") return pending.admin;
  if (tab === "pending_approvals") {
    return pending.admin || pending.finance || pending.account;
  }

  const cat = getAdminOrderTabCategory(order);
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
    if (!order || typeof order !== "object") continue;
    if (deriveOrderWorkflowStatus(order as Record<string, unknown>) === "draft") continue;

    const pending = resolveApprovalPending(order);
    const qty = orderLineQuantity(order);
    const amount = orderAmount(order);

    if (pending.admin) {
      stats.pending_admin_approval.count += 1;
      stats.pending_admin_approval.quantity += qty;
      stats.pending_admin_approval.amount += amount;
    }
    if (pending.admin || pending.finance || pending.account) {
      stats.pending_approvals.count += 1;
      stats.pending_approvals.quantity += qty;
      stats.pending_approvals.amount += amount;
    }

    const cat = getAdminOrderTabCategory(order);
    if (!cat || cat === "pending_admin_approval" || cat === "pending_approvals") continue;

    stats[cat].count += 1;
    stats[cat].quantity += qty;
    stats[cat].amount += amount;
  }

  return stats;
}

export const ADMIN_STATUS_COLORS: Record<
  AdminOrderTabCategory,
  { fill: string; hover: string; dot: string; label: string }
> = {
  pending_admin_approval: {
    fill: "fill-purple-500/85 dark:fill-purple-500/60",
    hover: "fill-purple-600 dark:fill-purple-400",
    dot: "bg-purple-500 dark:bg-purple-400",
    label: "Pending Admin Approval",
  },
  pending_approvals: {
    fill: "fill-violet-500/85 dark:fill-violet-500/60",
    hover: "fill-violet-600 dark:fill-violet-400",
    dot: "bg-violet-500 dark:bg-violet-400",
    label: "Pending Approvals",
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
