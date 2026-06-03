/**
 * @fileoverview Auth: request body/query validation guards.
 * @module modules/auth/auth.validation
 */
const { ApiError } = require('../../utils/ApiError');

function assertLogin(body) {
  if (!body || typeof body !== 'object') throw new ApiError(400, 'JSON body required');
  if (!body.email || typeof body.email !== 'string') throw new ApiError(400, 'email is required');
  if (!body.password || typeof body.password !== 'string') throw new ApiError(400, 'password is required');
}

module.exports = { assertLogin };
