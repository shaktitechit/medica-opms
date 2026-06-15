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

async function create(body, user) {
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
    delivery_items: items.map(item => ({
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

  await fulfillmentService.recalculateFromExecutions(body.order, user);

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
  patch,
  listDeleted,
  softDelete,
  restore,
};
