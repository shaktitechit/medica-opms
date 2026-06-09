/**
 * @fileoverview Order CRUD, commercial recalculation, status transitions (via workflow), and soft-delete lifecycle.
 * @module modules/orders/order.service
 *
 * PATCH must not change `status` or other workflow-managed fields — use `POST .../transition` only.
 */
const mongoose = require('mongoose');
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const { generateOrderNo } = require('../../utils/generateOrderNo');
const { softDeleteActiveById, restoreSoftDeletedById, listDeletedLean } = require('../../utils/mongoSoftDelete');
const workflowService = require('../workflow/workflow.service');
const policy = require('./order.policy');
const activityService = require('../activity/activity.service');
const { ORDER_STATUS } = require('../../constants/domain');
const { ORDER_STATUS_VALUES } = require('../../constants/orderStatus');
const { syncPartyProductLastRatesFromOrder } = require('../../services/opms/partyProductLastRateSync');
const partyProductService = require('../partyProducts/partyProduct.service');
const partyOrderProductsRateService = require('../partyOrderProductsRate/partyOrderProductsRate.service');
const fulfillmentService = require('./orderFulfillment.service');

/**
 * PATCH may only contain these plain fields. Everything else must go through `/transition`.
 * Blocks Mongo operators like `{ "$set": { status: … } }` (spread + doc.set bypassed blacklist).
 */
const PAYMENT_STATUS_VALUES = new Set(['unpaid', 'partial', 'paid']);

const ORDER_PATCH_KEYS = new Set([
  'party',
  'order_date',
  'payment_status',
  'notes',
  'order_items',
  'discount_amount',
  'priority',
  'expected_delivery_date',
  'remarks',
  'assigned_sales_user',
  'assigned_finance_user',
  'assigned_dispatch_user',
  'assigned_admin_user',
]);

function assertSafePlainPatch(patch) {
  if (patch === null || patch === undefined) return;
  if (typeof patch !== 'object' || Array.isArray(patch)) {
    throw new ApiError(400, 'PATCH body must be a JSON object');
  }
  for (const key of Object.keys(patch)) {
    if (key.includes('$') || key.includes('.')) {
      throw new ApiError(
        400,
        `Invalid PATCH key "${key}". Mongo-style operators are not allowed; use POST /api/orders/:id/transition for status changes.`
      );
    }
    if (!ORDER_PATCH_KEYS.has(key)) {
      throw new ApiError(
        400,
        `Unsupported PATCH field "${key}". Allowed: ${[...ORDER_PATCH_KEYS].sort().join(', ')}. Use POST /api/orders/:id/transition for lifecycle (status).`
      );
    }
  }
}

/**
 * Apply only allowlisted PATCH fields to a live Mongoose document (never touch `status` / operators).
 */
function applyWhitelistedPatchToMongooseDoc(doc, patch) {
  if (patch.party !== undefined) doc.set('party', patch.party || null);
  if (patch.order_date !== undefined)
    doc.set('order_date', patch.order_date ? new Date(patch.order_date) : new Date());
  if (patch.payment_status !== undefined) doc.set('payment_status', patch.payment_status);
  if (patch.notes !== undefined) doc.set('notes', patch.notes);
  if (patch.discount_amount !== undefined) doc.set('discount_amount', Number(patch.discount_amount));
  if (patch.priority !== undefined) doc.set('priority', patch.priority);
  if (patch.expected_delivery_date !== undefined) {
    doc.set('expected_delivery_date', patch.expected_delivery_date ? new Date(patch.expected_delivery_date) : null);
  }
  if (patch.remarks !== undefined) doc.set('remarks', patch.remarks);
  if (patch.assigned_sales_user !== undefined) doc.set('assigned_sales_user', patch.assigned_sales_user);
  if (patch.assigned_finance_user !== undefined) doc.set('assigned_finance_user', patch.assigned_finance_user);
  if (patch.assigned_dispatch_user !== undefined) doc.set('assigned_dispatch_user', patch.assigned_dispatch_user);
  if (patch.assigned_admin_user !== undefined) doc.set('assigned_admin_user', patch.assigned_admin_user);
  if (patch.order_items !== undefined) {
    doc.set('order_items', normalizeItems(patch.order_items));
    doc.markModified('order_items');
  }
}

