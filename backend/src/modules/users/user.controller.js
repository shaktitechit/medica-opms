/**
 * @fileoverview Users: HTTP handlers (thin controllers).
 * @module modules/users/user.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./user.service');
const validation = require('./user.validation');

exports.list = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.list(req.query) });
});

exports.roles = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await service.listRoles() });
});

exports.permissions = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await service.listPermissions() });
});

exports.get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.get(req.params.id) });
});

exports.create = asyncHandler(async (req, res) => {
  validation.assertCreate(req.body || {});
  const row = await service.create(req.body, req.user);
  res.status(201).json({ success: true, data: row });
});

exports.patch = asyncHandler(async (req, res) => {
  validation.assertPatch(req.body || {});
  const row = await service.update(req.params.id, req.body, req.user);
  res.json({ success: true, data: row });
});
