/**
 * @fileoverview Utilities (buildQuery).
 * @module utils/buildQuery
 */
function buildQuery(query, allowedFields = []) {
  const out = {};
  for (const key of allowedFields) {
    if (query[key] !== undefined && query[key] !== '') {
      out[key] = query[key];
    }
  }
  return out;
}

module.exports = { buildQuery };
