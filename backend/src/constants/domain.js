/**
 * @fileoverview Domain enums shared by workflow, models, and API validation.
 * @module constants/domain
 * @see backend/src/models/Order.js
 */

const ORDER_STATUS = {
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
};

const DISPATCH_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  TRANSPORT_CREATED: 'transport_created',
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
