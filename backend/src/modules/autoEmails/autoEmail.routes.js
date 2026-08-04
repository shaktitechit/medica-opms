/**
 * @fileoverview Auto Email Routes mapping to autoEmail.controller.
 * @module modules/autoEmails/autoEmail.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth } = require('../../middlewares/auth.middleware');
const controller = require('./autoEmail.controller');

router.use(requireAuth);

router.post('/trigger', controller.triggerAutoEmail);

module.exports = router;
