/**
 * @fileoverview Transport agents: Express router mounts + RBAC wrappers.
 * @module modules/fleet/transportAgent.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireDepartment } = require('../../middlewares/dept.middleware');
const controller = require('./transportAgent.controller');

router.use(requireAuth);

const readDepartments = ['dispatch', 'admin', 'sales', 'finance', 'account'];
const manageDepartments = ['dispatch', 'admin', 'finance', 'account'];

router.get('/deleted', requireDepartment(...manageDepartments), controller.listDeleted);
router.get('/', requireDepartment(...readDepartments), controller.list);
router.delete('/:id', requireDepartment(...manageDepartments), controller.softDelete);
router.post('/:id/restore', requireDepartment(...manageDepartments), controller.restore);
router.get('/:id', requireDepartment(...readDepartments), controller.get);
router.post('/', requireDepartment(...manageDepartments), controller.create);
router.patch('/:id', requireDepartment(...manageDepartments), controller.patch);

module.exports = router;
