/**
 * @fileoverview Unified order approval execution helpers.
 * @module modules/orderApproval/orderApproval.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const { softDeleteActiveById, restoreSoftDeletedById, listDeletedLean } = require('../../utils/mongoSoftDelete');
const activityService = require('../activity/activity.service');
const workflowService = require('../workflow/workflow.service');
const rateService = require('../partyOrderProductsRate/partyOrderProductsRate.service');
const fulfillmentService = require('../orders/orderFulfillment.service');
const orderQueue = require('../../queues/order.queue');
const {
  aggregateReleaseReturnsByOrderLine,
  getReleaseDispatchIds,
} = require('../../utils/returnSettlement');
const { ORDER_RETURN_STATUS } = require('../../constants/orderReturnStatus');
const {
  APPROVAL_STATUS,
  BATCH_APPROVAL_STATUS,
  attachDerivedApprovalFields,
  deriveBatchFinanceStatus,
  recalcApprovalItemTotals,
  isLineFullyRejected,
  isLineFullyApproved,
  summarizeApprovalItems,
  adminClearedQtyForLine,
} = require('./orderApproval.constants');
const {
  ORDER_WORKFLOW_STAGE,
  ORDER_STATUS,
  normalizeFinanceApprovalStatus,
  normalizeOrderWorkflowFields,
  normalizeWorkflowStage,
} = require('../orders/order.constants');

const APPROVAL_NF = 'Order approval not found';

const ADMIN_REVIEW_STATUSES = new Set(['submitted', 'on_hold']);
const ADMIN_CREATE_STATUSES = new Set([
  'draft',
  'submitted',
  'on_hold',
  'sales_approved',
  'finance_review',
  'partially_finance_approved',
  'finance_approved',
  'fully_finance_approved',
  'account_review',
  'partially_account_approved',
  'fully_account_approved',
  'account_approved',
]);
const APPROVE_FROM_STATUSES = new Set([
  'draft',
  'submitted',
  'on_hold',
  'sales_approved',
  'finance_review',
  'partially_finance_approved',
  'finance_approved',
  'fully_finance_approved',
  'account_review',
  'partially_account_approved',
  'fully_account_approved',
  'account_approved',
]);
/** Only transition order → sales_approved on first admin sign-off from sales queue. */
const ADMIN_APPROVE_TRANSITION_STATUSES = new Set(['submitted', 'on_hold']);
const SEND_TO_FINANCE_ORDER_STATUSES = new Set([
  ORDER_STATUS.SALES_APPROVED,
  ORDER_STATUS.FINANCE_REVIEW,
  ORDER_STATUS.FINANCE_APPROVED,
  'partially_finance_approved',
  'fully_finance_approved',
]);
const SEND_TO_ACCOUNT_ORDER_STATUSES = new Set([
  'partially_finance_approved',
  'fully_finance_approved',
  ORDER_STATUS.ACCOUNT_REVIEW,
  'partially_account_approved',
  'fully_account_approved',
  ORDER_STATUS.ACCOUNT_APPROVED,
]);

async function enqueuePostAdminApprovalJobs(orderId, userId) {
  const oid = String(orderId);
  await orderQueue.enqueue({ type: 'sync_party_rates', payload: { orderId: oid } });
  await orderQueue.enqueue({
    type: 'recalculate_fulfillment',
    payload: { orderId: oid, userId: userId ? String(userId) : undefined },
  });
}

const enqueuePostFinanceApprovalJobs = enqueuePostAdminApprovalJobs;
const enqueuePostAccountApprovalJobs = enqueuePostAdminApprovalJobs;

async function syncOrderItemsForAdminApproval(orderId, orderItems, user) {
  const orderService = require('../orders/order.service');
  const { Order } = getModels();
  const doc = await Order.findById(orderId);
  if (!doc) throw new ApiError(404, 'Order not found');

  const normalized = orderService.normalizeItems(orderItems);
  if (normalized.length === 0) {
    throw new ApiError(400, 'order_items required');
  }

  const lockedWorkflow = {
    status: doc.get('status'),
    dispatch_status: doc.get('dispatch_status'),
    has_open_flags: doc.get('has_open_flags'),
    open_flag_count: doc.get('open_flag_count'),
    highest_flag_severity: doc.get('highest_flag_severity'),
  };

  doc.set('order_items', normalized);
  doc.markModified('order_items');
  const recalcBase = doc.toObject();
  orderService.recalcCommercials(recalcBase);
  doc.set('order_items', recalcBase.order_items);
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
  return doc;
}

function buildApprovalItemOverrideLookup(bodyItems = []) {
  const byLineId = new Map();
  const byProduct = new Map();
  for (const item of bodyItems) {
    const lineId = String(item.order_item_id || '').trim();
    if (lineId && lineId !== 'undefined') {
      byLineId.set(lineId, item);
    }
    const productId = String(item.product?._id || item.product || '').trim().toLowerCase();
    if (productId) {
      byProduct.set(productId, item);
    }
  }
  return { byLineId, byProduct };
}

function resolveOverrideForLine(line, lookup) {
  const lineId = String(line.order_item_id ?? line._id ?? '').trim();
  const productId = String(line.product?._id || line.product || '').trim().toLowerCase();
  return lookup.byLineId.get(lineId) || (productId ? lookup.byProduct.get(productId) : null) || null;
}

function resolveApprovalItemLineIds(order, bodyItems = []) {
  if (!Array.isArray(bodyItems) || bodyItems.length === 0) return bodyItems;
  const lineIds = new Set((order.order_items || []).map((line) => String(line._id)));
  const byProduct = new Map();
  for (const line of order.order_items || []) {
    const pid = String(line.product?._id || line.product || '').trim().toLowerCase();
    if (pid) byProduct.set(pid, String(line._id));
  }
  return bodyItems.map((item) => {
    const rawId = String(item.order_item_id || '');
    if (rawId && lineIds.has(rawId)) return item;
    const productId = String(item.product?._id || item.product || '').trim().toLowerCase();
    const resolved = productId ? byProduct.get(productId) : null;
    if (!resolved) return item;
    return { ...item, order_item_id: resolved };
  });
}

async function aggregateAdminClearedByLine(orderId) {
  const { OrderApproval } = getModels();
  const approvals = await OrderApproval.find({
    order: orderId,
    deletedAt: null,
    is_admin_approved: true,
    rejected_by: null,
    $or: [{ rejection_reason: null }, { rejection_reason: '' }],
  })
    .sort({ revision_number: 1, createdAt: 1 })
    .lean();

  const byLine = {};
  for (const approval of approvals) {
    for (const item of approval.approval_items || []) {
      const qty = Number(item.approved_quantity || 0);
      if (qty <= 0) continue;
      const key = String(item.order_item_id);
      byLine[key] = (byLine[key] || 0) + qty;
    }
  }
  return byLine;
}

function generateAdminApprovalNo() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `OAA-${ts}-${rand}`;
}

function generateFinanceApprovalNo() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `OFA-${ts}-${rand}`;
}

function orderedLineTotal(line) {
  return Number(line.total_amount ?? line.taxable_amount ?? 0);
}

function rateLookupKey(productId, rateType) {
  return `${String(productId)}:${rateType || 'MANUAL'}`;
}

function isLineRateNegotiated(rateInfo) {
  return Boolean(rateInfo?.isMapped && rateInfo?.hasRate && !rateInfo?.isRateExpired);
}

