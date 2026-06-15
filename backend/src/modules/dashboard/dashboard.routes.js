/**
 * @fileoverview Dashboard: Express router mounts + RBAC wrappers.
 * @module modules/dashboard/dashboard.routes
 */
const { Router } = require('express');
const router = Router();
const asyncHandler = require('../../utils/asyncHandler');
const { requireAuth } = require('../../middlewares/auth.middleware');
const {
  requireDepartmentOnly,
} = require('../../middlewares/dept.middleware');
const adminDash = require('./admin.dashboard');
const salesDash = require('./sales.dashboard');
const financeDash = require('./finance.dashboard');
const dispatchDash = require('./dispatch.dashboard');
const accountDash = require('./account.dashboard');
const superDash = require('./super.dashboard');

router.use(requireAuth);

router.get(
  '/admin',
  requireDepartmentOnly('admin'),
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await adminDash.overview() });
  })
);

router.get(
  '/sales',
  requireDepartmentOnly('sales'),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await salesDash.forUser(req.user._id) });
  })
);

router.get(
  '/finance',
  requireDepartmentOnly('finance'),
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await financeDash.summary() });
  })
);

router.get(
  '/dispatch',
  requireDepartmentOnly('dispatch'),
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await dispatchDash.summary() });
  })
);

router.get(
  '/account',
  requireDepartmentOnly('account'),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await accountDash.summary(req.user._id) });
  })
);

router.get(
  '/super',
  requireDepartmentOnly('super_admin'),
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await superDash.overview() });
  })
);

module.exports = router;
