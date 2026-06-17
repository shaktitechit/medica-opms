/**
 * @fileoverview Canonical order enums aligned with models/Order.js
 * @module modules/orders/order.constants
 */

const ORDER_LINE_STATUS = Object.freeze({
  ACTIVE: 'active',
  PARTIAL: 'partial',
  FULFILLED: 'fulfilled',
  CANCELLED: 'cancelled',
});

const ORDER_LIFECYCLE_STATUS = Object.freeze({
  DRAFT: 'draft',
  ACTIVE: 'active',
  PARTIALLY_FULFILLED: 'partially_fulfilled',
  FULFILLED: 'fulfilled',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
  ON_HOLD: 'on_hold',
});

const ORDER_WORKFLOW_STAGE = Object.freeze({
  SALES: 'sales',
  ADMIN_REVIEW: 'admin_review',
  FINANCE_REVIEW: 'finance_review',
  ACCOUNT_REVIEW: 'account_review',
  DISPATCH: 'dispatch',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  ON_HOLD: 'on_hold',
});

const ORDER_STATUS = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  SALES_APPROVED: 'sales_approved',
  FINANCE_REVIEW: 'finance_review',
  FINANCE_APPROVED: 'finance_approved',
  FINANCE_REJECTED: 'finance_rejected',
  ACCOUNT_REVIEW: 'account_review',
  ACCOUNT_APPROVED: 'account_approved',
  ACCOUNT_REJECTED: 'account_rejected',
  DISPATCH: 'dispatch',
  IN_TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
  ON_HOLD: 'on_hold',
});

const APPROVAL_STATUS = Object.freeze({
  PENDING: 'pending',
  PARTIAL: 'partial',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

const FULFILLMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  PARTIAL: 'partial',
  COMPLETED: 'completed',
});

const ORDER_JOB_TYPES = Object.freeze({
  SYNC_PARTY_RATES: 'sync_party_rates',
  RECALCULATE_FULFILLMENT: 'recalculate_fulfillment',
  POST_TRANSPORT_SHIPMENT: 'post_transport_shipment',
  POST_SHIPMENT_DELIVERY: 'post_shipment_delivery',
  SETTLE_AND_CLOSE: 'settle_and_close',
  SUBMIT_ORDER: 'submit_order',
});

/** Legacy finance approval values still present in older documents. */
const LEGACY_FINANCE_APPROVAL_STATUS = Object.freeze({
  FULL: 'full',
});

const ORDER_LINE_STATUS_VALUES = Object.freeze(Object.values(ORDER_LINE_STATUS));
const ORDER_STATUS_VALUES = Object.freeze(Object.values(ORDER_STATUS));
const APPROVAL_STATUS_VALUES = Object.freeze(Object.values(APPROVAL_STATUS));

function normalizeFinanceApprovalStatus(status) {
  const s = String(status || APPROVAL_STATUS.PENDING);
  if (s === LEGACY_FINANCE_APPROVAL_STATUS.FULL) return APPROVAL_STATUS.APPROVED;
  return s;
}

/** Legacy queue statuses stored on older Order documents. */
const LEGACY_ORDER_STATUS_ALIASES = Object.freeze({
  partially_finance_approved: ORDER_STATUS.FINANCE_APPROVED,
  fully_finance_approved: ORDER_STATUS.FINANCE_APPROVED,
  partially_account_approved: ORDER_STATUS.ACCOUNT_APPROVED,
  fully_account_approved: ORDER_STATUS.ACCOUNT_APPROVED,
  dispatch_pending: ORDER_STATUS.DISPATCH,
  partial_dispatch_created: ORDER_STATUS.DISPATCH,
  full_dispatch_created: ORDER_STATUS.DISPATCH,
  transport_pending: ORDER_STATUS.IN_TRANSIT,
  transport_assigned: ORDER_STATUS.IN_TRANSIT,
  partially_transported: ORDER_STATUS.IN_TRANSIT,
  fully_transported: ORDER_STATUS.IN_TRANSIT,
  hold: ORDER_STATUS.ON_HOLD,
});

function normalizeOrderStoredStatus(status) {
  const raw = String(status || '');
  if (!raw) return raw;
  return LEGACY_ORDER_STATUS_ALIASES[raw] || raw;
}

function normalizeWorkflowStage(stage) {
  const s = String(stage || '');
  if (s === 'dispatch_review' || s === 'dispatch_execution') return ORDER_WORKFLOW_STAGE.DISPATCH;
  if (s === 'hold') return ORDER_WORKFLOW_STAGE.ON_HOLD;
  if (s === 'Delivered') return ORDER_WORKFLOW_STAGE.COMPLETED;
  return s;
}

/** Coerce legacy status/stage values before persisting Order documents. */
function normalizeOrderWorkflowFields(doc) {
  if (!doc) return doc;
  const normalizedStatus = normalizeOrderStoredStatus(doc.status);
  if (normalizedStatus) doc.status = normalizedStatus;
  const normalizedStage = normalizeWorkflowStage(doc.workflow_stage);
  if (normalizedStage) doc.workflow_stage = normalizedStage;
  return doc;
}

module.exports = {
  ORDER_LINE_STATUS,
  ORDER_LIFECYCLE_STATUS,
  ORDER_WORKFLOW_STAGE,
  ORDER_STATUS,
  APPROVAL_STATUS,
  FULFILLMENT_STATUS,
  ORDER_JOB_TYPES,
  LEGACY_FINANCE_APPROVAL_STATUS,
  ORDER_LINE_STATUS_VALUES,
  ORDER_STATUS_VALUES,
  APPROVAL_STATUS_VALUES,
  LEGACY_ORDER_STATUS_ALIASES,
  normalizeFinanceApprovalStatus,
  normalizeOrderStoredStatus,
  normalizeWorkflowStage,
  normalizeOrderWorkflowFields,
};
