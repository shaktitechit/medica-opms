/**
 * @fileoverview Attachments: Express router mounts + RBAC wrappers.
 * @module modules/attachments/attachment.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth, requireSoftDeletePermission } = require('../../middlewares/auth.middleware');
const { uploadMiddleware } = require('../../middlewares/upload.middleware');
const controller = require('./attachment.controller');

router.use(requireAuth);
router.get('/deleted', requireSoftDeletePermission, controller.listDeleted);
router.get('/', controller.list);
router.post('/', uploadMiddleware().single('file'), controller.create);
router.get('/:id', controller.get);
router.post('/:id/restore', requireSoftDeletePermission, controller.restore);
router.delete('/:id', requireSoftDeletePermission, controller.remove);

module.exports = router;
