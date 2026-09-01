/**
 * @fileoverview Validation for Company Info operations
 * @module modules/companyInfo/companyInfo.validation
 */
const { ApiError } = require('../../utils/ApiError');

/**
 * Asserts patch data validity for Company Info
 * @param {Record<string, unknown>} body 
 */
function assertUpdate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'Invalid request body: object expected');
  }

  if (body.email !== undefined && body.email !== null) {
    const emailStr = String(body.email).trim();
    if (emailStr && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
      throw new ApiError(400, 'Invalid corporate support email format');
    }
  }

  if (body.billing_email !== undefined && body.billing_email !== null) {
    const billingEmailStr = String(body.billing_email).trim();
    if (billingEmailStr && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmailStr)) {
      throw new ApiError(400, 'Invalid billing email format');
    }
  }

  if (body.gstin !== undefined && body.gstin !== null) {
    const gstinStr = String(body.gstin).trim();
    if (gstinStr && gstinStr.length > 20) {
      throw new ApiError(400, 'GSTIN cannot exceed 20 characters');
    }
  }
}

module.exports = {
  assertUpdate,
};
