/**
 * @fileoverview Bull-ish / job queue wiring (report.queue).
 * @module queues/report.queue
 */
module.exports = {
  queueName: 'reports',
  /** @param {object} _job */
  async enqueue(_job) {
    return undefined;
  },
};
