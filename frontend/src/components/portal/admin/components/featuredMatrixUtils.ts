export type MatrixMetric = "quantity" | "volume";

export type MatrixEntity = {
  id: string;
  name: string;
};

export function pickEntities(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as Record<string, unknown>[];
    if (Array.isArray(o.data)) return o.data as Record<string, unknown>[];
  }
  return [];
}

export function resolveEntityId(val: unknown): string {
  if (val == null || val === "") return "";
  if (typeof val === "string") return val.trim();
  if (typeof val === "object") {
    const o = val as { _id?: unknown; id?: unknown };
    return String(o._id ?? o.id ?? "").trim();
  }
  return "";
}

export function itemNetQty(item: any): number {
  const del = Number(item.delivered_quantity) || 0;
  const ret = Number(item.returned_quantity) || 0;
  return del - ret;
}

export function itemMetricValue(item: any, metric: MatrixMetric): number {
  const qty = itemNetQty(item);
  if (metric === "quantity") return qty;
  const unitPrice = Number(item.unit_price ?? item.approved_unit_price ?? 0) || 0;
  return qty * unitPrice;
}

export function formatMatrixValue(v: number, metric: MatrixMetric): string {
  if (!v) return "—";
  if (metric === "volume") {
    return `₹${v.toLocaleString("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  }
  return v.toLocaleString();
}

export function resolveProductId(item: any): string {
  return resolveEntityId(item?.product);
}

export function resolveProductName(item: any): string {
  return (
    item?.product?.product_name ??
    item?.product?.name ??
    item?.product_name ??
    "Unknown Product"
  );
}

export function resolveOrderPartyId(order: any): string {
  return resolveEntityId(order?.party) || resolveEntityId(order?.customer);
}

export function resolveOrderSalesUserId(order: any): string {
  return resolveEntityId(order?.assigned_sales_user);
}

/** productId -> columnId -> value */
export function emptyMatrix(
  rowIds: string[],
  colIds: string[],
): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();
  for (const rowId of rowIds) {
    const row = new Map<string, number>();
    for (const colId of colIds) row.set(colId, 0);
    map.set(rowId, row);
  }
  return map;
}

export function matrixRowTotal(
  matrix: Map<string, Map<string, number>>,
  rowId: string,
): number {
  const row = matrix.get(rowId);
  if (!row) return 0;
  let sum = 0;
  for (const v of row.values()) sum += v;
  return sum;
}

export function matrixColTotal(
  matrix: Map<string, Map<string, number>>,
  colId: string,
): number {
  let sum = 0;
  for (const row of matrix.values()) sum += row.get(colId) ?? 0;
  return sum;
}

export function matrixGrandTotal(matrix: Map<string, Map<string, number>>): number {
  let sum = 0;
  for (const row of matrix.values()) {
    for (const v of row.values()) sum += v;
  }
  return sum;
}

export type GroupProductRef = { id: string; name: string };

/**
 * Map catalog products onto featured groups by ObjectId, with a name fallback
 * for populated / legacy group references.
 */
export function buildFeaturedGroupProductMaps(
  productsRaw: unknown,
  featuredGroups: MatrixEntity[],
): {
  productToGroupMap: Map<string, string>;
  productsByGroup: Map<string, GroupProductRef[]>;
} {
  const productToGroupMap = new Map<string, string>();
  const productsByGroup = new Map<string, GroupProductRef[]>();

  const groupById = new Map(featuredGroups.map((g) => [g.id, g]));
  const groupByName = new Map(
    featuredGroups.map((g) => [g.name.trim().toLowerCase(), g]),
  );

  for (const g of featuredGroups) {
    productsByGroup.set(g.id, []);
  }

  for (const p of pickEntities(productsRaw)) {
    const productId = resolveEntityId(p._id ?? p.id);
    if (!productId) continue;

    const groupRef = p.product_group;
    let matched =
      groupById.get(resolveEntityId(groupRef)) ??
      (groupRef && typeof groupRef === "object"
        ? groupByName.get(
            String((groupRef as { name?: unknown }).name ?? "")
              .trim()
              .toLowerCase(),
          )
        : undefined) ??
      (typeof groupRef === "string" && groupRef.trim()
        ? groupByName.get(groupRef.trim().toLowerCase())
        : undefined);

    if (!matched) continue;

    productToGroupMap.set(productId, matched.id);
    const name = String(p.product_name ?? p.name ?? "Untitled Product");
    productsByGroup.get(matched.id)!.push({ id: productId, name });
  }

  for (const list of productsByGroup.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  return { productToGroupMap, productsByGroup };
}
