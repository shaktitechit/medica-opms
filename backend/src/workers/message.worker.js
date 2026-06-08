/**
 * @fileoverview BullMQ background worker for processing message jobs (message.worker).
 * @module workers/message.worker
 */
const { Worker } = require('bullmq');
const connection = require('../config/redis');
const { logger } = require('../config/logger');

function start() {
  const worker = new Worker(
    'messages',
    async (job) => {
      const { messageId } = job.data;
      logger.info(`[Message Worker] Processing job ${job.id} messageId=${messageId}`);

      // Lazy-require to avoid circular dependency at startup
      const messageService = require('../modules/messages/message.service');

      await messageService.processMessageJob(messageId);

      logger.info(`[Message Worker] Job ${job.id} completed`);
    },
    {
      connection,
      concurrency: 5, // Process messages concurrently
    }
  );

  worker.on('failed', (job, err) => {
    logger.error(`[Message Worker] Job ${job ? job.id : 'unknown'} failed: ${err.message}`);
  });

  return worker;
}

module.exports = { start };
