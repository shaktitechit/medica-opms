import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";

export type SalesOrderTabCategory =
  | "draft"
  | "open"
  | "closed"
  | "on_hold"
  | "cancelled"
  | "rejected";

/** Order is account/settlement closed (not merely delivered in transit). */
export function isOrderClosed(order: unknown): boolean {
  if (!order || typeof order !== "object") return false;
  const row = order as Record<string, unknown>;
  if (row.closed_at != null && row.closed_at !== "") return true;
  return String(row.lifecycle_status || "").toLowerCase() === "closed";
}

/**
 * Sales list tab bucket:
 * - draft — not yet submitted
 * - open — submitted and still active (not closed / on hold / rejected / cancelled)
 * - closed — lifecycle closed or closed_at set
 * - on_hold / rejected / cancelled — terminal workflow states
 */
export function getOrderTabCategory(order: unknown): SalesOrderTabCategory {
  if (!order || typeof order !== "object") return "open";
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "draft") return "draft";
  if (status === "on_hold") return "on_hold";
  if (status === "cancelled") return "cancelled";
  if (status === "finance_rejected") return "rejected";
  if (isOrderClosed(row)) return "closed";

  // Submitted (or in-progress) but not yet closed
  return "open";
}

export const SALES_ORDER_TABS: ReadonlyArray<{
  id: SalesOrderTabCategory;
  label: string;
}> = [
  { id: "draft", label: "Draft" },
  { id: "open", label: "Open" },
  { id: "closed", label: "Closed" },
  { id: "on_hold", label: "On Hold" },
  { id: "rejected", label: "Rejected" },
  { id: "cancelled", label: "Cancelled" },
];

export type SalesOrderStats = Record<
  SalesOrderTabCategory,
  { count: number; quantity: number }
>;

export function createEmptySalesOrderStats(): SalesOrderStats {
  return Object.fromEntries(
    SALES_ORDER_TABS.map(({ id }) => [id, { count: 0, quantity: 0 }]),
  ) as SalesOrderStats;
}

/** Aggregate order counts and line quantities by sales tab bucket. */
export function computeSalesOrderStats(orders: unknown[]): SalesOrderStats {
  const stats = createEmptySalesOrderStats();

  for (const order of orders) {
    const cat = getOrderTabCategory(order);
    const row = order as { order_items?: unknown[] };
    const items = Array.isArray(row.order_items) ? row.order_items : [];
    let orderQty = 0;
    for (const item of items) {
      const line = item as { ordered_quantity?: unknown; quantity?: unknown };
      orderQty += Number(line.ordered_quantity ?? line.quantity ?? 0);
    }
    stats[cat].count += 1;
    stats[cat].quantity += orderQty;
  }

  return stats;
}

export function isSalesOrderTabCategory(value: string): value is SalesOrderTabCategory {
  return SALES_ORDER_TABS.some((tab) => tab.id === value);
}
