/**
 * @fileoverview Order return routes.
 * @module modules/orderReturn/orderReturn.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth, requireSoftDeletePermission } = require('../../middlewares/auth.middleware');
const { requireDepartment } = require('../../middlewares/dept.middleware');
const controller = require('./orderReturn.controller');

router.use(requireAuth);

router.get('/deleted', requireDepartment('sales', 'finance', 'dispatch','account'), requireSoftDeletePermission, controller.listDeleted);
router.get('/', requireDepartment('sales', 'finance', 'dispatch','account'), controller.list);
router.delete('/:id', requireDepartment('dispatch','account'), requireSoftDeletePermission, controller.softDelete);
router.post('/:id/restore', requireDepartment('dispatch','account'), requireSoftDeletePermission, controller.restore);
router.get('/:id', requireDepartment('sales', 'finance', 'dispatch','account'), controller.get);
router.post('/', requireDepartment('dispatch','account'), controller.create);
router.patch('/:id', requireDepartment('dispatch','account'), controller.patch);

module.exports = router;
