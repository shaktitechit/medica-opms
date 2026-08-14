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

const VISIT_PARTY_TYPES = Object.freeze(['existing', 'new_party', 'new_lead']);

const EXPENSE_STATUSES = Object.freeze(['draft', 'submitted', 'approved', 'rejected']);

const EDITABLE_EXPENSE_STATUSES = Object.freeze(['draft', 'rejected']);

const EXPENSE_CATEGORIES = Object.freeze([
  'Travel',
  'Accommodation',
  'Food',
  'Communication',
  'Client Entertainment',
  'Marketing',
  'Office',
  'Miscellaneous',
]);

const TRAVEL_SUB_CATEGORIES = Object.freeze([
  'Cab',
  'Auto',
  'Bus',
  'Bike Ride',
  'Private Bike',
  'Train',
  'Parking',
]);

const EXPENSE_PAYMENT_MODES = Object.freeze([
  'Cash',
  'UPI',
  'Card',
  'Bank Transfer',
  'Company Card',
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

/** Sales may add expenses only on plan day through plan day + 2 (3 calendar days). */
const EXPENSE_ADD_WINDOW_DAYS = 3;

/** Sales must attach image/PDF receipt when amount is greater than this. */
const EXPENSE_RECEIPT_REQUIRED_ABOVE = 499;

function isExpenseAddWindowOpen(planDate, now = new Date()) {
  if (!planDate) return false;
  const start = startOfDay(planDate);
  if (Number.isNaN(start.getTime())) return false;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + (EXPENSE_ADD_WINDOW_DAYS - 1));
  end.setUTCHours(23, 59, 59, 999);
  const t = now.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function isExpenseReceiptRequired(amount) {
  return Number(amount) > EXPENSE_RECEIPT_REQUIRED_ABOVE;
}

function isAdminDept(user) {
  return user && ['admin', 'super_admin', 'finance'].includes(user.department);
}

function isSalesDept(user) {
  return user && user.department === 'sales';
}

module.exports = {
  PLAN_STATUSES,
  VISIT_STATUSES,
  TERMINAL_VISIT_STATUSES,
  EDITABLE_PLAN_STATUSES,
  VISIT_PARTY_TYPES,
  EXPENSE_STATUSES,
  EDITABLE_EXPENSE_STATUSES,
  EXPENSE_CATEGORIES,
  TRAVEL_SUB_CATEGORIES,
  EXPENSE_PAYMENT_MODES,
  startOfDay,
  endOfDay,
  EXPENSE_ADD_WINDOW_DAYS,
  EXPENSE_RECEIPT_REQUIRED_ABOVE,
  isExpenseAddWindowOpen,
  isExpenseReceiptRequired,
  isAdminDept,
  isSalesDept,
};
