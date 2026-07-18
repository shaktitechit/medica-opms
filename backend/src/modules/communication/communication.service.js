/**
 * @fileoverview Communication Service: orchestrates typed outbound message queues.
 * Low-level Message create/enqueue/process stays in modules/messages.
 * @module modules/communication/communication.service
 */
const { ApiError } = require('../../utils/ApiError');
const { getHandler, listQueueTypes } = require('./communication.registry');
const freeform = require('./handlers/freeform.handler');
const orderReceived = require('./handlers/orderReceived.handler');

function listTypes() {
  return listQueueTypes();
}

async function queueByType(type, payload) {
  const handler = getHandler(type);
  if (!handler) {
    throw new ApiError(400, `Unknown communication queue type: ${type}`);
  }
  return handler.queue(payload);
}

async function queueFreeformMessage(payload) {
  return freeform.queue(payload);
}

async function queueOrderReceivedMessages(payload) {
  return orderReceived.queue(payload);
}

module.exports = {
  listTypes,
  queueByType,
  queueFreeformMessage,
  queueOrderReceivedMessages,
};
