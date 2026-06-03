/**
 * @fileoverview BullMQ background worker for processing notification jobs (notification.worker).
 * @module workers/notification.worker
 */
const { Worker } = require('bullmq');
const connection = require('../config/redis');
const { logger } = require('../config/logger');

function start() {
  const worker = new Worker(
    'notifications',
    async (job) => {
      const { type, payload } = job.data;
      logger.info(`[Notification Worker] Processing job ${job.id} type=${type}`);

      // Lazy-require to avoid circular dependency at startup
      const notificationService = require('../modules/notifications/notification.service');

      if (type === 'order_transition') {
        await notificationService.processOrderTransition(payload);
      } else {
        logger.warn(`[Notification Worker] Unknown job type: ${type}`);
      }

      logger.info(`[Notification Worker] Job ${job.id} completed`);
    },
    {
      connection,
      concurrency: 5, // Notifications are independent, can run concurrently
    }
  );

  worker.on('failed', (job, err) => {
    logger.error(`[Notification Worker] Job ${job ? job.id : 'unknown'} failed: ${err.message}`);
  });

  return worker;
}

module.exports = { start };
