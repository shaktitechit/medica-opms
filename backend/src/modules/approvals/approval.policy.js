/**
 * @fileoverview Approvals: policy checks (ownership / dept / state).
 * @module modules/approvals/approval.policy
 */
const { ApiError } = require('../../utils/ApiError');
const orderPolicy = require('../orders/order.policy');

/** Sales / finance hand-off — finance rejection payloads */
function assertFinanceRejectionPayload(rejectionReason, remarksFallback) {
  const reason = rejectionReason ?? remarksFallback;
  if (!reason || !String(reason).trim()) {
    throw new ApiError(400, 'Finance rejection must include rejection_reason');
  }
  return reason;
}

/** Who may approve at sales checkpoint (sales team / admins). */
function assertSalesApprover(user) {
  orderPolicy.assertDepartment(user, ['sales', 'admin']);
}

module.exports = { assertFinanceRejectionPayload, assertSalesApprover };
