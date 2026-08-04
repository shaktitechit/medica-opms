/**
 * @fileoverview Email routes mapping endpoints to email.controller.js.
 * @module modules/messages/email.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth } = require('../../middlewares/auth.middleware');
const controller = require('./email.controller');

router.use(requireAuth);

router.post('/', controller.sendEmail);
router.get('/', controller.listEmails);
router.get('/:id', controller.getEmailById);

module.exports = router;
