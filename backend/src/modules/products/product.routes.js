/**
 * @fileoverview Products: Express router mounts + RBAC wrappers.
 * @module modules/products/product.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth, requirePermissions, requireSoftDeletePermission } = require('../../middlewares/auth.middleware');
const controller = require('./product.controller');

router.use(requireAuth);

router.post('/bulk', controller.bulkCreate);

router.get('/deleted', requireSoftDeletePermission, controller.listDeleted);
router.get('/', controller.list);
router.delete('/:id', requireSoftDeletePermission, controller.softDelete);
router.post('/:id/restore', requireSoftDeletePermission, controller.restore);
router.get('/:id', controller.get);
router.post('/', controller.create);
router.patch('/:id', controller.update);

module.exports = router;
