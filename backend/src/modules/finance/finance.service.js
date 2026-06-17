/**
 * @fileoverview Finance queue helpers backed by order workflow fields.
 * @module modules/finance/finance.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');

async function financeQueue() {
  const rows = await getModels()
    .Order.find({
      status: { $ne: 'closed' },
      closed_at: null,
      lifecycle_status: { $ne: 'cancelled' },
      workflow_stage: 'finance_review',
    })
    .sort({ createdAt: -1 })
    .lean();
  return rows.map((r) => toPlain(r));
}

async function summary() {
  const { Order } = getModels();
  const awaiting = await Order.countDocuments({
    status: { $ne: 'closed' },
    closed_at: null,
    lifecycle_status: { $ne: 'cancelled' },
    workflow_stage: 'finance_review',
  });
  const held = await Order.countDocuments({
    lifecycle_status: 'on_hold',
    pending_with_role: 'finance',
  });
  return {
    awaiting_finance: awaiting,
    finance_hold: held,
  };
}

module.exports = { financeQueue, summary };
