/**
 * @fileoverview Orders: policy checks (ownership / dept / state).
 * @module modules/orders/order.policy
 */
const { ApiError } = require('../../utils/ApiError');
const orderRules = require('../workflow/workflow.rules');

function assertDepartment(user, allowedList) {
  if (!user) throw new ApiError(401, 'Unauthorized');
  if (user.department === 'admin') return;
  if (!allowedList.includes(user.department)) {
    throw new ApiError(403, 'Insufficient department access');
  }
}

function assertMayEditOrderPricing(user, order) {
  if (!user) throw new ApiError(401, 'Unauthorized');
  if (user.department === 'admin') return;
  if (user.department === 'sales' && !orderRules.salesMayEditPricing(order.status)) {
    throw new ApiError(403, 'Sales cannot edit pricing after finance approval (blocking rule)');
  }
  if (user.department === 'dispatch') {
    throw new ApiError(403, 'This department cannot edit order commercial fields');
  }
}

function assertDispatchMayNotChangeCommercials(user, payloadKeys) {
  const banned = new Set([
    'party',
    'order_date',
    'payment_status',
    'notes',
    'order_items',
    'subtotal',
    'discount_amount',
    'gst_amount',
    'grand_total',
    'assigned_sales_user',
  ]);
  if (user.department !== 'dispatch') return;
  for (const k of Object.keys(payloadKeys)) {
    if (banned.has(k)) {
      throw new ApiError(403, 'Dispatch cannot edit party or pricing details (blocking rule)');
    }
  }
}

module.exports = {
  assertDepartment,
  assertMayEditOrderPricing,
  assertDispatchMayNotChangeCommercials,
};
