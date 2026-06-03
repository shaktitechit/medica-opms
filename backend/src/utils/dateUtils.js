/**
 * @fileoverview Utilities (dateUtils).
 * @module utils/dateUtils
 */
function toISO(d) {
  if (!d) return null;
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? null : x.toISOString();
}

module.exports = { toISO };
