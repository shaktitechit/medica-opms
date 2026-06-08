/**
 * @fileoverview Bull-ish / job queue wiring (index).
 * @module queues/index
 */
const notification = require('./notification.queue');
const report = require('./report.queue');
const message = require('./message.queue');

const all = Object.freeze([notification, report, message]);

/** Register async job handlers. */
function registerQueues(logger = console) {
  const names = all.map((q) => q.queueName).join(', ');
  logger.info?.(`[queues] registered: ${names}`);
  return { notification, report, message };
}

module.exports = { registerQueues, notification, report, message, all };
