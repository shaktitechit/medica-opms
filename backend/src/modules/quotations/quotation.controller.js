/**
 * @fileoverview Quotation Controller.
 * @module modules/quotations/quotation.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const quotationService = require('./quotation.service');
const validation = require('./quotation.validation');

exports.create = asyncHandler(async (req, res) => {
  validation.assertCreate(req.body);
  const data = await quotationService.create(req.params.id || req.body.lead, req.body, req.user);
  res.status(201).json({
    success: true,
    message: 'Quotation created successfully',
    data,
  });
});

exports.list = asyncHandler(async (req, res) => {
  if (req.params.id) {
    const data = await quotationService.listByLead(req.params.id, req.user);
    return res.json({
      success: true,
      data,
    });
  }

  const result = await quotationService.listAll(req.query, req.user);
  res.json({
    success: true,
    data: result.quotations,
    pagination: result.pagination,
  });
});

exports.getById = asyncHandler(async (req, res) => {
  const quotationId = req.params.quotationId || req.params.id;
  const data = await quotationService.getById(quotationId, req.user);
  res.json({
    success: true,
    data,
  });
});

exports.update = asyncHandler(async (req, res) => {
  const quotationId = req.params.quotationId || req.params.id;
  validation.assertUpdate(req.body);
  const data = await quotationService.update(quotationId, req.body, req.user);
  res.json({
    success: true,
    message: 'Quotation updated successfully',
    data,
  });
});

exports.getDefaultTerms = asyncHandler(async (req, res) => {
  const data = await quotationService.getDefaultTerms();
  res.json({
    success: true,
    data,
  });
});

exports.remove = asyncHandler(async (req, res) => {
  const quotationId = req.params.quotationId || req.params.id;
  const data = await quotationService.remove(quotationId, req.user);
  res.json({
    success: true,
    message: 'Quotation deleted successfully',
    data,
  });
});

exports.submitForApproval = asyncHandler(async (req, res) => {
  const quotationId = req.params.quotationId || req.params.id;
  const data = await quotationService.submitForApproval(quotationId, req.user);
  res.json({
    success: true,
    message: 'Quotation submitted for approval',
    data,
  });
});

exports.approve = asyncHandler(async (req, res) => {
  const quotationId = req.params.quotationId || req.params.id;
  const data = await quotationService.approve(quotationId, req.user);
  res.json({
    success: true,
    message: 'Quotation approved successfully',
    data,
  });
});

exports.reject = asyncHandler(async (req, res) => {
  const quotationId = req.params.quotationId || req.params.id;
  const data = await quotationService.reject(quotationId, req.body.reason, req.user);
  res.json({
    success: true,
    message: 'Quotation rejected',
    data,
  });
});
