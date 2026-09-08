/**
 * @fileoverview Quotation validation guards.
 * @module modules/quotations/quotation.validation
 */
const mongoose = require('mongoose');
const { ApiError } = require('../../utils/ApiError');
const { QUOTATION_STATUSES } = require('./quotation.constants');

function assertObjectId(value, fieldName = 'id') {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) {
    throw new ApiError(400, `Invalid ${fieldName} format`);
  }
}

function assertCreate(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'Request body is required');
  }
  if (body.lead) {
    assertObjectId(body.lead, 'lead');
  }
  if (body.status && !QUOTATION_STATUSES.includes(body.status)) {
    throw new ApiError(400, `Invalid status. Must be one of: ${QUOTATION_STATUSES.join(', ')}`);
  }
  if (body.items && !Array.isArray(body.items)) {
    throw new ApiError(400, 'Items must be an array');
  }
}

function assertUpdate(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'Request body is required');
  }
  if (body.status && !QUOTATION_STATUSES.includes(body.status)) {
    throw new ApiError(400, `Invalid status. Must be one of: ${QUOTATION_STATUSES.join(', ')}`);
  }
  if (body.items && !Array.isArray(body.items)) {
    throw new ApiError(400, 'Items must be an array');
  }
}

module.exports = {
  assertObjectId,
  assertCreate,
  assertUpdate,
};
