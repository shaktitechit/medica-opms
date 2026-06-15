/**
 * @fileoverview Pure workflow rules:
 * - allowed transition graph
 * - department-wise transition permission
 * - flag blocking
 * - pricing lock after finance approval
 *
 * Important:
 * - Transition must satisfy BOTH:
 *   1. ORDER_TRANSITIONS graph
 *   2. Department permission
 */
const ORDER_TRANSITIONS = require('./workflow.transitions');
const { ORDER_STATUS } = require('../../constants/domain');

function normalizeDepartment(value) {
  if (value == null) return null;

  const s = String(value).trim().toLowerCase();

  if (!s || s === 'null' || s === 'undefined') return null;

  return s;
}

/**
 * Which `toStatus` values a department may perform.
 *
 * Note:
 * This does NOT bypass ORDER_TRANSITIONS.
 * Example: sales can set `sales_approved`,
 * but only if graph allows currentStatus -> sales_approved.
 */
const DEPT_CAN_SET_STATUS = Object.freeze({
  sales: new Set([
    ORDER_STATUS.SUBMITTED,
    ORDER_STATUS.CANCELLED,
  ]),

  /**
   * Admin is limited to early lifecycle control.
   */
  admin: new Set([
    ORDER_STATUS.SUBMITTED,
    ORDER_STATUS.SALES_APPROVED,
    ORDER_STATUS.FINANCE_REVIEW,
    ORDER_STATUS.PARTIALLY_FINANCE_APPROVED,
    ORDER_STATUS.FULLY_FINANCE_APPROVED,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.ON_HOLD,
    ORDER_STATUS.DISPATCH_PENDING,
    ORDER_STATUS.PARTIAL_DISPATCH_CREATED,
    ORDER_STATUS.FULL_DISPATCH_CREATED,
    ORDER_STATUS.TRANSPORT_PENDING,
    ORDER_STATUS.TRANSPORT_ASSIGNED,
    ORDER_STATUS.PARTIALLY_TRANSPORTED,
    ORDER_STATUS.FULLY_TRANSPORTED,
    ORDER_STATUS.IN_TRANSIT,
    ORDER_STATUS.DELIVERED,
  ]),

  /**
   * Super admin has full workflow control across all departments.
   */
  super_admin: new Set([
    ORDER_STATUS.SUBMITTED,
    ORDER_STATUS.SALES_APPROVED,
    ORDER_STATUS.FINANCE_REVIEW,
    ORDER_STATUS.PARTIALLY_FINANCE_APPROVED,
    ORDER_STATUS.FULLY_FINANCE_APPROVED,
    ORDER_STATUS.FINANCE_REJECTED,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.ON_HOLD,
    ORDER_STATUS.DISPATCH_PENDING,
    ORDER_STATUS.PARTIAL_DISPATCH_CREATED,
    ORDER_STATUS.FULL_DISPATCH_CREATED,
    ORDER_STATUS.TRANSPORT_PENDING,
    ORDER_STATUS.TRANSPORT_ASSIGNED,
    ORDER_STATUS.PARTIALLY_TRANSPORTED,
    ORDER_STATUS.FULLY_TRANSPORTED,
    ORDER_STATUS.IN_TRANSIT,
    ORDER_STATUS.DELIVERED,
  ]),

  finance: new Set([
    ORDER_STATUS.FINANCE_REVIEW,
    ORDER_STATUS.FINANCE_APPROVED,
    ORDER_STATUS.PARTIALLY_FINANCE_APPROVED,
    ORDER_STATUS.FULLY_FINANCE_APPROVED,
    ORDER_STATUS.FINANCE_REJECTED,
    ORDER_STATUS.ACCOUNT_REVIEW,
    ORDER_STATUS.DISPATCH_PENDING,
    ORDER_STATUS.ON_HOLD,
    ORDER_STATUS.CANCELLED,
  ]),

  account: new Set([
    ORDER_STATUS.ACCOUNT_REVIEW,
    ORDER_STATUS.PARTIALLY_ACCOUNT_APPROVED,
    ORDER_STATUS.FULLY_ACCOUNT_APPROVED,
    ORDER_STATUS.ACCOUNT_REJECTED,
    ORDER_STATUS.FULLY_FINANCE_APPROVED,
    ORDER_STATUS.PARTIALLY_FINANCE_APPROVED,
    ORDER_STATUS.DISPATCH_PENDING,
    ORDER_STATUS.ON_HOLD,
    ORDER_STATUS.CANCELLED,
  ]),

  dispatch: new Set([
    ORDER_STATUS.DISPATCH_PENDING,
    ORDER_STATUS.PARTIAL_DISPATCH_CREATED,
    ORDER_STATUS.FULL_DISPATCH_CREATED,
    ORDER_STATUS.TRANSPORT_PENDING,
    ORDER_STATUS.TRANSPORT_ASSIGNED,
    ORDER_STATUS.PARTIALLY_TRANSPORTED,
    ORDER_STATUS.FULLY_TRANSPORTED,
    ORDER_STATUS.IN_TRANSIT,
    ORDER_STATUS.DELIVERED,
    ORDER_STATUS.ON_HOLD,
  ]),
});

