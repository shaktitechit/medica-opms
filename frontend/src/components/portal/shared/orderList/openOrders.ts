import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import { num } from "@/components/portal/shared/orderLineQuantities";
import {
  isDueSheetPending,
  resolveApprovalPending,
} from "@/components/portal/shared/orderList/orderWorkflowTabs";

/**
 * Open orders are outside workflow tabs.
 *
 * Must have cleared every pre-fulfillment stage:
 * Admin Pending → Due Sheet Pending → Finance Pending → Account Pending.
 * Then: ordered qty is not fully delivered (delivered < ordered).
 * May still sit in dispatch / transport / return / closed-labelled buckets.
 */
export function orderDeliveryQuantityTotals(order: unknown): {
  ordered: number;
  delivered: number;
} {
  if (!order || typeof order !== "object") {
    return { ordered: 0, delivered: 0 };
  }
  const row = order as Record<string, unknown>;
  const items = Array.isArray(row.order_items) ? row.order_items : [];
  let ordered = 0;
  let delivered = 0;
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const line = raw as Record<string, unknown>;
    ordered += num(line.ordered_quantity ?? line.quantity);
    delivered += num(line.delivered_quantity);
  }
  return { ordered, delivered };
}

/** True when all approval stages are cleared and the order is not fully delivered. */
export function isOpenOrder(order: unknown): boolean {
  if (!order || typeof order !== "object") return false;
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);

  if (
    status === "draft" ||
    status === "cancelled" ||
    status === "finance_rejected" ||
    status === "on_hold"
  ) {
    return false;
  }

  // Must be past Admin / Due Sheet / Finance / Account pending.
  const pending = resolveApprovalPending(row);
  if (pending.admin || pending.finance || pending.account) return false;
  if (isDueSheetPending(row)) return false;

  const { ordered, delivered } = orderDeliveryQuantityTotals(row);
  if (ordered <= 0) return false;
  return delivered < ordered;
}

export function filterOpenOrders(orders: unknown[]): unknown[] {
  return orders.filter((order) => isOpenOrder(order));
}
