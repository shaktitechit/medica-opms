/**
 * @fileoverview Shared constants (permissions).
 * @module constants/permissions
 */
/**
 * Permission codes seeded in MongoDB (`mongoSyncUsers`, `seedMongo`) — use for checks and documentation.
 * Admin role receives `*` (full access).
 */
const PERMISSION_CODES = Object.freeze([
  '*',
  'records:delete',
  'users:manage',
  'parties:manage',
  'products:manage',
  'orders:read',
  'orders:write',
  'finance:suite',
  'dispatch:suite',
  'transport:suite',
  'flags:suite',
  'dashboard:view',
]);

module.exports = { PERMISSION_CODES };
