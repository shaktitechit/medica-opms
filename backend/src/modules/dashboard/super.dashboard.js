/**
 * @fileoverview Dashboard KPIs (dashboard slice / super.dashboard).
 * @module modules/dashboard/super.dashboard
 */
const { getModels } = require('../../data/mongoRegistry');
const financeService = require('../finance/finance.service');

/**
 * Combined cross-department overview for super_admin.
 * Pulls key KPIs from every department in a single aggregated response.
 */
async function overview() {
  const { User, Order, OrderFlag, OrderDispatch, Vehicle, Driver } = getModels();

  const [
    totalUsers,
    activeUsers,
    orders,
    openFlags,
    financeQueue,
    financeSummary,
    dispatchPending,
    vehicleCount,
    driverCount,
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ is_active: { $ne: false } }),
    Order.find({}).select('status').lean(),
    OrderFlag.countDocuments({ status: 'open' }),
    financeService.financeQueue(),
    financeService.summary(),
    OrderDispatch.countDocuments({ status: 'pending' }),
    Vehicle.countDocuments({ is_active: { $ne: false } }),
    Driver.countDocuments({ is_active: { $ne: false } }),
  ]);

  const ordersByStatus = {};
  for (const o of orders) {
    ordersByStatus[o.status] = (ordersByStatus[o.status] || 0) + 1;
  }

  return {
    users: {
      total: totalUsers,
      active: activeUsers,
    },
    orders: {
      total: orders.length,
      by_status: ordersByStatus,
    },
    finance: {
      queue_size: Array.isArray(financeQueue) ? financeQueue.length : 0,
      awaiting_finance: financeSummary.awaiting_finance,
    },
    dispatch: {
      pending_dispatches: dispatchPending,
    },
    fleet: {
      active_vehicles: vehicleCount,
      active_drivers: driverCount,
    },
    flags: {
      open_flags: openFlags,
    },
  };
}

module.exports = { overview };
