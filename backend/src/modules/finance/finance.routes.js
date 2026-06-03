/**
 * @fileoverview Finance: Express router mounts + RBAC wrappers.
 * @module modules/finance/finance.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireDepartment } = require('../../middlewares/dept.middleware');
const controller = require('./finance.controller');

router.use(requireAuth, requireDepartment('finance', 'admin'));

router.get('/queue', controller.queue);
router.get('/summary', controller.summary);

module.exports = router;
