/**
 * @fileoverview Dashboard KPIs (dashboard slice / dispatch.dashboard).
 * @module modules/dashboard/dispatch.dashboard
 */
const { getModels } = require('../../data/mongoRegistry');
const { ORDER_STATUS } = require('../../constants/domain');
const transportDash = require('./transport.dashboard');

async function summary() {
  const { Order } = getModels();

  const [dispatch_pending, partial, dispatched] = await Promise.all([
    Order.countDocuments({ status: ORDER_STATUS.DISPATCH_PENDING }),
    Order.countDocuments({ status: ORDER_STATUS.PARTIAL_DISPATCH_CREATED }),
    Order.countDocuments({
      status: { $in: [
        ORDER_STATUS.FULL_DISPATCH_CREATED,
        ORDER_STATUS.TRANSPORT_PENDING,
        ORDER_STATUS.TRANSPORT_ASSIGNED,
        ORDER_STATUS.PARTIALLY_TRANSPORTED,
        ORDER_STATUS.FULLY_TRANSPORTED,
        ORDER_STATUS.IN_TRANSIT
      ] },
    }),
  ]);

  const logistics = await transportDash.summary();

  return {
    dispatch_pending,
    partial,
    dispatched,
    ...logistics,
  };
}

module.exports = { summary };
