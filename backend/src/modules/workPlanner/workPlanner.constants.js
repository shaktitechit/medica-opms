/**
 * @fileoverview Work Planner status enums and helpers.
 * @module modules/workPlanner/workPlanner.constants
 */

const PLAN_STATUSES = Object.freeze([
  'draft',
  'submitted',
  'approved',
  'rejected',
  'completed',
]);

const VISIT_STATUSES = Object.freeze([
  'pending',
  'checked_in',
  'completed',
  'cancelled',
  'skipped',
  'rescheduled',
]);

const TERMINAL_VISIT_STATUSES = Object.freeze(['completed', 'cancelled', 'skipped']);

const EDITABLE_PLAN_STATUSES = Object.freeze(['draft', 'rejected']);

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

function isSalesDept(user) {
  return user && user.department === 'sales';
}

module.exports = {
  PLAN_STATUSES,
  VISIT_STATUSES,
  TERMINAL_VISIT_STATUSES,
  EDITABLE_PLAN_STATUSES,
  startOfDay,
  endOfDay,
  isAdminDept,
  isSalesDept,
};
