/**
 * @fileoverview Approvals: Express router mounts + RBAC wrappers.
 * @module modules/approvals/approval.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth, requirePermissions } = require('../../middlewares/auth.middleware');
const controller = require('./approval.controller');

router.use(requireAuth, requirePermissions('orders:read', 'finance:suite', '*'));

router.get('/', controller.list);

module.exports = router;
