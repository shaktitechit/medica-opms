/**
 * @fileoverview Unified order approval routes.
 * @module modules/orderApproval/orderApproval.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth, requireSoftDeletePermission } = require('../../middlewares/auth.middleware');
const { requireDepartment } = require('../../middlewares/dept.middleware');
const controller = require('./orderApproval.controller');

router.use(requireAuth);

router.get('/deleted', requireDepartment('admin', 'super_admin', 'finance'), requireSoftDeletePermission, controller.listDeleted);
router.get('/', controller.list);
router.post('/', requireDepartment('admin', 'super_admin', 'finance'), controller.create);
router.get('/:id', controller.get);
router.patch('/:id', requireDepartment('admin', 'super_admin', 'finance'), controller.patch);
router.post('/:id/approve', requireDepartment('admin', 'super_admin', 'finance', 'account'), controller.approve);
router.post('/:id/reject', requireDepartment('admin', 'super_admin', 'finance', 'account'), controller.reject);
router.post('/:id/send-to-finance', requireDepartment('admin', 'super_admin'), controller.sendToFinance);
router.post('/:id/send-to-account', requireDepartment('finance', 'super_admin'), controller.sendToAccount);
router.post('/:id/finance-amend', requireDepartment('finance', 'super_admin'), controller.amendByFinance);
router.post('/:id/amend', requireDepartment('account', 'finance', 'admin', 'super_admin'), controller.amend);
router.post(
  '/:id/resolve-dispatch',
  requireDepartment('account', 'super_admin'),
  controller.resolvePartialDispatch,
);
router.delete('/:id', requireDepartment('admin', 'super_admin', 'finance'), requireSoftDeletePermission, controller.softDelete);
router.post('/:id/restore', requireDepartment('admin', 'super_admin', 'finance'), requireSoftDeletePermission, controller.restore);

module.exports = router;
