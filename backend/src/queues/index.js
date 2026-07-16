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
const orderApproval = require('./orderApproval.queue');

const all = Object.freeze([notification, report, message, order, workflow, dispatch, orderApproval]);

/** Register async job handlers. */
async function registerQueues(logger = console) {
  const names = all.map((q) => q.queueName).join(', ');
  logger.info?.(`[queues] registered: ${names}`);
  await order.ensurePrioritySyncScheduler(logger);
  return { notification, report, message, order, workflow, dispatch, orderApproval };
}

module.exports = { registerQueues, notification, report, message, order, workflow, dispatch, orderApproval, all };
