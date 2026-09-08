/**
 * @fileoverview Router for standalone `/api/quotations` endpoints.
 * @module modules/quotations/quotation.routes
 */
const express = require('express');
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireDepartment } = require('../../middlewares/dept.middleware');
const controller = require('./quotation.controller');
const { QUOTATION_ROLES } = require('./quotation.constants');

const router = express.Router();

router.use(requireAuth);

router.get('/default-terms', requireDepartment(...QUOTATION_ROLES), controller.getDefaultTerms);
router.get('/', requireDepartment(...QUOTATION_ROLES), controller.list);
router.post('/', requireDepartment(...QUOTATION_ROLES), controller.create);
router.get('/:id', requireDepartment(...QUOTATION_ROLES), controller.getById);
router.patch('/:id', requireDepartment(...QUOTATION_ROLES), controller.update);
router.put('/:id', requireDepartment(...QUOTATION_ROLES), controller.update);
router.post('/:id/submit-for-approval', requireDepartment(...QUOTATION_ROLES), controller.submitForApproval);
router.post('/:id/approve', requireDepartment(...QUOTATION_ROLES), controller.approve);
router.post('/:id/reject', requireDepartment(...QUOTATION_ROLES), controller.reject);
router.delete('/:id', requireDepartment(...QUOTATION_ROLES), controller.remove);

module.exports = router;
