import {
  aggregateDispatchReturnsByOrderLine,
  refId,
} from "@/components/portal/shared/returnSettlement";

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
          if (productId) {
            const byProduct = orderItems.find((line) => idFromRef(line.product) === productId);
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
  return !rows.some((row) => row.removedQty > 0);
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
  productName: string;
  sku?: string;
  clearedQty: number;
  alreadyDispatched: number;
  remaining: number;
  atWarehouseQty: number;
  dispatchable: number;
};

export function resolveOrderItemIdForLine(
  approvalItem: Record<string, unknown>,
  orderItems: Record<string, unknown>[],
): string {
  const rawId = idFromRef(approvalItem.order_item_id);
  const byId = orderItems.find((line) => idFromRef(line._id ?? line.id) === rawId);
  if (byId) return idFromRef(byId._id ?? byId.id);

  const productId = idFromRef(approvalItem.product);
  if (productId) {
    const byProduct = orderItems.find((line) => idFromRef(line.product) === productId);
    if (byProduct) return idFromRef(byProduct._id ?? byProduct.id);
  }

  return "";
}

export function buildAccountDispatchPreviewRows(
  approval: Record<string, unknown> | null,
  orderItems: Record<string, unknown>[],
  dispatchedByLine: Record<string, number>,
  returnsByLine: Record<string, number> = {},
  options: AccountDispatchOptions = {},
): AccountDispatchPreviewRow[] {
  if (!approval) return [];
  if (!isFullyClearedApproval(approval)) return [];

  const includeWarehouseReturns = options.includeWarehouseReturns === true;
  const items = Array.isArray(approval.approval_items)
    ? (approval.approval_items as Record<string, unknown>[])
    : [];

  const rows: AccountDispatchPreviewRow[] = [];

  for (const item of items) {
    const clearedQty = Number(item.approved_quantity || 0);
    if (clearedQty <= 0) continue;

    const orderItemId = resolveOrderItemIdForLine(item, orderItems);
    const orderLine = orderItems.find(
      (line) => idFromRef(line._id ?? line.id) === orderItemId,
    );
    if (!orderItemId || !orderLine) continue;
    const productRef = item.product;
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
      productName,
      sku: orderLine?.sku ? String(orderLine.sku) : undefined,
      clearedQty,
      alreadyDispatched,
      remaining,
      atWarehouseQty,
      dispatchable,
    });
  }

  return rows;
}

export type AccountResolvePreviewRow = {
  orderItemId: string;
  productName: string;
  sku?: string;
  clearedQty: number;
  dispatchedQty: number;
  atWarehouseQty: number;
  remainingClearance: number;
  settledReturnsQty: number;
  settledQty: number;
  removedQty: number;
};

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
    const clearedQty = Number(item.approved_quantity || 0);
    if (clearedQty <= 0) continue;

    const orderItemId = resolveOrderItemIdForLine(item, orderItems);
    const orderLine = orderItems.find(
      (line) => idFromRef(line._id ?? line.id) === orderItemId,
    );
    if (!orderItemId || !orderLine) continue;
    const dispatchedQty = dispatchedByLine[orderItemId] || 0;
    const atWarehouseQty = lineAtWarehouseQty(orderItemId, item, orderLine, returnsByLine);
    const remainingClearance = Math.max(0, clearedQty - dispatchedQty);
    const settledReturnsQty = Math.max(0, atWarehouseQty);
    const settledQty = Math.max(0, dispatchedQty - settledReturnsQty);
    const removedQty = remainingClearance + settledReturnsQty;

    const productRef = item.product;
    const productName =
      String(orderLine?.product_name ?? "") ||
      (typeof productRef === "object" && productRef
        ? String((productRef as Record<string, unknown>).product_name ?? "—")
        : String(item.product_name ?? "—"));

    rows.push({
      orderItemId,
      productName,
      sku: orderLine?.sku ? String(orderLine.sku) : undefined,
      clearedQty,
      dispatchedQty,
      atWarehouseQty,
      remainingClearance,
      settledReturnsQty,
      settledQty,
      removedQty,
    });
  }

  return rows;
}

export function hasResolvableReleaseWork(rows: AccountResolvePreviewRow[]): boolean {
  return rows.some((row) => row.removedQty > 0);
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
  const hasReturnsOnDispatch = releaseHasDispatchReturns(dispatches, approvalId);

  if (isDispatchReleaseResolved(approval) && !hasReturnsOnDispatch) {
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

  const includeWarehouseReturns = options.includeWarehouseReturns === true;
  const dispatchedByLine = computeReleaseDispatchedByLine(dispatches, approvalId, orderItems, approval);
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
    const clearedQty = Number(item.approved_quantity || 0);
    if (clearedQty <= 0) continue;

    const orderItemId = resolveOrderItemIdForLine(item, orderItems);
    const orderLine = orderItems.find(
      (line) => idFromRef(line._id ?? line.id) === orderItemId,
    );
    if (!orderItemId || !orderLine) continue;
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

  return {
    hasDispatches,
    remainingTotal,
    returnTotal,
    dispatchableTotal,
    canContinueDispatch: dispatchableTotal > 0,
    canResolveRelease: hasDispatches && (remainingTotal > 0 || returnTotal > 0),
    isReleaseResolved: false,
  };
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
