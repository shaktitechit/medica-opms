/**
 * @fileoverview Registry of communication queue types.
 * Add new handlers here as new outbound message flows are introduced.
 * @module modules/communication/communication.registry
 */
const freeform = require('./handlers/freeform.handler');
const orderReceived = require('./handlers/orderReceived.handler');

const HANDLERS = {
  [freeform.type]: freeform,
  [orderReceived.type]: orderReceived,
};

function listQueueTypes() {
  return Object.keys(HANDLERS);
}

function getHandler(type) {
  return HANDLERS[type] || null;
}

module.exports = {
  HANDLERS,
  listQueueTypes,
  getHandler,
};
