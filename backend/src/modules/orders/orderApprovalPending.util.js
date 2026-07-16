/**
 * @fileoverview Resolve admin/finance/account pending approval from OrderApproval batches.
 * @module modules/orders/orderApprovalPending.util
 */
const mongoose = require('mongoose');
const { ORDER_STATUS, ORDER_WORKFLOW_STAGE, APPROVAL_STATUS } = require('./order.constants');

const PENDING_APPROVAL_STAGES = Object.freeze({
  ADMIN: 'admin',
  FINANCE: 'finance',
  ACCOUNT: 'account',
});

const ADMIN_PENDING_STATUS_ALIASES = new Set([
  'pending_review',
  'admin_pending',
  'admin_pending_approval',
]);

const FINANCE_PENDING_STATUS_ALIASES = new Set([
  'pending_finance_review',
  'finance_pending',
  'finance_pending_approval',
]);

const ACCOUNT_PENDING_STATUS_ALIASES = new Set([
  'pending_account_review',
  'account_pending',
  'account_pending_approval',
]);

function normalizePendingStage(value) {
  const raw = String(value || '').toLowerCase();
  if (ADMIN_PENDING_STATUS_ALIASES.has(raw)) return PENDING_APPROVAL_STAGES.ADMIN;
  if (FINANCE_PENDING_STATUS_ALIASES.has(raw)) return PENDING_APPROVAL_STAGES.FINANCE;
  if (ACCOUNT_PENDING_STATUS_ALIASES.has(raw)) return PENDING_APPROVAL_STAGES.ACCOUNT;
  if (raw === PENDING_APPROVAL_STAGES.ADMIN) return PENDING_APPROVAL_STAGES.ADMIN;
  if (raw === PENDING_APPROVAL_STAGES.FINANCE) return PENDING_APPROVAL_STAGES.FINANCE;
  if (raw === PENDING_APPROVAL_STAGES.ACCOUNT) return PENDING_APPROVAL_STAGES.ACCOUNT;
  return null;
}

function isApprovalRejected(doc) {
  return Boolean(doc?.rejected_by || doc?.rejection_reason);
}

function buildApprovalPendingQuery(stage) {
  const q = { deletedAt: null };
  if (stage === PENDING_APPROVAL_STAGES.ADMIN) {
    q.is_admin_approved = false;
    return q;
  }
  if (stage === PENDING_APPROVAL_STAGES.FINANCE) {
    q.is_finance_approved = false;
    return q;
  }
  if (stage === PENDING_APPROVAL_STAGES.ACCOUNT) {
    q.is_account_approved = false;
    return q;
  }
  return null;
}

async function findOrderIdsWithPendingApproval(stage, models) {
  const pendingStage = normalizePendingStage(stage);
  if (!pendingStage) return [];

  const { Order, OrderApproval } = models;
  const approvalQuery = buildApprovalPendingQuery(pendingStage);
  const fromApprovals = await OrderApproval.distinct('order', approvalQuery);

  if (pendingStage !== PENDING_APPROVAL_STAGES.ADMIN) {
    return fromApprovals.map((id) => String(id));
  }

  const submittedIds = await Order.distinct('_id', {
    deletedAt: null,
    status: ORDER_STATUS.SUBMITTED,
    $or: [
      { workflow_stage: ORDER_WORKFLOW_STAGE.ADMIN_REVIEW },
      { workflow_stage: ORDER_WORKFLOW_STAGE.SALES },
      { admin_approval_status: APPROVAL_STATUS.PENDING },
    ],
  });

  const merged = new Set([
    ...fromApprovals.map((id) => String(id)),
    ...submittedIds.map((id) => String(id)),
  ]);
  return [...merged];
}

async function findOrderIdsWithAnyPendingApproval(models) {
  const stages = [
    PENDING_APPROVAL_STAGES.ADMIN,
    PENDING_APPROVAL_STAGES.FINANCE,
    PENDING_APPROVAL_STAGES.ACCOUNT,
  ];
  const idSets = await Promise.all(
    stages.map((stage) => findOrderIdsWithPendingApproval(stage, models)),
  );
  return [...new Set(idSets.flat())];
}

function isAnyPendingApprovalStatus(value) {
  const raw = String(value || '').toLowerCase();
  return raw === 'pending_approval' || raw === 'pending_approvals';
}

