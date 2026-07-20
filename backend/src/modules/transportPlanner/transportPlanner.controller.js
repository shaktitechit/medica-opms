/**
 * @fileoverview Transport Planner: HTTP handlers (thin controllers).
 * @module modules/transportPlanner/transportPlanner.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./transportPlanner.service');
const validation = require('./transportPlanner.validation');

exports.list = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.list(req.query, req.user) });
});

exports.stats = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.stats(req.query, req.user) });
});

exports.eligibleOrders = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.listEligibleOrders(req.query, req.user) });
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

exports.complete = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.complete(req.params.id, req.user) });
});

exports.cancel = asyncHandler(async (req, res) => {
  validation.assertCancel(req.body || {});
  res.json({ success: true, data: await service.cancel(req.params.id, req.body, req.user) });
});

exports.addOrders = asyncHandler(async (req, res) => {
  validation.assertAddOrders(req.body || {});
  res.status(201).json({
    success: true,
    data: await service.addOrders(req.params.id, req.body, req.user),
  });
});

exports.removeOrder = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: await service.removeOrder(req.params.id, req.params.planOrderId, req.user),
  });
});

exports.cancelPlanOrder = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: await service.cancelPlanOrder(req.params.id, req.params.planOrderId, req.user),
  });
});

exports.updateDispatchDetails = asyncHandler(async (req, res) => {
  validation.assertDispatchDetails(req.body || {});
  res.json({
    success: true,
    data: await service.updateDispatchDetails(
      req.params.id,
      req.params.planOrderId,
      req.body,
      req.user
    ),
  });
});

exports.generateLr = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: await service.generateLr(req.params.id, req.params.planOrderId, req.user),
  });
});

exports.markPacked = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: await service.markPacked(req.params.id, req.params.planOrderId, req.user),
  });
});

exports.markDispatched = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: await service.markDispatched(req.params.id, req.params.planOrderId, req.user),
  });
});

exports.markDelivered = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: await service.markDelivered(req.params.id, req.params.planOrderId, req.user),
  });
});
