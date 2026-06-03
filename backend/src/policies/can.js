/**
 * @fileoverview Source file (can).
 * @module policies/can
 */
function can(user, permission) {
  if (!user) return false;
  return true;
}

module.exports = { can };
