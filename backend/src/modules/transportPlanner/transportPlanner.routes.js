/**
 * @fileoverview Transport Planner: Express router mounts.
 * @module modules/transportPlanner/transportPlanner.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireDepartment } = require('../../middlewares/dept.middleware');
const controller = require('./transportPlanner.controller');
const { ensureTransportPlanOrderIndexes } = require('./transportPlanner.indexes');

const planners = ['account', 'admin', 'super_admin'];
const viewers = ['account', 'dispatch', 'admin', 'super_admin'];
const executors = ['dispatch', 'admin', 'super_admin'];

router.use(requireAuth);

router.use(async (_req, _res, next) => {
  try {
    await ensureTransportPlanOrderIndexes();
  } catch (_) {
    // Index ensure is best-effort; request handlers still run.
  }
  next();
});

router.get('/', requireDepartment(...viewers), controller.list);
router.get('/stats', requireDepartment(...viewers), controller.stats);
router.get('/eligible-orders', requireDepartment(...planners), controller.eligibleOrders);
router.post('/', requireDepartment(...planners), controller.create);

router.get('/:id', requireDepartment(...viewers), controller.get);
router.patch('/:id', requireDepartment(...planners), controller.update);
router.delete('/:id', requireDepartment(...planners), controller.remove);

router.post('/:id/submit', requireDepartment(...planners), controller.submit);
router.post('/:id/complete', requireDepartment(...executors), controller.complete);
router.post('/:id/cancel', requireDepartment(...planners), controller.cancel);

router.post('/:id/orders', requireDepartment(...planners), controller.addOrders);
router.delete('/:id/orders/:planOrderId', requireDepartment(...planners), controller.removeOrder);
router.post(
  '/:id/orders/:planOrderId/cancel',
  requireDepartment(...viewers),
  controller.cancelPlanOrder
);

router.patch(
  '/:id/orders/:planOrderId',
  requireDepartment(...executors),
  controller.updateDispatchDetails
);
router.post(
  '/:id/orders/:planOrderId/generate-lr',
  requireDepartment(...executors),
  controller.generateLr
);
router.post(
  '/:id/orders/:planOrderId/mark-packed',
  requireDepartment(...executors),
  controller.markPacked
);
router.post(
  '/:id/orders/:planOrderId/mark-dispatched',
  requireDepartment(...executors),
  controller.markDispatched
);
router.post(
  '/:id/orders/:planOrderId/mark-delivered',
  requireDepartment(...executors),
  controller.markDelivered
);

module.exports = router;
