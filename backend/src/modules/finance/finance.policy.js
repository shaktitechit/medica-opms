/**
 * @fileoverview Finance: policy checks (ownership / dept / state).
 * @module modules/finance/finance.policy
 */
const { ApiError } = require('../../utils/ApiError');

function assertFinanceDept(user, message = 'Finance or admin required') {
  if (!user) throw new ApiError(401, 'Unauthorized');
  if (!['finance', 'admin'].includes(user.department)) {
    throw new ApiError(403, message);
  }
}

module.exports = { assertFinanceDept };
