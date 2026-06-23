/**
 * @fileoverview Order list/detail visibility by department.
 * @module modules/orders/orderAssignee.util
 */

const { ORDER_STATUS } = require('./order.constants');

const SALES_ASSIGNEE_FIELD = 'assigned_sales_user';
const ASSIGNED_USER_ORDER_FIELDS = [SALES_ASSIGNEE_FIELD];

function normalizeUserId(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') {
    const id = value._id ?? value.id;
    if (id == null || id === '') return null;
    return String(id);
  }
  return String(value);
}

function departmentOf(user) {
  return String(user?.department || '').toLowerCase();
}

function isSalesUser(user) {
  return departmentOf(user) === 'sales';
}

function isSuperAdminUser(user) {
  return departmentOf(user) === 'super_admin';
}

/** Non-sales/admin/finance/account (except super_admin) only see orders that have left draft / been submitted. */
function shouldExcludeDraftOrders(user) {
  const dept = departmentOf(user);
  return !['sales', 'admin', 'super_admin', 'finance', 'account'].includes(dept);
}

function shouldFilterOrdersBySalesAssignee(user) {
  return isSalesUser(user);
}

/** Sales: own or assigned orders (including drafts). */
function buildSalesVisibilityOr(userId) {
  const id = normalizeUserId(userId);
  if (!id) return null;
  return {
    $or: [
      { created_by: id },
      { [SALES_ASSIGNEE_FIELD]: id },
    ],
  };
}

function buildExcludeDraftClause() {
  return { status: { $ne: ORDER_STATUS.DRAFT } };
}

function applyOrderVisibilityFilter(query, user) {
  if (shouldFilterOrdersBySalesAssignee(user)) {
    const clause = buildSalesVisibilityOr(user?._id);
    if (clause) query.$or = clause.$or;
    return;
  }
  if (shouldExcludeDraftOrders(user)) {
    Object.assign(query, buildExcludeDraftClause());
  }
}

/**
 * Visibility for fetch/mutate by id — sales assignee scope only.
 * Draft exclusion applies to list queries, not direct access (admin create→submit, etc.).
 */
function applyOrderAccessFilter(query, user) {
  if (!shouldFilterOrdersBySalesAssignee(user)) return;
  const clause = buildSalesVisibilityOr(user?._id);
  if (!clause) return;

  if (query._id != null) {
    const idClause = { _id: query._id };
    delete query._id;
    query.$and = [idClause, clause];
    return;
  }
  query.$or = clause.$or;
}

function appendOrderVisibilityAnd(andConditions, user) {
  if (shouldFilterOrdersBySalesAssignee(user)) {
    const clause = buildSalesVisibilityOr(user?._id);
    if (clause) andConditions.push(clause);
    return;
  }
  if (shouldExcludeDraftOrders(user)) {
    andConditions.push(buildExcludeDraftClause());
  }
}

function resolveWorkflowAssigneeUserId(order) {
  if (!order) return null;
  const current = normalizeUserId(order.current_assignee);
  if (current) return current;
  return normalizeUserId(order[SALES_ASSIGNEE_FIELD]);
}

/** @deprecated Use applyOrderVisibilityFilter */
function applySalesVisibilityFilter(query, user) {
  applyOrderVisibilityFilter(query, user);
}

/** @deprecated Use appendOrderVisibilityAnd */
function appendSalesVisibilityAnd(andConditions, user) {
  appendOrderVisibilityAnd(andConditions, user);
}

module.exports = {
  SALES_ASSIGNEE_FIELD,
  ASSIGNED_USER_ORDER_FIELDS,
  normalizeUserId,
  isSalesUser,
  isSuperAdminUser,
  shouldExcludeDraftOrders,
  shouldFilterOrdersBySalesAssignee,
  buildSalesVisibilityOr,
  buildExcludeDraftClause,
  applyOrderVisibilityFilter,
  applyOrderAccessFilter,
  appendOrderVisibilityAnd,
  applySalesVisibilityFilter,
  appendSalesVisibilityAnd,
  resolveWorkflowAssigneeUserId,
};
