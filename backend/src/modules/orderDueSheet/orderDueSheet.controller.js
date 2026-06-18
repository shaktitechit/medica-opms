/**
 * @fileoverview Order due sheet HTTP handlers.
 * @module modules/orderDueSheet/orderDueSheet.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./orderDueSheet.service');

exports.list = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.list(req.query) });
});

exports.get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.get(req.params.id) });
});

exports.getCurrentByOrder = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: await service.getCurrentByOrder(req.params.orderId),
  });
});

exports.create = asyncHandler(async (req, res) => {
  res.status(201).json({
    success: true,
    data: await service.create(req.body, req.user, { file: req.file }),
  });
});

exports.patch = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.patch(req.params.id, req.body, req.user) });
});

exports.replaceDocument = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: await service.replaceDocument(req.params.id, req.file, req.user, req.body),
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
