/**
 * @fileoverview Dashboard KPIs (dashboard slice / admin.dashboard).
 * @module modules/dashboard/admin.dashboard
 */
const { getModels } = require('../../data/mongoRegistry');

async function overview() {
  const { Order, OrderFlag } = getModels();

  const [orders, flagCount] = await Promise.all([
    Order.find({}).select('status').lean(),
    OrderFlag.countDocuments({ status: 'open' }),
  ]);

  const byStatus = {};
  for (const o of orders) {
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
  }

  return {
    orders_total: orders.length,
    orders_by_status: byStatus,
    open_flags: flagCount,
  };
}

module.exports = { overview };
