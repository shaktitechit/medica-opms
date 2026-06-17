/**
 * @fileoverview BullMQ job queue for async workflow side effects.
 * @module queues/workflow.queue
 */
const { Queue } = require('bullmq');
const connection = require('../config/redis');
const { WORKFLOW_JOB_TYPES } = require('../modules/workflow/workflow.constants');

const queueName = 'workflow';

const queue = new Queue(queueName, {
  connection,
});

function buildJobId(type, orderId) {
  if (!orderId) return undefined;
  return `${type}__${String(orderId)}`;
}

/**
 * Enqueue a workflow background job.
 * @param {{ type: string, payload: object }} jobData
 */
async function enqueue(jobData) {
  const orderId = jobData?.payload?.orderId ? String(jobData.payload.orderId) : null;

  await queue.add('workflow', jobData, {
    jobId: buildJobId(jobData.type, orderId),
    removeOnComplete: true,
    removeOnFail: 100,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 3000,
    },
  });
}

async function enqueuePostTransition(payload) {
  return enqueue({
    type: WORKFLOW_JOB_TYPES.POST_TRANSITION,
    payload,
  });
}

async function enqueueRecomputeFlagAggregates(orderId) {
  return enqueue({
    type: WORKFLOW_JOB_TYPES.RECOMPUTE_FLAG_AGGREGATES,
    payload: { orderId },
  });
}

module.exports = {
  queueName,
  queue,
  enqueue,
  enqueuePostTransition,
  enqueueRecomputeFlagAggregates,
};
