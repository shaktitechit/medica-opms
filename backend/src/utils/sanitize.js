/**
 * @fileoverview Utilities (sanitize).
 * @module utils/sanitize
 */
function omit(obj, keys) {
  const out = { ...obj };
  for (const k of keys) delete out[k];
  return out;
}

function sanitizeUser(user) {
  if (!user) return null;
  return omit(user, ['password']);
}

module.exports = { omit, sanitizeUser };
