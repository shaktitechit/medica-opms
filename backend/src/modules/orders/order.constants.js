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
  FULL: 'full',
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
  POST_ORDER_RETURN: 'post_order_return',
  SUBMIT_ORDER: 'submit_order',
  SYNC_ORDER_PRIORITIES: 'sync_order_priorities',
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

/** Legacy line_status values stored on older Order documents. */
const LEGACY_ORDER_LINE_STATUS_ALIASES = Object.freeze({
  fully_delivered: ORDER_LINE_STATUS.FULFILLED,
  partially_delivered: ORDER_LINE_STATUS.PARTIAL,
  fully_dispatched: ORDER_LINE_STATUS.FULFILLED,
  partially_dispatched: ORDER_LINE_STATUS.PARTIAL,
  draft: ORDER_LINE_STATUS.ACTIVE,
  confirmed: ORDER_LINE_STATUS.ACTIVE,
});

function normalizeOrderLineStatus(status) {
  const raw = String(status || ORDER_LINE_STATUS.ACTIVE).toLowerCase();
  if (ORDER_LINE_STATUS_VALUES.includes(raw)) return raw;
  return LEGACY_ORDER_LINE_STATUS_ALIASES[raw] || ORDER_LINE_STATUS.ACTIVE;
}

/** Coerce legacy line_status on every order item before persisting. */
function normalizeOrderLineItems(doc) {
  if (!doc?.order_items) return doc;
  for (const line of doc.order_items) {
    line.line_status = normalizeOrderLineStatus(line.line_status);
  }
  doc.markModified?.('order_items');
  return doc;
}

/** Coerce legacy status/stage values before persisting Order documents. */
function normalizeOrderWorkflowFields(doc) {
  if (!doc) return doc;
  const normalizedStatus = normalizeOrderStoredStatus(doc.status);
  if (normalizedStatus) doc.status = normalizedStatus;
  const normalizedStage = normalizeWorkflowStage(doc.workflow_stage);
  if (normalizedStage) doc.workflow_stage = normalizedStage;
  if (doc.account_approval_status === 'full') {
    doc.account_approval_status = APPROVAL_STATUS.APPROVED;
  }
  if (doc.finance_approval_status) {
    doc.finance_approval_status = normalizeFinanceApprovalStatus(doc.finance_approval_status);
  }
  normalizeOrderLineItems(doc);
  return doc;
}

/**
 * Calendar days from today (UTC date) until expected delivery date.
 * Negative when the EDD is already past.
 * @param {Date|string|null|undefined} expectedDeliveryDate
 * @returns {number|null}
 */
function daysUntilExpectedDelivery(expectedDeliveryDate) {
  if (expectedDeliveryDate == null || expectedDeliveryDate === '') return null;
  const target = expectedDeliveryDate instanceof Date
    ? expectedDeliveryDate
    : new Date(expectedDeliveryDate);
  if (Number.isNaN(target.getTime())) return null;

  const now = new Date();
  const startTodayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startEddUtc = Date.UTC(
    target.getUTCFullYear(),
    target.getUTCMonth(),
    target.getUTCDate(),
  );
  return Math.floor((startEddUtc - startTodayUtc) / (24 * 60 * 60 * 1000));
}

/**
 * Derive order priority from expected_delivery_date:
 * - > 10 days → low
 * - 5–10 days → normal
 * - 3–4 days → high
 * - ≤ 2 days (or past) → urgent
 * Missing/invalid EDD keeps the provided fallback (default normal).
 * @param {Date|string|null|undefined} expectedDeliveryDate
 * @param {string} [fallback='normal']
 * @returns {'low'|'normal'|'high'|'urgent'}
 */
function deriveOrderPriorityFromExpectedDeliveryDate(
  expectedDeliveryDate,
  fallback = 'normal',
) {
  const daysLeft = daysUntilExpectedDelivery(expectedDeliveryDate);
  if (daysLeft == null) return fallback;

  if (daysLeft > 10) return 'low';
  if (daysLeft >= 5) return 'normal';
  if (daysLeft >= 3) return 'high';
  return 'urgent';
}

/** Apply live EDD-derived priority onto a plain order object (for API responses). */
function applyDerivedPriorityToOrder(order) {
  if (!order || typeof order !== 'object') return order;
  if (order.expected_delivery_date) {
    order.priority = deriveOrderPriorityFromExpectedDeliveryDate(
      order.expected_delivery_date,
      order.priority || 'normal',
    );
  }
  return order;
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
  LEGACY_ORDER_LINE_STATUS_ALIASES,
  normalizeFinanceApprovalStatus,
  normalizeOrderStoredStatus,
  normalizeOrderLineStatus,
  normalizeOrderLineItems,
  normalizeWorkflowStage,
  normalizeOrderWorkflowFields,
  daysUntilExpectedDelivery,
  deriveOrderPriorityFromExpectedDeliveryDate,
  applyDerivedPriorityToOrder,
};