function resolveOrderApprovalPending(approvalDocs = [], order = {}) {
  const active = (approvalDocs || []).filter((doc) => !isApprovalRejected(doc));

  const adminPendingFromApprovals = active.some((doc) => !doc.is_admin_approved);
  const financePending = active.some((doc) => !doc.is_finance_approved);
  const accountPending = active.some((doc) => !doc.is_account_approved);

  const status = String(order.status || '');
  const adminApprovalStatus = String(order.admin_approval_status || APPROVAL_STATUS.PENDING);
  const adminPendingFromOrder =
    status === ORDER_STATUS.SUBMITTED
    || adminApprovalStatus === APPROVAL_STATUS.PENDING
    || adminApprovalStatus === APPROVAL_STATUS.PARTIAL;

  const adminPending = (adminPendingFromApprovals || adminPendingFromOrder) && status === ORDER_STATUS.SUBMITTED;

  let stage = null;
  if (adminPending) stage = PENDING_APPROVAL_STAGES.ADMIN;
  else if (financePending) stage = PENDING_APPROVAL_STAGES.FINANCE;
  else if (accountPending) stage = PENDING_APPROVAL_STAGES.ACCOUNT;

  return {
    admin: adminPending,
    finance: financePending,
    account: accountPending,
    stage,
  };
}

async function enrichOrdersWithApprovalPending(rows, models) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const orderIds = rows
    .map((row) => row?._id)
    .filter((id) => id && mongoose.Types.ObjectId.isValid(String(id)));

  if (orderIds.length === 0) {
    return rows.map((row) => ({
      ...row,
      approval_pending: resolveOrderApprovalPending([], row),
    }));
  }

  const approvals = await models.OrderApproval.find({
    order: { $in: orderIds },
    deletedAt: null,
  })
    .select('order is_admin_approved is_finance_approved is_account_approved rejection_reason rejected_by')
    .lean();

  const byOrder = new Map();
  for (const doc of approvals) {
    const key = String(doc.order);
    const list = byOrder.get(key) || [];
    list.push(doc);
    byOrder.set(key, list);
  }

  return rows.map((row) => ({
    ...row,
    approval_pending: resolveOrderApprovalPending(byOrder.get(String(row._id)) || [], row),
  }));
}

async function enrichOrdersWithDueSheetStatus(rows, models) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const orderIds = rows
    .map((row) => row?._id)
    .filter((id) => id && mongoose.Types.ObjectId.isValid(String(id)));

  if (orderIds.length === 0) {
    return rows.map((row) => ({
      ...row,
      due_sheet_uploaded: false,
    }));
  }

  const activeDueSheets = await models.OrderDueSheet.find({
    order: { $in: orderIds },
    is_current: true,
    status: 'active',
    deletedAt: null,
  })
    .select('order')
    .lean();

  const uploadedOrderIds = new Set(activeDueSheets.map((ds) => String(ds.order)));

  return rows.map((row) => ({
    ...row,
    due_sheet_uploaded: uploadedOrderIds.has(String(row._id)),
  }));
}

async function enrichOrdersWithFlagStatus(rows, models) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const orderIds = rows
    .map((row) => row?._id)
    .filter((id) => id && mongoose.Types.ObjectId.isValid(String(id)));

  if (orderIds.length === 0) {
    return rows.map((row) => ({
      ...row,
      flag_status: 'none',
    }));
  }

  const flags = await models.OrderFlag.find({
    order: { $in: orderIds },
  })
    .select('order status')
    .lean();

  const flagsByOrder = new Map();
  for (const flag of flags) {
    const key = String(flag.order);
    const list = flagsByOrder.get(key) || [];
    list.push(flag);
    flagsByOrder.set(key, list);
  }

  return rows.map((row) => {
    const orderFlags = flagsByOrder.get(String(row._id)) || [];
    let flag_status = 'none';
    if (orderFlags.length > 0) {
      const hasUnresolved = orderFlags.some(
        (f) => f.status === 'open' || f.status === 'in_progress'
      );
      flag_status = hasUnresolved ? 'unresolved' : 'resolved';
    }
    return {
      ...row,
      flag_status,
    };
  });
}

module.exports = {
  PENDING_APPROVAL_STAGES,
  ADMIN_PENDING_STATUS_ALIASES,
  FINANCE_PENDING_STATUS_ALIASES,
  ACCOUNT_PENDING_STATUS_ALIASES,
  normalizePendingStage,
  buildApprovalPendingQuery,
  findOrderIdsWithPendingApproval,
  findOrderIdsWithAnyPendingApproval,
  isAnyPendingApprovalStatus,
  resolveOrderApprovalPending,
  enrichOrdersWithApprovalPending,
  enrichOrdersWithDueSheetStatus,
  enrichOrdersWithFlagStatus,
};


