/**
 * @fileoverview Fleet: Express router mounts + RBAC wrappers.
 * @module modules/fleet/driver.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth, requireSoftDeletePermission } = require('../../middlewares/auth.middleware');
const { requireDepartment } = require('../../middlewares/dept.middleware');
const controller = require('./driver.controller');

router.use(requireAuth, requireDepartment('dispatch', 'admin'));

router.get('/deleted', controller.listDeleted);
router.get('/', controller.list);
router.delete('/:id', controller.softDelete);
router.post('/:id/restore', controller.restore);
router.get('/:id', controller.get);
router.post('/', controller.create);
router.patch('/:id', controller.patch);

module.exports = router;