function recalcCommercials(order) {
  let subtotal = 0;
  let gstAmount = 0;
  const stage = String(order.workflow_stage || '');
  const isPostFinance = [
    ORDER_WORKFLOW_STAGE.DISPATCH,
    ORDER_WORKFLOW_STAGE.COMPLETED,
    'dispatch_review',
    'dispatch_execution',
  ].includes(stage);

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

function adminApprovalItemsFromOrder(order, bodyItems = [], rateCheck, { remainingOnly = false, adminClearedByLine = {} } = {}) {
  const resolvedItems = resolveApprovalItemLineIds(order, bodyItems);
  const lookup = buildApprovalItemOverrideLookup(resolvedItems);
  const rateByLine = new Map();
  for (const item of rateCheck?.items || []) {
    rateByLine.set(rateLookupKey(item.product, item.applied_rate_type), item);
  }

  return (order.order_items || []).map((line) => {
    const override = resolveOverrideForLine(line, lookup) || {};
    const productId = line.product?._id || line.product;
    const appliedRateType = override.applied_rate_type || line.applied_rate_type || 'MANUAL';
    const rateInfo = rateByLine.get(rateLookupKey(productId, appliedRateType)) || {};

    const orderedQuantity = Number(
      override.ordered_quantity ?? override.approved_quantity ?? line.ordered_quantity ?? line.quantity ?? 0,
    );
    const alreadyApproved = adminClearedQtyForLine(line, adminClearedByLine);
    const remainingQuantity = Math.max(0, orderedQuantity - alreadyApproved);
    const baselineQuantity = remainingOnly ? remainingQuantity : orderedQuantity;

    if (remainingOnly && baselineQuantity === 0) {
      return null;
    }

    const orderedUnitPrice = Number(
      override.approved_unit_price ?? override.ordered_unit_price ?? line.unit_price ?? 0,
    );
    const discountPercent = Number(override.discount_percent ?? line.discount_percent ?? 0);
    let discountAmount = Number(override.discount_amount ?? line.discount_amount ?? 0);
    const gstPercent = Number(override.gst_percent ?? line.gst_percent ?? 0);
    const freeQuantity = Number(override.free_quantity ?? line.free_quantity ?? 0);

    let orderedTotalAmount = orderedLineTotal(line);
    if (remainingOnly) {
      const oGross = baselineQuantity * orderedUnitPrice;
      let oDisc = 0;
      if (line.discount_percent > 0) {
        oDisc = (oGross * line.discount_percent) / 100;
      } else if (line.ordered_quantity > 0) {
        oDisc = (Number(line.discount_amount || 0) * baselineQuantity) / line.ordered_quantity;
      }
      const oTaxable = Math.max(0, oGross - oDisc);
      const oGst = (oTaxable * (line.gst_percent ?? 0)) / 100;
      orderedTotalAmount = oTaxable + oGst;
    }

    let approvedQuantity = Number(
      override.approved_quantity ?? (remainingOnly ? remainingQuantity : orderedQuantity),
    );
    approvedQuantity = Math.max(
      0,
      Math.min(approvedQuantity, remainingOnly ? remainingQuantity : orderedQuantity),
    );

    const approvedUnitPrice = Number(override.approved_unit_price ?? orderedUnitPrice);
    const rateMapped = override.rate_mapped != null
      ? Boolean(override.rate_mapped)
      : isLineRateNegotiated(rateInfo);

    const gross = approvedQuantity * approvedUnitPrice;
    let discAmount = discountAmount;
    if (discountPercent > 0) {
      discAmount = (gross * discountPercent) / 100;
    }
    const taxable = Math.max(0, gross - discAmount);
    const gstAmt = (taxable * gstPercent) / 100;
    const approvedTotalAmount = override.approved_total_amount != null
      ? Number(override.approved_total_amount)
      : taxable + gstAmt;

    return {
      order_item_id: line._id,
      product: productId,
      ordered_quantity: baselineQuantity,
      ordered_unit_price: orderedUnitPrice,
      ordered_total_amount: orderedTotalAmount,
      approved_quantity: approvedQuantity,
      approved_unit_price: approvedUnitPrice,
      approved_total_amount: approvedTotalAmount,
      applied_rate_type: override.applied_rate_type || appliedRateType,
      pricing_reference: override.pricing_reference || line.pricing_reference || undefined,
      manual_price_override: override.manual_price_override != null
        ? Boolean(override.manual_price_override)
        : Boolean(line.manual_price_override),
      rate_mapped: rateMapped,
      free_quantity: freeQuantity,
      discount_percent: discountPercent,
      discount_amount: discAmount,
      gst_percent: gstPercent,
      rejection_reason: override.rejection_reason || '',
      hold_reason: override.hold_reason || '',
      remarks: override.remarks || '',
    };
  }).filter(Boolean);
}

function financeApprovalItemsFromOrder(order, bodyItems = [], { remainingOnly = false, adminClearedByLine = {} } = {}) {
  const overrideByLine = new Map(bodyItems.map((item) => [String(item.order_item_id), item]));

  return (order.order_items || []).map((line) => {
    const override = overrideByLine.get(String(line._id)) || {};
    const orderedQuantity = Number(line.ordered_quantity ?? line.quantity ?? 0);
    const salesApproved = adminClearedQtyForLine(line, adminClearedByLine);
    const financeApproved = Number(line.approved_quantity ?? 0);
    const financePool = salesApproved;
    const remainingQuantity = Math.max(0, financePool - financeApproved);
    const baselineQuantity = remainingOnly ? remainingQuantity : financePool;

    if (remainingOnly && baselineQuantity === 0) {
      return null;
    }

    const orderedUnitPrice = Number(line.unit_price || 0);
    const gross = baselineQuantity * orderedUnitPrice;
    let disc = 0;
    if (line.discount_percent > 0) {
      disc = (gross * line.discount_percent) / 100;
    } else if (line.ordered_quantity > 0) {
      disc = (Number(line.discount_amount || 0) * baselineQuantity) / line.ordered_quantity;
    }
    const taxable = Math.max(0, gross - disc);
    const gst = (taxable * (line.gst_percent ?? 0)) / 100;
    const orderedTotalAmount = taxable + gst;

    let approvedQuantity = Number(
      override.approved_quantity ?? (remainingOnly ? remainingQuantity : financePool),
    );
    approvedQuantity = Math.max(0, Math.min(approvedQuantity, remainingOnly ? remainingQuantity : financePool));

    const approvedUnitPrice = Number(override.approved_unit_price ?? orderedUnitPrice);

    return {
      order_item_id: line._id,
      product: line.product,
      ordered_quantity: remainingOnly ? remainingQuantity : financePool,
      ordered_unit_price: orderedUnitPrice,
      ordered_total_amount: orderedTotalAmount,
      approved_quantity: approvedQuantity,
      approved_unit_price: approvedUnitPrice,
      approved_total_amount: Number(override.approved_total_amount ?? approvedQuantity * approvedUnitPrice),
      rejection_reason: override.rejection_reason || '',
      hold_reason: override.hold_reason || '',
      remarks: override.remarks || '',
    };
  }).filter(Boolean);
}

function summarizeRateChecks(approvalItems) {
  const allRatesMapped = approvalItems.length > 0
    && approvalItems.every((item) => item.rate_mapped);
  return {
    rates_reviewed: approvalItems.length > 0,
    all_rates_mapped: allRatesMapped,
  };
}

function addDerivedStatus(doc) {
  return attachDerivedApprovalFields(doc);
}

async function enrichAccountAmendmentMeta(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const missing = rows.filter((row) => !row.account_amended);
  if (missing.length === 0) return rows;

  const ids = missing.map((row) => row._id);
  const amendments = await getModels().OrderAmmendmentUser.find({
    order_approval: { $in: ids },
    department: 'account',
  })
    .sort({ ammended_at: -1 })
    .populate('ammended_by', 'name username email')
    .lean();

  const latestByApprovalId = new Map();
  for (const amendment of amendments) {
    const key = String(amendment.order_approval);
    if (!latestByApprovalId.has(key)) {
      latestByApprovalId.set(key, amendment);
    }
  }

  return rows.map((row) => {
    if (row.account_amended) return row;
    const latest = latestByApprovalId.get(String(row._id));
    if (!latest) return row;
    return {
      ...row,
      account_amended: true,
      account_amended_by: latest.ammended_by,
      account_amended_at: latest.ammended_at,
    };
  });
}

async function list(query = {}) {
  const { order, is_admin_approved, assigned_finance_user, assigned_account_user } = query;
  const q = { deletedAt: null };
  if (order) q.order = order;
  if (is_admin_approved !== undefined) {
    q.is_admin_approved = is_admin_approved === 'true' || is_admin_approved === true;
  }
  if (assigned_finance_user) q.assigned_finance_user = assigned_finance_user;
  if (assigned_account_user) q.assigned_account_user = assigned_account_user;
  const rows = await getModels().OrderApproval.find(q)
    .populate('approval_items.product', 'product_name sku')
    .populate('assigned_finance_user', 'name username email')
    .populate('approved_by', 'name username email')
    .populate('sent_to_finance_by', 'name username email')
    .populate('finance_amended_by', 'name username email')
    .populate('account_amended_by', 'name username email')
    .populate('admin_amended_by', 'name username email')
    .populate('account_approved_by', 'name username email')
    .populate('assigned_account_user', 'name username email')
    .populate('sales_submitted_by', 'name username email')
    .sort({ createdAt: -1 })
    .lean();
  const enriched = await enrichAccountAmendmentMeta(rows.map((row) => toPlain(row)));
  return enriched.map((row) => toPlain(addDerivedStatus(row)));
}

async function get(id) {
  const row = await getModels().OrderApproval.findOne({ _id: id, deletedAt: null })
    .populate('approval_items.product', 'product_name sku')
    .populate('assigned_finance_user', 'name username email')
    .populate('approved_by', 'name username email')
    .populate('sent_to_finance_by', 'name username email')
    .populate('finance_amended_by', 'name username email')
    .populate('account_amended_by', 'name username email')
    .populate('admin_amended_by', 'name username email')
    .populate('account_approved_by', 'name username email')
    .populate('assigned_account_user', 'name username email')
    .populate('sales_submitted_by', 'name username email')
    .lean();
  if (!row) throw new ApiError(404, APPROVAL_NF);
  const [enriched] = await enrichAccountAmendmentMeta([toPlain(row)]);
  return toPlain(addDerivedStatus(enriched));
}

async function createAdminApproval(body, user) {
  const { Order, OrderApproval } = getModels();
  let order = await Order.findById(body.order);
  if (!order) throw new ApiError(404, 'Order not found');



  if (Array.isArray(body.order_items) && body.order_items.length > 0) {
    order = await syncOrderItemsForAdminApproval(body.order, body.order_items, user);
  }

  const plainOrder = toPlain(order.toObject());
  const adminClearedByLine = (body.replace_snapshot === true
    || (Array.isArray(body.order_items) && body.order_items.length > 0))
    ? {}
    : await aggregateAdminClearedByLine(body.order);

  const rateCheck = await rateService.checkOrderRates(body.order);
  const resolvedApprovalItems = resolveApprovalItemLineIds(order, body.approval_items || []);
  const approvalItems = adminApprovalItemsFromOrder(
    plainOrder,
    resolvedApprovalItems,
    rateCheck,
    { remainingOnly: false, adminClearedByLine },
  );
  if (approvalItems.length === 0) {
    throw new ApiError(400, 'Order has no items to approve');
  }

  const orderedTotalAmount = approvalItems.reduce(
    (sum, item) => sum + Number(item.ordered_total_amount || 0),
    0,
  );
  const rateSummary = summarizeRateChecks(approvalItems);

  const isSales = user && (user.department === 'sales' || user.role === 'sales');

  let doc = await OrderApproval.findOne({ order: body.order, deletedAt: null });
  if (doc) {
    doc.revision_number = 1;
    doc.ordered_total_amount = orderedTotalAmount;
    doc.approved_total_amount = Number(body.approved_total_amount || 0);
    doc.approval_items = approvalItems;
    doc.rates_reviewed = body.rates_reviewed != null ? Boolean(body.rates_reviewed) : rateSummary.rates_reviewed;
    doc.all_rates_mapped = body.all_rates_mapped != null ? Boolean(body.all_rates_mapped) : rateSummary.all_rates_mapped;
    doc.approval_notes = body.approval_notes || '';
    doc.rejection_reason = body.rejection_reason || '';
    doc.hold_reason = body.hold_reason || '';
    doc.reviewed_by = user._id;
    doc.reviewed_at = new Date();
    if (!isSales) {
      doc.is_admin_approved = false;
    }
    if (isSales) {
      doc.is_sales_submited = true;
      doc.sales_submitted_by = user._id;
      doc.sales_submitted_at = new Date();
    }
    await doc.save();
  } else {
    doc = await OrderApproval.create({
      is_admin_approved: false,
      approval_no: body.approval_no || generateAdminApprovalNo(),
      order: body.order,
      revision_number: 1,
      ordered_total_amount: orderedTotalAmount,
      approved_total_amount: Number(body.approved_total_amount || 0),
      approval_items: approvalItems,
      rates_reviewed: body.rates_reviewed != null ? Boolean(body.rates_reviewed) : rateSummary.rates_reviewed,
      all_rates_mapped: body.all_rates_mapped != null ? Boolean(body.all_rates_mapped) : rateSummary.all_rates_mapped,
      approval_notes: body.approval_notes || '',
      rejection_reason: body.rejection_reason || '',
      hold_reason: body.hold_reason || '',
      reviewed_by: user._id,
      reviewed_at: new Date(),
      created_by: user._id,
      ...(isSales ? {
        is_sales_submited: true,
        sales_submitted_by: user._id,
        sales_submitted_at: new Date(),
      } : {}),
    });
  }

  order.admin_approval_status = APPROVAL_STATUS.PENDING;
  order.last_admin_approval = doc._id;
  await order.save();

  // Outbound WhatsApp/email queues: modules/communication
  // e.g. communicationService.queueOrderReceivedMessages({ order: order._id, recipient, contact_name })

  if (body.approve_finance_only === true) {
    await decideFinance(doc._id, 'approved', { ...body, replace_snapshot: true }, user);
    const finalPop = await OrderApproval.findById(doc._id)
      .populate('approval_items.product', 'product_name sku')
      .lean();
    return toPlain(addDerivedStatus(finalPop));
  }

  if (body.approve_account_only === true) {
    await decideAccount(doc._id, 'approved', { ...body, replace_snapshot: true }, user, { bypassSequence: true });
    const finalPop = await OrderApproval.findById(doc._id)
      .populate('approval_items.product', 'product_name sku')
      .lean();
    return toPlain(addDerivedStatus(finalPop));
  }

  if (body.approve_immediately === true) {
    await approve(doc._id, { ...body, replace_snapshot: true }, user);
    const finalPop = await OrderApproval.findById(doc._id)
      .populate('approval_items.product', 'product_name sku')
      .lean();
    return toPlain(addDerivedStatus(finalPop));
  }

  const populated = await OrderApproval.findById(doc._id)
    .populate('approval_items.product', 'product_name sku')
    .lean();
  return toPlain(addDerivedStatus(populated));
}

async function createFinanceApproval(body, user) {
  const { Order, OrderApproval } = getModels();
  const order = await Order.findById(body.order).lean();
  if (!order) throw new ApiError(404, 'Order not found');

  const plainOrder = toPlain(order);
  const remainingOnly = false;
  const adminClearedByLine = await aggregateAdminClearedByLine(body.order);
  const approvalItems = financeApprovalItemsFromOrder(
    plainOrder,
    body.approval_items || [],
    { remainingOnly, adminClearedByLine },
  );
  if (approvalItems.length === 0) {
    throw new ApiError(400, 'Order has no items to approve');
  }

  const orderedTotalAmount = approvalItems.reduce(
    (sum, item) => sum + Number(item.ordered_total_amount || 0),
    0,
  );

  let doc = await OrderApproval.findOne({ order: body.order, deletedAt: null });
  if (!doc) {
    doc = await OrderApproval.create({
      is_admin_approved: true,
      is_finance_approved: false,
      approval_no: body.approval_no || generateFinanceApprovalNo(),
      order: body.order,
      revision_number: 1,
      ordered_total_amount: orderedTotalAmount,
      approved_total_amount: Number(body.approved_total_amount || 0),
      rejected_total_amount: Number(body.rejected_total_amount || 0),
      approval_items: approvalItems,
      credit_limit_checked: Boolean(body.credit_limit_checked),
      outstanding_checked: Boolean(body.outstanding_checked),
      risk_level: body.risk_level || 'low',
      approval_notes: body.approval_notes || '',
      rejection_reason: body.rejection_reason || '',
      hold_reason: body.hold_reason || '',
      reviewed_by: user._id,
      reviewed_at: new Date(),
      created_by: user._id,
    });
  } else {
    doc.credit_limit_checked = Boolean(body.credit_limit_checked);
    doc.outstanding_checked = Boolean(body.outstanding_checked);
    doc.risk_level = body.risk_level || 'low';
    if (body.approval_notes) {
      doc.approval_notes = doc.approval_notes ? `${doc.approval_notes}\n${body.approval_notes}` : body.approval_notes;
    }
    doc.is_finance_approved = false;
    doc.reviewed_by = user._id;
    doc.reviewed_at = new Date();
    await doc.save();
  }

  await workflowService.transitionOrderStatus({
    orderId: body.order,
    nextStatus: 'finance_review',
    userId: user._id,
    remarks: body.approval_notes || `Finance approval ${doc.approval_no} created`,
    _systemCall: true,
  });

  const allRejected = approvalItems.length > 0 && approvalItems.every(item => Number(item.approved_quantity || 0) <= 0);
  const decision = allRejected ? 'rejected' : 'approved';
  
  const result = await decideFinance(doc._id, decision, {
    approval_notes: body.approval_notes,
    rejection_reason: body.rejection_reason || body.approval_notes,
    approved_total_amount: body.approved_total_amount,
  }, user);

  return result;
}

async function create(body, user) {
  const dept = user.department;
  if (body.approve_immediately === true || body.replace_snapshot === true) {
    return createAdminApproval(body, user);
  }
  if (dept === 'finance' || dept === 'account') {
    return createFinanceApproval(body, user);
  } else {
    return createAdminApproval(body, user);
  }
}

async function patch(id, patchBody, user) {
  const doc = await getModels().OrderApproval.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, APPROVAL_NF);

  const derivedDoc = addDerivedStatus(toPlain(doc.toObject()));
  if (!doc.is_admin_approved) {
    if (['approved', 'sent_to_finance', 'cancelled'].includes(derivedDoc.approval_status)) {
      throw new ApiError(400, `Cannot patch admin approval in status "${derivedDoc.approval_status}"`);
    }
  }

  const patch = patchBody || {};
  const previousAccountUser = doc.assigned_account_user
    ? String(doc.assigned_account_user)
    : null;
  const fields = [
    'ordered_total_amount',
    'approved_total_amount',
    'rejected_total_amount',
    'rates_reviewed',
    'all_rates_mapped',
    'credit_limit_checked',
    'outstanding_checked',
    'risk_level',
    'approval_notes',
    'rejection_reason',
    'hold_reason',
    'assigned_account_user',
  ];
  for (const field of fields) {
    if (patch[field] !== undefined) doc[field] = patch[field];
  }

  if (Array.isArray(patch.approval_items)) {
    doc.approval_items = patch.approval_items;
    if (!doc.is_admin_approved) {
      const rateSummary = summarizeRateChecks(doc.approval_items);
      if (patch.rates_reviewed === undefined) doc.rates_reviewed = rateSummary.rates_reviewed;
      if (patch.all_rates_mapped === undefined) doc.all_rates_mapped = rateSummary.all_rates_mapped;
    }
  }
  doc.reviewed_by = user._id;
  doc.reviewed_at = new Date();
  await doc.save();

  const nextAccountUser = doc.assigned_account_user
    ? String(doc.assigned_account_user)
    : null;
  if (
    patch.assigned_account_user !== undefined
    && nextAccountUser
    && nextAccountUser !== previousAccountUser
    && doc.is_finance_approved
  ) {
    return sendToAccount(id, {
      assigned_account_user: nextAccountUser,
      approval_notes: patch.approval_notes,
      remarks: patch.remarks,
    }, user);
  }

  return toPlain(addDerivedStatus(doc.toObject()));
}

