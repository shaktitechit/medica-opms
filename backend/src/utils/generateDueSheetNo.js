/**
 * @fileoverview Utilities (generateDueSheetNo).
 * @module utils/generateDueSheetNo
 */
function generateDueSheetNo() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ODS-${ts}-${rand}`;
}

module.exports = { generateDueSheetNo };
