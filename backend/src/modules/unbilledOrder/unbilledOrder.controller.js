/**
 * @fileoverview Unbilled order HTTP handlers.
 * @module modules/unbilledOrder/unbilledOrder.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./unbilledOrder.service');
const validation = require('./unbilledOrder.validation');

exports.list = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.list(req.query) });
});

exports.get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.get(req.params.id) });
});

exports.getByOrder = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getByOrder(req.params.orderId) });
});

exports.create = asyncHandler(async (req, res) => {
  validation.assertCreate(req.body || {});
  res.status(201).json({
    success: true,
    data: await service.create(req.body, req.user),
  });
});

exports.patch = asyncHandler(async (req, res) => {
  validation.assertPatch(req.body || {});
  res.json({
    success: true,
    data: await service.patch(req.params.id, req.body, req.user),
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
