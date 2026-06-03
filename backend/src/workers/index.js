/**
 * @fileoverview Workers entrypoint.
 * @module workers/index
 */
const notificationWorker = require('./notification.worker');
const reportWorker = require('./report.worker');

let activeWorkers = {};

function startAll(logger = console) {
  logger.info('[workers] Starting background workers...');

  activeWorkers.report = reportWorker.start();
  activeWorkers.report.run();

  // Start real BullMQ workers
  activeWorkers.notification = notificationWorker.start();

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

  logger.info('[workers] Background workers stopped.');
}

module.exports = {
  startAll,
  stopAll,
  activeWorkers,
};
