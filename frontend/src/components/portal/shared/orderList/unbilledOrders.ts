import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import {
  lineApprovalQuantities,
  num,
  resolveAccountApprovalStatus,
} from "@/components/portal/shared/orderLineQuantities";
import {
  isDueSheetPending,
  resolveApprovalPending,
} from "@/components/portal/shared/orderList/orderWorkflowTabs";

/** Dispatch batches that count as created + submitted (not draft / cancelled). */
const SUBMITTED_DISPATCH_STATUSES = new Set(["submitted", "transport_created"]);

export type UnbilledOrderOptions = {
  /** Qty from OrderDispatch rows with status submitted / transport_created, keyed by order id. */
  submittedDispatchQtyByOrderId?: Map<string, number>;
  /** Same qty keyed by `${orderId}:${orderItemId}`. */
  submittedDispatchQtyByOrderLineId?: Map<string, number>;
};

export type UnbilledOrderLine = {
  orderItemId: string;
  productId: string;
  productName: string;
  sku: string;
  approved: number;
  submittedDispatch: number;
  remaining: number;
};

function refId(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return String(o._id ?? o.id ?? "");
  }
  return String(value);
}

function orderLineKey(orderId: string, orderItemId: string): string {
  return `${orderId}:${orderItemId}`;
}

function resolveProductLabel(line: Record<string, unknown>): {
  id: string;
  name: string;
  sku: string;
} {
  const product = line.product;
  if (product && typeof product === "object") {
    const p = product as Record<string, unknown>;
    return {
      id: String(p._id ?? p.id ?? ""),
      name: String(p.product_name ?? p.name ?? line.product_name ?? "Item"),
      sku: String(p.sku ?? line.sku ?? ""),
    };
  }
  if (typeof product === "string" && product) {
    return {
      id: product,
      name: String(line.product_name ?? line.name ?? "Item"),
      sku: String(line.sku ?? ""),
    };
  }
  return {
    id: "",
    name: String(line.product_name ?? line.name ?? "Item"),
    sku: String(line.sku ?? ""),
  };
}

/**
 * Sum dispatched qty on a single OrderDispatch document's items.
 */
export function dispatchSubmittedQuantity(dispatch: unknown): number {
  if (!dispatch || typeof dispatch !== "object") return 0;
  const row = dispatch as Record<string, unknown>;
  const status = String(row.dispatch_status ?? row.status ?? "").toLowerCase();
  if (!SUBMITTED_DISPATCH_STATUSES.has(status)) return 0;
  const items = Array.isArray(row.dispatch_items)
    ? row.dispatch_items
    : Array.isArray(row.items)
      ? row.items
      : [];
  let total = 0;
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    total += num(item.dispatched_quantity ?? item.dispatch_quantity ?? item.allocated_quantity);
  }
  return total;
}

/** Build orderId → qty map from OrderDispatch list (submitted / transport_created only). */
export function buildSubmittedDispatchQtyByOrderId(
  dispatches: unknown[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const raw of dispatches) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const orderId = refId(row.order);
    if (!orderId) continue;
    const qty = dispatchSubmittedQuantity(row);
    if (qty <= 0) continue;
    map.set(orderId, (map.get(orderId) ?? 0) + qty);
  }
  return map;
}

/**
 * Build `${orderId}:${orderItemId}` → submitted dispatch qty from created+submitted batches.
 */
export function buildSubmittedDispatchQtyByOrderLineId(
  dispatches: unknown[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const raw of dispatches) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const status = String(row.dispatch_status ?? row.status ?? "").toLowerCase();
    if (!SUBMITTED_DISPATCH_STATUSES.has(status)) continue;
    const orderId = refId(row.order);
    if (!orderId) continue;
    const items = Array.isArray(row.dispatch_items)
      ? row.dispatch_items
      : Array.isArray(row.items)
        ? row.items
        : [];
    for (const itemRaw of items) {
      if (!itemRaw || typeof itemRaw !== "object") continue;
      const item = itemRaw as Record<string, unknown>;
      const orderItemId = refId(item.order_item_id ?? item.order_item);
      if (!orderItemId) continue;
      const qty = num(item.dispatched_quantity ?? item.dispatch_quantity ?? item.allocated_quantity);
      if (qty <= 0) continue;
      const key = orderLineKey(orderId, orderItemId);
      map.set(key, (map.get(key) ?? 0) + qty);
    }
  }
  return map;
}

