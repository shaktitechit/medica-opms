/**
 * @fileoverview BullMQ job queue for async order-side effects.
 * @module queues/order.queue
 */
const { Queue } = require('bullmq');
const connection = require('../config/redis');

const queueName = 'orders';

const queue = new Queue(queueName, {
  connection,
});

/**
 * Enqueue an order background job.
 * @param {{ type: string, payload: object }} jobData
 */
async function enqueue(jobData) {
  const orderId = jobData?.payload?.orderId ? String(jobData.payload.orderId) : null;
  const jobId = orderId
    ? `${jobData.type}__${orderId}__${Date.now()}`
    : undefined;

  await queue.add('order', jobData, {
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
