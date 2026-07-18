/**
 * @fileoverview Web Push subscription routes.
 * @module modules/push/push.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth } = require('../../middlewares/auth.middleware');
const controller = require('./push.controller');

/** Public: browser needs the VAPID public key before subscribe. */
router.get('/push/vapid-public-key', controller.getVapidPublicKey);

router.post('/subscribe', requireAuth, controller.subscribe);
router.delete('/subscribe', requireAuth, controller.unsubscribe);
router.post('/push/notify', requireAuth, controller.notifySelf);

module.exports = router;
