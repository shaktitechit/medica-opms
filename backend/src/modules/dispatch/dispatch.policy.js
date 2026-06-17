/**
 * @fileoverview Order dispatch policy checks.
 * @module modules/dispatch/dispatch.policy
 */
const { ApiError } = require('../../utils/ApiError');

const PRE_DISPATCH_PHASES = Object.freeze([
  'dispatch',
  'dispatch_review',
  'dispatch_execution',
  'completed',
]);

const PRE_DISPATCH = new Set(PRE_DISPATCH_PHASES);

/** Require admin → finance → account clearance before dispatch batches. */
function assertOrderEligibleForDispatchPhase(order) {
  const stage = typeof order === 'string' ? order : order?.workflow_stage;
  const action = typeof order === 'string' ? null : order?.current_action;
  const lifecycle = typeof order === 'string' ? null : order?.lifecycle_status;

  if (lifecycle === 'cancelled' || action === 'cancelled') {
    throw new ApiError(400, 'Cancelled orders cannot be dispatched');
  }

  if (!PRE_DISPATCH.has(stage)) {
    throw new ApiError(400, 'Order must complete account clearance before dispatch activity');
  }
}

module.exports = { PRE_DISPATCH_PHASES, PRE_DISPATCH, assertOrderEligibleForDispatchPhase };
