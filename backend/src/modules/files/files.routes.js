/**
 * @fileoverview Files: Express router mounts + RBAC wrappers.
 * @module modules/files/files.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth } = require('../../middlewares/auth.middleware');
const controller = require('./files.controller');

router.get('/files/:fileId/view', requireAuth, controller.redirectToViewUrl);
router.get('/files/:fileId/download', requireAuth, controller.redirectToDownloadUrl);

module.exports = router;
