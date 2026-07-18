/**
 * @fileoverview Message Service: low-level create, enqueue, process, and list Message docs.
 * Typed outbound flows live in modules/communication.
 * @module modules/messages/message.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const messageQueue = require('../../queues/message.queue');
const whatsappHelper = require('./helpers/whatsapp.helper');
const emailHelper = require('./helpers/email.helper');
const { WHATSAPP_TEMPLATE_LANGUAGE } = require('./whatsappTemplates.registry');
const { logger } = require('../../config/logger');

/**
 * Creates a message record, enqueues a background job, and marks it as queued.
 * @param {object} messageData - Schema fields for the message.
 * @returns {Promise<object>} The created message document (plain JS object).
 */
async function createAndQueueMessage(messageData) {
  const { Message } = getModels();

  const msg = await Message.create({
    order: messageData.order || undefined,
    recipient: messageData.recipient,
    channel: messageData.channel,
    status: 'pending',
    subject: messageData.subject,
    body: messageData.body,
    templateName: messageData.templateName,
    templateParams: messageData.templateParams,
  });

  logger.info(`[Message Service] Created message record: ${msg._id} for ${msg.recipient}`);

  try {
    await messageQueue.enqueue({ messageId: String(msg._id) });

    msg.status = 'queued';
    await msg.save();

    logger.info(`[Message Service] Enqueued message job: ${msg._id}`);
  } catch (err) {
    logger.error(`[Message Service] Failed to enqueue message job: ${msg._id}. Error: ${err.message}`);
    msg.status = 'failed';
    msg.error = `Enqueue error: ${err.message}`;
    msg.failedAt = new Date();
    await msg.save();
  }

  return toPlain(msg.toObject());
}

/**
 * Process sending a queued message (called by the background worker).
 * @param {string} messageId - The Message ID in MongoDB.
 */
async function processMessageJob(messageId) {
  const { Message } = getModels();

  const msg = await Message.findById(messageId);
  if (!msg) {
    logger.warn(`[Message Service] Message document not found: ${messageId}`);
    return;
  }

  if (msg.status === 'sent') {
    logger.info(`[Message Service] Message ${messageId} is already sent. Skipping.`);
    return;
  }

  msg.status = 'sending';
  msg.attempts += 1;
  await msg.save();

  logger.info(`[Message Service] Processing message ${messageId} (Attempt ${msg.attempts})`);

  try {
    let result = null;

    if (msg.channel === 'email') {
      if (msg.templateName) {
        result = await emailHelper.sendTemplateEmail(msg.recipient, msg.templateName, msg.templateParams || {});
      } else {
        result = await emailHelper.sendEmail(msg.recipient, msg.subject || 'Notification', msg.body, msg.body);
      }
    } else if (msg.channel === 'whatsapp') {
      if (msg.templateName) {
        const lang = msg.templateParams?.languageCode || WHATSAPP_TEMPLATE_LANGUAGE;
        const comps = msg.templateParams?.components || [];
        result = await whatsappHelper.sendTemplateMessage(msg.recipient, msg.templateName, lang, comps);
      } else if (msg.templateParams?.mediaType && msg.templateParams?.mediaUrl) {
        const { mediaType, mediaUrl, caption, filename } = msg.templateParams;
        result = await whatsappHelper.sendMediaMessage(msg.recipient, mediaType, mediaUrl, caption, filename);
      } else {
        result = await whatsappHelper.sendTextMessage(msg.recipient, msg.body);
      }
    } else {
      throw new Error(`Unsupported communication channel: ${msg.channel}`);
    }

    msg.status = 'sent';
    msg.sentAt = new Date();
    msg.metadata = result;
    msg.error = undefined;
    await msg.save();

    logger.info(`[Message Service] Message ${messageId} sent successfully.`);
  } catch (error) {
    msg.status = 'failed';
    msg.error = error.message;
    msg.failedAt = new Date();
    await msg.save();

    logger.error(`[Message Service] Message ${messageId} failed to send: ${error.message}`);
    throw error;
  }
}

/**
 * Lists message log documents with optional filtering and pagination.
 */
async function listMessages(filter = {}, options = {}) {
  const { Message } = getModels();
  const limit = Math.min(Number(options.limit) || 20, 100);
  const page = Math.max(Number(options.page) || 1, 1);
  const skip = (page - 1) * limit;

  const mongoFilter = {};
  if (filter.order) mongoFilter.order = filter.order;
  if (filter.channel) mongoFilter.channel = filter.channel;
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
 * Retrieve specific message document by ID.
 */
async function getMessageById(id) {
  const { Message } = getModels();
  const row = await Message.findById(id).lean();
  return row ? toPlain(row) : null;
}

module.exports = {
  createAndQueueMessage,
  processMessageJob,
  listMessages,
  getMessageById,
};
