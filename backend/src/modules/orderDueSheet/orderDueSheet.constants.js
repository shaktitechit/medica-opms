/**
 * @fileoverview Order due sheet status constants.
 * @module modules/orderDueSheet/orderDueSheet.constants
 */

const DUE_SHEET_STATUS = {
  ACTIVE: 'active',
  SUPERSEDED: 'superseded',
  ARCHIVED: 'archived',
};

const DUE_SHEET_STATUS_VALUES = Object.values(DUE_SHEET_STATUS);

function normalizeDueSheetStatus(value, fallback = DUE_SHEET_STATUS.ACTIVE) {
  const normalized = String(value || fallback).trim().toLowerCase();
  return DUE_SHEET_STATUS_VALUES.includes(normalized) ? normalized : fallback;
}

module.exports = {
  DUE_SHEET_STATUS,
  DUE_SHEET_STATUS_VALUES,
  normalizeDueSheetStatus,
};
