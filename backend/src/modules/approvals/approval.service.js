/**
 * @fileoverview Approvals: business rules and mongoose persistence helpers.
 * @module modules/approvals/approval.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');

async function list({ order } = {}) {
  const q = {};
  if (order) q.order = order;
  const rows = await getModels().OrderApproval.find(q).sort({ createdAt: -1 }).lean();
  return rows.map(toPlain);
}

async function listByOrder(orderId) {
  const rows = await getModels().OrderApproval.find({ order: orderId }).sort({ createdAt: 1 }).lean();
  return rows.map(toPlain);
}

module.exports = { list, listByOrder };
