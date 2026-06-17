/**
 * @fileoverview BullMQ background worker for workflow jobs.
 * @module workers/workflow.worker
 */
const { Worker } = require('bullmq');
const connection = require('../config/redis');
const { logger } = require('../config/logger');
const { WORKFLOW_JOB_TYPES } = require('../modules/workflow/workflow.constants');

function start() {
  const worker = new Worker(
    'workflow',
    async (job) => {
      const { type, payload } = job.data;
      logger.info(`[Workflow Worker] Processing job ${job.id} type=${type}`);

      const workflowService = require('../modules/workflow/workflow.service');
      const result = await workflowService.processWorkflowJob({ type, payload });

      logger.info(`[Workflow Worker] Job ${job.id} completed type=${type}`);
      return result;
    },
    {
      connection,
      concurrency: 3,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error(
      `[Workflow Worker] Job ${job ? job.id : 'unknown'} type=${job?.data?.type || WORKFLOW_JOB_TYPES.POST_TRANSITION} failed: ${err.message}`,
    );
  });

  return worker;
}

module.exports = { start };
