/**
 * @fileoverview Lead Masters HTTP handlers (sources and lost reasons).
 * @module modules/leads/leadMaster.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const masterService = require('./leadMaster.service');

exports.listSources = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await masterService.listSources() });
});

exports.createSource = asyncHandler(async (req, res) => {
  res.status(201).json({
    success: true,
    data: await masterService.createSource(req.body || {}, req.user),
  });
});

exports.updateSource = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: await masterService.updateSource(req.params.id, req.body || {}, req.user),
  });
});

exports.deleteSource = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: await masterService.deleteSource(req.params.id, req.user),
  });
});

exports.listLostReasons = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await masterService.listLostReasons() });
});

exports.createLostReason = asyncHandler(async (req, res) => {
  res.status(201).json({
    success: true,
    data: await masterService.createLostReason(req.body || {}, req.user),
  });
});

exports.updateLostReason = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: await masterService.updateLostReason(req.params.id, req.body || {}, req.user),
  });
});

exports.deleteLostReason = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: await masterService.deleteLostReason(req.params.id, req.user),
  });
});
