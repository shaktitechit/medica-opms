/**
 * @fileoverview ProductKitItem: HTTP handlers (thin controllers).
 * @module modules/productKitItems/productKitItem.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./productKitItem.service');
const validation = require('./productKitItem.validation');

exports.list = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.list(req.query) });
});

exports.listDeleted = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await service.listDeleted() });
});

exports.get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.get(req.params.id) });
});

exports.getByKit = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getByKit(req.params.kitId) });
});

exports.create = asyncHandler(async (req, res) => {
  validation.assertCreate(req.body || {});
  res.status(201).json({ success: true, data: await service.create(req.body, req.user) });
});

exports.upsertByKit = asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (body.items !== undefined) {
    validation.assertItemsArray(body.items, { allowEmpty: true });
  }
  res.json({
    success: true,
    data: await service.upsertByKit(req.params.kitId, body, req.user),
  });
});

exports.update = asyncHandler(async (req, res) => {
  validation.assertUpdate(req.body || {});
  res.json({ success: true, data: await service.update(req.params.id, req.body, req.user) });
});

exports.addItem = asyncHandler(async (req, res) => {
  validation.assertAddItem(req.body || {});
  res.status(201).json({
    success: true,
    data: await service.addItem(req.params.id, req.body, req.user),
  });
});

exports.updateItem = asyncHandler(async (req, res) => {
  validation.assertUpdateItem(req.body || {});
  res.json({
    success: true,
    data: await service.updateItem(req.params.id, req.params.itemId, req.body, req.user),
  });
});

exports.removeItem = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: await service.removeItem(req.params.id, req.params.itemId, req.user),
  });
});

exports.softDelete = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.softDelete(req.params.id, req.user) });
});

exports.restore = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.restore(req.params.id, req.user) });
});
