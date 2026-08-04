/**
 * @fileoverview Email Service: service methods specific to Email messages.
 * @module modules/messages/email.service
 */
const messageService = require('./message.service');
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');

/**
 * Creates and queues a new outbound email.
 */
async function sendEmailMessage(data) {
  const { recipient, subject, body, templateName, templateParams, orderId } = data;

  const messageData = {
    recipient,
    channel: 'email',
    subject: subject || 'Notification',
    body: body || '',
    templateName: templateName || undefined,
    templateParams: templateParams || undefined,
    order: orderId || undefined,
  };

  return messageService.createAndQueueMessage(messageData);
}

/**
 * List email messages with filtering and pagination.
 */
async function listEmails(filter = {}, options = {}) {
  const { Message } = getModels();
  const limit = Math.min(Number(options.limit) || 20, 100);
  const page = Math.max(Number(options.page) || 1, 1);
  const skip = (page - 1) * limit;

  const mongoFilter = { channel: 'email' };
  if (filter.order) mongoFilter.order = filter.order;
  if (filter.status) mongoFilter.status = filter.status;
  if (filter.recipient) {
    mongoFilter.recipient = { $regex: filter.recipient, $options: 'i' };
  }

  const [total, rows] = await Promise.all([
    Message.countDocuments(mongoFilter),
    Message.find(mongoFilter)
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
    data: rows.map((r) => toPlain(r)),
  };
}

/**
 * Get an email message by its ID.
 */
async function getEmailById(id) {
  const { Message } = getModels();
  const row = await Message.findOne({ _id: id, channel: 'email' }).lean();
  return row ? toPlain(row) : null;
}

module.exports = {
  sendEmailMessage,
  listEmails,
  getEmailById,
};