async function recomputeApprovedQuantitiesFromAdmin(orderId) {
  const { Order, OrderApproval } = getModels();
  const orderDoc = await Order.findById(orderId);
  if (!orderDoc) throw new ApiError(404, 'Order not found');

  const approvals = await OrderApproval.find({
    order: orderId,
    deletedAt: null,
    is_admin_approved: true,
    rejected_by: null,
    $or: [{ rejection_reason: null }, { rejection_reason: '' }],
  })
    .sort({ revision_number: -1, createdAt: -1 })
    .lean();

  const approvedByLine = {};
  const priceByLine = {};
  const approvedMetaByLine = {};
  const latestApproval = approvals[0];
  if (latestApproval) {
    for (const item of latestApproval.approval_items || []) {
      const qty = Number(item.approved_quantity || 0);
      const key = String(item.order_item_id);
      approvedByLine[key] = qty;
      if (item.approved_unit_price != null) {
        priceByLine[key] = Number(item.approved_unit_price);
      }
      approvedMetaByLine[key] = {
        applied_rate_type: item.applied_rate_type,
        pricing_reference: item.pricing_reference,
        manual_price_override: item.manual_price_override,
        approved_by: latestApproval.approved_by,
        approved_at: latestApproval.approved_at,
        free_quantity: item.free_quantity,
        discount_percent: item.discount_percent,
        discount_amount: item.discount_amount,
        gst_percent: item.gst_percent,
      };
    }
  }

  const now = new Date();
  for (const line of orderDoc.order_items || []) {
    const key = String(line._id);
    const ordered = Number(line.ordered_quantity ?? line.quantity ?? 0);
    const approvedQty = Math.min(ordered, approvedByLine[key] || 0);
    if (approvedQty > 0) {
      const meta = approvedMetaByLine[key] || {};
      if (meta.applied_rate_type) line.applied_rate_type = meta.applied_rate_type;
      if (meta.pricing_reference) line.pricing_reference = meta.pricing_reference;
      if (meta.manual_price_override != null) {
        line.manual_price_override = meta.manual_price_override;
      }
      if (priceByLine[key] != null) line.unit_price = priceByLine[key];
      if (meta.free_quantity != null) line.free_quantity = meta.free_quantity;
      if (meta.discount_percent != null) line.discount_percent = meta.discount_percent;
      if (meta.discount_amount != null) line.discount_amount = meta.discount_amount;
      if (meta.gst_percent != null) line.gst_percent = meta.gst_percent;
      line.approved_quantity = approvedQty;
      line.approved_by = meta.approved_by;
      line.approved_at = meta.approved_at || now;
    }
  }

  if (approvals.length > 0) {
    orderDoc.last_admin_approval = approvals[0]._id;
  }
  orderDoc.markModified('order_items');
  const orderService = require('../orders/order.service');
  orderService.recalcCommercials(orderDoc);
  await orderDoc.save();
  return orderDoc;
}

function mergeApprovalItemOverrides(doc, bodyItems = [], order = null) {
  if (!Array.isArray(bodyItems) || bodyItems.length === 0) return;

  const resolved = order ? resolveApprovalItemLineIds(order, bodyItems) : bodyItems;
  const lookup = buildApprovalItemOverrideLookup(resolved);

  const shouldKeep = (item) => {
    const lineId = String(item.order_item_id || '');
    const productId = String(item.product?._id || item.product || '');
    if (lineId && lookup.byLineId.has(lineId)) return true;
    return productId ? lookup.byProduct.has(productId) : false;
  };

  doc.approval_items = (doc.approval_items || []).filter(shouldKeep);

  const applyOverride = (item, override) => {
    if (!override) return;
    if (override.approved_quantity !== undefined) {
      item.approved_quantity = Number(override.approved_quantity);
      item.ordered_quantity = override.ordered_quantity !== undefined
        ? Number(override.ordered_quantity)
        : item.approved_quantity;
    }
    if (override.approved_unit_price !== undefined) {
      item.approved_unit_price = Number(override.approved_unit_price);
      if (override.ordered_unit_price === undefined) {
        item.ordered_unit_price = item.approved_unit_price;
      }
    }
    if (override.ordered_unit_price !== undefined) {
      item.ordered_unit_price = Number(override.ordered_unit_price);
    }
    if (override.applied_rate_type !== undefined) {
      item.applied_rate_type = override.applied_rate_type;
    }
    if (override.free_quantity !== undefined) {
      item.free_quantity = Number(override.free_quantity);
    }
    if (override.discount_percent !== undefined) {
      item.discount_percent = Number(override.discount_percent);
    }
    if (override.discount_amount !== undefined) {
      item.discount_amount = Number(override.discount_amount);
    }
    if (override.gst_percent !== undefined) {
      item.gst_percent = Number(override.gst_percent);
    }

    const qty = item.approved_quantity;
    const price = item.approved_unit_price;
    const gross = qty * price;
    let disc = item.discount_amount;
    if (item.discount_percent > 0) {
      disc = (gross * item.discount_percent) / 100;
      item.discount_amount = disc;
    }
    const taxable = Math.max(0, gross - disc);
    const gst = (taxable * item.gst_percent) / 100;
    item.approved_total_amount = override.approved_total_amount !== undefined
      ? Number(override.approved_total_amount)
      : taxable + gst;

    recalcApprovalItemTotals(item);
    if (override.rate_mapped !== undefined) item.rate_mapped = Boolean(override.rate_mapped);
    if (override.remarks !== undefined) item.remarks = override.remarks;
  };

  for (const item of doc.approval_items || []) {
    applyOverride(item, resolveOverrideForLine(item, lookup));
  }

  const existingLineIds = new Set(
    (doc.approval_items || []).map((item) => String(item.order_item_id || '')),
  );
  const existingProducts = new Set(
    (doc.approval_items || []).map((item) => String(item.product?._id || item.product || '')),
  );

  for (const override of resolved) {
    const lineId = String(override.order_item_id || '').trim();
    const productId = String(override.product || '').trim();
    if (lineId && existingLineIds.has(lineId)) continue;
    if (productId && existingProducts.has(productId)) continue;
    if (!lineId && !productId) continue;

    const approvedQty = Number(override.approved_quantity ?? override.ordered_quantity ?? 0);
    const approvedPrice = Number(override.approved_unit_price ?? override.ordered_unit_price ?? 0);
    const discountPercent = Number(override.discount_percent ?? 0);
    let discountAmount = Number(override.discount_amount ?? 0);
    const gstPercent = Number(override.gst_percent ?? 0);
    const gross = approvedQty * approvedPrice;
    if (discountPercent > 0) {
      discountAmount = (gross * discountPercent) / 100;
    }
    const taxable = Math.max(0, gross - discountAmount);
    const gstAmt = (taxable * gstPercent) / 100;

    const newItem = {
      order_item_id: lineId || undefined,
      product: productId || override.product,
      ordered_quantity: Number(override.ordered_quantity ?? approvedQty),
      ordered_unit_price: Number(override.ordered_unit_price ?? approvedPrice),
      ordered_total_amount: Number(override.ordered_total_amount ?? taxable + gstAmt),
      approved_quantity: approvedQty,
      approved_unit_price: approvedPrice,
      approved_total_amount: Number(override.approved_total_amount ?? taxable + gstAmt),
      applied_rate_type: override.applied_rate_type || 'MANUAL',
      pricing_reference: override.pricing_reference,
      manual_price_override: override.manual_price_override != null
        ? Boolean(override.manual_price_override)
        : true,
      rate_mapped: override.rate_mapped != null ? Boolean(override.rate_mapped) : false,
      free_quantity: Number(override.free_quantity ?? 0),
      discount_percent: discountPercent,
      discount_amount: discountAmount,
      gst_percent: gstPercent,
      rejection_reason: override.rejection_reason || '',
      hold_reason: override.hold_reason || '',
      remarks: override.remarks || '',
    };
    recalcApprovalItemTotals(newItem);
    doc.approval_items.push(newItem);
    if (lineId) existingLineIds.add(lineId);
    if (productId) existingProducts.add(productId);
  }

  doc.markModified('approval_items');
}

function alignApprovalItemForFinanceOverride(item) {
  const approvedQty = Number(item.approved_quantity || 0);
  const approvedPrice = Number(item.approved_unit_price || 0);
  item.ordered_quantity = approvedQty;
  item.ordered_unit_price = approvedPrice;
  recalcApprovalItemTotals(item);
}

function finalizeFinanceOverrideApproval(doc, user) {
  const now = new Date();
  doc.approval_items = (doc.approval_items || []).filter(
    (item) => Number(item.approved_quantity || 0) > 0,
  );

  for (const item of doc.approval_items) {
    alignApprovalItemForFinanceOverride(item);
  }

  doc.is_admin_approved = true;
  doc.admin_approved_by = doc.admin_approved_by || doc.approved_by || user._id;
  doc.admin_approved_at = doc.admin_approved_at || doc.approved_at || now;
  if (!doc.approved_by) doc.approved_by = user._id;
  if (!doc.approved_at) doc.approved_at = now;

  doc.approved_total_amount = (doc.approval_items || []).reduce(
    (sum, item) => sum + Number(item.approved_total_amount || 0),
    0,
  );
  doc.ordered_total_amount = (doc.approval_items || []).reduce(
    (sum, item) => sum + Number(item.ordered_total_amount || 0),
    0,
  );
  doc.rejected_total_amount = 0;
}

function finalizeFinanceOverrideApprovalIsolated(doc, user) {
  const now = new Date();
  doc.approval_items = (doc.approval_items || []).filter(
    (item) => Number(item.approved_quantity || 0) > 0,
  );

  for (const item of doc.approval_items) {
    alignApprovalItemForFinanceOverride(item);
  }

  doc.is_finance_approved = true;
  doc.finance_approved_by = doc.finance_approved_by || user._id;
  doc.finance_approved_at = doc.finance_approved_at || now;
  if (!doc.approved_by) doc.approved_by = user._id;
  if (!doc.approved_at) doc.approved_at = now;

  doc.approved_total_amount = (doc.approval_items || []).reduce(
    (sum, item) => sum + Number(item.approved_total_amount || 0),
    0,
  );
  doc.ordered_total_amount = (doc.approval_items || []).reduce(
    (sum, item) => sum + Number(item.ordered_total_amount || 0),
    0,
  );
  doc.rejected_total_amount = 0;
}

function finalizeAccountOverrideApproval(doc, user) {
  const now = new Date();
  doc.approval_items = (doc.approval_items || []).filter(
    (item) => Number(item.approved_quantity || 0) > 0,
  );

  for (const item of doc.approval_items) {
    alignApprovalItemForFinanceOverride(item);
  }

  doc.is_account_approved = true;
  doc.account_approved_by = doc.account_approved_by || user._id;
  doc.account_approved_at = doc.account_approved_at || now;
  if (!doc.approved_by) doc.approved_by = user._id;
  if (!doc.approved_at) doc.approved_at = now;

  doc.approved_total_amount = (doc.approval_items || []).reduce(
    (sum, item) => sum + Number(item.approved_total_amount || 0),
    0,
  );
  doc.ordered_total_amount = (doc.approval_items || []).reduce(
    (sum, item) => sum + Number(item.ordered_total_amount || 0),
    0,
  );
  doc.rejected_total_amount = 0;
}

function reconcileApprovalItemOrderLineIds(order, approvalDoc) {
  const lineById = new Map((order.order_items || []).map((line) => [String(line._id), line]));
  const lineByProduct = new Map();
  for (const line of order.order_items || []) {
    const pid = String(line.product?._id || line.product || '');
    if (pid) lineByProduct.set(pid, line);
  }

  for (const item of approvalDoc.approval_items || []) {
    if (Number(item.approved_quantity || 0) <= 0) continue;

    const currentId = String(item.order_item_id || '');
    if (currentId && lineById.has(currentId)) continue;

    const productId = String(item.product?._id || item.product || '');
    const matched = productId ? lineByProduct.get(productId) : null;
    if (matched) {
      item.order_item_id = matched._id;
    }
  }
  approvalDoc.markModified('approval_items');
}

