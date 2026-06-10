/**
 * @fileoverview Orders: Express router mounts + RBAC wrappers.
 * @module modules/orders/order.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth, requirePermissions, requireSoftDeletePermission } = require('../../middlewares/auth.middleware');
const { requireOrdersWrite } = require('./order.policy');
const controller = require('./order.controller');

router.use(requireAuth);
router.get('/', requirePermissions('orders:read', '*'), controller.list);

router.post('/', requireOrdersWrite, controller.create);

router.get('/deleted', requireSoftDeletePermission, controller.listDeleted);

router.get('/:id/history', requirePermissions('orders:read', '*'), controller.history);
router.get('/:id/fulfillment', requirePermissions('orders:read', '*'), controller.fulfillment);
router.get('/:id/approvals', requirePermissions('orders:read', '*'), controller.approvals);

router.delete('/:id', requireSoftDeletePermission, controller.softDelete);
router.post('/:id/restore', requireSoftDeletePermission, controller.restore);

router.get('/:id', requirePermissions('orders:read', '*'), controller.get);

router.patch('/:id', requireOrdersWrite, controller.update);

router.post('/:id/transition', controller.transition);

module.exports = router;
