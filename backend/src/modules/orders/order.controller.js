/**
 * @fileoverview Orders: HTTP handlers (thin controllers).
 * @module modules/orders/order.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./order.service');
const approvalService = require('../approvals/approval.service');
const { ApiError } = require('../../utils/ApiError');
const validation = require('./order.validation');

exports.list = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.list(req.query, req.user) });
});

exports.get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getById(req.params.id, req.user) });
});

exports.create = asyncHandler(async (req, res) => {
  if (!['sales', 'admin'].includes(req.user.department)) {
    throw new ApiError(403, 'Only sales (or admin) can create orders');
  }
  res.status(201).json({ success: true, data: await service.create(req.body, req.user) });
});

exports.update = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.update(req.params.id, req.body, req.user) });
});

exports.closeWithReturns = asyncHandler(async (req, res) => {
  if (!['account', 'admin', 'super_admin'].includes(req.user.department)) {
    throw new ApiError(403, 'Only account can close orders after returns');
  }
  res.json({
    success: true,
    data: await service.closeWithReturns(req.params.id, req.body || {}, req.user),
  });
});

exports.settleAndCloseOrder = asyncHandler(async (req, res) => {
  if (!['account', 'admin', 'super_admin'].includes(req.user.department)) {
    throw new ApiError(403, 'Only account can settle and close orders after returns');
  }
  res.json({
    success: true,
    data: await service.settleAndCloseOrder(req.params.id, req.body || {}, req.user),
  });
});

exports.closeAfterFullDelivery = asyncHandler(async (req, res) => {
  if (!['dispatch', 'account', 'admin', 'super_admin'].includes(req.user.department)) {
    throw new ApiError(403, 'Not authorized to close order after delivery');
  }
  res.json({
    success: true,
    data: await service.closeAfterFullDelivery(req.params.id, req.body || {}, req.user),
  });
});

exports.transition = asyncHandler(async (req, res) => {
  validation.assertTransition(req.body || {});
  const { remarks, rejection_reason } = req.body || {};
  const meta = {
    ip: req.ip,
    ua: req.get('User-Agent'),
  };
  const data = await service.transition(
    req.params.id,
    { next_status: req.body.next_status, remarks, rejection_reason },
    req.user,
    meta
  );
  res.json({ success: true, data });
});

exports.history = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.history(req.params.id, req.user) });
});

exports.fulfillment = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.fulfillment(req.params.id, req.user) });
});

exports.approvals = asyncHandler(async (req, res) => {
  await service.getById(req.params.id, req.user);
  res.json({ success: true, data: await approvalService.listByOrder(req.params.id) });
});

exports.assignees = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.assignees(req.params.id, req.user) });
});

exports.listDeleted = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.listDeleted(req.query, req.user) });
});

exports.softDelete = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.softDelete(req.params.id, req.user) });
});

exports.restore = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.restore(req.params.id, req.user) });
});
