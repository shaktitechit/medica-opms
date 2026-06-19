/**
 * @fileoverview Products: Express router mounts + department RBAC.
 * @module modules/products/product.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth, requireSoftDeletePermission } = require('../../middlewares/auth.middleware');
const { requireDepartment } = require('../../middlewares/dept.middleware');
const controller = require('./product.controller');

// Google Sheets sync webhook (handles authentication via api key / query secret)
router.post('/google-sheet-webhook', controller.googleSheetWebhook);

router.use(requireAuth);

const readDepartments = ['sales', 'admin', 'finance', 'account', 'dispatch'];
const manageDepartments = ['admin', 'super_admin', 'sales','finance','account'];

router.post('/bulk', requireDepartment(...manageDepartments), controller.bulkCreate);
router.post('/bulk-delete', requireDepartment(...manageDepartments), controller.bulkDelete);

router.get(
  '/deleted',
  requireDepartment(...manageDepartments),
  controller.listDeleted,
);
router.get('/', requireDepartment(...readDepartments), controller.list);
router.delete(
  '/:id',
  requireDepartment(...manageDepartments),
  controller.softDelete,
);
router.post(
  '/:id/restore',
  requireDepartment(...manageDepartments),
  controller.restore,
);
router.get('/:id', requireDepartment(...readDepartments), controller.get);
router.post('/', requireDepartment(...manageDepartments), controller.create);
router.patch('/:id', requireDepartment(...manageDepartments), controller.update);

module.exports = router;
