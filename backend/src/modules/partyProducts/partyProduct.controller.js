/**
 * @fileoverview Party Products: HTTP controllers.
 * @module modules/partyProducts/partyProduct.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./partyProduct.service');
const validation = require('./partyProduct.validation');

exports.list = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await service.list() });
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

// --- Rates ---

exports.addRate = asyncHandler(async (req, res) => {
  // Validate request for new rate mapping
  const payload = {
    ...req.body,
    mapping: req.params.id,
  };
  validation.assertCreateRate(payload);

  res.status(201).json({ success: true, data: await service.addRate(req.params.id, req.body, req.user) });
});

exports.updateRate = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.updateRate(req.params.rateId, req.body, req.user) });
});

exports.approveRate = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.approveRate(req.params.rateId, req.user) });
});

exports.deleteRate = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.deleteRate(req.params.rateId, req.user) });
});
