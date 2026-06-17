/**
 * @fileoverview Sales assignee read helpers (OrderAssignee collection removed).
 * @module modules/orders/orderAssignee.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { normalizeUserId } = require('./orderAssignee.util');

async function listByOrder(orderId) {
  const order = await getModels().Order.findById(orderId)
    .select('assigned_sales_user')
    .populate('assigned_sales_user', 'name email department')
    .lean();
  if (!order) return [];

  const assigneeId = normalizeUserId(order.assigned_sales_user);
  if (!assigneeId) return [];

  return [toPlain({
    order: String(orderId),
    department: 'sales',
    assignee: order.assigned_sales_user,
    source: 'order',
  })];
}

module.exports = {
  listByOrder,
};
