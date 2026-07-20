/**
 * @fileoverview Work Planner: Express router mounts.
 * @module modules/workPlanner/workPlanner.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireDepartment } = require('../../middlewares/dept.middleware');
const controller = require('./workPlanner.controller');

const salesAndAdmin = ['sales', 'admin', 'super_admin'];
const adminOnly = ['admin', 'super_admin'];

router.use(requireAuth);

router.get('/', requireDepartment(...salesAndAdmin), controller.list);
router.get('/stats', requireDepartment(...salesAndAdmin), controller.stats);
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

router.post('/:id/visits/:visitId/check-in', requireDepartment(...salesAndAdmin), controller.checkIn);
router.post('/:id/visits/:visitId/check-out', requireDepartment(...salesAndAdmin), controller.checkOut);
router.post(
  '/:id/visits/:visitId/complete',
  requireDepartment(...salesAndAdmin),
  controller.completeVisit
);

module.exports = router;
