/**
 * @fileoverview Final order statement routes.
 * @module modules/finalOrderStatement/finalOrderStatement.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireDepartment } = require('../../middlewares/dept.middleware');
const controller = require('./finalOrderStatement.controller');

router.use(requireAuth);

const readDepts = ['sales', 'admin', 'finance', 'account', 'dispatch', 'super_admin'];

router.get('/', requireDepartment(...readDepts), controller.list);
router.get('/order/:orderId', requireDepartment(...readDepts), controller.getByOrder);

module.exports = router;
