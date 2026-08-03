/**
 * @fileoverview ZoneParties: HTTP handlers (thin controllers).
 * @module modules/zoneParties/zoneParties.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./zoneParties.service');
const validation = require('./zoneParties.validation');

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
  validation.assertUpdate(req.body || {});
  res.json({ success: true, data: await service.update(req.params.id, req.body, req.user) });
});

exports.softDelete = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.softDelete(req.params.id, req.user) });
});

exports.getParties = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getParties(req.params.id) });
});

exports.associateParties = asyncHandler(async (req, res) => {
  const { partyIds } = req.body || {};
  res.json({ success: true, data: await service.associateParties(req.params.id, partyIds, req.user) });
});

exports.getSalesPersons = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getSalesPersons(req.params.id) });
});

exports.associateSalesPersons = asyncHandler(async (req, res) => {
  const { salesPersonIds } = req.body || {};
  res.json({ success: true, data: await service.associateSalesPersons(req.params.id, salesPersonIds, req.user) });
});