async function syncOrderLinesFromFinanceAmendment(order, approvalDoc, rateByLine, options = {}) {
  const orderService = require('../orders/order.service');
  const lineById = new Map((order.order_items || []).map((line) => [String(line._id), line]));
  const lineByProduct = new Map(
    (order.order_items || []).map((line) => [String(line.product?._id || line.product || ''), line]),
  );
  const removedLineIds = options.removedLineIds || new Set();
  const stampBy = approvalDoc.approved_by || approvalDoc.admin_approved_by;
  const stampAt = approvalDoc.approved_at || approvalDoc.admin_approved_at || new Date();

  for (const item of approvalDoc.approval_items || []) {
    const approvedQty = Number(item.approved_quantity || 0);
    if (approvedQty <= 0) {
      continue;
    }

    let line = lineById.get(String(item.order_item_id));
    if (!line) {
      const productId = String(item.product?._id || item.product || '');
      line = productId ? lineByProduct.get(productId) : null;
      if (line) {
        item.order_item_id = line._id;
      }
    }
    if (!line) continue;

    const approvedPrice = Number(item.approved_unit_price ?? line.unit_price ?? 0);

    line.ordered_quantity = approvedQty;
    line.quantity = approvedQty;
    line.approved_quantity = approvedQty;
    line.unit_price = approvedPrice;
    if (item.applied_rate_type) line.applied_rate_type = item.applied_rate_type;
    if (item.pricing_reference) line.pricing_reference = item.pricing_reference;
    if (item.manual_price_override != null) {
      line.manual_price_override = Boolean(item.manual_price_override);
    }

    line.free_quantity = Number(item.free_quantity ?? 0);
    line.discount_percent = Number(item.discount_percent ?? 0);
    line.discount_amount = Number(item.discount_amount ?? 0);
    line.gst_percent = Number(item.gst_percent ?? 0);
    line.approved_by = stampBy;
    line.approved_at = stampAt;
    line.line_status = 'active';

    alignApprovalItemForFinanceOverride(item);

    if (item.rate_mapped == null) {
      const productId = line.product?._id || line.product;
      const rateType = item.applied_rate_type || line.applied_rate_type || 'MANUAL';
      const rateInfo = rateByLine.get(rateLookupKey(productId, rateType)) || {};
      item.rate_mapped = isLineRateNegotiated(rateInfo);
    }
  }

  if (removedLineIds.size > 0) {
    order.order_items = (order.order_items || []).filter(
      (line) => !removedLineIds.has(String(line._id)),
    );
  }

  reconcileApprovalItemOrderLineIds(order, approvalDoc);

  order.markModified('order_items');
  orderService.recalcCommercials(order);
  normalizeOrderWorkflowFields(order);
  await order.save();
}

async function appendNewFinanceAmendmentItems(order, approvalDoc, newItems, rateByLine) {
  const { Product } = getModels();
  const lineById = new Map((order.order_items || []).map((line) => [String(line._id), line]));
  const productLine = new Map(
    (order.order_items || []).map((line) => [String(line.product?._id || line.product), line]),
  );

  for (const newItem of newItems || []) {
    const productId = newItem.product;
    const approvedQty = Number(newItem.approved_quantity || 0);
    const approvedPrice = Number(newItem.approved_unit_price || 0);
    const freeQty = Number(newItem.free_quantity || 0);
    const discountPercent = Number(newItem.discount_percent || 0);
    const discountAmount = Number(newItem.discount_amount || 0);
    const gstPercent = Number(newItem.gst_percent ?? 0);

    if (!productId || approvedQty <= 0) continue;

    let line = newItem.order_item_id
      ? lineById.get(String(newItem.order_item_id))
      : productLine.get(String(productId));

    if (!line) {
      const product = await Product.findById(productId)
        .select('product_name sku gst_percent brand manufacturer unit hsn_code base_price')
        .lean();
      order.order_items.push({
        product: productId,
        product_name: product?.product_name || newItem.product_name || '',
        sku: product?.sku || newItem.sku || '',
        brand: product?.brand || '',
        manufacturer: product?.manufacturer || '',
        unit: product?.unit || '',
        hsn_code: product?.hsn_code || '',
        gst_percent: gstPercent || product?.gst_percent || 0,
        ordered_quantity: approvedQty,
        quantity: approvedQty,
        approved_quantity: approvedQty,
        free_quantity: freeQty,
        unit_price: approvedPrice,
        discount_percent: discountPercent,
        discount_amount: discountAmount,
        applied_rate_type: newItem.applied_rate_type || 'MANUAL',
        manual_price_override: true,
        line_status: 'active',
      });
      line = order.order_items[order.order_items.length - 1];
      lineById.set(String(line._id), line);
      productLine.set(String(productId), line);
    } else {
      line.ordered_quantity = approvedQty;
      line.quantity = approvedQty;
      line.unit_price = approvedPrice;
      line.approved_quantity = approvedQty;
      line.free_quantity = freeQty;
      line.discount_percent = discountPercent;
      line.discount_amount = discountAmount;
      line.gst_percent = gstPercent;
      line.line_status = 'active';
    }

    const rateType = newItem.applied_rate_type || line.applied_rate_type || 'MANUAL';
    const rateInfo = rateByLine.get(rateLookupKey(productId, rateType)) || {};
    const rateMapped = newItem.rate_mapped != null
      ? Boolean(newItem.rate_mapped)
      : isLineRateNegotiated(rateInfo);

    const alreadyInBatch = (approvalDoc.approval_items || []).some(
      (row) => String(row.order_item_id) === String(line._id),
    );
    if (alreadyInBatch) continue;

    const batchItem = {
      order_item_id: line._id,
      product: productId,
      ordered_quantity: approvedQty,
      ordered_unit_price: approvedPrice,
      approved_quantity: approvedQty,
      approved_unit_price: approvedPrice,
      applied_rate_type: rateType,
      pricing_reference: newItem.pricing_reference || line.pricing_reference || undefined,
      manual_price_override: newItem.manual_price_override != null
        ? Boolean(newItem.manual_price_override)
        : true,
      rate_mapped: rateMapped,
      free_quantity: freeQty,
      discount_percent: discountPercent,
      discount_amount: discountAmount,
      gst_percent: gstPercent,
      remarks: newItem.remarks || '',
    };
    alignApprovalItemForFinanceOverride(batchItem);
    approvalDoc.approval_items.push(batchItem);
  }
}

async function decideAdmin(id, decision, body, user) {
  const { Order, OrderApproval, OrderWorkflow } = getModels();
  const doc = await OrderApproval.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, APPROVAL_NF);

  if (Array.isArray(body?.order_items) && body.order_items.length > 0) {
    await syncOrderItemsForAdminApproval(doc.order, body.order_items, user);
  }

  const orderForMerge = await Order.findById(doc.order);
  if (!orderForMerge) throw new ApiError(404, 'Order not found');

  mergeApprovalItemOverrides(doc, body?.approval_items, orderForMerge);

  const isRejected = decision === 'rejected';
  if (isRejected && !(body?.rejection_reason || doc.rejection_reason)) {
    throw new ApiError(400, 'Admin rejection must include rejection_reason');
  }

  const currentStatus = orderForMerge.status || 'draft';

  if (!isRejected) {
    const derivedBeforeApprove = attachDerivedApprovalFields(toPlain(doc.toObject()));
    if (!APPROVE_FROM_STATUSES.has(currentStatus) && derivedBeforeApprove.approval_status !== BATCH_APPROVAL_STATUS.APPROVED) {
      throw new ApiError(
        400,
        `Order must be submitted or on hold to approve (current: ${currentStatus})`,
      );
    }

    const requireMapped = body?.require_all_rates_mapped !== false;
    if (requireMapped) {
      const unmapped = (doc.approval_items || []).filter(
        (item) => Number(item.approved_quantity || 0) > 0 && !item.rate_mapped,
      );
      if (unmapped.length > 0) {
        throw new ApiError(400, 'All approved lines must have negotiated mapped rates before approval');
      }
    }

    for (const item of doc.approval_items || []) {
      recalcApprovalItemTotals(item);
    }

    const { allRejected } = summarizeApprovalItems(doc.approval_items);
    if (allRejected) {
      throw new ApiError(400, 'Cannot approve when every line is rejected');
    }

    doc.is_admin_approved = true;
    doc.admin_approved_by = user._id;
    doc.admin_approved_at = new Date();
    doc.approved_by = user._id;
    doc.approved_at = new Date();
    doc.rejected_by = undefined;
    doc.rejected_at = undefined;

    const approvedTotal = (doc.approval_items || []).reduce(
      (sum, item) => sum + Number(item.approved_total_amount || 0),
      0,
    );
    doc.approved_total_amount = body?.approved_total_amount != null
      ? Number(body.approved_total_amount)
      : approvedTotal;

    if (body?.approval_notes !== undefined) doc.approval_notes = body.approval_notes;

    await doc.save();

    await recomputeApprovedQuantitiesFromAdmin(orderForMerge._id);
    const refreshedOrder = await Order.findById(orderForMerge._id);
    if (!refreshedOrder) throw new ApiError(404, 'Order not found');

    refreshedOrder.admin_approval_status = APPROVAL_STATUS.APPROVED;
    refreshedOrder.last_admin_approval = doc._id;
    await refreshedOrder.save();

    if (ADMIN_APPROVE_TRANSITION_STATUSES.has(currentStatus)) {
      await workflowService.transitionOrderStatus({
        orderId: refreshedOrder._id,
        nextStatus: 'sales_approved',
        userId: user._id,
        remarks: body?.approval_notes || `Admin approval ${doc.approval_no}`,
        _systemCall: true,
      });
    }

    await OrderWorkflow.create({
      order: refreshedOrder._id,
      action_by: user._id,
      role: 'admin',
      action: 'approved',
      from_stage: 'admin_review',
      to_stage: 'finance_review',
      from_status: currentStatus,
      to_status: 'sales_approved',
      remarks: body?.approval_notes || '',
      revision_number: doc.revision_number,
      metadata: {
        entity_type: 'OrderApproval',
        entity_id: String(doc._id),
        approval_no: doc.approval_no,
      },
    });

    await enqueuePostAdminApprovalJobs(refreshedOrder._id, user._id);
  } else {
    doc.is_admin_approved = false;
    doc.rejected_by = user._id;
    doc.rejected_at = new Date();
    doc.approved_by = undefined;
    doc.approved_at = undefined;
    doc.approved_total_amount = 0;
    doc.rejected_total_amount = doc.ordered_total_amount || 0;
    if (body?.rejection_reason !== undefined) doc.rejection_reason = body.rejection_reason;

    for (const item of doc.approval_items || []) {
      item.approved_quantity = 0;
      item.approved_total_amount = 0;
      recalcApprovalItemTotals(item);
    }

    orderForMerge.admin_approval_status = APPROVAL_STATUS.REJECTED;
    orderForMerge.last_admin_approval = doc._id;
    await orderForMerge.save();

    if (body?.move_to_hold === true && currentStatus !== 'on_hold') {
      await workflowService.transitionOrderStatus({
        orderId: orderForMerge._id,
        nextStatus: 'on_hold',
        userId: user._id,
        remarks: body?.rejection_reason || doc.rejection_reason || '',
        _systemCall: true,
      });
    }
  }

  await doc.save();

  await activityService.create({
    actor: user._id,
    entity_type: 'approval',
    entity_id: doc._id,
    action: isRejected ? 'rejected' : 'approved',
    message: `Order admin approval ${doc.approval_no} ${isRejected ? 'rejected' : 'approved'}`,
  });

  const populated = await OrderApproval.findById(doc._id)
    .populate('approval_items.product', 'product_name sku')
    .lean();
  return toPlain(populated);
}

