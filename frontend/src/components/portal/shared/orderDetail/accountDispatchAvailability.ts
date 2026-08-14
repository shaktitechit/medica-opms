import {
  aggregateDispatchReturnsByOrderLine,
  refId,
} from "@/components/portal/shared/returnSettlement";
import { isKitShellDispatchSource } from "./dispatchKitDisplay";

export function idFromRef(ref: unknown): string {
  return refId(ref);
}

export function isFullyClearedApproval(app: Record<string, unknown>): boolean {
  return (
    Boolean(app.is_admin_approved) &&
    Boolean(app.is_finance_approved) &&
    Boolean(app.is_account_approved)
  );
}

export function filterAccountApprovalsForUser(
  approvals: Record<string, unknown>[],
  _currentUserId?: string,
): Record<string, unknown>[] {
  return approvals.filter(isFullyClearedApproval);
}

export type AccountDispatchOptions = {
  /** When false, available qty is remaining approval clearance only (no warehouse returns). */
  includeWarehouseReturns?: boolean;
};

export function getReleaseDispatches(
  dispatches: Record<string, unknown>[],
  approvalId: string,
): Record<string, unknown>[] {
  return dispatches.filter((disp) => {
    const statusValue = String(disp.dispatch_status ?? disp.status ?? "draft");
    if (statusValue === "cancelled") return false;

    const dispApproval = disp.finance_approval;
    const dispApprovalId =
      typeof dispApproval === "object" && dispApproval !== null
        ? idFromRef(
            (dispApproval as Record<string, unknown>)._id ??
              (dispApproval as Record<string, unknown>).id,
          )
        : idFromRef(dispApproval);

    return dispApprovalId === approvalId;
  });
}

/** True when at least one finance release has recorded dispatch batches. */
export function hasAccountDispatchReleases(
  approvals: Record<string, unknown>[],
  dispatches: Record<string, unknown>[],
): boolean {
  return approvals.some((approval) => {
    const approvalId = idFromRef(approval._id ?? approval.id);
    return getReleaseDispatches(dispatches, approvalId).length > 0;
  });
}

export function computeReleaseDispatchedByLine(
  dispatches: Record<string, unknown>[],
  approvalId: string,
  orderItems: Record<string, unknown>[] = [],
  approval: Record<string, unknown> | null = null,
): Record<string, number> {
  const map: Record<string, number> = {};
  getReleaseDispatches(dispatches, approvalId).forEach((disp) => {
    const rawItems = Array.isArray(disp.dispatch_items)
      ? disp.dispatch_items
      : (disp.items as Record<string, unknown>[]) || [];
    rawItems.forEach((item) => {
      const storedId = idFromRef(item.order_item_id);
      let lineId = storedId;
      if (orderItems.length > 0) {
        const byId = orderItems.find((line) => idFromRef(line._id ?? line.id) === storedId);
        if (byId) {
          lineId = idFromRef(byId._id ?? byId.id);
        } else {
          const productId = idFromRef(item.product);
          const kitParent = idFromRef(item.kit_parent_product);
          if (productId) {
            const byProduct = orderItems.find((line) => {
              if (idFromRef(line.product) !== productId) return false;
              const lineKit = idFromRef(line.kit_parent_product);
              if (kitParent) return lineKit === kitParent;
              return !lineKit;
            });
            if (byProduct) lineId = idFromRef(byProduct._id ?? byProduct.id);
          } else if (approval && storedId) {
            const items = Array.isArray(approval.approval_items)
              ? (approval.approval_items as Record<string, unknown>[])
              : [];
            const approvalItem = items.find((row) => idFromRef(row.order_item_id) === storedId);
            if (approvalItem) {
              const resolved = resolveOrderItemIdForLine(approvalItem, orderItems);
              if (resolved) lineId = resolved;
            }
          }
        }
      }
      const qty = Number(item.dispatched_quantity ?? item.dispatch_quantity ?? 0);
      map[lineId] = (map[lineId] || 0) + qty;
    });
  });
  return map;
}

/** Returned quantities from dispatch batch line items on this release. */
export function aggregateReleaseDispatchReturnsByOrderLine(
  dispatches: Record<string, unknown>[],
  approvalId: string,
): Record<string, number> {
  if (!approvalId) return {};
  const releaseDispatches = getReleaseDispatches(dispatches, approvalId);
  return aggregateDispatchReturnsByOrderLine(releaseDispatches);
}

/** @deprecated Use aggregateReleaseDispatchReturnsByOrderLine — returns now come from dispatch batches. */
export function aggregateReleaseReturnsByOrderLine(
  returns: Record<string, unknown>[],
  dispatches: Record<string, unknown>[],
  approvalId: string,
): Record<string, number> {
  void returns;
  return aggregateReleaseDispatchReturnsByOrderLine(dispatches, approvalId);
}

function lineAtWarehouseQty(
  orderItemId: string,
  approvalItem: Record<string, unknown>,
  orderLine: Record<string, unknown> | undefined,
  returnsByLine: Record<string, number>,
): number {
  const fromReturns = Number(returnsByLine[orderItemId] || 0);
  if (fromReturns > 0) return fromReturns;
  return lineReturnItemQty(approvalItem, orderLine);
}

export type ReleaseDispatchSummary = {
  hasDispatches: boolean;
  remainingTotal: number;
  returnTotal: number;
  dispatchableTotal: number;
  canContinueDispatch: boolean;
  canResolveRelease: boolean;
  isReleaseResolved: boolean;
};

export function isDispatchReleaseResolved(
  approval?: Record<string, unknown> | null,
): boolean {
  return Boolean(approval?.dispatch_release_resolved);
}

/** True when any dispatch batch on this release has returned_quantity > 0. */
export function releaseHasDispatchReturns(
  dispatches: Record<string, unknown>[],
  approvalId: string,
): boolean {
  const byLine = aggregateReleaseDispatchReturnsByOrderLine(dispatches, approvalId);
  return Object.values(byLine).some((qty) => qty > 0);
}

