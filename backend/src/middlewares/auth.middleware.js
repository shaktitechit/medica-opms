/**
 * @fileoverview Express middleware (auth.middleware).
 * @module middlewares/auth.middleware
 */
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const { ApiError } = require('../utils/ApiError');
const { loadUserForJwtSub } = require('../modules/auth/mongoUserBridge');

/** Sets `req.user` when Bearer token is valid (User + roles → permissionCodes via Mongoose). */
async function authMiddleware(req, res, next) {
  req.user = null;

  // Primary: Authorization: Bearer <token> header
  // Fallback: ?token= query param (needed for SSE EventSource which cannot set headers)
  let rawToken = null;
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) {
    rawToken = h.slice(7);
  } else if (typeof req.query?.token === 'string' && req.query.token.trim()) {
    rawToken = req.query.token.trim();
  }

  if (!rawToken) return next();

  try {
    const payload = jwt.verify(rawToken, JWT_SECRET);
    req.user = await loadUserForJwtSub(payload.sub);
    return next();
  } catch (_e) {
    return next();
  }
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return next(
      new ApiError(401, 'Authentication required', {
        hint: 'POST /api/auth/login with { "email","password" }, then send header Authorization: Bearer <token>',
      })
    );
  }
  next();
}

function requirePermissions(...requiredOneOf) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));
    const set = new Set(req.user.permissionCodes || []);
    if (set.has('*')) return next();
    if (requiredOneOf.length === 0) return next();
    if (requiredOneOf.some((c) => set.has(c))) return next();
    return next(new ApiError(403, 'Missing permission'));
  };
}

/**
 * Soft-delete / restore: allows **either** wildcard `*` **or** `records:delete` (not both required).
 */
function requireSoftDeletePermission(req, res, next) {
  if (!req.user) return next(new ApiError(401, 'Authentication required'));
  const set = new Set(req.user.permissionCodes || []);
  if (set.has('*') || set.has('records:delete')) return next();
  return next(new ApiError(403, 'This action requires wildcard (*) or records:delete permission'));
}

module.exports = {
  authMiddleware,
  requireAuth,
  requirePermissions,
  requireSoftDeletePermission,
};
