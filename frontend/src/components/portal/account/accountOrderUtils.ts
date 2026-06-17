import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import {
  isOrderClosed,
  resolveApprovalPending,
  type ApprovalPendingStage,
} from "@/components/portal/sales/orderUtils";
import { isReturnPending } from "@/constants/orderReturnStatus";

export type AccountOrderTabCategory =
  | "pending_account_approval"
  | "pending_approvals"
  | "open"
  | "closed"
  | "on_hold"
  | "cancelled";

export const ACCOUNT_ORDER_TABS: ReadonlyArray<{
  id: AccountOrderTabCategory;
  label: string;
}> = [
  { id: "pending_account_approval", label: "Pending Account Approval" },
  { id: "pending_approvals", label: "Pending Approvals" },
  { id: "open", label: "Open Orders" },
  { id: "closed", label: "Closed Orders" },
  { id: "on_hold", label: "On Hold" },
  { id: "cancelled", label: "Cancelled" },
];

export const ACCOUNT_ORDER_TAB_LABELS: Record<AccountOrderTabCategory, string> = {
  pending_account_approval: "Pending Account Approval",
  pending_approvals: "Pending Approvals",
  open: "Open",
  closed: "Closed",
  on_hold: "On Hold",
  cancelled: "Cancelled",
};

/** @deprecated Account tabs no longer use return-based categorization. */
export type AccountOrderCategoryOptions = {
  pendingReturnOrderIds?: Set<string>;
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

function normalizeAccountApprovalStatus(value: unknown): string {
  const status = String(value || "pending");
  if (status === "full") return "approved";
  return status;
}

function isFinanceCleared(row: Record<string, unknown>, status: string): boolean {
  const financeApprovalStatus = String(row.finance_approval_status || "");
  return (
    financeApprovalStatus === "approved" ||
    financeApprovalStatus === "partial" ||
    financeApprovalStatus === "full" ||
    status === "fully_finance_approved" ||
    status === "partially_finance_approved"
  );
}

function isAccountFullyCleared(row: Record<string, unknown>, status: string): boolean {
  const accountApprovalStatus = normalizeAccountApprovalStatus(row.account_approval_status);
  return (
    accountApprovalStatus === "approved" ||
    status === "fully_account_approved"
  );
}

function isPendingAccountReview(row: Record<string, unknown>, status: string): boolean {
  if (!isFinanceCleared(row, status)) return false;
  if (isAccountFullyCleared(row, status)) return false;

  const stage = String(row.workflow_stage || "");
  const action = String(row.current_action || "");
  const accountApprovalStatus = normalizeAccountApprovalStatus(row.account_approval_status);

  if (stage === "account_review" || status === "account_review") return true;
  if (action === "sent_to_account" || action === "account_review") return true;
  if (status === "partially_account_approved") return true;
  if (accountApprovalStatus === "pending" || accountApprovalStatus === "partial") return true;

  return false;
}

function isAccountPending(order: unknown): boolean {
  if (!order || typeof order !== "object") return false;
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);
  const pending = resolveApprovalPending(row);
  return pending.account || isPendingAccountReview(row, status);
}

/**
 * Account list tab bucket. Draft orders are excluded (return null).
 * Account-pending orders bucket to pending_account_approval; admin/finance-only to pending_approvals.
 */
export function getAccountOrderTabCategory(
  order: unknown,
  _options?: AccountOrderCategoryOptions,
): AccountOrderTabCategory | null {
  if (!order || typeof order !== "object") return null;
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "draft") return null;
  if (status === "on_hold") return "on_hold";
  if (status === "cancelled") return "cancelled";
  if (isOrderClosed(row)) return "closed";

  const pending = resolveApprovalPending(row);
  if (pending.account || isPendingAccountReview(row, status)) {
    return "pending_account_approval";
  }
  if (pending.admin || pending.finance) return "pending_approvals";

  return "open";
}

/** Whether an order belongs on the given account list tab. */
export function orderMatchesAccountTab(
  order: unknown,
  tab: AccountOrderTabCategory,
): boolean {
  if (!order || typeof order !== "object") return false;

  const pending = resolveApprovalPending(order);

  if (tab === "pending_account_approval") return isAccountPending(order);
  if (tab === "pending_approvals") {
    return pending.admin || pending.finance || pending.account || isAccountPending(order);
  }

  const cat = getAccountOrderTabCategory(order);
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
  _options?: AccountOrderCategoryOptions,
): AccountOrderStats {
  const stats = createEmptyAccountOrderStats();

  for (const order of orders) {
    if (!order || typeof order !== "object") continue;
    if (deriveOrderWorkflowStatus(order as Record<string, unknown>) === "draft") continue;

    const pending = resolveApprovalPending(order);
    const qty = orderLineQuantity(order);
    const amount = orderAmount(order);

    if (isAccountPending(order)) {
      stats.pending_account_approval.count += 1;
      stats.pending_account_approval.quantity += qty;
      stats.pending_account_approval.amount += amount;
    }
    if (pending.admin || pending.finance || pending.account || isAccountPending(order)) {
      stats.pending_approvals.count += 1;
      stats.pending_approvals.quantity += qty;
      stats.pending_approvals.amount += amount;
    }

    const cat = getAccountOrderTabCategory(order);
    if (!cat || cat === "pending_account_approval" || cat === "pending_approvals") continue;

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
  pending_account_approval: {
    fill: "fill-purple-500/85 dark:fill-purple-500/60",
    hover: "fill-purple-600 dark:fill-purple-400",
    dot: "bg-purple-500 dark:bg-purple-400",
    label: "Pending Account Approval",
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
  _options?: AccountOrderCategoryOptions,
): AccountOrderTabCategory | null {
  return getAccountOrderTabCategory(order);
}
