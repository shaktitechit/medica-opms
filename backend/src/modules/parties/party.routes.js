/**
 * @fileoverview Parties Express router mounts + RBAC.
 * @module modules/parties/party.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth, requireSoftDeletePermission } = require('../../middlewares/auth.middleware');
const { requirePartiesManage } = require('./party.policy');
const controller = require('./party.controller');

router.use(requireAuth);
router.get('/deleted', requireSoftDeletePermission, controller.listDeleted);
router.get('/', controller.list);
router.post('/bulk', requirePartiesManage, controller.bulkCreate);
router.delete('/:id', requireSoftDeletePermission, controller.softDelete);
router.post('/:id/restore', requireSoftDeletePermission, controller.restore);
router.get('/:id', controller.get);
router.post('/', requirePartiesManage, controller.create);
router.patch('/:id', requirePartiesManage, controller.update);

module.exports = router;
