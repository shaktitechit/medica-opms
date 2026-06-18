/**
 * @fileoverview Order due sheet routes.
 * @module modules/orderDueSheet/orderDueSheet.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth, requireSoftDeletePermission } = require('../../middlewares/auth.middleware');
const { requireDepartment } = require('../../middlewares/dept.middleware');
const { uploadMiddleware } = require('../../middlewares/upload.middleware');
const controller = require('./orderDueSheet.controller');

router.use(requireAuth);

const readDepts = ['sales', 'admin', 'finance', 'account', 'dispatch', 'super_admin'];
const writeDepts = ['admin', 'finance', 'account', 'super_admin'];

router.get(
  '/deleted',
  requireDepartment(...readDepts),
  requireSoftDeletePermission,
  controller.listDeleted,
);
router.get('/order/:orderId/current', requireDepartment(...readDepts), controller.getCurrentByOrder);
router.get('/', requireDepartment(...readDepts), controller.list);
router.get('/:id', requireDepartment(...readDepts), controller.get);

router.post(
  '/',
  requireDepartment(...writeDepts),
  uploadMiddleware().single('document'),
  controller.create,
);
router.patch('/:id', requireDepartment(...writeDepts), controller.patch);
router.post(
  '/:id/document',
  requireDepartment(...writeDepts),
  uploadMiddleware().single('document'),
  controller.replaceDocument,
);

router.delete(
  '/:id',
  requireDepartment(...writeDepts),
  requireSoftDeletePermission,
  controller.softDelete,
);
router.post(
  '/:id/restore',
  requireDepartment(...writeDepts),
  requireSoftDeletePermission,
  controller.restore,
);

module.exports = router;
