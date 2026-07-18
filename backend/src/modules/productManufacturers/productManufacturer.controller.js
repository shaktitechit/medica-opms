/**
 * @fileoverview ProductManufacturers: HTTP handlers (thin controllers).
 * @module modules/productManufacturers/productManufacturer.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./productManufacturer.service');
const validation = require('./productManufacturer.validation');

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

exports.update = asyncHandler(async (req, res) => {
  validation.assertUpdate(req.body || {});
  res.json({ success: true, data: await service.update(req.params.id, req.body, req.user) });
});

exports.softDelete = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.softDelete(req.params.id, req.user) });
});

exports.bulkCreate = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await service.bulkCreate(req.body, req.user) });
});

exports.bulkDelete = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.bulkDelete(req.body, req.user) });
});

exports.getProducts = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getProducts(req.params.id) });
});

exports.associateProducts = asyncHandler(async (req, res) => {
  const { productIds } = req.body || {};
  res.json({ success: true, data: await service.associateProducts(req.params.id, productIds, req.user) });
});
