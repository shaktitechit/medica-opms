/**
 * @fileoverview Order CRUD, commercial recalculation, status transitions (via workflow), and soft-delete lifecycle.
 * @module modules/orders/order.service
 *
 * PATCH must not change `status` or other workflow-managed fields — use `POST .../transition` only.
 */
const mongoose = require('mongoose');
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const { generateOrderNo } = require('../../utils/generateOrderNo');
const { softDeleteActiveById, restoreSoftDeletedById, listDeletedLean } = require('../../utils/mongoSoftDelete');
const workflowService = require('../workflow/workflow.service');
const policy = require('./order.policy');
const activityService = require('../activity/activity.service');
const { ORDER_STATUS_VALUES } = require('../../constants/orderStatus');
const {
  ORDER_RETURN_STATUS,
  isReturnPending,
  isReturnReceivedAtWarehouse,
} = require('../../constants/orderReturnStatus');
const { syncPartyProductLastRatesFromOrder } = require('../../services/opms/partyProductLastRateSync');
const partyProductService = require('../partyProducts/partyProduct.service');
const partyOrderProductsRateService = require('../partyOrderProductsRate/partyOrderProductsRate.service');
const fulfillmentService = require('./orderFulfillment.service');
const orderQueue = require('../../queues/order.queue');
const assigneeService = require('./orderAssignee.service');
const {
  normalizePendingStage,
  findOrderIdsWithPendingApproval,
  findOrderIdsWithAnyPendingApproval,
  isAnyPendingApprovalStatus,
  enrichOrdersWithApprovalPending,
} = require('./orderApprovalPending.util');
const {
  ORDER_LINE_STATUS,
  ORDER_LINE_STATUS_VALUES,
  ORDER_WORKFLOW_STAGE,
  ORDER_LIFECYCLE_STATUS,
  ORDER_STATUS,
  APPROVAL_STATUS,
  FULFILLMENT_STATUS,
  ORDER_JOB_TYPES,
  normalizeFinanceApprovalStatus,
  normalizeWorkflowStage,
} = require('./order.constants');
const {
  ASSIGNED_USER_ORDER_FIELDS,
  resolveWorkflowAssigneeUserId,
  applyOrderVisibilityFilter,
  applyOrderAccessFilter,
  appendOrderVisibilityAnd,
} = require('./orderAssignee.util');

/**
 * PATCH may only contain these plain fields. Everything else must go through `/transition`.
 * Blocks Mongo operators like `{ "$set": { status: … } }` (spread + doc.set bypassed blacklist).
 */
const PAYMENT_STATUS_VALUES = new Set(['unpaid', 'partial', 'paid']);

const ORDER_PATCH_KEYS = new Set([
  'party',
  'order_date',
  'payment_status',
  'notes',
  'order_items',
  'discount_amount',
  'priority',
  'expected_delivery_date',
  'remarks',
  'assigned_sales_user',
]);

function assertSafePlainPatch(patch) {
  if (patch === null || patch === undefined) return;
  if (typeof patch !== 'object' || Array.isArray(patch)) {
    throw new ApiError(400, 'PATCH body must be a JSON object');
  }
  for (const key of Object.keys(patch)) {
    if (key.includes('$') || key.includes('.')) {
      throw new ApiError(
        400,
        `Invalid PATCH key "${key}". Mongo-style operators are not allowed; use POST /api/orders/:id/transition for status changes.`
      );
    }
    if (!ORDER_PATCH_KEYS.has(key)) {
      throw new ApiError(
        400,
        `Unsupported PATCH field "${key}". Allowed: ${[...ORDER_PATCH_KEYS].sort().join(', ')}. Use POST /api/orders/:id/transition for lifecycle (status).`
      );
    }
  }
}

/**
 * Apply only allowlisted PATCH fields to a live Mongoose document (never touch `status` / operators).
 */
function applyWhitelistedPatchToMongooseDoc(doc, patch) {
  if (patch.party !== undefined) doc.set('party', patch.party || null);
  if (patch.order_date !== undefined)
    doc.set('order_date', patch.order_date ? new Date(patch.order_date) : new Date());
  if (patch.payment_status !== undefined) doc.set('payment_status', patch.payment_status);
  if (patch.notes !== undefined) doc.set('notes', patch.notes);
  if (patch.discount_amount !== undefined) doc.set('discount_amount', Number(patch.discount_amount));
  if (patch.priority !== undefined) doc.set('priority', patch.priority);
  if (patch.expected_delivery_date !== undefined) {
    doc.set('expected_delivery_date', patch.expected_delivery_date ? new Date(patch.expected_delivery_date) : null);
  }
  if (patch.remarks !== undefined) doc.set('remarks', patch.remarks);
  for (const key of ASSIGNED_USER_ORDER_FIELDS) {
    if (patch[key] !== undefined) doc.set(key, patch[key]);
  }
  if (patch.order_items !== undefined) {
    doc.set('order_items', normalizeItems(patch.order_items));
    doc.markModified('order_items');
  }
}

/**
 * Recompute monetary fields from `order.order_items` and header `discount_amount`.
 * Business rule: line taxable base = qty * unit_price − line discount; GST = taxable * gst_percent/100;
 * grand total = subtotal + gst − header discount; then derives payment_status / balance from paid_amount.
 * Mutates line objects and header totals in-place.
 *
 * @param {object} order
 * @returns {object} Same order reference for chaining.
 */

function recalcCommercials(order) {
  let subtotal = 0;
  let gstAmount = 0;
  const isPostFinance = [ORDER_WORKFLOW_STAGE.DISPATCH, ORDER_WORKFLOW_STAGE.COMPLETED].includes(
    normalizeWorkflowStage(order.workflow_stage),
  );

  for (const item of order.order_items || []) {
    const q = isPostFinance ? Number(item.approved_quantity ?? 0) : Number(item.ordered_quantity ?? item.quantity ?? 0);
    const lineGross = q * item.unit_price;
    let disc = Number(item.discount_amount || 0);
    const dp = Number(item.discount_percent || 0);
    if (dp > 0) {
      disc = (lineGross * dp) / 100;
      item.discount_amount = disc;
    }
    const taxable = Math.max(0, lineGross - disc);
    const gst = (taxable * (item.gst_percent ?? 0)) / 100;
    item.taxable_amount = taxable;
    item.gst_amount = gst;
    item.total_amount = taxable + gst;
    subtotal += taxable;
    gstAmount += gst;
  }
  order.subtotal = subtotal;
  order.gst_amount = gstAmount;
  order.grand_total = subtotal + gstAmount - (order.discount_amount || 0);
  return order;
}

/**
 * Recalculate line and header totals after returns are applied at order closure.
 * Uses settled net delivered_quantity on each line (gross delivered minus returned).
 */
