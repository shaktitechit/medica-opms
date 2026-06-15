/**
 * @fileoverview Final order statement HTTP handlers.
 * @module modules/finalOrderStatement/finalOrderStatement.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./finalOrderStatement.service');

exports.list = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.list(req.query) });
});

exports.getByOrder = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getByOrderId(req.params.orderId) });
});
