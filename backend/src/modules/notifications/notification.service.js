/**
 * @fileoverview Notifications: business rules and mongoose persistence helpers.
 * @module modules/notifications/notification.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const notificationQueue = require('../../queues/notification.queue');
const sse = require('../../config/sse');

async function createForUser(userId, payload) {
  const { Notification } = getModels();
  const row = await Notification.create({
    user: userId,
    title: payload.title,
    message: payload.message,
    type: payload.type || 'info',
    module: payload.module || 'system',
    entity_type: payload.entity_type,
    entity_id: payload.entity_id || undefined,
    is_read: false,
  });
  const plain = toPlain(row.toObject());

  // Push to any connected SSE clients for this user in real-time
  sse.emitToUser(String(userId), 'notification', plain);

  return plain;
}

/**
 * Enqueue an order transition notification job to the background worker.
 * Decoupled from the HTTP request lifecycle via BullMQ.
 * @param {{ order: object, fromStatus: string, nextStatus: string, actorId: string }} params
 */
async function notifyOrderTransition({ order, fromStatus, nextStatus, actorId }) {
  await notificationQueue.enqueue({
    type: 'order_transition',
    payload: { order, fromStatus, nextStatus, actorId },
  });
}

/**
 * Background processor: called by the notification worker.
 * Resolves target users and writes notification documents to the database.
 * Also pushes real-time SSE events to connected clients.
 * @param {{ order: object, fromStatus: string, nextStatus: string, actorId: string }} params
 */
async function processOrderTransition({ order, fromStatus, nextStatus, actorId }) {
  const title = `Order ${order.order_no} updated`;
  const message = `Status changed: ${fromStatus} → ${nextStatus}`;
  const targets = new Set(
    [order.created_by, order.assigned_sales_user, actorId].filter(Boolean)
  );
  for (const uid of targets) {
    // createForUser already emits the SSE event internally
    await createForUser(uid, {
      title,
      message,
      type: 'info',
      module: 'order',
      entity_type: 'order',
      entity_id: order._id,
    });
  }
}

async function listForUser(userId, { unreadOnly } = {}) {
  const { Notification } = getModels();
  const q = { user: userId };
  if (unreadOnly) q.is_read = false;
  const rows = await Notification.find(q).sort({ createdAt: -1 }).lean();
  return rows.map((r) => toPlain(r));
}

async function markRead(userId, id) {
  const { Notification } = getModels();
  const row = await Notification.findOneAndUpdate(
    { _id: id, user: userId },
    { is_read: true, read_at: new Date() },
    { new: true }
  ).lean();
  return row ? toPlain(row) : null;
}

module.exports = {
  createForUser,
  notifyOrderTransition,
  processOrderTransition,
  listForUser,
  markRead,
};