/**
 * A release marked resolved in DB is unresolved again when dispatch returns
 * create settlement work (removedQty > 0 on preview rows).
 */
export function isReleaseEffectivelyResolved(
  approval: Record<string, unknown>,
  rows: AccountResolvePreviewRow[],
): boolean {
  if (!isDispatchReleaseResolved(approval)) return false;
  // Kit headers are display-only; real settle work is on item / bucket lines.
  return !rows.some(
    (row) =>
      !row.isKitParent &&
      !row.orderItemId.startsWith("__kit__") &&
      row.removedQty > 0,
  );
}

export function lineReturnItemQty(
  approvalItem?: Record<string, unknown> | null,
  orderLine?: Record<string, unknown> | null,
): number {
  if (approvalItem) {
    const fromApproval = Number(approvalItem.return_item_qty);
    if (Number.isFinite(fromApproval) && fromApproval > 0) return fromApproval;
  }
  const fromLine = Number(orderLine?.return_item_qty ?? orderLine?.returned_quantity ?? 0);
  return Number.isFinite(fromLine) ? Math.max(0, fromLine) : 0;
}

export function computeLineDispatchAvailability(
  clearedQty: number,
  alreadyDispatched: number,
  atWarehouseQty: number,
) {
  const remaining = Math.max(0, clearedQty - alreadyDispatched);
  const dispatchable = remaining + Math.max(0, atWarehouseQty);
  return { remaining, atWarehouseQty: Math.max(0, atWarehouseQty), dispatchable };
}

export type AccountDispatchPreviewRow = {
  orderItemId: string;
  productId?: string;
  productName: string;
  sku?: string;
  clearedQty: number;
  alreadyDispatched: number;
  remaining: number;
  atWarehouseQty: number;
  dispatchable: number;
  kitParentProduct?: string;
  isKitBucket?: boolean;
  isKitParent?: boolean;
  /**
   * Kit shell cleared qty used for percentage math when cascading
   * kit-level dispatch qty → bucket lines.
   */
  kitBaseCleared?: number;
};

/** Kit component qty from kit line qty using percentage scale (÷ 100). */
export function kitBucketItemQty(kitQty: number, percentage: number): number {
  const k = Number(kitQty);
  const pct = Number(percentage);
  if (!Number.isFinite(k) || k <= 0 || !Number.isFinite(pct) || pct <= 0) {
    return 0;
  }
  return Math.round((k * pct) / 100);
}

/** Reverse BOM % from cleared kit qty vs cleared bucket qty. */
export function deriveKitBucketPercentage(
  bucketCleared: number,
  kitCleared: number,
): number {
  if (!(kitCleared > 0) || !(bucketCleared > 0)) return 0;
  return (bucketCleared * 100) / kitCleared;
}

/**
 * Infer how many kit units a set of bucket rows still represent for a given field.
 * Uses floor so we never over-dispatch relative to the tightest bucket.
 */
export function inferKitUnitsFromBuckets(
  buckets: AccountDispatchPreviewRow[],
  kitCleared: number,
  field: "dispatchable" | "remaining" | "alreadyDispatched",
): number {
  if (!(kitCleared > 0) || buckets.length === 0) return 0;
  let min = Number.POSITIVE_INFINITY;
  for (const bucket of buckets) {
    if (!(bucket.clearedQty > 0)) continue;
    const raw = Number(bucket[field] || 0);
    const units = Math.floor((raw * kitCleared) / bucket.clearedQty);
    if (Number.isFinite(units)) min = Math.min(min, units);
  }
  return Number.isFinite(min) ? Math.max(0, min) : 0;
}

/** Map a kit dispatch qty onto each bucket line (capped by bucket.dispatchable). */
export function applyKitDispatchQtyToBuckets(
  kitQty: number,
  kitCleared: number,
  buckets: AccountDispatchPreviewRow[],
): Record<string, number> {
  const out: Record<string, number> = {};
  const k = Math.max(0, Number(kitQty) || 0);
  for (const bucket of buckets) {
    const pct = deriveKitBucketPercentage(bucket.clearedQty, kitCleared);
    out[bucket.orderItemId] = Math.min(
      bucket.dispatchable,
      kitBucketItemQty(k, pct),
    );
  }
  return out;
}

/** Infer kit qty currently entered from bucket qty values. */
export function inferKitQtyFromBucketQuantities(
  kitCleared: number,
  buckets: AccountDispatchPreviewRow[],
  quantities: Record<string, number>,
): number {
  if (!(kitCleared > 0) || buckets.length === 0) return 0;
  let min = Number.POSITIVE_INFINITY;
  for (const bucket of buckets) {
    if (!(bucket.clearedQty > 0)) continue;
    const qty = Number(quantities[bucket.orderItemId] || 0);
    const units = Math.round((qty * kitCleared) / bucket.clearedQty);
    if (Number.isFinite(units)) min = Math.min(min, units);
  }
  return Number.isFinite(min) ? Math.max(0, min) : 0;
}

export function resolveOrderItemIdForLine(
  approvalItem: Record<string, unknown>,
  orderItems: Record<string, unknown>[],
): string {
  const rawId = idFromRef(approvalItem.order_item_id);
  if (rawId) {
    const byId = orderItems.find(
      (line) => idFromRef(line._id ?? line.id) === rawId,
    );
    if (byId) return idFromRef(byId._id ?? byId.id);
  }

  const productId = idFromRef(approvalItem.product).toLowerCase();
  const kitParent = idFromRef(approvalItem.kit_parent_product).toLowerCase();
  if (productId) {
    const matches = orderItems.filter((line) => {
      if (idFromRef(line.product).toLowerCase() !== productId) return false;
      const lineKitParent = idFromRef(line.kit_parent_product).toLowerCase();
      if (kitParent) return lineKitParent === kitParent;
      return !lineKitParent;
    });
    if (matches.length === 1) {
      return idFromRef(matches[0]._id ?? matches[0].id);
    }
    // Prefer a line that still has clearance headroom when duplicates exist.
    const preferred = matches.find((line) => {
      const approved = Number(line.approved_quantity || 0);
      const dispatched = Number(line.dispatched_quantity || 0);
      return approved <= 0 || dispatched < approved;
    });
    if (preferred) return idFromRef(preferred._id ?? preferred.id);
    if (matches[0]) return idFromRef(matches[0]._id ?? matches[0].id);
  }

  // Keep the approval's order_item_id even when the order detail is stale /
  // missing the line — otherwise Create Dispatch stays disabled after clearance.
  return rawId;
}