async function decideFinance(id, decision, body, user) {
  const { Order, OrderApproval, OrderWorkflow } = getModels();
  const doc = await OrderApproval.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, APPROVAL_NF);

  const parentOrder = await Order.findById(doc.order).lean();
  if (parentOrder && Array.isArray(doc.approval_items)) {
    for (const item of doc.approval_items) {
      const orderLine = (parentOrder.order_items || []).find(
        (line) => String(line._id) === String(item.order_item_id)
      );
      if (orderLine) {
        item.approved_quantity = Number(orderLine.approved_quantity ?? orderLine.ordered_quantity ?? 0);
        item.ordered_quantity = Number(orderLine.ordered_quantity ?? 0);
        item.approved_unit_price = Number(orderLine.unit_price ?? 0);
        item.ordered_unit_price = Number(orderLine.unit_price ?? 0);
        item.free_quantity = Number(orderLine.free_quantity ?? 0);
        item.discount_percent = Number(orderLine.discount_percent ?? 0);
        item.discount_amount = Number(orderLine.discount_amount ?? 0);
        item.gst_percent = Number(orderLine.gst_percent ?? 0);
      }
    }
  }

  const isRejected = decision === 'rejected';
  if (isRejected && !(body?.rejection_reason || doc.rejection_reason)) {
    throw new ApiError(400, 'Finance rejection must include rejection_reason');
  }

  let finalStatus = deriveBatchFinanceStatus(doc.approval_items || [], isRejected);
  if (isRejected && doc.approval_items && doc.approval_items.length > 0) {
    for (const item of doc.approval_items) {
      item.approved_quantity = 0;
      item.approved_total_amount = 0;
      recalcApprovalItemTotals(item);
    }
  } else if (doc.approval_items && doc.approval_items.length > 0) {
    for (const item of doc.approval_items) {
      recalcApprovalItemTotals(item);
    }
    finalStatus = deriveBatchFinanceStatus(doc.approval_items, false);
  }

  doc.is_finance_approved = !isRejected;
  doc.finance_approved_by = isRejected ? undefined : user._id;
  doc.finance_approved_at = isRejected ? undefined : new Date();
  doc.approved_by = isRejected ? undefined : user._id;
  doc.rejected_by = isRejected ? user._id : undefined;
  doc.approved_at = isRejected ? undefined : new Date();
  doc.rejected_at = isRejected ? new Date() : undefined;
  if (body?.approval_notes !== undefined) doc.approval_notes = body.approval_notes;
  if (body?.rejection_reason !== undefined) doc.rejection_reason = body.rejection_reason;
  
  if (isRejected || finalStatus === 'rejected') {
    doc.rejected_total_amount = doc.ordered_total_amount;
    doc.approved_total_amount = 0;
  } else {
    const calculatedApprovedTotal = (doc.approval_items || []).reduce(
      (sum, item) => sum + Number(item.approved_total_amount || 0),
      0,
    );
    doc.approved_total_amount = body?.approved_total_amount != null
      ? Number(body.approved_total_amount)
      : calculatedApprovedTotal;
    doc.rejected_total_amount = doc.ordered_total_amount - doc.approved_total_amount;
  }

  await doc.save();

  const order = await Order.findById(doc.order);
  if (order) {
    const isApprovedOrPartial = finalStatus === 'fully_approved' || finalStatus === 'partially_approved';

    if (isApprovedOrPartial) {
      await fulfillmentService.recomputeApprovedQuantitiesFromFinance(order._id);
      const refreshed = await Order.findById(order._id);
      if (refreshed) {
        recalcCommercials(refreshed);
        normalizeOrderWorkflowFields(refreshed);
        await refreshed.save();
      }
    } else if (isRejected || finalStatus === BATCH_APPROVAL_STATUS.REJECTED) {
      order.finance_approval_status = APPROVAL_STATUS.REJECTED;
      await order.save();
    }

    const updatedOrder = await Order.findById(order._id);
    const adminClearedByLine = await aggregateAdminClearedByLine(order._id);
    const allApproved = (updatedOrder?.order_items || []).every((item) => {
      const pool = adminClearedQtyForLine(item, adminClearedByLine)
        || Number(item.ordered_quantity ?? item.quantity ?? 0);
      return Number(item.approved_quantity || 0) >= pool;
    });

    const nextStatus = (isRejected || finalStatus === 'rejected')
      ? 'finance_rejected'
      : (allApproved ? 'fully_finance_approved' : 'partially_finance_approved');

    const isPastFinance = ['finance_approved', 'fully_finance_approved', 'partially_finance_approved', 'account_review', 'account_approved', 'fully_account_approved', 'partially_account_approved', 'dispatched', 'delivered', 'closed', 'cancelled'].includes(order.status);
    if (!isPastFinance) {
      await workflowService.transitionOrderStatus({
        orderId: order._id,
        nextStatus,
        userId: user._id,
        remarks: body?.approval_notes || body?.rejection_reason || '',
        rejectionReason: isRejected ? (body?.rejection_reason || doc.rejection_reason) : undefined,
        _systemCall: true,
      });
    }

    if (isApprovedOrPartial) {
      const orderAfterTransition = await Order.findById(order._id);
      if (orderAfterTransition) {
        await fulfillmentService.applyFinanceWorkflowAction(orderAfterTransition);
        normalizeOrderWorkflowFields(orderAfterTransition);
        await orderAfterTransition.save();

      await OrderWorkflow.create({
        order: order._id,
        action_by: user._id,
        role: 'finance',
        action: allApproved ? 'fully_finance_approved' : 'partially_finance_approved',
          to_stage: ORDER_WORKFLOW_STAGE.DISPATCH,
          to_status: ORDER_STATUS.FINANCE_APPROVED,
        remarks: body?.approval_notes || '',
        revision_number: doc.revision_number,
        metadata: {
          entity_type: 'OrderApproval',
          entity_id: String(doc._id),
          approval_no: doc.approval_no,
            finance_approval_status: allApproved ? APPROVAL_STATUS.APPROVED : APPROVAL_STATUS.PARTIAL,
        },
      });

        await enqueuePostFinanceApprovalJobs(order._id, user._id);
      }
    }
  }

  await activityService.create({
    actor: user._id,
    entity_type: 'approval',
    entity_id: doc._id,
    action: (isRejected || finalStatus === 'rejected') ? 'rejected' : 'approved',
    message: `Order finance approval ${doc.approval_no} ${(isRejected || finalStatus === 'rejected') ? 'rejected' : 'approved'}`,
  });

  const populated = await OrderApproval.findById(doc._id)
    .populate('approval_items.product', 'product_name sku')
    .lean();
  return toPlain(populated);
}

async function decideAccount(id, decision, body, user, options = {}) {
  const { Order, OrderApproval, OrderWorkflow } = getModels();
  const doc = await OrderApproval.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, APPROVAL_NF);

  if (!options.bypassSequence && !doc.is_finance_approved) {
    throw new ApiError(400, 'Finance approval must be completed before account decision');
  }
  if (!options.bypassSequence && !doc.is_admin_approved) {
    throw new ApiError(400, 'Admin approval must be completed before account decision');
  }

  const parentOrder = await Order.findById(doc.order).lean();
  if (parentOrder && Array.isArray(doc.approval_items)) {
    for (const item of doc.approval_items) {
      const orderLine = (parentOrder.order_items || []).find(
        (line) => String(line._id) === String(item.order_item_id)
      );
      if (orderLine) {
        item.approved_quantity = Number(orderLine.approved_quantity ?? orderLine.ordered_quantity ?? 0);
        item.ordered_quantity = Number(orderLine.ordered_quantity ?? 0);
        item.approved_unit_price = Number(orderLine.unit_price ?? 0);
        item.ordered_unit_price = Number(orderLine.unit_price ?? 0);
        item.free_quantity = Number(orderLine.free_quantity ?? 0);
        item.discount_percent = Number(orderLine.discount_percent ?? 0);
        item.discount_amount = Number(orderLine.discount_amount ?? 0);
        item.gst_percent = Number(orderLine.gst_percent ?? 0);
      }
    }
  }

  const isRejected = decision === 'rejected';
  if (isRejected && !(body?.rejection_reason || doc.rejection_reason)) {
    throw new ApiError(400, 'Account rejection must include rejection_reason');
  }

  let finalStatus = deriveBatchFinanceStatus(doc.approval_items || [], isRejected);
  if (isRejected && doc.approval_items && doc.approval_items.length > 0) {
    for (const item of doc.approval_items) {
      item.approved_quantity = 0;
      item.approved_total_amount = 0;
      recalcApprovalItemTotals(item);
    }
  } else if (doc.approval_items && doc.approval_items.length > 0) {
    for (const item of doc.approval_items) {
      recalcApprovalItemTotals(item);
    }
    finalStatus = deriveBatchFinanceStatus(doc.approval_items, false);
  }

  doc.is_account_approved = !isRejected;
  doc.account_approved_by = isRejected ? undefined : user._id;
  doc.account_approved_at = isRejected ? undefined : new Date();
  doc.rejected_by = isRejected ? user._id : undefined;
  if (body?.approval_notes !== undefined) doc.approval_notes = body.approval_notes;
  if (body?.rejection_reason !== undefined) doc.rejection_reason = body.rejection_reason;
  if (isRejected || finalStatus === 'rejected') {
    doc.rejected_total_amount = doc.ordered_total_amount;
    doc.approved_total_amount = 0;
  } else {
    const calculatedApprovedTotal = (doc.approval_items || []).reduce(
      (sum, item) => sum + Number(item.approved_total_amount || 0),
      0,
    );
    doc.approved_total_amount = body?.approved_total_amount != null
      ? Number(body.approved_total_amount)
      : calculatedApprovedTotal;
    doc.rejected_total_amount = doc.ordered_total_amount - doc.approved_total_amount;
  }

  await doc.save();

  const order = await Order.findById(doc.order);
  if (order) {
    const isApprovedOrPartial = finalStatus === 'fully_approved' || finalStatus === 'partially_approved';

    if (isApprovedOrPartial) {
      await fulfillmentService.recomputeApprovedQuantitiesFromFinance(order._id);
      const refreshed = await Order.findById(order._id);
      if (refreshed) {
        refreshed.last_account_approval = doc._id;
        recalcCommercials(refreshed);
        normalizeOrderWorkflowFields(refreshed);
        await refreshed.save();
      }
    } else if (isRejected || finalStatus === BATCH_APPROVAL_STATUS.REJECTED) {
      order.account_approval_status = APPROVAL_STATUS.REJECTED;
      await order.save();
    }

    const allApproved = (doc.approval_items || []).every((item) => isLineFullyApproved(item));

    const nextStatus = (isRejected || finalStatus === 'rejected')
      ? 'account_rejected'
      : (allApproved ? 'fully_account_approved' : 'partially_account_approved');

    const isPastAccount = ['account_approved', 'fully_account_approved', 'partially_account_approved', 'dispatched', 'delivered', 'closed', 'cancelled'].includes(order.status);
    if (!isPastAccount) {
      await workflowService.transitionOrderStatus({
        orderId: order._id,
        nextStatus,
        userId: user._id,
        remarks: body?.approval_notes || body?.rejection_reason || '',
        rejectionReason: isRejected ? (body?.rejection_reason || doc.rejection_reason) : undefined,
        _systemCall: true,
      });
    }

    if (isApprovedOrPartial) {
      const orderAfterTransition = await Order.findById(order._id);
      if (orderAfterTransition) {
        await fulfillmentService.applyAccountWorkflowAction(orderAfterTransition);
        orderAfterTransition.last_account_approval = doc._id;
        normalizeOrderWorkflowFields(orderAfterTransition);
        await orderAfterTransition.save();

        await OrderWorkflow.create({
          order: order._id,
          action_by: user._id,
          role: 'account',
          action: allApproved ? 'fully_account_approved' : 'partially_account_approved',
          to_stage: ORDER_WORKFLOW_STAGE.DISPATCH,
          to_status: ORDER_STATUS.ACCOUNT_APPROVED,
          remarks: body?.approval_notes || '',
          revision_number: doc.revision_number,
          metadata: {
            entity_type: 'OrderApproval',
            entity_id: String(doc._id),
            approval_no: doc.approval_no,
            account_approval_status: allApproved ? APPROVAL_STATUS.APPROVED : APPROVAL_STATUS.PARTIAL,
          },
        });

        if (!options.skipAsyncJobs) {
          await enqueuePostAccountApprovalJobs(order._id, user._id);
        }
      }
    }
  }

  await activityService.create({
    actor: user._id,
    entity_type: 'approval',
    entity_id: doc._id,
    action: (isRejected || finalStatus === 'rejected') ? 'rejected' : 'approved',
    message: `Order account approval ${doc.approval_no} ${(isRejected || finalStatus === 'rejected') ? 'rejected' : 'approved'}`,
  });

  const populated = await OrderApproval.findById(doc._id)
    .populate('approval_items.product', 'product_name sku')
    .lean();
  return toPlain(addDerivedStatus(populated));
}

async function approve(id, body, user) {
  const doc = await getModels().OrderApproval.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, APPROVAL_NF);
  if (!doc.is_admin_approved) {
    return decideAdmin(id, 'approved', body, user);
  }
  if (!doc.is_finance_approved) {
    return decideFinance(id, 'approved', body, user);
  }
  return decideAccount(id, 'approved', body, user);
}

async function reject(id, body, user) {
  const doc = await getModels().OrderApproval.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, APPROVAL_NF);
  if (!doc.is_admin_approved) {
    return decideAdmin(id, 'rejected', body, user);
  }
  if (!doc.is_finance_approved) {
    return decideFinance(id, 'rejected', body, user);
  }
  return decideAccount(id, 'rejected', body, user);
}

async function sendToFinance(id, body, user) {
  const { Order, OrderApproval } = getModels();
  const doc = await OrderApproval.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, APPROVAL_NF);

  const derivedDoc = addDerivedStatus(toPlain(doc.toObject()));
  if (!['approved', 'sent_to_finance'].includes(derivedDoc.approval_status)) {
    throw new ApiError(400, 'Admin approval must be approved before sending to finance');
  }

  const order = await Order.findById(doc.order);
  if (!order) throw new ApiError(404, 'Order not found');



  const financeAssigneeId = body?.assigned_finance_user
    ? String(body.assigned_finance_user)
    : null;

  if (!financeAssigneeId) {
    throw new ApiError(400, 'assigned_finance_user is required when sending to finance');
  }

  doc.assigned_finance_user = financeAssigneeId;
  doc.sent_to_finance_by = user._id;
  doc.sent_to_finance_at = new Date();
  if (body?.approval_notes) doc.approval_notes = body.approval_notes;
  await doc.save();

  order.current_assignee = financeAssigneeId;
  order.pending_with_role = 'finance';
  order.current_department = 'finance';
  order.admin_approval_status = 'sent_to_finance';
  order.last_admin_approval = doc._id;
  await order.save();

  if (currentStatus !== 'finance_review') {
    await workflowService.transitionOrderStatus({
      orderId: order._id,
      nextStatus: 'finance_review',
      userId: user._id,
      remarks: body?.approval_notes || body?.remarks || `Sent to finance via ${doc.approval_no}`,
      _systemCall: true,
    });
  }

  await activityService.create({
    actor: user._id,
    entity_type: 'approval',
    entity_id: doc._id,
    action: 'status_changed',
    message: `Order admin approval ${doc.approval_no} sent to finance`,
  });

  const populated = await OrderApproval.findById(doc._id)
    .populate('approval_items.product', 'product_name sku')
    .populate('assigned_finance_user', 'name username email')
    .populate('approved_by', 'name username email')
    .populate('sent_to_finance_by', 'name username email')
    .lean();
  return toPlain(addDerivedStatus(populated));
}

