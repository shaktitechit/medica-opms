/**
 * @fileoverview Domain enums shared by workflow, models, and API validation.
 * @module constants/domain
 * @see essentials/order-starus.text and mongoRegistry ORDER_STATUS_ENUM
 */

const ORDER_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  SALES_APPROVED: 'sales_approved',
  FINANCE_REVIEW: 'finance_review',
  FINANCE_APPROVED: 'finance_approved',
  PARTIALLY_FINANCE_APPROVED: 'partially_finance_approved',
  FULLY_FINANCE_APPROVED: 'fully_finance_approved',
  FINANCE_REJECTED: 'finance_rejected',
  ACCOUNT_REVIEW: 'account_review',
  PARTIALLY_ACCOUNT_APPROVED: 'partially_account_approved',
  FULLY_ACCOUNT_APPROVED: 'fully_account_approved',
  ACCOUNT_REJECTED: 'account_rejected',
  DISPATCH_PENDING: 'dispatch_pending',
  PARTIAL_DISPATCH_CREATED: 'partial_dispatch_created',
  FULL_DISPATCH_CREATED: 'full_dispatch_created',
  TRANSPORT_PENDING: 'transport_pending',
  TRANSPORT_ASSIGNED: 'transport_assigned',
  PARTIALLY_TRANSPORTED: 'partially_transported',
  FULLY_TRANSPORTED: 'fully_transported',
  IN_TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  ON_HOLD: 'on_hold',
};

const DISPATCH_STATUS = {
  PARTIALLY_DISPATCHED: 'partially_dispatched',
  FULLY_DISPATCHED: 'fully_dispatched',
  CANCELLED: 'cancelled',
};

const TRANSPORT_STATUS = {
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  IN_TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

module.exports = {
  ORDER_STATUS,
  DISPATCH_STATUS,
  TRANSPORT_STATUS,
};
