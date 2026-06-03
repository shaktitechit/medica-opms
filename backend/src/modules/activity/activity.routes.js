/**
 * @fileoverview Activity: Express router mounts + RBAC wrappers.
 * @module modules/activity/activity.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth, requirePermissions } = require('../../middlewares/auth.middleware');
const controller = require('./activity.controller');

router.use(requireAuth, requirePermissions('dashboard:view', 'users:manage', '*'));

router.get('/', controller.list);

module.exports = router;
