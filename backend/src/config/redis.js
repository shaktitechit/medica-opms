/**
 * @fileoverview Redis connection options for BullMQ / ioredis.
 * @module config/redis
 *
 * Export plain options (not a shared ioredis instance) so each Queue/Worker
 * gets its own connection. Sharing one client causes lock/blocking races.
 * BullMQ requires a writable Redis primary — replicas reject job Lua scripts.
 */
const { REDIS_URL } = require('./env');
const { logger } = require('./logger');

const url = REDIS_URL || 'redis://127.0.0.1:6379';

/**
 * @param {string} raw
 * @returns {import('ioredis').RedisOptions}
 */
function parseRedisUrl(raw) {
  const u = new URL(raw);
  const dbPath = (u.pathname || '').replace(/^\//, '');
  /** @type {import('ioredis').RedisOptions} */
  const opts = {
    host: u.hostname || '127.0.0.1',
    port: Number(u.port || 6379),
    maxRetriesPerRequest: null, // required for BullMQ workers
  };
  if (u.username) opts.username = decodeURIComponent(u.username);
  if (u.password) opts.password = decodeURIComponent(u.password);
  if (dbPath !== '' && !Number.isNaN(Number(dbPath))) opts.db = Number(dbPath);
  if (u.protocol === 'rediss:') opts.tls = {};
  return opts;
}

const connection = parseRedisUrl(url);

logger.info(`[redis] Using Redis at ${connection.host}:${connection.port}`);

module.exports = connection;
