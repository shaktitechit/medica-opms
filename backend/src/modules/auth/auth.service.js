/**
 * @fileoverview Auth: business rules and mongoose persistence helpers.
 * @module modules/auth/auth.service
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ApiError } = require('../../utils/ApiError');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../../config/env');
const { sanitizeUser } = require('../../utils/sanitize');
const { loadUserForJwtSub, authenticate } = require('./mongoUserBridge');

function registerToken(userId) {
  return jwt.sign({ sub: String(userId) }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

async function login(email, password) {
  const user = await authenticate(email, password);
  if (!user) throw new ApiError(401, 'Invalid credentials');

  const token = registerToken(user._id);
  return { token, user };
}

async function me(userId) {
  const u = await loadUserForJwtSub(userId);
  if (!u) throw new ApiError(401, 'Unauthorized');
  return sanitizeUser(u);
}

function userHasAnyPermission(user, codes) {
  if (!user.permissionCodes) return false;
  const set = new Set(user.permissionCodes);
  if (set.has('*')) return true;
  return codes.some((c) => set.has(c));
}

module.exports = {
  login,
  me,
  registerToken,
  userHasAnyPermission,
};
