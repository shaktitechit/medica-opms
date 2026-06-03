/**
 * @fileoverview Transport shipment routes.
 * @module modules/transport/transport.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth, requireSoftDeletePermission } = require('../../middlewares/auth.middleware');
const { requireDepartment } = require('../../middlewares/dept.middleware');
const controller = require('./transport.controller');

router.use(requireAuth);

router.get('/deleted', requireDepartment('sales', 'finance', 'dispatch'), requireSoftDeletePermission, controller.listDeleted);
router.get('/', requireDepartment('sales', 'finance', 'dispatch'), controller.list);
router.delete('/:id', requireDepartment('dispatch'), requireSoftDeletePermission, controller.softDelete);
router.post('/:id/restore', requireDepartment('dispatch'), requireSoftDeletePermission, controller.restore);
router.get('/:id', requireDepartment('sales', 'finance', 'dispatch'), controller.get);
router.post('/', requireDepartment('dispatch'), controller.create);
router.patch('/:id', requireDepartment('dispatch'), controller.patch);

module.exports = router;