function departmentAllowsTransition(userDeptRaw, fromStatus, toStatus) {
  const userDept = normalizeDepartment(userDeptRaw);
  if (!userDept) return false;

  if (userDept === 'sales') {
    return fromStatus === ORDER_STATUS.DRAFT &&
      [ORDER_STATUS.SUBMITTED, ORDER_STATUS.CANCELLED].includes(toStatus);
  }

  /**
   * Special case: resume from on_hold.
   *
   * Current transition graph allows:
   * on_hold -> submitted
   * on_hold -> finance_review
   * on_hold -> dispatch_pending
   * on_hold -> cancelled
   */
  if (fromStatus === ORDER_STATUS.ON_HOLD && toStatus !== ORDER_STATUS.ON_HOLD) {
    if (toStatus === ORDER_STATUS.SUBMITTED) {
      return ['sales', 'admin', 'super_admin'].includes(userDept);
    }

    if (toStatus === ORDER_STATUS.FINANCE_REVIEW) {
      return ['finance', 'admin', 'super_admin'].includes(userDept);
    }

    if (toStatus === ORDER_STATUS.ACCOUNT_REVIEW) {
      return ['finance', 'account', 'admin', 'super_admin'].includes(userDept);
    }

    if (toStatus === ORDER_STATUS.DISPATCH_PENDING) {
      return ['dispatch', 'account', 'super_admin'].includes(userDept);
    }

    if (toStatus === ORDER_STATUS.CANCELLED) {
      return ['sales', 'finance', 'account', 'admin', 'super_admin'].includes(userDept);
    }

    return false;
  }

  /**
   * Special case: finance rejected escape.
   *
   * finance_rejected -> submitted
   * finance_rejected -> cancelled
   */
  if (fromStatus === ORDER_STATUS.FINANCE_REJECTED) {
    if (toStatus === ORDER_STATUS.SUBMITTED) {
      return ['sales', 'admin', 'super_admin'].includes(userDept);
    }

    if (toStatus === ORDER_STATUS.CANCELLED) {
      return ['sales', 'finance', 'account', 'admin', 'super_admin'].includes(userDept);
    }

    return false;
  }

  const allowed = DEPT_CAN_SET_STATUS[userDept];

  return Boolean(allowed && allowed.has(toStatus));
}

function isTransitionAllowed(fromStatus, toStatus) {
  const edges = ORDER_TRANSITIONS[fromStatus];

  return Array.isArray(edges) && edges.includes(toStatus);
}

/**
 * Stages where dispatch / fulfillment has materially started.
 * payment_issue / stock_issue / dispatch_issue should block from here onward.
 */
const DISPATCH_LIKE = new Set([
  ORDER_STATUS.DISPATCH_PENDING,
  ORDER_STATUS.PARTIAL_DISPATCH_CREATED,
  ORDER_STATUS.FULL_DISPATCH_CREATED,
  ORDER_STATUS.TRANSPORT_PENDING,
  ORDER_STATUS.TRANSPORT_ASSIGNED,
  ORDER_STATUS.PARTIALLY_TRANSPORTED,
  ORDER_STATUS.FULLY_TRANSPORTED,
  ORDER_STATUS.IN_TRANSIT,
  ORDER_STATUS.DELIVERED,
]);

function flagBlocksTransition(flagType, nextStatus) {
  if (
    ['payment_issue', 'stock_issue', 'dispatch_issue'].includes(flagType) &&
    DISPATCH_LIKE.has(nextStatus)
  ) {
    return true;
  }

  return false;
}

function financeApprovalLockedStatuses() {
  return new Set([
    ORDER_STATUS.FINANCE_APPROVED,
    ORDER_STATUS.PARTIALLY_FINANCE_APPROVED,
    ORDER_STATUS.FULLY_FINANCE_APPROVED,
    ORDER_STATUS.DISPATCH_PENDING,
    ORDER_STATUS.PARTIAL_DISPATCH_CREATED,
    ORDER_STATUS.FULL_DISPATCH_CREATED,
    ORDER_STATUS.TRANSPORT_PENDING,
    ORDER_STATUS.TRANSPORT_ASSIGNED,
    ORDER_STATUS.PARTIALLY_TRANSPORTED,
    ORDER_STATUS.FULLY_TRANSPORTED,
    ORDER_STATUS.IN_TRANSIT,
    ORDER_STATUS.DELIVERED,
  ]);
}

function salesMayEditPricing(orderStatus) {
  return !financeApprovalLockedStatuses().has(orderStatus);
}

module.exports = {
  normalizeDepartment,
  departmentAllowsTransition,
  isTransitionAllowed,
  flagBlocksTransition,
  financeApprovalLockedStatuses,
  salesMayEditPricing,
  DEPT_CAN_SET_STATUS,
};