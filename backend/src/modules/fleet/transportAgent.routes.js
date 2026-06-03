/**
 * @fileoverview Transport agents: Express router mounts + RBAC wrappers.
 * @module modules/fleet/transportAgent.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth, requireSoftDeletePermission } = require('../../middlewares/auth.middleware');
const { requireDepartment } = require('../../middlewares/dept.middleware');
const controller = require('./transportAgent.controller');

router.use(requireAuth, requireDepartment('dispatch', 'admin'));

router.get('/deleted', requireSoftDeletePermission, controller.listDeleted);
router.get('/', controller.list);
router.delete('/:id', requireSoftDeletePermission, controller.softDelete);
router.post('/:id/restore', requireSoftDeletePermission, controller.restore);
router.get('/:id', controller.get);
router.post('/', controller.create);
router.patch('/:id', controller.patch);

module.exports = router;
