/**
 * @fileoverview Process entry: env, MongoDB connect, optional seed bootstrap, queue registration, HTTP listen.
 * @module server
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('./config/db');
const { PORT } = require('./config/env');
const { logger } = require('./config/logger');
const queues = require('./queues');
const workers = require('./workers');

db.connect()
  .then(async () => {
    const { bootstrap } = require('./data/seedMongo');
    await bootstrap();
    await queues.registerQueues(logger);
    workers.startAll(logger);
    const app = require('./app');
    app.listen(PORT, () => {
      logger.info(`Server listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    logger.error(err);
    process.exit(1);
  });