export function buildAccountDispatchPreviewRows(
  approval: Record<string, unknown> | null,
  orderItems: Record<string, unknown>[],
  dispatchedByLine: Record<string, number>,
  returnsByLine: Record<string, number> = {},
  options: AccountDispatchOptions & { skipClearanceCheck?: boolean } = {},
): AccountDispatchPreviewRow[] {
  if (!approval) return [];
  if (!options.skipClearanceCheck && !isFullyClearedApproval(approval)) return [];

  const includeWarehouseReturns = options.includeWarehouseReturns === true;
  const items = Array.isArray(approval.approval_items)
    ? (approval.approval_items as Record<string, unknown>[])
    : [];

  const rows: AccountDispatchPreviewRow[] = [];

  for (const item of items) {
    // Kit shells are commercial-only — dispatch qty lives on kit bucket individuals.
    if (isKitShellDispatchSource(item, items, orderItems)) continue;

    const clearedQty = Number(item.approved_quantity || 0);
    if (clearedQty <= 0) continue;

    const orderItemId = resolveOrderItemIdForLine(item, orderItems);
    if (!orderItemId) continue;
    const orderLine = orderItems.find(
      (line) => idFromRef(line._id ?? line.id) === orderItemId,
    );
    const productRef = item.product;
    const productId =
      idFromRef(orderLine?.product) || idFromRef(productRef) || undefined;
    const kitParentProduct =
      idFromRef(orderLine?.kit_parent_product) ||
      idFromRef(item.kit_parent_product) ||
      undefined;
    const productName =
      String(orderLine?.product_name ?? "") ||
      (typeof productRef === "object" && productRef
        ? String((productRef as Record<string, unknown>).product_name ?? "—")
        : String(item.product_name ?? "—"));

    const alreadyDispatched = dispatchedByLine[orderItemId] || 0;
    const atWarehouseQty = includeWarehouseReturns
      ? lineAtWarehouseQty(orderItemId, item, orderLine, returnsByLine)
      : 0;
    const { remaining, dispatchable } = computeLineDispatchAvailability(
      clearedQty,
      alreadyDispatched,
      atWarehouseQty,
    );

    if (dispatchable <= 0) continue;

    rows.push({
      orderItemId,
      productId,
      productName: productName || "—",
      sku: orderLine?.sku
        ? String(orderLine.sku)
        : item.sku
          ? String(item.sku)
          : undefined,
      clearedQty,
      alreadyDispatched,
      remaining,
      atWarehouseQty,
      dispatchable,
      kitParentProduct,
      isKitBucket: Boolean(kitParentProduct),
      isKitParent: false,
    });
  }

  // Mark commercial parents that have dispatchable kit buckets under them.
  const bucketParents = new Set(
    rows
      .filter((row) => row.kitParentProduct)
      .map((row) => row.kitParentProduct as string),
  );
  for (const row of rows) {
    if (!row.isKitBucket && row.productId && bucketParents.has(row.productId)) {
      row.isKitParent = true;
    }
  }

  return nestPreviewRows(rows, orderItems);
}

/** Kit header row with partial-dispatch capacity derived from nested buckets. */
function buildKitHeaderRow(
  kitProductId: string,
  nested: AccountDispatchPreviewRow[],
  orderItems: Record<string, unknown>[] = [],
  fallbackName = "Kit",
  fallbackSku?: string,
): AccountDispatchPreviewRow {
  const kitLine = orderItems.find(
    (line) =>
      idFromRef(line.product) === kitProductId &&
      !idFromRef(line.kit_parent_product),
  );
  const kitCleared = Math.max(
    0,
    Number(
      kitLine?.approved_quantity ??
        kitLine?.ordered_quantity ??
        kitLine?.quantity ??
        0,
    ) || 0,
  );
  const alreadyDispatched = inferKitUnitsFromBuckets(
    nested,
    kitCleared,
    "alreadyDispatched",
  );
  const remaining = inferKitUnitsFromBuckets(nested, kitCleared, "remaining");
  const dispatchable = inferKitUnitsFromBuckets(
    nested,
    kitCleared,
    "dispatchable",
  );

  return {
    orderItemId: `__kit__${kitProductId}`,
    productId: kitProductId,
    productName: String(kitLine?.product_name ?? fallbackName),
    sku: kitLine?.sku ? String(kitLine.sku) : fallbackSku,
    clearedQty: kitCleared,
    alreadyDispatched,
    remaining,
    atWarehouseQty: 0,
    dispatchable,
    isKitParent: true,
    isKitBucket: false,
    kitBaseCleared: kitCleared,
  };
}

