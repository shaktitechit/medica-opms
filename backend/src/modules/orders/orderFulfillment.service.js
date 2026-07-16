/**
 * @fileoverview Central quantity ledger and fulfillment snapshot for orders.
 * Rolls up finance-approved, dispatched, and delivered quantities from execution documents.
 * @module modules/orders/orderFulfillment.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const { lineAtWarehouseQty, computeLineDispatchAvailability, aggregateReceivedReturnsByOrderLine, aggregateReportedReturnsByOrderLine } = require('../../utils/returnSettlement');
const {
  ORDER_LINE_STATUS,
  ORDER_WORKFLOW_STAGE,
  ORDER_LIFECYCLE_STATUS,
  ORDER_STATUS,
  APPROVAL_STATUS,
  FULFILLMENT_STATUS,
  normalizeFinanceApprovalStatus,
  normalizeWorkflowStage,
  normalizeOrderWorkflowFields,
} = require('./order.constants');

function lineQuantities(line) {
  const ordered = Number(line.ordered_quantity ?? line.quantity ?? 0);
  const approved = Number(line.approved_quantity ?? 0);
  const dispatched = Number(line.dispatched_quantity ?? 0);
  const delivered = Number(line.delivered_quantity ?? 0);
  const returned = Number(line.returned_quantity ?? 0);
  const dispatchCap = approved > 0 ? approved : ordered;
  const netBillable = Math.max(0, dispatchCap - returned);

  return {
    ordered,
    approved,
    dispatched,
    delivered,
    returned,
    dispatchCap,
    netBillable,
    pendingFinance: Math.max(0, ordered - approved),
    pendingDispatch: Math.max(0, approved - dispatched),
    pendingDelivery: Math.max(0, dispatched - delivered),
    // Snapshot compatibility for existing API consumers
    salesApproved: approved > 0 ? approved : ordered,
    allocated: 0,
    cancelled: 0,
    financeApproved: approved,
  };
}

function deriveFinanceApprovalStatus(items) {
  const lines = items || [];
  if (lines.length === 0) return APPROVAL_STATUS.PENDING;

  let hasApproved = false;
  let allComplete = true;

  for (const line of lines) {
    const q = lineQuantities(line);
    if (q.ordered <= 0) continue;
    if (q.approved > 0) hasApproved = true;
    if (q.approved < q.ordered) allComplete = false;
  }

  if (!hasApproved) return APPROVAL_STATUS.PENDING;
  if (allComplete) return APPROVAL_STATUS.APPROVED;
  return APPROVAL_STATUS.PARTIAL;
}

function financeWorkflowAction(orderDoc) {
  const fas = normalizeFinanceApprovalStatus(orderDoc.finance_approval_status)
    || deriveFinanceApprovalStatus(orderDoc.order_items);
  if (fas === APPROVAL_STATUS.APPROVED) return ORDER_STATUS.FINANCE_APPROVED;
  if (fas === APPROVAL_STATUS.PARTIAL) return ORDER_STATUS.FINANCE_APPROVED;
  if (fas === APPROVAL_STATUS.REJECTED) return ORDER_STATUS.FINANCE_REJECTED;
  return ORDER_STATUS.FINANCE_REVIEW;
}

function normalizeAccountApprovalStatus(status) {
  const s = String(status || APPROVAL_STATUS.PENDING);
  if (s === 'full') return APPROVAL_STATUS.APPROVED;
  return s;
}

function accountClearedQty(line, accountApprovalStatus) {
  const approved = Number(line.approved_quantity ?? 0);
  const aas = normalizeAccountApprovalStatus(accountApprovalStatus);
  if (aas === APPROVAL_STATUS.REJECTED) return 0;
  if ([APPROVAL_STATUS.APPROVED, APPROVAL_STATUS.PARTIAL].includes(aas)) return approved;
  return 0;
}

/** Keep account clearance visible on order even after dispatch handoff. */
function applyAccountWorkflowAction(orderDoc) {
  if (
    orderDoc.current_action === 'sent_to_dispatch' ||
    orderDoc.status === ORDER_STATUS.DISPATCH
  ) {
    return 'sent_to_dispatch';
  }

  const aas = normalizeAccountApprovalStatus(orderDoc.account_approval_status);
  if ([APPROVAL_STATUS.APPROVED, APPROVAL_STATUS.PARTIAL].includes(aas)) {
    orderDoc.current_action = aas === APPROVAL_STATUS.APPROVED
      ? 'fully_account_approved'
      : 'account_partial';
    if (
      orderDoc.workflow_stage === ORDER_WORKFLOW_STAGE.ACCOUNT_REVIEW ||
      orderDoc.workflow_stage === ORDER_WORKFLOW_STAGE.FINANCE_REVIEW
    ) {
      orderDoc.workflow_stage = ORDER_WORKFLOW_STAGE.DISPATCH;
    }
    orderDoc.status = ORDER_STATUS.ACCOUNT_APPROVED;
    normalizeOrderWorkflowFields(orderDoc);
    return orderDoc.current_action;
  }

  const result = applyFinanceWorkflowAction(orderDoc);
  normalizeOrderWorkflowFields(orderDoc);
  return result;
}

