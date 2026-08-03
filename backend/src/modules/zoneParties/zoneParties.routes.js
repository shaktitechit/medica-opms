/**
 * @fileoverview ZoneParties: Express router mounts + department RBAC.
 * @module modules/zoneParties/zoneParties.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireDepartment } = require('../../middlewares/dept.middleware');
const controller = require('./zoneParties.controller');

router.use(requireAuth);

const readDepartments = ['sales', 'admin', 'finance', 'account', 'dispatch'];
const manageDepartments = ['admin', 'super_admin', 'sales', 'finance', 'account'];

// Relationship queries
router.get('/:id/parties', requireDepartment(...readDepartments), controller.getParties);
router.post('/:id/parties', requireDepartment(...manageDepartments), controller.associateParties);

router.get('/:id/sales-persons', requireDepartment(...readDepartments), controller.getSalesPersons);
router.post('/:id/sales-persons', requireDepartment(...manageDepartments), controller.associateSalesPersons);

// Standard CRUD
router.get('/', requireDepartment(...readDepartments), controller.list);
router.get('/:id', requireDepartment(...readDepartments), controller.get);
router.post('/', requireDepartment(...manageDepartments), controller.create);
router.patch('/:id', requireDepartment(...manageDepartments), controller.update);
router.delete('/:id', requireDepartment(...manageDepartments), controller.softDelete);

module.exports = router;
