/**
 * @fileoverview ProductKitItem: Express router mounts + department RBAC.
 * @module modules/productKitItems/productKitItem.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireDepartment } = require('../../middlewares/dept.middleware');
const controller = require('./productKitItem.controller');

router.use(requireAuth);

const readDepartments = ['sales', 'admin', 'finance', 'account', 'dispatch'];
const manageDepartments = ['admin', 'super_admin', 'sales', 'finance', 'account'];

router.get(
  '/deleted',
  requireDepartment(...manageDepartments),
  controller.listDeleted,
);

router.get(
  '/by-kit/:kitId',
  requireDepartment(...readDepartments),
  controller.getByKit,
);
router.put(
  '/by-kit/:kitId',
  requireDepartment(...manageDepartments),
  controller.upsertByKit,
);

router.post(
  '/:id/items',
  requireDepartment(...manageDepartments),
  controller.addItem,
);
router.patch(
  '/:id/items/:itemId',
  requireDepartment(...manageDepartments),
  controller.updateItem,
);
router.delete(
  '/:id/items/:itemId',
  requireDepartment(...manageDepartments),
  controller.removeItem,
);

router.get('/', requireDepartment(...readDepartments), controller.list);
router.get('/:id', requireDepartment(...readDepartments), controller.get);
router.post('/', requireDepartment(...manageDepartments), controller.create);
router.patch('/:id', requireDepartment(...manageDepartments), controller.update);
router.delete('/:id', requireDepartment(...manageDepartments), controller.softDelete);
router.post(
  '/:id/restore',
  requireDepartment(...manageDepartments),
  controller.restore,
);

module.exports = router;