/** Nest kit buckets under kit parents / synthetic kit headers for dispatch UI. */
export function nestPreviewRows(
  rows: AccountDispatchPreviewRow[],
  orderItems: Record<string, unknown>[] = [],
): AccountDispatchPreviewRow[] {
  const parents = rows.filter((r) => !r.isKitBucket);
  const buckets = rows.filter((r) => r.isKitBucket);
  const byParent = new Map<string, AccountDispatchPreviewRow[]>();
  for (const b of buckets) {
    const key = b.kitParentProduct || "";
    if (!key) continue;
    const list = byParent.get(key) ?? [];
    list.push(b);
    byParent.set(key, list);
  }

  const out: AccountDispatchPreviewRow[] = [];
  const seenParents = new Set<string>();

  for (const parent of parents) {
    const nested = parent.productId
      ? (byParent.get(parent.productId) ?? [])
      : [];
    // Kit shells become editable kit headers; bucket qty follows kit qty.
    if (nested.length > 0 || parent.isKitParent) {
      if (parent.productId) {
        out.push(
          buildKitHeaderRow(
            parent.productId,
            nested,
            orderItems,
            parent.productName,
            parent.sku,
          ),
        );
        seenParents.add(parent.productId);
      }
      out.push(...nested);
      continue;
    }
    out.push(parent);
  }

  for (const [kitProductId, nested] of byParent) {
    if (seenParents.has(kitProductId)) continue;
    out.push(buildKitHeaderRow(kitProductId, nested, orderItems));
    out.push(...nested);
  }

  for (const b of buckets) {
    if (!b.kitParentProduct) out.push(b);
  }

  return out;
}

/** Buckets nested under a kit header product id. */
export function kitBucketsForParent(
  rows: AccountDispatchPreviewRow[],
  kitProductId: string,
): AccountDispatchPreviewRow[] {
  if (!kitProductId) return [];
  return rows.filter(
    (row) => row.isKitBucket && row.kitParentProduct === kitProductId,
  );
}

export type AccountResolvePreviewRow = {
  orderItemId: string;
  productId?: string;
  productName: string;
  sku?: string;
  clearedQty: number;
  dispatchedQty: number;
  atWarehouseQty: number;
  remainingClearance: number;
  settledReturnsQty: number;
  settledQty: number;
  removedQty: number;
  kitParentProduct?: string;
  isKitBucket?: boolean;
  isKitParent?: boolean;
  kitBaseCleared?: number;
};

function inferResolveKitUnits(
  buckets: AccountResolvePreviewRow[],
  kitCleared: number,
  field: "dispatchedQty" | "remainingClearance" | "settledQty" | "removedQty" | "settledReturnsQty",
): number {
  if (!(kitCleared > 0) || buckets.length === 0) return 0;
  let min = Number.POSITIVE_INFINITY;
  for (const bucket of buckets) {
    if (!(bucket.clearedQty > 0)) continue;
    const raw = Number(bucket[field] || 0);
    const units = Math.floor((raw * kitCleared) / bucket.clearedQty);
    if (Number.isFinite(units)) min = Math.min(min, units);
  }
  return Number.isFinite(min) ? Math.max(0, min) : 0;
}

function buildResolveKitHeaderRow(
  kitProductId: string,
  nested: AccountResolvePreviewRow[],
  orderItems: Record<string, unknown>[] = [],
  fallbackName = "Kit",
  fallbackSku?: string,
): AccountResolvePreviewRow {
  const kitLine = orderItems.find(
    (line) =>
      idFromRef(line.product) === kitProductId &&
      !idFromRef(line.kit_parent_product),
  );
  const kitCleared = Math.max(
    0,
    Number(
      kitLine?.approved_quantity ??
        kitLine?.ordered_quantity ??
        kitLine?.quantity ??
        0,
    ) || 0,
  );
  const remainingClearance = inferResolveKitUnits(
    nested,
    kitCleared,
    "remainingClearance",
  );
  const settledReturnsQty = inferResolveKitUnits(
    nested,
    kitCleared,
    "settledReturnsQty",
  );
  const settledQty = inferResolveKitUnits(nested, kitCleared, "settledQty");
  const removedQty = inferResolveKitUnits(nested, kitCleared, "removedQty");
  const dispatchedQty = inferResolveKitUnits(nested, kitCleared, "dispatchedQty");

  return {
    orderItemId: `__kit__${kitProductId}`,
    productId: kitProductId,
    productName: String(kitLine?.product_name ?? fallbackName),
    sku: kitLine?.sku ? String(kitLine.sku) : fallbackSku,
    clearedQty: kitCleared,
    dispatchedQty,
    atWarehouseQty: settledReturnsQty,
    remainingClearance,
    settledReturnsQty,
    settledQty,
    removedQty,
    isKitParent: true,
    isKitBucket: false,
    kitBaseCleared: kitCleared,
  };
}

/** Nest kit buckets under kit headers for settle / resolve UI. */
export function nestResolvePreviewRows(
  rows: AccountResolvePreviewRow[],
  orderItems: Record<string, unknown>[] = [],
): AccountResolvePreviewRow[] {
  const parents = rows.filter((r) => !r.isKitBucket);
  const buckets = rows.filter((r) => r.isKitBucket);
  const byParent = new Map<string, AccountResolvePreviewRow[]>();
  for (const b of buckets) {
    const key = b.kitParentProduct || "";
    if (!key) continue;
    const list = byParent.get(key) ?? [];
    list.push(b);
    byParent.set(key, list);
  }

  const out: AccountResolvePreviewRow[] = [];
  const seenParents = new Set<string>();

  for (const parent of parents) {
    const nested = parent.productId
      ? (byParent.get(parent.productId) ?? [])
      : [];
    if (nested.length > 0 || parent.isKitParent) {
      if (parent.productId) {
        out.push(
          buildResolveKitHeaderRow(
            parent.productId,
            nested,
            orderItems,
            parent.productName,
            parent.sku,
          ),
        );
        seenParents.add(parent.productId);
      }
      out.push(...nested);
      continue;
    }
    out.push(parent);
  }

  for (const [kitProductId, nested] of byParent) {
    if (seenParents.has(kitProductId)) continue;
    out.push(buildResolveKitHeaderRow(kitProductId, nested, orderItems));
    out.push(...nested);
  }

  for (const b of buckets) {
    if (!b.kitParentProduct) out.push(b);
  }

  return out;
}

