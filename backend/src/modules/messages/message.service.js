/**
 * @fileoverview Message Service: business logic for creating, queueing, and processing messages.
 * @module modules/messages/message.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const messageQueue = require('../../queues/message.queue');
const whatsappHelper = require('./helpers/whatsapp.helper');
const emailHelper = require('./helpers/email.helper');
const { logger } = require('../../config/logger');

/**
 * Creates a message record, enqueues a background job, and marks it as queued.
 * @param {object} messageData - Schema fields for the message.
 * @returns {Promise<object>} The created message document (plain JS object).
 */
async function createAndQueueMessage(messageData) {
  const { Message } = getModels();

  const msg = await Message.create({
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
    // Add job to BullMQ messages queue
    await messageQueue.enqueue({ messageId: String(msg._id) });
    
    // Update status to queued
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

  // If already sent, skip
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
        // If templateParams contains languageCode / components
        const lang = msg.templateParams?.languageCode || 'en_US';
        const comps = msg.templateParams?.components || [];
        result = await whatsappHelper.sendTemplateMessage(msg.recipient, msg.templateName, lang, comps);
      } else if (msg.templateParams?.mediaType && msg.templateParams?.mediaUrl) {
        // Handle media message
        const { mediaType, mediaUrl, caption, filename } = msg.templateParams;
        result = await whatsappHelper.sendMediaMessage(msg.recipient, mediaType, mediaUrl, caption, filename);
      } else {
        result = await whatsappHelper.sendTextMessage(msg.recipient, msg.body);
      }
    } else {
      throw new Error(`Unsupported communication channel: ${msg.channel}`);
    }

    // Update message on success
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
    // Rethrow error so BullMQ knows the job failed and can handle retries/failure logging
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
