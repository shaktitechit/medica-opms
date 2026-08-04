/**
 * @fileoverview BullMQ job queue wiring for auto-emails.
 * @module queues/autoEmail.queue
 */
const { Queue } = require('bullmq');
const connection = require('../config/redis');

const queueName = 'autoEmails';

const queue = new Queue(queueName, {
  connection,
});

/**
 * Enqueue an auto-email job.
 * @param {{ recipient: string, templateName: string, templateParams: object }} jobData
 */
async function enqueue(jobData) {
  await queue.add('sendAutoEmail', jobData, {
    removeOnComplete: true,
    removeOnFail: 100, // Keep last 100 failed jobs for debugging
    attempts: 5, // Retry up to 5 times on failure
    backoff: {
      type: 'exponential',
      delay: 10000, // Wait 10s, then 20s, 40s...
    },
  });
}

module.exports = {
  queueName,
  queue,
  enqueue,
};
