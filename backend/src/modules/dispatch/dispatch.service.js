/**
 * @fileoverview Order dispatch execution helpers backed by OrderDispatch.
 * @module modules/dispatch/dispatch.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const { generateDispatchNo } = require('../../utils/generateDispatchNo');
const { softDeleteActiveById, restoreSoftDeletedById, listDeletedLean } = require('../../utils/mongoSoftDelete');
const activityService = require('../activity/activity.service');
const { assertOrderEligibleForDispatchPhase } = require('./dispatch.policy');
const fulfillmentService = require('../orders/orderFulfillment.service');

const DISP_NF = 'Order dispatch not found';

function isObjectId(value) {
  return typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value);
}

function resolveWarehouseFields(body = {}) {
  const rawWarehouse = body.warehouse;
  const rawLocation = body.warehouse_location;
  const warehouseRef =
    rawWarehouse && isObjectId(String(rawWarehouse)) ? String(rawWarehouse) : undefined;
  const locationFromWarehouse =
    rawWarehouse && !warehouseRef ? String(rawWarehouse).trim() : '';
  const warehouseLocation = String(rawLocation || locationFromWarehouse || '').trim();

  return {
    warehouse: warehouseRef,
    warehouse_location: warehouseLocation || undefined,
  };
}

function getOrderedQuantity(line) {
  return Number(line.ordered_quantity ?? line.quantity ?? 0);
}

function normalizeDispatchStatus(value, fallback = 'draft') {
  const allowed = new Set([
    'draft',
    'allocation_pending',
    'allocated',
    'packing',
    'partially_dispatched',
    'fully_dispatched',
    'cancelled',
  ]);
  return allowed.has(value) ? value : fallback;
}

function normalizeItems(order, rawItems, excludeDispatchId = null) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new ApiError(400, 'dispatch_items[] or items[] required');
  }

  return rawItems.map((raw) => {
    const orderItemId = raw.order_item_id;
    const line = (order.order_items || []).find((item) => String(item._id) === String(orderItemId));
    if (!line) throw new ApiError(400, `Unknown order_item_id ${orderItemId}`);

    const dispatchedQuantity = Number(raw.dispatched_quantity ?? raw.dispatch_quantity ?? 0);
    const allocatedQuantity = Number(raw.allocated_quantity ?? dispatchedQuantity);
    if (dispatchedQuantity < 0 || allocatedQuantity < 0) {
      throw new ApiError(400, 'Dispatch quantities cannot be negative');
    }

    return {
      order_item_id: orderItemId,
      product: raw.product || line.product,
      batch: raw.batch || undefined,
      allocated_quantity: allocatedQuantity,
      dispatched_quantity: dispatchedQuantity,
      delivered_quantity: Number(raw.delivered_quantity || 0),
      remarks: raw.remarks || '',
    };
  });
}

async function validateDispatchItems(order, rawItems, excludeDispatchId = null) {
  const { OrderDispatch } = getModels();
  const dispatches = await OrderDispatch.find({
    order: order._id,
    deletedAt: null,
    dispatch_status: { $ne: 'cancelled' },
  }).lean();
  const alreadyDispatchedByLine = fulfillmentService.aggregateDispatchedByLine(dispatches, excludeDispatchId);
  const normalized = normalizeItems(order, rawItems, excludeDispatchId);
  fulfillmentService.assertDispatchItemQuantities(order, normalized, alreadyDispatchedByLine);
  return normalized;
}

async function list({ order, dispatch_status } = {}) {
  const q = {};
  if (order) q.order = order;
  if (dispatch_status) q.dispatch_status = dispatch_status;
  const rows = await getModels().OrderDispatch.find(q)
    .populate('finance_approval', 'approval_no')
    .populate('bill_document', 'original_name url mime_type')
    .populate('dispatch_assignee_user', 'name username email department')
    .sort({ createdAt: -1 })
    .lean();
  return rows.map(toPlain);
}

async function get(id) {
  const row = await getModels().OrderDispatch.findById(id)
    .populate('finance_approval')
    .populate('bill_document', 'original_name url mime_type')
    .populate('dispatch_assignee_user', 'name username email department')
    .lean();
  if (!row) throw new ApiError(404, DISP_NF);
  return toPlain(row);
}

async function recalculateOrderDispatchState(orderId, user) {
  const state = await fulfillmentService.recalculateFromExecutions(orderId, user);
  return {
    order: state.order,
    fullyDispatched: state.fullyDispatched,
  };
}

async function create(body, user) {
  const { Order, OrderDispatch, OrderWorkflow } = getModels();
  const orderDoc = await Order.findById(body.order);
  if (!orderDoc) throw new ApiError(404, 'Order not found');

  const order = toPlain(orderDoc.toObject());
  assertOrderEligibleForDispatchPhase(order);

  const dispatchItems = await validateDispatchItems(order, body.dispatch_items || body.items);
  const requestedStatus = normalizeDispatchStatus(body.dispatch_status || body.status, null);

  const warehouseFields = resolveWarehouseFields(body);

  const doc = await OrderDispatch.create({
    dispatch_no: body.dispatch_no || generateDispatchNo(),
    order: body.order,
    finance_approval: body.finance_approval || undefined,
    warehouse: warehouseFields.warehouse,
    warehouse_location: warehouseFields.warehouse_location,
    dispatch_status: requestedStatus || 'partially_dispatched',
    dispatch_items: dispatchItems,
    packed_by: body.packed_by || undefined,
    dispatched_by: body.dispatched_by || user._id,
    dispatch_assignee_user: body.dispatch_assignee_user || undefined,
    packed_at: body.packed_at ? new Date(body.packed_at) : undefined,
    dispatched_at: body.dispatched_at || body.dispatch_date
      ? new Date(body.dispatched_at || body.dispatch_date)
      : new Date(),
    bill_number: body.bill_number ? String(body.bill_number).trim() : undefined,
    billing_date: body.billing_date ? new Date(body.billing_date) : undefined,
    bill_document: body.bill_document || undefined,
    remarks: body.remarks || '',
    created_by: user._id,
  });

  const state = await recalculateOrderDispatchState(body.order, user);
  if (!requestedStatus) {
    doc.dispatch_status = state.fullyDispatched ? 'fully_dispatched' : 'partially_dispatched';
    await doc.save();
  }

  await OrderWorkflow.create({
    order: body.order,
    action_by: user._id,
    role: user.department === 'admin'
      ? 'admin'
      : user.department === 'account'
        ? 'account'
        : 'dispatch',
    action: state.fullyDispatched ? 'full_dispatch' : 'partial_dispatch',
    to_stage: 'dispatch_execution',
    to_status: state.order.dispatch_status,
    remarks: body.remarks || `Dispatch ${doc.dispatch_no} recorded`,
    revision_number: state.order.current_revision,
  });

  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'dispatch',
    entity_id: plain._id,
    action: 'created',
    message: `Order dispatch ${plain.dispatch_no} recorded for order ${order.order_no}`,
  });

  return plain;
}

async function patch(id, patchBody, user) {
  const { OrderDispatch } = getModels();
  const existing = await OrderDispatch.findById(id);
  if (!existing) throw new ApiError(404, DISP_NF);

  const patch = patchBody || {};
  if (user.department === 'account') {
    const allowed = new Set(['bill_number', 'billing_date', 'bill_document', 'dispatch_assignee_user']);
    const keys = Object.keys(patch);
    if (keys.some((key) => !allowed.has(key))) {
      throw new ApiError(403, 'Account users may only update billing fields on a dispatch');
    }
  }
  if (patch.dispatch_status || patch.status) {
    existing.dispatch_status = normalizeDispatchStatus(patch.dispatch_status || patch.status, existing.dispatch_status);
  }
  if (patch.dispatch_items || patch.items) {
    const order = await getModels().Order.findById(existing.order).lean();
    if (!order) throw new ApiError(404, 'Order not found');
    existing.dispatch_items = await validateDispatchItems(toPlain(order), patch.dispatch_items || patch.items, existing._id);
  }
  if (patch.finance_approval !== undefined) {
    existing.finance_approval = patch.finance_approval || undefined;
  }
  if (patch.warehouse !== undefined || patch.warehouse_location !== undefined) {
    const warehouseFields = resolveWarehouseFields({
      warehouse: patch.warehouse !== undefined ? patch.warehouse : existing.warehouse,
      warehouse_location:
        patch.warehouse_location !== undefined
          ? patch.warehouse_location
          : existing.warehouse_location,
    });
    existing.warehouse = warehouseFields.warehouse;
    existing.warehouse_location = warehouseFields.warehouse_location;
  }
  if (patch.bill_number !== undefined) {
    existing.bill_number = patch.bill_number ? String(patch.bill_number).trim() : '';
  }
  if (patch.billing_date !== undefined) {
    existing.billing_date = patch.billing_date ? new Date(patch.billing_date) : undefined;
  }
  if (patch.bill_document !== undefined) {
    existing.bill_document = patch.bill_document || undefined;
  }
  if (patch.dispatch_assignee_user !== undefined) {
    existing.dispatch_assignee_user = patch.dispatch_assignee_user || undefined;
  }
  if (patch.remarks !== undefined) existing.remarks = patch.remarks || '';
  if (patch.packed_at !== undefined) existing.packed_at = patch.packed_at ? new Date(patch.packed_at) : undefined;
  if (patch.dispatched_at !== undefined) {
    existing.dispatched_at = patch.dispatched_at ? new Date(patch.dispatched_at) : undefined;
  }
  if (existing.dispatch_status === 'fully_dispatched') existing.dispatched_by = user._id;

  await existing.save();
  await recalculateOrderDispatchState(existing.order, user);
  return toPlain(existing.toObject());
}

async function listDeleted({ order } = {}) {
  const q = {};
  if (order) q.order = order;
  const rows = await listDeletedLean(getModels().OrderDispatch, q);
  return rows.map(toPlain);
}

async function softDelete(id, user) {
  const doc = await softDeleteActiveById(getModels().OrderDispatch, id, { notFoundMessage: DISP_NF });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'dispatch',
    entity_id: plain._id,
    action: 'deleted',
    message: `Order dispatch ${plain.dispatch_no} soft-deleted`,
  });
  await recalculateOrderDispatchState(plain.order, user);
  return plain;
}

async function restore(id, user) {
  const doc = await restoreSoftDeletedById(getModels().OrderDispatch, id, { notFoundMessage: DISP_NF });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'dispatch',
    entity_id: plain._id,
    action: 'restored',
    message: `Order dispatch ${plain.dispatch_no} restored`,
  });
  await recalculateOrderDispatchState(plain.order, user);
  return plain;
}

module.exports = { list, get, create, patch, listDeleted, softDelete, restore, recalculateOrderDispatchState };
