import type { ProductKitItemRecord } from "@/store/api/slices/productKitItemsApi";

export function idFromRef(ref: unknown): string {
  if (typeof ref === "string") return ref.trim();
  if (ref && typeof ref === "object" && "_id" in ref) {
    return String((ref as { _id: unknown })._id ?? "").trim();
  }
  if (ref && typeof ref === "object" && "id" in ref) {
    return String((ref as { id: unknown }).id ?? "").trim();
  }
  return "";
}

export function hasKitParent(ref: unknown): boolean {
  return Boolean(idFromRef(ref));
}

/** Kit component qty from kit line qty using percentage scale (÷ 100). */
export function kitBucketItemQty(kitQty: number, percentage: number): number {
  const k = Number(kitQty);
  const pct = Number(percentage);
  if (!Number.isFinite(k) || k <= 0 || !Number.isFinite(pct) || pct <= 0) {
    return 0;
  }
  return Math.round((k * pct) / 100);
}

export function kitComponentLabel(ref: unknown): { name: string; sku: string } {
  if (!ref) return { name: "—", sku: "" };
  if (typeof ref === "string") return { name: ref, sku: "" };
  if (typeof ref === "object") {
    const o = ref as {
      product_name?: string;
      _id?: string;
      sku?: string;
    };
    return {
      name: String(o.product_name || o._id || "—"),
      sku: String(o.sku || ""),
    };
  }
  return { name: "—", sku: "" };
}

export function pickKitList(raw: unknown): ProductKitItemRecord[] {
  if (Array.isArray(raw)) return raw as ProductKitItemRecord[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as ProductKitItemRecord[];
    if (Array.isArray(o.data)) return o.data as ProductKitItemRecord[];
  }
  return [];
}

/** Map kit product id → composition record. */
export function buildKitCompositionMap(
  raw: unknown,
): Map<string, ProductKitItemRecord> {
  const map = new Map<string, ProductKitItemRecord>();
  for (const row of pickKitList(raw)) {
    const kitId = idFromRef(row.kit);
    if (kitId) map.set(kitId, row);
  }
  return map;
}

export function isKitProductId(
  productId: string,
  compositionByKitId: Map<string, ProductKitItemRecord>,
  productTypeById?: Map<string, string>,
): boolean {
  if (!productId) return false;
  if (compositionByKitId.has(productId)) return true;
  const t = productTypeById?.get(productId);
  return String(t || "").toLowerCase() === "kit";
}

export type ExpandableKitLine = {
  product: string;
  product_name?: string;
  ordered_quantity: number;
  approved_quantity?: number;
  free_quantity?: number;
};

export type ExpandedKitBucket = {
  product: string;
  product_name: string;
  sku: string;
  ordered_quantity: number;
  approved_quantity: number;
  free_quantity: number;
  kit_parent_product: string;
  remarks: string;
  unit_price: number;
  gst_percent: number;
  discount_percent: number;
  discount_amount: number;
  applied_rate_type: string;
  manual_price_override: boolean;
  taxable_amount: number;
  gst_amount: number;
  total_amount: number;
  order_item_id?: string;
};

/**
 * Expand commercial kit lines into zero-priced individual bucket rows
 * for order_items / approval_items payloads.
 */
