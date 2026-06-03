/**
 * @fileoverview Flags: Express router mounts + RBAC wrappers.
 * @module modules/flags/flag.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth, requirePermissions } = require('../../middlewares/auth.middleware');
const controller = require('./flag.controller');

router.use(requireAuth, requirePermissions('flags:suite', '*'));

router.get('/', controller.list);
router.get('/:id', controller.get);
router.post('/', controller.create);
router.patch('/:id', controller.patch);

module.exports = router;
