/**
 * @fileoverview Central quantity ledger and fulfillment snapshot for orders.
 * Rolls up finance-approved, dispatched, and delivered quantities from execution documents.
 * @module modules/orders/orderFulfillment.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');

function lineQuantities(line) {
  const ordered = Number(line.ordered_quantity ?? line.quantity ?? 0);
  const approved = Number(line.approved_quantity ?? 0);
  const allocated = Number(line.allocated_quantity ?? 0);
  const dispatched = Number(line.dispatched_quantity ?? 0);
  const delivered = Number(line.delivered_quantity ?? 0);
  const cancelled = Number(line.cancelled_quantity ?? 0);
  const dispatchCap = approved > 0 ? approved : ordered;

  return {
    ordered,
    approved,
    allocated,
    dispatched,
    delivered,
    cancelled,
    dispatchCap,
    pendingFinance: Math.max(0, ordered - approved),
    pendingDispatch: Math.max(0, approved - dispatched),
    pendingDelivery: Math.max(0, dispatched - delivered),
  };
}

function deriveFinanceApprovalStatus(items) {
  const lines = items || [];
  if (lines.length === 0) return 'pending';

  const hasApproved = lines.some((line) => Number(line.approved_quantity || 0) > 0);
  if (!hasApproved) return 'pending';

  const allFullyApproved = lines.every((line) => {
    const q = lineQuantities(line);
    return q.approved >= q.ordered;
  });
  if (allFullyApproved) return 'full';

  return 'partial';
}

function financeWorkflowAction(orderDoc) {
  const fas = orderDoc.finance_approval_status || deriveFinanceApprovalStatus(orderDoc.order_items);
  if (fas === 'full') return 'fully_finance_approved';
  if (fas === 'partial') return 'partially_finance_approved';
  if (fas === 'rejected') return 'rejected';
  return 'review_requested';
}

/** Keep finance partial/full visible on order even after dispatch queue handoff. */
function applyFinanceWorkflowAction(orderDoc) {
  // Preserve explicit finance → dispatch queue handoff (do not revert to finance-approved action).
  if (
    orderDoc.current_action === 'sent_to_dispatch' ||
    orderDoc.status === 'dispatch_pending'
  ) {
    return 'sent_to_dispatch';
  }

  const action = financeWorkflowAction(orderDoc);
  if (['fully_finance_approved', 'partially_finance_approved'].includes(action)) {
    orderDoc.current_action = action;
    if (orderDoc.workflow_stage === 'finance_review') {
      orderDoc.workflow_stage = 'dispatch_review';
    }
    orderDoc.status = action;
  } else if (action === 'rejected') {
    orderDoc.current_action = 'rejected';
    orderDoc.status = 'finance_rejected';
  }
  return action;
}

const DEPARTMENT_LABELS = {
  sales: 'Sales',
  admin_review: 'Admin Review',
  finance_review: 'Finance Review',
  dispatch_review: 'Dispatch Review',
  dispatch_execution: 'Dispatch Execution',
  completed: 'Completed',
  cancelled: 'Cancelled',
  hold: 'On Hold',
};

const ACTION_LABELS = {
  drafted: 'Draft saved',
  submitted: 'Submitted to admin',
  approved: 'Sales / admin approved',
  review_requested: 'Finance review requested',
  partially_finance_approved: 'Partially finance approved',
  fully_finance_approved: 'Fully finance approved',
  rejected: 'Rejected',
  sent_to_dispatch: 'Sent to dispatch queue',
  partial_dispatch: 'Partial dispatch recorded',
  full_dispatch: 'Full dispatch recorded',
  partially_transported: 'Partially in transport',
  fully_transported: 'All dispatches shipped',
  transporter_assigned: 'Transporter assigned',
  vehicle_assigned: 'Vehicle assigned',
  picked_up: 'Picked up',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  delivery_failed: 'Delivery failed',
  returned: 'Returned',
  cancelled: 'Cancelled',
  hold: 'On hold',
};

