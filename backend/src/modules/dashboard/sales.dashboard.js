/**
 * @fileoverview Dashboard KPIs (dashboard slice / sales.dashboard).
 * @module modules/dashboard/sales.dashboard
 */
const { getModels } = require('../../data/mongoRegistry');

async function forUser(userId) {
  const orders = await getModels()
    .Order.find({
      $or: [{ created_by: userId }, { assigned_sales_user: userId }],
    })
    .select('status')
    .lean();

  return {
    my_orders: orders.length,
    draft: orders.filter((o) => o.status === 'draft').length,
    pending_submit: orders.filter((o) => o.status === 'draft' || o.status === 'submitted').length,
  };
}

module.exports = { forUser };
