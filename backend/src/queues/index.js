/**
 * @fileoverview Bull-ish / job queue wiring (index).
 * @module queues/index
 */
const notification = require('./notification.queue');
const report = require('./report.queue');
const message = require('./message.queue');
const order = require('./order.queue');
const workflow = require('./workflow.queue');
const dispatch = require('./dispatch.queue');

const all = Object.freeze([notification, report, message, order, workflow, dispatch]);

/** Register async job handlers. */
function registerQueues(logger = console) {
  const names = all.map((q) => q.queueName).join(', ');
  logger.info?.(`[queues] registered: ${names}`);
  return { notification, report, message, order, workflow, dispatch };
}

module.exports = { registerQueues, notification, report, message, order, workflow, dispatch, all };
