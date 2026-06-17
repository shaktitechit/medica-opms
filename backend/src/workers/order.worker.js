/**
 * @fileoverview BullMQ background worker for order jobs.
 * @module workers/order.worker
 */
const { Worker } = require('bullmq');
const connection = require('../config/redis');
const { logger } = require('../config/logger');

function start() {
  const worker = new Worker(
    'orders',
    async (job) => {
      const { type, payload } = job.data;
      logger.info(`[Order Worker] Processing job ${job.id} type=${type}`);

      const orderService = require('../modules/orders/order.service');
      await orderService.processOrderJob({ type, payload });

      logger.info(`[Order Worker] Job ${job.id} completed`);
    },
    {
      connection,
      concurrency: 3,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error(`[Order Worker] Job ${job ? job.id : 'unknown'} failed: ${err.message}`);
  });

  return worker;
}

module.exports = { start };