function recalcCommercialsForClosure(order) {
  let subtotal = 0;
  let gstAmount = 0;

  for (const item of order.order_items || []) {
    const q = Math.max(0, Number(item.delivered_quantity || 0));

    const lineGross = q * Number(item.unit_price || 0);
    let disc = Number(item.discount_amount || 0);
    const dp = Number(item.discount_percent || 0);
    if (dp > 0) {
      disc = (lineGross * dp) / 100;
      item.discount_amount = disc;
    }
    const taxable = Math.max(0, lineGross - disc);
    const gst = (taxable * (item.gst_percent ?? 0)) / 100;
    item.taxable_amount = taxable;
    item.gst_amount = gst;
    item.total_amount = taxable + gst;
    subtotal += taxable;
    gstAmount += gst;
  }

  order.subtotal = subtotal;
  order.gst_amount = gstAmount;
  const extras =
    Number(order.extra_charges || 0) +
    Number(order.penalty_amount || 0) +
    Number(order.damage_charge || 0);
  order.grand_total = subtotal + gstAmount - Number(order.discount_amount || 0) + extras;
  return order;
}

function isOrderSettlementClosed(doc) {
  if (!doc) return false;
  return String(doc.status || '') === ORDER_STATUS.CLOSED || Boolean(doc.closed_at);
}

/** Account settlement close: fulfilled lifecycle, completed stage, closed queue status. */
function applyOrderSettlementClosedState(doc, user, options = {}) {
  doc.status = ORDER_STATUS.CLOSED;
  doc.lifecycle_status = ORDER_LIFECYCLE_STATUS.FULFILLED;
  doc.workflow_stage = ORDER_WORKFLOW_STAGE.COMPLETED;
  doc.current_action = 'closed';
  doc.dispatch_status = options.dispatch_status || FULFILLMENT_STATUS.COMPLETED;
  doc.delivery_status = options.delivery_status || FULFILLMENT_STATUS.COMPLETED;
  doc.is_locked = true;
  doc.closed_at = new Date();
  doc.closed_by = user._id;
  doc.updated_by = user._id;
  doc.current_revision = Number(doc.current_revision || 1) + 1;
}

/** Persist closed settlement state with audit trail. Idempotent when already closed. */
async function persistOrderSettlementClose(orderId, doc, user, options = {}) {
  if (!doc || isOrderSettlementClosed(doc)) {
    return doc;
  }

  const {
    remarks = 'Account settle & close',
    activityMessage,
    activityExtra = {},
  } = options;
  const { OrderWorkflow, OrderStatusHistory } = getModels();
  const fromStatus = doc.status || ORDER_STATUS.DELIVERED;
  const fromLifecycle = doc.lifecycle_status || ORDER_LIFECYCLE_STATUS.FULFILLED;
  const fromStage = normalizeWorkflowStage(doc.workflow_stage) || ORDER_WORKFLOW_STAGE.DISPATCH;
  const totalNetDelivered = (doc.order_items || []).reduce(
    (sum, line) => sum + Number(line.delivered_quantity || 0),
    0,
  );
  const dept = String(user.department || '');

  applyOrderSettlementClosedState(doc, user, {
    dispatch_status: FULFILLMENT_STATUS.COMPLETED,
    delivery_status: totalNetDelivered > 0
      ? FULFILLMENT_STATUS.COMPLETED
      : FULFILLMENT_STATUS.PARTIAL,
  });
  if (options.closure_remarks) {
    doc.closure_remarks = String(options.closure_remarks).trim();
  }
  await doc.save();

  await OrderStatusHistory.create({
    order: orderId,
    from_status: fromStatus,
    to_status: ORDER_STATUS.CLOSED,
    changed_by: user._id,
    remarks,
  });

  await OrderWorkflow.create({
    order: orderId,
    action_by: user._id,
    role: dept === 'super_admin' ? 'admin' : dept || 'account',
    action: 'closed',
    from_stage: fromStage,
    to_stage: ORDER_WORKFLOW_STAGE.COMPLETED,
    to_status: ORDER_STATUS.CLOSED,
    remarks: options.workflow_remarks || '',
    revision_number: doc.current_revision,
  });

  await activityService.create({
    actor: user._id,
    entity_type: 'order',
    entity_id: String(doc._id),
    action: 'status_changed',
    message: activityMessage || `Order ${doc.order_no} closed after account settlement`,
    old_value: { lifecycle_status: fromLifecycle, status: fromStatus },
    new_value: {
      lifecycle_status: ORDER_LIFECYCLE_STATUS.FULFILLED,
      status: doc.status,
      grand_total: doc.grand_total,
      ...activityExtra,
    },
  });

  return doc;
}

function refId(value) {
  if (value == null) return '';
  if (typeof value === 'object') return String(value._id ?? value.id ?? '');
  return String(value);
}

function aggregateReceivedReturnsByProduct(returns) {
  const map = {};
  for (const ret of returns) {
    if (!isReturnReceivedAtWarehouse(ret.return_status)) continue;
    for (const item of ret.return_items || []) {
      const pid = refId(item.product);
      if (!pid) continue;
      map[pid] = (map[pid] || 0) + Number(item.returned_quantity || 0);
    }
  }
  return map;
}

