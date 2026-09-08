/**
 * @fileoverview Lead Quotation Controller - Delegated wrapper around quotation.controller for backward compatibility.
 * @module modules/leads/leadQuotation.controller
 */
const quotationController = require('../quotations/quotation.controller');

module.exports = {
  create: quotationController.create,
  list: quotationController.list,
  getById: quotationController.getById,
  update: quotationController.update,
  getDefaultTerms: quotationController.getDefaultTerms,
  remove: quotationController.remove,
  submitForApproval: quotationController.submitForApproval,
  approve: quotationController.approve,
  reject: quotationController.reject,
};
