/**
 * @fileoverview HTTP Controller for Company Info
 * @module modules/companyInfo/companyInfo.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./companyInfo.service');
const validation = require('./companyInfo.validation');

exports.get = asyncHandler(async (_req, res) => {
  const data = await service.getCompanyInfo();
  res.json({ success: true, data });
});

exports.getData = asyncHandler(async (_req, res) => {
  const data = await service.getCompanyAggregatedData();
  res.json({ success: true, data });
});

exports.update = asyncHandler(async (req, res) => {
  validation.assertUpdate(req.body || {});
  const data = await service.updateCompanyInfo(req.body || {}, req.user);
  res.json({ success: true, data });
});

