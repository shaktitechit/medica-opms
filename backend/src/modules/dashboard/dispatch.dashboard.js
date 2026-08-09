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
    Order.countDocuments({ status: ORDER_STATUS.DISPATCH, dispatch_status: { $ne: 'completed' } }),
    0,
    Order.countDocuments({
      status: { $in: [
        ORDER_STATUS.DISPATCH,
        ORDER_STATUS.IN_TRANSIT
      ] },
      dispatch_status: 'completed'
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
