/**
 * @fileoverview BullMQ background worker for processing auto-email jobs.
 * @module workers/autoEmail.worker
 */
const { Worker } = require('bullmq');
const connection = require('../config/redis');
const { logger } = require('../config/logger');

function start() {
  const worker = new Worker(
    'autoEmails',
    async (job) => {
      const { recipient, templateName, templateParams } = job.data;
      logger.info(`[AutoEmail Worker] Processing job ${job.id} template="${templateName}" recipient="${recipient}"`);

      const emailHelper = require('../modules/messages/helpers/email.helper');

      try {
        await emailHelper.sendTemplateEmail(recipient, templateName, templateParams || {});
        logger.info(`[AutoEmail Worker] Job ${job.id} completed successfully`);
      } catch (err) {
        logger.error(`[AutoEmail Worker] Attempt failed for job ${job.id}: ${err.message}`);
        // Throwing error tells BullMQ to retry the job according to the backoff config
        throw err;
      }
    },
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error(`[AutoEmail Worker] Job ${job ? job.id : 'unknown'} permanently failed: ${err.message}`);
  });

  return worker;
}

module.exports = { start };
