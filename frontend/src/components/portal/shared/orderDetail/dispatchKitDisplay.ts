import { isKitShellOrderLine } from "@/components/portal/shared/orderLineQuantities";

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

export type DispatchLineDisplay = {
  key: string;
  item: Record<string, unknown>;
  matchItem?: Record<string, unknown>;
  productName: string;
  sku: string;
  orderedQty: number | string;
  dispatchedQty: number | string;
  deliveredQty: number;
  returnedQty: number;
  /** Cleared/ordered minus cumulative dispatched on the order line. */
  remainingQty: number;
  productId: string;
  kitParentProduct: string;
  isKitBucket: boolean;
  isKitParent: boolean;
};

export type KitHeaderDisplay = {
  productId: string;
  productName: string;
  sku: string;
  orderedQty: number | string;
  /** Inferred kit units dispatched in this batch (from buckets). */
  dispatchedQty: number;
  deliveredQty: number;
  returnedQty: number;
  /** Remaining kit units still available to dispatch on the order. */
  remainingQty: number;
};

export type NestedDispatchGroup = {
  parent: DispatchLineDisplay | null;
  /** Synthetic kit header when only buckets were dispatched (shell not on batch). */
  kitHeader: KitHeaderDisplay | null;
  buckets: DispatchLineDisplay[];
  /** Flat individual / orphan lines without nesting. */
  line: DispatchLineDisplay | null;
};

function bucketClearedQty(bucket: DispatchLineDisplay): number {
  return Math.max(
    0,
    Number(
      bucket.matchItem?.approved_quantity ??
        bucket.matchItem?.ordered_quantity ??
        bucket.matchItem?.quantity ??
        bucket.orderedQty ??
        0,
    ) || 0,
  );
}

function kitClearedFromOrder(
  kitProductId: string,
  orderItems: Record<string, unknown>[],
): number {
  const kitLine = orderItems.find(
    (oi) =>
      idFromRef(oi.product) === kitProductId &&
      !idFromRef(oi.kit_parent_product),
  );
  return Math.max(
    0,
    Number(
      kitLine?.approved_quantity ??
        kitLine?.ordered_quantity ??
        kitLine?.quantity ??
        0,
    ) || 0,
  );
}

/**
 * Infer kit units for this batch from nested bucket lines
 * (same BOM reverse math as create-dispatch kit partial).
 */
export function inferKitUnitsFromDispatchBuckets(
  buckets: DispatchLineDisplay[],
  kitCleared: number,
  field: "dispatchedQty" | "deliveredQty" | "returnedQty",
): number {
  if (!(kitCleared > 0) || buckets.length === 0) return 0;
  let min = Number.POSITIVE_INFINITY;
  for (const bucket of buckets) {
    const cleared = bucketClearedQty(bucket);
    if (!(cleared > 0)) continue;
    const raw = Number(bucket[field] || 0);
    if (!Number.isFinite(raw)) continue;
    const units = Math.round((raw * kitCleared) / cleared);
    if (Number.isFinite(units)) min = Math.min(min, units);
  }
  return Number.isFinite(min) ? Math.max(0, min) : 0;
}

/**
 * Remaining kit units still available to dispatch on the order
 * (from cumulative order-line dispatched qty on buckets).
 */
export function inferRemainingKitUnitsFromBuckets(
  buckets: DispatchLineDisplay[],
  kitCleared: number,
): number {
  if (!(kitCleared > 0) || buckets.length === 0) return 0;
  let min = Number.POSITIVE_INFINITY;
  for (const bucket of buckets) {
    const cleared = bucketClearedQty(bucket);
    if (!(cleared > 0)) continue;
    const cumulativeDispatched = Number(
      bucket.matchItem?.dispatched_quantity ?? 0,
    );
    const remainingBucket = Math.max(0, cleared - cumulativeDispatched);
    const units = Math.floor((remainingBucket * kitCleared) / cleared);
    if (Number.isFinite(units)) min = Math.min(min, units);
  }
  return Number.isFinite(min) ? Math.max(0, min) : 0;
}

function lineRemainingQty(line: {
  matchItem?: Record<string, unknown>;
  orderedQty: number | string;
}): number {
  const cleared = Math.max(
    0,
    Number(
      line.matchItem?.approved_quantity ??
        line.matchItem?.ordered_quantity ??
        line.matchItem?.quantity ??
        line.orderedQty ??
        0,
    ) || 0,
  );
  const cumulative = Number(line.matchItem?.dispatched_quantity ?? 0);
  return Math.max(0, cleared - cumulative);
}

