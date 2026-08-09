#!/usr/bin/env node
/**
   npm run migrate:sync-orders-billing-status
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const db = require('../src/config/db');
const { getModels } = require('../src/data/mongoRegistry');
const fulfillmentService = require('../src/modules/orders/orderFulfillment.service');

async function main() {
  await db.connect();
  const Order = getModels().Order;

  const orders = await Order.find({}).select('_id order_no').lean();
  console.log(`Found ${orders.length} orders to sync.`);

  let synced = 0;
  let failed = 0;

  for (const order of orders) {
    try {
      await fulfillmentService.recalculateFromExecutions(order._id, null);
      synced++;
      if (synced % 10 === 0 || synced === orders.length) {
        console.log(`Synced ${synced}/${orders.length} orders...`);
      }
    } catch (error) {
      console.error(`Failed to sync order ${order.order_no || order._id}:`, error.message);
      failed++;
    }
  }

  console.log(`Sync completed. Successfully synced: ${synced}, Failed: ${failed}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.disconnect().catch(() => {});
  });
