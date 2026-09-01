const express = require('express');
const {
  requireAuth,
  requireSoftDeletePermission,
} = require('../../middlewares/auth.middleware');
const { requireDepartment } = require('../../middlewares/dept.middleware');
const controller = require('./lead.controller');
const quotationController = require('./leadQuotation.controller');

const router = express.Router();

router.use(requireAuth);

const salesAndAdmin = ['sales', 'admin', 'super_admin'];

/* --- Duplicate Check --- */
router.post('/check-duplicates', requireDepartment(...salesAndAdmin), controller.checkDuplicates);

/* --- Reports & Dashboard --- */
router.get('/reports/dashboard', requireDepartment(...salesAndAdmin), controller.getDashboardStats);
router.get('/reports/funnel', requireDepartment(...salesAndAdmin), controller.getSalesFunnel);
router.get('/reports/sales-performance', requireDepartment(...salesAndAdmin), controller.getSalesPerformance);
router.get('/reports/source-performance', requireDepartment(...salesAndAdmin), controller.getSourcePerformance);

/* --- Follow-up Calendar --- */
router.get('/follow-ups/calendar', requireDepartment(...salesAndAdmin), controller.getFollowUpCalendar);
router.put('/follow-ups/:followUpId/complete', requireDepartment(...salesAndAdmin), controller.completeFollowUp);

/* --- Lead Quotations --- */
router.get('/quotations/default-terms', requireDepartment(...salesAndAdmin), quotationController.getDefaultTerms);
router.get('/quotations/:quotationId', requireDepartment(...salesAndAdmin), quotationController.getById);
router.patch('/quotations/:quotationId', requireDepartment(...salesAndAdmin), quotationController.update);
router.delete('/quotations/:quotationId', requireDepartment(...salesAndAdmin), quotationController.remove);

/* --- Leads CRUD --- */
router.get('/', requireDepartment(...salesAndAdmin), controller.list);
router.post('/', requireDepartment(...salesAndAdmin), controller.create);
router.delete('/bulk', requireSoftDeletePermission, controller.bulkRemove);
router.get('/:id', requireDepartment(...salesAndAdmin), controller.get);
router.put('/:id', requireDepartment(...salesAndAdmin), controller.update);
router.delete('/:id', requireSoftDeletePermission, controller.remove);
router.post('/:id/restore', requireSoftDeletePermission, controller.restore);

/* --- Lead Actions --- */
router.post('/:id/assign', requireDepartment(...salesAndAdmin), controller.assign);
router.post('/:id/status', requireDepartment(...salesAndAdmin), controller.changeStatus);
router.post('/:id/qualify', requireDepartment(...salesAndAdmin), controller.qualify);
router.post('/:id/mark-lost', requireDepartment(...salesAndAdmin), controller.markLost);
router.post('/:id/convert', requireDepartment('super_admin', 'admin'), controller.convert);
router.get('/:id/timeline', requireDepartment(...salesAndAdmin), controller.getTimeline);

/* --- Lead Follow-ups --- */
router.get('/:id/follow-ups', requireDepartment(...salesAndAdmin), controller.listFollowUps);
router.post('/:id/follow-ups', requireDepartment(...salesAndAdmin), controller.createFollowUp);

/* --- Lead Quotations per Lead --- */
router.get('/:id/quotations', requireDepartment(...salesAndAdmin), quotationController.list);
router.post('/:id/quotations', requireDepartment(...salesAndAdmin), quotationController.create);

module.exports = router;
