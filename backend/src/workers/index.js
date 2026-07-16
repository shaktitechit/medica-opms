/**
 * @fileoverview Workers entrypoint.
 * @module workers/index
 */
const notificationWorker = require('./notification.worker');
const reportWorker = require('./report.worker');
const messageWorker = require('./message.worker');
const orderWorker = require('./order.worker');
const workflowWorker = require('./workflow.worker');
const dispatchWorker = require('./dispatch.worker');
const orderApprovalWorker = require('./orderApproval.worker');

let activeWorkers = {};

function startAll(logger = console) {
  logger.info('[workers] Starting background workers...');

  activeWorkers.report = reportWorker.start();
  activeWorkers.report.run();

  // Start real BullMQ workers
  activeWorkers.notification = notificationWorker.start();
  activeWorkers.message = messageWorker.start();
  activeWorkers.order = orderWorker.start();
  activeWorkers.workflow = workflowWorker.start();
  activeWorkers.dispatch = dispatchWorker.start();
  activeWorkers.orderApproval = orderApprovalWorker.start();

  logger.info('[workers] Background workers started.');
}

function stopAll(logger = console) {
  logger.info('[workers] Stopping background workers...');

  if (activeWorkers.report) activeWorkers.report.stop();

  if (activeWorkers.notification) {
    activeWorkers.notification.close().catch((err) => {
      logger.error(`[workers] Error closing notification worker: ${err.message}`);
    });
  }

  if (activeWorkers.message) {
    activeWorkers.message.close().catch((err) => {
      logger.error(`[workers] Error closing message worker: ${err.message}`);
    });
  }

  if (activeWorkers.order) {
    activeWorkers.order.close().catch((err) => {
      logger.error(`[workers] Error closing order worker: ${err.message}`);
    });
  }

  if (activeWorkers.workflow) {
    activeWorkers.workflow.close().catch((err) => {
      logger.error(`[workers] Error closing workflow worker: ${err.message}`);
    });
  }

  if (activeWorkers.dispatch) {
    activeWorkers.dispatch.close().catch((err) => {
      logger.error(`[workers] Error closing dispatch worker: ${err.message}`);
    });
  }

  if (activeWorkers.orderApproval) {
    activeWorkers.orderApproval.close().catch((err) => {
      logger.error(`[workers] Error closing orderApproval worker: ${err.message}`);
    });
  }

  logger.info('[workers] Background workers stopped.');
}

module.exports = {
  startAll,
  stopAll,
  activeWorkers,
};
