/**
 * @fileoverview Order return service logic.
 * @module modules/orderReturn/orderReturn.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const orderQueue = require('../../queues/order.queue');
const {
  ORDER_STATUS,
  ORDER_WORKFLOW_STAGE,
  ORDER_LIFECYCLE_STATUS,
  FULFILLMENT_STATUS,
  normalizeOrderWorkflowFields,
} = require('../orders/order.constants');
const { ApiError } = require('../../utils/ApiError');
const { softDeleteActiveById, restoreSoftDeletedById, listDeletedLean } = require('../../utils/mongoSoftDelete');
const activityService = require('../activity/activity.service');
const {
  ORDER_RETURN_STATUS,
  ORDER_RETURN_STATUS_VALUES,
  normalizeReturnStatus,
} = require('../../constants/orderReturnStatus');

const RET_NF = 'Order return not found';

function assertValidReturnStatus(status) {
  const normalized = normalizeReturnStatus(status);
  if (!ORDER_RETURN_STATUS_VALUES.includes(normalized)) {
    throw new ApiError(
      400,
      `Invalid return_status. Allowed: ${ORDER_RETURN_STATUS_VALUES.join(', ')}`,
    );
  }
  return normalized;
}

function generateReturnNo() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `RET-${ts}-${rand}`;
}

async function list({ order, dispatch, transport, delivery, return_status } = {}) {
  const q = { deletedAt: null };
  if (order) q.order = order;
  if (dispatch) q.dispatch = dispatch;
  if (transport) q.transport = transport;
  if (delivery) q.delivery = delivery;
  if (return_status) q.return_status = return_status;

  const rows = await getModels().OrderReturn.find(q)
    .populate('order')
    .populate('dispatch')
    .populate('transport')
    .populate('delivery')
    .sort({ createdAt: -1 })
    .lean();
  return rows.map(toPlain);
}

async function get(id) {
  const row = await getModels().OrderReturn.findById(id)
    .populate('order')
    .populate('dispatch')
    .populate('transport')
    .populate('delivery')
    .lean();
  if (!row) throw new ApiError(404, RET_NF);
  return toPlain(row);
}

/**
 * Create a new OrderReturn record.
 *
 * @param {object} body
 * @param {object} user
 * @param {{ skipPostJob?: boolean }} [options]
 *   skipPostJob: when true, the post_order_return background job is NOT enqueued.
 *   Use this when the caller (e.g. logShipmentDelivery) already enqueues its own
 *   comprehensive job (post_shipment_delivery) that handles order status + workflow,
 *   so we avoid double-queueing and race conditions.
 */
async function create(body, user, options = {}) {
  const { OrderReturn, Order } = getModels();

  const orderExists = await Order.exists({ _id: body.order });
  if (!orderExists) throw new ApiError(404, 'Order not found');

  const items = Array.isArray(body.return_items) ? body.return_items : [];
  const returnStatus = assertValidReturnStatus(body.return_status || ORDER_RETURN_STATUS.PENDING);

  const doc = await OrderReturn.create({
    return_no: body.return_no || generateReturnNo(),
    order: body.order,
    dispatch: body.dispatch || undefined,
    transport: body.transport || undefined,
    delivery: body.delivery || undefined,
    return_status: returnStatus,
    return_items: items.map(item => ({
      product: item.product,
      returned_quantity: item.returned_quantity,
      return_reason: item.return_reason || '',
      remarks: item.remarks || '',
      expiry_type: item.expiry_type || 'other',
      expiry_date: item.expiry_date ? new Date(item.expiry_date) : undefined,
    })),
    returned_by: body.returned_by || '',
    received_by: body.received_by || undefined,
    received_at: body.received_at ? new Date(body.received_at) : undefined,
    remarks: body.remarks || '',
    created_by: user._id,
  });

  await activityService.create({
    actor: user._id,
    entity_type: 'return',
    entity_id: doc._id.toString(),
    action: 'created',
    message: `Return record ${doc.return_no} created for order ID ${body.order}`,
  });

  // Immediately sync dispatch-level returned_quantity so the dispatch items reflect
  // the accumulated return totals (sum of ALL OrderReturn docs for this dispatch)
  // before the HTTP response is sent. This is synchronous intentionally.
  try {
    const fulfillmentService = require('../orders/orderFulfillment.service');
    await fulfillmentService.syncDispatchDeliveredQuantities(String(doc.order));
  } catch (syncErr) {
    // Non-fatal: background job will retry
    require('../../config/logger').logger.warn(
      `[orderReturn.create] syncDispatchDeliveredQuantities failed: ${syncErr.message}`,
    );
  }

  // Enqueue background jobs to sync dispatch quantities and update order workflow/status.
  // Skipped when the caller (e.g. logShipmentDelivery) already handles this
  // via its own comprehensive background job to avoid race conditions.
  if (!options.skipPostJob) {
    const dispatchService = require('../dispatch/dispatch.service');
    const orderId = String(doc.order);
    await dispatchService.enqueueDispatchJob({
      type: 'sync_dispatch_quantities',
      payload: { orderId, userId: String(user._id) },
    });
    if (body.dispatch) {
      await dispatchService.enqueueDispatchJob({
        type: 'sync_dispatch_status',
        payload: { dispatchId: String(body.dispatch), userId: String(user._id) },
      });
    }

    await orderQueue.enqueue({
      type: 'post_order_return',
      payload: {
        orderId,
        userId: String(user._id),
        returnId: String(doc._id),
        dispatchId: body.dispatch ? String(body.dispatch) : undefined,
        transportId: body.transport ? String(body.transport) : undefined,
        remarks: body.remarks || 'Product return logged',
      },
    });
  }

  return toPlain(doc.toObject());
}

