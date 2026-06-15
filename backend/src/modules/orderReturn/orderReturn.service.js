/**
 * @fileoverview Order return service logic.
 * @module modules/orderReturn/orderReturn.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const { softDeleteActiveById, restoreSoftDeletedById, listDeletedLean } = require('../../utils/mongoSoftDelete');
const activityService = require('../activity/activity.service');

const RET_NF = 'Order return not found';

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

async function create(body, user) {
  const { OrderReturn, Order } = getModels();

  const orderExists = await Order.exists({ _id: body.order });
  if (!orderExists) throw new ApiError(404, 'Order not found');

  const items = Array.isArray(body.return_items) ? body.return_items : [];

  const doc = await OrderReturn.create({
    return_no: body.return_no || generateReturnNo(),
    order: body.order,
    dispatch: body.dispatch || undefined,
    transport: body.transport || undefined,
    delivery: body.delivery || undefined,
    return_status: body.return_status || 'pending',
    return_items: items.map(item => ({
      product: item.product,
      returned_quantity: item.returned_quantity,
      return_reason: item.return_reason || '',
      remarks: item.remarks || '',
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
    'return_status',
    'returned_by',
    'received_by',
    'remarks',
  ]) {
    if (patch[field] !== undefined) doc[field] = patch[field] || undefined;
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

module.exports = {
  list,
  get,
  create,
  patch,
  listDeleted,
  softDelete,
  restore,
};
