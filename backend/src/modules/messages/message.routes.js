/**
 * @fileoverview Messages: Express router mounts + RBAC wrappers.
 * @module modules/messages/message.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth } = require('../../middlewares/auth.middleware');
const controller = require('./message.controller');

// Public Webhook routes (no Auth middleware)
router.get('/webhook', controller.verifyWebhook);
router.post('/webhook', controller.receiveWebhook);

// Require authentication for all other message actions
router.use(requireAuth);

router.post('/send', controller.queueMessage);
router.get('/', controller.list);
router.get('/:id', controller.getById);

module.exports = router;
