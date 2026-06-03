/**
 * @fileoverview Approvals: HTTP handlers (thin controllers).
 * @module modules/approvals/approval.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const approvalService = require('./approval.service');

exports.list = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await approvalService.list(req.query) });
});
