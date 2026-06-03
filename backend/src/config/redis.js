/**
 * @fileoverview Redis connection instance using ioredis.
 * @module config/redis
 */
const Redis = require('ioredis');
const { REDIS_URL } = require('./env');
const { logger } = require('./logger');

const url = REDIS_URL || 'redis://127.0.0.1:6379';

const connection = new Redis(url, {
  maxRetriesPerRequest: null, // Critical requirement for BullMQ
});

connection.on('connect', () => {
  logger.info(`[redis] Connected to Redis at ${url}`);
});

connection.on('error', (err) => {
  logger.error(`[redis] Error: ${err.message}`);
});

module.exports = connection;
