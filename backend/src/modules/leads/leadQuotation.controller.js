/**
 * @fileoverview Lead Quotation Controller.
 * @module modules/leads/leadQuotation.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const leadQuotationService = require('./leadQuotation.service');

exports.create = asyncHandler(async (req, res) => {
  const data = await leadQuotationService.create(req.params.id, req.body, req.user);
  res.status(201).json({
    success: true,
    message: 'Quotation created successfully',
    data,
  });
});

exports.list = asyncHandler(async (req, res) => {
  const data = await leadQuotationService.list(req.params.id, req.user);
  res.json({
    success: true,
    data,
  });
});

exports.getById = asyncHandler(async (req, res) => {
  const data = await leadQuotationService.getById(req.params.quotationId, req.user);
  res.json({
    success: true,
    data,
  });
});

exports.update = asyncHandler(async (req, res) => {
  const data = await leadQuotationService.update(req.params.quotationId, req.body, req.user);
  res.json({
    success: true,
    message: 'Quotation updated successfully',
    data,
  });
});

exports.getDefaultTerms = asyncHandler(async (req, res) => {
  const data = await leadQuotationService.getDefaultTerms();
  res.json({
    success: true,
    data,
  });
});

exports.remove = asyncHandler(async (req, res) => {
  const data = await leadQuotationService.remove(req.params.quotationId, req.user);
  res.json({
    success: true,
    message: 'Quotation deleted successfully',
    data,
  });
});
