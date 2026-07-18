/**
 * @fileoverview Messages: log listing + WhatsApp webhook.
 * Outbound typed queues: modules/communication.
 * @module modules/messages/message.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth } = require('../../middlewares/auth.middleware');
const controller = require('./message.controller');

// Public Webhook routes (no Auth middleware)
router.get('/webhook', controller.verifyWebhook);
router.post('/webhook', controller.receiveWebhook);

router.use(requireAuth);

router.get('/', controller.list);
router.get('/:id', controller.getById);

module.exports = router;