/**
 * Recompute monetary fields from `order.order_items` and header `discount_amount`.
 * Business rule: line taxable base = qty * unit_price − line discount; GST = taxable * gst_percent/100;
 * grand total = subtotal + gst − header discount; then derives payment_status / balance from paid_amount.
 * Mutates line objects and header totals in-place.
 *
 * @param {object} order
 * @returns {object} Same order reference for chaining.
 */

function recalcCommercials(order) {
  let subtotal = 0;
  let gstAmount = 0;
  const isPostFinance = ['dispatch_review', 'dispatch_execution', 'completed'].includes(order.workflow_stage);

  for (const item of order.order_items || []) {
    const q = isPostFinance ? Number(item.approved_quantity ?? 0) : Number(item.ordered_quantity ?? item.quantity ?? 0);
    const lineGross = q * item.unit_price;
    let disc = Number(item.discount_amount || 0);
    const dp = Number(item.discount_percent || 0);
    if (dp > 0) {
      disc = (lineGross * dp) / 100;
      item.discount_amount = disc;
    }
    const taxable = Math.max(0, lineGross - disc);
    const gst = (taxable * (item.gst_percent ?? 0)) / 100;
    item.taxable_amount = taxable;
    item.gst_amount = gst;
    item.total_amount = taxable + gst;
    subtotal += taxable;
    gstAmount += gst;
  }
  order.subtotal = subtotal;
  order.gst_amount = gstAmount;
  order.grand_total = subtotal + gstAmount - (order.discount_amount || 0);
  return order;
}

/**
 * Map API line payloads into mongoose subdocuments with normalized numbers.
 * Preserves `_id` when patching existing lines so updates do not blindly replace embedded doc ids.
 */
function normalizeItems(items) {
  return (items || []).map((line) => {
    const orderedQuantity = Number(line.ordered_quantity ?? line.quantity);
    const o = {
      product: line.product,
      product_name: line.product_name,
      sku: line.sku || '',
      brand: line.brand || '',
      manufacturer: line.manufacturer || '',
      product_group: line.product_group || '',
      product_subgroup: line.product_subgroup || '',
      unit: line.unit || '',
      hsn_code: line.hsn_code || '',
      gst_percent: Number(line.gst_percent ?? 0),
      ordered_quantity: orderedQuantity,
      approved_quantity: Number(line.approved_quantity || 0),
      free_quantity: Number(line.free_quantity ?? line.free_qty ?? 0),
      allocated_quantity: Number(line.allocated_quantity || 0),
      dispatched_quantity: Number(line.dispatched_quantity || 0),
      delivered_quantity: Number(line.delivered_quantity || 0),
      cancelled_quantity: Number(line.cancelled_quantity || 0),
      unit_price: Number(line.unit_price),
      applied_rate_type: line.applied_rate_type || 'MANUAL',
      pricing_reference: line.pricing_reference || undefined,
      pricing_validity_start: line.pricing_validity_start ? new Date(line.pricing_validity_start) : undefined,
      pricing_validity_end: line.pricing_validity_end ? new Date(line.pricing_validity_end) : undefined,
      manual_price_override: line.manual_price_override === true,
      approval_required: line.approval_required === true,
      approval_reason: line.approval_reason || '',
      approved_by: line.approved_by || undefined,
      approved_at: line.approved_at ? new Date(line.approved_at) : undefined,
      discount_percent: Number(line.discount_percent || 0),
      discount_amount: Number(line.discount_amount || 0),
      taxable_amount: 0,
      gst_amount: 0,
      total_amount: 0,
      line_status: line.line_status || 'draft',
      remarks: line.remarks || '',
    };
    if (line._id && mongoose.Types.ObjectId.isValid(String(line._id))) {
      o._id = line._id;
    }
    return o;
  });
}

