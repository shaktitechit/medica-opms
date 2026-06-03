/**
 * @fileoverview Express middleware (dept.middleware).
 * @module middlewares/dept.middleware
 */
const { ApiError } = require('../utils/ApiError');

function requireDepartment(...allowed) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));
    if (['admin', 'super_admin'].includes(req.user.department) || allowed.includes(req.user.department)) return next();
    return next(new ApiError(403, 'This endpoint is restricted to another department'));
  };
}

/** Dept match only (`admin` is not a global wildcard). Used for segmented dashboards. */
function requireDepartmentOnly(...allowed) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));
    if (allowed.includes(req.user.department)) return next();
    return next(new ApiError(403, 'This endpoint is restricted to another department'));
  };
}

module.exports = { requireDepartment, requireDepartmentOnly };
