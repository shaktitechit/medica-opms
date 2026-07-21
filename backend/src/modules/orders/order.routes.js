/**
 * @fileoverview Orders: Express router mounts + RBAC wrappers.
 * @module modules/orders/order.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth, requirePermissions, requireSoftDeletePermission } = require('../../middlewares/auth.middleware');
const { requireDepartmentOnly } = require('../../middlewares/dept.middleware');
const controller = require('./order.controller');

// Google Sheets sync webhook (auth via query secret / header — no JWT)
router.post('/google-sheet-webhook', controller.googleSheetWebhook);

router.use(requireAuth);
router.get('/', requirePermissions('orders:read', '*'), controller.list);

router.post('/', requirePermissions('orders:write', '*'), controller.create);

router.get('/deleted', requireSoftDeletePermission, controller.listDeleted);

router.get('/:id/history', requirePermissions('orders:read', '*'), controller.history);
router.get('/:id/fulfillment', requirePermissions('orders:read', '*'), controller.fulfillment);
router.get('/:id/approvals', requirePermissions('orders:read', '*'), controller.approvals);
router.get('/:id/assignees', requirePermissions('orders:read', '*'), controller.assignees);

router.delete('/:id', requireSoftDeletePermission, controller.softDelete);
router.post('/:id/restore', requireSoftDeletePermission, controller.restore);

router.get('/:id', requirePermissions('orders:read', '*'), controller.get);

router.patch(
  '/:id/super-sheet',
  requireDepartmentOnly('super_admin'),
  controller.superSheetUpdate,
);

router.patch('/:id', controller.update);

router.post('/:id/close', controller.closeOrder);
router.post('/:id/reopen', controller.reopenOrder);
router.post('/:id/close-after-full-delivery', controller.closeAfterFullDelivery);

router.post('/:id/submit', requirePermissions('orders:write', '*'), controller.submit);
router.post('/:id/transition', controller.transition);

module.exports = router;
