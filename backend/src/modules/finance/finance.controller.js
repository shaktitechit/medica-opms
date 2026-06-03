/**
 * @fileoverview Finance: HTTP handlers (thin controllers).
 * @module modules/finance/finance.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./finance.service');

exports.queue = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await service.financeQueue() });
});

exports.summary = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await service.summary() });
});
