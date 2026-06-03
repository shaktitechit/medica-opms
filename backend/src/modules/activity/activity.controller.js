/**
 * @fileoverview Activity: HTTP handlers (thin controllers).
 * @module modules/activity/activity.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./activity.service');

exports.list = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.list(req.query) });
});