function withInferredKitQtys(
  line: DispatchLineDisplay,
  buckets: DispatchLineDisplay[],
  orderItems: Record<string, unknown>[],
): DispatchLineDisplay {
  if (buckets.length === 0) return line;
  const kitCleared =
    kitClearedFromOrder(line.productId, orderItems) ||
    Number(line.orderedQty) ||
    0;
  if (!(kitCleared > 0)) return { ...line, isKitParent: true };

  return {
    ...line,
    isKitParent: true,
    orderedQty: kitCleared,
    dispatchedQty: inferKitUnitsFromDispatchBuckets(
      buckets,
      kitCleared,
      "dispatchedQty",
    ),
    deliveredQty: inferKitUnitsFromDispatchBuckets(
      buckets,
      kitCleared,
      "deliveredQty",
    ),
    returnedQty: inferKitUnitsFromDispatchBuckets(
      buckets,
      kitCleared,
      "returnedQty",
    ),
    remainingQty: inferRemainingKitUnitsFromBuckets(buckets, kitCleared),
  };
}

function buildKitHeader(
  kitProductId: string,
  buckets: DispatchLineDisplay[],
  orderItems: Record<string, unknown>[],
): KitHeaderDisplay {
  const kitLine = orderItems.find(
    (oi) =>
      idFromRef(oi.product) === kitProductId &&
      !idFromRef(oi.kit_parent_product),
  );
  const orderedQty = kitLine
    ? Number(
        kitLine.approved_quantity ??
          kitLine.ordered_quantity ??
          kitLine.quantity ??
          0,
      )
    : 0;
  const kitCleared = orderedQty > 0 ? orderedQty : 0;

  return {
    productId: kitProductId,
    productName: String(
      kitLine?.product_name ?? buckets[0]?.productName ?? "Kit",
    ),
    sku: String(kitLine?.sku ?? ""),
    orderedQty: kitCleared || "—",
    dispatchedQty: inferKitUnitsFromDispatchBuckets(
      buckets,
      kitCleared,
      "dispatchedQty",
    ),
    deliveredQty: inferKitUnitsFromDispatchBuckets(
      buckets,
      kitCleared,
      "deliveredQty",
    ),
    returnedQty: inferKitUnitsFromDispatchBuckets(
      buckets,
      kitCleared,
      "returnedQty",
    ),
    remainingQty: inferRemainingKitUnitsFromBuckets(buckets, kitCleared),
  };
}

function matchOrderLineForDisplay(
  item: Record<string, unknown>,
  orderItems: Record<string, unknown>[],
): Record<string, unknown> | undefined {
  const orderItemId = idFromRef(item.order_item_id);
  if (orderItemId) {
    const byId = orderItems.find(
      (oi) => idFromRef(oi._id ?? oi.id) === orderItemId,
    );
    if (byId) return byId;
  }

  const productId = idFromRef(item.product);
  if (!productId) return undefined;

  const kitParent = idFromRef(item.kit_parent_product);
  const matches = orderItems.filter(
    (oi) => idFromRef(oi.product) === productId,
  );
  if (matches.length === 0) return undefined;

  if (kitParent) {
    return (
      matches.find((oi) => idFromRef(oi.kit_parent_product) === kitParent) ||
      matches[0]
    );
  }

  // Prefer kit-bucket order lines — delivery/dispatch payloads often only carry
  // product id, and the same SKU may also exist as a commercial individual.
  const buckets = matches.filter((oi) => idFromRef(oi.kit_parent_product));
  if (buckets.length === 1) return buckets[0];
  if (buckets.length > 1) return buckets[0];
  return matches.find((oi) => !idFromRef(oi.kit_parent_product)) || matches[0];
}

function enrichDispatchLine(
  item: Record<string, unknown>,
  idx: number,
  orderItems: Record<string, unknown>[],
): DispatchLineDisplay {
  const matchItem = matchOrderLineForDisplay(item, orderItems);
  const orderItemId =
    idFromRef(item.order_item_id) ||
    idFromRef(matchItem?._id ?? matchItem?.id);
  const productId =
    idFromRef(item.product) || idFromRef(matchItem?.product);
  // Prefer explicit kit_parent on the row, then resolved order line.
  const kitParentProduct =
    idFromRef(item.kit_parent_product) ||
    idFromRef(matchItem?.kit_parent_product);
  const isKitBucket = Boolean(kitParentProduct);
  const isKitParent =
    !isKitBucket &&
    (isKitShellOrderLine(matchItem, orderItems) ||
      String(matchItem?.product_type || item.product_type || "")
        .toLowerCase() === "kit");

  const orderedQty = matchItem
    ? Number(matchItem.ordered_quantity ?? matchItem.quantity ?? 0)
    : (item.ordered_quantity as number | string | undefined) ?? "—";

  return {
    key: orderItemId || `disp-line-${idx}`,
    item: {
      ...item,
      order_item_id: orderItemId || item.order_item_id,
      kit_parent_product: kitParentProduct || item.kit_parent_product,
    },
    matchItem,
    productName: String(
      matchItem?.product_name ||
        item.product_name ||
        (typeof item.product === "object" && item.product
          ? (item.product as Record<string, unknown>).product_name
          : "") ||
        "—",
    ),
    sku: String(matchItem?.sku ?? item.sku ?? ""),
    orderedQty,
    dispatchedQty:
      (item.dispatched_quantity as number | string | undefined) ??
      (item.dispatch_quantity as number | string | undefined) ??
      "—",
    deliveredQty: Number(item.delivered_quantity ?? 0),
    returnedQty: Number(item.returned_quantity ?? 0),
    remainingQty: lineRemainingQty({ matchItem, orderedQty }),
    productId,
    kitParentProduct,
    isKitBucket,
    isKitParent,
  };
}

