/**
 * @fileoverview Order delivery service logic.
 * @module modules/orderDelivery/orderDelivery.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const { softDeleteActiveById, restoreSoftDeletedById, listDeletedLean } = require('../../utils/mongoSoftDelete');
const activityService = require('../activity/activity.service');
const fulfillmentService = require('../orders/orderFulfillment.service');
const orderQueue = require('../../queues/order.queue');
const transportService = require('../transport/transport.service');
const orderReturnService = require('../orderReturn/orderReturn.service');
const {
  ORDER_STATUS,
  ORDER_WORKFLOW_STAGE,
} = require('../orders/order.constants');

const DEL_NF = 'Order delivery not found';

function generateDeliveryNo() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DEL-${ts}-${rand}`;
}

async function list({ order, dispatch, transport, delivery_status } = {}) {
  const q = { deletedAt: null };
  if (order) q.order = order;
  if (dispatch) q.dispatch = dispatch;
  if (transport) q.transport = transport;
  if (delivery_status) q.delivery_status = delivery_status;

  const rows = await getModels().OrderDelivery.find(q)
    .populate('order')
    .populate('dispatch')
    .populate('transport')
    .populate('delivery_items.product')
    .sort({ createdAt: -1 })
    .lean();
  return rows.map(toPlain);
}

async function get(id) {
  const row = await getModels().OrderDelivery.findById(id)
    .populate('order')
    .populate('dispatch')
    .populate('transport')
    .populate('delivery_items.product')
    .lean();
  if (!row) throw new ApiError(404, DEL_NF);
  return toPlain(row);
}

async function createDeliveryRecord(body, user, { skipRecalculate = false } = {}) {
  const { OrderDelivery, Order, OrderDispatch } = getModels();

  const orderExists = await Order.exists({ _id: body.order });
  if (!orderExists) throw new ApiError(404, 'Order not found');

  const dispatchExists = await OrderDispatch.exists({ _id: body.dispatch, order: body.order });
  if (!dispatchExists) throw new ApiError(404, 'Order dispatch not found');

  const items = Array.isArray(body.delivery_items) ? body.delivery_items : [];

  const doc = await OrderDelivery.create({
    delivery_no: body.delivery_no || generateDeliveryNo(),
    order: body.order,
    dispatch: body.dispatch,
    transport: body.transport || undefined,
    delivery_status: body.delivery_status || 'pending',
    delivery_items: items.map((item) => ({
      product: item.product,
      delivered_quantity: item.delivered_quantity,
      remarks: item.remarks || '',
    })),
    delivered_by: body.delivered_by || undefined,
    delivered_at: body.delivered_at ? new Date(body.delivered_at) : undefined,
    actual_delivery_date: body.actual_delivery_date ? new Date(body.actual_delivery_date) : undefined,
    received_by: body.received_by || '',
    delivery_proof_url: body.delivery_proof_url || '',
    remarks: body.remarks || '',
    created_by: user._id,
  });

  await activityService.create({
    actor: user._id,
    entity_type: 'delivery',
    entity_id: doc._id.toString(),
    action: 'created',
    message: `Delivery record ${doc.delivery_no} created for order ID ${body.order}`,
  });

  if (!skipRecalculate) {
    await fulfillmentService.recalculateFromExecutions(body.order, user);
  }

  return doc;
}

function validateShipmentDeliveryPayload(body) {
  const deliveryType = String(body.delivery_type || '').toLowerCase();
  if (!['full', 'partial'].includes(deliveryType)) {
    throw new ApiError(400, 'delivery_type must be full or partial');
  }
  if (!body.order) throw new ApiError(400, 'order is required');
  if (!body.dispatch) throw new ApiError(400, 'dispatch is required');
  if (!body.transport) throw new ApiError(400, 'transport is required');

  const deliveryItems = Array.isArray(body.delivery_items) ? body.delivery_items : [];
  const returnItems = Array.isArray(body.return_items) ? body.return_items : [];

  const deliveredLines = deliveryItems.filter((item) => Number(item.delivered_quantity) > 0);
  const returnedLines = returnItems.filter((item) => Number(item.returned_quantity) > 0);

  if (deliveryType === 'full') {
    if (deliveredLines.length === 0) {
      throw new ApiError(400, 'Full delivery requires at least one delivered line');
    }
    if (returnedLines.length > 0) {
      throw new ApiError(400, 'Full delivery cannot include return lines');
    }
  } else if (deliveredLines.length === 0 && returnedLines.length === 0) {
    throw new ApiError(400, 'Partial delivery requires delivered and/or returned quantities');
  }

  for (const item of returnedLines) {
    if (!String(item.return_reason || item.remarks || '').trim()) {
      throw new ApiError(400, 'Each returned line requires a return reason or remark');
    }
  }

  return { deliveryType, deliveredLines, returnedLines };
}

async function enqueuePostShipmentDeliveryJobs(orderId, userId, extras = {}) {
  const oid = String(orderId);
  await orderQueue.enqueue({
    type: 'post_shipment_delivery',
    payload: {
      orderId: oid,
      userId: userId ? String(userId) : undefined,
      ...extras,
    },
  });
}

async function processPostShipmentDeliveryJob(payload = {}) {
  const orderId = payload.orderId;
  if (!orderId) throw new Error('post_shipment_delivery requires orderId');
  if (!payload.userId) throw new Error('post_shipment_delivery requires userId');
  if (!payload.transportId) throw new Error('post_shipment_delivery requires transportId');

  const { Order, User } = getModels();
  const orderBefore = await Order.findById(orderId).lean();
  if (!orderBefore) return { orderId, skipped: true };

  const actor = await User.findById(payload.userId).lean();
  if (!actor) throw new Error(`post_shipment_delivery user not found: ${payload.userId}`);
  const user = toPlain(actor);

  await transportService.applyTransportDeliveryOutcome(
    payload.transportId,
    {
      status: payload.transportStatus || 'delivered',
      remarks: payload.statusRemarks || '',
    },
    user,
  );

  if (payload.deliveryType === 'partial' || payload.hasReturns) {
    await fulfillmentService.syncOrderLineReturnedQuantitiesFromReturns(orderId);
  }

  const orderState = await transportService.recalculateOrderShipmentState(orderId, user);
  if (!orderState) return { orderId, skipped: true };

  const workflowAction = payload.deliveryType === 'partial'
    ? 'partial_delivery'
    : transportService.workflowActionForShipmentStatus(payload.transportStatus || 'delivered');

  await getModels().OrderWorkflow.create({
    order: orderId,
    action_by: payload.userId,
    role: transportService.workflowRoleForUser(user),
    action: workflowAction,
    from_stage: orderBefore.workflow_stage,
    to_stage: orderState.workflow_stage || ORDER_WORKFLOW_STAGE.DISPATCH,
    from_status: orderBefore.status,
    to_status: orderState.status || ORDER_STATUS.DELIVERED,
    remarks: payload.statusRemarks || '',
    revision_number: orderState.current_revision || orderBefore.current_revision || 1,
    metadata: {
      transport_shipment_id: String(payload.transportId),
      delivery_id: payload.deliveryId ? String(payload.deliveryId) : undefined,
      return_id: payload.returnId ? String(payload.returnId) : undefined,
      delivery_type: payload.deliveryType,
      event: 'shipment_delivery_logged',
    },
  });

  return {
    orderId,
    status: orderState.status,
    lifecycle_status: orderState.lifecycle_status,
    current_action: orderState.current_action,
  };
}

async function logShipmentDelivery(body, user) {
  const { deliveryType, deliveredLines, returnedLines } = validateShipmentDeliveryPayload(body);
  const transportStatus = deliveredLines.length > 0 ? 'delivered' : 'returned';

  let deliveryDoc = null;
  if (deliveredLines.length > 0) {
    deliveryDoc = await createDeliveryRecord({
      order: body.order,
      dispatch: body.dispatch,
      transport: body.transport,
      delivery_status: 'delivered',
      delivery_items: deliveredLines,
      received_by: body.received_by || '',
      remarks: body.remarks || '',
      actual_delivery_date: body.actual_delivery_date || new Date().toISOString(),
      delivered_at: body.delivered_at || new Date().toISOString(),
    }, user, { skipRecalculate: true });
  }

  let returnDoc = null;
  if (returnedLines.length > 0) {
    returnDoc = await orderReturnService.create({
      order: body.order,
      dispatch: body.dispatch,
      transport: body.transport,
      delivery: deliveryDoc?._id,
      return_status: 'pending',
      return_items: returnedLines.map((item) => ({
        product: item.product,
        returned_quantity: Number(item.returned_quantity),
        return_reason: item.return_reason || item.remarks || 'Customer rejection / Partial delivery',
        remarks: item.remarks || '',
      })),
      remarks: body.return_remarks || body.remarks || 'Returns from partial delivery',
    }, user);
  }

  await enqueuePostShipmentDeliveryJobs(body.order, user._id, {
    transportId: String(body.transport),
    deliveryType,
    transportStatus,
    statusRemarks: body.status_remarks || '',
    hasReturns: returnedLines.length > 0,
    deliveryId: deliveryDoc ? String(deliveryDoc._id) : undefined,
    returnId: returnDoc?._id ? String(returnDoc._id) : undefined,
  });

  return {
    delivery: deliveryDoc ? toPlain(deliveryDoc.toObject()) : null,
    order_return: returnDoc || null,
    queued: true,
    transport_status: transportStatus,
    delivery_type: deliveryType,
  };
}

async function create(body, user) {
  const doc = await createDeliveryRecord(body, user);
  return toPlain(doc.toObject());
}

async function patch(id, patchBody, user) {
  const { OrderDelivery } = getModels();
  const doc = await OrderDelivery.findById(id);
  if (!doc) throw new ApiError(404, DEL_NF);

  const patch = patchBody || {};
  for (const field of [
    'transport',
    'delivery_status',
    'delivered_by',
    'received_by',
    'delivery_proof_url',
    'remarks',
  ]) {
    if (patch[field] !== undefined) doc[field] = patch[field] || undefined;
  }

  for (const dateField of ['delivered_at', 'actual_delivery_date']) {
    if (patch[dateField] !== undefined) {
      doc[dateField] = patch[dateField] ? new Date(patch[dateField]) : undefined;
    }
  }

  if (Array.isArray(patch.delivery_items)) {
    doc.delivery_items = patch.delivery_items.map(item => ({
      product: item.product,
      delivered_quantity: item.delivered_quantity,
      remarks: item.remarks || '',
    }));
  }

  await doc.save();

  await activityService.create({
    actor: user._id,
    entity_type: 'delivery',
    entity_id: doc._id.toString(),
    action: 'updated',
    message: `Delivery record ${doc.delivery_no} updated`,
  });

  await fulfillmentService.recalculateFromExecutions(doc.order, user);

  return toPlain(doc.toObject());
}

async function listDeleted({ order } = {}) {
  const q = {};
  if (order) q.order = order;
  const rows = await listDeletedLean(getModels().OrderDelivery, q);
  return rows.map(toPlain);
}

async function softDelete(id, user) {
  const doc = await softDeleteActiveById(getModels().OrderDelivery, id, { notFoundMessage: DEL_NF });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'delivery',
    entity_id: plain._id,
    action: 'deleted',
    message: `Delivery record ${plain.delivery_no} soft-deleted`,
  });
  return plain;
}

async function restore(id, user) {
  const doc = await restoreSoftDeletedById(getModels().OrderDelivery, id, { notFoundMessage: DEL_NF });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'delivery',
    entity_id: plain._id,
    action: 'restored',
    message: `Delivery record ${plain.delivery_no} restored`,
  });
  return plain;
}

module.exports = {
  list,
  get,
  create,
  logShipmentDelivery,
  processPostShipmentDeliveryJob,
  patch,
  listDeleted,
  softDelete,
  restore,
};