async function sendToAccount(id, body, user) {
  const { Order, OrderApproval } = getModels();
  const doc = await OrderApproval.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, APPROVAL_NF);

  if (!doc.is_finance_approved) {
    throw new ApiError(400, 'Finance approval must be completed before sending to account');
  }

  const order = await Order.findById(doc.order);
  if (!order) throw new ApiError(404, 'Order not found');



  const accountAssigneeId = body?.assigned_account_user
    ? String(body.assigned_account_user)
    : doc.assigned_account_user
      ? String(doc.assigned_account_user)
      : null;

  if (!accountAssigneeId) {
    throw new ApiError(400, 'assigned_account_user is required when sending to account');
  }

  doc.assigned_account_user = accountAssigneeId;
  doc.sent_to_account_by = user._id;
  doc.sent_to_account_at = new Date();
  if (body?.approval_notes) doc.approval_notes = body.approval_notes;
  await doc.save();

  order.current_assignee = accountAssigneeId;
  order.pending_with_role = 'account';
  order.current_department = 'account';
  order.last_account_approval = doc._id;
  if (!order.account_approval_status || order.account_approval_status === APPROVAL_STATUS.PENDING) {
    order.account_approval_status = APPROVAL_STATUS.PENDING;
  }
  await order.save();

  if (currentStatus !== 'account_review') {
    await workflowService.transitionOrderStatus({
      orderId: order._id,
      nextStatus: 'account_review',
      userId: user._id,
      remarks: body?.approval_notes || body?.remarks || `Sent to account via ${doc.approval_no}`,
      _systemCall: true,
    });
  }

  await activityService.create({
    actor: user._id,
    entity_type: 'approval',
    entity_id: doc._id,
    action: 'status_changed',
    message: `Order finance approval ${doc.approval_no} sent to account`,
  });

  const populated = await OrderApproval.findById(doc._id)
    .populate('approval_items.product', 'product_name sku')
    .populate('assigned_account_user', 'name username email')
    .populate('finance_approved_by', 'name username email')
    .populate('sent_to_account_by', 'name username email')
    .lean();
  return toPlain(addDerivedStatus(populated));
}

function syncAdminApprovalItemsFromBatch(adminApproval, finApproval) {
  if (!adminApproval || !finApproval) return;
  const finByLineId = new Map(
    (finApproval.approval_items || []).map((item) => [String(item.order_item_id), item]),
  );
  const keepIds = new Set(finByLineId.keys());

  adminApproval.approval_items = (adminApproval.approval_items || []).filter(
    (item) => keepIds.has(String(item.order_item_id)),
  );

  const adminByLineId = new Map(
    (adminApproval.approval_items || []).map((item) => [String(item.order_item_id), item]),
  );

  for (const finItem of finApproval.approval_items || []) {
    const key = String(finItem.order_item_id);
    let adminItem = adminByLineId.get(key);
    if (!adminItem) {
      adminItem = {
        order_item_id: finItem.order_item_id,
        product: finItem.product,
      };
      adminApproval.approval_items.push(adminItem);
      adminByLineId.set(key, adminItem);
    }

    adminItem.ordered_quantity = Number(finItem.ordered_quantity ?? finItem.approved_quantity ?? 0);
    adminItem.ordered_unit_price = Number(finItem.ordered_unit_price ?? finItem.approved_unit_price ?? 0);
    adminItem.approved_quantity = Number(finItem.approved_quantity ?? 0);
    adminItem.approved_unit_price = Number(finItem.approved_unit_price ?? 0);
    adminItem.approved_total_amount = Number(finItem.approved_total_amount ?? 0);
    adminItem.ordered_total_amount = Number(finItem.ordered_total_amount ?? 0);
    adminItem.free_quantity = Number(finItem.free_quantity ?? 0);
    adminItem.discount_percent = Number(finItem.discount_percent ?? 0);
    adminItem.discount_amount = Number(finItem.discount_amount ?? 0);
    adminItem.gst_percent = Number(finItem.gst_percent ?? 0);
    adminItem.applied_rate_type = finItem.applied_rate_type;
    adminItem.remarks = finItem.remarks;
    adminItem.rate_mapped = finItem.rate_mapped;
    adminItem.manual_price_override = finItem.manual_price_override;
    recalcApprovalItemTotals(adminItem);
  }

  adminApproval.approved_total_amount = (adminApproval.approval_items || []).reduce(
    (sum, item) => sum + Number(item.approved_total_amount || 0),
    0,
  );
  adminApproval.ordered_total_amount = (adminApproval.approval_items || []).reduce(
    (sum, item) => sum + Number(item.ordered_total_amount || 0),
    0,
  );
  adminApproval.is_admin_approved = true;
  adminApproval.markModified('approval_items');
}

async function amendByAccount(id, body, user) {
  const { Order, OrderApproval, OrderDispatch } = getModels();
  const doc = await OrderApproval.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, APPROVAL_NF);



  const dispatchExists = await OrderDispatch.exists({
    order: doc.order,
    deletedAt: null,
    dispatch_status: { $ne: 'cancelled' }
  });
  if (dispatchExists) {
    throw new ApiError(400, 'Amendment is blocked as a dispatch has already been created for this order');
  }

  const order = await Order.findById(doc.order);
  if (!order) throw new ApiError(404, 'Order not found');

  const wasAccountApproved = Boolean(doc.is_account_approved);

  let adminApproval = null;
  if (order.last_admin_approval) {
    adminApproval = await OrderApproval.findOne({ _id: order.last_admin_approval, deletedAt: null });
  }
  if (!adminApproval) {
    adminApproval = await OrderApproval.findOne({ order: order._id, deletedAt: null })
      .sort({ revision_number: -1, createdAt: -1 });
  }

  const rateCheck = await rateService.checkOrderRates(doc.order);
  const rateByLine = new Map();
  for (const item of rateCheck?.items || []) {
    rateByLine.set(rateLookupKey(item.product, item.applied_rate_type), item);
  }

  const priorLineIds = new Set(
    (doc.approval_items || []).map((item) => String(item.order_item_id)),
  );

  mergeApprovalItemOverrides(doc, body?.approval_items || [], order);
  await appendNewFinanceAmendmentItems(order, doc, body?.new_items || [], rateByLine);

  const activeLineIds = new Set(
    (doc.approval_items || []).map((item) => String(item.order_item_id)),
  );
  const removedLineIds = new Set(
    [...priorLineIds].filter((lineId) => !activeLineIds.has(lineId)),
  );

  await syncOrderLinesFromFinanceAmendment(order, doc, rateByLine, { removedLineIds });
  recalcCommercials(order);
  normalizeOrderWorkflowFields(order);
  order.markModified('order_items');
  await order.save();

  finalizeAccountOverrideApproval(doc, user);

  const rateSummary = summarizeRateChecks(doc.approval_items || []);
  doc.rates_reviewed = rateSummary.rates_reviewed;
  doc.all_rates_mapped = rateSummary.all_rates_mapped;

  const note = body?.amendment_notes || body?.approval_notes;
  if (note) {
    const stampPrefix = wasAccountApproved ? 'Account amend' : 'Account approval';
    const stamp = `[${stampPrefix} ${new Date().toISOString().slice(0, 10)}] ${note}`;
    doc.approval_notes = doc.approval_notes ? `${doc.approval_notes}\n${stamp}` : stamp;
  }
  doc.reviewed_by = user._id;
  doc.reviewed_at = new Date();
  if (wasAccountApproved) {
    doc.account_amended = true;
    doc.account_amended_by = user._id;
    doc.account_amended_at = new Date();
  }
  await doc.save();

  if (adminApproval && String(adminApproval._id) !== String(doc._id)) {
    syncAdminApprovalItemsFromBatch(adminApproval, doc);
    await adminApproval.save();
  }

  if (wasAccountApproved) {
    const { OrderAmmendmentUser } = getModels();
    await OrderAmmendmentUser.create({
      order_approval: doc._id,
      department: 'account',
      ammended_by: user._id,
      ammended_at: doc.account_amended_at,
    });
  }

  await activityService.create({
    actor: user._id,
    entity_type: 'approval',
    entity_id: doc._id,
    action: 'updated',
    message: wasAccountApproved
      ? `Finance approval ${doc.approval_no} amended and account-updated`
      : `Finance approval ${doc.approval_no} approved by account`,
  });

  return decideAccount(id, 'approved', {
    approval_notes: note,
    approved_total_amount: doc.approved_total_amount,
  }, user, { bypassSequence: true });
}

async function amendByFinance(id, body, user) {
  const { Order, OrderApproval, OrderDispatch } = getModels();
  const doc = await OrderApproval.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, APPROVAL_NF);



  const dispatchExists = await OrderDispatch.exists({
    order: doc.order,
    deletedAt: null,
    dispatch_status: { $ne: 'cancelled' }
  });
  if (dispatchExists) {
    throw new ApiError(400, 'Amendment is blocked as a dispatch has already been created for this order');
  }

  const order = await Order.findById(doc.order);
  if (!order) throw new ApiError(404, 'Order not found');

  const wasFinanceApproved = Boolean(doc.is_finance_approved);

  const rateCheck = await rateService.checkOrderRates(doc.order);
  const rateByLine = new Map();
  for (const item of rateCheck?.items || []) {
    rateByLine.set(rateLookupKey(item.product, item.applied_rate_type), item);
  }

  const priorLineIds = new Set(
    (doc.approval_items || []).map((item) => String(item.order_item_id)),
  );

  mergeApprovalItemOverrides(doc, body?.approval_items || [], order);
  await appendNewFinanceAmendmentItems(order, doc, body?.new_items || [], rateByLine);

  const activeLineIds = new Set(
    (doc.approval_items || []).map((item) => String(item.order_item_id)),
  );
  const removedLineIds = new Set(
    [...priorLineIds].filter((lineId) => !activeLineIds.has(lineId)),
  );

  await syncOrderLinesFromFinanceAmendment(order, doc, rateByLine, { removedLineIds });
  recalcCommercials(order);
  normalizeOrderWorkflowFields(order);
  order.markModified('order_items');
  await order.save();

  finalizeFinanceOverrideApprovalIsolated(doc, user);

  const rateSummary = summarizeRateChecks(doc.approval_items || []);
  doc.rates_reviewed = rateSummary.rates_reviewed;
  doc.all_rates_mapped = rateSummary.all_rates_mapped;

  const note = body?.amendment_notes || body?.approval_notes;
  if (note) {
    const stampPrefix = wasFinanceApproved ? 'Finance amend' : 'Finance approval';
    const stamp = `[${stampPrefix} ${new Date().toISOString().slice(0, 10)}] ${note}`;
    doc.approval_notes = doc.approval_notes ? `${doc.approval_notes}\n${stamp}` : stamp;
  }
  doc.reviewed_by = user._id;
  doc.reviewed_at = new Date();
  if (wasFinanceApproved) {
  doc.finance_amended = true;
  doc.finance_amended_by = user._id;
  doc.finance_amended_at = new Date();
  }
  await doc.save();

  if (wasFinanceApproved) {
  const { OrderAmmendmentUser } = getModels();
  await OrderAmmendmentUser.create({
    order_approval: doc._id,
    department: 'finance',
    ammended_by: user._id,
    ammended_at: new Date(),
  });
  }

  await activityService.create({
    actor: user._id,
    entity_type: 'approval',
    entity_id: doc._id,
    action: 'updated',
    message: wasFinanceApproved
      ? `Sales approval ${doc.approval_no} amended by finance`
      : `Sales approval ${doc.approval_no} approved by finance`,
  });

  return decideFinance(id, 'approved', {
    approval_notes: note,
    approved_total_amount: doc.approved_total_amount,
  }, user);
}

function aggregateDispatchedQtyForRelease(dispatches = []) {
  const dispatchedByLine = new Map();
  for (const disp of dispatches) {
    const rawItems = Array.isArray(disp.dispatch_items)
      ? disp.dispatch_items
      : disp.items || [];
    for (const item of rawItems) {
      const key = String(item.order_item_id);
      const qty = Number(item.dispatched_quantity ?? item.dispatch_quantity ?? 0);
      dispatchedByLine.set(key, (dispatchedByLine.get(key) || 0) + qty);
    }
  }
  return dispatchedByLine;
}

function computeNetSettledQtyForResolveLine({
  dispatched,
  totalReturned,
  priorReturnedSettled = 0,
  priorApprovedQty = 0,
}) {
  const priorReturned = Number(priorReturnedSettled || 0);
  const total = Number(totalReturned || 0);
  const priorApproved = Number(priorApprovedQty || 0);

  if (priorReturned > 0 || (priorApproved > 0 && priorApproved < dispatched)) {
    const baseNet = priorApproved > 0
      ? priorApproved
      : Math.max(0, dispatched - priorReturned);
    const additionalReturned = Math.max(0, total - priorReturned);
    return Math.max(0, baseNet - additionalReturned);
  }

  return Math.max(0, dispatched - total);
}

