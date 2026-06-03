/**
 * @fileoverview Flags: request body/query validation guards.
 * @module modules/flags/flag.validation
 */
const { ApiError } = require('../../utils/ApiError');
const flagPolicy = require('./flag.policy');

function assertCreate(body) {
  if (!body || typeof body !== 'object') throw new ApiError(400, 'JSON body required');
  if (!body.order) throw new ApiError(400, 'order is required');
  if (!body.flag_type || !flagPolicy.isValidFlagType(body.flag_type)) {
    throw new ApiError(400, 'flag_type must be one of the documented flag types');
  }
  if (!body.title) throw new ApiError(400, 'title is required');
}

module.exports = { assertCreate };
