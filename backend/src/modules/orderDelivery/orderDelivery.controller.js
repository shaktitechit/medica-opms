/**
 * @fileoverview Order delivery HTTP handlers.
 * @module modules/orderDelivery/orderDelivery.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./orderDelivery.service');

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

exports.listDeleted = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.listDeleted(req.query) });
});

exports.softDelete = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.softDelete(req.params.id, req.user) });
});

exports.restore = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.restore(req.params.id, req.user) });
});
