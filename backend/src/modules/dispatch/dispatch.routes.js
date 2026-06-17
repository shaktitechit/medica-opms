/**
 * @fileoverview Order dispatch routes.
 * @module modules/dispatch/dispatch.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth, requireSoftDeletePermission } = require('../../middlewares/auth.middleware');
const { requireDepartment } = require('../../middlewares/dept.middleware');
const { uploadMiddleware } = require('../../middlewares/upload.middleware');
const controller = require('./dispatch.controller');

router.use(requireAuth);

router.get('/deleted', requireDepartment('sales', 'finance', 'dispatch'), requireSoftDeletePermission, controller.listDeleted);
router.get('/', requireDepartment('sales', 'finance', 'dispatch', 'account'), controller.list);
router.delete('/:id', requireDepartment('dispatch'), requireSoftDeletePermission, controller.softDelete);
router.post('/:id/restore', requireDepartment('dispatch'), requireSoftDeletePermission, controller.restore);
router.get('/:id', requireDepartment('sales', 'finance', 'dispatch', 'account'), controller.get);
router.post(
  '/',
  requireDepartment('dispatch', 'account'),
  uploadMiddleware().single('bill_document'),
  controller.create,
);
router.patch('/:id', requireDepartment('dispatch', 'account'), controller.patch);

module.exports = router;
