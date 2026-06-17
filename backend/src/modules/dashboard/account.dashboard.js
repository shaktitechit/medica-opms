/**
 * @fileoverview Dashboard KPIs (dashboard slice / account.dashboard).
 * @module modules/dashboard/account.dashboard
 */
const { getModels } = require('../../data/mongoRegistry');
const { ORDER_STATUS } = require('../../constants/domain');

const NOT_DRAFT = { status: { $ne: ORDER_STATUS.DRAFT } };

async function summary() {
  const { Order } = getModels();

  const [awaiting_dispatch, on_hold, total_open] = await Promise.all([
    Order.countDocuments({
      ...NOT_DRAFT,
      lifecycle_status: { $ne: 'cancelled' },
      status: { $ne: ORDER_STATUS.CLOSED },
      closed_at: null,
    }),
    Order.countDocuments({
      ...NOT_DRAFT,
      lifecycle_status: 'on_hold',
    }),
    Order.countDocuments({
      ...NOT_DRAFT,
      lifecycle_status: { $ne: 'cancelled' },
      status: { $ne: ORDER_STATUS.CLOSED },
      closed_at: null,
    }),
  ]);

  return {
    queue_size: awaiting_dispatch,
    awaiting_dispatch,
    on_hold,
    total_assigned: total_open,
  };
}

module.exports = { summary };
