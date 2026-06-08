/**
 * @fileoverview Users: HTTP handlers (thin controllers).
 * @module modules/users/user.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./user.service');
const validation = require('./user.validation');
const { ApiError } = require('../../utils/ApiError');

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
  const isSelf = req.user && req.params.id === req.user._id.toString();
  const set = new Set(req.user?.permissionCodes || []);
  const isAdmin = set.has('*') || set.has('users:manage');

  if (!isSelf && !isAdmin) {
    throw new ApiError(403, 'Missing permission');
  }

  let patchData = req.body || {};
  if (isSelf && !isAdmin) {
    const allowed = {};
    if (patchData.name !== undefined) allowed.name = patchData.name;
    if (patchData.phone !== undefined) allowed.phone = patchData.phone;
    if (patchData.password !== undefined && String(patchData.password).length > 0) {
      allowed.password = patchData.password;
    }
    patchData = allowed;
  }

  validation.assertPatch(patchData);
  const row = await service.update(req.params.id, patchData, req.user);
  res.json({ success: true, data: row });
});
