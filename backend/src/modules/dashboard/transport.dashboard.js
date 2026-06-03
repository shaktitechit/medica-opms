/**
 * @fileoverview Dashboard KPIs (dashboard slice / transport.dashboard).
 * @module modules/dashboard/transport.dashboard
 */
const { getModels } = require('../../data/mongoRegistry');
const { ORDER_STATUS } = require('../../constants/domain');

async function summary() {
  const { Order } = getModels();

  const [transport_arranged, in_transit, awaiting_pod] = await Promise.all([
    Order.countDocuments({ status: { $in: [ORDER_STATUS.TRANSPORT_PENDING, ORDER_STATUS.TRANSPORT_ASSIGNED, ORDER_STATUS.PARTIALLY_TRANSPORTED, ORDER_STATUS.FULLY_TRANSPORTED] } }),
    Order.countDocuments({ status: ORDER_STATUS.IN_TRANSIT }),
    Order.countDocuments({ status: ORDER_STATUS.DELIVERED }),
  ]);

  return { transport_arranged, in_transit, awaiting_pod };
}

module.exports = { summary };