function releaseHasUnsettledDispatchReturns(approvalItems = [], returnsByLine = {}) {
  return (approvalItems || []).some((item) => {
    const key = String(item.order_item_id);
    const totalReturned = Number(returnsByLine[key] || 0);
    const priorReturned = Number(item.return_item_qty || 0);
    return totalReturned > priorReturned;
  });
}

async function resolvePartialDispatchByAccount(id, body, user, options = {}) {
  const { Order, OrderApproval, OrderDispatch, OrderReturn } = getModels();
  const orderService = require('../orders/order.service');
  const dispatchService = require('../dispatch/dispatch.service');

  const doc = await OrderApproval.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, APPROVAL_NF);

  if (!doc.is_finance_approved) {
    throw new ApiError(400, 'Finance approval must be completed before resolving dispatch');
  }
  if (!doc.is_account_approved) {
    throw new ApiError(400, 'Account clearance must be completed before resolving dispatch');
  }

  const releaseDispatches = await OrderDispatch.find({
    finance_approval: doc._id,
    deletedAt: null,
    dispatch_status: { $ne: 'cancelled' },
  }).lean();

  if (releaseDispatches.length === 0) {
    throw new ApiError(400, 'At least one dispatch batch is required to resolve this release');
  }

  const returns = await OrderReturn.find({ order: doc.order, deletedAt: null }).lean();
  const { aggregateDispatchReturnsByOrderLine } = require('../../utils/returnSettlement');
  const returnsByLine = aggregateDispatchReturnsByOrderLine(releaseDispatches);

  const dispatchedByLine = aggregateDispatchedQtyForRelease(releaseDispatches);
  const approvalItems = doc.approval_items || [];

  let hasRemaining = false;
  let hasReturnsToSettle = false;
  for (const item of approvalItems) {
    const key = String(item.order_item_id);
    const approved = Number(item.approved_quantity || 0);
    const dispatched = dispatchedByLine.get(key) || 0;
    const totalReturned = Number(returnsByLine[key] || 0);
    const priorReturned = Number(item.return_item_qty || 0);
    const additionalReturned = Math.max(0, totalReturned - priorReturned);
    if (approved > dispatched) hasRemaining = true;
    if (totalReturned > 0 && (priorReturned === 0 || additionalReturned > 0)) {
      hasReturnsToSettle = true;
    }
  }

  if (doc.dispatch_release_resolved) {
    const hasNewReturnWork = releaseHasUnsettledDispatchReturns(approvalItems, returnsByLine);
    if (!hasNewReturnWork && !hasRemaining) {
      throw new ApiError(400, 'This release has already been resolved');
    }
    doc.dispatch_release_resolved = false;
  }

  if (!hasRemaining && !hasReturnsToSettle) {
    throw new ApiError(400, 'No remaining clearance or warehouse returns to resolve on this release');
  }

  const order = await Order.findById(doc.order);
  if (!order) throw new ApiError(404, 'Order not found');

  let adminApproval = null;
  if (order.last_admin_approval) {
    adminApproval = await OrderApproval.findOne({ _id: order.last_admin_approval, deletedAt: null });
  }
  if (!adminApproval) {
    adminApproval = await OrderApproval.findOne({ order: order._id, deletedAt: null })
      .sort({ revision_number: -1, createdAt: -1 });
  }

  const rateCheck = await rateService.checkOrderRates(doc.order);
  const rateByLine = new Map();
  for (const item of rateCheck?.items || []) {
    rateByLine.set(rateLookupKey(item.product, item.applied_rate_type), item);
  }

  const approvalItemOverrides = [];
  const netSettledByLine = new Map();
  for (const item of approvalItems) {
    const key = String(item.order_item_id);
    const dispatched = dispatchedByLine.get(key) || 0;
    const returnedAtWarehouse = Number(returnsByLine[key] || 0);
    if (dispatched <= 0 && returnedAtWarehouse <= 0) continue;

    const netSettled = computeNetSettledQtyForResolveLine({
      dispatched,
      totalReturned: returnedAtWarehouse,
      priorReturnedSettled: item.return_item_qty,
      priorApprovedQty: item.approved_quantity,
    });
    netSettledByLine.set(key, netSettled);
    if (netSettled <= 0) continue;

    const orderLine = (order.order_items || []).find((line) => String(line._id) === key);
    const approvedPrice = Number(item.approved_unit_price ?? orderLine?.unit_price ?? 0);
    const discountPercent = Number(item.discount_percent ?? orderLine?.discount_percent ?? 0);
    const gstPercent = Number(item.gst_percent ?? orderLine?.gst_percent ?? 18);
    const freeQty = Number(item.free_quantity ?? orderLine?.free_quantity ?? 0);
    const rateType = item.applied_rate_type ?? orderLine?.applied_rate_type ?? 'MANUAL';

    const gross = netSettled * approvedPrice;
    let disc = 0;
    if (discountPercent > 0) {
      disc = (gross * discountPercent) / 100;
    } else {
      const priorApproved = Number(item.approved_quantity || 0);
      disc = priorApproved > 0
        ? (Number(item.discount_amount ?? 0) / priorApproved) * netSettled
        : Number(item.discount_amount ?? 0);
    }
    const taxable = Math.max(0, gross - disc);
    const lineTotal = taxable + (taxable * gstPercent) / 100;

    approvalItemOverrides.push({
      order_item_id: key,
      ordered_quantity: netSettled,
      approved_quantity: netSettled,
      approved_unit_price: approvedPrice,
      free_quantity: freeQty,
      discount_percent: discountPercent,
      discount_amount: disc,
      gst_percent: gstPercent,
      applied_rate_type: rateType,
      approved_total_amount: lineTotal,
      rate_mapped: item.rate_mapped ?? true,
      remarks: item.remarks,
    });
  }

  if (approvalItemOverrides.length === 0) {
    throw new ApiError(400, 'No dispatched or return quantities found to resolve against');
  }

  const priorLineIds = new Set(
    approvalItems.map((item) => String(item.order_item_id)),
  );

  mergeApprovalItemOverrides(doc, approvalItemOverrides);

  for (const item of doc.approval_items || []) {
    const key = String(item.order_item_id);
    if (returnsByLine[key] != null) {
      item.return_item_qty = Number(returnsByLine[key] || 0);
    }
  }
  doc.markModified('approval_items');

  const activeLineIds = new Set(
    (doc.approval_items || []).map((item) => String(item.order_item_id)),
  );
  const removedLineIds = new Set(
    [...priorLineIds].filter((lineId) => !activeLineIds.has(lineId)),
  );

  await syncOrderLinesFromFinanceAmendment(order, doc, rateByLine, { removedLineIds });

  if (hasReturnsToSettle) {
    const orderDispatches = await OrderDispatch.find({
      order: doc.order,
      deletedAt: null,
      dispatch_status: { $ne: 'cancelled' },
    }).lean();
    const orderReturnsByLine = aggregateDispatchReturnsByOrderLine(orderDispatches);

    const settledLines = [];
    for (const item of approvalItems) {
      const key = String(item.order_item_id);
      const totalReturned = Number(returnsByLine[key] || 0);
      const priorReturned = Number(item.return_item_qty || 0);
      const additionalReturned = Math.max(0, totalReturned - priorReturned);
      if (additionalReturned <= 0) continue;

      const orderLine = (order.order_items || []).find((line) => String(line._id) === key);
      if (!orderLine) continue;

      const gross = orderService.grossAcceptedQty(orderLine);
      const newReturned = Math.min(gross, Number(orderReturnsByLine[key] || 0));
      orderService.applyReturnSettlementToLine(orderLine, newReturned);
      settledLines.push(orderLine);
    }

    const releaseDispatchIds = [...getReleaseDispatchIds(releaseDispatches, String(doc._id))];
    if (releaseDispatchIds.length > 0) {
      await OrderReturn.updateMany(
        {
          order: doc.order,
          dispatch: { $in: releaseDispatchIds },
          deletedAt: null,
          return_status: ORDER_RETURN_STATUS.RECEIVED_AT_WAREHOUSE,
        },
        { $set: { deletedAt: new Date() } },
      );
    }

    if (settledLines.length > 0) {
      await orderService.syncDispatchDeliveredAfterSettlement(doc.order, settledLines);
    }
  }

  finalizeFinanceOverrideApproval(doc, user);

  doc.is_finance_approved = true;
  if (!doc.finance_approved_by && doc.approved_by) {
    doc.finance_approved_by = doc.approved_by;
  }
  if (!doc.finance_approved_at && doc.approved_at) {
    doc.finance_approved_at = doc.approved_at;
  }

  const rateSummary = summarizeRateChecks(doc.approval_items || []);
  doc.rates_reviewed = rateSummary.rates_reviewed;
  doc.all_rates_mapped = rateSummary.all_rates_mapped;

  const note = body?.amendment_notes || body?.approval_notes;
  if (note) {
    const stamp = `[Account dispatch resolve ${new Date().toISOString().slice(0, 10)}] ${note}`;
    doc.approval_notes = doc.approval_notes ? `${doc.approval_notes}\n${stamp}` : stamp;
  }
  doc.reviewed_by = user._id;
  doc.reviewed_at = new Date();
  doc.account_amended = true;
  doc.account_amended_by = user._id;
  doc.account_amended_at = new Date();
  doc.dispatch_release_resolved = true;
  doc.dispatch_release_resolved_by = user._id;
  doc.dispatch_release_resolved_at = new Date();
  await doc.save();

  if (adminApproval && String(adminApproval._id) !== String(doc._id)) {
    syncAdminApprovalItemsFromBatch(adminApproval, doc);
    await adminApproval.save();
  }

  order.finance_approval_status = fulfillmentService.deriveFinanceApprovalStatus(order.order_items);
  normalizeOrderWorkflowFields(order);
  order.markModified('order_items');
  orderService.recalcCommercials(order);
  await order.save();

  await fulfillmentService.recomputeApprovedQuantitiesFromFinance(order._id);

  const orderAligned = await Order.findById(doc.order);
  if (!orderAligned) throw new ApiError(404, 'Order not found');
  for (const line of orderAligned.order_items || []) {
    const approvedQty = Number(line.approved_quantity || 0);
    line.ordered_quantity = approvedQty;
    line.quantity = approvedQty;
  }
  normalizeOrderWorkflowFields(orderAligned);
  orderAligned.markModified('order_items');
  orderService.recalcCommercials(orderAligned);
  await orderAligned.save();

  await dispatchService.settleReleaseDispatchFulfillment(releaseDispatches, netSettledByLine);

  await fulfillmentService.recalculateFromExecutions(order._id, user);
  await dispatchService.recalculateOrderDispatchState(order._id, user);

  const { OrderAmmendmentUser } = getModels();
  await OrderAmmendmentUser.create({
    order_approval: doc._id,
    department: 'account',
    ammended_by: user._id,
    ammended_at: doc.account_amended_at,
  });

  await activityService.create({
    actor: user._id,
    entity_type: 'approval',
    entity_id: doc._id,
    action: 'updated',
    message: `Finance approval ${doc.approval_no} resolved to net settled quantities`,
  });

  return decideAccount(id, 'approved', {
    approval_notes: note,
    approved_total_amount: doc.approved_total_amount,
  }, user, options);
}

