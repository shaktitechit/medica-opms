/**
 * @fileoverview Parties Express router mounts + RBAC.
 * @module modules/parties/party.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth, requirePermissions, requireSoftDeletePermission } = require('../../middlewares/auth.middleware');
const controller = require('./party.controller');

router.use(requireAuth);
router.get('/deleted', requireSoftDeletePermission, controller.listDeleted);
router.get('/', controller.list);
router.post('/bulk', requirePermissions('parties:manage', '*'), controller.bulkCreate);
router.delete('/:id', requireSoftDeletePermission, controller.softDelete);
router.post('/:id/restore', requireSoftDeletePermission, controller.restore);
router.get('/:id', controller.get);
router.post('/', requirePermissions('parties:manage', '*'), controller.create);
router.patch('/:id', requirePermissions('parties:manage', '*'), controller.update);

module.exports = router;
