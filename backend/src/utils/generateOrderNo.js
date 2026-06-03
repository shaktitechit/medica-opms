/**
 * @fileoverview Utilities (generateOrderNo).
 * @module utils/generateOrderNo
 */
function generateOrderNo() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ORD-${ts}-${rand}`;
}

module.exports = { generateOrderNo };
