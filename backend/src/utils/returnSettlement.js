const {
  isReturnReceivedAtWarehouse,
  ORDER_RETURN_STATUS,
  normalizeReturnStatus,
} = require('../constants/orderReturnStatus');

function isReturnCountedOnOrder(status) {
  const normalized = normalizeReturnStatus(status);
  return [
    ORDER_RETURN_STATUS.PENDING,
    ORDER_RETURN_STATUS.RECEIVED_AT_WAREHOUSE,
  ].includes(normalized);
}

function refId(value) {
  if (value == null) return '';
  if (typeof value === 'object') return String(value._id ?? value.id ?? '');
  return String(value);
}

function getReleaseDispatchIds(dispatches, approvalId) {
  const ids = new Set();
  if (!approvalId) return ids;

  for (const dispatch of dispatches || []) {
    if (dispatch.dispatch_status === 'cancelled') continue;
    const approvalRef = dispatch.finance_approval;
    const dispatchApprovalId =
      approvalRef && typeof approvalRef === 'object'
        ? refId(approvalRef._id ?? approvalRef.id)
        : refId(approvalRef);
    if (dispatchApprovalId === String(approvalId)) {
      ids.add(refId(dispatch._id));
    }
  }
  return ids;
}

function aggregateReturnsByOrderLine(returns, dispatches, { includePending = false } = {}) {
  const dispatchById = {};
  for (const dispatch of dispatches || []) {
    dispatchById[refId(dispatch._id)] = dispatch;
  }

  const byLine = {};
  for (const ret of returns || []) {
    const counted = includePending
      ? isReturnCountedOnOrder(ret.return_status)
      : isReturnReceivedAtWarehouse(ret.return_status);
    if (!counted) continue;
    const dispatch = dispatchById[refId(ret.dispatch)];
    if (!dispatch) continue;

    const items = Array.isArray(ret.return_items) ? ret.return_items : [];
    for (const rawItem of items) {
      const productId = refId(rawItem.product);
      const qty = Number(rawItem.returned_quantity || 0);
      if (!productId || qty <= 0) continue;

      const dispatchItems = Array.isArray(dispatch.dispatch_items) ? dispatch.dispatch_items : [];
      const matching = dispatchItems.filter((di) => refId(di.product) === productId);

      if (matching.length === 1) {
        const key = refId(matching[0].order_item_id);
        if (!key) continue;
        byLine[key] = (byLine[key] || 0) + qty;
        continue;
      }

      if (matching.length > 1) {
        const totalDisp = matching.reduce(
          (sum, di) => sum + Number(di.dispatched_quantity || 0),
          0,
        );
        let allocated = 0;
        matching.forEach((di, idx) => {
          const key = refId(di.order_item_id);
          if (!key) return;
          let share;
          if (idx === matching.length - 1) {
            share = qty - allocated;
          } else if (totalDisp > 0) {
            share = Math.round((Number(di.dispatched_quantity || 0) / totalDisp) * qty);
          } else {
            share = Math.floor(qty / matching.length);
          }
          allocated += share;
          byLine[key] = (byLine[key] || 0) + share;
        });
      }
    }
  }

  return byLine;
}

function aggregateReceivedReturnsByOrderLine(returns, dispatches) {
  return aggregateReturnsByOrderLine(returns, dispatches, { includePending: false });
}

function aggregateReportedReturnsByOrderLine(returns, dispatches) {
  return aggregateReturnsByOrderLine(returns, dispatches, { includePending: true });
}

function aggregateReleaseReturnsByOrderLine(returns, dispatches, approvalId) {
  if (!approvalId) return {};
  const releaseDispatchIds = getReleaseDispatchIds(dispatches, approvalId);
  const releaseReturns = (returns || []).filter((ret) => releaseDispatchIds.has(refId(ret.dispatch)));
  return aggregateReceivedReturnsByOrderLine(releaseReturns, dispatches);
}

function lineAtWarehouseQty(orderItemId, approvalItem, orderLine, returnsByLine) {
  const fromReturns = Number(returnsByLine[orderItemId] || 0);
  if (fromReturns > 0) return fromReturns;
  if (approvalItem) {
    const fromApproval = Number(approvalItem.return_item_qty || 0);
    if (fromApproval > 0) return fromApproval;
  }
  const fromLine = Number(orderLine?.return_item_qty ?? orderLine?.returned_quantity ?? 0);
  return Number.isFinite(fromLine) ? Math.max(0, fromLine) : 0;
}

function computeLineDispatchAvailability(clearedQty, alreadyDispatched, atWarehouseQty) {
  const remaining = Math.max(0, clearedQty - alreadyDispatched);
  const atWarehouse = Math.max(0, atWarehouseQty);
  return {
    remaining,
    atWarehouseQty: atWarehouse,
    available: remaining + atWarehouse,
  };
}

function aggregateDispatchReturnsByOrderLine(dispatches) {
  const byLine = {};
  for (const dispatch of dispatches || []) {
    if (dispatch.dispatch_status === 'cancelled') continue;
    for (const item of dispatch.dispatch_items || []) {
      const key = refId(item.order_item_id);
      if (!key) continue;
      byLine[key] = (byLine[key] || 0) + Number(item.returned_quantity || 0);
    }
  }
  return byLine;
}

module.exports = {
  refId,
  getReleaseDispatchIds,
  aggregateReturnsByOrderLine,
  aggregateReceivedReturnsByOrderLine,
  aggregateReportedReturnsByOrderLine,
  aggregateReleaseReturnsByOrderLine,
  aggregateDispatchReturnsByOrderLine,
  lineAtWarehouseQty,
  computeLineDispatchAvailability,
  isReturnCountedOnOrder,
};
