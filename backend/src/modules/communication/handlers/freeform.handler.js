/**
 * @fileoverview Queue a freeform email / WhatsApp message.
 * @module modules/communication/handlers/freeform.handler
 */
const { ApiError } = require('../../../utils/ApiError');
const messageService = require('../../messages/message.service');

/**
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function queueFreeform(payload = {}) {
  const { order, recipient, channel, subject, body, templateName, templateParams } = payload;

  if (!recipient) {
    throw new ApiError(400, 'Recipient is required');
  }
  if (!channel || !['email', 'whatsapp'].includes(channel)) {
    throw new ApiError(400, "Channel is required and must be either 'email' or 'whatsapp'");
  }

  return messageService.createAndQueueMessage({
    order,
    recipient,
    channel,
    subject,
    body,
    templateName,
    templateParams,
  });
}

module.exports = {
  type: 'freeform',
  queue: queueFreeform,
};
