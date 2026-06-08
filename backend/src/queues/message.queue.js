/**
 * @fileoverview BullMQ job queue wiring (message.queue).
 * @module queues/message.queue
 */
const { Queue } = require('bullmq');
const connection = require('../config/redis');

const queueName = 'messages';

const queue = new Queue(queueName, {
  connection,
});

/**
 * Enqueue a message job.
 * @param {{ messageId: string }} jobData
 */
async function enqueue(jobData) {
  await queue.add('sendMessage', jobData, {
    removeOnComplete: true,
    removeOnFail: 100, // Keep last 100 failed jobs for debugging
    attempts: 3, // Retry up to 3 times on failure
    backoff: {
      type: 'exponential',
      delay: 5000, // Wait 5s, then 10s, 20s...
    },
  });
}

module.exports = {
  queueName,
  queue,
  enqueue,
};
