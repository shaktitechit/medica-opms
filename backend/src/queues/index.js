/**
 * @fileoverview Bull-ish / job queue wiring (index).
 * @module queues/index
 */
const notification = require('./notification.queue');
const report = require('./report.queue');

const all = Object.freeze([notification, report]);

/** Register async job handlers. */
function registerQueues(logger = console) {
  const names = all.map((q) => q.queueName).join(', ');
  logger.info?.(`[queues] registered: ${names}`);
  return { notification, report };
}

module.exports = { registerQueues, notification, report, all };
