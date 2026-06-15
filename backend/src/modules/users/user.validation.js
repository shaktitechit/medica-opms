/**
 * @fileoverview Users: request body/query validation guards.
 * @module modules/users/user.validation
 */
const { ApiError } = require('../../utils/ApiError');

const USER_DEPARTMENTS = ['super_admin', 'admin', 'sales', 'finance', 'account', 'dispatch'];
const PATCH_KEYS = ['name', 'email', 'phone', 'password', 'department', 'roles', 'is_active'];

function assertCreate(body) {
  if (!body || typeof body !== 'object') throw new ApiError(400, 'JSON body required');
  if (!body.name || !body.email || !body.password || !body.department) {
    throw new ApiError(400, 'name, email, password, and department are required');
  }
  if (!USER_DEPARTMENTS.includes(body.department)) {
    throw new ApiError(400, `department must be one of: ${USER_DEPARTMENTS.join(', ')}`);
  }
  if (body.roles !== undefined && !Array.isArray(body.roles)) {
    throw new ApiError(400, 'roles must be an array');
  }
}

function assertPatch(body) {
  if (!body || typeof body !== 'object') throw new ApiError(400, 'JSON body required');
  const touched = PATCH_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(body, k));
  if (touched.length === 0) {
    throw new ApiError(
      400,
      `Provide at least one of: ${PATCH_KEYS.join(', ')}`
    );
  }
  if (body.department !== undefined && !USER_DEPARTMENTS.includes(body.department)) {
    throw new ApiError(400, `department must be one of: ${USER_DEPARTMENTS.join(', ')}`);
  }
  if (body.roles !== undefined && !Array.isArray(body.roles)) {
    throw new ApiError(400, 'roles must be an array');
  }
}

module.exports = { assertCreate, assertPatch };
