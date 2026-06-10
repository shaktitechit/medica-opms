/**
 * @fileoverview Orders: policy checks (ownership / dept / state).
 * @module modules/orders/order.policy
 */
const { ApiError } = require('../../utils/ApiError');
const orderRules = require('../workflow/workflow.rules');

const ORDERS_WRITE_DEPARTMENTS = new Set(['sales', 'admin', 'super_admin']);

function userMayWriteOrders(user) {
  if (!user) return false;
  const dept = String(user.department || '').toLowerCase();
  if (ORDERS_WRITE_DEPARTMENTS.has(dept)) return true;
  const codes = new Set(user.permissionCodes || []);
  return codes.has('*') || codes.has('orders:write');
}

function requireOrdersWrite(req, res, next) {
  if (!req.user) return next(new ApiError(401, 'Authentication required'));
  if (userMayWriteOrders(req.user)) return next();
  return next(new ApiError(403, 'Missing permission to create or update orders'));
}

function assertMayCreateOrder(user) {
  if (!user) throw new ApiError(401, 'Authentication required');
  if (userMayWriteOrders(user)) return;
  throw new ApiError(403, 'Only sales, admin, or users with orders:write may create orders');
}

function assertDepartment(user, allowedList) {
  if (!user) throw new ApiError(401, 'Unauthorized');
  if (user.department === 'admin' || user.department === 'super_admin') return;
  if (!allowedList.includes(user.department)) {
    throw new ApiError(403, 'Insufficient department access');
  }
}

function assertMayEditOrderPricing(user, order) {
  if (!user) throw new ApiError(401, 'Unauthorized');
  if (user.department === 'admin' || user.department === 'super_admin') return;
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
  ORDERS_WRITE_DEPARTMENTS,
  userMayWriteOrders,
  requireOrdersWrite,
  assertMayCreateOrder,
  assertDepartment,
  assertMayEditOrderPricing,
  assertDispatchMayNotChangeCommercials,
};
