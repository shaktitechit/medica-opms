import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import { isKitShellOrderLine } from "@/components/portal/shared/orderLineQuantities";

export type Metric = "quantity" | "volume";
export type QtyBasis = "approved" | "dispatched";
export type RateBucket = { total: number; sr: number; sra: number; cr: number };

export function shouldIncludeOrder(order: any, basis: QtyBasis | string): boolean {
  if (!order) return false;
  const status = deriveOrderWorkflowStatus(order);

  if (
    status === "draft" ||
    status === "deleted" ||
    order.is_deleted === true ||
    order.isDeleted === true ||
    order.deletedAt != null
  ) {
    return false;
  }

  if (basis === "approved" || basis === "dispatched") {
    if (
      status === "cancelled" ||
      status === "finance_rejected" ||
      status === "rejected" ||
      status === "on_hold"
    ) {
      return false;
    }
  }

  if (basis === "dispatched") {
    const hasBillingDate = Boolean(
      order.billing_date || order.dispatched_at || order.dispatch_date,
    );
    if (!hasBillingDate) return false;
  }

  return true;
}

function idFromRef(ref: unknown): string {
  if (ref == null || ref === "") return "";
  if (typeof ref === "string") return ref.trim();
  if (typeof ref === "object") {
    const o = ref as { _id?: unknown; id?: unknown };
    return String(o._id ?? o.id ?? "").trim();
  }
  return "";
}

/** Kit buckets are fulfillment-only — exclude from commercial volume. */
function isKitBucketLine(item: unknown): boolean {
  if (!item || typeof item !== "object") return false;
  return Boolean(idFromRef((item as { kit_parent_product?: unknown }).kit_parent_product));
}

export function normalizeRateType(raw: unknown): "SR" | "SRA" | "CR" | null {
  const rateType = !raw || raw === "MANUAL" ? "SR" : String(raw).toUpperCase();
  if (rateType === "SR" || rateType === "SRA" || rateType === "CR") return rateType;
  return null;
}

export function itemNetQty(item: any): number {
  const del = Number(item.delivered_quantity) || 0;
  const ret = Number(item.returned_quantity) || 0;
  return del - ret;
}

export function itemApprovedQty(item: any): number {
  return Number(item.approved_quantity) || 0;
}

export function itemDispatchedQty(item: any): number {
  const explicit = Number(
    item.dispatched_quantity ??
      item.dispatch_quantity ??
      item.billed_dispatched_quantity ??
      0,
  );
  if (explicit > 0) return explicit;
  return Number(item.approved_quantity ?? item.ordered_quantity ?? item.quantity ?? 0);
}

export function itemQty(item: any, basis: QtyBasis): number {
  return basis === "dispatched" ? itemDispatchedQty(item) : itemApprovedQty(item);
}

export function itemUnitPrice(item: any): number {
  const base = Number(item.unit_price ?? item.approved_unit_price ?? 0) || 0;
  const gstPct = Number(item.gst_percent ?? 0) || 0;
  return base * (1 + gstPct / 100);
}

/**
 * Quantity KPIs exclude kit shells by default (avoids double-counting in party/sales totals).
 * Pass `countKitShellQuantity: true` for product-level boards so kit products show kit qty.
 * Volume KPIs always exclude kit buckets (money lives on the shell).
 */
export function itemMetricValue(
  item: any,
  metric: Metric,
  basis: QtyBasis,
  allItems: any[] = [],
  options?: { countKitShellQuantity?: boolean },
): number {
  const peers = (allItems.length > 0 ? allItems : [item]) as Array<
    Record<string, unknown>
  >;
  if (metric === "quantity") {
    if (
      !options?.countKitShellQuantity &&
      isKitShellOrderLine(item as Record<string, unknown>, peers)
    ) {
      return 0;
    }
  } else if (isKitBucketLine(item)) {
    return 0;
  }
  const qty = itemQty(item, basis);
  return metric === "quantity" ? qty : qty * itemUnitPrice(item);
}

export function roundToTwo(num: number): number {
  return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

export function formatMetricValue(v: number, metric: Metric): string {
  if (metric === "volume") {
    return `₹${v.toLocaleString("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  }
  return v.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
