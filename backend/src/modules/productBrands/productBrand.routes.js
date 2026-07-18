/**
 * @fileoverview ProductBrands: Express router mounts + department RBAC.
 * @module modules/productBrands/productBrand.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireDepartment } = require('../../middlewares/dept.middleware');
const controller = require('./productBrand.controller');

router.use(requireAuth);

const readDepartments = ['sales', 'admin', 'finance', 'account', 'dispatch'];
const manageDepartments = ['admin', 'super_admin', 'sales', 'finance', 'account'];

// Relationship queries
router.get('/:id/products', requireDepartment(...readDepartments), controller.getProducts);
router.post('/:id/products', requireDepartment(...manageDepartments), controller.associateProducts);

// Bulk operations
router.post('/bulk', requireDepartment(...manageDepartments), controller.bulkCreate);
router.post('/bulk-delete', requireDepartment(...manageDepartments), controller.bulkDelete);

// Standard CRUD
router.get('/', requireDepartment(...readDepartments), controller.list);
router.get('/:id', requireDepartment(...readDepartments), controller.get);
router.post('/', requireDepartment(...manageDepartments), controller.create);
router.patch('/:id', requireDepartment(...manageDepartments), controller.update);
router.delete('/:id', requireDepartment(...manageDepartments), controller.softDelete);

module.exports = router;