/**
 * Unbilled orders sit outside workflow tabs.
 *
 * Criteria:
 * 1. Cleared Admin → Due Sheet → Finance → Account
 * 2. At least one OrderDispatch created and submitted
 * 3. That submitted dispatch qty is still less than approved qty
 */
export function orderApprovedQuantity(order: unknown): number {
  if (!order || typeof order !== "object") return 0;
  const row = order as Record<string, unknown>;
  const items = Array.isArray(row.order_items) ? row.order_items : [];
  const accountStatus = resolveAccountApprovalStatus(row);
  let approved = 0;
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const q = lineApprovalQuantities(raw as Record<string, unknown>, {
      accountApprovalStatus: accountStatus,
    });
    approved += q.accountCleared > 0 ? q.accountCleared : q.financeApproved;
  }
  return approved;
}

export function orderUnbilledQuantityTotals(
  order: unknown,
  options?: UnbilledOrderOptions,
): {
  approved: number;
  /** Qty from created+submitted OrderDispatch batches (not drafts). */
  submittedDispatch: number;
} {
  const approved = orderApprovedQuantity(order);
  if (!order || typeof order !== "object") {
    return { approved, submittedDispatch: 0 };
  }
  const row = order as Record<string, unknown>;
  const orderId = refId(row._id ?? row.id);
  const fromMap = orderId
    ? options?.submittedDispatchQtyByOrderId?.get(orderId)
    : undefined;
  return {
    approved,
    submittedDispatch: fromMap ?? 0,
  };
}

/** Per-line approved vs submitted-dispatch breakdown for an unbilled order. */
export function listUnbilledOrderLines(
  order: unknown,
  options?: UnbilledOrderOptions,
): UnbilledOrderLine[] {
  if (!order || typeof order !== "object") return [];
  const row = order as Record<string, unknown>;
  const orderId = refId(row._id ?? row.id);
  const items = Array.isArray(row.order_items) ? row.order_items : [];
  const accountStatus = resolveAccountApprovalStatus(row);
  const lines: UnbilledOrderLine[] = [];

  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const line = raw as Record<string, unknown>;
    const orderItemId = refId(line._id ?? line.id);
    if (!orderItemId) continue;

    const q = lineApprovalQuantities(line, { accountApprovalStatus: accountStatus });
    const approved = q.accountCleared > 0 ? q.accountCleared : q.financeApproved;
    if (approved <= 0) continue;

    const lineKey = orderLineKey(orderId, orderItemId);
    const submittedDispatch =
      options?.submittedDispatchQtyByOrderLineId?.get(lineKey) ?? 0;
    const remaining = Math.max(0, approved - submittedDispatch);
    // Only lines that still need dispatch (unbilled / pending qty).
    if (remaining <= 0) continue;

    const { id: productId, name, sku } = resolveProductLabel(line);

    lines.push({
      orderItemId,
      productId,
      productName: name,
      sku,
      approved,
      submittedDispatch,
      remaining,
    });
  }

  return lines;
}

function hasClearedDepartmentApproval(statusValue: unknown): boolean {
  const s = String(statusValue || "pending").toLowerCase();
  return s === "full" || s === "approved" || s === "partial";
}

/** True when fully approved, has submitted OrderDispatch, and that qty &lt; approved. */
export function isUnbilledOrder(
  order: unknown,
  options?: UnbilledOrderOptions,
): boolean {
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

  const pending = resolveApprovalPending(row);
  if (pending.admin) return false;
  if (isDueSheetPending(row)) return false;
  if (!hasClearedDepartmentApproval(row.finance_approval_status)) return false;
  if (!hasClearedDepartmentApproval(row.account_approval_status)) return false;

  const { approved, submittedDispatch } = orderUnbilledQuantityTotals(row, options);
  if (approved <= 0) return false;
  // Must have OrderDispatch created and submitted (not merely draft).
  if (submittedDispatch <= 0) return false;
  return submittedDispatch < approved;
}

export function filterUnbilledOrders(
  orders: unknown[],
  options?: UnbilledOrderOptions,
): unknown[] {
  return orders.filter((order) => isUnbilledOrder(order, options));
}

/** @deprecated Use isUnbilledOrder */
export const isOpenOrder = isUnbilledOrder;
/** @deprecated Use filterUnbilledOrders */
export const filterOpenOrders = filterUnbilledOrders;
