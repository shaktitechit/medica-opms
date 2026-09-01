/**
 * @fileoverview Express routes for Company Info
 * @module modules/companyInfo/companyInfo.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth } = require('../../middlewares/auth.middleware');
const { ApiError } = require('../../utils/ApiError');
const controller = require('./companyInfo.controller');

function requireSuperAdminOrManage(req, _res, next) {
  if (!req.user) {
    return next(new ApiError(401, 'Authentication required'));
  }
  const set = new Set(req.user.permissionCodes || []);
  const isSuperAdmin =
    req.user.department === 'super_admin' ||
    set.has('*') ||
    set.has('users:manage') ||
    set.has('system:manage');

  if (!isSuperAdmin) {
    return next(new ApiError(403, 'Permission denied: Super Admin access required'));
  }
  next();
}

// Public: basic company info (name, logo, favicon, contacts) for login page & headers
router.get('/', controller.get);

// Protected routes
router.use(requireAuth);

router.get('/data', controller.getData);
router.put('/', requireSuperAdminOrManage, controller.update);
router.patch('/', requireSuperAdminOrManage, controller.update);

module.exports = router;