async function amend(id, body, user) {
  const userDept = String(user?.department || '').toLowerCase();
  if (userDept === 'account') {
    return amendByAccount(id, body, user);
  }

  const { Order, OrderApproval, Product } = getModels();

  const finApproval = await OrderApproval.findOne({ _id: id, deletedAt: null });
  if (!finApproval) throw new ApiError(404, APPROVAL_NF);

  const order = await Order.findById(finApproval.order);
  if (!order) throw new ApiError(404, 'Order not found');

  let adminApproval = null;
  if (order.last_admin_approval) {
    adminApproval = await OrderApproval.findOne({ _id: order.last_admin_approval, deletedAt: null });
  }
  if (!adminApproval) {
    adminApproval = await OrderApproval.findOne({ order: order._id, deletedAt: null })
      .sort({ revision_number: -1, createdAt: -1 });
  }
  if (!adminApproval) {
    throw new ApiError(404, 'Corresponding sales/admin approval not found');
  }

  const isSameDoc = String(adminApproval._id) === String(finApproval._id);
  if (isSameDoc) {
    adminApproval = finApproval;
  }

  const existingItems = body.approval_items || [];
  const newItems = body.new_items || [];
  const overrideByLine = new Map(existingItems.map((item) => [String(item.order_item_id), item]));

  const priorLineIds = new Set(
    (finApproval.approval_items || []).map((item) => String(item.order_item_id)),
  );
  const activeLineIds = new Set(
    existingItems.map((item) => String(item.order_item_id)),
  );
  const removedLineIds = new Set(
    [...priorLineIds].filter((lineId) => !activeLineIds.has(lineId)),
  );

  if (removedLineIds.size > 0) {
    finApproval.approval_items = (finApproval.approval_items || []).filter(
      (item) => !removedLineIds.has(String(item.order_item_id)),
    );
    if (!isSameDoc && adminApproval) {
      adminApproval.approval_items = (adminApproval.approval_items || []).filter(
        (item) => !removedLineIds.has(String(item.order_item_id)),
      );
    }
    order.order_items = (order.order_items || []).filter(
      (line) => !removedLineIds.has(String(line._id)),
    );
  }

  // A. Process Existing Items
  for (const item of finApproval.approval_items || []) {
    const key = String(item.order_item_id);
    const override = overrideByLine.get(key);
    if (!override) continue;

    const prevApprovedQty = Number(item.approved_quantity || 0);
    const nextApprovedQty = Number(override.approved_quantity ?? prevApprovedQty);
    const nextApprovedPrice = Number(override.approved_unit_price ?? item.approved_unit_price ?? 0);
    const remarks = override.remarks !== undefined ? override.remarks : item.remarks;

    item.approved_quantity = nextApprovedQty;
    item.approved_unit_price = nextApprovedPrice;
    item.remarks = remarks;

    const orderLine = (order.order_items || []).find((line) => String(line._id) === key);
    const discountPercent = Number(override.discount_percent ?? orderLine?.discount_percent ?? 0);
    const gstPercent = Number(override.gst_percent ?? orderLine?.gst_percent ?? 18);
    const freeQty = Number(override.free_quantity ?? orderLine?.free_quantity ?? 0);
    const rateType = override.applied_rate_type ?? orderLine?.applied_rate_type ?? 'MANUAL';

    const gross = nextApprovedQty * nextApprovedPrice;
    let disc = 0;
    if (discountPercent > 0) {
      disc = (gross * discountPercent) / 100;
    }
    const taxable = Math.max(0, gross - disc);
    const gst = (taxable * gstPercent) / 100;
    item.approved_total_amount = taxable + gst;

    const isIncrease = nextApprovedQty > prevApprovedQty;

    if (orderLine) {
      orderLine.approved_quantity = nextApprovedQty;

      if (isIncrease) {
        orderLine.ordered_quantity = Math.max(orderLine.ordered_quantity ?? 0, nextApprovedQty);
        orderLine.quantity = Math.max(orderLine.quantity ?? 0, nextApprovedQty);
      }

      orderLine.unit_price = nextApprovedPrice;
      orderLine.free_quantity = freeQty;
      orderLine.discount_percent = discountPercent;
      orderLine.discount_amount = disc;
      orderLine.gst_percent = gstPercent;
      orderLine.applied_rate_type = rateType;
    }

    const adminLine = (adminApproval.approval_items || []).find((line) => String(line.order_item_id) === key);
    if (adminLine) {
      if (isIncrease) {
        adminLine.approved_quantity = Math.max(adminLine.approved_quantity ?? 0, nextApprovedQty);
        adminLine.ordered_quantity = Math.max(adminLine.ordered_quantity ?? 0, nextApprovedQty);
      }

      adminLine.approved_unit_price = nextApprovedPrice;
      adminLine.free_quantity = freeQty;
      adminLine.discount_percent = discountPercent;
      adminLine.discount_amount = disc;
      adminLine.gst_percent = gstPercent;
      adminLine.applied_rate_type = rateType;

      const adminGross = adminLine.approved_quantity * adminLine.approved_unit_price;
      let adminDisc = 0;
      if (adminLine.discount_percent > 0) {
        adminDisc = (adminGross * adminLine.discount_percent) / 100;
      }
      adminLine.discount_amount = adminDisc;
      const adminTaxable = Math.max(0, adminGross - adminDisc);
      adminLine.approved_total_amount = adminTaxable + (adminTaxable * adminLine.gst_percent) / 100;
    }
  }

  // B. Process New Items
  for (const newItem of newItems) {
    const productId = newItem.product;
    const approvedQty = Number(newItem.approved_quantity || 0);
    const approvedPrice = Number(newItem.approved_unit_price || 0);
    const freeQty = Number(newItem.free_quantity || 0);
    const discountPercent = Number(newItem.discount_percent || 0);
    const gstPercent = Number(newItem.gst_percent ?? 18);
    const rateType = newItem.applied_rate_type || 'MANUAL';
    const remarks = newItem.remarks || '';

    if (!productId || approvedQty <= 0) continue;

    const product = await Product.findById(productId)
      .select('product_name sku gst_percent brand manufacturer unit hsn_code base_price')
      .lean();

    order.order_items.push({
      product: productId,
      product_name: product?.product_name || newItem.product_name || '',
      sku: product?.sku || newItem.sku || '',
      brand: product?.brand || '',
      manufacturer: product?.manufacturer || '',
      unit: product?.unit || '',
      hsn_code: product?.hsn_code || '',
      gst_percent: gstPercent,
      ordered_quantity: approvedQty,
      quantity: approvedQty,
      approved_quantity: approvedQty,
      free_quantity: freeQty,
      unit_price: approvedPrice,
      discount_percent: discountPercent,
      discount_amount: 0,
      applied_rate_type: rateType,
      manual_price_override: true,
      line_status: 'active',
    });

    const addedOrderLine = order.order_items[order.order_items.length - 1];
    const orderItemId = addedOrderLine._id;

    const gross = approvedQty * approvedPrice;
    let disc = 0;
    if (discountPercent > 0) {
      disc = (gross * discountPercent) / 100;
    }
    addedOrderLine.discount_amount = disc;
    const taxable = Math.max(0, gross - disc);
    const totalAmount = taxable + (taxable * gstPercent) / 100;

    if (isSameDoc) {
      finApproval.approval_items.push({
        order_item_id: orderItemId,
        product: productId,
        ordered_quantity: approvedQty,
        ordered_unit_price: approvedPrice,
        ordered_total_amount: totalAmount,
        approved_quantity: approvedQty,
        approved_unit_price: approvedPrice,
        approved_total_amount: totalAmount,
        applied_rate_type: rateType,
        manual_price_override: true,
        rate_mapped: true,
        free_quantity: freeQty,
        discount_percent: discountPercent,
        discount_amount: disc,
        gst_percent: gstPercent,
        remarks: remarks,
      });
    } else {
      adminApproval.approval_items.push({
        order_item_id: orderItemId,
        product: productId,
        ordered_quantity: approvedQty,
        ordered_unit_price: approvedPrice,
        ordered_total_amount: totalAmount,
        approved_quantity: approvedQty,
        approved_unit_price: approvedPrice,
        approved_total_amount: totalAmount,
        applied_rate_type: rateType,
        manual_price_override: true,
        rate_mapped: true,
        free_quantity: freeQty,
        discount_percent: discountPercent,
        discount_amount: disc,
        gst_percent: gstPercent,
        remarks: remarks,
      });

      finApproval.approval_items.push({
        order_item_id: orderItemId,
        product: productId,
        ordered_quantity: approvedQty,
        ordered_unit_price: approvedPrice,
        ordered_total_amount: totalAmount,
        approved_quantity: approvedQty,
        approved_unit_price: approvedPrice,
        approved_total_amount: totalAmount,
        remarks: remarks,
      });
    }
  }

  recalcCommercials(order);
  order.finance_approval_status = fulfillmentService.deriveFinanceApprovalStatus(order.order_items);
  normalizeOrderWorkflowFields(order);
  order.markModified('order_items');
  await order.save();

  if (!isSameDoc) {
    adminApproval.approved_total_amount = (adminApproval.approval_items || []).reduce(
      (sum, item) => sum + Number(item.approved_total_amount || 0),
      0,
    );
    adminApproval.ordered_total_amount = (adminApproval.approval_items || []).reduce(
      (sum, item) => sum + Number(item.ordered_total_amount || 0),
      0,
    );
    adminApproval.markModified('approval_items');
    await adminApproval.save();
  }

  finApproval.approved_total_amount = (finApproval.approval_items || []).reduce(
    (sum, item) => sum + Number(item.approved_total_amount || 0),
    0,
  );
  finApproval.ordered_total_amount = (finApproval.approval_items || []).reduce(
    (sum, item) => sum + Number(item.ordered_total_amount || 0),
    0,
  );
  finApproval.rejected_total_amount = finApproval.ordered_total_amount - finApproval.approved_total_amount;

  const note = body.amendment_notes;
  if (note) {
    const stamp = `[Admin amend ${new Date().toISOString().slice(0, 10)}] ${note}`;
    finApproval.approval_notes = finApproval.approval_notes ? `${finApproval.approval_notes}\n${stamp}` : stamp;
  }
  finApproval.reviewed_by = user._id;
  finApproval.reviewed_at = new Date();
  finApproval.admin_amended = true;
  finApproval.admin_amended_by = user._id;
  finApproval.admin_amended_at = new Date();

  if (!isSameDoc) {
    adminApproval.admin_amended = true;
    adminApproval.admin_amended_by = user._id;
    adminApproval.admin_amended_at = new Date();
  }

  finApproval.markModified('approval_items');
  await finApproval.save();

  await fulfillmentService.recomputeApprovedQuantitiesFromFinance(order._id);

  const { OrderAmmendmentUser: AmendmentModel } = getModels();
  await AmendmentModel.create({
    order_approval: finApproval._id,
    department: 'admin',
    ammended_by: user._id,
    ammended_at: new Date(),
  });

  await activityService.create({
    actor: user._id,
    entity_type: 'approval',
    entity_id: finApproval._id,
    action: 'updated',
    message: `Finance approval ${finApproval.approval_no} amended by admin`,
  });

  return get(id);
}

async function listDeleted({ order } = {}) {
  const q = {};
  if (order) q.order = order;
  const rows = await listDeletedLean(getModels().OrderApproval, q);
  return rows.map(row => toPlain(addDerivedStatus(row)));
}

async function softDelete(id, user) {
  const doc = await softDeleteActiveById(getModels().OrderApproval, id, { notFoundMessage: APPROVAL_NF });
  const plain = toPlain(doc.toObject());
  const prefix = plain.is_admin_approved ? 'finance' : 'admin';
  await activityService.create({
    actor: user._id,
    entity_type: 'approval',
    entity_id: plain._id,
    action: 'deleted',
    message: `Order ${prefix} approval ${plain.approval_no} soft-deleted`,
  });
  return plain;
}

async function restore(id, user) {
  const doc = await restoreSoftDeletedById(getModels().OrderApproval, id, { notFoundMessage: APPROVAL_NF });
  const plain = toPlain(doc.toObject());
  const prefix = plain.is_admin_approved ? 'finance' : 'admin';
  await activityService.create({
    actor: user._id,
    entity_type: 'approval',
    entity_id: plain._id,
    action: 'restored',
    message: `Order ${prefix} approval ${plain.approval_no} restored`,
  });
  return plain;
}

async function reopenResolvedDispatchReleasesForOrder(orderId, dispatchId) {
  const { OrderApproval, OrderDispatch } = getModels();
  const { aggregateDispatchReturnsByOrderLine } = require('../../utils/returnSettlement');

  const dispatches = await OrderDispatch.find({
    order: orderId,
    deletedAt: null,
    dispatch_status: { $ne: 'cancelled' },
  }).lean();

  const approvalIds = new Set();
  if (dispatchId) {
    const linked = dispatches.find((row) => String(row._id) === String(dispatchId));
    const aid = String(linked?.finance_approval?._id ?? linked?.finance_approval ?? '');
    if (aid) approvalIds.add(aid);
  } else {
    for (const disp of dispatches) {
      const hasReturn = (disp.dispatch_items || []).some(
        (item) => Number(item.returned_quantity || 0) > 0,
      );
      if (!hasReturn) continue;
      const aid = String(disp.finance_approval?._id ?? disp.finance_approval ?? '');
      if (aid) approvalIds.add(aid);
    }
  }

  if (approvalIds.size === 0) return { reopened: 0 };

  const toReopen = [];
  for (const approvalId of approvalIds) {
    const approval = await OrderApproval.findOne({
      _id: approvalId,
      order: orderId,
      deletedAt: null,
      dispatch_release_resolved: true,
    }).lean();
    if (!approval) continue;

    const releaseDispatches = dispatches.filter(
      (row) => String(row.finance_approval?._id ?? row.finance_approval ?? '') === approvalId,
    );
    const returnsByLine = aggregateDispatchReturnsByOrderLine(releaseDispatches);
    if (releaseHasUnsettledDispatchReturns(approval.approval_items, returnsByLine)) {
      toReopen.push(approvalId);
    }
  }

  if (toReopen.length === 0) return { reopened: 0 };

  const result = await OrderApproval.updateMany(
    {
      _id: { $in: toReopen },
      order: orderId,
      deletedAt: null,
      dispatch_release_resolved: true,
    },
    {
      $set: { dispatch_release_resolved: false },
      $unset: { dispatch_release_resolved_by: 1, dispatch_release_resolved_at: 1 },
    },
  );

  return { reopened: result.modifiedCount };
}

async function processOrderApprovalJob({ type, payload = {} }) {
  switch (type) {
    case 'create_order_approval': {
      const { body, user } = payload;
      if (!body || !body.order) throw new Error('create_order_approval requires body.order');
      return createAdminApproval(body, user);
    }
    default:
      throw new Error(`Unknown order approval job type: ${type}`);
  }
}

module.exports = {
  list,
  get,
  create,
  patch,
  approve,
  reject,
  sendToFinance,
  sendToAccount,
  amendByFinance,
  amendByAccount,
  resolvePartialDispatchByAccount,
  reopenResolvedDispatchReleasesForOrder,
  amend,
  listDeleted,
  softDelete,
  restore,
  syncOrderItemsForAdminApproval,
  processOrderApprovalJob,
};
