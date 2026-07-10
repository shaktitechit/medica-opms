/**
 * @fileoverview Transport agents: Express router mounts + RBAC wrappers.
 * @module modules/fleet/transportAgent.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth, requireSoftDeletePermission } = require('../../middlewares/auth.middleware');
const { requireDepartment } = require('../../middlewares/dept.middleware');
const controller = require('./transportAgent.controller');

router.use(requireAuth);

router.get('/deleted', requireDepartment('dispatch', 'admin'), controller.listDeleted);
router.get('/', requireDepartment('dispatch', 'admin', 'sales', 'finance'), controller.list);
router.delete('/:id', requireDepartment('dispatch', 'admin'), controller.softDelete);
router.post('/:id/restore', requireDepartment('dispatch', 'admin'), controller.restore);
router.get('/:id', requireDepartment('dispatch', 'admin', 'sales', 'finance'), controller.get);
router.post('/', requireDepartment('dispatch', 'admin'), controller.create);
router.patch('/:id', requireDepartment('dispatch', 'admin'), controller.patch);

module.exports = router;