/**
 * Nest kit bucket dispatch lines under their kit parent (or a synthetic kit header).
 * Kit shells are commercial-only and usually have 0 dispatch qty.
 */
export function nestDispatchLinesForDisplay(
  dispatchItems: Record<string, unknown>[],
  orderItems: Record<string, unknown>[] = [],
): NestedDispatchGroup[] {
  const lines = dispatchItems.map((item, idx) =>
    enrichDispatchLine(item, idx, orderItems),
  );

  const parents = lines.filter((l) => !l.isKitBucket);
  const buckets = lines.filter((l) => l.isKitBucket);

  const bucketsByParent = new Map<string, DispatchLineDisplay[]>();
  for (const b of buckets) {
    const list = bucketsByParent.get(b.kitParentProduct) ?? [];
    list.push(b);
    bucketsByParent.set(b.kitParentProduct, list);
  }

  const groups: NestedDispatchGroup[] = [];

  for (const parent of parents) {
    const nested = parent.productId
      ? (bucketsByParent.get(parent.productId) ?? [])
      : [];
    const isKit = parent.isKitParent || nested.length > 0;
    if (isKit) {
      groups.push({
        parent: withInferredKitQtys(parent, nested, orderItems),
        kitHeader: null,
        buckets: nested,
        line: null,
      });
    } else {
      // Flat individual / non-kit line — keep on `line` so consumers don't
      // mistake it for a kit header group.
      groups.push({
        parent: null,
        kitHeader: null,
        buckets: [],
        line: parent,
      });
    }
  }

  for (const [kitProductId, nested] of bucketsByParent) {
    if (!kitProductId || nested.length === 0) continue;

    // Already nested under a kit parent / header with buckets attached.
    const alreadyNested = groups.some(
      (g) =>
        (g.parent?.productId === kitProductId ||
          g.kitHeader?.productId === kitProductId) &&
        g.buckets.length > 0,
    );
    if (alreadyNested) continue;

    // Kit shell parent exists but buckets were missed (id mismatch) — attach them.
    const emptyKitIdx = groups.findIndex(
      (g) => g.parent?.productId === kitProductId && g.buckets.length === 0,
    );
    if (emptyKitIdx >= 0) {
      const existing = groups[emptyKitIdx];
      groups[emptyKitIdx] = {
        ...existing,
        parent: existing.parent
          ? withInferredKitQtys(existing.parent, nested, orderItems)
          : null,
        buckets: nested,
      };
      continue;
    }

    groups.push({
      parent: null,
      kitHeader: buildKitHeader(kitProductId, nested, orderItems),
      buckets: nested,
      line: null,
    });
  }

  // Orphan buckets whose parent id was already consumed as nested under a parent
  // are already attached; any leftover without a parent product id stay flat.
  for (const b of buckets) {
    if (!b.kitParentProduct) {
      groups.push({ parent: null, kitHeader: null, buckets: [], line: b });
    }
  }

  return groups;
}

/** Whether an approval / order line is a kit shell (not dispatchable). */
export function isKitShellDispatchSource(
  item: Record<string, unknown>,
  peerItems: Record<string, unknown>[],
  orderItems: Record<string, unknown>[] = [],
): boolean {
  if (idFromRef(item.kit_parent_product)) return false;
  if (String(item.product_type || "").toLowerCase() === "kit") return true;
  const productId = idFromRef(item.product);
  if (
    productId &&
    peerItems.some((other) => idFromRef(other.kit_parent_product) === productId)
  ) {
    return true;
  }
  const orderItemId = idFromRef(item.order_item_id ?? item._id ?? item.id);
  const orderLine = orderItems.find(
    (line) => idFromRef(line._id ?? line.id) === orderItemId,
  );
  if (orderLine && isKitShellOrderLine(orderLine, orderItems)) return true;
  if (productId) {
    const byProduct = orderItems.find(
      (line) =>
        idFromRef(line.product) === productId &&
        !idFromRef(line.kit_parent_product),
    );
    if (byProduct && isKitShellOrderLine(byProduct, orderItems)) return true;
  }
  return false;
}
