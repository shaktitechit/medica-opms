/**
 * @fileoverview Products: HTTP handlers (thin controllers).
 * @module modules/products/product.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./product.service');
const validation = require('./product.validation');
const { ApiError } = require('../../utils/ApiError');

exports.list = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.list(req.query) });
});

exports.get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.get(req.params.id) });
});

exports.create = asyncHandler(async (req, res) => {
  validation.assertCreate(req.body || {});
  res.status(201).json({ success: true, data: await service.create(req.body, req.user) });
});

exports.update = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.update(req.params.id, req.body, req.user) });
});

exports.listDeleted = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await service.listDeleted() });
});

exports.softDelete = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.softDelete(req.params.id, req.user) });
});

exports.restore = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.restore(req.params.id, req.user) });
});

exports.bulkCreate = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await service.bulkCreate(req.body, req.user) });
});

exports.bulkDelete = asyncHandler(async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids)) {
    throw new ApiError(400, 'ids must be an array of strings');
  }
  res.json({ success: true, data: await service.bulkDelete(ids, req.user) });
});

exports.googleSheetWebhook = asyncHandler(async (req, res) => {
  const secret = req.query.secret || req.headers['x-webhook-secret'] || req.headers['x-api-key'];
  const expectedSecret = process.env.GOOGLE_SHEET_WEBHOOK_SECRET || 'medica-gsheet-sync-secret';

  if (!secret || secret !== expectedSecret) {
    throw new ApiError(401, 'Unauthorized: Invalid secret key');
  }

  const data = await service.syncFromGoogleSheet(req.body);
  res.json({ success: true, data });
});
