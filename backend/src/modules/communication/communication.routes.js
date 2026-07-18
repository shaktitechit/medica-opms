/**
 * @fileoverview Communication: typed outbound message queue routes.
 * @module modules/communication/communication.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth } = require('../../middlewares/auth.middleware');
const controller = require('./communication.controller');

router.use(requireAuth);

router.get('/types', controller.listTypes);
router.post('/send', controller.queueFreeform);
router.post('/order-received', controller.queueOrderReceived);
router.post('/queue/:type', controller.queueByType);

module.exports = router;