/** Keep finance approval visible on order even after dispatch handoff. */
function applyFinanceWorkflowAction(orderDoc) {
  if (
    orderDoc.current_action === 'sent_to_dispatch' ||
    orderDoc.status === ORDER_STATUS.DISPATCH
  ) {
    return 'sent_to_dispatch';
  }

  const action = financeWorkflowAction(orderDoc);
  const fas = normalizeFinanceApprovalStatus(orderDoc.finance_approval_status)
    || deriveFinanceApprovalStatus(orderDoc.order_items);

  if ([APPROVAL_STATUS.APPROVED, APPROVAL_STATUS.PARTIAL].includes(fas)) {
    orderDoc.current_action = fas === APPROVAL_STATUS.APPROVED ? 'finance_approved' : 'finance_partial';
    if (orderDoc.workflow_stage === ORDER_WORKFLOW_STAGE.FINANCE_REVIEW) {
      orderDoc.workflow_stage = ORDER_WORKFLOW_STAGE.DISPATCH;
    }
    orderDoc.status = ORDER_STATUS.FINANCE_APPROVED;
  } else if (fas === APPROVAL_STATUS.REJECTED) {
    orderDoc.current_action = 'rejected';
    orderDoc.status = ORDER_STATUS.FINANCE_REJECTED;
  }
  normalizeOrderWorkflowFields(orderDoc);
  return action;
}

