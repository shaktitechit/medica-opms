/**
 * @fileoverview Order finance approval execution helpers.
 * @module modules/orderFinanceApproval/orderFinanceApproval.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const { softDeleteActiveById, restoreSoftDeletedById, listDeletedLean } = require('../../utils/mongoSoftDelete');
const activityService = require('../activity/activity.service');
const workflowService = require('../workflow/workflow.service');
const fulfillmentService = require('../orders/orderFulfillment.service');

const APPROVAL_NF = 'Order finance approval not found';

function generateApprovalNo() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `OFA-${ts}-${rand}`;
}

function orderedLineTotal(line) {
  return Number(line.total_amount ?? line.taxable_amount ?? 0);
}

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

function approvalItemsFromOrder(order, bodyItems = [], { remainingOnly = false } = {}) {
  const overrideByLine = new Map(bodyItems.map((item) => [String(item.order_item_id), item]));

  return (order.order_items || []).map((line) => {
    const override = overrideByLine.get(String(line._id)) || {};
    const orderedQuantity = Number(line.ordered_quantity ?? line.quantity ?? 0);
    const alreadyApproved = Number(line.approved_quantity ?? 0);
    const remainingQuantity = Math.max(0, orderedQuantity - alreadyApproved);
    const baselineQuantity = remainingOnly ? remainingQuantity : orderedQuantity;

    if (remainingOnly && baselineQuantity === 0) {
      return null;
    }

    const orderedUnitPrice = Number(line.unit_price || 0);
    const orderedTotalAmount = orderedLineTotal(line);
    let approvedQuantity = Number(
      override.approved_quantity ?? (remainingOnly ? remainingQuantity : orderedQuantity),
    );
    approvedQuantity = Math.max(0, Math.min(approvedQuantity, remainingOnly ? remainingQuantity : orderedQuantity));

    const approvedUnitPrice = Number(override.approved_unit_price ?? orderedUnitPrice);
    let itemApprovalStatus = override.approval_status;
    if (!itemApprovalStatus) {
      if (approvedQuantity === 0) itemApprovalStatus = 'rejected';
      else if (approvedQuantity >= (remainingOnly ? remainingQuantity : orderedQuantity)) {
        itemApprovalStatus = 'fully_approved';
      } else {
        itemApprovalStatus = 'partially_approved';
      }
    }

    return {
      order_item_id: line._id,
      product: line.product,
      ordered_quantity: remainingOnly ? remainingQuantity : orderedQuantity,
      ordered_unit_price: orderedUnitPrice,
      ordered_total_amount: orderedTotalAmount,
      approved_quantity: approvedQuantity,
      approved_unit_price: approvedUnitPrice,
      approved_total_amount: Number(override.approved_total_amount ?? approvedQuantity * approvedUnitPrice),
      approval_status: itemApprovalStatus,
      rejection_reason: override.rejection_reason || '',
      hold_reason: override.hold_reason || '',
      remarks: override.remarks || '',
    };
  }).filter(Boolean);
}

async function list({ order, approval_status } = {}) {
  const q = {};
  if (order) q.order = order;
  if (approval_status) q.approval_status = approval_status;
  const rows = await getModels().OrderFinanceApproval.find(q)
    .populate('approval_items.product', 'product_name sku')
    .sort({ createdAt: -1 })
    .lean();
  return rows.map(toPlain);
}

async function get(id) {
  const row = await getModels().OrderFinanceApproval.findById(id)
    .populate('approval_items.product', 'product_name sku')
    .lean();
  if (!row) throw new ApiError(404, APPROVAL_NF);
  return toPlain(row);
}

async function create(body, user) {
  const { Order, OrderFinanceApproval, OrderApproval } = getModels();
  const order = await Order.findById(body.order).lean();
  if (!order) throw new ApiError(404, 'Order not found');

  const plainOrder = toPlain(order);
  const existingApprovals = await OrderFinanceApproval.find({ order: body.order, deletedAt: null })
    .sort({ revision_number: -1 })
    .limit(1)
    .lean();
  const nextRevision = existingApprovals.length
    ? Number(existingApprovals[0].revision_number || 0) + 1
    : Number(order.current_revision || 1);

  const remainingOnly = nextRevision > 1;
  const approvalItems = approvalItemsFromOrder(plainOrder, body.approval_items || [], { remainingOnly });
  if (approvalItems.length === 0) {
    throw new ApiError(400, 'No remaining quantities available for finance approval');
  }

  const orderedTotalAmount = approvalItems.reduce(
    (sum, item) => sum + Number(item.ordered_total_amount || 0),
    0,
  );

  const doc = await OrderFinanceApproval.create({
    approval_no: body.approval_no || generateApprovalNo(),
    order: body.order,
    revision_number: body.revision_number || nextRevision,
    approval_status: 'pending_review',
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

  // Create a pending OrderApproval record for general history log audit trail
  await OrderApproval.create({
    order: body.order,
    department: 'finance',
    approval_type: 'finance_approval',
    status: 'pending',
    remarks: body.approval_notes || `Finance approval ${doc.approval_no} created`,
  });

  // Standard transition using workflow engine to move the stage to review first
  await workflowService.transitionOrderStatus({
    orderId: body.order,
    nextStatus: 'finance_review',
    userId: user._id,
    remarks: body.approval_notes || `Finance approval ${doc.approval_no} created`,
    _systemCall: true,
  });

  // Immediately decide/approve the request
  const allRejected = approvalItems.length > 0 && approvalItems.every(item => item.approval_status === 'rejected');
  const decision = allRejected ? 'rejected' : 'approved';
  
  const result = await decide(doc._id, decision, {
    approval_notes: body.approval_notes,
    rejection_reason: body.rejection_reason || body.approval_notes,
    approved_total_amount: body.approved_total_amount,
  }, user);

  return result;
}

async function patch(id, patchBody, user) {
  const doc = await getModels().OrderFinanceApproval.findById(id);
  if (!doc) throw new ApiError(404, APPROVAL_NF);

  const patch = patchBody || {};
  for (const field of [
    'approval_status',
    'ordered_total_amount',
    'approved_total_amount',
    'rejected_total_amount',
    'credit_limit_checked',
    'outstanding_checked',
    'risk_level',
    'approval_notes',
    'rejection_reason',
    'hold_reason',
  ]) {
    if (patch[field] !== undefined) doc[field] = patch[field];
  }
  if (Array.isArray(patch.approval_items)) doc.approval_items = patch.approval_items;
  doc.reviewed_by = user._id;
  doc.reviewed_at = new Date();
  await doc.save();
  return toPlain(doc.toObject());
}

async function decide(id, decision, body, user) {
  const { Order, OrderFinanceApproval, OrderApproval, OrderWorkflow } = getModels();
  const doc = await OrderFinanceApproval.findById(id);
  if (!doc) throw new ApiError(404, APPROVAL_NF);

  const isRejected = decision === 'rejected';
  if (isRejected && !(body?.rejection_reason || doc.rejection_reason)) {
    throw new ApiError(400, 'Finance rejection must include rejection_reason');
  }

  let finalStatus = 'fully_approved';
  if (isRejected) {
    finalStatus = 'rejected';
  } else if (doc.approval_items && doc.approval_items.length > 0) {
    for (const item of doc.approval_items) {
      const orderedQty = Number(item.ordered_quantity || 0);
      const approvedQty = Number(item.approved_quantity || 0);
      if (item.approval_status === 'pending' || !item.approval_status) {
        if (approvedQty <= 0) item.approval_status = 'rejected';
        else if (approvedQty >= orderedQty) item.approval_status = 'fully_approved';
        else item.approval_status = 'partially_approved';
      }
    }

    const allRejected = doc.approval_items.every((item) => item.approval_status === 'rejected');
    const allFullyApproved = doc.approval_items.every(
      (item) => item.approval_status === 'fully_approved',
    );
    const hasPartial = doc.approval_items.some(
      (item) => item.approval_status === 'partially_approved' || item.approval_status === 'rejected',
    );

    if (allRejected) {
      finalStatus = 'rejected';
    } else if (allFullyApproved && !hasPartial) {
      finalStatus = 'fully_approved';
    } else {
      finalStatus = 'partially_approved';
    }
  }

  // Force all items to rejected if parent is rejected
  if (isRejected && doc.approval_items && doc.approval_items.length > 0) {
    for (const item of doc.approval_items) {
      item.approval_status = 'rejected';
    }
  }

  doc.approval_status = finalStatus;
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
    // Preserve doc values unless explicitly overridden in body (e.g. during custom endpoints/calls)
    if (body?.approved_total_amount !== undefined) {
      doc.approved_total_amount = Number(body.approved_total_amount);
      doc.rejected_total_amount = doc.ordered_total_amount - doc.approved_total_amount;
    }
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
        await refreshed.save();
      }
    } else if (isRejected || finalStatus === 'rejected') {
      order.finance_approval_status = 'rejected';
      await order.save();
    }

    const updatedOrder = await Order.findById(order._id);
    const allApproved = (updatedOrder?.order_items || []).every((item) => {
      return Number(item.approved_quantity || 0) >= Number(item.ordered_quantity ?? item.quantity ?? 0);
    });

    const nextStatus = (isRejected || finalStatus === 'rejected')
      ? 'finance_rejected'
      : (allApproved ? 'fully_finance_approved' : 'partially_finance_approved');

    await workflowService.transitionOrderStatus({
      orderId: order._id,
      nextStatus,
      userId: user._id,
      remarks: body?.approval_notes || body?.rejection_reason || '',
      rejectionReason: isRejected ? (body?.rejection_reason || doc.rejection_reason) : undefined,
      _systemCall: true,
    });

    if (isApprovedOrPartial && updatedOrder) {
      await fulfillmentService.applyFinanceWorkflowAction(updatedOrder);
      await updatedOrder.save();

      await OrderWorkflow.create({
        order: order._id,
        action_by: user._id,
        role: 'finance',
        action: allApproved ? 'fully_finance_approved' : 'partially_finance_approved',
        to_stage: 'dispatch_review',
        to_status: allApproved ? 'fully_finance_approved' : 'partially_finance_approved',
        remarks: body?.approval_notes || '',
        revision_number: doc.revision_number,
        metadata: {
          entity_type: 'OrderFinanceApproval',
          entity_id: String(doc._id),
          approval_no: doc.approval_no,
          finance_approval_status: allApproved ? 'full' : 'partial',
        },
      });
    }
  }

  // Update general OrderApproval log status
  const generalApproval = await OrderApproval.findOne({
    order: doc.order,
    department: 'finance',
    approval_type: 'finance_approval',
    status: 'pending',
  });
  if (generalApproval) {
    generalApproval.status = (isRejected || finalStatus === 'rejected') ? 'rejected' : 'approved';
    if (isRejected || finalStatus === 'rejected') {
      generalApproval.rejected_by = user._id;
      generalApproval.rejected_at = new Date();
      generalApproval.rejection_reason = body?.rejection_reason || doc.rejection_reason || '';
    } else {
      generalApproval.approved_by = user._id;
      generalApproval.approved_at = new Date();
      generalApproval.remarks = body?.approval_notes || doc.approval_notes || '';
    }
    await generalApproval.save();
  }

  await activityService.create({
    actor: user._id,
    entity_type: 'approval',
    entity_id: doc._id,
    action: (isRejected || finalStatus === 'rejected') ? 'rejected' : 'approved',
    message: `Order finance approval ${doc.approval_no} ${(isRejected || finalStatus === 'rejected') ? 'rejected' : 'approved'}`,
  });

  const populated = await OrderFinanceApproval.findById(doc._id)
    .populate('approval_items.product', 'product_name sku')
    .lean();
  return toPlain(populated);
}

async function approve(id, body, user) {
  return decide(id, 'approved', body, user);
}

async function reject(id, body, user) {
  return decide(id, 'rejected', body, user);
}

async function listDeleted({ order } = {}) {
  const q = {};
  if (order) q.order = order;
  const rows = await listDeletedLean(getModels().OrderFinanceApproval, q);
  return rows.map(toPlain);
}

async function softDelete(id, user) {
  const doc = await softDeleteActiveById(getModels().OrderFinanceApproval, id, { notFoundMessage: APPROVAL_NF });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'approval',
    entity_id: plain._id,
    action: 'deleted',
    message: `Order finance approval ${plain.approval_no} soft-deleted`,
  });
  return plain;
}

async function restore(id, user) {
  const doc = await restoreSoftDeletedById(getModels().OrderFinanceApproval, id, { notFoundMessage: APPROVAL_NF });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'approval',
    entity_id: plain._id,
    action: 'restored',
    message: `Order finance approval ${plain.approval_no} restored`,
  });
  return plain;
}

module.exports = {
  list,
  get,
  create,
  patch,
  approve,
  reject,
  listDeleted,
  softDelete,
  restore,
};
