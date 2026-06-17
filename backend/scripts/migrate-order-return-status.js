#!/usr/bin/env node
/**
 * Migrate OrderReturn.return_status values:
 *   received -> received_at_warehouse
 *   cancelled, dispatch_restored -> soft-deleted
 *
 * Usage:
 *   node backend/scripts/migrate-order-return-status.js
 */
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const db = require('../src/config/db');
const { getModels } = require('../src/data/mongoRegistry');
const { ORDER_RETURN_STATUS } = require('../src/constants/orderReturnStatus');

async function main() {
  try {
    await db.connect();
    const { OrderReturn } = getModels();
    const now = new Date();

    const received = await OrderReturn.updateMany(
      { return_status: 'received', deletedAt: null },
      { $set: { return_status: ORDER_RETURN_STATUS.RECEIVED_AT_WAREHOUSE } },
    );
    const voided = await OrderReturn.updateMany(
      {
        return_status: { $in: ['cancelled', 'dispatch_restored'] },
        deletedAt: null,
      },
      { $set: { deletedAt: now } },
    );

    console.log(
      `Migrated ${received.modifiedCount} received -> ${ORDER_RETURN_STATUS.RECEIVED_AT_WAREHOUSE}`,
    );
    console.log(`Soft-deleted ${voided.modifiedCount} cancelled/dispatch_restored return records`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
