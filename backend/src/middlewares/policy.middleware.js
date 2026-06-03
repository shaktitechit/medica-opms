/**
 * @fileoverview Express middleware (policy.middleware).
 * @module middlewares/policy.middleware
 */
/** Policy gate placeholder — compose with policyEngine / can(). */
function policy(action) {
  return function policyMiddleware(req, res, next) {
    next();
  };
}

module.exports = { policy };
