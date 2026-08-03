"use client";

export type Metric = "quantity" | "volume";
export type QtyBasis = "net" | "approved";
export type RateBucket = { total: number; sr: number; sra: number; cr: number };

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

export function itemQty(item: any, basis: QtyBasis): number {
  return basis === "approved" ? itemApprovedQty(item) : itemNetQty(item);
}

export function itemUnitPrice(item: any): number {
  return Number(item.unit_price ?? item.approved_unit_price ?? 0) || 0;
}

export function itemMetricValue(item: any, metric: Metric, basis: QtyBasis): number {
  const qty = itemQty(item, basis);
  return metric === "quantity" ? qty : qty * itemUnitPrice(item);
}

export function formatMetricValue(v: number, metric: Metric): string {
  if (metric === "volume") {
    return `₹${v.toLocaleString("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  }
  return v.toLocaleString();
}
