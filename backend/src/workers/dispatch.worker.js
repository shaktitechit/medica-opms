/**
 * @fileoverview BullMQ background worker for dispatch jobs.
 * @module workers/dispatch.worker
 */
const { Worker } = require('bullmq');
const connection = require('../config/redis');
const { logger } = require('../config/logger');

function start() {
  const worker = new Worker(
    'dispatches',
    async (job) => {
      const { type, payload } = job.data;
      logger.info(`[Dispatch Worker] Processing job ${job.id} type=${type}`);

      const dispatchService = require('../modules/dispatch/dispatch.service');
      await dispatchService.processDispatchJob({ type, payload });

      logger.info(`[Dispatch Worker] Job ${job.id} completed`);
    },
    {
      connection,
      concurrency: 3,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error(`[Dispatch Worker] Job ${job ? job.id : 'unknown'} failed: ${err.message}`);
  });

  return worker;
}

module.exports = { start };
