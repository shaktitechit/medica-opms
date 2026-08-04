/**
 * @fileoverview Bull-ish / job queue wiring (index).
 * @module queues/index
 */
const Redis = require('ioredis');
const connection = require('../config/redis');
const notification = require('./notification.queue');
const report = require('./report.queue');
const message = require('./message.queue');
const order = require('./order.queue');
const workflow = require('./workflow.queue');
const dispatch = require('./dispatch.queue');
const orderApproval = require('./orderApproval.queue');
const autoEmail = require('./autoEmail.queue');

const all = Object.freeze([notification, report, message, order, workflow, dispatch, orderApproval, autoEmail]);

/**
 * Fail fast when REDIS_URL points at a replica (BullMQ Lua writes need a primary).
 * @param {{ info?: Function }} [logger]
 */
async function assertRedisWritable(logger = console) {
  const client = new Redis({
    ...connection,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
  try {
    await client.connect();
    const role = await client.role();
    const roleName = Array.isArray(role) ? String(role[0]) : '';
    if (roleName && roleName !== 'master') {
      throw new Error(
        `Redis role is "${roleName}", not master. BullMQ cannot enqueue jobs on a read-only replica. ` +
          `Point REDIS_URL at the primary (compose: redis://redis:6379).`,
      );
    }
    const key = `medica:writecheck:${process.pid}`;
    await client.set(key, '1', 'EX', 10);
    await client.del(key);
    logger.info?.(
      `[redis] Writable primary OK (${connection.host}:${connection.port})`,
    );
  } catch (err) {
    const msg = err?.message || String(err);
    if (/READONLY|read only replica/i.test(msg)) {
      throw new Error(
        `Redis is read-only. BullMQ requires a writable primary. Check REDIS_URL (${connection.host}:${connection.port}).`,
      );
    }
    throw err;
  } finally {
    client.disconnect();
  }
}

/** Register async job handlers. */
async function registerQueues(logger = console) {
  await assertRedisWritable(logger);
  const names = all.map((q) => q.queueName).join(', ');
  logger.info?.(`[queues] registered: ${names}`);
  await order.ensurePrioritySyncScheduler(logger);
  return { notification, report, message, order, workflow, dispatch, orderApproval, autoEmail };
}

module.exports = { registerQueues, notification, report, message, order, workflow, dispatch, orderApproval, autoEmail, all };
