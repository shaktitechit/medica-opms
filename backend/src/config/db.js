/**
 * @fileoverview Configuration (db).
 * @module config/db
 */
const mongoose = require('mongoose');
const { logger } = require('./logger');
const { MONGODB_URI, MONGODB_LOOKUP_FAMILY } = require('./env');

async function connect() {
  const uri = MONGODB_URI && String(MONGODB_URI).trim();
  if (!uri) {
    const err = new Error(
      'Set MONGO_URI / MONGODB_URI / DATABASE_URL in `.env`; this API persists only via MongoDB.',
    );
    logger.error(err.message);
    throw err;
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  mongoose.set('strictQuery', true);
  const opts = {
    retryWrites: true,
    w: 'majority',
    appName: 'medica-backend',
  };
  if (MONGODB_LOOKUP_FAMILY !== undefined) {
    opts.family = MONGODB_LOOKUP_FAMILY;
  }
  await mongoose.connect(uri, opts);

  mongoose.connection.on('error', (e) => logger.error('[mongo]', e.message));
  logger.info('MongoDB connected');
  return mongoose.connection;
}

async function disconnect() {
  await mongoose.disconnect();
}

module.exports = { connect, disconnect, mongoose };
