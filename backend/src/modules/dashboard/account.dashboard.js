/**
 * @fileoverview Dashboard KPIs (dashboard slice / account.dashboard).
 * @module modules/dashboard/account.dashboard
 */
const { getModels } = require('../../data/mongoRegistry');
const { ORDER_STATUS } = require('../../constants/domain');

async function summary(userId) {
  const { Order } = getModels();

  const [awaiting_dispatch, on_hold, total_assigned] = await Promise.all([
    Order.countDocuments({
      lifecycle_status: { $nin: ['cancelled', 'closed'] },
      status: { $in: [ORDER_STATUS.FULLY_FINANCE_APPROVED, ORDER_STATUS.PARTIALLY_FINANCE_APPROVED] },
      assigned_account_user: userId,
    }),
    Order.countDocuments({
      lifecycle_status: 'on_hold',
      assigned_account_user: userId,
    }),
    Order.countDocuments({
      assigned_account_user: userId,
    }),
  ]);

  return {
    queue_size: awaiting_dispatch,
    awaiting_dispatch,
    on_hold,
    total_assigned,
  };
}

module.exports = { summary };
