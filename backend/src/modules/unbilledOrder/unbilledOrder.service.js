/**
 * @fileoverview Persist UnbilledOrder rows for true billing gaps
 * (approved qty > dispatched qty → unbilled / partially_billed).
 * Rows are written via create / Settle & Unbilled — no bulk sync.
 * @module modules/unbilledOrder/unbilledOrder.service
 */
const mongoose = require('mongoose');
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const {
  softDeleteActiveById,
  restoreSoftDeletedById,
  listDeletedLean,
} = require('../../utils/mongoSoftDelete');
const activityService = require('../activity/activity.service');
const {
  resolveOrderApprovalPending,
} = require('../orders/orderApprovalPending.util');
const {
  UNBILLED_ORDER_STATUS,
  SUBMITTED_DISPATCH_STATUSES,
  PIPELINE_STAGE,
  TRACKABLE_PIPELINE_STAGES,
  normalizeUnbilledOrderStatus,
} = require('./unbilledOrder.constants');

const UNBILLED_NF = 'Unbilled order not found';

const EXCLUDED_ORDER_STATUSES = new Set([
  'draft',
  'cancelled',
  'finance_rejected',
  'account_rejected',
  'on_hold',
]);

const POST_DISPATCH_SUBMIT_STATUSES = new Set([
  'dispatch_created',
  'transport_pending',
  'transport_assigned',
  'in_transit',
]);

