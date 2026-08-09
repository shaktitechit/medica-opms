/**
 * @fileoverview Unbilled order routes.
 * @module modules/unbilledOrder/unbilledOrder.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth, requireSoftDeletePermission } = require('../../middlewares/auth.middleware');
const { requireDepartment } = require('../../middlewares/dept.middleware');
const controller = require('./unbilledOrder.controller');

router.use(requireAuth);

const readDepts = ['sales', 'admin', 'finance', 'account', 'dispatch', 'super_admin'];
const writeDepts = ['admin', 'finance', 'account', 'dispatch', 'super_admin'];

router.get(
  '/deleted',
  requireDepartment(...readDepts),
  requireSoftDeletePermission,
  controller.listDeleted,
);

router.get('/order/:orderId', requireDepartment(...readDepts), controller.getByOrder);

router.get('/', requireDepartment(...readDepts), controller.list);
router.get('/:id', requireDepartment(...readDepts), controller.get);

router.post('/', requireDepartment(...writeDepts), controller.create);
router.patch('/:id', requireDepartment(...writeDepts), controller.patch);

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
