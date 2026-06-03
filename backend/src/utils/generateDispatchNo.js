/**
 * @fileoverview Utilities (generateDispatchNo).
 * @module utils/generateDispatchNo
 */
function generateDispatchNo() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DSP-${ts}-${rand}`;
}

module.exports = { generateDispatchNo };
