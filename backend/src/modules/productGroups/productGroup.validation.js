/**
 * @fileoverview ProductGroups: request body guards.
 * @module modules/productGroups/productGroup.validation
 */
const { ApiError } = require('../../utils/ApiError');

function assertCreate(body) {
  if (!body || typeof body !== 'object') throw new ApiError(400, 'JSON body required');

  const name = body.name != null ? String(body.name).trim() : '';
  if (!name) throw new ApiError(400, 'name is required');
}

function assertUpdate(body) {
  if (!body || typeof body !== 'object') throw new ApiError(400, 'JSON body required');
}

module.exports = { assertCreate, assertUpdate };
