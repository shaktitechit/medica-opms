/**
 * @fileoverview Pure workflow rules:
 * - allowed transition graph
 * - department-wise transition permission
 * - flag blocking
 * - pricing lock after finance approval
 * @module modules/workflow/workflow.rules
 */
const ORDER_TRANSITIONS = require('./workflow.transitions');
const { ORDER_STATUS } = require('../orders/order.constants');
const { normalizeOrderStatus } = require('./workflow.constants');

function normalizeDepartment(value) {
  if (value == null) return null;
  const s = String(value).trim().toLowerCase();
  if (!s || s === 'null' || s === 'undefined') return null;
  return s;
}

const DEPT_CAN_SET_STATUS = Object.freeze({
  sales: new Set([
    ORDER_STATUS.SUBMITTED,
    ORDER_STATUS.CANCELLED,
  ]),

  admin: new Set([
    ORDER_STATUS.SUBMITTED,
    ORDER_STATUS.SALES_APPROVED,
    ORDER_STATUS.FINANCE_REVIEW,
    ORDER_STATUS.FINANCE_APPROVED,
    ORDER_STATUS.FINANCE_REJECTED,
    ORDER_STATUS.ACCOUNT_REVIEW,
    ORDER_STATUS.ACCOUNT_APPROVED,
    ORDER_STATUS.ACCOUNT_REJECTED,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.ON_HOLD,
    ORDER_STATUS.DISPATCH,
    ORDER_STATUS.IN_TRANSIT,
    ORDER_STATUS.DELIVERED,
    ORDER_STATUS.CLOSED,
  ]),

  super_admin: new Set([
    ORDER_STATUS.SUBMITTED,
    ORDER_STATUS.SALES_APPROVED,
    ORDER_STATUS.FINANCE_REVIEW,
    ORDER_STATUS.FINANCE_APPROVED,
    ORDER_STATUS.FINANCE_REJECTED,
    ORDER_STATUS.ACCOUNT_REVIEW,
    ORDER_STATUS.ACCOUNT_APPROVED,
    ORDER_STATUS.ACCOUNT_REJECTED,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.ON_HOLD,
    ORDER_STATUS.DISPATCH,
    ORDER_STATUS.IN_TRANSIT,
    ORDER_STATUS.DELIVERED,
    ORDER_STATUS.CLOSED,
  ]),

  finance: new Set([
    ORDER_STATUS.FINANCE_REVIEW,
    ORDER_STATUS.FINANCE_APPROVED,
    ORDER_STATUS.FINANCE_REJECTED,
    ORDER_STATUS.ACCOUNT_REVIEW,
    ORDER_STATUS.DISPATCH,
    ORDER_STATUS.ON_HOLD,
    ORDER_STATUS.CANCELLED,
  ]),

  account: new Set([
    ORDER_STATUS.ACCOUNT_REVIEW,
    ORDER_STATUS.ACCOUNT_APPROVED,
    ORDER_STATUS.ACCOUNT_REJECTED,
    ORDER_STATUS.FINANCE_APPROVED,
    ORDER_STATUS.FINANCE_REJECTED,
    ORDER_STATUS.DISPATCH,
    ORDER_STATUS.ON_HOLD,
    ORDER_STATUS.CLOSED,
    ORDER_STATUS.CANCELLED,
  ]),

  dispatch: new Set([
    ORDER_STATUS.DISPATCH,
    ORDER_STATUS.IN_TRANSIT,
    ORDER_STATUS.DELIVERED,
    ORDER_STATUS.ON_HOLD,
    ORDER_STATUS.CANCELLED,
  ]),
});

function departmentAllowsTransition(userDeptRaw, fromStatus, toStatus) {
  const userDept = normalizeDepartment(userDeptRaw);
  if (!userDept) return false;

  const from = normalizeOrderStatus(fromStatus);
  const to = normalizeOrderStatus(toStatus);

  if (['sales', 'finance', 'account'].includes(userDept)) {
    if (from === ORDER_STATUS.DRAFT) {
      return [ORDER_STATUS.SUBMITTED, ORDER_STATUS.CANCELLED].includes(to);
    }
  }

  if (from === ORDER_STATUS.ON_HOLD && to !== ORDER_STATUS.ON_HOLD) {
    if (to === ORDER_STATUS.SUBMITTED) {
      return ['sales', 'admin', 'super_admin', 'finance', 'account'].includes(userDept);
    }
    if (to === ORDER_STATUS.FINANCE_REVIEW) {
      return ['finance', 'admin', 'super_admin'].includes(userDept);
    }
    if (to === ORDER_STATUS.ACCOUNT_REVIEW) {
      return ['finance', 'account', 'admin', 'super_admin'].includes(userDept);
    }
    if (to === ORDER_STATUS.DISPATCH) {
      return ['dispatch', 'account', 'admin', 'super_admin'].includes(userDept);
    }
    if (to === ORDER_STATUS.CANCELLED) {
      return ['sales', 'finance', 'account', 'admin', 'super_admin'].includes(userDept);
    }
    return false;
  }

  if (from === ORDER_STATUS.FINANCE_REJECTED) {
    if (to === ORDER_STATUS.SUBMITTED) {
      return ['sales', 'admin', 'super_admin', 'finance', 'account'].includes(userDept);
    }
    if (to === ORDER_STATUS.CANCELLED) {
      return ['sales', 'finance', 'account', 'admin', 'super_admin'].includes(userDept);
    }
    return false;
  }

  const allowed = DEPT_CAN_SET_STATUS[userDept];
  return Boolean(allowed && allowed.has(to));
}

function isTransitionAllowed(fromStatus, toStatus) {
  const from = normalizeOrderStatus(fromStatus);
  const to = normalizeOrderStatus(toStatus);
  const edges = ORDER_TRANSITIONS[from];
  return Array.isArray(edges) && edges.includes(to);
}

const DISPATCH_LIKE = new Set([
  ORDER_STATUS.DISPATCH,
  ORDER_STATUS.IN_TRANSIT,
  ORDER_STATUS.DELIVERED,
]);

function flagBlocksTransition(flagType, nextStatus) {
  const to = normalizeOrderStatus(nextStatus);
  if (
    ['payment_issue', 'stock_issue', 'dispatch_issue'].includes(flagType)
    && DISPATCH_LIKE.has(to)
  ) {
    return true;
  }
  return false;
}

function financeApprovalLockedStatuses() {
  return new Set([
    ORDER_STATUS.FINANCE_APPROVED,
    ORDER_STATUS.ACCOUNT_APPROVED,
    ORDER_STATUS.DISPATCH,
    ORDER_STATUS.IN_TRANSIT,
    ORDER_STATUS.DELIVERED,
  ]);
}

function salesMayEditPricing(orderStatus) {
  return !financeApprovalLockedStatuses().has(normalizeOrderStatus(orderStatus));
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