/** Map received return qty to order line ids via dispatch item linkage. */
function aggregateReceivedReturnsByOrderLine(returns, dispatches) {
  const byLine = {};
  const dispatchById = {};
  for (const dispatch of dispatches || []) {
    dispatchById[refId(dispatch._id ?? dispatch)] = dispatch;
  }

  for (const ret of returns) {
    if (!isReturnReceivedAtWarehouse(ret.return_status)) continue;
    const dispatch = dispatchById[refId(ret.dispatch)];
    if (!dispatch) continue;

    for (const retItem of ret.return_items || []) {
      const productId = refId(retItem.product);
      const qty = Number(retItem.returned_quantity || 0);
      if (!productId || qty <= 0) continue;

      const matching = (dispatch.dispatch_items || []).filter(
        (di) => refId(di.product) === productId,
      );

      if (matching.length === 1) {
        const key = String(matching[0].order_item_id);
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
          const key = String(di.order_item_id);
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

function grossAcceptedQty(line) {
  const delivered = Number(line.delivered_quantity || 0);
  const dispatched = Number(line.dispatched_quantity || 0);
  const approved = Number(line.approved_quantity || 0);
  if (delivered > 0) return delivered;
  if (dispatched > 0) return dispatched;
  return approved;
}

function orderLineId(line) {
  return String(line._id ?? line.id ?? '');
}

function allocateProductReturnsAcrossLines(orderItems, qtyByProduct) {
  const byLine = {};
  const linesByProduct = {};

  for (const line of orderItems || []) {
    const pid = refId(line.product);
    const lineId = orderLineId(line);
    if (!pid || !lineId) continue;
    if (!linesByProduct[pid]) linesByProduct[pid] = [];
    linesByProduct[pid].push({ lineId, gross: grossAcceptedQty(line) });
  }

  for (const [pid, totalReturned] of Object.entries(qtyByProduct || {})) {
    const lines = linesByProduct[pid] || [];
    if (lines.length === 0 || totalReturned <= 0) continue;

    if (lines.length === 1) {
      byLine[lines[0].lineId] = (byLine[lines[0].lineId] || 0) + totalReturned;
      continue;
    }

    const totalGross = lines.reduce((sum, row) => sum + row.gross, 0);
    let allocated = 0;
    lines.forEach((row, idx) => {
      let share;
      if (idx === lines.length - 1) {
        share = totalReturned - allocated;
      } else if (totalGross > 0) {
        share = Math.round((row.gross / totalGross) * totalReturned);
      } else {
        share = Math.floor(totalReturned / lines.length);
      }
      allocated += share;
      byLine[row.lineId] = (byLine[row.lineId] || 0) + share;
    });
  }

  return byLine;
}

function mergeReturnAllocationsToLines(orderItems, returns, dispatches) {
  const fromDispatch = aggregateReceivedReturnsByOrderLine(returns, dispatches);
  const byProduct = aggregateReceivedReturnsByProduct(returns);
  const remainingByProduct = {};

  for (const [pid, total] of Object.entries(byProduct)) {
    let allocated = 0;
    for (const line of orderItems || []) {
      if (refId(line.product) !== pid) continue;
      allocated += fromDispatch[orderLineId(line)] || 0;
    }
    const remaining = total - allocated;
    if (remaining > 0) remainingByProduct[pid] = remaining;
  }

  const fromRemainder = allocateProductReturnsAcrossLines(orderItems, remainingByProduct);
  const merged = { ...fromDispatch };
  for (const [lineId, qty] of Object.entries(fromRemainder)) {
    merged[lineId] = (merged[lineId] || 0) + qty;
  }
  return merged;
}

/** Apply warehouse returns to a line: persist returned qty and settle delivered to net billable. */
function applyReturnSettlementToLine(line, returnedQty) {
  const gross = grossAcceptedQty(line);
  const returned = Math.max(0, Math.min(Number(returnedQty || 0), gross));
  const netQty = Math.max(0, gross - returned);

  line.returned_quantity = returned;
  line.delivered_quantity = netQty;

  if (returned > 0 && netQty === 0) {
    line.line_status = ORDER_LINE_STATUS.CANCELLED;
  } else if (netQty > 0 && netQty >= gross) {
    line.line_status = ORDER_LINE_STATUS.FULFILLED;
  } else if (returned > 0 || netQty < gross) {
    line.line_status = ORDER_LINE_STATUS.PARTIAL;
  } else {
    line.line_status = ORDER_LINE_STATUS.FULFILLED;
  }

  return line;
}

async function syncDispatchDeliveredAfterSettlement(orderId, settledLines) {
  const { OrderDispatch } = getModels();
  const lineById = {};
  for (const line of settledLines) {
    lineById[String(line._id)] = line;
  }

  const dispatches = await OrderDispatch.find({
    order: orderId,
    deletedAt: null,
    dispatch_status: { $ne: 'cancelled' },
  });

  for (const dispatch of dispatches) {
    let changed = false;
    for (const item of dispatch.dispatch_items || []) {
      const settled = lineById[String(item.order_item_id)];
      if (!settled) continue;
      const target = Number(settled.delivered_quantity || 0);
      if (Number(item.delivered_quantity || 0) !== target) {
        item.delivered_quantity = target;
        changed = true;
      }
    }
    if (changed) await dispatch.save();
  }
}

/**
 * Close order after full delivery with no returns: sync delivered qty on lines,
 * recalculate settled totals, and lock the order.
 */
async function closeAfterFullDelivery(id, body, user) {
  const dept = String(user.department || '');
  if (!['dispatch', 'account', 'admin', 'super_admin'].includes(dept)) {
    throw new ApiError(403, 'Not authorized to close order after delivery');
  }

  const { remarks } = body || {};
  const { Order, OrderReturn, TransportShipment, OrderWorkflow, OrderStatusHistory } = getModels();

  let doc = await Order.findById(id);
  if (!doc) throw new ApiError(404, 'Order not found');

  if (isOrderSettlementClosed(doc)) {
    return toPlain(doc.toObject());
  }

  if (String(doc.lifecycle_status || '') === ORDER_LIFECYCLE_STATUS.CANCELLED) {
    return toPlain(doc.toObject());
  }

  const returnCount = await OrderReturn.countDocuments({ order: id, deletedAt: null });
  if (returnCount > 0) {
    throw new ApiError(
      400,
      'Order has return records; close via account after warehouse return receipt',
    );
  }

  await fulfillmentService.recalculateFromExecutions(id, user);
  doc = await Order.findById(id);
  if (!doc) throw new ApiError(404, 'Order not found');

  const shipments = await TransportShipment.find({
    order: id,
    deletedAt: null,
    shipment_status: { $nin: ['delivery_failed', 'returned'] },
  }).lean();

  if (shipments.length === 0) {
    throw new ApiError(400, 'No active transport shipments exist for this order');
  }

  const allShipmentsDelivered = shipments.every((s) => s.shipment_status === 'delivered');
  if (!allShipmentsDelivered) {
    throw new ApiError(400, 'All transport shipments must be marked delivered before closing');
  }

  const fullyDelivered = (doc.order_items || []).every((line) => {
    const q = fulfillmentService.lineQuantities(line);
    return Number(line.delivered_quantity || 0) >= q.dispatchCap && q.dispatchCap > 0;
  });

  if (!fullyDelivered) {
    throw new ApiError(400, 'Order lines are not fully delivered yet');
  }

  const nextItems = (doc.order_items || []).map((line) => {
    const item = line.toObject ? line.toObject() : { ...line };
    item.returned_quantity = 0;
    item.line_status = ORDER_LINE_STATUS.FULFILLED;
    return item;
  });

  doc.order_items = nextItems;
  const plainForRecalc = doc.toObject();
  recalcCommercialsForClosure(plainForRecalc);
  doc.order_items = plainForRecalc.order_items;
  doc.subtotal = plainForRecalc.subtotal;
  doc.gst_amount = plainForRecalc.gst_amount;
  doc.grand_total = plainForRecalc.grand_total;
  doc.markModified('order_items');

  await syncDispatchDeliveredAfterSettlement(id, nextItems);

  const fromStatus = doc.status || ORDER_STATUS.DELIVERED;
  const fromLifecycle = doc.lifecycle_status || ORDER_LIFECYCLE_STATUS.FULFILLED;
  const fromStage = normalizeWorkflowStage(doc.workflow_stage) || ORDER_WORKFLOW_STAGE.DISPATCH;

  applyOrderSettlementClosedState(doc, user, {
    dispatch_status: FULFILLMENT_STATUS.COMPLETED,
    delivery_status: FULFILLMENT_STATUS.COMPLETED,
  });
  if (remarks) {
    doc.closure_remarks = String(remarks).trim();
  }

  await doc.save();

  await OrderStatusHistory.create({
    order: id,
    from_status: fromStatus,
    to_status: ORDER_STATUS.CLOSED,
    changed_by: user._id,
    remarks: remarks || 'Order closed after full delivery',
  });

  await OrderWorkflow.create({
    order: id,
    action_by: user._id,
    role: dept === 'super_admin' ? 'admin' : dept,
    action: 'closed',
    from_stage: fromStage,
    to_stage: ORDER_WORKFLOW_STAGE.COMPLETED,
    to_status: ORDER_STATUS.CLOSED,
    remarks: remarks || '',
    revision_number: doc.current_revision,
  });

  await activityService.create({
    actor: user._id,
    entity_type: 'order',
    entity_id: String(doc._id),
    action: 'status_changed',
    message: `Order ${doc.order_no} closed after full delivery`,
    old_value: { lifecycle_status: fromLifecycle, status: fromStatus },
    new_value: {
      lifecycle_status: ORDER_LIFECYCLE_STATUS.FULFILLED,
      status: doc.status,
      grand_total: doc.grand_total,
    },
  });

  return toPlain(doc.toObject());
}

/**
 * Shared validation for account order closure after warehouse returns.
 */
async function assertCloseWithReturnsPreconditions(id, body = {}) {
  const { return_id: returnId } = body || {};
  const { Order, OrderReturn } = getModels();

  const doc = await Order.findById(id);
  if (!doc) throw new ApiError(404, 'Order not found');

  if (isOrderSettlementClosed(doc)) {
    throw new ApiError(400, 'Order is already closed or cancelled');
  }

  if (String(doc.lifecycle_status || '') === ORDER_LIFECYCLE_STATUS.CANCELLED) {
    throw new ApiError(400, 'Order is already closed or cancelled');
  }

  const allReturns = await OrderReturn.find({
    order: id,
    deletedAt: null,
  }).lean();

  const pendingReturns = allReturns.filter((r) => isReturnPending(r.return_status));
  if (pendingReturns.length > 0) {
    throw new ApiError(
      400,
      'All return records must be received at warehouse before closing the order',
    );
  }

  const returns = allReturns.filter((r) => isReturnReceivedAtWarehouse(r.return_status));

  if (returnId) {
    const trigger = returns.find((r) => String(r._id) === String(returnId));
    if (!trigger) {
      throw new ApiError(400, 'Return must be received at warehouse before closing the order');
    }
  }

  return { doc, returns };
}

/**
 * Apply return settlement and recalculate order commercial totals without changing workflow status.
 */
async function settleOrderCommercials(id, body, user) {
  const {
    extra_charges: extraCharges = 0,
    penalty_amount: penaltyAmount = 0,
    damage_charge: damageCharge = 0,
    remarks,
  } = body || {};

  const { doc, returns } = await assertCloseWithReturnsPreconditions(id, body);
  const { OrderDispatch } = getModels();

  const dispatches = await OrderDispatch.find({
    order: id,
    deletedAt: null,
    dispatch_status: { $ne: 'cancelled' },
  }).lean();

  const returnedByLine = mergeReturnAllocationsToLines(doc.order_items || [], returns, dispatches);

  const nextItems = (doc.order_items || []).map((line) => {
    const item = line.toObject ? line.toObject() : { ...line };
    const lineId = orderLineId(item);
    const returnedQty = returnedByLine[lineId] ?? 0;
    return applyReturnSettlementToLine(item, returnedQty);
  });

  doc.order_items = nextItems;
  doc.extra_charges = Math.max(0, Number(extraCharges) || 0);
  doc.penalty_amount = Math.max(0, Number(penaltyAmount) || 0);
  doc.damage_charge = Math.max(0, Number(damageCharge) || 0);
  if (remarks) {
    doc.closure_remarks = String(remarks).trim();
  }
  doc.updated_by = user._id;

  const plainForRecalc = doc.toObject();
  recalcCommercialsForClosure(plainForRecalc);
  doc.order_items = plainForRecalc.order_items;
  doc.subtotal = plainForRecalc.subtotal;
  doc.gst_amount = plainForRecalc.gst_amount;
  doc.grand_total = plainForRecalc.grand_total;
  doc.markModified('order_items');

  await syncDispatchDeliveredAfterSettlement(id, nextItems);
  await doc.save();

  return { doc, returns, nextItems };
}

/**
 * Account closes an order after warehouse return receipt: apply returned quantities,
 * optional extra/penalty/damage charges, recalculate totals, and mark order closed.
 */
async function closeWithReturns(id, body, user) {
  const dept = String(user.department || '');
  if (!['account', 'admin', 'super_admin'].includes(dept)) {
    throw new ApiError(403, 'Only account can close orders after returns');
  }

  const { remarks } = body || {};
  const { OrderReturn, OrderWorkflow, OrderStatusHistory } = getModels();
  const { doc, nextItems } = await settleOrderCommercials(id, body, user);

  const totalReturned = nextItems.reduce(
    (sum, line) => sum + Number(line.returned_quantity || 0),
    0,
  );
  const totalNetDelivered = nextItems.reduce(
    (sum, line) => sum + Number(line.delivered_quantity || 0),
    0,
  );

  const fromStatus = doc.status || ORDER_STATUS.DELIVERED;
  const fromLifecycle = doc.lifecycle_status || ORDER_LIFECYCLE_STATUS.FULFILLED;
  const fromStage = normalizeWorkflowStage(doc.workflow_stage) || ORDER_WORKFLOW_STAGE.DISPATCH;

  applyOrderSettlementClosedState(doc, user, {
    dispatch_status: FULFILLMENT_STATUS.COMPLETED,
    delivery_status: totalNetDelivered > 0 ? FULFILLMENT_STATUS.COMPLETED : FULFILLMENT_STATUS.PARTIAL,
  });

  await doc.save();

  const closedAt = doc.closed_at;
  await OrderReturn.updateMany(
    {
      order: id,
      return_status: { $in: [ORDER_RETURN_STATUS.RECEIVED_AT_WAREHOUSE, 'received'] },
      order_closed_at: null,
    },
    { $set: { order_closed_at: closedAt } },
  );

  await OrderStatusHistory.create({
    order: id,
    from_status: fromStatus,
    to_status: ORDER_STATUS.CLOSED,
    changed_by: user._id,
    remarks: remarks || 'Order closed after warehouse return receipt',
  });

  await OrderWorkflow.create({
    order: id,
    action_by: user._id,
    role: dept === 'super_admin' ? 'admin' : dept,
    action: 'closed',
    from_stage: fromStage,
    to_stage: ORDER_WORKFLOW_STAGE.COMPLETED,
    to_status: ORDER_STATUS.CLOSED,
    remarks: remarks || '',
    revision_number: doc.current_revision,
  });

  await activityService.create({
    actor: user._id,
    entity_type: 'order',
    entity_id: String(doc._id),
    action: 'status_changed',
    message: `Order ${doc.order_no} closed after returns with adjusted totals`,
    old_value: { lifecycle_status: fromLifecycle, status: fromStatus },
    new_value: {
      lifecycle_status: ORDER_LIFECYCLE_STATUS.FULFILLED,
      status: doc.status,
      grand_total: doc.grand_total,
      extra_charges: doc.extra_charges,
      penalty_amount: doc.penalty_amount,
      damage_charge: doc.damage_charge,
      total_returned: totalReturned,
      total_net_delivered: totalNetDelivered,
    },
  });

  return toPlain(doc.toObject());
}

/**
 * Account settle & close: resolve release approvals, settle commercials, lock order closed.
 * Runs synchronously so status updates are visible immediately in the API response.
 */
async function settleAndCloseOrder(id, body, user) {
  const dept = String(user.department || '');
  if (!['account', 'admin', 'super_admin'].includes(dept)) {
    throw new ApiError(403, 'Only account can settle and close orders after returns');
  }

  await assertCloseWithReturnsPreconditions(id, body);

  const result = await processSettleAndCloseJob({
    orderId: String(id),
    userId: String(user._id),
    body: body || {},
  });

  const { Order } = getModels();
  const doc = await Order.findById(id).lean();
  return {
    ...result,
    queued: false,
    order: doc ? toPlain(doc) : null,
  };
}

async function processSettleAndCloseJob(payload = {}) {
  const orderId = payload.orderId;
  const userId = payload.userId;
  const body = payload.body || {};
  if (!orderId) throw new Error('settle_and_close requires orderId');
  if (!userId) throw new Error('settle_and_close requires userId');

  const { User, OrderReturn } = getModels();
  const actor = await User.findById(userId).lean();
  if (!actor) throw new Error(`User not found for settle_and_close: ${userId}`);
  const user = toPlain(actor);

  const approvalService = require('../orderApproval/orderApproval.service');
  const releaseResult = await approvalService.resolvePendingReleaseApprovalsForOrder(
    orderId,
    user,
    {
      amendment_notes: body.amendment_notes || body.remarks,
      remarks: body.remarks,
      skipAsyncJobs: true,
    },
  );

  await approvalService.finalizeDispatchReleasesOnOrderClose(orderId, user);

  const { Order } = getModels();
  let doc;
  try {
    ({ doc } = await settleOrderCommercials(orderId, body, user));
  } catch (err) {
    doc = await Order.findById(orderId);
    if (!doc || isOrderSettlementClosed(doc)) {
      throw err;
    }
  }

  const remarks = body.remarks || 'Account settle & close';
  const closedDoc = await persistOrderSettlementClose(orderId, doc, user, {
    remarks,
    closure_remarks: body.remarks,
    workflow_remarks: body.remarks || '',
    activityMessage: `Order ${doc.order_no} closed after account settle & close`,
  });

  const closedAt = closedDoc.closed_at ? new Date(closedDoc.closed_at) : new Date();
  await OrderReturn.updateMany(
    {
      order: orderId,
      return_status: { $in: [ORDER_RETURN_STATUS.RECEIVED_AT_WAREHOUSE, 'received'] },
      order_closed_at: null,
    },
    { $set: { order_closed_at: closedAt } },
  );

  const flagService = require('../flags/flag.service');
  await flagService.recomputeOrderFlagAggregates(orderId);

  return {
    orderId,
    releasesResolved: releaseResult.resolved,
    releasesSkipped: releaseResult.skipped,
    closed: true,
    lifecycle_status: closedDoc.lifecycle_status || ORDER_LIFECYCLE_STATUS.FULFILLED,
    workflow_stage: closedDoc.workflow_stage || ORDER_WORKFLOW_STAGE.COMPLETED,
    status: closedDoc.status || ORDER_STATUS.CLOSED,
  };
}

/**
 * Map API line payloads into mongoose subdocuments with normalized numbers.
 * Preserves `_id` when patching existing lines so updates do not blindly replace embedded doc ids.
 */
function normalizeItems(items) {
  return (items || []).map((line) => {
    const orderedQuantity = Number(line.ordered_quantity ?? line.quantity ?? 0);
    const o = {
      product: line.product,
      product_name: line.product_name,
      sku: line.sku || '',
      brand: line.brand || '',
      manufacturer: line.manufacturer || '',
      product_group: line.product_group || '',
      product_subgroup: line.product_subgroup || '',
      unit: line.unit || '',
      hsn_code: line.hsn_code || '',
      gst_percent: Number(line.gst_percent ?? 0),
      ordered_quantity: orderedQuantity,
      approved_quantity: Number(line.approved_quantity || 0),
      dispatched_quantity: Number(line.dispatched_quantity || 0),
      delivered_quantity: Number(line.delivered_quantity || 0),
      returned_quantity: Number(line.returned_quantity || 0),
      free_quantity: Number(line.free_quantity ?? line.free_qty ?? 0),
      unit_price: Number(line.unit_price),
      applied_rate_type: line.applied_rate_type || 'MANUAL',
      pricing_reference: line.pricing_reference || undefined,
      pricing_validity_start: line.pricing_validity_start ? new Date(line.pricing_validity_start) : undefined,
      pricing_validity_end: line.pricing_validity_end ? new Date(line.pricing_validity_end) : undefined,
      manual_price_override: line.manual_price_override === true,
      approval_required: line.approval_required === true,
      approval_reason: line.approval_reason || '',
      approved_by: line.approved_by || undefined,
      approved_at: line.approved_at ? new Date(line.approved_at) : undefined,
      discount_percent: Number(line.discount_percent || 0),
      discount_amount: Number(line.discount_amount || 0),
      taxable_amount: 0,
      gst_amount: 0,
      total_amount: 0,
      line_status: ORDER_LINE_STATUS_VALUES.includes(String(line.line_status || '').toLowerCase())
        ? String(line.line_status).toLowerCase()
        : ORDER_LINE_STATUS.ACTIVE,
      remarks: line.remarks || '',
    };
    if (line._id && mongoose.Types.ObjectId.isValid(String(line._id))) {
      o._id = line._id;
    }
    return o;
  });
}

/** @param {unknown} raw Express query `exclude_status` (comma-separated workflow statuses). */
function parseExcludeStatuses(raw) {
  if (raw == null || raw === '') return [];
  const s = Array.isArray(raw) ? raw.join(',') : String(raw);
  const parts = s.split(',').map((x) => x.trim()).filter(Boolean);
  const allowed = new Set(ORDER_STATUS_VALUES);
  const out = [];
  for (const p of parts) {
    if (!allowed.has(p)) {
      throw new ApiError(400, `Invalid exclude_status token "${p}"`);
    }
    out.push(p);
  }
  return out;
}

/** Sales: own/assigned orders. Other depts: all submitted+ orders. Super admin: all. */
function applyVisibilityFilter(q, user) {
  applyOrderVisibilityFilter(q, user);
}

function applyAccessFilter(q, user) {
  applyOrderAccessFilter(q, user);
}

/** Active orders only (no trash filter here). Optional filters: status, exclude_status ($nin), customer, or party ObjectId. */
async function list(query = {}, user) {
  const q = {};
  const { status, customer, party, exclude_status, search, priority } = query;

  if (status) {
    const s = String(status).toLowerCase();
    const pendingStage = normalizePendingStage(s);
    if (isAnyPendingApprovalStatus(s)) {
      const pendingOrderIds = await findOrderIdsWithAnyPendingApproval(getModels());
      q._id = { $in: pendingOrderIds };
    } else if (pendingStage) {
      const pendingOrderIds = await findOrderIdsWithPendingApproval(pendingStage, getModels());
      q._id = { $in: pendingOrderIds };
    } else if (s === 'rejected') {
      q.$or = [{ finance_approval_status: 'rejected' }, { status: 'finance_rejected' }];
    } else if (s === 'closed') {
      q.$or = [
        { status: ORDER_STATUS.CLOSED },
        { closed_at: { $exists: true, $ne: null } },
      ];
    } else if (s === 'open') {
      q.status = {
        $nin: [
          ORDER_STATUS.DRAFT,
          ORDER_STATUS.CANCELLED,
          ORDER_STATUS.FINANCE_REJECTED,
          ORDER_STATUS.SUBMITTED,
          ORDER_STATUS.ON_HOLD,
          ORDER_STATUS.DELIVERED,
          ORDER_STATUS.CLOSED,
        ],
      };
      q.closed_at = null;
      q.workflow_stage = { $nin: [ORDER_WORKFLOW_STAGE.ADMIN_REVIEW, ORDER_WORKFLOW_STAGE.COMPLETED] };
      q.delivery_status = { $ne: FULFILLMENT_STATUS.COMPLETED };
      q.lifecycle_status = { $ne: ORDER_LIFECYCLE_STATUS.FULFILLED };
      q.finance_approval_status = { $ne: APPROVAL_STATUS.REJECTED };
    } else if (
      s === ORDER_STATUS.DRAFT ||
      s === ORDER_STATUS.SUBMITTED ||
      s === ORDER_STATUS.SALES_APPROVED ||
      s === ORDER_STATUS.FINANCE_REVIEW ||
      s === ORDER_STATUS.CANCELLED ||
      s === ORDER_STATUS.ON_HOLD ||
      s === ORDER_STATUS.DISPATCH ||
      s === ORDER_STATUS.IN_TRANSIT ||
      s === ORDER_STATUS.DELIVERED ||
      s === ORDER_STATUS.CLOSED
    ) {
      q.status = status;
    } else if (s === 'dispatch_review' || s === 'dispatch_execution' || s === ORDER_STATUS.DISPATCH) {
      q.workflow_stage = ORDER_WORKFLOW_STAGE.DISPATCH;
    } else if (s === 'partially_finance_approved' || s === 'finance_partial') {
      q.finance_approval_status = { $in: [APPROVAL_STATUS.PARTIAL, 'partial'] };
    } else if (s === 'fully_finance_approved' || s === ORDER_STATUS.FINANCE_APPROVED) {
      q.finance_approval_status = { $in: [APPROVAL_STATUS.APPROVED, 'full'] };
    } else if (s === ORDER_STATUS.FINANCE_REJECTED) {
      q.finance_approval_status = APPROVAL_STATUS.REJECTED;
    } else if (s === 'dispatch_pending') {
      q.dispatch_status = FULFILLMENT_STATUS.PENDING;
    } else if (s === 'partial_dispatch_created' || s === 'partially_dispatched') {
      q.dispatch_status = FULFILLMENT_STATUS.PARTIAL;
    } else if (s === 'full_dispatch_created' || s === 'fully_dispatched') {
      q.dispatch_status = FULFILLMENT_STATUS.COMPLETED;
    } else if (s === 'partially_transported' || s === 'partially_delivered') {
      q.delivery_status = FULFILLMENT_STATUS.PARTIAL;
    } else if (s === 'fully_transported' || s === 'fully_delivered' || s === ORDER_STATUS.DELIVERED) {
      q.delivery_status = FULFILLMENT_STATUS.COMPLETED;
    } else {
      q.status = status;
    }
  } else {
    const excluded = parseExcludeStatuses(exclude_status);
    if (excluded.length) q.status = { $nin: excluded };
  }
  if (customer) q.customer = customer;
  if (party) q.party = party;

  if (priority && priority !== 'all') {
    q.priority = String(priority).toLowerCase();
  }

  const andConditions = [];
  appendOrderVisibilityAnd(andConditions, user);

  if (search && String(search).trim()) {
    const searchRegex = new RegExp(String(search).trim(), 'i');
    const PartyModel = getModels().Party;
    const matchingParties = await PartyModel.find({
      party_name: searchRegex
    }).select('_id').lean();
    const partyIds = matchingParties.map(p => p._id);

    andConditions.push({
      $or: [
        { order_no: searchRegex },
        { order_number: searchRegex },
        { party: { $in: partyIds } }
      ]
    });
  }

  if (andConditions.length > 0) {
    q.$and = andConditions;
  }

  const paginate = query.paginate === 'true';
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.max(Number(query.limit) || 10, 1);
  const skip = (page - 1) * limit;

  const mapListedOrders = async (rows) => {
    const plainRows = rows.map((r) => toPlain(r));
    return enrichOrdersWithApprovalPending(plainRows, getModels());
  };

  if (paginate) {
    const [total, rows] = await Promise.all([
      getModels().Order.countDocuments(q),
      getModels().Order.find(q)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      data: await mapListedOrders(rows),
    };
  }

  const rows = await getModels().Order.find(q).sort({ createdAt: -1 }).lean();
  return mapListedOrders(rows);
}

async function getById(id, user) {
  const q = { _id: id };
  applyAccessFilter(q, user);
  const row = await getModels().Order.findOne(q).lean();
  if (!row) throw new ApiError(404, 'Order not found');
  return toPlain(row);
}

async function resolveNegotiatedRates(orderItems, partyId) {
  const { resolveRateForPartyProduct } = require('../partyOrderProductsRate/partyOrderProductsRate.service');
  for (const item of orderItems) {
    if (!item.product) continue;
    const appliedRateType = item.applied_rate_type || 'SR';
    const rateInfo = await resolveRateForPartyProduct(
      partyId,
      item.product,
      appliedRateType,
    );
    if (rateInfo.hasRate && rateInfo.rateId) {
      item.unit_price = rateInfo.currentMappedRate;
      item.pricing_reference = rateInfo.rateId;
      item.pricing_validity_start = rateInfo.validityStart;
      item.pricing_validity_end = rateInfo.validityEnd;
      item.manual_price_override = false;
    } else {
      item.unit_price = 0;
      item.pricing_reference = undefined;
      item.pricing_validity_start = undefined;
      item.pricing_validity_end = undefined;
      item.manual_price_override = false;
    }
  }
}

/**
 * Draft creation: assigns order number, default sales owner, clears payment/dispatch KPI fields.
 * Caller must satisfy pricing-edit policy (only meaningful while status is draft for new orders).
 */
async function create(body, user) {
  policy.assertMayEditOrderPricing(user, { status: ORDER_STATUS.DRAFT });
  if (!body.party) throw new ApiError(400, 'party is required');

  const partyOk = await getModels().Party.exists({ _id: body.party, deletedAt: null });
  if (!partyOk) throw new ApiError(400, 'Party not found');

  const order_items = normalizeItems(body.order_items);
  if (order_items.length === 0) throw new ApiError(400, 'order_items required');

  if (!['admin', 'super_admin'].includes(user.department)) {
    await resolveNegotiatedRates(order_items, body.party);
  }

  const paymentStatus = body.payment_status ?? 'unpaid';
  if (!PAYMENT_STATUS_VALUES.has(paymentStatus)) throw new ApiError(400, 'Invalid payment_status');

  let payload = {
    order_no: generateOrderNo(),
    party: body.party,
    order_date: body.order_date ? new Date(body.order_date) : new Date(),
    payment_status: paymentStatus,
    internal_notes: body.notes != null ? String(body.notes) : '',
    order_items,
    discount_amount: Number(body.discount_amount || 0),
    priority: body.priority || 'normal',
    expected_delivery_date: body.expected_delivery_date ? new Date(body.expected_delivery_date) : null,
    assigned_sales_user: body.assigned_sales_user || user._id,
    current_assignee: body.assigned_sales_user || user._id,
    current_department: 'sales',
    pending_with_role: 'sales',
    lifecycle_status: 'draft',
    status: 'draft',
    workflow_stage: 'sales',
    current_action: 'drafted',
    current_revision: 1,
    dispatch_status: 'pending',
    allocation_status: 'pending',
    delivery_status: 'pending',
    finance_approval_status: 'pending',
    account_approval_status: 'pending',
    remarks: body.remarks || '',
    created_by: user._id,
    updated_by: user._id,
    has_open_flags: false,
    open_flag_count: 0,
    highest_flag_severity: 'none',
  };

  recalcCommercials(payload);

  const doc = await getModels().Order.create(payload);
  const plain = toPlain(doc.toObject());

  await orderQueue.enqueue({
    type: 'sync_party_rates',
    payload: { orderId: plain._id },
  });
  await activityService.create({
    actor: user._id,
    entity_type: 'order',
    entity_id: plain._id,
    action: 'created',
    message: `Order ${plain.order_no} drafted`,
    new_value: { order_no: plain.order_no },
  });

  const submitOnCreate = body.submit_on_create === true || body.submit_on_create === 'true';
  if (submitOnCreate) {
    await orderQueue.enqueue({
      type: ORDER_JOB_TYPES.SUBMIT_ORDER,
      payload: {
        orderId: plain._id,
        userId: user._id,
        remarks: body.submit_remarks || 'Initial submission upon creation',
      },
    });
    plain.submit_queued = true;
  }

  return plain;
}

/**
 * Partial patch: merges header fields and optionally replaces line items.
 * Business rules:
 * - Dispatch users cannot change commercial fields (see policy).
 * - Line items, header discount, and party change require sales or admin AND pricing must still be editable
 *   (blocked after finance approval per workflow.rules / policy).
 * - Workflow fields (`status`, `dispatch_status`, `paid_amount`, flag rollups) are snapshotted before edits
 *   and written back after recalc — `doc.set(wholePlainObject)` is not used (avoids Mongoose merge quirks / bypass).
 */
async function update(id, patch, user) {
  const p =
    patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
  assertSafePlainPatch(p);

  const q = { _id: id };
  applyAccessFilter(q, user);
  const doc = await getModels().Order.findOne(q);
  if (!doc) throw new ApiError(404, 'Order not found');

  const order = toPlain(doc.toObject());
  policy.assertDispatchMayNotChangeCommercials(user, p);

  if (p.order_items) {
    if (!['sales', 'admin', 'super_admin', 'finance', 'account'].includes(user.department)) {
      throw new ApiError(403, 'Only sales, admin, super_admin, finance, or account may edit order line items');
    }
    policy.assertMayEditOrderPricing(user, order);
  }

  if (p.discount_amount !== undefined) {
    policy.assertMayEditOrderPricing(user, order);
  }

  if (p.party !== undefined && String(p.party || '') !== String(order.party || '')) {
    if (!['sales', 'admin', 'super_admin'].includes(user.department)) {
      throw new ApiError(403, 'Only sales or admin may change party on an order');
    }
    policy.assertMayEditOrderPricing(user, order);
    if (p.party) {
      const partyOk = await getModels().Party.exists({ _id: p.party, deletedAt: null });
      if (!partyOk) throw new ApiError(400, 'Party not found');
    }
  }

  if (p.payment_status !== undefined) {
    if (user.department === 'sales') policy.assertMayEditOrderPricing(user, order);
    if (!['sales', 'admin', 'super_admin', 'finance', 'account'].includes(user.department)) {
      throw new ApiError(403, 'Insufficient access to edit payment_status');
    }
  }

  if (p.order_date !== undefined && !['admin', 'super_admin', 'finance', 'account'].includes(user.department)) {
    policy.assertMayEditOrderPricing(user, order);
  }

  const lockedWorkflow = {
    status: doc.get('status'),
    dispatch_status: doc.get('dispatch_status'),
    has_open_flags: doc.get('has_open_flags'),
    open_flag_count: doc.get('open_flag_count'),
    highest_flag_severity: doc.get('highest_flag_severity'),
  };

  applyWhitelistedPatchToMongooseDoc(doc, p);

  const recalcBase = doc.toObject();

  if (p.order_items && !['admin', 'super_admin', 'finance', 'account'].includes(user.department)) {
    await resolveNegotiatedRates(recalcBase.order_items, p.party || order.party);
  }

  recalcCommercials(recalcBase);

  doc.set('order_items', recalcBase.order_items);
  doc.markModified('order_items');
  doc.set('subtotal', recalcBase.subtotal);
  doc.set('gst_amount', recalcBase.gst_amount);
  doc.set('grand_total', recalcBase.grand_total);

  doc.set('status', lockedWorkflow.status);
  doc.set('dispatch_status', lockedWorkflow.dispatch_status);
  doc.set('has_open_flags', lockedWorkflow.has_open_flags);
  doc.set('open_flag_count', lockedWorkflow.open_flag_count);
  doc.set('highest_flag_severity', lockedWorkflow.highest_flag_severity);

  doc.set('updated_by', user._id);
  await doc.save();
  const out = toPlain(doc.toObject());

  await orderQueue.enqueue({
    type: 'sync_party_rates',
    payload: { orderId: out._id },
  });
  return out;
}

/**
 * Status move only: all graph checks, department gates, flags, invoice/collection side effects live in workflow.
 */
async function transition(id, body, user, reqMeta) {
  await getById(id, user);
  return workflowService.transitionOrderStatus({
    orderId: id,
    nextStatus: body.next_status,
    userId: user._id,
    remarks: body.remarks,
    rejectionReason: body.rejection_reason,
    ip_address: reqMeta.ip,
    user_agent: reqMeta.ua,
  });
}

async function processOrderJob({ type, payload = {} }) {
  switch (type) {
    case 'sync_party_rates': {
      const orderId = payload.orderId;
      if (!orderId) throw new Error('sync_party_rates requires orderId');
      const doc = await getModels().Order.findById(orderId).lean();
      if (!doc) return { orderId, skipped: true };
      await syncPartyProductLastRatesFromOrder(getModels, toPlain(doc));
      return { orderId };
    }
    case 'recalculate_fulfillment': {
      const orderId = payload.orderId;
      if (!orderId) throw new Error('recalculate_fulfillment requires orderId');
      const actor = payload.userId
        ? await getModels().User.findById(payload.userId).lean()
        : null;
      const user = actor ? toPlain(actor) : null;
      await fulfillmentService.recalculateFromExecutions(orderId, user);
      return { orderId };
    }
    case 'post_transport_shipment': {
      const transportService = require('../transport/transport.service');
      return transportService.processPostTransportShipmentJob(payload);
    }
    case 'post_shipment_delivery': {
      const orderDeliveryService = require('../orderDelivery/orderDelivery.service');
      return orderDeliveryService.processPostShipmentDeliveryJob(payload);
    }
    case ORDER_JOB_TYPES.SETTLE_AND_CLOSE:
    case 'settle_and_close':
      return processSettleAndCloseJob(payload);
    case ORDER_JOB_TYPES.SUBMIT_ORDER:
    case 'submit_order': {
      const orderId = payload.orderId;
      const userId = payload.userId;
      if (!orderId) throw new Error('submit_order requires orderId');
      if (!userId) throw new Error('submit_order requires userId');
      const order = await workflowService.transitionOrderStatus({
        orderId,
        nextStatus: ORDER_STATUS.SUBMITTED,
        userId,
        remarks: payload.remarks || 'Initial submission upon creation',
        ip_address: payload.ip_address,
        user_agent: payload.user_agent,
      });
      return { orderId, status: order?.status || ORDER_STATUS.SUBMITTED };
    }
    default:
      throw new Error(`Unknown order job type: ${type}`);
  }
}

/** Chronological audit of status changes (OrderStatusHistory), after verifying the order exists. */
async function history(id, user) {
  await getById(id, user);
  const rows = await getModels().OrderStatusHistory.find({ order: id })
    .populate('changed_by', 'username name')
    .sort({ createdAt: 1 })
    .lean();
  return rows.map((r) => toPlain(r));
}

const ORDER_NF = 'Order not found';

/** Trash list: soft-deleted orders with optional same filters as `list`. */
async function listDeleted(query = {}, user) {
  const q = {};
  const { status, customer, party, exclude_status } = query;
  if (status) {
    q.status = status;
  } else {
    const excluded = parseExcludeStatuses(exclude_status);
    if (excluded.length) q.status = { $nin: excluded };
  }
  if (customer) q.customer = customer;
  if (party) q.party = party;
  await applyVisibilityFilter(q, user);
  const rows = await listDeletedLean(getModels().Order, q);
  return rows.map((r) => toPlain(r));
}

/** Soft-delete active order; records activity (record remains recoverable). */
async function softDelete(id, user) {
  await getById(id, user);
  const doc = await softDeleteActiveById(getModels().Order, id, { notFoundMessage: ORDER_NF });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'order',
    entity_id: plain._id,
    action: 'deleted',
    message: `Order ${plain.order_no} soft-deleted`,
  });
  return plain;
}

/** Restore from trash; activity log for compliance trail. */
async function restore(id, user) {
  const q = { _id: id };
  applyAccessFilter(q, user);
  const checkAccess = await getModels().Order.findOne(q).withDeleted().lean();
  if (!checkAccess) throw new ApiError(404, ORDER_NF);

  const doc = await restoreSoftDeletedById(getModels().Order, id, { notFoundMessage: ORDER_NF });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'order',
    entity_id: plain._id,
    action: 'restored',
    message: `Order ${plain.order_no} restored`,
  });
  return plain;
}

async function fulfillment(id, user) {
  await getById(id, user);
  return fulfillmentService.getSnapshot(id);
}

async function assignees(id, user) {
  const q = { _id: id };
  applyAccessFilter(q, user);
  const exists = await getModels().Order.exists(q);
  if (!exists) throw new ApiError(404, 'Order not found');
  return assigneeService.listByOrder(id);
}

module.exports = {
  list,
  getById,
  create,
  update,
  transition,
  history,
  fulfillment,
  assignees,
  closeWithReturns,
  settleAndCloseOrder,
  settleOrderCommercials,
  processSettleAndCloseJob,
  closeAfterFullDelivery,
  recalcCommercials,
  normalizeItems,
  listDeleted,
  softDelete,
  restore,
  resolveWorkflowAssigneeUserId,
  applyReturnSettlementToLine,
  grossAcceptedQty,
  syncDispatchDeliveredAfterSettlement,
  processOrderJob,
};
