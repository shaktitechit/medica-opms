/**
 * @fileoverview Order finance approval routes.
 * @module modules/orderFinanceApproval/orderFinanceApproval.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth, requireSoftDeletePermission } = require('../../middlewares/auth.middleware');
const { requireDepartment } = require('../../middlewares/dept.middleware');
const controller = require('./orderFinanceApproval.controller');

router.use(requireAuth);

router.get('/deleted', requireDepartment('finance', 'admin'), requireSoftDeletePermission, controller.listDeleted);
router.get('/', controller.list);
router.post('/', requireDepartment('finance', 'admin'), controller.create);
router.get('/:id', controller.get);
router.patch('/:id', requireDepartment('finance', 'admin'), controller.patch);
router.post('/:id/approve', requireDepartment('finance', 'admin'), controller.approve);
router.post('/:id/reject', requireDepartment('finance', 'admin'), controller.reject);
router.delete('/:id', requireDepartment('finance', 'admin'), requireSoftDeletePermission, controller.softDelete);
router.post('/:id/restore', requireDepartment('finance', 'admin'), requireSoftDeletePermission, controller.restore);

module.exports = router;
