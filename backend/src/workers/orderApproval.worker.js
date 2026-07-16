/**
 * @fileoverview BullMQ background worker for order approval jobs.
 * @module workers/orderApproval.worker
 */
const { Worker } = require('bullmq');
const connection = require('../config/redis');
const { logger } = require('../config/logger');

function start() {
  const worker = new Worker(
    'orderApproval',
    async (job) => {
      const { type, payload } = job.data;
      logger.info(`[OrderApproval Worker] Processing job ${job.id} type=${type}`);

      const orderApprovalService = require('../modules/orderApproval/orderApproval.service');
      const result = await orderApprovalService.processOrderApprovalJob({ type, payload });

      logger.info(`[OrderApproval Worker] Job ${job.id} completed`);
      return result;
    },
    {
      connection,
      concurrency: 3,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error(`[OrderApproval Worker] Job ${job ? job.id : 'unknown'} failed: ${err.message}`);
  });

  return worker;
}

module.exports = { start };
