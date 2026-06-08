/**
 * @fileoverview Messages: Express router mounts + RBAC wrappers.
 * @module modules/messages/message.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth } = require('../../middlewares/auth.middleware');
const controller = require('./message.controller');

// Require authentication for all message actions
router.use(requireAuth);

router.post('/send', controller.queueMessage);
router.get('/', controller.list);
router.get('/:id', controller.getById);

module.exports = router;
