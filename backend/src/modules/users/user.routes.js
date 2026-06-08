/**
 * @fileoverview Users: Express router mounts + RBAC wrappers.
 * @module modules/users/user.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth, requirePermissions } = require('../../middlewares/auth.middleware');
const controller = require('./user.controller');

router.use(requireAuth);
router.get('/roles', requirePermissions('users:manage', '*'), controller.roles);
router.get('/permissions', requirePermissions('users:manage', '*'), controller.permissions);
router.get('/', controller.list);
router.post('/', requirePermissions('users:manage', '*'), controller.create);
router.get('/:id', requirePermissions('users:manage', '*'), controller.get);
router.patch('/:id', controller.patch);

module.exports = router;
