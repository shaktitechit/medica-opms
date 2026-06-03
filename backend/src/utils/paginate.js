/**
 * @fileoverview Utilities (paginate).
 * @module utils/paginate
 */
function paginate({ page = 1, limit = 20 }) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (p - 1) * l;
  return { page: p, limit: l, offset };
}

module.exports = { paginate };
