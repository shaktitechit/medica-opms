import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import {
  lineApprovalQuantities,
  num,
  resolveAccountApprovalStatus,
} from "@/components/portal/shared/orderLineQuantities";
import {
  getOrderWorkflowTabCategory,
  type OrderWorkflowCategoryOptions,
} from "@/components/portal/shared/orderList/orderWorkflowTabs";
import type {
  UnbilledOrderItem,
  UnbilledOrderRecord,
} from "@/store/api/slices/unbilledOrderApi";

export type UnbilledStatusLabelOptions = {
  /** Live list order (enriched) — preferred over sparse UnbilledOrder.order populate. */
  order?: Record<string, unknown> | null;
  /** Same transport/dispatch sets as ListOrdersPage tabs. */
  categoryOptions?: OrderWorkflowCategoryOptions;
};

/** Dispatch batches that count as created + submitted (not draft / cancelled). */
const SUBMITTED_DISPATCH_STATUSES = new Set(["submitted", "transport_created"]);

export type UnbilledOrderOptions = {
  /** Qty from OrderDispatch rows with status submitted / transport_created, keyed by order id. */
  submittedDispatchQtyByOrderId?: Map<string, number>;
  /** Same qty keyed by `${orderId}:${orderItemId}`. */
  submittedDispatchQtyByOrderLineId?: Map<string, number>;
  /** Same transport/dispatch sets as ListOrdersPage tabs. */
  categoryOptions?: OrderWorkflowCategoryOptions;
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
 * Sum dispatched qty on a submitted / transport_created OrderDispatch.
 * Bill number is not required — Un Billed compares approval vs dispatch qty.
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

/** Build orderId → qty map from OrderDispatch list (submitted / transport_created and billed only). */
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
 * Build `${orderId}:${orderItemId}` → submitted dispatch qty from created+submitted and billed batches.
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
    const qty =
      q.accountCleared > 0
        ? q.accountCleared
        : q.financeApproved > 0
          ? q.financeApproved
          : q.salesApproved > 0
            ? q.salesApproved
            : q.ordered;
    approved += qty;
  }
  return approved;
}

export function orderUnbilledQuantityTotals(
  order: unknown,
  options?: UnbilledOrderOptions,
): {
  approved: number;
  /** Qty from billed OrderDispatch batches with status submitted / transport_created. */
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
    const approved =
      q.accountCleared > 0
        ? q.accountCleared
        : q.financeApproved > 0
          ? q.financeApproved
          : q.salesApproved > 0
            ? q.salesApproved
            : q.ordered;
    if (approved <= 0) continue;

    const lineKey = orderLineKey(orderId, orderItemId);
    const submittedDispatch =
      options?.submittedDispatchQtyByOrderLineId?.get(lineKey) ?? 0;

    // Remaining unbilled qty is approved - billed dispatch quantity
    const remaining = Math.max(0, approved - submittedDispatch);
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

/** Map `/api/unbilled-orders` line snapshots → modal line rows. */
export function listUnbilledLinesFromRecord(
  record: UnbilledOrderRecord,
): UnbilledOrderLine[] {
  const items = Array.isArray(record.unbilled_items) ? record.unbilled_items : [];
  const lines: UnbilledOrderLine[] = [];

  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as UnbilledOrderItem;
    const remaining = num(item.remaining_quantity);
    if (remaining <= 0) continue;

    const product = item.product;
    let productId = "";
    let productName = String(item.product_name || "Item");
    let sku = String(item.sku || "");
    if (product && typeof product === "object") {
      const p = product as Record<string, unknown>;
      productId = String(p._id ?? p.id ?? "");
      productName = String(p.product_name ?? p.name ?? productName);
      sku = String(p.sku ?? sku);
    } else if (typeof product === "string") {
      productId = product;
    }

    lines.push({
      orderItemId: refId(item.order_item_id),
      productId,
      productName,
      sku,
      approved: num(item.approved_quantity),
      submittedDispatch: num(item.billed_dispatched_quantity),
      remaining,
    });
  }

  return lines;
}

/** Only true billing-gap stages belong in the Un Billed modal. */
const TRACKABLE_STATUS_STAGES = new Set(["partially_billed", "unbilled"]);

/**
 * Status label for an UnbilledOrder API row — Unbilled or Partially Billed only.
 */
export function unbilledRecordStatusLabel(
  record: UnbilledOrderRecord,
  _options?: UnbilledStatusLabelOptions,
): string {
  const stage = String(record.pipeline_stage || "").toLowerCase();
  if (stage === "partially_billed") return "Partially Billed";
  if (stage === "unbilled") return "Unbilled";

  const billing = String(record.billing_status || "").toLowerCase();
  if (billing === "partially_billed") return "Partially Billed";
  if (Number(record.billed_dispatched_quantity ?? 0) > 0) {
    return "Partially Billed";
  }
  return "Unbilled";
}

export function unbilledRecordOrderId(record: UnbilledOrderRecord): string {
  return refId(record.order) || "";
}

export function unbilledRecordOrderNo(record: UnbilledOrderRecord): string {
  if (record.order_no) return String(record.order_no);
  if (record.order && typeof record.order === "object") {
    const o = record.order as Record<string, unknown>;
    return String(o.order_no ?? o.order_number ?? unbilledRecordOrderId(record) ?? "—");
  }
  return unbilledRecordOrderId(record) || "—";
}

export function unbilledRecordPartyId(record: UnbilledOrderRecord): string {
  const fromParty = refId(record.party);
  if (fromParty) return fromParty;
  if (record.order && typeof record.order === "object") {
    const o = record.order as Record<string, unknown>;
    return refId(o.party) || refId(o.customer) || "";
  }
  return "";
}

