/**
 * @fileoverview Unified Order approval HTTP handlers.
 * @module modules/orderApproval/orderApproval.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./orderApproval.service');

exports.list = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.list(req.query) });
});

exports.get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.get(req.params.id) });
});

exports.create = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await service.create(req.body, req.user) });
});

exports.patch = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.patch(req.params.id, req.body, req.user) });
});

exports.superSheetUpdate = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: await service.superSheetUpdate(req.params.id, req.body || {}, req.user),
  });
});

exports.approve = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.approve(req.params.id, req.body, req.user) });
});

exports.reject = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.reject(req.params.id, req.body, req.user) });
});

exports.sendToFinance = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.sendToFinance(req.params.id, req.body, req.user) });
});

exports.sendToAccount = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.sendToAccount(req.params.id, req.body, req.user) });
});

exports.amendByFinance = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.amendByFinance(req.params.id, req.body, req.user) });
});

exports.amend = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.amend(req.params.id, req.body, req.user) });
});

exports.resolvePartialDispatch = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: await service.resolvePartialDispatchByAccount(req.params.id, req.body, req.user),
  });
});

exports.listDeleted = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.listDeleted(req.query) });
});

exports.softDelete = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.softDelete(req.params.id, req.user) });
});

exports.restore = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.restore(req.params.id, req.user) });
});