function refId(value) {
  if (value == null) return '';
  if (typeof value === 'object') return String(value._id ?? value.id ?? '');
  return String(value);
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function approvalFieldRejected(value) {
  return String(value || '').toLowerCase() === 'rejected';
}

function isTruthyFlag(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

/**
 * Cancelled / rejected / draft / hold — never track as unbilled.
 * Also catches admin-rejected rows that still have status=submitted.
 */
function isExcludedFromUnbilled(order) {
  if (!order) return true;

  const status = String(order.status || '').toLowerCase();
  if (EXCLUDED_ORDER_STATUSES.has(status)) return true;

  const lifecycle = String(order.lifecycle_status || '').toLowerCase();
  const stage = String(order.workflow_stage || '').toLowerCase();
  if (lifecycle === 'cancelled' || stage === 'cancelled') return true;

  if (
    approvalFieldRejected(order.admin_approval_status)
    || approvalFieldRejected(order.finance_approval_status)
    || approvalFieldRejected(order.account_approval_status)
  ) {
    return true;
  }

  return false;
}

function excludedOrderMongoFilter() {
  return {
    deletedAt: null,
    status: { $nin: [...EXCLUDED_ORDER_STATUSES] },
    lifecycle_status: { $ne: 'cancelled' },
    workflow_stage: { $ne: 'cancelled' },
    admin_approval_status: { $ne: 'rejected' },
    finance_approval_status: { $ne: 'rejected' },
    account_approval_status: { $ne: 'rejected' },
  };
}

function unbilledQuery() {
  return getModels().UnbilledOrder.find()
    .populate(
      'order',
      'order_no order_date createdAt created_at status billing_status dispatch_status lifecycle_status workflow_stage '
        + 'admin_approval_status finance_approval_status account_approval_status grand_total order_items '
        + 'assigned_sales_user party',
    )
    .populate('party', 'party_name mobile email')
    .populate('customer', 'name')
    .populate('created_by', 'name username department')
    .populate('updated_by', 'name username department')
    .populate('resolved_by', 'name username department')
    .populate('unbilled_items.product', 'product_name sku');
}

/**
 * Qty on a dispatch batch that counts toward billed coverage.
 * Must be submitted (or transport_created) and have a bill_number.
 */
function billedDispatchQuantity(dispatch) {
  const status = String(dispatch?.dispatch_status || '').toLowerCase();
  if (!SUBMITTED_DISPATCH_STATUSES.includes(status)) return 0;
  if (!dispatch?.bill_number || !String(dispatch.bill_number).trim()) return 0;
  return (dispatch.dispatch_items || []).reduce(
    (sum, item) => sum + num(item.dispatched_quantity),
    0,
  );
}

/** Submitted / transport_created dispatch qty by order line (bill not required). */
function aggregateDispatchedByLine(dispatches) {
  const byLine = {};
  for (const dispatch of dispatches || []) {
    const status = String(dispatch?.dispatch_status || '').toLowerCase();
    if (!SUBMITTED_DISPATCH_STATUSES.includes(status)) continue;

    for (const item of dispatch.dispatch_items || []) {
      const key = String(item.order_item_id || '');
      if (!key) continue;
      byLine[key] = (byLine[key] || 0) + num(item.dispatched_quantity);
    }
  }
  return byLine;
}

async function orderHasDueSheet(orderId, models) {
  const { OrderDueSheet, OrderApproval } = models;
  const [sheet, approvalFlag] = await Promise.all([
    OrderDueSheet.exists({
      order: orderId,
      is_current: true,
      status: 'active',
      deletedAt: null,
    }),
    OrderApproval.exists({
      order: orderId,
      is_due_sheet_uploaded: true,
      deletedAt: null,
    }),
  ]);
  return Boolean(sheet || approvalFlag);
}

/**
 * Order header OR OrderDelivery says fulfillment finished.
 * Legacy rows often keep status=finance_approved after dispatch/delivery.
 */
async function orderFulfillmentComplete(order, dispatches = [], models = getModels()) {
  if (!order) return false;
  const orderStatus = String(order.status || '').toLowerCase();
  if (orderStatus === 'delivered' || orderStatus === 'closed' || order.closed_at) {
    return true;
  }
  const deliveryStatus = String(order.delivery_status || '').toLowerCase();
  const lifecycle = String(order.lifecycle_status || '').toLowerCase();
  if (deliveryStatus === 'completed' || lifecycle === 'fulfilled') return true;

  const { OrderDelivery } = models;
  if (!OrderDelivery) return false;

  const dispatchIds = (dispatches || [])
    .map((d) => d?._id)
    .filter(Boolean);

  const delivered = await OrderDelivery.exists({
    deletedAt: null,
    delivery_status: 'delivered',
    $or: [
      { order: order._id },
      ...(dispatchIds.length ? [{ dispatch: { $in: dispatchIds } }] : []),
    ],
  });
  return Boolean(delivered);
}

/** Approved line qty only — ordered/fallback is not an approval gap. */
function lineApprovedQuantity(line) {
  return num(line?.approved_quantity);
}

/**
 * Approved vs submitted/transport_created dispatch qty.
 * Remaining = max(0, approved − dispatched) per line.
 */
function computeApprovalDispatchGap(order, dispatches = []) {
  const dispatchedByLine = aggregateDispatchedByLine(dispatches);
  const items = [];
  let approvedTotal = 0;
  let dispatchedTotal = 0;

  for (const line of order.order_items || []) {
    const approved = lineApprovedQuantity(line);
    if (approved <= 0) continue;

    const lineId = String(line._id || '');
    const dispatched = Math.min(approved, dispatchedByLine[lineId] || 0);
    const remaining = Math.max(0, approved - dispatched);
    approvedTotal += approved;
    dispatchedTotal += dispatched;

    if (remaining <= 0) continue;
    items.push({
      order_item_id: line._id,
      product: line.product,
      product_name: line.product_name || '',
      sku: line.sku || '',
      approved_quantity: approved,
      billed_dispatched_quantity: dispatched,
      remaining_quantity: remaining,
    });
  }

  const remainingTotal = items.reduce((sum, row) => sum + row.remaining_quantity, 0);
  return { approvedTotal, dispatchedTotal, remainingTotal, items };
}

/**
 * Un Billed only when approved qty > dispatch qty.
 * - unbilled: gap with zero submitted dispatch
 * - partially_billed: gap with some submitted/transport_created dispatch
 * Approval / due-sheet / transport-pending queues are never tracked here.
 */
async function resolvePipelineStage(order, dispatches = [], models = getModels()) {
  if (!order) return PIPELINE_STAGE.CANCELLED;
  if (isExcludedFromUnbilled(order)) {
    const status = String(order.status || '').toLowerCase();
    if (
      status === 'finance_rejected'
      || status === 'account_rejected'
      || approvalFieldRejected(order.admin_approval_status)
      || approvalFieldRejected(order.finance_approval_status)
      || approvalFieldRejected(order.account_approval_status)
    ) {
      return PIPELINE_STAGE.REJECTED;
    }
    if (status === 'cancelled' || String(order.lifecycle_status || '').toLowerCase() === 'cancelled') {
      return PIPELINE_STAGE.CANCELLED;
    }
    return PIPELINE_STAGE.CANCELLED;
  }

  const orderStatus = String(order.status || '').toLowerCase();

  // In transit — out of Un Billed (per product rule).
  if (
    orderStatus === 'in_transit'
    || orderStatus === 'transport_assigned'
    || orderStatus === 'partially_transported'
    || orderStatus === 'fully_transported'
  ) {
    return PIPELINE_STAGE.RESOLVED;
  }

  const approvals = await models.OrderApproval.find({
    order: order._id,
    deletedAt: null,
  })
    .select(
      'is_admin_approved is_finance_approved is_account_approved rejection_reason rejected_by is_due_sheet_uploaded',
    )
    .lean();

  const pending = resolveOrderApprovalPending(approvals, order);
  // Admin / finance / account / due-sheet pending queues are out — only
  // approval>dispatch billing gaps after those clear.
  if (pending.admin || pending.finance || pending.account) {
    return PIPELINE_STAGE.RESOLVED;
  }

  const dueSheetUploaded =
    isTruthyFlag(order.due_sheet_uploaded)
    || isTruthyFlag(order.is_due_sheet_uploaded)
    || approvals.some((doc) => isTruthyFlag(doc.is_due_sheet_uploaded))
    || (await orderHasDueSheet(order._id, models));

  const pastDueSheetGate =
    dueSheetUploaded
    || isTruthyFlag(order.is_finance_approved)
    || ['approved', 'full', 'partial'].includes(
      String(order.finance_approval_status || '').toLowerCase(),
    )
    || [
      'finance_approved',
      'partially_finance_approved',
      'fully_finance_approved',
      'account_review',
      'account_approved',
      'partially_account_approved',
      'fully_account_approved',
      'dispatch',
      'dispatch_pending',
      ...POST_DISPATCH_SUBMIT_STATUSES,
      'delivered',
      'closed',
    ].includes(orderStatus);

  if (!pastDueSheetGate) {
    return PIPELINE_STAGE.RESOLVED;
  }

  // Membership is qty only: approved > submitted/transport_created dispatch.
  // Labels are Unbilled / Partially Billed — never Transport Pending.
  const { dispatchedTotal, remainingTotal } = computeApprovalDispatchGap(order, dispatches);
  if (remainingTotal <= 0) return PIPELINE_STAGE.RESOLVED;
  if (dispatchedTotal <= 0) return PIPELINE_STAGE.UNBILLED;
  return PIPELINE_STAGE.PARTIALLY_BILLED;
}

/**
 * Build rollup + line snapshots. Returns null when not eligible.
 * Only unbilled / partially_billed (approved > dispatched).
 */
function buildUnbilledSnapshot(order, dispatches = [], pipelineStage) {
  if (!order || isExcludedFromUnbilled(order)) return null;

  const status = String(order.status || '').toLowerCase();
  if (!status || status === 'draft') return null;

  if (!TRACKABLE_PIPELINE_STAGES.includes(pipelineStage)) return null;

  const { approvedTotal, dispatchedTotal, remainingTotal, items } =
    computeApprovalDispatchGap(order, dispatches);
  if (remainingTotal <= 0 || items.length === 0) return null;

  const billingStatus = String(order.billing_status || '').toLowerCase();
  const derivedBilling =
    pipelineStage === PIPELINE_STAGE.PARTIALLY_BILLED
      ? 'partially_billed'
      : 'unbilled';

  return {
    order: order._id,
    order_no: order.order_no || '',
    party: order.party || undefined,
    customer: order.customer || undefined,
    billing_status: ['unbilled', 'partially_billed', 'fully_billed'].includes(billingStatus)
      ? billingStatus
      : derivedBilling,
    status: UNBILLED_ORDER_STATUS.OPEN,
    pipeline_stage: pipelineStage,
    approved_quantity: approvedTotal,
    billed_dispatched_quantity: dispatchedTotal,
    remaining_quantity: remainingTotal,
    unbilled_items: items,
    last_synced_at: new Date(),
  };
}

async function loadOrderAndDispatches(orderId) {
  const { Order, OrderDispatch } = getModels();
  const order = await Order.findOne({ _id: orderId, deletedAt: null }).lean();
  if (!order) throw new ApiError(404, 'Order not found');

  const dispatches = await OrderDispatch.find({
    order: orderId,
    deletedAt: null,
    dispatch_status: { $nin: ['cancelled', 'draft'] },
  }).lean();

  return { order, dispatches };
}

async function list(query = {}) {
  const q = { deletedAt: null };

  if (query.order) q.order = query.order;
  if (query.party) q.party = query.party;
  if (query.status) q.status = normalizeUnbilledOrderStatus(query.status);
  else if (query.include_resolved !== 'true' && query.include_resolved !== true) {
    q.status = UNBILLED_ORDER_STATUS.OPEN;
  }
  if (query.billing_status) {
    const split = String(query.billing_status)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (split.length === 1) q.billing_status = split[0];
    else if (split.length > 1) q.billing_status = { $in: split };
  }
  if (query.search) {
    const term = String(query.search).trim();
    if (term) {
      q.order_no = { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    }
  }

  const rows = await unbilledQuery().find(q).sort({ remaining_quantity: -1, updatedAt: -1 }).lean();
  return rows.map(toPlain);
}

async function get(id) {
  const row = await unbilledQuery().findOne({ _id: id, deletedAt: null }).lean();
  if (!row) throw new ApiError(404, UNBILLED_NF);
  return toPlain(row);
}

async function getByOrder(orderId) {
  const row = await unbilledQuery()
    .findOne({ order: orderId, deletedAt: null })
    .lean();
  return row ? toPlain(row) : null;
}

/**
 * After Settle & Unbilled: write settled-away rest qty onto the UnbilledOrder row.
 */
async function applySettledRest(orderId, restItems = [], user = null, options = {}) {
  const { UnbilledOrder, Order } = getModels();
  if (!orderId || !mongoose.Types.ObjectId.isValid(String(orderId))) {
    throw new ApiError(400, 'Invalid order');
  }

  const normalized = (restItems || [])
    .map((item) => {
      const remaining = Math.max(0, num(item.remaining_quantity ?? item.approved_quantity));
      if (remaining <= 0) return null;
      const lineId = item.order_item_id;
      if (!lineId) return null;
      const productId = refId(item.product) || item.product;
      if (!productId) return null;
      return {
        order_item_id: lineId,
        product: productId,
        product_name: String(item.product_name || ''),
        sku: String(item.sku || ''),
        approved_quantity: remaining,
        billed_dispatched_quantity: 0,
        remaining_quantity: remaining,
      };
    })
    .filter(Boolean);

  if (normalized.length === 0) return getByOrder(orderId);

  const order = await Order.findOne({ _id: orderId, deletedAt: null }).lean();
  if (!order) throw new ApiError(404, 'Order not found');
  if (isExcludedFromUnbilled(order)) return null;

  const existing = await UnbilledOrder.findOne({ order: orderId, deletedAt: null });
  const byLine = new Map();

  if (existing && Array.isArray(existing.unbilled_items)) {
    for (const row of existing.unbilled_items) {
      const key = String(row.order_item_id || '');
      if (!key || num(row.remaining_quantity) <= 0) continue;
      byLine.set(key, {
        order_item_id: row.order_item_id,
        product: row.product,
        product_name: row.product_name || '',
        sku: row.sku || '',
        approved_quantity: num(row.approved_quantity),
        billed_dispatched_quantity: num(row.billed_dispatched_quantity),
        remaining_quantity: num(row.remaining_quantity),
      });
    }
  }

  for (const item of normalized) {
    const key = String(item.order_item_id);
    const prev = byLine.get(key);
    if (prev) {
      const nextRemaining = num(prev.remaining_quantity) + num(item.remaining_quantity);
      byLine.set(key, {
        ...prev,
        product: item.product || prev.product,
        product_name: item.product_name || prev.product_name,
        sku: item.sku || prev.sku,
        approved_quantity: nextRemaining,
        remaining_quantity: nextRemaining,
      });
    } else {
      byLine.set(key, item);
    }
  }

  const items = [...byLine.values()].filter((row) => num(row.remaining_quantity) > 0);
  const remainingTotal = items.reduce((sum, row) => sum + num(row.remaining_quantity), 0);
  const approvedTotal = items.reduce((sum, row) => sum + num(row.approved_quantity), 0);
  const billedTotal = items.reduce((sum, row) => sum + num(row.billed_dispatched_quantity), 0);
  const billingStatus = String(order.billing_status || 'unbilled').toLowerCase();

  const payload = {
    order_no: order.order_no || '',
    party: order.party || undefined,
    customer: order.customer || undefined,
    billing_status: ['unbilled', 'partially_billed', 'fully_billed'].includes(billingStatus)
      ? billingStatus
      : 'unbilled',
    status: UNBILLED_ORDER_STATUS.OPEN,
    pipeline_stage: billingStatus === 'partially_billed'
      ? PIPELINE_STAGE.PARTIALLY_BILLED
      : PIPELINE_STAGE.UNBILLED,
    manual_remaining: true,
    approved_quantity: approvedTotal,
    billed_dispatched_quantity: billedTotal,
    remaining_quantity: remainingTotal,
    unbilled_items: items,
    last_synced_at: new Date(),
    remarks: options.remarks || 'Settled rest from partial dispatch release',
  };

  if (existing) {
    existing.order_no = payload.order_no;
    existing.party = payload.party;
    existing.customer = payload.customer;
    existing.billing_status = payload.billing_status;
    existing.status = payload.status;
    existing.pipeline_stage = payload.pipeline_stage;
    existing.manual_remaining = true;
    existing.approved_quantity = payload.approved_quantity;
    existing.billed_dispatched_quantity = payload.billed_dispatched_quantity;
    existing.remaining_quantity = payload.remaining_quantity;
    existing.unbilled_items = payload.unbilled_items;
    existing.last_synced_at = payload.last_synced_at;
    existing.remarks = payload.remarks;
    existing.resolved_at = undefined;
    existing.resolved_by = undefined;
    if (user?._id) existing.updated_by = user._id;
    await existing.save();
    return get(existing._id);
  }

  const created = await UnbilledOrder.create({
    order: orderId,
    ...payload,
    created_by: user?._id,
    updated_by: user?._id,
  });
  return get(created._id);
}

/** Open / refresh an UnbilledOrder row for one eligible order (manual API). */
async function create(body, user) {
  const { UnbilledOrder } = getModels();
  const orderId = body.order;
  if (!orderId || !mongoose.Types.ObjectId.isValid(String(orderId))) {
    throw new ApiError(400, 'Invalid order');
  }

  const models = getModels();
  const { order, dispatches } = await loadOrderAndDispatches(orderId);
  const pipelineStage = await resolvePipelineStage(order, dispatches, models);
  const snapshot = buildUnbilledSnapshot(order, dispatches, pipelineStage);
  if (!snapshot) {
    throw new ApiError(400, 'Order is not eligible for unbilled tracking (need approved qty greater than dispatched qty)');
  }

  const existing = await UnbilledOrder.findOne({ order: orderId, deletedAt: null });
  if (
    existing
    && existing.manual_resolved
    && existing.status === UNBILLED_ORDER_STATUS.RESOLVED
  ) {
    throw new ApiError(400, 'Unbilled tracking for this order was manually resolved');
  }

  if (existing) {
    existing.order_no = snapshot.order_no;
    existing.party = snapshot.party;
    existing.customer = snapshot.customer;
    existing.billing_status = snapshot.billing_status;
    existing.status = UNBILLED_ORDER_STATUS.OPEN;
    existing.pipeline_stage = snapshot.pipeline_stage;
    existing.manual_remaining = Boolean(existing.manual_remaining);
    existing.approved_quantity = snapshot.approved_quantity;
    existing.billed_dispatched_quantity = snapshot.billed_dispatched_quantity;
    existing.remaining_quantity = snapshot.remaining_quantity;
    existing.unbilled_items = snapshot.unbilled_items;
    existing.last_synced_at = snapshot.last_synced_at;
    existing.resolved_at = undefined;
    existing.resolved_by = undefined;
    if (body.remarks !== undefined) existing.remarks = String(body.remarks || '').trim();
    if (user?._id) existing.updated_by = user._id;
    await existing.save();
    return get(existing._id);
  }

  const created = await UnbilledOrder.create({
    ...snapshot,
    manual_remaining: false,
    remarks: body.remarks != null ? String(body.remarks || '').trim() : undefined,
    created_by: user?._id,
    updated_by: user?._id,
  });

  if (user?._id) {
    try {
      await activityService.create({
        actor: user._id,
        entity_type: 'order',
        entity_id: orderId,
        action: 'updated',
        message: `Unbilled order tracking opened (${snapshot.remaining_quantity} qty remaining)`,
      });
    } catch (_err) {
      // Activity is best-effort.
    }
  }

  return get(created._id);
}

async function patch(id, body, user) {
  const { UnbilledOrder } = getModels();
  const doc = await UnbilledOrder.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, UNBILLED_NF);

  if (body.replacement_order != null && body.replacement_order !== '') {
    if (!mongoose.Types.ObjectId.isValid(String(body.replacement_order))) {
      throw new ApiError(400, 'Invalid replacement_order');
    }
    doc.replacement_order = body.replacement_order;
    doc.manual_resolved = true;
    doc.manual_remaining = false;
    doc.status = UNBILLED_ORDER_STATUS.RESOLVED;
    doc.pipeline_stage = PIPELINE_STAGE.RESOLVED;
    doc.resolved_at = new Date();
    if (user?._id) doc.resolved_by = user._id;
  } else if (body.status != null && body.status !== '') {
    const next = normalizeUnbilledOrderStatus(body.status);
    doc.status = next;
    if (next === UNBILLED_ORDER_STATUS.RESOLVED || next === UNBILLED_ORDER_STATUS.CANCELLED) {
      doc.resolved_at = new Date();
      if (user?._id) doc.resolved_by = user._id;
      if (next === UNBILLED_ORDER_STATUS.RESOLVED && body.manual_resolved === true) {
        doc.manual_resolved = true;
        doc.manual_remaining = false;
        doc.pipeline_stage = PIPELINE_STAGE.RESOLVED;
      }
    } else {
      doc.resolved_at = undefined;
      doc.resolved_by = undefined;
      doc.manual_resolved = false;
      doc.replacement_order = undefined;
    }
  }
  if (body.remarks !== undefined) {
    doc.remarks = String(body.remarks || '').trim();
  }
  if (user?._id) doc.updated_by = user._id;
  await doc.save();
  return get(doc._id);
}

async function listDeleted(query = {}) {
  const q = {};
  if (query.order) q.order = query.order;
  const rows = await listDeletedLean(getModels().UnbilledOrder, q);
  return rows.map(toPlain);
}

async function softDelete(id, user) {
  const doc = await softDeleteActiveById(getModels().UnbilledOrder, id, {
    notFoundMessage: UNBILLED_NF,
  });
  if (user?._id) {
    doc.updated_by = user._id;
    await doc.save();
  }
  return toPlain(doc.toObject());
}

async function restore(id, user) {
  const doc = await restoreSoftDeletedById(getModels().UnbilledOrder, id, {
    notFoundMessage: UNBILLED_NF,
  });
  if (user?._id) {
    doc.updated_by = user._id;
    await doc.save();
  }
  return toPlain(doc.toObject());
}

module.exports = {
  list,
  get,
  getByOrder,
  create,
  patch,
  applySettledRest,
  listDeleted,
  softDelete,
  restore,
  buildUnbilledSnapshot,
  billedDispatchQuantity,
  isExcludedFromUnbilled,
  resolvePipelineStage,
};
