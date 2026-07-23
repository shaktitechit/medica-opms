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
  enrichOrdersWithDueSheetStatus,
  enrichOrdersWithFlagStatus,
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
  deriveOrderPriorityFromExpectedDeliveryDate,
  applyDerivedPriorityToOrder,
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
  if (patch.expected_delivery_date !== undefined) {
    doc.set('expected_delivery_date', patch.expected_delivery_date ? new Date(patch.expected_delivery_date) : null);
  }
  // Priority is derived from expected_delivery_date (manual priority patches are ignored when EDD is set).
  if (doc.expected_delivery_date) {
    doc.set(
      'priority',
      deriveOrderPriorityFromExpectedDeliveryDate(doc.expected_delivery_date, doc.priority || 'normal'),
    );
  } else if (patch.priority !== undefined) {
    doc.set('priority', patch.priority);
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

/** Full-delivery closure state used by the dispatch completion path. */
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
      const returnTarget = Number(settled.returned_quantity || 0);
      if (Number(item.returned_quantity || 0) !== returnTarget) {
        item.returned_quantity = returnTarget;
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
 * Close an order without modifying fulfillment quantities, approvals, returns, or commercials.
 * Only workflow state and closure audit metadata are updated.
 */
async function closeOrder(id, body, user) {
  const dept = String(user.department || '');
  if (!['account', 'admin', 'super_admin', 'dispatch'].includes(dept)) {
    throw new ApiError(403, 'Only account or dispatch can close orders');
  }

  const { Order, OrderWorkflow, OrderStatusHistory } = getModels();
  const doc = await Order.findById(id);
  if (!doc) throw new ApiError(404, 'Order not found');
  if (isOrderSettlementClosed(doc)) {
    throw new ApiError(400, 'Order is already closed');
  }
  if (String(doc.lifecycle_status || '') === ORDER_LIFECYCLE_STATUS.CANCELLED) {
    throw new ApiError(400, 'Cancelled orders cannot be closed');
  }

  const remarks = String(body?.remarks || '').trim();
  const fromStatus = doc.status || '';
  const fromStage = normalizeWorkflowStage(doc.workflow_stage) || ORDER_WORKFLOW_STAGE.DISPATCH;

  doc.status = ORDER_STATUS.CLOSED;
  doc.workflow_stage = ORDER_WORKFLOW_STAGE.COMPLETED;
  doc.current_action = 'closed';
  doc.is_locked = true;
  doc.closed_at = new Date();
  doc.closed_by = user._id;
  doc.updated_by = user._id;
  doc.current_revision = Number(doc.current_revision || 1) + 1;
  if (remarks) doc.closure_remarks = remarks;
  await doc.save();

  await OrderStatusHistory.create({
    order: id,
    from_status: fromStatus,
    to_status: ORDER_STATUS.CLOSED,
    changed_by: user._id,
    remarks: remarks || 'Order closed by account',
  });

  await OrderWorkflow.create({
    order: id,
    action_by: user._id,
    role: dept === 'super_admin' ? 'admin' : dept,
    action: 'closed',
    from_stage: fromStage,
    to_stage: ORDER_WORKFLOW_STAGE.COMPLETED,
    to_status: ORDER_STATUS.CLOSED,
    remarks,
    revision_number: doc.current_revision,
  });

  await activityService.create({
    actor: user._id,
    entity_type: 'order',
    entity_id: String(doc._id),
    action: 'status_changed',
    message: `Order ${doc.order_no} closed`,
    old_value: { status: fromStatus, workflow_stage: fromStage },
    new_value: {
      status: ORDER_STATUS.CLOSED,
      workflow_stage: ORDER_WORKFLOW_STAGE.COMPLETED,
    },
  });

  return toPlain(doc.toObject());
}

/**
 * Reopen a closed order at the dispatch stage without changing fulfillment or commercials.
 * Clears closure audit fields and records the state transition.
 */
async function reopenOrder(id, body, user) {
  const dept = String(user.department || '');
  if (!['account', 'admin', 'super_admin', 'dispatch'].includes(dept)) {
    throw new ApiError(403, 'Only account or dispatch can reopen orders');
  }

  const { Order, OrderWorkflow, OrderStatusHistory } = getModels();
  const doc = await Order.findById(id);
  if (!doc) throw new ApiError(404, 'Order not found');
  if (!isOrderSettlementClosed(doc)) {
    throw new ApiError(400, 'Only closed orders can be reopened');
  }

  const remarks = String(body?.remarks || '').trim();
  const fromStatus = doc.status || ORDER_STATUS.CLOSED;
  const fromStage =
    normalizeWorkflowStage(doc.workflow_stage) || ORDER_WORKFLOW_STAGE.COMPLETED;

  doc.status = ORDER_STATUS.DISPATCH;
  doc.lifecycle_status = ORDER_LIFECYCLE_STATUS.PARTIALLY_FULFILLED;
  doc.workflow_stage = ORDER_WORKFLOW_STAGE.DISPATCH;
  doc.current_action = 'reopened';
  doc.is_locked = false;
  doc.closed_at = null;
  doc.closed_by = null;
  doc.closure_remarks = null;
  doc.updated_by = user._id;
  doc.current_revision = Number(doc.current_revision || 1) + 1;
  await doc.save();

  await OrderStatusHistory.create({
    order: id,
    from_status: fromStatus,
    to_status: ORDER_STATUS.DISPATCH,
    changed_by: user._id,
    remarks: remarks || `Order reopened by ${dept}`,
  });

  await OrderWorkflow.create({
    order: id,
    action_by: user._id,
    role: dept === 'super_admin' ? 'admin' : dept,
    action: 'reopened',
    from_stage: fromStage,
    to_stage: ORDER_WORKFLOW_STAGE.DISPATCH,
    from_status: fromStatus,
    to_status: ORDER_STATUS.DISPATCH,
    remarks,
    revision_number: doc.current_revision,
  });

  await activityService.create({
    actor: user._id,
    entity_type: 'order',
    entity_id: String(doc._id),
    action: 'status_changed',
    message: `Order ${doc.order_no} reopened`,
    old_value: {
      status: fromStatus,
      workflow_stage: fromStage,
    },
    new_value: {
      status: ORDER_STATUS.DISPATCH,
      workflow_stage: ORDER_WORKFLOW_STAGE.DISPATCH,
    },
  });

  return toPlain(doc.toObject());
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
      approved_quantity: Number(line.approved_quantity ?? orderedQuantity ?? 0),
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
    const plainRows = rows.map((r) => applyDerivedPriorityToOrder(toPlain(r)));
    const enrichedPending = await enrichOrdersWithApprovalPending(plainRows, getModels());
    const enrichedDueSheet = await enrichOrdersWithDueSheetStatus(enrichedPending, getModels());
    return enrichOrdersWithFlagStatus(enrichedDueSheet, getModels());
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
  const plain = applyDerivedPriorityToOrder(toPlain(row));
  const enrichedPending = await enrichOrdersWithApprovalPending([plain], getModels());
  const enrichedDueSheet = await enrichOrdersWithDueSheetStatus(enrichedPending, getModels());
  const enrichedFlag = await enrichOrdersWithFlagStatus(enrichedDueSheet, getModels());
  return enrichedFlag[0];
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

  const orderNo = await generateOrderNo(body.party, body.order_date);

  let payload = {
    order_no: orderNo,
    party: body.party,
    order_date: body.order_date ? new Date(body.order_date) : new Date(),
    payment_status: paymentStatus,
    internal_notes: body.notes != null ? String(body.notes) : '',
    order_items,
    discount_amount: Number(body.discount_amount || 0),
    expected_delivery_date: body.expected_delivery_date ? new Date(body.expected_delivery_date) : null,
    priority: deriveOrderPriorityFromExpectedDeliveryDate(
      body.expected_delivery_date,
      body.priority || 'normal',
    ),
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

    if (body.approval_items || body.approved_total_amount !== undefined) {
      const orderApprovalQueue = require('../../queues/orderApproval.queue');
      await orderApprovalQueue.enqueue({
        type: 'create_order_approval',
        payload: {
          body: {
            order: plain._id,
            approve_immediately: body.approve_immediately,
            approve_finance_only: body.approve_finance_only,
            approve_account_only: body.approve_account_only,
            replace_snapshot: true,
            approval_notes: body.approval_notes || body.submit_remarks || "Initial approval on admin order creation",
            approved_total_amount: body.approved_total_amount,
            approval_items: body.approval_items,
            contact_number: body.contact_number,
            contact_name: body.contact_name,
          },
          user,
        },
      });
    }

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
    if (!['sales', 'admin', 'super_admin', 'finance', 'account'].includes(user.department)) {
      throw new ApiError(403, 'Only sales, admin, finance, or account may change party on an order');
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

async function syncOrderPrioritiesFromEdd() {
  const { Order } = getModels();
  const cursor = Order.find({
    deletedAt: null,
    expected_delivery_date: { $ne: null },
    status: { $nin: [ORDER_STATUS.CLOSED, ORDER_STATUS.CANCELLED] },
  })
    .select('_id expected_delivery_date priority')
    .lean()
    .cursor();

  let scanned = 0;
  let updated = 0;
  const ops = [];

  const flush = async () => {
    if (ops.length === 0) return;
    const result = await Order.bulkWrite(ops, { ordered: false });
    updated += result.modifiedCount || 0;
    ops.length = 0;
  };

  for await (const row of cursor) {
    scanned += 1;
    const nextPriority = deriveOrderPriorityFromExpectedDeliveryDate(
      row.expected_delivery_date,
      row.priority || 'normal',
    );
    if (nextPriority === row.priority) continue;

    ops.push({
      updateOne: {
        filter: { _id: row._id },
        update: { $set: { priority: nextPriority } },
      },
    });

    if (ops.length >= 200) {
      await flush();
    }
  }

  await flush();
  return { scanned, updated };
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
    case 'post_order_return': {
      const orderReturnService = require('../orderReturn/orderReturn.service');
      return orderReturnService.processPostOrderReturnJob(payload);
    }
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
    case ORDER_JOB_TYPES.SYNC_ORDER_PRIORITIES:
    case 'sync_order_priorities': {
      return syncOrderPrioritiesFromEdd();
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

async function submitOrder(id, body, user, reqMeta) {
  const orderApprovalService = require('../orderApproval/orderApproval.service');
  await orderApprovalService.syncOrderItemsForAdminApproval(id, body.order_items, user);

  const workflowQueue = require('../../queues/workflow.queue');
  await workflowQueue.enqueue({
    type: 'submit_transition',
    payload: {
      orderId: id,
      userId: user._id,
      remarks: body.remarks,
      ip_address: reqMeta.ip,
      user_agent: reqMeta.ua,
    },
  });

  const approvalBody = {
    order: id,
    approve_immediately: false,
    replace_snapshot: true,
    approval_notes: body.remarks,
    approved_total_amount: body.approved_total_amount,
    approval_items: body.approval_items,
    contact_number: body.contact_number,
    contact_name: body.contact_name,
  };

  // Prefer synchronous approval creation so submit does not succeed without a batch.
  let approvalCreated = false;
  let approvalError = null;
  try {
    await orderApprovalService.create(approvalBody, user);
    approvalCreated = true;
  } catch (err) {
    approvalError = err?.message || 'Failed to create order approval';
    // Background retry as a best-effort fallback.
    try {
      const orderApprovalQueue = require('../../queues/orderApproval.queue');
      await orderApprovalQueue.enqueue({
        type: 'create_order_approval',
        payload: { body: approvalBody, user },
      });
    } catch (_queueErr) {
      // ignore queue failure; client can retry create
    }
  }

  return {
    success: true,
    orderId: id,
    approval_created: approvalCreated,
    approval_error: approvalError,
  };
}

function parseDateOrNull(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Live-sync a single Google Sheet row into an existing Order.
 * Lookup by Mongo `_id` or unique `order_no`. Creates are not supported
 * (orders require line items + party). Status / workflow fields are ignored.
 */
async function syncFromGoogleSheet(row) {
  const { Order, Party } = getModels();

  if (!row || typeof row !== 'object') {
    throw new ApiError(400, 'Invalid row payload');
  }

  const rawId = row._id || row.id || row.order_id;
  const isMongoId = rawId && mongoose.Types.ObjectId.isValid(String(rawId));
  const orderNoRaw = row.order_no || row.order_number || row.order_ref;
  const orderNo = orderNoRaw != null ? String(orderNoRaw).trim() : '';

  let doc = null;
  if (isMongoId) {
    doc = await Order.findOne({ _id: rawId, deletedAt: null });
  }
  if (!doc && orderNo) {
    doc = await Order.findOne({ order_no: orderNo, deletedAt: null });
  }

  if (!doc) {
    throw new ApiError(
      404,
      orderNo || rawId
        ? `Order not found for ${orderNo || rawId}. Export from Virtual Sheet first, then edit existing rows.`
        : 'Order ID or Order Number is required to sync',
    );
  }

  const PRIORITY_VALUES = new Set(['low', 'normal', 'high', 'urgent']);
  const PAYMENT_VALUES = new Set(['unpaid', 'partial', 'paid']);

  const payload = {};

  const priorityRaw = row.priority != null ? String(row.priority).trim().toLowerCase() : undefined;
  if (priorityRaw && PRIORITY_VALUES.has(priorityRaw)) {
    payload.priority = priorityRaw;
  }

  if (row.expected_delivery_date !== undefined || row.expected_delivery !== undefined) {
    const eddRaw = row.expected_delivery_date ?? row.expected_delivery;
    if (eddRaw !== '' && eddRaw != null) {
      const edd = parseDateOrNull(eddRaw);
      if (edd) payload.expected_delivery_date = edd;
    }
  }

  if (row.order_date !== undefined && row.order_date !== '' && row.order_date != null) {
    const od = parseDateOrNull(row.order_date);
    if (od) payload.order_date = od;
  }

  if (row.remarks !== undefined || row.notes !== undefined) {
    payload.remarks = String(row.remarks ?? row.notes ?? '').trim();
  }

  const paymentRaw =
    row.payment_status != null ? String(row.payment_status).trim().toLowerCase() : undefined;
  if (paymentRaw && PAYMENT_VALUES.has(paymentRaw)) {
    payload.payment_status = paymentRaw;
  }

  // Optional party reassignment by ObjectId or party_name
  const partyIdRaw = row.party || row.party_id;
  if (partyIdRaw && mongoose.Types.ObjectId.isValid(String(partyIdRaw))) {
    const partyOk = await Party.exists({ _id: partyIdRaw, deletedAt: null });
    if (partyOk) payload.party = partyIdRaw;
  } else if (row.party_name || row.party_name_label) {
    const name = String(row.party_name || row.party_name_label).trim();
    if (name) {
      const partyDoc = await Party.findOne({
        party_name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        deletedAt: null,
      }).select('_id');
      if (partyDoc) payload.party = partyDoc._id;
    }
  }

  applyWhitelistedPatchToMongooseDoc(doc, payload);

  const recalcBase = doc.toObject();
  recalcCommercials(recalcBase);
  doc.set('order_items', recalcBase.order_items);
  doc.markModified('order_items');
  doc.set('subtotal', recalcBase.subtotal);
  doc.set('gst_amount', recalcBase.gst_amount);
  doc.set('grand_total', recalcBase.grand_total);

  await doc.save();
  return applyDerivedPriorityToOrder(toPlain(doc.toObject()));
}

const SUPER_SHEET_STATUS_TO_STAGE = Object.freeze({
  draft: ORDER_WORKFLOW_STAGE.SALES,
  submitted: ORDER_WORKFLOW_STAGE.SALES,
  sales_approved: ORDER_WORKFLOW_STAGE.ADMIN_REVIEW,
  finance_review: ORDER_WORKFLOW_STAGE.FINANCE_REVIEW,
  finance_approved: ORDER_WORKFLOW_STAGE.ACCOUNT_REVIEW,
  finance_rejected: ORDER_WORKFLOW_STAGE.FINANCE_REVIEW,
  account_review: ORDER_WORKFLOW_STAGE.ACCOUNT_REVIEW,
  account_approved: ORDER_WORKFLOW_STAGE.DISPATCH,
  account_rejected: ORDER_WORKFLOW_STAGE.ACCOUNT_REVIEW,
  dispatch: ORDER_WORKFLOW_STAGE.DISPATCH,
  in_transit: ORDER_WORKFLOW_STAGE.DISPATCH,
  delivered: ORDER_WORKFLOW_STAGE.DISPATCH,
  closed: ORDER_WORKFLOW_STAGE.COMPLETED,
  cancelled: ORDER_WORKFLOW_STAGE.CANCELLED,
  on_hold: ORDER_WORKFLOW_STAGE.ON_HOLD,
});

const SUPER_SHEET_STATUS_TO_LIFECYCLE = Object.freeze({
  draft: ORDER_LIFECYCLE_STATUS.DRAFT,
  submitted: ORDER_LIFECYCLE_STATUS.ACTIVE,
  sales_approved: ORDER_LIFECYCLE_STATUS.ACTIVE,
  finance_review: ORDER_LIFECYCLE_STATUS.ACTIVE,
  finance_approved: ORDER_LIFECYCLE_STATUS.ACTIVE,
  finance_rejected: ORDER_LIFECYCLE_STATUS.ACTIVE,
  account_review: ORDER_LIFECYCLE_STATUS.ACTIVE,
  account_approved: ORDER_LIFECYCLE_STATUS.ACTIVE,
  account_rejected: ORDER_LIFECYCLE_STATUS.ACTIVE,
  dispatch: ORDER_LIFECYCLE_STATUS.ACTIVE,
  in_transit: ORDER_LIFECYCLE_STATUS.PARTIALLY_FULFILLED,
  delivered: ORDER_LIFECYCLE_STATUS.FULFILLED,
  closed: ORDER_LIFECYCLE_STATUS.FULFILLED,
  cancelled: ORDER_LIFECYCLE_STATUS.CANCELLED,
  on_hold: ORDER_LIFECYCLE_STATUS.ON_HOLD,
});

/**
 * Super-admin live sheet bypass: update any Order / order_items field
 * without workflow transition rules / department gates.
 */
async function superSheetUpdate(id, body, user) {
  if (!user || user.department !== 'super_admin') {
    throw new ApiError(403, 'Only super_admin can use the orders sheet bypass');
  }
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
    throw new ApiError(400, 'Valid order id is required');
  }
  const patch = body && typeof body === 'object' && !Array.isArray(body) ? body : {};

  const doc = await getModels().Order.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, 'Order not found');

  const BLOCKED_KEYS = new Set(['_id', 'id', '__v', 'createdAt', 'updatedAt', 'deletedAt']);
  const DATE_KEYS = new Set([
    'order_date',
    'expected_delivery_date',
    'closed_at',
    'pricing_validity_start',
    'pricing_validity_end',
    'approved_at',
  ]);
  const BOOL_KEYS = new Set([
    'is_locked',
    'has_open_flags',
    'manual_price_override',
    'approval_required',
  ]);
  const NUMBER_KEYS = new Set([
    'current_revision',
    'subtotal',
    'discount_amount',
    'taxable_amount',
    'gst_amount',
    'grand_total',
    'extra_charges',
    'penalty_amount',
    'damage_charge',
    'open_flag_count',
  ]);
  const OBJECT_ID_KEYS = new Set([
    'party',
    'customer',
    'current_assignee',
    'assigned_sales_user',
    'closed_by',
    'created_by',
    'updated_by',
    'last_finance_approval',
    'last_admin_approval',
    'last_account_approval',
  ]);
  const ENUM_SETS = {
    status: new Set(ORDER_STATUS_VALUES),
    lifecycle_status: new Set(Object.values(ORDER_LIFECYCLE_STATUS)),
    workflow_stage: new Set(Object.values(ORDER_WORKFLOW_STAGE)),
    priority: new Set(['low', 'normal', 'high', 'urgent']),
    payment_status: new Set(['unpaid', 'partial', 'paid']),
    current_department: new Set(['super_admin', 'sales', 'admin', 'finance', 'account', 'dispatch']),
    pending_with_role: new Set(['super_admin', 'sales', 'admin', 'finance', 'account', 'dispatch']),
    finance_approval_status: new Set(['pending', 'partial', 'approved', 'rejected', 'full']),
    admin_approval_status: new Set(['pending', 'partial', 'approved', 'rejected', 'full']),
    account_approval_status: new Set(['pending', 'partial', 'approved', 'rejected', 'full']),
    allocation_status: new Set(['pending', 'partial', 'completed']),
    dispatch_status: new Set(['pending', 'partial', 'completed']),
    delivery_status: new Set(['pending', 'partial', 'completed']),
    highest_flag_severity: new Set(['none', 'low', 'medium', 'high', 'critical']),
  };

  const statusProvided = patch.status !== undefined && patch.status !== null && patch.status !== '';

  for (const [key, raw] of Object.entries(patch)) {
    if (BLOCKED_KEYS.has(key)) continue;
    if (key === 'order_items') continue; // handled below
    if (key.includes('$') || key.includes('.')) {
      throw new ApiError(400, `Invalid PATCH key "${key}"`);
    }

    let value = raw;

    if (ENUM_SETS[key]) {
      if (value === '' || value == null) continue;
      value = String(value).trim().toLowerCase();
      if (!ENUM_SETS[key].has(value)) {
        throw new ApiError(400, `Invalid ${key} "${raw}"`);
      }
    } else if (DATE_KEYS.has(key)) {
      if (value === '' || value == null) value = null;
      else {
        const d = parseDateOrNull(value);
        if (!d) throw new ApiError(400, `Invalid date for ${key}`);
        value = d;
      }
    } else if (BOOL_KEYS.has(key)) {
      value =
        value === true ||
        value === 'true' ||
        value === 1 ||
        value === '1' ||
        value === 'yes';
    } else if (NUMBER_KEYS.has(key)) {
      if (value === '' || value == null) value = 0;
      else value = Number(value);
      if (!Number.isFinite(value)) throw new ApiError(400, `Invalid number for ${key}`);
    } else if (OBJECT_ID_KEYS.has(key)) {
      if (value === '' || value == null) value = null;
      else {
        const sid = String(value).trim();
        if (!mongoose.Types.ObjectId.isValid(sid)) {
          throw new ApiError(400, `Invalid ObjectId for ${key}`);
        }
        value = sid;
      }
    } else if (typeof value === 'string') {
      value = value.trim();
    }

    doc.set(key, value);
  }

  if (Array.isArray(patch.order_items)) {
    doc.set('order_items', normalizeItems(patch.order_items));
    doc.markModified('order_items');
  }

  // When status changes and stage/lifecycle not explicitly set, map defaults
  if (statusProvided) {
    const nextStatus = String(doc.status).toLowerCase();
    if (patch.workflow_stage === undefined || patch.workflow_stage === null || patch.workflow_stage === '') {
      const mappedStage = SUPER_SHEET_STATUS_TO_STAGE[nextStatus];
      if (mappedStage) doc.set('workflow_stage', mappedStage);
    }
    if (patch.lifecycle_status === undefined || patch.lifecycle_status === null || patch.lifecycle_status === '') {
      const mappedLife = SUPER_SHEET_STATUS_TO_LIFECYCLE[nextStatus];
      if (mappedLife) doc.set('lifecycle_status', mappedLife);
    }
    if (nextStatus === ORDER_STATUS.CLOSED && !doc.closed_at) {
      doc.set('closed_at', new Date());
      if (!doc.closed_by) doc.set('closed_by', user._id);
    }
    if (nextStatus !== ORDER_STATUS.CLOSED && patch.closed_at === undefined) {
      // leave closed_at as patched; only clear if status left closed without explicit closed_at
      if (patch.status !== undefined) doc.set('closed_at', doc.closed_at);
    }
  }

  const recalcBase = doc.toObject();
  recalcCommercials(recalcBase);
  // Prefer sheet-provided totals when explicitly patched; otherwise use recalc
  if (patch.subtotal === undefined) doc.set('subtotal', recalcBase.subtotal);
  if (patch.gst_amount === undefined) doc.set('gst_amount', recalcBase.gst_amount);
  if (patch.grand_total === undefined) doc.set('grand_total', recalcBase.grand_total);
  if (patch.taxable_amount === undefined && recalcBase.taxable_amount != null) {
    doc.set('taxable_amount', recalcBase.taxable_amount);
  }
  doc.set('order_items', recalcBase.order_items);
  doc.markModified('order_items');
  doc.set('updated_by', user._id);

  await doc.save();

  if (Array.isArray(patch.order_items)) {
    try {
      const orderApprovalService = require('../orderApproval/orderApproval.service');
      await orderApprovalService.syncApprovalsFromOrderSuperSheet(doc._id);
    } catch (_err) {
      // Soft-fail sync so order save still succeeds; sheet can reload approvals.
    }
  }

  await activityService.create({
    actor: user._id,
    entity_type: 'order',
    entity_id: String(doc._id),
    action: 'updated',
    message: `Super-admin sheet bypass update on order ${doc.order_no}`,
    new_value: {
      status: doc.status,
      workflow_stage: doc.workflow_stage,
      lifecycle_status: doc.lifecycle_status,
      via: 'super_sheet',
      keys: Object.keys(patch),
    },
  }).catch(() => undefined);

  return applyDerivedPriorityToOrder(toPlain(doc.toObject()));
}

module.exports = {
  list,
  getById,
  create,
  update,
  transition,
  submitOrder,
  history,
  fulfillment,
  assignees,
  closeOrder,
  reopenOrder,
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
  syncOrderPrioritiesFromEdd,
  processOrderJob,
  syncFromGoogleSheet,
  superSheetUpdate,
};