export function buildAccountResolvePreviewRows(
  approval: Record<string, unknown> | null,
  orderItems: Record<string, unknown>[],
  dispatches: Record<string, unknown>[],
): AccountResolvePreviewRow[] {
  if (!approval) return [];

  const approvalId = idFromRef(approval._id ?? approval.id);
  const dispatchedByLine = computeReleaseDispatchedByLine(dispatches, approvalId, orderItems, approval);
  const returnsByLine = aggregateReleaseDispatchReturnsByOrderLine(dispatches, approvalId);

  const items = Array.isArray(approval.approval_items)
    ? (approval.approval_items as Record<string, unknown>[])
    : [];

  const rows: AccountResolvePreviewRow[] = [];

  for (const item of items) {
    if (isKitShellDispatchSource(item, items, orderItems)) continue;

    const clearedQty = Number(item.approved_quantity || 0);
    if (clearedQty <= 0) continue;

    const orderItemId = resolveOrderItemIdForLine(item, orderItems);
    if (!orderItemId) continue;
    const orderLine = orderItems.find(
      (line) => idFromRef(line._id ?? line.id) === orderItemId,
    );
    const dispatchedQty = dispatchedByLine[orderItemId] || 0;
    const atWarehouseQty = lineAtWarehouseQty(orderItemId, item, orderLine, returnsByLine);
    const remainingClearance = Math.max(0, clearedQty - dispatchedQty);
    const settledReturnsQty = Math.max(0, atWarehouseQty);
    const settledQty = Math.max(0, dispatchedQty - settledReturnsQty);
    const removedQty = remainingClearance + settledReturnsQty;

    const productRef = item.product;
    const productId =
      idFromRef(orderLine?.product) ||
      idFromRef(productRef) ||
      undefined;
    const kitParentProduct =
      idFromRef(orderLine?.kit_parent_product) ||
      idFromRef(item.kit_parent_product) ||
      undefined;
    const productName =
      String(orderLine?.product_name ?? "") ||
      (typeof productRef === "object" && productRef
        ? String((productRef as Record<string, unknown>).product_name ?? "—")
        : String(item.product_name ?? "—"));

    rows.push({
      orderItemId,
      productId,
      productName: productName || "—",
      sku: orderLine?.sku
        ? String(orderLine.sku)
        : item.sku
          ? String(item.sku)
          : undefined,
      clearedQty,
      dispatchedQty,
      atWarehouseQty,
      remainingClearance,
      settledReturnsQty,
      settledQty,
      removedQty,
      kitParentProduct,
      isKitBucket: Boolean(kitParentProduct),
      isKitParent: false,
    });
  }

  return nestResolvePreviewRows(rows, orderItems);
}

export function hasResolvableReleaseWork(rows: AccountResolvePreviewRow[]): boolean {
  // Kit headers are display-only — settle work is on real item / bucket lines.
  return rows.some(
    (row) =>
      !row.isKitParent &&
      !row.orderItemId.startsWith("__kit__") &&
      row.removedQty > 0,
  );
}

function isKitHeaderResolveRow(row: AccountResolvePreviewRow): boolean {
  return Boolean(row.isKitParent) || row.orderItemId.startsWith("__kit__");
}

/** Rows shown in settle UI (kit + buckets kept together when any settle work exists). */
export function filterSettleDisplayRows(
  previewRows: AccountResolvePreviewRow[],
): AccountResolvePreviewRow[] {
  const out: AccountResolvePreviewRow[] = [];
  let i = 0;
  while (i < previewRows.length) {
    const row = previewRows[i];
    if (isKitHeaderResolveRow(row)) {
      const nested: AccountResolvePreviewRow[] = [];
      let j = i + 1;
      while (j < previewRows.length && previewRows[j].isKitBucket) {
        nested.push(previewRows[j]);
        j += 1;
      }
      if (row.removedQty > 0 || nested.some((b) => b.removedQty > 0)) {
        out.push(row, ...nested);
      }
      i = j;
      continue;
    }
    if (row.removedQty > 0) out.push(row);
    i += 1;
  }
  return out;
}

export type ReleaseSettlePayload = {
  previewRows: AccountResolvePreviewRow[];
  settleRows: AccountResolvePreviewRow[];
  approvalItems: Record<string, unknown>[];
  settledRestItems: Record<string, unknown>[];
  unbilledUnits: number;
  hasSettleWork: boolean;
};

/**
 * Kit-aware settle payload for Settle & Unbilled / create-transport auto-settle.
 * Buckets amend approval/order inline; UnbilledOrder gets kit shells (+ plain individuals) only.
 */
