/**
 * @fileoverview Transport shipment policy checks.
 * @module modules/transport/transport.policy
 */
const { ApiError } = require('../../utils/ApiError');

const ALLOWED_ORDER_PHASES_FOR_TRANSPORT = Object.freeze([
  'dispatch_review',
  'dispatch_execution',
  'completed',
]);

/** Transport rules: cannot start logistics before dispatch execution has started. */
function assertTransportAllowedForOrder(order) {
  const stage = typeof order === 'string' ? order : order?.workflow_stage;
  const dispatchStatus = typeof order === 'string' ? null : order?.dispatch_status;

  if (!ALLOWED_ORDER_PHASES_FOR_TRANSPORT.includes(stage) || dispatchStatus === 'pending') {
    throw new ApiError(400, 'Transport cannot start before dispatch (blocking rule)');
  }
}

module.exports = { ALLOWED_ORDER_PHASES_FOR_TRANSPORT, assertTransportAllowedForOrder };
