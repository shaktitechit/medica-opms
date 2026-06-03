/**
 * @fileoverview Orders: request body/query validation guards.
 * @module modules/orders/order.validation
 */
const { ApiError } = require('../../utils/ApiError');
const { ORDER_STATUS_VALUES } = require('../../constants/orderStatus');

function assertTransition(body) {
  if (!body || typeof body !== 'object') throw new ApiError(400, 'JSON body required');
  if (!body.next_status) throw new ApiError(400, 'next_status is required');
  if (!ORDER_STATUS_VALUES.includes(body.next_status)) {
    throw new ApiError(400, `Invalid next_status`);
  }
}

module.exports = { assertTransition };