export function buildReleaseSettlePayload(
  approval: Record<string, unknown> | null,
  orderItems: Record<string, unknown>[],
  dispatches: Record<string, unknown>[],
): ReleaseSettlePayload {
  const previewRows = buildAccountResolvePreviewRows(
    approval,
    orderItems,
    dispatches,
  );
  const settleRows = filterSettleDisplayRows(previewRows);
  const hasSettleWork = hasResolvableReleaseWork(previewRows);

  if (!approval) {
    return {
      previewRows,
      settleRows,
      approvalItems: [],
      settledRestItems: [],
      unbilledUnits: 0,
      hasSettleWork: false,
    };
  }

  const approvalList = Array.isArray(approval.approval_items)
    ? (approval.approval_items as Record<string, unknown>[])
    : [];
  const byLine = new Map(
    previewRows
      .filter((row) => !isKitHeaderResolveRow(row))
      .map((row) => [row.orderItemId, row] as const),
  );

  const approvalItems: Record<string, unknown>[] = [];
  for (const item of approvalList) {
    const lineId = idFromRef(item.order_item_id);
    let settledQty: number;

    if (isKitShellDispatchSource(item, approvalList, orderItems)) {
      const productId = idFromRef(item.product);
      const kitRow = previewRows.find(
        (r) => isKitHeaderResolveRow(r) && r.productId === productId,
      );
      settledQty = kitRow
        ? kitRow.settledQty
        : Number(item.approved_quantity || 0);
    } else {
      const row = byLine.get(lineId);
      settledQty = row ? row.settledQty : Number(item.approved_quantity || 0);
    }

    if (settledQty <= 0) continue;

    const approvedPrice = Number(item.approved_unit_price ?? 0);
    const discountPercent = Number(item.discount_percent ?? 0);
    const gstPercent = Number(item.gst_percent ?? 18);
    const priorApproved = Number(item.approved_quantity || 0);
    const gross = settledQty * approvedPrice;
    let disc = 0;
    if (discountPercent > 0) {
      disc = (gross * discountPercent) / 100;
    } else if (priorApproved > 0) {
      disc = (Number(item.discount_amount ?? 0) / priorApproved) * settledQty;
    } else {
      disc = Number(item.discount_amount ?? 0);
    }
    const taxable = Math.max(0, gross - disc);
    const lineTotal = taxable + (taxable * gstPercent) / 100;
    const kitParent = idFromRef(item.kit_parent_product) || undefined;

    approvalItems.push({
      order_item_id: lineId,
      product: idFromRef(item.product) || item.product,
      ...(kitParent ? { kit_parent_product: kitParent } : {}),
      ordered_quantity: settledQty,
      approved_quantity: settledQty,
      approved_unit_price: approvedPrice,
      free_quantity: Number(item.free_quantity ?? 0),
      discount_percent: discountPercent,
      discount_amount: disc,
      gst_percent: gstPercent,
      applied_rate_type: item.applied_rate_type ?? "MANUAL",
      approved_total_amount: lineTotal,
      rate_mapped: item.rate_mapped ?? true,
      remarks: item.remarks,
    });
  }

  const settledRestItems: Record<string, unknown>[] = [];
  for (const row of settleRows) {
    if (row.removedQty <= 0) continue;
    if (row.isKitBucket) continue;

    if (isKitHeaderResolveRow(row)) {
      const productId = row.productId || "";
      if (!productId) continue;
      const kitItem = approvalList.find(
        (item) =>
          isKitShellDispatchSource(item, approvalList, orderItems) &&
          idFromRef(item.product) === productId,
      );
      const kitOrderLine = orderItems.find(
        (line) =>
          idFromRef(line.product) === productId &&
          !idFromRef(line.kit_parent_product),
      );
      const orderItemId =
        idFromRef(kitItem?.order_item_id) ||
        idFromRef(kitOrderLine?._id ?? kitOrderLine?.id);
      if (!orderItemId) continue;
      settledRestItems.push({
        order_item_id: orderItemId,
        product: productId,
        product_name: row.productName || "",
        sku: row.sku || "",
        approved_quantity: row.removedQty,
        billed_dispatched_quantity: 0,
        remaining_quantity: row.removedQty,
      });
      continue;
    }

    settledRestItems.push({
      order_item_id: row.orderItemId,
      product: row.productId || undefined,
      product_name: row.productName || "",
      sku: row.sku || "",
      approved_quantity: row.removedQty,
      billed_dispatched_quantity: 0,
      remaining_quantity: row.removedQty,
    });
  }

  const unbilledUnits = settledRestItems.reduce(
    (sum, item) => sum + Number(item.approved_quantity || 0),
    0,
  );

  return {
    previewRows,
    settleRows,
    approvalItems,
    settledRestItems,
    unbilledUnits,
    hasSettleWork,
  };
}

export type SettleCloseReleaseSection = {
  approvalId: string;
  approvalNo: string;
  rows: AccountResolvePreviewRow[];
  needsResolve: boolean;
  isResolved: boolean;
};

/** Per finance release: dispatch vs approval settlement preview for account close. */
export function buildSettleCloseReleaseSections(
  approvals: Record<string, unknown>[],
  orderItems: Record<string, unknown>[],
  dispatches: Record<string, unknown>[],
): SettleCloseReleaseSection[] {
  return approvals
    .map((approval) => {
      const approvalId = idFromRef(approval._id ?? approval.id);
      const releaseDispatches = getReleaseDispatches(dispatches, approvalId);
      if (releaseDispatches.length === 0) return null;

      const rows = buildAccountResolvePreviewRows(approval, orderItems, dispatches);
      const needsResolve = hasResolvableReleaseWork(rows);
      const isResolved = isReleaseEffectivelyResolved(approval, rows);

      return {
        approvalId,
        approvalNo: String(approval.approval_no ?? approvalId.slice(0, 8)),
        rows,
        needsResolve,
        isResolved,
      };
    })
    .filter((section): section is SettleCloseReleaseSection => section !== null);
}

