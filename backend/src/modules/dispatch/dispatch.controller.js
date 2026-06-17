/**
 * @fileoverview Order dispatch: HTTP handlers.
 * @module modules/dispatch/dispatch.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const { ApiError } = require('../../utils/ApiError');
const service = require('./dispatch.service');

function parseJsonField(value, fieldName) {
  if (value == null || value === '') return undefined;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new ApiError(400, `${fieldName} must be valid JSON`);
  }
}

function parseCreateBody(req) {
  const body = { ...req.body };
  const parsedItems = parseJsonField(body.items, 'items');
  const parsedDispatchItems = parseJsonField(body.dispatch_items, 'dispatch_items');
  if (parsedItems !== undefined) body.items = parsedItems;
  if (parsedDispatchItems !== undefined) body.dispatch_items = parsedDispatchItems;
  return { body, file: req.file || null };
}

exports.list = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.list(req.query) });
});

exports.get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.get(req.params.id) });
});

exports.create = asyncHandler(async (req, res) => {
  const { body, file } = parseCreateBody(req);
  res.status(201).json({
    success: true,
    data: await service.create(body, req.user, { file }),
  });
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
