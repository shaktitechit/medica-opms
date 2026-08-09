/**
 * @fileoverview Unbilled order status constants.
 * @module modules/unbilledOrder/unbilledOrder.constants
 */

const UNBILLED_ORDER_STATUS = Object.freeze({
  OPEN: 'open',
  RESOLVED: 'resolved',
  CANCELLED: 'cancelled',
});

const UNBILLED_ORDER_STATUS_VALUES = Object.freeze(Object.values(UNBILLED_ORDER_STATUS));

const SUBMITTED_DISPATCH_STATUSES = Object.freeze(['submitted', 'transport_created']);

/** Pipeline stages stored on UnbilledOrder.pipeline_stage (for UI labels). */
const PIPELINE_STAGE = Object.freeze({
  ADMIN_PENDING: 'admin_pending',
  DUE_SHEET_PENDING: 'due_sheet_pending',
  FINANCE_PENDING: 'finance_pending',
  ACCOUNT_PENDING: 'account_pending',
  DISPATCH_PENDING: 'dispatch_pending',
  TRANSPORT_PENDING: 'transport_pending',
  PARTIALLY_BILLED: 'partially_billed',
  UNBILLED: 'unbilled',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  RESOLVED: 'resolved',
});

const PIPELINE_STAGE_LABELS = Object.freeze({
  [PIPELINE_STAGE.ADMIN_PENDING]: 'Admin Pending',
  [PIPELINE_STAGE.DUE_SHEET_PENDING]: 'Due Sheet Pending',
  [PIPELINE_STAGE.FINANCE_PENDING]: 'Finance Pending',
  [PIPELINE_STAGE.ACCOUNT_PENDING]: 'Account Pending',
  [PIPELINE_STAGE.DISPATCH_PENDING]: 'Dispatch Pending',
  [PIPELINE_STAGE.TRANSPORT_PENDING]: 'Transport Pending',
  [PIPELINE_STAGE.PARTIALLY_BILLED]: 'Partially Billed',
  [PIPELINE_STAGE.UNBILLED]: 'Unbilled',
  [PIPELINE_STAGE.REJECTED]: 'Rejected',
  [PIPELINE_STAGE.CANCELLED]: 'Cancelled',
  [PIPELINE_STAGE.RESOLVED]: 'Resolved',
});

/**
 * Only true billing gaps belong in Un Billed:
 * - unbilled: approved qty with no submitted dispatch yet
 * - partially_billed: approved qty > submitted/transport_created dispatch qty
 */
const TRACKABLE_PIPELINE_STAGES = Object.freeze([
  PIPELINE_STAGE.PARTIALLY_BILLED,
  PIPELINE_STAGE.UNBILLED,
]);

function normalizeUnbilledOrderStatus(value, fallback = UNBILLED_ORDER_STATUS.OPEN) {
  const normalized = String(value || fallback).trim().toLowerCase();
  return UNBILLED_ORDER_STATUS_VALUES.includes(normalized) ? normalized : fallback;
}

module.exports = {
  UNBILLED_ORDER_STATUS,
  UNBILLED_ORDER_STATUS_VALUES,
  SUBMITTED_DISPATCH_STATUSES,
  PIPELINE_STAGE,
  PIPELINE_STAGE_LABELS,
  TRACKABLE_PIPELINE_STAGES,
  normalizeUnbilledOrderStatus,
};