export function summarizeReleaseDispatchState(
  approval: Record<string, unknown> | null,
  dispatches: Record<string, unknown>[],
  orderItems: Record<string, unknown>[] = [],
  returns: Record<string, unknown>[] = [],
  options: AccountDispatchOptions = {},
): ReleaseDispatchSummary {
  if (!approval) {
    return {
      hasDispatches: false,
      remainingTotal: 0,
      returnTotal: 0,
      dispatchableTotal: 0,
      canContinueDispatch: false,
      canResolveRelease: false,
      isReleaseResolved: false,
    };
  }

  const approvalId = idFromRef(approval._id ?? approval.id);
  const includeWarehouseReturns = options.includeWarehouseReturns === true;
  const resolveRows = buildAccountResolvePreviewRows(
    approval,
    orderItems,
    dispatches,
  );
  const hasSettleWork = hasResolvableReleaseWork(resolveRows);
  const effectivelyResolved = isReleaseEffectivelyResolved(approval, resolveRows);

  if (effectivelyResolved) {
    return {
      hasDispatches: true,
      remainingTotal: 0,
      returnTotal: 0,
      dispatchableTotal: 0,
      canContinueDispatch: false,
      canResolveRelease: false,
      isReleaseResolved: true,
    };
  }

  const dispatchedByLine = computeReleaseDispatchedByLine(
    dispatches,
    approvalId,
    orderItems,
    approval,
  );
  const returnsByLine = includeWarehouseReturns
    ? aggregateReleaseDispatchReturnsByOrderLine(dispatches, approvalId)
    : {};
  const releaseDispatches = getReleaseDispatches(dispatches, approvalId);
  const hasDispatches = releaseDispatches.length > 0;

  const items = Array.isArray(approval.approval_items)
    ? (approval.approval_items as Record<string, unknown>[])
    : [];

  let remainingTotal = 0;
  let returnTotal = 0;
  let dispatchableTotal = 0;

  for (const item of items) {
    if (isKitShellDispatchSource(item, items, orderItems)) continue;

    const clearedQty = Number(item.approved_quantity || 0);
    if (clearedQty <= 0) continue;

    const orderItemId = resolveOrderItemIdForLine(item, orderItems);
    if (!orderItemId) continue;
    const orderLine = orderItems.find(
      (line) => idFromRef(line._id ?? line.id) === orderItemId,
    );
    const alreadyDispatched = dispatchedByLine[orderItemId] || 0;
    const atWarehouseQty = includeWarehouseReturns
      ? lineAtWarehouseQty(orderItemId, item, orderLine, returnsByLine)
      : 0;
    const { remaining, dispatchable } = computeLineDispatchAvailability(
      clearedQty,
      alreadyDispatched,
      atWarehouseQty,
    );

    remainingTotal += remaining;
    returnTotal += atWarehouseQty;
    dispatchableTotal += dispatchable;
  }

  // Prefer resolve-preview settle work (same gate as Settle & Unbilled modal).
  // Fallback: any under-dispatched clearance or warehouse returns on this release.
  const canResolveRelease =
    hasDispatches &&
    (hasSettleWork || remainingTotal > 0 || returnTotal > 0);

  return {
    hasDispatches,
    remainingTotal,
    returnTotal,
    dispatchableTotal,
    // Partial remaining is closed via Settle & Unbilled Order — no continue-dispatch.
    canContinueDispatch: false,
    canResolveRelease,
    isReleaseResolved: false,
  };
}

/** First fully-cleared release that still has dispatch < approval (settle work). */
export function findFirstSettleableRelease(
  approvals: Record<string, unknown>[],
  dispatches: Record<string, unknown>[],
  orderItems: Record<string, unknown>[] = [],
  returns: Record<string, unknown>[] = [],
  options: AccountDispatchOptions = { includeWarehouseReturns: true },
): { approval: Record<string, unknown>; releaseNo: string } | null {
  for (const approval of approvals) {
    if (!isFullyClearedApproval(approval)) continue;
    const summary = summarizeReleaseDispatchState(
      approval,
      dispatches,
      orderItems,
      returns,
      options,
    );
    if (!summary.canResolveRelease) continue;
    return {
      approval,
      releaseNo: String(
        approval.approval_no ?? idFromRef(approval._id ?? approval.id),
      ),
    };
  }
  return null;
}

export function listDispatchableAccountApprovals(
  accountApprovals: Record<string, unknown>[],
  dispatches: Record<string, unknown>[],
  orderItems: Record<string, unknown>[] = [],
  _returns: Record<string, unknown>[] = [],
  options: AccountDispatchOptions = {},
): Record<string, unknown>[] {
  return accountApprovals.filter((app) => {
    if (!isFullyClearedApproval(app)) return false;
    if (isDispatchReleaseResolved(app)) return false;
    const appId = idFromRef(app._id ?? app.id);

    // Once any non-cancelled dispatch exists on the release, remaining qty is
    // settled into UnbilledOrder — do not offer another create/continue dispatch.
    const releaseDispatches = getReleaseDispatches(dispatches, appId);
    const hasActiveDispatch = releaseDispatches.some((disp) => {
      const status = String(disp.dispatch_status ?? disp.status ?? "draft").toLowerCase();
      return status !== "cancelled";
    });
    if (hasActiveDispatch) return false;

    const dispatchedByLine = computeReleaseDispatchedByLine(dispatches, appId, orderItems, app);
    const rows = buildAccountDispatchPreviewRows(
      app,
      orderItems,
      dispatchedByLine,
      {},
      options,
    );
    return rows.some((row) => row.dispatchable > 0);
  });
}

export function isDispatchBatchSentToDispatch(
  dispatch: Record<string, unknown>,
): boolean {
  return Boolean(idFromRef(dispatch.dispatch_assignee_user));
}

/**
 * Account may edit a dispatch until Settle & Unbilled resolves the release,
 * or until a transport exists / dispatch_status is transport_created.
 */
export function canEditAccountDispatch(params: {
  dispatch: Record<string, unknown>;
  approval?: Record<string, unknown> | null;
  transports?: Record<string, unknown>[];
}): boolean {
  const { dispatch, approval, transports = [] } = params;
  const status = String(dispatch.dispatch_status ?? dispatch.status ?? "draft").toLowerCase();
  if (status === "cancelled") return true;
  if (status === "transport_created") return false;

  if (approval && isDispatchReleaseResolved(approval)) return false;

  const dispatchId = idFromRef(dispatch._id ?? dispatch.id);
  if (!dispatchId) return false;

  const hasActiveTransport = transports.some((tr) => {
    const trDispatchId =
      typeof tr.dispatch === "object" && tr.dispatch !== null
        ? idFromRef(
            (tr.dispatch as Record<string, unknown>)._id ??
              (tr.dispatch as Record<string, unknown>).id,
          )
        : idFromRef(tr.dispatch);
    if (trDispatchId !== dispatchId) return false;
    const shipmentStatus = String(tr.shipment_status ?? tr.status ?? "").toLowerCase();
    return shipmentStatus !== "returned" && shipmentStatus !== "cancelled";
  });
  if (hasActiveTransport) return false;

  return status === "draft" || status === "submitted" || status === "cancelled";
}

export function resolveDispatchReleaseId(dispatch: Record<string, unknown>): string {
  const approvalRef = dispatch.finance_approval;
  if (typeof approvalRef === "object" && approvalRef !== null) {
    return idFromRef(
      (approvalRef as Record<string, unknown>)._id ??
        (approvalRef as Record<string, unknown>).id,
    );
  }
  return idFromRef(approvalRef);
}

