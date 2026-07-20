/**
 * @fileoverview Work Planner: HTTP handlers (thin controllers).
 * @module modules/workPlanner/workPlanner.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./workPlanner.service');
const validation = require('./workPlanner.validation');

exports.list = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.list(req.query, req.user) });
});

exports.stats = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.stats(req.query, req.user) });
});

exports.get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.get(req.params.id, req.user) });
});

exports.create = asyncHandler(async (req, res) => {
  validation.assertCreate(req.body || {});
  res.status(201).json({ success: true, data: await service.create(req.body, req.user) });
});

exports.update = asyncHandler(async (req, res) => {
  validation.assertUpdate(req.body || {});
  res.json({ success: true, data: await service.update(req.params.id, req.body, req.user) });
});

exports.remove = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.remove(req.params.id, req.user) });
});

exports.submit = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.submit(req.params.id, req.user) });
});

exports.approve = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.approve(req.params.id, req.user) });
});

exports.reject = asyncHandler(async (req, res) => {
  validation.assertReject(req.body || {});
  res.json({ success: true, data: await service.reject(req.params.id, req.body, req.user) });
});

exports.addVisit = asyncHandler(async (req, res) => {
  validation.assertVisitCreate(req.body || {});
  res.status(201).json({
    success: true,
    data: await service.addVisit(req.params.id, req.body, req.user),
  });
});

exports.updateVisit = asyncHandler(async (req, res) => {
  validation.assertVisitUpdate(req.body || {});
  res.json({
    success: true,
    data: await service.updateVisit(req.params.id, req.params.visitId, req.body, req.user),
  });
});

exports.removeVisit = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: await service.removeVisit(req.params.id, req.params.visitId, req.user),
  });
});

exports.checkIn = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: await service.checkIn(req.params.id, req.params.visitId, req.user),
  });
});

exports.checkOut = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: await service.checkOut(req.params.id, req.params.visitId, req.user),
  });
});

exports.completeVisit = asyncHandler(async (req, res) => {
  validation.assertCompleteVisit(req.body || {});
  res.json({
    success: true,
    data: await service.completeVisit(req.params.id, req.params.visitId, req.body, req.user),
  });
});
