/**
 * @fileoverview BullMQ job queue for async order approval-side effects.
 * @module queues/orderApproval.queue
 */
const { Queue } = require('bullmq');
const connection = require('../config/redis');

const queueName = 'orderApproval';

const queue = new Queue(queueName, {
  connection,
});

/**
 * Enqueue an order approval background job.
 * @param {{ type: string, payload: object }} jobData
 */
async function enqueue(jobData) {
  const orderId = jobData?.payload?.body?.order ? String(jobData.payload.body.order) : null;
  const jobId = orderId
    ? `${jobData.type}__${orderId}__${Date.now()}`
    : undefined;

  await queue.add('orderApproval', jobData, {
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
