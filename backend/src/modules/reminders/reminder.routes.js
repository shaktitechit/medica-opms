/**
 * @fileoverview Reminders: Express router mounts.
 * @module modules/reminders/reminder.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth } = require('../../middlewares/auth.middleware');
const controller = require('./reminder.controller');

// Google Sheets sync webhook (handles authentication via api key / query secret)
router.post('/google-sheet-webhook', controller.googleSheetWebhook);

router.use(requireAuth);

router.get('/', controller.list);
router.get('/:id', controller.get);
router.post('/', controller.create);
router.post('/:id/follow-ups', controller.addFollowUp);
router.patch('/:id', controller.patch);
router.delete('/:id', controller.remove);

module.exports = router;
