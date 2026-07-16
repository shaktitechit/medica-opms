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

  worker.on('completed', (job, result) => {
    if (job?.data?.type === 'sync_order_priorities') {
      logger.info(
        `[Order Worker] Priority sync scanned=${result?.scanned ?? 0} updated=${result?.updated ?? 0}`,
      );
    }
  });

  return worker;
}

module.exports = { start };