function titleCaseToken(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildStatusDimensions(orderPlain, totals) {
  const lifecycle = orderPlain.lifecycle_status || '';
  const stage = orderPlain.workflow_stage || '';
  const pendingRole = orderPlain.pending_with_role || orderPlain.current_department || '';
  const action = orderPlain.current_action || '';
  const fas = orderPlain.finance_approval_status || deriveFinanceApprovalStatus(orderPlain.order_items);
  const dispatchStatus = orderPlain.dispatch_status || 'pending';
  const deliveryStatus = orderPlain.delivery_status || 'pending';

  let departmental = { key: stage || 'unknown', label: DEPARTMENT_LABELS[stage] || titleCaseToken(stage), tone: 'info' };
  if (lifecycle === 'cancelled' || stage === 'cancelled') {
    departmental = { key: 'cancelled', label: 'Cancelled', tone: 'danger' };
  } else if (lifecycle === 'on_hold' || stage === 'hold') {
    departmental = {
      key: 'on_hold',
      label: 'On Hold',
      detail: pendingRole ? `With ${titleCaseToken(pendingRole)}` : undefined,
      tone: 'warning',
    };
  } else if (stage === 'completed' || lifecycle === 'fulfilled') {
    departmental = { key: 'completed', label: 'Completed', tone: 'success' };
  } else if (pendingRole && !DEPARTMENT_LABELS[stage]) {
    departmental.detail = `Owner: ${titleCaseToken(pendingRole)}`;
  }

  const ordered = Number(totals.ordered || 0);
  const approved = Number(totals.approved || 0);
  const dispatched = Number(totals.dispatched || 0);
  const delivered = Number(totals.delivered || 0);
  const pendingFinance = Number(totals.pendingFinance || 0);
  const pendingDispatch = Number(totals.pendingDispatch || 0);
  const pendingDelivery = Number(totals.pendingDelivery || 0);

  let fulfillment = { key: 'finance_pending', label: 'Awaiting finance approval', tone: 'neutral' };
  if (deliveryStatus === 'completed' || (delivered > 0 && pendingDelivery === 0 && dispatched > 0)) {
    fulfillment = {
      key: 'fulfilled',
      label: 'Fully delivered',
      detail: `${delivered} / ${approved || ordered} qty delivered`,
      tone: 'success',
    };
  } else if (deliveryStatus === 'partial' || delivered > 0) {
    fulfillment = {
      key: 'partial_delivery',
      label: 'Partially delivered',
      detail: `${delivered} delivered · ${pendingDelivery} pending delivery`,
      tone: 'info',
    };
  } else if (dispatchStatus === 'completed' || (dispatched > 0 && pendingDispatch === 0 && approved > 0)) {
    fulfillment = {
      key: 'full_dispatch',
      label: 'Fully dispatched',
      detail: `${dispatched} / ${approved} approved qty dispatched`,
      tone: 'success',
    };
  } else if (dispatchStatus === 'partial' || dispatched > 0) {
    fulfillment = {
      key: 'partial_dispatch',
      label: 'Partially dispatched',
      detail: `${dispatched} dispatched · ${pendingDispatch} pending dispatch`,
      tone: 'info',
    };
  } else if (fas === 'full') {
    fulfillment = {
      key: 'finance_full',
      label: 'Fully finance approved',
      detail: `${approved} / ${ordered} qty approved`,
      tone: 'success',
    };
  } else if (fas === 'partial' || approved > 0) {
    fulfillment = {
      key: 'finance_partial',
      label: 'Partially finance approved',
      detail: `${approved} approved · ${pendingFinance} pending finance`,
      tone: 'warning',
    };
  } else if (fas === 'rejected') {
    fulfillment = { key: 'finance_rejected', label: 'Finance rejected', tone: 'danger' };
  } else if (ordered > 0) {
    fulfillment.detail = `${ordered} qty ordered`;
  }

  let actionStage = {
    key: action || 'none',
    label: ACTION_LABELS[action] || titleCaseToken(action || orderPlain.status),
    tone: 'neutral',
  };
  if (action.includes('rejected') || action === 'cancelled' || action === 'delivery_failed') {
    actionStage.tone = 'danger';
  } else if (action === 'hold') {
    actionStage.tone = 'warning';
  } else if (action.includes('approved') || action === 'delivered' || action === 'full_dispatch') {
    actionStage.tone = 'success';
  } else if (action.includes('partial') || action.includes('transit')) {
    actionStage.tone = 'info';
  }

  return { departmental, fulfillment, action: actionStage };
}

function buildFinanceCapabilities(orderPlain, totals) {
  const fas = orderPlain.finance_approval_status || deriveFinanceApprovalStatus(orderPlain.order_items);
  const pendingFinance = Number(totals.pendingFinance || 0);
  const approved = Number(totals.approved || 0);
  const stage = orderPlain.workflow_stage || '';

  return {
    finance_approval_status: fas,
    display_status:
      fas === 'full'
        ? 'fully_finance_approved'
        : fas === 'partial'
          ? 'partially_finance_approved'
          : fas === 'rejected'
            ? 'finance_rejected'
            : 'finance_review',
    pending_finance_qty: pendingFinance,
    approved_qty: approved,
    ordered_qty: Number(totals.ordered || 0),
    can_approve_remaining: fas === 'partial' && pendingFinance > 0,
    can_send_to_dispatch:
      approved > 0 &&
      fas !== 'rejected' &&
      orderPlain.current_action !== 'sent_to_dispatch' &&
      orderPlain.status !== 'dispatch_pending' &&
      !['dispatch_execution', 'completed'].includes(stage),
    is_partially_finance_approved: fas === 'partial',
    is_fully_finance_approved: fas === 'full',
  };
}

function deriveLineStatus(q) {
  if (q.cancelled >= q.ordered && q.ordered > 0) return 'cancelled';
  if (q.delivered >= q.ordered && q.ordered > 0) return 'fully_delivered';
  if (q.delivered > 0) return 'partially_delivered';
  if (q.dispatched >= q.dispatchCap && q.dispatchCap > 0) return 'fully_dispatched';
  if (q.dispatched > 0) return 'partially_dispatched';
  if (q.allocated >= q.dispatchCap && q.dispatchCap > 0) return 'fully_allocated';
  if (q.allocated > 0) return 'partially_allocated';
  return 'active';
}

function aggregateDispatchedByLine(dispatches, excludeDispatchId = null) {
  const byLine = {};
  for (const dispatch of dispatches || []) {
    if (dispatch.dispatch_status === 'cancelled') continue;
    if (excludeDispatchId && String(dispatch._id) === String(excludeDispatchId)) continue;
    for (const item of dispatch.dispatch_items || []) {
      const key = String(item.order_item_id);
      byLine[key] = (byLine[key] || 0) + Number(item.dispatched_quantity || 0);
    }
  }
  return byLine;
}

function aggregateDeliveredByLine(dispatches) {
  const byLine = {};
  for (const dispatch of dispatches || []) {
    if (dispatch.dispatch_status === 'cancelled') continue;
    for (const item of dispatch.dispatch_items || []) {
      const key = String(item.order_item_id);
      byLine[key] = (byLine[key] || 0) + Number(item.delivered_quantity || 0);
    }
  }
  return byLine;
}

function buildLineSnapshot(line) {
  const q = lineQuantities(line);
  return {
    order_item_id: String(line._id),
    product: line.product,
    product_name: line.product_name,
    sku: line.sku,
    ...q,
    line_status: deriveLineStatus(q),
  };
}

function buildOrderSnapshot(orderPlain, dispatches, shipments) {
  const lines = (orderPlain.order_items || []).map((line) => buildLineSnapshot(line));
  const totals = lines.reduce(
    (acc, line) => {
      acc.ordered += line.ordered;
      acc.approved += line.approved;
      acc.dispatched += line.dispatched;
      acc.delivered += line.delivered;
      acc.pendingFinance += line.pendingFinance;
      acc.pendingDispatch += line.pendingDispatch;
      acc.pendingDelivery += line.pendingDelivery;
      return acc;
    },
    {
      ordered: 0,
      approved: 0,
      dispatched: 0,
      delivered: 0,
      pendingFinance: 0,
      pendingDispatch: 0,
      pendingDelivery: 0,
    },
  );

  const activeDispatches = (dispatches || []).filter((d) => d.dispatch_status !== 'cancelled');
  const activeShipments = (shipments || []).filter(
    (s) => !['delivery_failed', 'returned'].includes(s.shipment_status),
  );

  const finance = buildFinanceCapabilities(orderPlain, totals);
  const status_dimensions = buildStatusDimensions(orderPlain, totals);

  return {
    order_id: orderPlain._id,
    order_no: orderPlain.order_no,
    finance_approval_status: finance.finance_approval_status,
    finance,
    status_dimensions,
    dispatch_status: orderPlain.dispatch_status,
    delivery_status: orderPlain.delivery_status,
    lifecycle_status: orderPlain.lifecycle_status,
    workflow_stage: orderPlain.workflow_stage,
    current_action: orderPlain.current_action,
    totals,
    lines,
    dispatches: activeDispatches.map((d) => ({
      _id: d._id,
      dispatch_no: d.dispatch_no,
      dispatch_status: d.dispatch_status,
      finance_approval: d.finance_approval,
      dispatched_at: d.dispatched_at,
      item_count: (d.dispatch_items || []).length,
    })),
    shipments: activeShipments.map((s) => ({
      _id: s._id,
      shipment_no: s.shipment_no,
      shipment_status: s.shipment_status,
      dispatch: s.dispatch,
      vehicle_number: s.vehicle_number,
      actual_delivery_date: s.actual_delivery_date,
    })),
    dispatch_count: activeDispatches.length,
    shipment_count: activeShipments.length,
    open_flags: Number(orderPlain.open_flag_count || 0),
  };
}

async function syncDispatchDeliveredFromShipments(orderId) {
  const { OrderDispatch, TransportShipment } = getModels();
  const deliveredShipments = await TransportShipment.find({
    order: orderId,
    deletedAt: null,
    shipment_status: 'delivered',
  }).lean();

  if (deliveredShipments.length === 0) return;

  const deliveredDispatchIds = new Set(deliveredShipments.map((s) => String(s.dispatch)));
  const dispatches = await OrderDispatch.find({
    order: orderId,
    deletedAt: null,
    dispatch_status: { $ne: 'cancelled' },
  });

  for (const dispatch of dispatches) {
    if (!deliveredDispatchIds.has(String(dispatch._id))) continue;
    let changed = false;
    for (const item of dispatch.dispatch_items || []) {
      const target = Number(item.dispatched_quantity || 0);
      if (Number(item.delivered_quantity || 0) !== target) {
        item.delivered_quantity = target;
        changed = true;
      }
    }
    if (changed) await dispatch.save();
  }
}

async function recomputeApprovedQuantitiesFromFinance(orderId) {
  const { Order, OrderFinanceApproval } = getModels();
  const orderDoc = await Order.findById(orderId);
  if (!orderDoc) throw new ApiError(404, 'Order not found');

  const approvals = await OrderFinanceApproval.find({
    order: orderId,
    deletedAt: null,
    approval_status: { $in: ['partially_approved', 'fully_approved'] },
  })
    .sort({ revision_number: -1, createdAt: -1 })
    .lean();

  const approvedByLine = {};
  const priceByLine = {};
  for (const approval of approvals) {
    for (const item of approval.approval_items || []) {
      if (!['partially_approved', 'fully_approved'].includes(item.approval_status)) continue;
      const key = String(item.order_item_id);
      approvedByLine[key] = (approvedByLine[key] || 0) + Number(item.approved_quantity || 0);
      if (item.approved_unit_price != null) {
        priceByLine[key] = Number(item.approved_unit_price);
      }
    }
  }

  for (const line of orderDoc.order_items || []) {
    const key = String(line._id);
    const ordered = Number(line.ordered_quantity ?? line.quantity ?? 0);
    line.approved_quantity = Math.min(ordered, approvedByLine[key] || 0);
    if (priceByLine[key] != null && line.approved_quantity > 0) {
      line.unit_price = priceByLine[key];
    }
  }

  if (approvals.length > 0) {
    orderDoc.last_finance_approval = approvals[0]._id;
  }
  orderDoc.finance_approval_status = deriveFinanceApprovalStatus(orderDoc.order_items);
  orderDoc.markModified('order_items');
  await orderDoc.save();
  return toPlain(orderDoc.toObject());
}

function assertDispatchItemQuantities(order, dispatchItems, alreadyDispatchedByLine = {}) {
  for (const raw of dispatchItems || []) {
    const orderItemId = String(raw.order_item_id);
    const line = (order.order_items || []).find((item) => String(item._id) === orderItemId);
    if (!line) throw new ApiError(400, `Unknown order_item_id ${orderItemId}`);

    const q = lineQuantities(line);
    const requested = Number(raw.dispatched_quantity ?? raw.dispatch_quantity ?? 0);
    const already = Number(alreadyDispatchedByLine[orderItemId] || 0);

    if (requested < 0) throw new ApiError(400, 'Dispatch quantities cannot be negative');
    if (requested === 0) throw new ApiError(400, 'Dispatch quantity must be greater than zero');

    const maxAllowed = q.approved > 0 ? q.approved : q.ordered;
    if (already + requested > maxAllowed) {
      throw new ApiError(
        400,
        `Dispatch quantity exceeds available approved quantity (${Math.max(0, maxAllowed - already)} remaining) for line ${line.sku || orderItemId}`,
      );
    }
  }
}

async function recalculateFromExecutions(orderId, user) {
  const { Order, OrderDispatch, TransportShipment } = getModels();

  await syncDispatchDeliveredFromShipments(orderId);

  const [orderDoc, dispatches, shipments] = await Promise.all([
    Order.findById(orderId),
    OrderDispatch.find({ order: orderId, deletedAt: null, dispatch_status: { $ne: 'cancelled' } }).lean(),
    TransportShipment.find({
      order: orderId,
      deletedAt: null,
      shipment_status: { $nin: ['delivery_failed', 'returned'] },
    }).lean(),
  ]);

  if (!orderDoc) throw new ApiError(404, 'Order not found');

  const dispatchedByLine = aggregateDispatchedByLine(dispatches);
  const deliveredByLine = aggregateDeliveredByLine(dispatches);

  const nextItems = (orderDoc.order_items || []).map((line) => {
    const item = line.toObject ? line.toObject() : { ...line };
    const key = String(item._id);
    item.dispatched_quantity = dispatchedByLine[key] || 0;
    item.delivered_quantity = deliveredByLine[key] || 0;

    const q = lineQuantities(item);
    if (item.dispatched_quantity > q.dispatchCap && q.dispatchCap > 0) {
      throw new ApiError(
        400,
        `Dispatched quantity exceeds approved quantity (${q.dispatchCap}) for line ${item.sku || key}`,
      );
    }
    item.line_status = deriveLineStatus({ ...q, dispatched: item.dispatched_quantity, delivered: item.delivered_quantity });
    return item;
  });

  const totalDispatched = nextItems.reduce((sum, item) => sum + Number(item.dispatched_quantity || 0), 0);
  const totalDelivered = nextItems.reduce((sum, item) => sum + Number(item.delivered_quantity || 0), 0);
  const totalApproved = nextItems.reduce((sum, item) => sum + Number(item.approved_quantity || 0), 0);

  const fullyDispatched =
    nextItems.length > 0 &&
    nextItems.every((item) => {
      const q = lineQuantities(item);
      return Number(item.dispatched_quantity || 0) >= q.dispatchCap && q.dispatchCap > 0;
    });

  const fullyDelivered =
    nextItems.length > 0 &&
    nextItems.every((item) => {
      const q = lineQuantities(item);
      return Number(item.delivered_quantity || 0) >= q.dispatchCap && q.dispatchCap > 0;
    });

  orderDoc.order_items = nextItems;
  orderDoc.dispatch_status = totalDispatched === 0 ? 'pending' : fullyDispatched ? 'completed' : 'partial';
  orderDoc.delivery_status = totalDelivered === 0 ? 'pending' : fullyDelivered ? 'completed' : 'partial';
  orderDoc.finance_approval_status = deriveFinanceApprovalStatus(nextItems);

  if (totalDispatched > 0) {
    orderDoc.workflow_stage = orderDoc.workflow_stage === 'completed' ? 'completed' : 'dispatch_execution';
    orderDoc.current_action = fullyDispatched ? 'full_dispatch' : 'partial_dispatch';
    if (fullyDelivered) {
      orderDoc.lifecycle_status = 'fulfilled';
      orderDoc.workflow_stage = 'completed';
      orderDoc.current_action = 'delivered';
    } else if (orderDoc.lifecycle_status !== 'cancelled' && orderDoc.lifecycle_status !== 'on_hold') {
      orderDoc.lifecycle_status = totalDelivered > 0 || totalDispatched > 0 ? 'partially_fulfilled' : orderDoc.lifecycle_status;
    }
  } else if (totalApproved > 0) {
    applyFinanceWorkflowAction(orderDoc);
  }

  if (user?._id) orderDoc.updated_by = user._id;
  orderDoc.markModified('order_items');
  await orderDoc.save();

  const plain = toPlain(orderDoc.toObject());
  return {
    order: plain,
    snapshot: buildOrderSnapshot(plain, dispatches, shipments),
    fullyDispatched,
    fullyDelivered,
  };
}

async function getSnapshot(orderId) {
  const { Order, OrderDispatch, TransportShipment } = getModels();
  const order = await Order.findById(orderId).lean();
  if (!order) throw new ApiError(404, 'Order not found');

  const [dispatches, shipments] = await Promise.all([
    OrderDispatch.find({ order: orderId, deletedAt: null }).sort({ createdAt: -1 }).lean(),
    TransportShipment.find({ order: orderId, deletedAt: null }).sort({ createdAt: -1 }).lean(),
  ]);

  return buildOrderSnapshot(toPlain(order), dispatches.map(toPlain), shipments.map(toPlain));
}

async function getRemainingFinanceQuantities(orderId) {
  const order = await getModels().Order.findById(orderId).lean();
  if (!order) throw new ApiError(404, 'Order not found');

  return (order.order_items || []).map((line) => {
    const q = lineQuantities(line);
    return {
      order_item_id: String(line._id),
      product: line.product,
      product_name: line.product_name,
      ordered_quantity: q.ordered,
      approved_quantity: q.approved,
      remaining_quantity: q.pendingFinance,
    };
  });
}

module.exports = {
  lineQuantities,
  deriveFinanceApprovalStatus,
  financeWorkflowAction,
  applyFinanceWorkflowAction,
  deriveLineStatus,
  aggregateDispatchedByLine,
  buildOrderSnapshot,
  buildStatusDimensions,
  recomputeApprovedQuantitiesFromFinance,
  assertDispatchItemQuantities,
  recalculateFromExecutions,
  syncDispatchDeliveredFromShipments,
  getSnapshot,
  getRemainingFinanceQuantities,
};