const DEPARTMENT_LABELS = {
  sales: 'Sales',
  admin_review: 'Admin Review',
  finance_review: 'Finance Review',
  account_review: 'Account Review',
  dispatch: 'Dispatch',
  completed: 'Completed',
  cancelled: 'Cancelled',
  on_hold: 'On Hold',
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
  const stage = normalizeWorkflowStage(orderPlain.workflow_stage);
  const pendingRole = orderPlain.pending_with_role || orderPlain.current_department || '';
  const action = orderPlain.current_action || '';
  const fas = normalizeFinanceApprovalStatus(orderPlain.finance_approval_status)
    || deriveFinanceApprovalStatus(orderPlain.order_items);
  const dispatchStatus = orderPlain.dispatch_status || FULFILLMENT_STATUS.PENDING;
  const deliveryStatus = orderPlain.delivery_status || FULFILLMENT_STATUS.PENDING;

  let departmental = { key: stage || 'unknown', label: DEPARTMENT_LABELS[stage] || titleCaseToken(stage), tone: 'info' };
  if (lifecycle === ORDER_LIFECYCLE_STATUS.CANCELLED || stage === ORDER_WORKFLOW_STAGE.CANCELLED) {
    departmental = { key: 'cancelled', label: 'Cancelled', tone: 'danger' };
  } else if (lifecycle === ORDER_LIFECYCLE_STATUS.ON_HOLD || stage === ORDER_WORKFLOW_STAGE.ON_HOLD) {
    departmental = {
      key: 'on_hold',
      label: 'On Hold',
      detail: pendingRole ? `With ${titleCaseToken(pendingRole)}` : undefined,
      tone: 'warning',
    };
  } else if (stage === ORDER_WORKFLOW_STAGE.COMPLETED || lifecycle === ORDER_LIFECYCLE_STATUS.FULFILLED) {
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
  if (deliveryStatus === FULFILLMENT_STATUS.COMPLETED || (delivered > 0 && pendingDelivery === 0 && dispatched > 0)) {
    fulfillment = {
      key: 'fulfilled',
      label: 'Fully delivered',
      detail: `${delivered} / ${approved || ordered} qty delivered`,
      tone: 'success',
    };
  } else if (deliveryStatus === FULFILLMENT_STATUS.PARTIAL || delivered > 0) {
    fulfillment = {
      key: 'partial_delivery',
      label: 'Partially delivered',
      detail: `${delivered} delivered · ${pendingDelivery} pending delivery`,
      tone: 'info',
    };
  } else if (dispatchStatus === FULFILLMENT_STATUS.COMPLETED || (dispatched > 0 && pendingDispatch === 0 && approved > 0)) {
    fulfillment = {
      key: 'full_dispatch',
      label: 'Fully dispatched',
      detail: `${dispatched} / ${approved} approved qty dispatched`,
      tone: 'success',
    };
  } else if (dispatchStatus === FULFILLMENT_STATUS.PARTIAL || dispatched > 0) {
    fulfillment = {
      key: 'partial_dispatch',
      label: 'Partially dispatched',
      detail: `${dispatched} dispatched · ${pendingDispatch} pending dispatch`,
      tone: 'info',
    };
  } else if (fas === APPROVAL_STATUS.APPROVED) {
    fulfillment = {
      key: 'finance_full',
      label: 'Fully finance approved',
      detail: `${approved} / ${ordered} qty approved`,
      tone: 'success',
    };
  } else if (fas === APPROVAL_STATUS.PARTIAL || approved > 0) {
    fulfillment = {
      key: 'finance_partial',
      label: 'Partially finance approved',
      detail: `${approved} approved · ${pendingFinance} pending finance`,
      tone: 'warning',
    };
  } else if (fas === APPROVAL_STATUS.REJECTED) {
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
  const fas = normalizeFinanceApprovalStatus(orderPlain.finance_approval_status)
    || deriveFinanceApprovalStatus(orderPlain.order_items);
  const pendingFinance = Number(totals.pendingFinance || 0);
  const approved = Number(totals.approved || 0);
  const stage = normalizeWorkflowStage(orderPlain.workflow_stage);

  return {
    finance_approval_status: fas,
    display_status:
      fas === APPROVAL_STATUS.APPROVED
        ? ORDER_STATUS.FINANCE_APPROVED
        : fas === APPROVAL_STATUS.PARTIAL
          ? ORDER_STATUS.FINANCE_APPROVED
          : fas === APPROVAL_STATUS.REJECTED
            ? ORDER_STATUS.FINANCE_REJECTED
            : ORDER_STATUS.FINANCE_REVIEW,
    pending_finance_qty: pendingFinance,
    approved_qty: approved,
    ordered_qty: Number(totals.ordered || 0),
    can_approve_remaining: fas === APPROVAL_STATUS.PARTIAL && pendingFinance > 0,
    can_send_to_dispatch:
      approved > 0 &&
      fas !== APPROVAL_STATUS.REJECTED &&
      orderPlain.current_action !== 'sent_to_dispatch' &&
      orderPlain.status !== ORDER_STATUS.DISPATCH &&
      ![ORDER_WORKFLOW_STAGE.DISPATCH, ORDER_WORKFLOW_STAGE.COMPLETED].includes(stage),
    is_partially_finance_approved: fas === APPROVAL_STATUS.PARTIAL,
    is_fully_finance_approved: fas === APPROVAL_STATUS.APPROVED,
  };
}

function deriveLineStatus(q) {
  const cap = q.dispatchCap > 0 ? q.dispatchCap : q.ordered;
  const returned = Number(q.returned || 0);
  const netTarget = Math.max(0, cap - returned);

  if (returned > 0 && netTarget <= 0) return ORDER_LINE_STATUS.CANCELLED;
  if (netTarget > 0 && q.delivered >= netTarget) return ORDER_LINE_STATUS.FULFILLED;
  if (q.delivered > 0 || q.dispatched > 0 || returned > 0) return ORDER_LINE_STATUS.PARTIAL;
  return ORDER_LINE_STATUS.ACTIVE;
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

function findApprovalItemForOrderLine(approval, line) {
  if (!approval) return null;
  const lineId = String(line._id);
  const productId = String(line.product?._id || line.product || '');

  for (const item of approval.approval_items || []) {
    if (String(item.order_item_id) === lineId) return item;
  }
  if (productId) {
    for (const item of approval.approval_items || []) {
      const itemProductId = String(item.product?._id || item.product || '');
      if (itemProductId === productId) return item;
    }
  }
  return null;
}

function resolveStoredOrderLineId(order, storedLineId, productId, approval) {
  if (storedLineId) {
    const byId = (order.order_items || []).find((item) => String(item._id) === storedLineId);
    if (byId) return String(byId._id);
  }
  if (productId) {
    const byProduct = (order.order_items || []).find(
      (item) => String(item.product?._id || item.product) === productId,
    );
    if (byProduct) return String(byProduct._id);
  }
  if (approval && storedLineId) {
    const approvalItem = (approval.approval_items || []).find(
      (item) => String(item.order_item_id) === storedLineId,
    );
    const approvalProductId = String(approvalItem?.product?._id || approvalItem?.product || '');
    if (approvalProductId) {
      const byApprovalProduct = (order.order_items || []).find(
        (item) => String(item.product?._id || item.product) === approvalProductId,
      );
      if (byApprovalProduct) return String(byApprovalProduct._id);
    }
  }
  return storedLineId;
}

function aggregateDispatchedByLineForRelease(dispatches, approvalId, excludeDispatchId = null, order = null, approval = null) {
  const byLine = {};
  if (!approvalId) return byLine;

  for (const dispatch of dispatches || []) {
    if (dispatch.dispatch_status === 'cancelled') continue;
    if (excludeDispatchId && String(dispatch._id) === String(excludeDispatchId)) continue;

    const approvalRef = dispatch.finance_approval;
    const dispatchApprovalId =
      approvalRef && typeof approvalRef === 'object'
        ? String(approvalRef._id ?? approvalRef.id ?? '')
        : String(approvalRef ?? '');
    if (dispatchApprovalId !== String(approvalId)) continue;

    for (const item of dispatch.dispatch_items || []) {
      const storedId = String(item.order_item_id);
      const productId = String(item.product?._id || item.product || '');
      const key = order
        ? resolveStoredOrderLineId(order, storedId, productId, approval)
        : storedId;
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

function buildLineSnapshot(line, accountApprovalStatus) {
  const q = lineQuantities(line);
  const accountCleared = accountClearedQty(line, accountApprovalStatus);
  const pendingAccount = Math.max(0, q.approved - accountCleared);
  const dispatchCap = accountCleared > 0 ? accountCleared : q.dispatchCap;
  const pendingDispatch = Math.max(0, dispatchCap - q.dispatched);
  return {
    order_item_id: String(line._id),
    product: line.product,
    product_name: line.product_name,
    sku: line.sku,
    ...q,
    accountCleared,
    account_cleared: accountCleared,
    pendingAccount,
    pending_account: pendingAccount,
    pendingDispatch: accountCleared > 0 ? pendingDispatch : q.pendingDispatch,
    line_status: deriveLineStatus({ ...q, dispatchCap }),
  };
}

function buildOrderSnapshot(orderPlain, dispatches, shipments) {
  const accountApprovalStatus = normalizeAccountApprovalStatus(orderPlain.account_approval_status);
  const lines = (orderPlain.order_items || []).map((line) => buildLineSnapshot(line, accountApprovalStatus));
  const totals = lines.reduce(
    (acc, line) => {
      acc.ordered += line.ordered;
      acc.salesApproved += line.salesApproved;
      acc.approved += line.approved;
      acc.accountCleared += line.accountCleared;
      acc.dispatched += line.dispatched;
      acc.delivered += line.delivered;
      acc.returned += line.returned;
      acc.pendingAdmin += line.pendingFinance;
      acc.pendingFinance += line.pendingFinance;
      acc.pendingAccount += line.pendingAccount;
      acc.pendingDispatch += line.pendingDispatch;
      acc.pendingDelivery += line.pendingDelivery;
      return acc;
    },
    {
      ordered: 0,
      salesApproved: 0,
      approved: 0,
      accountCleared: 0,
      dispatched: 0,
      delivered: 0,
      returned: 0,
      pendingAdmin: 0,
      pendingFinance: 0,
      pendingAccount: 0,
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
    account_approval_status: accountApprovalStatus,
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

async function syncDispatchDeliveredFromDeliveries(orderId) {
  const { OrderDispatch, OrderDelivery, OrderReturn } = getModels();
  const [deliveries, returns] = await Promise.all([
    OrderDelivery.find({
      order: orderId,
      deletedAt: null,
      delivery_status: 'delivered',
    }).lean(),
    OrderReturn.find({
      order: orderId,
      deletedAt: null,
      return_status: { $ne: 'cancelled' },
    }).lean(),
  ]);

  if (deliveries.length === 0 && returns.length === 0) return false;

  const deliveredByDispatchProduct = {};
  for (const delivery of deliveries) {
    const dispatchKey = String(delivery.dispatch);
    if (!deliveredByDispatchProduct[dispatchKey]) {
      deliveredByDispatchProduct[dispatchKey] = {};
    }
    for (const item of delivery.delivery_items || []) {
      const productKey = String(item.product?._id ?? item.product ?? '');
      if (!productKey) continue;
      deliveredByDispatchProduct[dispatchKey][productKey] =
        (deliveredByDispatchProduct[dispatchKey][productKey] || 0) +
        Number(item.delivered_quantity || 0);
    }
  }

  const returnedByDispatchProduct = {};
  for (const ret of returns) {
    const dispatchKey = String(ret.dispatch);
    if (!returnedByDispatchProduct[dispatchKey]) {
      returnedByDispatchProduct[dispatchKey] = {};
    }
    for (const item of ret.return_items || []) {
      const productKey = String(item.product?._id ?? item.product ?? '');
      if (!productKey) continue;
      returnedByDispatchProduct[dispatchKey][productKey] =
        (returnedByDispatchProduct[dispatchKey][productKey] || 0) +
        Number(item.returned_quantity || 0);
    }
  }

  const dispatches = await OrderDispatch.find({
    order: orderId,
    deletedAt: null,
    dispatch_status: { $ne: 'cancelled' },
  });

  for (const dispatch of dispatches) {
    const dispatchKey = String(dispatch._id);
    const productMap = deliveredByDispatchProduct[dispatchKey] || {};
    const returnMap = returnedByDispatchProduct[dispatchKey] || {};

    let changed = false;
    for (const item of dispatch.dispatch_items || []) {
      const productKey = String(item.product?._id ?? item.product ?? '');
      const dispatched = Number(item.dispatched_quantity || 0);

      const targetDelivered = Math.min(dispatched, Number(productMap[productKey] || 0));
      if (Number(item.delivered_quantity || 0) !== targetDelivered) {
        item.delivered_quantity = targetDelivered;
        changed = true;
      }

      const targetReturned = Math.min(dispatched, Number(returnMap[productKey] || 0));
      if (Number(item.returned_quantity || 0) !== targetReturned) {
        item.returned_quantity = targetReturned;
        changed = true;
      }
    }

    if (changed) await dispatch.save();
  }

  return true;
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
      if (Number(item.returned_quantity || 0) !== 0) {
        item.returned_quantity = 0;
        changed = true;
      }
    }
    if (changed) await dispatch.save();
  }
}

/** Prefer OrderDelivery records; fall back to transport shipment status for legacy flows. */
async function syncDispatchDeliveredQuantities(orderId) {
  const syncedFromDeliveries = await syncDispatchDeliveredFromDeliveries(orderId);
  if (!syncedFromDeliveries) {
    await syncDispatchDeliveredFromShipments(orderId);
  }
}

async function recomputeApprovedQuantitiesFromFinance(orderId) {
  const { Order, OrderApproval } = getModels();
  const orderDoc = await Order.findById(orderId);
  if (!orderDoc) throw new ApiError(404, 'Order not found');

  const approvals = await OrderApproval.find({
    order: orderId,
    deletedAt: null,
    is_finance_approved: true,
  })
    .sort({ revision_number: -1, createdAt: -1 })
    .lean();

  const approvedByLine = {};
  const priceByLine = {};
  const latestApproval = approvals[0];
  if (latestApproval) {
    for (const item of latestApproval.approval_items || []) {
      const key = String(item.order_item_id);
      approvedByLine[key] = Number(item.approved_quantity || 0);
      if (item.approved_unit_price != null) {
        priceByLine[key] = Number(item.approved_unit_price);
      }
    }
  }

  for (const line of orderDoc.order_items || []) {
    const key = String(line._id);
    const ordered = Number(line.ordered_quantity ?? line.quantity ?? 0);
    const cap = ordered;
    line.approved_quantity = Math.min(cap, approvedByLine[key] || 0);
    if (priceByLine[key] != null && line.approved_quantity > 0) {
      line.unit_price = priceByLine[key];
    }
  }

  if (approvals.length > 0) {
    orderDoc.last_finance_approval = approvals[0]._id;
  }
  orderDoc.finance_approval_status = deriveFinanceApprovalStatus(orderDoc.order_items);
  orderDoc.markModified('order_items');
  normalizeOrderWorkflowFields(orderDoc);
  await orderDoc.save();
  return toPlain(orderDoc.toObject());
}

function assertDispatchItemQuantities(order, dispatchItems, alreadyDispatchedByLine = {}, options = {}) {
  const { approval, returnsByLine = {}, approvalOnly = false } = options;

  for (const raw of dispatchItems || []) {
    const orderItemId = String(raw.order_item_id);
    const line = (order.order_items || []).find((item) => String(item._id) === orderItemId);
    if (!line) throw new ApiError(400, `Unknown order_item_id ${orderItemId}`);

    const q = lineQuantities(line);
    const requested = Number(raw.dispatched_quantity ?? raw.dispatch_quantity ?? 0);
    const already = Number(alreadyDispatchedByLine[orderItemId] || 0);

    if (requested < 0) throw new ApiError(400, 'Dispatch quantities cannot be negative');
    if (requested === 0) throw new ApiError(400, 'Dispatch quantity must be greater than zero');

    if (approval) {
      const approvalItem = findApprovalItemForOrderLine(approval, line);
      const approvedOnRelease = Number(approvalItem?.approved_quantity || 0);
      const atWarehouse = approvalOnly
        ? 0
        : lineAtWarehouseQty(orderItemId, approvalItem, line, returnsByLine);
      const { available } = computeLineDispatchAvailability(approvedOnRelease, already, atWarehouse);

      if (requested > available) {
        throw new ApiError(
          400,
          `Dispatch quantity exceeds available quantity (${available} available) for line ${line.sku || orderItemId}`,
        );
      }
      continue;
    }

    let maxAllowed = q.approved > 0 ? q.approved : q.ordered;
    const returnHeadroom = lineAtWarehouseQty(orderItemId, null, line, returnsByLine);
    maxAllowed += returnHeadroom;
    const available = Math.max(0, maxAllowed - already);

    if (requested > available) {
      throw new ApiError(
        400,
        `Dispatch quantity exceeds available quantity (${available} available) for line ${line.sku || orderItemId}`,
      );
    }
  }
}

async function recalculateFromExecutions(orderId, user) {
  const { Order, OrderDispatch, TransportShipment } = getModels();

  await syncDispatchDeliveredQuantities(orderId);

  const [orderDoc, dispatches, shipments, returns] = await Promise.all([
    Order.findById(orderId),
    OrderDispatch.find({ order: orderId, deletedAt: null, dispatch_status: { $ne: 'cancelled' } }).lean(),
    TransportShipment.find({
      order: orderId,
      deletedAt: null,
      shipment_status: { $nin: ['delivery_failed', 'returned'] },
    }).lean(),
    getModels().OrderReturn.find({ order: orderId, deletedAt: null }).lean(),
  ]);

  if (!orderDoc) throw new ApiError(404, 'Order not found');

  const dispatchedByLine = aggregateDispatchedByLine(dispatches);
  const deliveredByLine = aggregateDeliveredByLine(dispatches);
  const returnedByLine = aggregateReceivedReturnsByOrderLine(returns, dispatches);

  const nextItems = (orderDoc.order_items || []).map((line) => {
    const item = line.toObject ? line.toObject() : { ...line };
    const key = String(item._id);
    item.dispatched_quantity = dispatchedByLine[key] || 0;
    item.delivered_quantity = deliveredByLine[key] || 0;

    const q = lineQuantities(item);
    const returnAtWarehouse = Number(returnedByLine[key] || 0) || Number(item.returned_quantity ?? 0);
    const returnPoolUsed = Math.max(0, item.dispatched_quantity - (q.dispatchCap > 0 ? q.dispatchCap : q.ordered));
    const dispatchCap = (q.dispatchCap > 0 ? q.dispatchCap : q.ordered) + returnAtWarehouse + returnPoolUsed;
    if (item.dispatched_quantity > dispatchCap && dispatchCap > 0) {
      throw new ApiError(
        400,
        `Dispatched quantity exceeds available quantity (${dispatchCap}) for line ${item.sku || key}`,
      );
    }
    item.line_status = deriveLineStatus({
      ...q,
      dispatched: item.dispatched_quantity,
      delivered: item.delivered_quantity,
      returned: item.returned_quantity,
    });
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
  orderDoc.dispatch_status = totalDispatched === 0
    ? FULFILLMENT_STATUS.PENDING
    : fullyDispatched
      ? FULFILLMENT_STATUS.COMPLETED
      : FULFILLMENT_STATUS.PARTIAL;
  orderDoc.delivery_status = totalDelivered === 0
    ? FULFILLMENT_STATUS.PENDING
    : fullyDelivered
      ? FULFILLMENT_STATUS.COMPLETED
      : FULFILLMENT_STATUS.PARTIAL;
  orderDoc.finance_approval_status = deriveFinanceApprovalStatus(nextItems);

  const isOrderClosed =
    orderDoc.status === ORDER_STATUS.CLOSED || Boolean(orderDoc.closed_at);

  if (!isOrderClosed) {
    if (totalDispatched > 0) {
      orderDoc.workflow_stage = orderDoc.workflow_stage === ORDER_WORKFLOW_STAGE.COMPLETED
        ? ORDER_WORKFLOW_STAGE.COMPLETED
        : ORDER_WORKFLOW_STAGE.DISPATCH;
      orderDoc.status = ORDER_STATUS.DISPATCH;
      orderDoc.current_action = fullyDispatched ? 'full_dispatch' : 'partial_dispatch';
      if (fullyDelivered) {
        orderDoc.lifecycle_status = ORDER_LIFECYCLE_STATUS.FULFILLED;
        orderDoc.workflow_stage = ORDER_WORKFLOW_STAGE.COMPLETED;
        orderDoc.status = ORDER_STATUS.DELIVERED;
        orderDoc.current_action = 'delivered';
      } else if (
        orderDoc.lifecycle_status !== ORDER_LIFECYCLE_STATUS.CANCELLED &&
        orderDoc.lifecycle_status !== ORDER_LIFECYCLE_STATUS.ON_HOLD
      ) {
        orderDoc.lifecycle_status = totalDelivered > 0 || totalDispatched > 0
          ? ORDER_LIFECYCLE_STATUS.PARTIALLY_FULFILLED
          : orderDoc.lifecycle_status;
      }
    } else if (totalApproved > 0) {
      const aas = normalizeAccountApprovalStatus(orderDoc.account_approval_status);
      if ([APPROVAL_STATUS.APPROVED, APPROVAL_STATUS.PARTIAL].includes(aas)) {
        applyAccountWorkflowAction(orderDoc);
      } else {
        applyFinanceWorkflowAction(orderDoc);
      }
    }
  }

  if (user?._id) orderDoc.updated_by = user._id;
  orderDoc.markModified('order_items');
  normalizeOrderWorkflowFields(orderDoc);
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

async function syncOrderLineReturnedQuantitiesFromReturns(orderId) {
  const { Order, OrderReturn, OrderDispatch } = getModels();
  const orderDoc = await Order.findById(orderId);
  if (!orderDoc) return false;

  const [returns, dispatches] = await Promise.all([
    OrderReturn.find({ order: orderId, deletedAt: null }).lean(),
    OrderDispatch.find({
      order: orderId,
      deletedAt: null,
      dispatch_status: { $ne: 'cancelled' },
    }).lean(),
  ]);

  const byLine = aggregateReportedReturnsByOrderLine(returns, dispatches);
  let changed = false;

  for (const line of orderDoc.order_items || []) {
    const key = String(line._id);
    const next = Number(byLine[key] || 0);
    if (Number(line.returned_quantity || 0) !== next) {
      line.returned_quantity = next;
      changed = true;
    }
  }

  if (changed) {
    normalizeOrderWorkflowFields(orderDoc);
    await orderDoc.save();
  }

  return changed;
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
  applyAccountWorkflowAction,
  normalizeAccountApprovalStatus,
  deriveLineStatus,
  aggregateDispatchedByLine,
  aggregateDispatchedByLineForRelease,
  buildOrderSnapshot,
  buildStatusDimensions,
  recomputeApprovedQuantitiesFromFinance,
  assertDispatchItemQuantities,
  recalculateFromExecutions,
  syncOrderLineReturnedQuantitiesFromReturns,
  syncDispatchDeliveredQuantities,
  syncDispatchDeliveredFromShipments,
  getSnapshot,
  getRemainingFinanceQuantities,
};