/**
 * Map synthetic `__kit__{productId}` UI keys to the commercial kit order line.
 */
export function resolveKitShellDispatchPayload(
  kitProductId: string,
  orderItems: Record<string, unknown>[],
  approval: Record<string, unknown> | null = null,
): { order_item_id: string; product: string } | null {
  if (!kitProductId) return null;

  const approvalItems = Array.isArray(approval?.approval_items)
    ? (approval!.approval_items as Record<string, unknown>[])
    : [];

  if (approvalItems.length > 0) {
    const shell = approvalItems.find(
      (item) =>
        idFromRef(item.product) === kitProductId &&
        !idFromRef(item.kit_parent_product) &&
        isKitShellDispatchSource(item, approvalItems, orderItems),
    );
    if (shell) {
      const orderItemId = resolveOrderItemIdForLine(shell, orderItems);
      const product =
        idFromRef(shell.product) ||
        idFromRef(
          orderItems.find((line) => idFromRef(line._id ?? line.id) === orderItemId)
            ?.product,
        );
      if (orderItemId && product) {
        return { order_item_id: orderItemId, product };
      }
    }
  }

  const kitLine = orderItems.find(
    (line) =>
      idFromRef(line.product) === kitProductId &&
      !idFromRef(line.kit_parent_product),
  );
  if (!kitLine) return null;
  const orderItemId = idFromRef(kitLine._id ?? kitLine.id);
  const product = idFromRef(kitLine.product);
  if (!orderItemId || !product) return null;
  return { order_item_id: orderItemId, product };
}

export type DispatchItemPayload = {
  order_item_id: string;
  product: string;
  dispatch_quantity: number;
};

/**
 * Persist kit shells + buckets + individuals. Synthetic `__kit__*` keys become
 * the commercial kit shell order line; duplicate real shell ids are skipped.
 */
export function buildDispatchItemsPayload(
  quantities: Record<string, number>,
  orderItems: Record<string, unknown>[],
  approval: Record<string, unknown> | null = null,
): DispatchItemPayload[] {
  const out: DispatchItemPayload[] = [];
  const seen = new Set<string>();

  for (const [key, qty] of Object.entries(quantities)) {
    if (!(Number(qty) > 0)) continue;
    if (!key.startsWith("__kit__")) continue;
    const productId = key.slice("__kit__".length);
    const resolved = resolveKitShellDispatchPayload(
      productId,
      orderItems,
      approval,
    );
    if (!resolved || seen.has(resolved.order_item_id)) continue;
    seen.add(resolved.order_item_id);
    out.push({
      order_item_id: resolved.order_item_id,
      product: resolved.product,
      dispatch_quantity: Number(qty),
    });
  }

  const approvalItems = Array.isArray(approval?.approval_items)
    ? (approval!.approval_items as Record<string, unknown>[])
    : [];
  const peerForShellCheck =
    approvalItems.length > 0
      ? approvalItems
      : orderItems.map((line) => ({
          ...line,
          order_item_id: idFromRef(line._id ?? line.id),
        }));

  for (const [orderItemId, qty] of Object.entries(quantities)) {
    if (!(Number(qty) > 0)) continue;
    if (orderItemId.startsWith("__kit__")) continue;
    if (seen.has(orderItemId)) continue;

    const orderLine = orderItems.find(
      (line) => idFromRef(line._id ?? line.id) === orderItemId,
    );
    // Kit qty is owned by the `__kit__` header — skip a duplicate real shell id.
    if (
      orderLine &&
      isKitShellDispatchSource(
        {
          ...orderLine,
          order_item_id: orderItemId,
          product: orderLine.product,
        },
        peerForShellCheck,
        orderItems,
      )
    ) {
      continue;
    }

    const approvalItem = approvalItems.find(
      (row) => idFromRef(row.order_item_id) === orderItemId,
    );
    const product =
      idFromRef(orderLine?.product) || idFromRef(approvalItem?.product);
    if (!product) continue;

    seen.add(orderItemId);
    out.push({
      order_item_id: orderItemId,
      product,
      dispatch_quantity: Number(qty),
    });
  }

  return out;
}

export type AccountDispatchReleaseGroup = {
  releaseId: string;
  releaseNo: string;
  approval: Record<string, unknown> | null;
  dispatches: Record<string, unknown>[];
};

export function groupAccountDispatchesByRelease(
  dispatches: Record<string, unknown>[],
  accountApprovals: Record<string, unknown>[] = [],
): AccountDispatchReleaseGroup[] {
  const approvalById = new Map<string, Record<string, unknown>>();
  for (const app of accountApprovals) {
    const appId = idFromRef(app._id ?? app.id);
    if (appId) approvalById.set(appId, app);
  }

  const groups = new Map<string, AccountDispatchReleaseGroup>();

  for (const disp of dispatches) {
    const releaseId = resolveDispatchReleaseId(disp) || "__unlinked__";
    const approval =
      releaseId === "__unlinked__"
        ? null
        : (approvalById.get(releaseId) ??
          (typeof disp.finance_approval === "object" && disp.finance_approval !== null
            ? (disp.finance_approval as Record<string, unknown>)
            : null));

    const releaseNo = approval
      ? String(approval.approval_no ?? releaseId)
      : releaseId === "__unlinked__"
        ? "Unlinked release"
        : releaseId;

    const existing = groups.get(releaseId);
    if (existing) {
      existing.dispatches.push(disp);
      continue;
    }

    groups.set(releaseId, {
      releaseId,
      releaseNo,
      approval,
      dispatches: [disp],
    });
  }

  return Array.from(groups.values()).sort((a, b) => {
    const aTime = Date.parse(String(a.approval?.account_approved_at ?? a.approval?.createdAt ?? ""));
    const bTime = Date.parse(String(b.approval?.account_approved_at ?? b.approval?.createdAt ?? ""));
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
      return aTime - bTime;
    }
    return a.releaseNo.localeCompare(b.releaseNo);
  });
}
