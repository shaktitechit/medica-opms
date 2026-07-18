/**
 * @fileoverview ProductSubgroups: request body guards.
 * @module modules/productSubgroups/productSubgroup.validation
 */
const { ApiError } = require('../../utils/ApiError');
const mongoose = require('mongoose');

function assertCreate(body) {
  if (!body || typeof body !== 'object') throw new ApiError(400, 'JSON body required');

  const name = body.name != null ? String(body.name).trim() : '';
  if (!name) throw new ApiError(400, 'name is required');

  if (!body.group) throw new ApiError(400, 'group (ProductGroup ID) is required');
  if (!mongoose.Types.ObjectId.isValid(body.group)) {
    throw new ApiError(400, 'Invalid group ID format');
  }
}

function assertUpdate(body) {
  if (!body || typeof body !== 'object') throw new ApiError(400, 'JSON body required');
  if (body.group && !mongoose.Types.ObjectId.isValid(body.group)) {
    throw new ApiError(400, 'Invalid group ID format');
  }
}

module.exports = { assertCreate, assertUpdate };
