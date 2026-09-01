/**
 * @fileoverview Work Planner: Express router mounts.
 * @module modules/workPlanner/workPlanner.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireDepartment } = require('../../middlewares/dept.middleware');
const controller = require('./workPlanner.controller');

const salesAndAdmin = ['sales', 'admin', 'super_admin', 'finance'];
const adminOnly = ['admin', 'super_admin', 'finance'];

router.use(requireAuth);

router.get('/', requireDepartment(...salesAndAdmin), controller.list);
router.get('/stats', requireDepartment(...salesAndAdmin), controller.stats);
router.get('/expenses', requireDepartment(...salesAndAdmin), controller.listAllExpenses);
router.post('/', requireDepartment(...salesAndAdmin), controller.create);

router.get('/:id', requireDepartment(...salesAndAdmin), controller.get);
router.patch('/:id', requireDepartment(...salesAndAdmin), controller.update);
router.delete('/:id', requireDepartment(...salesAndAdmin), controller.remove);

router.post('/:id/submit', requireDepartment(...salesAndAdmin), controller.submit);
router.post('/:id/approve', requireDepartment(...adminOnly), controller.approve);
router.post('/:id/reject', requireDepartment(...adminOnly), controller.reject);

router.post('/:id/visits', requireDepartment(...salesAndAdmin), controller.addVisit);
router.patch('/:id/visits/:visitId', requireDepartment(...salesAndAdmin), controller.updateVisit);
router.delete('/:id/visits/:visitId', requireDepartment(...salesAndAdmin), controller.removeVisit);

router.post('/:id/works', requireDepartment(...salesAndAdmin), controller.addWork);
router.patch('/:id/works/:workId', requireDepartment(...salesAndAdmin), controller.updateWork);
router.delete('/:id/works/:workId', requireDepartment(...salesAndAdmin), controller.removeWork);

router.post('/:id/visits/:visitId/check-in', requireDepartment(...salesAndAdmin), controller.checkIn);
router.post('/:id/visits/:visitId/check-out', requireDepartment(...salesAndAdmin), controller.checkOut);
router.post(
  '/:id/visits/:visitId/complete',
  requireDepartment(...salesAndAdmin),
  controller.completeVisit
);
router.post(
  '/:id/visits/:visitId/schedule-next',
  requireDepartment(...salesAndAdmin),
  controller.scheduleNextVisit
);

router.get('/:id/expenses', requireDepartment(...salesAndAdmin), controller.listExpenses);
router.post('/:id/expenses', requireDepartment(...salesAndAdmin), controller.addExpense);
router.post(
  '/:id/expenses/submit-all',
  requireDepartment(...salesAndAdmin),
  controller.submitAllExpenses
);
router.post(
  '/:id/expenses/approve-all',
  requireDepartment(...adminOnly),
  controller.approveAllExpenses
);
router.post(
  '/:id/expenses/reject-all',
  requireDepartment(...adminOnly),
  controller.rejectAllExpenses
);
router.patch(
  '/:id/expenses/:expenseId',
  requireDepartment(...salesAndAdmin),
  controller.updateExpense
);
router.delete(
  '/:id/expenses/:expenseId',
  requireDepartment(...salesAndAdmin),
  controller.removeExpense
);
router.post(
  '/:id/expenses/:expenseId/submit',
  requireDepartment(...salesAndAdmin),
  controller.submitExpense
);
router.post(
  '/:id/expenses/:expenseId/approve',
  requireDepartment(...adminOnly),
  controller.approveExpense
);
router.post(
  '/:id/expenses/:expenseId/reject',
  requireDepartment(...adminOnly),
  controller.rejectExpense
);

module.exports = router;
