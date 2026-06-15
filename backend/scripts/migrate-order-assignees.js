#!/usr/bin/env node
/**
 * Backfill OrderAssignee from denormalized Order.assigned_*_user fields.
 * Safe to re-run: upserts one row per (order, department, assignee).
 *
 * Usage:
 *   npm run migrate:order-assignees
 */
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const db = require('../src/config/db');
const { getModels } = require('../src/data/mongoRegistry');
const assigneeService = require('../src/modules/orders/orderAssignee.service');

const BATCH_SIZE = 200;

async function main() {
  try {
    await db.connect();
    const { Order } = getModels();

    const orders = await Order.find({ deletedAt: null })
      .select(
        '_id order_no assigned_sales_user assigned_admin_user assigned_finance_user assigned_dispatch_user created_by',
      )
      .lean();

    const withAssignees = orders.filter((order) =>
      Boolean(
        order.assigned_sales_user
        || order.assigned_admin_user
        || order.assigned_finance_user
        || order.assigned_dispatch_user,
      ),
    );

    let totalRows = 0;
    for (let i = 0; i < withAssignees.length; i += BATCH_SIZE) {
      const batch = withAssignees.slice(i, i + BATCH_SIZE);
      const { rows } = await assigneeService.bulkSeedFromOrders(batch);
      totalRows += rows;
    }

    const totalAssignees = await getModels().OrderAssignee.countDocuments();

    console.log('[migrate:order-assignees] Orders scanned:', orders.length);
    console.log('[migrate:order-assignees] Orders with assignees backfilled:', withAssignees.length);
    console.log('[migrate:order-assignees] Orders skipped (no assignees):', orders.length - withAssignees.length);
    console.log('[migrate:order-assignees] Assignee rows upserted this run:', totalRows);
    console.log('[migrate:order-assignees] Total OrderAssignee documents:', totalAssignees);
  } catch (err) {
    console.error('[migrate:order-assignees]', err.message);
    process.exitCode = 1;
  } finally {
    await db.disconnect().catch(() => {});
  }
}

main();
