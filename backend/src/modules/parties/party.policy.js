/**
 * @fileoverview Party write access — admin/finance departments or parties:manage permission.
 * @module modules/parties/party.policy
 */
const { ApiError } = require('../../utils/ApiError');

const PARTIES_WRITE_DEPARTMENTS = new Set(['admin', 'finance', 'super_admin']);

function requirePartiesManage(req, res, next) {
  if (!req.user) return next(new ApiError(401, 'Authentication required'));

  const dept = String(req.user.department || '').toLowerCase();
  if (PARTIES_WRITE_DEPARTMENTS.has(dept)) return next();

  const codes = new Set(req.user.permissionCodes || []);
  if (codes.has('*') || codes.has('parties:manage')) return next();

  return next(new ApiError(403, 'Missing permission to manage parties'));
}

module.exports = { requirePartiesManage, PARTIES_WRITE_DEPARTMENTS };
