/**
 * @fileoverview Parties HTTP handlers.
 * @module modules/parties/party.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./party.service');
const validation = require('./party.validation');
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

