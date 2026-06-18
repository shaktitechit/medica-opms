/**
 * @fileoverview BullMQ job queue for async dispatch-side effects.
 * @module queues/dispatch.queue
 */
const { Queue } = require('bullmq');
const connection = require('../config/redis');

const queueName = 'dispatches';

const queue = new Queue(queueName, {
  connection,
});

/**
 * Enqueue a dispatch background job.
 * @param {{ type: string, payload: object }} jobData
 */
async function enqueue(jobData) {
  const dispatchId = jobData?.payload?.dispatchId ? String(jobData.payload.dispatchId) : null;
  const orderId = jobData?.payload?.orderId ? String(jobData.payload.orderId) : null;
  const key = dispatchId || orderId || null;
  const jobId = key
    ? `${jobData.type}__${key}__${Date.now()}`
    : undefined;

  await queue.add('dispatch', jobData, {
    jobId,
    removeOnComplete: true,
    removeOnFail: 100,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 3000,
    },
  });
}

module.exports = {
  queueName,
  queue,
  enqueue,
};