/** Sales rep id from the linked order (`assigned_sales_user`). */
export function unbilledRecordSalesUserId(record: UnbilledOrderRecord): string {
  if (record.order && typeof record.order === "object") {
    const o = record.order as Record<string, unknown>;
    return refId(o.assigned_sales_user) || "";
  }
  return "";
}

export function unbilledRecordPartyLabel(
  record: UnbilledOrderRecord,
  partyNameById?: Map<string, string>,
): string {
  if (record.party && typeof record.party === "object") {
    const p = record.party as Record<string, unknown>;
    const name = String(p.party_name ?? p.name ?? "").trim();
    if (name) return name;
  }
  const partyId = unbilledRecordPartyId(record);
  if (partyId && partyNameById?.has(partyId)) {
    return partyNameById.get(partyId) || "—";
  }
  return partyId || "—";
}

export function unbilledRecordGrandTotal(record: UnbilledOrderRecord): number {
  if (record.order && typeof record.order === "object" && Array.isArray(record.unbilled_items)) {
    const o = record.order as Record<string, any>;
    const orderItems = Array.isArray(o.order_items) ? o.order_items : [];
    
    // Build a map of order item id to order item rate/discount details
    const orderItemMap = new Map<string, any>();
    for (const item of orderItems) {
      if (item && item._id) {
        orderItemMap.set(String(item._id), item);
      }
    }
    
    let remainingSubtotal = 0;
    let remainingGst = 0;
    
    for (const item of record.unbilled_items) {
      const lineId = String(item.order_item_id || item._id || "");
      const orderItem = orderItemMap.get(lineId);
      if (!orderItem) continue;
      
      const qty = Number(item.remaining_quantity ?? 0);
      if (qty <= 0) continue;
      
      const unitPrice = Number(orderItem.unit_price ?? 0);
      const discountPercent = Number(orderItem.discount_percent ?? 0);
      const gstPercent = Number(orderItem.gst_percent ?? 0);
      
      const lineGross = qty * unitPrice;
      let disc = Number(orderItem.discount_amount ?? 0);
      if (discountPercent > 0) {
        disc = (lineGross * discountPercent) / 100;
      } else if (Number(orderItem.approved_quantity ?? 0) > 0) {
        // Proportional discount based on qty
        const appQty = Number(orderItem.approved_quantity);
        disc = (disc * qty) / appQty;
      }
      
      const taxable = Math.max(0, lineGross - disc);
      const gst = (taxable * gstPercent) / 100;
      
      remainingSubtotal += taxable;
      remainingGst += gst;
    }
    
    const subtotal = Number(o.subtotal ?? 0);
    const headerDiscount = Number(o.discount_amount ?? 0);
    const extraCharges = Number(o.extra_charges ?? 0) + Number(o.penalty_amount ?? 0) + Number(o.damage_charge ?? 0);
    
    let total = remainingSubtotal + remainingGst;
    if (subtotal > 0) {
      const ratio = remainingSubtotal / subtotal;
      total = total - (headerDiscount * ratio) + (extraCharges * ratio);
    }
    
    return Math.max(0, total);
  }

  if (record.order && typeof record.order === "object") {
    const o = record.order as Record<string, unknown>;
    return Number(o.grand_total ?? o.total ?? 0);
  }
  return 0;
}

/**
 * True when approved qty exceeds submitted/transport_created dispatch qty.
 * Does not include approval / due-sheet / transport-pending workflow buckets.
 */
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
    status === "account_rejected" ||
    status === "on_hold"
  ) {
    return false;
  }

  const adminApproval = String(row.admin_approval_status || "").toLowerCase();
  const financeApproval = String(row.finance_approval_status || "").toLowerCase();
  const accountApproval = String(row.account_approval_status || "").toLowerCase();
  if (
    adminApproval === "rejected" ||
    financeApproval === "rejected" ||
    accountApproval === "rejected"
  ) {
    return false;
  }

  const lifecycle = String(row.lifecycle_status || "").toLowerCase();
  const stage = String(row.workflow_stage || "").toLowerCase();
  if (lifecycle === "cancelled" || stage === "cancelled") return false;

  // Exclude approval-pending / in-transit list buckets. Transport-pending rows
  // may still qualify when approved qty > dispatched qty (shown as Partially Billed).
  const cat = getOrderWorkflowTabCategory(row, options?.categoryOptions);
  if (
    cat === "pending_admin_approval" ||
    cat === "due_sheet_pending" ||
    cat === "pending_finance_approval" ||
    cat === "pending_account_approval" ||
    cat === "in_transit"
  ) {
    return false;
  }

  const { approved, submittedDispatch } = orderUnbilledQuantityTotals(
    order,
    options,
  );
  return approved > submittedDispatch;
}

export function filterUnbilledOrders(
  orders: unknown[],
  options?: UnbilledOrderOptions,
): unknown[] {
  return orders.filter((order) => isUnbilledOrder(order, options));
}

/**
 * Whether an UnbilledOrder API row should appear in the Un Billed modal.
 * Only `unbilled` / `partially_billed` stages with remaining qty.
 */
export function isUnbilledModalRecord(
  record: UnbilledOrderRecord,
  _options?: UnbilledStatusLabelOptions,
): boolean {
  const stage = String(record.pipeline_stage || "").toLowerCase();
  if (!TRACKABLE_STATUS_STAGES.has(stage)) return false;
  return (
    Number(record.remaining_quantity ?? 0) > 0 ||
    Boolean(record.manual_remaining)
  );
}

/** @deprecated Use isUnbilledOrder */
export const isOpenOrder = isUnbilledOrder;
/** @deprecated Use filterUnbilledOrders */
export const filterOpenOrders = filterUnbilledOrders;
