/**
 * @fileoverview Auth: HTTP handlers (thin controllers).
 * @module modules/auth/auth.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const authService = require('./auth.service');
const { ApiError } = require('../../utils/ApiError');
const validation = require('./auth.validation');

exports.login = asyncHandler(async (req, res) => {
  validation.assertLogin(req.body || {});
  const data = await authService.login(req.body.email, req.body.password);
  res.json({ success: true, data });
});

exports.me = asyncHandler(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'Unauthorized');
  res.json({ success: true, data: await authService.me(req.user._id) });
});