async function patch(id, patchBody, user) {
  const { OrderReturn } = getModels();
  const doc = await OrderReturn.findById(id);
  if (!doc) throw new ApiError(404, RET_NF);

  const patch = patchBody || {};
  for (const field of [
    'dispatch',
    'transport',
    'delivery',
    'returned_by',
    'received_by',
    'remarks',
  ]) {
    if (patch[field] !== undefined) doc[field] = patch[field] || undefined;
  }

  if (patch.return_status !== undefined) {
    doc.return_status = assertValidReturnStatus(patch.return_status);
  }

  if (patch.received_at !== undefined) {
    doc.received_at = patch.received_at ? new Date(patch.received_at) : undefined;
  }

  if (Array.isArray(patch.return_items)) {
    doc.return_items = patch.return_items.map(item => ({
      product: item.product,
      returned_quantity: item.returned_quantity,
      return_reason: item.return_reason || '',
      remarks: item.remarks || '',
      expiry_type: item.expiry_type || 'other',
      expiry_date: item.expiry_date ? new Date(item.expiry_date) : undefined,
    }));
  }

  await doc.save();

  await activityService.create({
    actor: user._id,
    entity_type: 'return',
    entity_id: doc._id.toString(),
    action: 'updated',
    message: `Return record ${doc.return_no} updated`,
  });

  return toPlain(doc.toObject());
}

async function listDeleted({ order } = {}) {
  const q = {};
  if (order) q.order = order;
  const rows = await listDeletedLean(getModels().OrderReturn, q);
  return rows.map(toPlain);
}

async function softDelete(id, user) {
  const doc = await softDeleteActiveById(getModels().OrderReturn, id, { notFoundMessage: RET_NF });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'return',
    entity_id: plain._id,
    action: 'deleted',
    message: `Return record ${plain.return_no} soft-deleted`,
  });
  return plain;
}

async function restore(id, user) {
  const doc = await restoreSoftDeletedById(getModels().OrderReturn, id, { notFoundMessage: RET_NF });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'return',
    entity_id: plain._id,
    action: 'restored',
    message: `Return record ${plain.return_no} restored`,
  });
  return plain;
}

/**
 * Re-sync returned quantities, recalculate fulfillment totals, and apply
 * return-aware lifecycle_status / workflow_stage / status fields on the Order.
 *
 * Reopen (previously closed order): status=dispatch, workflow_stage=dispatch,
 * lifecycle_status=partially_fulfilled.
 */
