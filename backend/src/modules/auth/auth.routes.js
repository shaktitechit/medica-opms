/**
 * @fileoverview Auth: Express router mounts + RBAC wrappers.
 * @module modules/auth/auth.routes
 */
const { Router } = require('express');
const router = Router();
const authController = require('./auth.controller');
const { requireAuth } = require('../../middlewares/auth.middleware');

router.post('/login', authController.login);
router.get('/me', requireAuth, authController.me);

module.exports = router;
