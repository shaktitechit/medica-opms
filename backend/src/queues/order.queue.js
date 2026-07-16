/**
 * @fileoverview BullMQ job queue for async order-side effects.
 * @module queues/order.queue
 */
const { Queue } = require('bullmq');
const connection = require('../config/redis');
const { ORDER_JOB_TYPES } = require('../modules/orders/order.constants');

const queueName = 'orders';
const PRIORITY_SYNC_SCHEDULER_ID = 'sync-order-priorities';
/** Recalculate persisted priorities hourly as EDDs approach. */
const PRIORITY_SYNC_EVERY_MS = 60 * 60 * 1000;

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

/**
 * Ensure a repeating scheduler keeps order.priority in sync with EDD.
 * Safe to call on every boot (upsert replaces the previous schedule).
 */
async function ensurePrioritySyncScheduler(logger = console) {
  await queue.upsertJobScheduler(
    PRIORITY_SYNC_SCHEDULER_ID,
    { every: PRIORITY_SYNC_EVERY_MS },
    {
      name: 'order',
      data: {
        type: ORDER_JOB_TYPES.SYNC_ORDER_PRIORITIES,
        payload: {},
      },
      opts: {
        removeOnComplete: true,
        removeOnFail: 50,
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    },
  );

  logger.info?.(
    `[queues] scheduled ${PRIORITY_SYNC_SCHEDULER_ID} every ${PRIORITY_SYNC_EVERY_MS / 60000}m`,
  );
}

module.exports = {
  queueName,
  queue,
  enqueue,
  ensurePrioritySyncScheduler,
  PRIORITY_SYNC_SCHEDULER_ID,
  PRIORITY_SYNC_EVERY_MS,
};
