/**
 * @fileoverview Reminders: HTTP handlers (thin controllers).
 * @module modules/reminders/reminder.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./reminder.service');
const validation = require('./reminder.validation');
const { ApiError } = require('../../utils/ApiError');

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

exports.addFollowUp = asyncHandler(async (req, res) => {
  validation.assertAddFollowUp(req.body || {});
  res.json({ success: true, data: await service.addFollowUp(req.params.id, req.body, req.user) });
});

exports.patch = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.patch(req.params.id, req.body, req.user) });
});

exports.remove = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.remove(req.params.id, req.user) });
});

exports.googleSheetWebhook = asyncHandler(async (req, res) => {
  const secret = req.query.secret || req.headers['x-webhook-secret'] || req.headers['x-api-key'];
  const expectedSecret = process.env.GOOGLE_SHEET_WEBHOOK_SECRET || 'medica-gsheet-sync-secret';

  if (!secret || secret !== expectedSecret) {
    throw new ApiError(401, 'Unauthorized: Invalid secret key');
  }

  const data = await service.syncFromGoogleSheet(req.body);
  res.json({ success: true, data });
});
