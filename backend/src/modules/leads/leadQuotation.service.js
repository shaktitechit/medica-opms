/**
 * @fileoverview Lead Quotation Service - Delegated wrapper around quotation.service for backward compatibility.
 * @module modules/leads/leadQuotation.service
 */
const quotationService = require('../quotations/quotation.service');

module.exports = {
  create: quotationService.create,
  list: quotationService.listByLead,
  getById: quotationService.getById,
  update: quotationService.update,
  remove: quotationService.remove,
  submitForApproval: quotationService.submitForApproval,
  approve: quotationService.approve,
  reject: quotationService.reject,
  getDefaultTerms: quotationService.getDefaultTerms,
  generateQuotationNo: quotationService.generateQuotationNo,
  numberToIndianWords: quotationService.numberToIndianWords,
  getDefaultTermsAndConditions: quotationService.getDefaultTermsAndConditions,
};
