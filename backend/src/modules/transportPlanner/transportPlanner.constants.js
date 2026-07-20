/**
 * @fileoverview Transport Planner status enums and helpers.
 * @module modules/transportPlanner/transportPlanner.constants
 */

const PLAN_STATUSES = Object.freeze([
  'draft',
  'planned',
  'submitted',
  'in_transit',
  'completed',
  'cancelled',
]);

const PLAN_ORDER_STATUSES = Object.freeze([
  'pending',
  'packed',
  'dispatched',
  'delivered',
  'cancelled',
]);

/** Plans that still "own" an order (cannot be reassigned). */
const ACTIVE_PLAN_STATUSES = Object.freeze(['draft', 'planned', 'submitted', 'in_transit']);

/** Line statuses that block the same order from another plan. */
const ACTIVE_PLAN_ORDER_STATUSES = Object.freeze(['pending', 'packed', 'dispatched']);

const EDITABLE_PLAN_STATUSES = Object.freeze(['draft', 'planned']);

const TERMINAL_PLAN_STATUSES = Object.freeze(['completed', 'cancelled']);

const DISPATCH_ELIGIBLE_WORKFLOW_STAGES = Object.freeze([
  'dispatch',
]);

function startOfDay(dateInput) {
  const d = new Date(dateInput);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfDay(dateInput) {
  const d = new Date(dateInput);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function isAdminDept(user) {
  return user && ['admin', 'super_admin'].includes(user.department);
}

function isAccountDept(user) {
  return user && user.department === 'account';
}

function isDispatchDept(user) {
  return user && user.department === 'dispatch';
}

function canPlan(user) {
  return isAdminDept(user) || isAccountDept(user);
}

function canExecute(user) {
  return isAdminDept(user) || isDispatchDept(user);
}

module.exports = {
  PLAN_STATUSES,
  PLAN_ORDER_STATUSES,
  ACTIVE_PLAN_STATUSES,
  ACTIVE_PLAN_ORDER_STATUSES,
  EDITABLE_PLAN_STATUSES,
  TERMINAL_PLAN_STATUSES,
  DISPATCH_ELIGIBLE_WORKFLOW_STAGES,
  startOfDay,
  endOfDay,
  isAdminDept,
  isAccountDept,
  isDispatchDept,
  canPlan,
  canExecute,
};
