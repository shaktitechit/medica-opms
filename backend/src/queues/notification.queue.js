/**
 * @fileoverview BullMQ job queue wiring (notification.queue).
 * @module queues/notification.queue
 */
const { Queue } = require('bullmq');
const connection = require('../config/redis');

const queueName = 'notifications';

const queue = new Queue(queueName, {
  connection,
});

/**
 * Enqueue a notification job.
 * @param {{ type: string, payload: object }} jobData
 */
async function enqueue(jobData) {
  await queue.add('notify', jobData, {
    removeOnComplete: true,
    removeOnFail: 100, // Keep last 100 failed jobs for debugging
  });
}

module.exports = {
  queueName,
  queue,
  enqueue,
};