async function recalculateOrderReturnState(orderId, user) {
  const fulfillmentService = require('../orders/orderFulfillment.service');
  const { Order } = getModels();

  const orderBefore = await Order.findById(orderId).lean();
  if (!orderBefore) return null;

  const wasClosed =
    orderBefore.status === ORDER_STATUS.CLOSED || Boolean(orderBefore.closed_at);

  await fulfillmentService.syncOrderLineReturnedQuantitiesFromReturns(orderId);
  await fulfillmentService.syncDispatchDeliveredQuantities(orderId);
  await fulfillmentService.recalculateFromExecutions(orderId, user);

  const orderDoc = await Order.findById(orderId);
  if (!orderDoc) return null;

  const totalReturned = (orderDoc.order_items || []).reduce(
    (sum, line) => sum + Number(line.returned_quantity || 0),
    0,
  );
  const totalDelivered = (orderDoc.order_items || []).reduce(
    (sum, line) => sum + Number(line.delivered_quantity || 0),
    0,
  );

  const skipLifecycle = [
    ORDER_LIFECYCLE_STATUS.CANCELLED,
    ORDER_LIFECYCLE_STATUS.ON_HOLD,
  ].includes(String(orderDoc.lifecycle_status || ''));

  if (!skipLifecycle) {
    if (wasClosed) {
      orderDoc.closed_at = null;
      orderDoc.closed_by = null;
      orderDoc.closure_remarks = null;
      orderDoc.status = ORDER_STATUS.DISPATCH;
      orderDoc.workflow_stage = ORDER_WORKFLOW_STAGE.DISPATCH;
      orderDoc.lifecycle_status = ORDER_LIFECYCLE_STATUS.PARTIALLY_FULFILLED;
      orderDoc.current_action = 'partial_dispatch';
      if (totalDelivered > 0) {
        orderDoc.delivery_status = FULFILLMENT_STATUS.PARTIAL;
      }
    } else if (totalReturned > 0) {
      orderDoc.lifecycle_status = ORDER_LIFECYCLE_STATUS.PARTIALLY_FULFILLED;
      orderDoc.workflow_stage = ORDER_WORKFLOW_STAGE.DISPATCH;
      orderDoc.status = ORDER_STATUS.DISPATCH;
      orderDoc.current_action = 'return_logged';
      if (totalDelivered > 0) {
        orderDoc.delivery_status = FULFILLMENT_STATUS.PARTIAL;
      }
    }
  }

  if (user?._id) orderDoc.updated_by = user._id;
  orderDoc.markModified('order_items');
  normalizeOrderWorkflowFields(orderDoc);
  await orderDoc.save();
  return toPlain(orderDoc.toObject());
}

async function processPostOrderReturnJob(payload = {}) {
  const orderId = payload.orderId;
  const userId = payload.userId;
  const returnId = payload.returnId;
  const remarks = payload.remarks;

  if (!orderId) throw new Error('post_order_return requires orderId');
  if (!userId) throw new Error('post_order_return requires userId');
  if (!returnId) throw new Error('post_order_return requires returnId');

  const { Order, User, OrderWorkflow, OrderStatusHistory } = getModels();
  const transportService = require('../transport/transport.service');

  const orderBefore = await Order.findById(orderId).lean();
  if (!orderBefore) return { orderId, skipped: true };

  const actor = await User.findById(userId).lean();
  if (!actor) throw new Error(`post_order_return user not found: ${userId}`);
  const user = toPlain(actor);

  const wasClosed =
    orderBefore.status === ORDER_STATUS.CLOSED || Boolean(orderBefore.closed_at);

  const orderState = await recalculateOrderReturnState(orderId, user);
  if (!orderState) return { orderId, skipped: true };

  try {
    const approvalService = require('../orderApproval/orderApproval.service');
    await approvalService.reopenResolvedDispatchReleasesForOrder(
      orderId,
      payload.dispatchId ? String(payload.dispatchId) : undefined,
    );
  } catch (reopenErr) {
    require('../../config/logger').logger.warn(
      `[processPostOrderReturnJob] reopenResolvedDispatchReleasesForOrder failed: ${reopenErr.message}`,
    );
  }

  await OrderWorkflow.create({
    order: orderId,
    action_by: userId,
    role: transportService.workflowRoleForUser(user),
    action: wasClosed ? 'partial_dispatch' : 'return_logged',
    from_stage: orderBefore.workflow_stage,
    to_stage: orderState.workflow_stage || ORDER_WORKFLOW_STAGE.DISPATCH,
    from_status: orderBefore.status,
    to_status: orderState.status || ORDER_STATUS.DISPATCH,
    remarks: remarks || 'Product return logged',
    revision_number: orderState.current_revision || orderBefore.current_revision || 1,
    metadata: {
      return_id: String(returnId),
      dispatch_id: payload.dispatchId ? String(payload.dispatchId) : undefined,
      transport_id: payload.transportId ? String(payload.transportId) : undefined,
      event: 'order_return_logged',
    },
  });

  await OrderStatusHistory.create({
    order: orderId,
    from_status: orderBefore.status,
    to_status: orderState.status || orderBefore.status,
    changed_by: userId,
    remarks: remarks || 'Product return logged',
  });

  return {
    orderId,
    returnId,
    status: orderState.status,
    lifecycle_status: orderState.lifecycle_status,
    workflow_stage: orderState.workflow_stage,
    current_action: orderState.current_action,
  };
}

module.exports = {
  list,
  get,
  create,
  patch,
  listDeleted,
  softDelete,
  restore,
  recalculateOrderReturnState,
  processPostOrderReturnJob,
};