/** @param {unknown} raw Express query `exclude_status` (comma-separated workflow statuses). */
function parseExcludeStatuses(raw) {
  if (raw == null || raw === '') return [];
  const s = Array.isArray(raw) ? raw.join(',') : String(raw);
  const parts = s.split(',').map((x) => x.trim()).filter(Boolean);
  const allowed = new Set(ORDER_STATUS_VALUES);
  const out = [];
  for (const p of parts) {
    if (!allowed.has(p)) {
      throw new ApiError(400, `Invalid exclude_status token "${p}"`);
    }
    out.push(p);
  }
  return out;
}

/** Restrict visibility to assigned users or the creator. */
function applyVisibilityFilter(q, user) {
  if (!user) return;
  if (user.department === 'super_admin') return;
  q.$or = [
    { created_by: user._id },
    { assigned_sales_user: user._id },
    { assigned_finance_user: user._id },
    { assigned_dispatch_user: user._id },
    { assigned_admin_user: user._id },
  ];
}

/** Active orders only (no trash filter here). Optional filters: status, exclude_status ($nin), customer, or party ObjectId. */
async function list(query = {}, user) {
  const q = {};
  const { status, customer, party, exclude_status, search, priority } = query;

  if (status) {
    const s = String(status).toLowerCase();
    if (s === 'pending_review') {
      q.$or = [{ workflow_stage: 'admin_review' }, { status: 'submitted' }];
    } else if (s === 'rejected') {
      q.$or = [{ finance_approval_status: 'rejected' }, { status: 'finance_rejected' }];
    } else if (s === 'closed') {
      q.$or = [
        { delivery_status: 'completed' },
        { lifecycle_status: 'fulfilled' },
        { status: 'delivered' },
        { workflow_stage: 'completed' }
      ];
    } else if (s === 'open') {
      q.status = { $nin: ['draft', 'cancelled', 'finance_rejected', 'submitted', 'on_hold', 'delivered'] };
      q.workflow_stage = { $nin: ['admin_review', 'completed'] };
      q.delivery_status = { $ne: 'completed' };
      q.lifecycle_status = { $ne: 'fulfilled' };
      q.finance_approval_status = { $ne: 'rejected' };
    } else if (s === 'draft' || s === 'submitted' || s === 'sales_approved' || s === 'finance_review' || s === 'cancelled' || s === 'on_hold') {
      q.status = status;
    } else if (s === 'dispatch_review') {
      q.workflow_stage = 'dispatch_review';
    } else if (s === 'partially_finance_approved') {
      q.finance_approval_status = 'partial';
    } else if (s === 'fully_finance_approved') {
      q.finance_approval_status = 'full';
    } else if (s === 'finance_rejected') {
      q.finance_approval_status = 'rejected';
    } else if (s === 'dispatch_pending') {
      q.dispatch_status = 'pending';
    } else if (s === 'partial_dispatch_created' || s === 'partially_dispatched') {
      q.dispatch_status = 'partial';
    } else if (s === 'full_dispatch_created' || s === 'fully_dispatched') {
      q.dispatch_status = 'completed';
    } else if (s === 'partially_transported' || s === 'partially_delivered') {
      q.delivery_status = 'partial';
    } else if (s === 'fully_transported' || s === 'fully_delivered' || s === 'delivered') {
      q.delivery_status = 'completed';
    } else {
      q.status = status;
    }
  } else {
    const excluded = parseExcludeStatuses(exclude_status);
    if (excluded.length) q.status = { $nin: excluded };
  }
  if (customer) q.customer = customer;
  if (party) q.party = party;

  if (priority && priority !== 'all') {
    q.priority = String(priority).toLowerCase();
  }

  const visibilityOr = [];
  if (user && user.department !== 'super_admin') {
    visibilityOr.push(
      { created_by: user._id },
      { assigned_sales_user: user._id },
      { assigned_finance_user: user._id },
      { assigned_dispatch_user: user._id },
      { assigned_admin_user: user._id }
    );
  }

  const andConditions = [];
  if (visibilityOr.length > 0) {
    andConditions.push({ $or: visibilityOr });
  }

  if (search && String(search).trim()) {
    const searchRegex = new RegExp(String(search).trim(), 'i');
    const PartyModel = getModels().Party;
    const matchingParties = await PartyModel.find({
      party_name: searchRegex
    }).select('_id').lean();
    const partyIds = matchingParties.map(p => p._id);

    andConditions.push({
      $or: [
        { order_no: searchRegex },
        { order_number: searchRegex },
        { party: { $in: partyIds } }
      ]
    });
  }

  if (andConditions.length > 0) {
    q.$and = andConditions;
  }

  const paginate = query.paginate === 'true';
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.max(Number(query.limit) || 10, 1);
  const skip = (page - 1) * limit;

  if (paginate) {
    const [total, rows] = await Promise.all([
      getModels().Order.countDocuments(q),
      getModels().Order.find(q)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      data: rows.map((r) => toPlain(r)),
    };
  }

  const rows = await getModels().Order.find(q).sort({ createdAt: -1 }).lean();
  return rows.map((r) => toPlain(r));
}

async function getById(id, user) {
  const q = { _id: id };
  applyVisibilityFilter(q, user);
  const row = await getModels().Order.findOne(q).lean();
  if (!row) throw new ApiError(404, 'Order not found');
  return toPlain(row);
}

async function resolveNegotiatedRates(orderItems, partyId) {
  const { resolveRateForPartyProduct } = require('../partyOrderProductsRate/partyOrderProductsRate.service');
  for (const item of orderItems) {
    if (!item.product) continue;
    const appliedRateType = item.applied_rate_type || 'SR';
    const rateInfo = await resolveRateForPartyProduct(
      partyId,
      item.product,
      appliedRateType,
    );
    if (rateInfo.hasRate && rateInfo.rateId) {
      item.unit_price = rateInfo.currentMappedRate;
      item.pricing_reference = rateInfo.rateId;
      item.pricing_validity_start = rateInfo.validityStart;
      item.pricing_validity_end = rateInfo.validityEnd;
      item.manual_price_override = false;
    } else {
      item.unit_price = 0;
      item.pricing_reference = undefined;
      item.pricing_validity_start = undefined;
      item.pricing_validity_end = undefined;
      item.manual_price_override = false;
    }
  }
}

/**
 * Draft creation: assigns order number, default sales owner, clears payment/dispatch KPI fields.
 * Caller must satisfy pricing-edit policy (only meaningful while status is draft for new orders).
 */
async function create(body, user) {
  policy.assertMayEditOrderPricing(user, { status: ORDER_STATUS.DRAFT });
  if (!body.party) throw new ApiError(400, 'party is required');

  const partyOk = await getModels().Party.exists({ _id: body.party, deletedAt: null });
  if (!partyOk) throw new ApiError(400, 'Party not found');

  const order_items = normalizeItems(body.order_items);
  if (order_items.length === 0) throw new ApiError(400, 'order_items required');

  if (!['admin', 'super_admin'].includes(user.department)) {
    await resolveNegotiatedRates(order_items, body.party);
  }

  const paymentStatus = body.payment_status ?? 'unpaid';
  if (!PAYMENT_STATUS_VALUES.has(paymentStatus)) throw new ApiError(400, 'Invalid payment_status');

  let payload = {
    order_no: generateOrderNo(),
    party: body.party,
    order_date: body.order_date ? new Date(body.order_date) : new Date(),
    payment_status: paymentStatus,
    internal_notes: body.notes != null ? String(body.notes) : '',
    order_items,
    discount_amount: Number(body.discount_amount || 0),
    priority: body.priority || 'normal',
    expected_delivery_date: body.expected_delivery_date ? new Date(body.expected_delivery_date) : null,
    assigned_sales_user: body.assigned_sales_user || user._id,
    assigned_admin_user: body.assigned_admin_user || undefined,
    assigned_finance_user: body.assigned_finance_user || undefined,
    assigned_dispatch_user: body.assigned_dispatch_user || undefined,
    current_assignee: body.assigned_sales_user || user._id,
    current_department: 'sales',
    pending_with_role: 'sales',
    lifecycle_status: 'draft',
    status: 'draft',
    workflow_stage: 'sales',
    current_action: 'drafted',
    current_revision: 1,
    dispatch_status: 'pending',
    allocation_status: 'pending',
    delivery_status: 'pending',
    finance_approval_status: 'pending',
    remarks: body.remarks || '',
    created_by: user._id,
    updated_by: user._id,
    has_open_flags: false,
    open_flag_count: 0,
    highest_flag_severity: 'none',
  };

  recalcCommercials(payload);

  const doc = await getModels().Order.create(payload);
  const plain = toPlain(doc.toObject());

  await syncPartyProductLastRatesFromOrder(getModels, plain);
  await activityService.create({
    actor: user._id,
    entity_type: 'order',
    entity_id: plain._id,
    action: 'created',
    message: `Order ${plain.order_no} drafted`,
    new_value: { order_no: plain.order_no },
  });
  return plain;
}

/**
 * Partial patch: merges header fields and optionally replaces line items.
 * Business rules:
 * - Dispatch users cannot change commercial fields (see policy).
 * - Line items, header discount, and party change require sales or admin AND pricing must still be editable
 *   (blocked after finance approval per workflow.rules / policy).
 * - Workflow fields (`status`, `dispatch_status`, `paid_amount`, flag rollups) are snapshotted before edits
 *   and written back after recalc — `doc.set(wholePlainObject)` is not used (avoids Mongoose merge quirks / bypass).
 */
async function update(id, patch, user) {
  const p =
    patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
  assertSafePlainPatch(p);

  const q = { _id: id };
  applyVisibilityFilter(q, user);
  const doc = await getModels().Order.findOne(q);
  if (!doc) throw new ApiError(404, 'Order not found');

  const order = toPlain(doc.toObject());
  policy.assertDispatchMayNotChangeCommercials(user, p);

  if (p.order_items) {
    if (!['sales', 'admin', 'super_admin', 'finance'].includes(user.department)) {
      throw new ApiError(403, 'Only sales, admin, super_admin, or finance may edit order line items');
    }
    policy.assertMayEditOrderPricing(user, order);
  }

  if (p.discount_amount !== undefined) {
    policy.assertMayEditOrderPricing(user, order);
  }

  if (p.party !== undefined && String(p.party || '') !== String(order.party || '')) {
    if (!['sales', 'admin', 'super_admin'].includes(user.department)) {
      throw new ApiError(403, 'Only sales or admin may change party on an order');
    }
    policy.assertMayEditOrderPricing(user, order);
    if (p.party) {
      const partyOk = await getModels().Party.exists({ _id: p.party, deletedAt: null });
      if (!partyOk) throw new ApiError(400, 'Party not found');
    }
  }

  if (p.payment_status !== undefined) {
    if (user.department === 'sales') policy.assertMayEditOrderPricing(user, order);
    if (!['sales', 'admin', 'super_admin', 'finance'].includes(user.department)) {
      throw new ApiError(403, 'Insufficient access to edit payment_status');
    }
  }

  if (p.order_date !== undefined && !['admin', 'super_admin', 'finance'].includes(user.department)) {
    policy.assertMayEditOrderPricing(user, order);
  }

  const lockedWorkflow = {
    status: doc.get('status'),
    dispatch_status: doc.get('dispatch_status'),
    has_open_flags: doc.get('has_open_flags'),
    open_flag_count: doc.get('open_flag_count'),
    highest_flag_severity: doc.get('highest_flag_severity'),
  };

  applyWhitelistedPatchToMongooseDoc(doc, p);

  const recalcBase = doc.toObject();

  if (p.order_items && !['admin', 'super_admin', 'finance'].includes(user.department)) {
    await resolveNegotiatedRates(recalcBase.order_items, p.party || order.party);
  }

  recalcCommercials(recalcBase);

  doc.set('order_items', recalcBase.order_items);
  doc.markModified('order_items');
  doc.set('subtotal', recalcBase.subtotal);
  doc.set('gst_amount', recalcBase.gst_amount);
  doc.set('grand_total', recalcBase.grand_total);

  doc.set('status', lockedWorkflow.status);
  doc.set('dispatch_status', lockedWorkflow.dispatch_status);
  doc.set('has_open_flags', lockedWorkflow.has_open_flags);
  doc.set('open_flag_count', lockedWorkflow.open_flag_count);
  doc.set('highest_flag_severity', lockedWorkflow.highest_flag_severity);

  doc.set('updated_by', user._id);
  await doc.save();
  const out = toPlain(doc.toObject());

  await syncPartyProductLastRatesFromOrder(getModels, out);
  return out;
}

/**
 * Status move only: all graph checks, department gates, flags, invoice/collection side effects live in workflow.
 */
async function transition(id, body, user, reqMeta) {
  await getById(id, user);
  return workflowService.transitionOrderStatus({
    orderId: id,
    nextStatus: body.next_status,
    userId: user._id,
    remarks: body.remarks,
    rejectionReason: body.rejection_reason,
    ip_address: reqMeta.ip,
    user_agent: reqMeta.ua,
  });
}

/** Chronological audit of status changes (OrderStatusHistory), after verifying the order exists. */
async function history(id, user) {
  await getById(id, user);
  const rows = await getModels().OrderStatusHistory.find({ order: id })
    .populate('changed_by', 'username name')
    .sort({ createdAt: 1 })
    .lean();
  return rows.map((r) => toPlain(r));
}

const ORDER_NF = 'Order not found';

/** Trash list: soft-deleted orders with optional same filters as `list`. */
async function listDeleted(query = {}, user) {
  const q = {};
  const { status, customer, party, exclude_status } = query;
  if (status) {
    q.status = status;
  } else {
    const excluded = parseExcludeStatuses(exclude_status);
    if (excluded.length) q.status = { $nin: excluded };
  }
  if (customer) q.customer = customer;
  if (party) q.party = party;
  applyVisibilityFilter(q, user);
  const rows = await listDeletedLean(getModels().Order, q);
  return rows.map((r) => toPlain(r));
}

/** Soft-delete active order; records activity (record remains recoverable). */
async function softDelete(id, user) {
  await getById(id, user);
  const doc = await softDeleteActiveById(getModels().Order, id, { notFoundMessage: ORDER_NF });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'order',
    entity_id: plain._id,
    action: 'deleted',
    message: `Order ${plain.order_no} soft-deleted`,
  });
  return plain;
}

/** Restore from trash; activity log for compliance trail. */
async function restore(id, user) {
  const q = { _id: id };
  applyVisibilityFilter(q, user);
  const checkAccess = await getModels().Order.findOne(q).withDeleted().lean();
  if (!checkAccess) throw new ApiError(404, ORDER_NF);

  const doc = await restoreSoftDeletedById(getModels().Order, id, { notFoundMessage: ORDER_NF });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'order',
    entity_id: plain._id,
    action: 'restored',
    message: `Order ${plain.order_no} restored`,
  });
  return plain;
}

async function fulfillment(id, user) {
  await getById(id, user);
  return fulfillmentService.getSnapshot(id);
}

module.exports = {
  list,
  getById,
  create,
  update,
  transition,
  history,
  fulfillment,
  recalcCommercials,
  normalizeItems,
  listDeleted,
  softDelete,
  restore,
};
