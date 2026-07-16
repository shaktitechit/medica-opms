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
  if (deliveryType !== 'full') {
    throw new ApiError(400, 'Only full delivery is supported');
  }
  if (!body.order) throw new ApiError(400, 'order is required');
  if (!body.dispatch) throw new ApiError(400, 'dispatch is required');
  if (!body.transport) throw new ApiError(400, 'transport is required');

  const deliveryItems = Array.isArray(body.delivery_items) ? body.delivery_items : [];
  const returnItems = Array.isArray(body.return_items) ? body.return_items : [];

  const deliveredLines = deliveryItems.filter((item) => Number(item.delivered_quantity) > 0);
  if (deliveredLines.length === 0) {
    throw new ApiError(400, 'Full delivery requires at least one delivered line');
  }
  if (returnItems.length > 0) {
    throw new ApiError(400, 'Full delivery cannot include return lines');
  }

  return { deliveryType, deliveredLines };
}

async function assertFullDeliveryMatchesDispatch(body, deliveredLines) {
  const { OrderDelivery, OrderDispatch } = getModels();
  const dispatch = await OrderDispatch.findOne({
    _id: body.dispatch,
    order: body.order,
    deletedAt: null,
    dispatch_status: { $ne: 'cancelled' },
  }).lean();
  if (!dispatch) throw new ApiError(404, 'Order dispatch not found');

  const existingDelivery = await OrderDelivery.exists({
    dispatch: body.dispatch,
    transport: body.transport,
    deletedAt: null,
  });
  if (existingDelivery) {
    throw new ApiError(400, 'A delivery is already recorded for this shipment');
  }

  const expectedByProduct = new Map();
  for (const item of dispatch.dispatch_items || []) {
    const productId = String(item.product?._id ?? item.product ?? '');
    const quantity = Number(item.dispatched_quantity ?? item.dispatch_quantity ?? 0);
    if (!productId || quantity <= 0) continue;
    expectedByProduct.set(productId, (expectedByProduct.get(productId) || 0) + quantity);
  }

  const deliveredByProduct = new Map();
  for (const item of deliveredLines) {
    const productId = String(item.product?._id ?? item.product ?? '');
    const quantity = Number(item.delivered_quantity || 0);
    if (!productId || quantity <= 0) {
      throw new ApiError(400, 'Every delivery line requires a product and positive quantity');
    }
    deliveredByProduct.set(productId, (deliveredByProduct.get(productId) || 0) + quantity);
  }

  if (
    expectedByProduct.size === 0 ||
    expectedByProduct.size !== deliveredByProduct.size
  ) {
    throw new ApiError(400, 'Full delivery must include every dispatched product');
  }

  for (const [productId, dispatchedQuantity] of expectedByProduct) {
    if (deliveredByProduct.get(productId) !== dispatchedQuantity) {
      throw new ApiError(
        400,
        `Full delivery quantity must equal dispatched quantity for product ${productId}`,
      );
    }
  }
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

  const orderState = await transportService.recalculateOrderShipmentState(orderId, user);
  if (!orderState) return { orderId, skipped: true };

  const workflowAction =
    transportService.workflowActionForShipmentStatus(payload.transportStatus || 'delivered');

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
  const { deliveryType, deliveredLines } = validateShipmentDeliveryPayload(body);
  await assertFullDeliveryMatchesDispatch(body, deliveredLines);
  const transportStatus = 'delivered';

  const deliveryDoc = await createDeliveryRecord({
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

  await enqueuePostShipmentDeliveryJobs(body.order, user._id, {
    transportId: String(body.transport),
    deliveryType,
    transportStatus,
    statusRemarks: body.status_remarks || '',
    deliveryId: String(deliveryDoc._id),
  });

  return {
    delivery: toPlain(deliveryDoc.toObject()),
    queued: true,
    transport_status: transportStatus,
    delivery_type: deliveryType,
  };
}

async function patch(id, patchBody, user) {
  const { OrderDelivery } = getModels();
  const doc = await OrderDelivery.findById(id);
  if (!doc) throw new ApiError(404, DEL_NF);

  const patch = patchBody || {};
  for (const field of [
    'transport',
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
  logShipmentDelivery,
  processPostShipmentDeliveryJob,
  patch,
  listDeleted,
  softDelete,
  restore,
};