export function expandKitBucketLines(
  lines: ExpandableKitLine[],
  compositionByKitId: Map<string, ProductKitItemRecord>,
  options: {
    orderItems?: Record<string, unknown>[];
    productTypeById?: Map<string, string>;
  } = {},
): ExpandedKitBucket[] {
  const orderItems = options.orderItems ?? [];
  const expanded: ExpandedKitBucket[] = [];

  for (const line of lines) {
    const productId = idFromRef(line.product);
    if (!productId) continue;
    if (!isKitProductId(productId, compositionByKitId, options.productTypeById)) {
      continue;
    }

    const kitQty = Number(
      line.approved_quantity ?? line.ordered_quantity ?? 0,
    );
    if (!(kitQty > 0)) continue;

    const composition = compositionByKitId.get(productId);
    const comps = (composition?.items ?? []).filter((c) => c.is_active !== false);
    for (const comp of comps) {
      const individualId = idFromRef(comp.individual);
      if (!individualId) continue;
      const pct = Number(comp.percentage) || 0;
      const qty = kitBucketItemQty(kitQty, pct);
      if (qty < 1) continue;
      const freeQty = kitBucketItemQty(Number(line.free_quantity || 0), pct);
      const label = kitComponentLabel(comp.individual);
      const existing = orderItems.find((oi) => {
        return (
          idFromRef(oi.product) === individualId &&
          idFromRef(oi.kit_parent_product) === productId
        );
      });

      expanded.push({
        product: individualId,
        product_name: label.name,
        sku: label.sku,
        ordered_quantity: qty,
        approved_quantity: qty,
        free_quantity: freeQty,
        kit_parent_product: productId,
        remarks: `Kit bucket of ${line.product_name || "kit"}`,
        unit_price: 0,
        gst_percent: 0,
        discount_percent: 0,
        discount_amount: 0,
        applied_rate_type: "MANUAL",
        manual_price_override: true,
        taxable_amount: 0,
        gst_amount: 0,
        total_amount: 0,
        order_item_id: existing
          ? String(existing._id ?? existing.id ?? "")
          : undefined,
      });
    }
  }

  return expanded;
}

/** Preview BOM rows under a kit line in create/edit UI. */
export function previewKitBuckets(
  kitProductId: string,
  kitQty: number,
  freeQty: number,
  compositionByKitId: Map<string, ProductKitItemRecord>,
): Array<{
  productId: string;
  name: string;
  sku: string;
  percentage: number;
  quantity: number;
  free_quantity: number;
}> {
  const composition = compositionByKitId.get(kitProductId);
  if (!composition) return [];
  const out: Array<{
    productId: string;
    name: string;
    sku: string;
    percentage: number;
    quantity: number;
    free_quantity: number;
  }> = [];
  for (const comp of composition.items ?? []) {
    if (comp.is_active === false) continue;
    const individualId = idFromRef(comp.individual);
    if (!individualId) continue;
    const pct = Number(comp.percentage) || 0;
    const label = kitComponentLabel(comp.individual);
    out.push({
      productId: individualId,
      name: label.name,
      sku: label.sku,
      percentage: pct,
      quantity: kitBucketItemQty(kitQty, pct),
      free_quantity: kitBucketItemQty(freeQty, pct),
    });
  }
  return out;
}

/** Keep existing kit bucket rows when rewriting commercial order_items. */
export function preserveKitBucketItems(
  detailItems: Record<string, unknown>[] | undefined,
  commercialItems: Record<string, unknown>[],
): Record<string, unknown>[] {
  if (!Array.isArray(detailItems)) return commercialItems;
  const buckets = detailItems
    .filter((item) => hasKitParent(item.kit_parent_product))
    .map((item) => {
      const o: Record<string, unknown> = {
        product: idFromRef(item.product),
        product_name: String(item.product_name ?? ""),
        sku: String(item.sku ?? ""),
        brand: String(item.brand ?? ""),
        manufacturer: String(item.manufacturer ?? ""),
        product_group: String(item.product_group ?? ""),
        product_subgroup: String(item.product_subgroup ?? ""),
        unit: String(item.unit ?? ""),
        quantity: Number(item.ordered_quantity ?? item.quantity ?? 0),
        ordered_quantity: Number(item.ordered_quantity ?? item.quantity ?? 0),
        approved_quantity: Number(item.approved_quantity ?? 0),
        unit_price: Number(item.unit_price ?? 0),
        discount_amount: Number(item.discount_amount ?? 0),
        gst_percent: Number(item.gst_percent ?? 0),
        applied_rate_type: item.applied_rate_type || "MANUAL",
        kit_parent_product: idFromRef(item.kit_parent_product),
        remarks: String(item.remarks ?? ""),
        manual_price_override: true,
      };
      const id = idFromRef(item._id);
      if (id) o._id = id;
      return o;
    });
  return [...commercialItems, ...buckets];
}
