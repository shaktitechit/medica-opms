#!/usr/bin/env node
/**
 * @fileoverview Script to backfill and sync `billing_date` on Order documents from related `OrderDispatch` records.
 * Run via: node scripts/sync-order-billing-date.js (or npm run migrate:sync-orders-billing-date)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const db = require('../src/config/db');
const { getModels } = require('../src/data/mongoRegistry');
const fulfillmentService = require('../src/modules/orders/orderFulfillment.service');

async function main() {
  await db.connect();
  const { Order, OrderDispatch } = getModels();

  const orders = await Order.find({ deletedAt: null }).select('_id order_no billing_date').lean();
  console.log(`Found ${orders.length} orders to inspect.`);

  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const order of orders) {
    try {
      const orderId = order._id;
      const latestDispatch = await OrderDispatch.findOne({
        order: orderId,
        deletedAt: null,
        dispatch_status: { $ne: 'cancelled' },
      })
        .sort({ billing_date: -1, dispatched_at: -1, createdAt: -1 })
        .lean();

      const targetBillingDate = latestDispatch
        ? (latestDispatch.billing_date || latestDispatch.dispatched_at || latestDispatch.createdAt)
        : null;

      // Re-run recalculateFromExecutions to update order fulfillment & billing_date
      await fulfillmentService.recalculateFromExecutions(orderId, null);

      if (targetBillingDate) {
        updatedCount++;
        console.log(`[Synced] Order ${order.order_no || orderId} -> billing_date: ${new Date(targetBillingDate).toISOString()}`);
      } else {
        skippedCount++;
      }
    } catch (err) {
      errorCount++;
      console.error(`[Error] Order ${order.order_no || order._id}:`, err.message);
    }
  }

  console.log(`\n================ Sync Summary ================`);
  console.log(`Total Orders Checked: ${orders.length}`);
  console.log(`Updated with Billing Date: ${updatedCount}`);
  console.log(`Skipped (No Dispatches): ${skippedCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`==============================================`);
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.disconnect().catch(() => {});
  });
