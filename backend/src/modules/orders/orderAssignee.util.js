/**
 * @fileoverview Pure helpers for order department assignee fields (no I/O).
 * @module modules/orders/orderAssignee.util
 */

const DEPARTMENTS = Object.freeze(['sales', 'admin', 'finance', 'account', 'dispatch']);

const DEPARTMENT_TO_ORDER_FIELD = Object.freeze({
  sales: 'assigned_sales_user',
  admin: 'assigned_admin_user',
  finance: 'assigned_finance_user',
  account: 'assigned_account_user',
  dispatch: 'assigned_dispatch_user',
});

const PATCH_KEY_TO_DEPARTMENT = Object.freeze({
  assigned_sales_user: 'sales',
  assigned_admin_user: 'admin',
  assigned_finance_user: 'finance',
  assigned_account_user: 'account',
  assigned_dispatch_user: 'dispatch',
});

const ASSIGNED_USER_ORDER_FIELDS = Object.freeze(Object.keys(PATCH_KEY_TO_DEPARTMENT));

const ASSIGNEE_USER_SELECT = 'name email department';
const ASSIGNEE_BY_SELECT = 'name email';

function normalizeDepartment(value) {
  const s = String(value || '').trim().toLowerCase();
  return DEPARTMENTS.includes(s) ? s : null;
}

function normalizeUserId(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') {
    const id = value._id ?? value.id;
    if (id == null || id === '') return null;
    return String(id);
  }
  return String(value);
}

/** Read denormalized assignee id from an order-like object. */
function getAssignedUserIdFromOrder(order, department) {
  const dept = normalizeDepartment(department);
  if (!dept || !order) return null;
  const field = DEPARTMENT_TO_ORDER_FIELD[dept];
  return field ? normalizeUserId(order[field]) : null;
}

/** Map department → user id from denormalized order fields. */
function getAssigneeMapFromOrder(order) {
  const map = {};
  for (const dept of DEPARTMENTS) {
    const id = getAssignedUserIdFromOrder(order, dept);
    if (id) map[dept] = id;
  }
  return map;
}

/**
 * Resolve the user currently responsible for the order.
 * Prefers `current_assignee`, then department role fields.
 */
function resolveWorkflowAssigneeUserId(order) {
  if (!order) return null;
  const current = normalizeUserId(order.current_assignee);
  if (current) return current;
  const dept = normalizeDepartment(order.pending_with_role || order.current_department);
  if (!dept) return null;
  return getAssignedUserIdFromOrder(order, dept);
}

/** Mongo `$or` clause: user can see orders they created or are assigned to. */
function buildAssignedUserVisibilityOr(userId) {
  const id = normalizeUserId(userId);
  if (!id) return [];
  return [
    { created_by: id },
    ...ASSIGNED_USER_ORDER_FIELDS.map((field) => ({ [field]: id })),
  ];
}

function canUserBypassAssigneeVisibility(user) {
  return Boolean(user && user.department === 'super_admin');
}

/** Restrict findOne queries (getById, soft-delete checks). */
function applyAssignedUserVisibilityFilter(query, user) {
  if (canUserBypassAssigneeVisibility(user)) return;
  const visibility = buildAssignedUserVisibilityOr(user?._id);
  if (visibility.length) query.$or = visibility;
}

/** Append visibility to list queries that may already use `$and` / status `$or`. */
function appendAssignedUserVisibilityAnd(query, user) {
  if (canUserBypassAssigneeVisibility(user)) return;
  const visibility = buildAssignedUserVisibilityOr(user?._id);
  if (!visibility.length) return;
  if (!query.$and) query.$and = [];
  query.$and.push({ $or: visibility });
}

/** Assignee keys present on an order PATCH body. */
function pickAssigneePatch(patch) {
  const out = {};
  if (!patch || typeof patch !== 'object') return out;
  for (const key of ASSIGNED_USER_ORDER_FIELDS) {
    if (patch[key] !== undefined) out[key] = patch[key];
  }
  return out;
}

function hasAssigneePatch(patch) {
  return Object.keys(pickAssigneePatch(patch)).length > 0;
}

function assigneePopulate(query) {
  return query
    .populate('assignee', ASSIGNEE_USER_SELECT)
    .populate('assigned_by', ASSIGNEE_BY_SELECT);
}

/** Dedupe department/user pairs (last entry wins). */
function dedupeAssigneeEntries(entries) {
  const byKey = new Map();
  for (const entry of entries || []) {
    const dept = normalizeDepartment(entry.department);
    const userId = normalizeUserId(entry.assigneeId ?? entry.assignee);
    if (!dept || !userId) continue;
    byKey.set(`${dept}\0${userId}`, { department: dept, assigneeId: userId, remarks: entry.remarks });
  }
  return [...byKey.values()];
}

/** Dedupe rows by order + department + assignee (keeps first / newest sort order). */
function dedupeAssigneeRows(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    const orderId = String(row.order?._id ?? row.order ?? '');
    const dept = row.department;
    const userId = normalizeUserId(row.assignee);
    if (!orderId || !dept || !userId) {
      out.push(row);
      continue;
    }
    const key = `${orderId}\0${dept}\0${userId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/** First assignee per department from rows sorted by assigned_at desc. */
function primaryAssigneeIdByDepartment(rows) {
  const map = {};
  for (const row of rows || []) {
    const dept = row.department;
    const id = normalizeUserId(row.assignee);
    if (dept && id && !map[dept]) map[dept] = id;
  }
  return map;
}

module.exports = {
  DEPARTMENTS,
  DEPARTMENT_TO_ORDER_FIELD,
  PATCH_KEY_TO_DEPARTMENT,
  ASSIGNED_USER_ORDER_FIELDS,
  ASSIGNEE_USER_SELECT,
  ASSIGNEE_BY_SELECT,
  normalizeDepartment,
  normalizeUserId,
  getAssignedUserIdFromOrder,
  getAssigneeMapFromOrder,
  resolveWorkflowAssigneeUserId,
  buildAssignedUserVisibilityOr,
  canUserBypassAssigneeVisibility,
  applyAssignedUserVisibilityFilter,
  appendAssignedUserVisibilityAnd,
  pickAssigneePatch,
  hasAssigneePatch,
  assigneePopulate,
  dedupeAssigneeEntries,
  dedupeAssigneeRows,
  primaryAssigneeIdByDepartment,
};
