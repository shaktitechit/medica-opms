/**
 * @fileoverview Order dispatch execution helpers backed by OrderDispatch.
 * @module modules/dispatch/dispatch.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const { generateDispatchNo } = require('../../utils/generateDispatchNo');
const { softDeleteActiveById, restoreSoftDeletedById, listDeletedLean } = require('../../utils/mongoSoftDelete');
const activityService = require('../activity/activity.service');
const attachmentService = require('../attachments/attachment.service');
const workflowService = require('../workflow/workflow.service');
const orderQueue = require('../../queues/order.queue');
const { API_PUBLIC_BASE_URL, FILE_DOCUMENT_LINKS_RELATIVE } = require('../../config/fileManagement');
const { uploadMulterFile, getFileMeta } = require('../../services/fileManagement/index');
const { assertOrderEligibleForDispatchPhase } = require('./dispatch.policy');
const fulfillmentService = require('../orders/orderFulfillment.service');
const {
  aggregateReleaseReturnsByOrderLine,
  aggregateReceivedReturnsByOrderLine,
  lineAtWarehouseQty,
  computeLineDispatchAvailability,
  getReleaseDispatchIds,
  refId,
} = require('../../utils/returnSettlement');
const { ORDER_RETURN_STATUS } = require('../../constants/orderReturnStatus');

const DISP_NF = 'Order dispatch not found';

async function enqueuePostDispatchJobs(orderId, userId) {
  const oid = String(orderId);
  await orderQueue.enqueue({
    type: 'recalculate_fulfillment',
    payload: { orderId: oid, userId: userId ? String(userId) : undefined },
  });
}

async function attachBillDocument(file, dispatchId, user, billNumber) {
  const fileId = await uploadMulterFile(file, 'dispatch', String(dispatchId));
  const meta = await getFileMeta(fileId);
  const base = FILE_DOCUMENT_LINKS_RELATIVE ? '' : API_PUBLIC_BASE_URL;
  const attachment = await attachmentService.create({
    original_name: meta.originalName || file.originalname,
    file_name: meta.originalName || file.originalname,
    mime_type: meta.mimeType || file.mimetype,
    size: meta.sizeBytes || file.size,
    storage_provider: 'minio',
    bucket: meta.bucket || 'company-files',
    key: meta.objectKey || fileId,
    url: `${base}/api/files/${fileId}/view`,
    entity_type: 'dispatch',
    entity_id: String(dispatchId),
    remarks: billNumber ? `Bill ${billNumber}` : 'Bill document',
  }, user);
  return attachment._id;
}

function assertBillingPayload(body, file) {
  if (!String(body.bill_number || '').trim()) {
    throw new ApiError(400, 'Bill number is required');
  }
  if (!body.billing_date) {
    throw new ApiError(400, 'Billing date is required');
  }
  if (!file && !body.bill_document) {
    throw new ApiError(400, 'Bill document is required');
  }
}

function isObjectId(value) {
  return typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value);
}

function resolveWarehouseFields(body = {}) {
  const rawWarehouse = body.warehouse;
  const rawLocation = body.warehouse_location;
  const warehouseRef =
    rawWarehouse && isObjectId(String(rawWarehouse)) ? String(rawWarehouse) : undefined;
  const locationFromWarehouse =
    rawWarehouse && !warehouseRef ? String(rawWarehouse).trim() : '';
  const warehouseLocation = String(rawLocation || locationFromWarehouse || '').trim();

  return {
    warehouse: warehouseRef,
    warehouse_location: warehouseLocation || undefined,
  };
}

function getOrderedQuantity(line) {
  return Number(line.ordered_quantity ?? line.quantity ?? 0);
}

function normalizeDispatchStatus(value, fallback = 'draft') {
  const allowed = new Set([
    'draft',
    'allocation_pending',
    'allocated',
    'packing',
    'partially_dispatched',
    'fully_dispatched',
    'cancelled',
  ]);
  return allowed.has(value) ? value : fallback;
}

function findOrderLineForDispatch(order, raw, approval = null) {
  const requestedId = String(raw.order_item_id || '');
  if (requestedId) {
    const byId = (order.order_items || []).find((item) => String(item._id) === requestedId);
    if (byId) return byId;
  }

  const productId = String(raw.product?._id || raw.product || '');
  if (productId) {
    const byProduct = (order.order_items || []).find(
      (item) => String(item.product?._id || item.product) === productId,
    );
    if (byProduct) return byProduct;
  }

  if (approval && requestedId) {
    const approvalItem = (approval.approval_items || []).find(
      (item) => String(item.order_item_id) === requestedId,
    );
    const approvalProductId = String(approvalItem?.product?._id || approvalItem?.product || '');
    if (approvalProductId) {
      const byApprovalProduct = (order.order_items || []).find(
        (item) => String(item.product?._id || item.product) === approvalProductId,
      );
      if (byApprovalProduct) return byApprovalProduct;
    }
  }

  return null;
}

function normalizeItems(order, rawItems, excludeDispatchId = null, approval = null) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new ApiError(400, 'dispatch_items[] or items[] required');
  }

  return rawItems.map((raw) => {
    const line = findOrderLineForDispatch(order, raw, approval);
    if (!line) {
      throw new ApiError(400, `Unknown order_item_id ${raw.order_item_id}`);
    }

    const dispatchedQuantity = Number(raw.dispatched_quantity ?? raw.dispatch_quantity ?? 0);
    const allocatedQuantity = Number(raw.allocated_quantity ?? dispatchedQuantity);
    if (dispatchedQuantity < 0 || allocatedQuantity < 0) {
      throw new ApiError(400, 'Dispatch quantities cannot be negative');
    }

    return {
      order_item_id: line._id,
      product: raw.product || line.product,
      batch: raw.batch || undefined,
      allocated_quantity: allocatedQuantity,
      dispatched_quantity: dispatchedQuantity,
      delivered_quantity: Number(raw.delivered_quantity || 0),
      remarks: raw.remarks || '',
    };
  });
}

async function assertDispatchReleaseEligible(approvalId) {
  if (!approvalId) return;
  const approval = await getModels().OrderApproval.findOne({
    _id: approvalId,
    deletedAt: null,
  }).lean();
  if (!approval) throw new ApiError(404, 'Approval release not found');
  if (!approval.is_admin_approved) {
    throw new ApiError(400, 'Admin approval must be completed before dispatch');
  }
  if (!approval.is_finance_approved) {
    throw new ApiError(400, 'Finance approval must be completed before dispatch');
  }
  if (!approval.is_account_approved) {
    throw new ApiError(400, 'Account approval must be completed before dispatch');
  }
  if (approval.dispatch_release_resolved) {
    throw new ApiError(400, 'This release has been resolved; no further dispatches are allowed');
  }
}

async function validateDispatchItems(order, rawItems, excludeDispatchId = null, financeApprovalId = null) {
  const { OrderDispatch, OrderApproval } = getModels();
  if (financeApprovalId) {
    await assertDispatchReleaseEligible(financeApprovalId);
  }
  const dispatches = await OrderDispatch.find({
    order: order._id,
    deletedAt: null,
    dispatch_status: { $ne: 'cancelled' },
  }).lean();

  let alreadyDispatchedByLine = fulfillmentService.aggregateDispatchedByLine(dispatches, excludeDispatchId);
  let approval = null;
  if (financeApprovalId) {
    approval = await OrderApproval.findOne({ _id: financeApprovalId, deletedAt: null }).lean();
    if (!approval) throw new ApiError(404, 'Approval release not found');
    alreadyDispatchedByLine = fulfillmentService.aggregateDispatchedByLineForRelease(
      dispatches,
      financeApprovalId,
      excludeDispatchId,
      order,
      approval,
    );
  }

  const normalized = normalizeItems(order, rawItems, excludeDispatchId, approval);
  fulfillmentService.assertDispatchItemQuantities(order, normalized, alreadyDispatchedByLine, {
    approval,
    approvalOnly: Boolean(financeApprovalId),
  });
  return normalized;
}

async function consumeReturnQtyForReleaseDispatch(orderId, financeApprovalId, dispatchItems) {
  if (!financeApprovalId) return;

  const { Order, OrderApproval, OrderDispatch, OrderReturn } = getModels();
  const [orderDoc, approvalDoc, dispatches] = await Promise.all([
    Order.findById(orderId),
    OrderApproval.findOne({ _id: financeApprovalId, deletedAt: null }),
    OrderDispatch.find({ order: orderId, deletedAt: null, dispatch_status: { $ne: 'cancelled' } }).lean(),
  ]);
  if (!orderDoc || !approvalDoc) return;

  const returnDocs = await OrderReturn.find({ order: orderId, deletedAt: null });
  const returnsByLine = aggregateReleaseReturnsByOrderLine(
    returnDocs.map((row) => row.toObject()),
    dispatches,
    financeApprovalId,
  );

  const dispatchedByLine = fulfillmentService.aggregateDispatchedByLineForRelease(
    dispatches,
    financeApprovalId,
  );
  const releaseDispatchIds = getReleaseDispatchIds(dispatches, financeApprovalId);
  const dispatchById = {};
  for (const dispatch of dispatches) {
    dispatchById[refId(dispatch._id)] = dispatch;
  }

  for (const item of dispatchItems) {
    const key = String(item.order_item_id);
    const requested = Number(item.dispatched_quantity || 0);
    const approvalItem = (approvalDoc.approval_items || []).find(
      (row) => String(row.order_item_id) === key,
    );
    if (!approvalItem || requested <= 0) continue;

    const approved = Number(approvalItem.approved_quantity || 0);
    const orderLine = (orderDoc.order_items || []).find((line) => String(line._id) === key);
    const atWarehouse = lineAtWarehouseQty(key, approvalItem, orderLine, returnsByLine);
    const dispatched = Number(dispatchedByLine[key] || 0);
    const { remaining } = computeLineDispatchAvailability(approved, dispatched - requested, atWarehouse);
    const fromRemaining = Math.min(requested, remaining);
    const fromReturn = Math.min(Math.max(0, requested - fromRemaining), atWarehouse);

    if (fromReturn <= 0) continue;

    approvalItem.return_item_qty = Math.max(0, Number(approvalItem.return_item_qty || 0) - fromReturn);
    if (orderLine) {
      const orderReturn = Math.max(
        Number(orderLine.return_item_qty || 0),
        Number(orderLine.returned_quantity || 0),
      );
      const next = Math.max(0, orderReturn - fromReturn);
      orderLine.return_item_qty = next;
      orderLine.returned_quantity = next;
    }

    let toConsume = fromReturn;
    for (const retDoc of returnDocs) {
      if (toConsume <= 0) break;
      if (!releaseDispatchIds.has(refId(retDoc.dispatch))) continue;
      if (retDoc.return_status !== ORDER_RETURN_STATUS.RECEIVED_AT_WAREHOUSE) continue;

      const linkedDispatch = dispatchById[refId(retDoc.dispatch)];
      if (!linkedDispatch) continue;

      const dispatchItemsOnRelease = Array.isArray(linkedDispatch.dispatch_items)
        ? linkedDispatch.dispatch_items
        : [];
      const matchesLine = dispatchItemsOnRelease.some(
        (di) => refId(di.order_item_id) === key,
      );
      if (!matchesLine) continue;

      let changed = false;
      for (const returnItem of retDoc.return_items || []) {
        if (toConsume <= 0) break;
        const currentQty = Number(returnItem.returned_quantity || 0);
        if (currentQty <= 0) continue;

        const take = Math.min(currentQty, toConsume);
        returnItem.returned_quantity = currentQty - take;
        toConsume -= take;
        changed = true;
      }

      if (changed) {
        const remainingQty = (retDoc.return_items || []).reduce(
          (sum, row) => sum + Number(row.returned_quantity || 0),
          0,
        );
        if (remainingQty <= 0) {
          retDoc.deletedAt = new Date();
        }
        retDoc.markModified('return_items');
        await retDoc.save();
      }
    }
  }

  const refreshedReturns = await OrderReturn.find({ order: orderId, deletedAt: null }).lean();
  const refreshedReleaseByLine = aggregateReleaseReturnsByOrderLine(
    refreshedReturns,
    dispatches,
    financeApprovalId,
  );
  const refreshedOrderByLine = aggregateReceivedReturnsByOrderLine(refreshedReturns, dispatches);

  for (const approvalItem of approvalDoc.approval_items || []) {
    const key = String(approvalItem.order_item_id);
    approvalItem.return_item_qty = Number(refreshedReleaseByLine[key] || 0);
  }
  for (const line of orderDoc.order_items || []) {
    const key = String(line._id);
    const next = Number(refreshedOrderByLine[key] || 0);
    line.return_item_qty = next;
    line.returned_quantity = next;
  }

  approvalDoc.total_return = (approvalDoc.approval_items || []).reduce(
    (sum, row) => sum + Number(row.return_item_qty || 0),
    0,
  );
  orderDoc.total_return = (orderDoc.order_items || []).reduce(
    (sum, line) => sum + Number(line.return_item_qty || 0),
    0,
  );
  approvalDoc.markModified('approval_items');
  orderDoc.markModified('order_items');
  await approvalDoc.save();
  await orderDoc.save();
}

async function list({ order, dispatch_status } = {}) {
  const q = {};
  if (order) q.order = order;
  if (dispatch_status) q.dispatch_status = dispatch_status;
  const rows = await getModels().OrderDispatch.find(q)
    .populate('finance_approval', 'approval_no')
    .populate('bill_document', 'original_name url mime_type')
    .populate('dispatch_assignee_user', 'name username email department')
    .sort({ createdAt: -1 })
    .lean();
  return rows.map(toPlain);
}

async function get(id) {
  const row = await getModels().OrderDispatch.findById(id)
    .populate('finance_approval')
    .populate('bill_document', 'original_name url mime_type')
    .populate('dispatch_assignee_user', 'name username email department')
    .lean();
  if (!row) throw new ApiError(404, DISP_NF);
  return toPlain(row);
}

async function recalculateOrderDispatchState(orderId, user) {
  const state = await fulfillmentService.recalculateFromExecutions(orderId, user);
  return {
    order: state.order,
    fullyDispatched: state.fullyDispatched,
  };
}

function allocateNetDispatchedAcrossReleaseItems(dispatchDocs, netSettledByLine) {
  const lineIds = new Set();
  for (const doc of dispatchDocs) {
    for (const item of doc.dispatch_items || []) {
      lineIds.add(String(item.order_item_id));
    }
  }

  for (const lineId of lineIds) {
    let remaining = Number(netSettledByLine.get(lineId) || 0);
    for (const doc of dispatchDocs) {
      for (const item of doc.dispatch_items || []) {
        if (String(item.order_item_id) !== lineId) continue;
        const current = Number(item.dispatched_quantity || 0);
        const next = Math.min(current, Math.max(0, remaining));
        item.dispatched_quantity = next;
        item.delivered_quantity = Math.min(Number(item.delivered_quantity || 0), next);
        remaining -= next;
      }
    }
  }
}

async function settleReleaseDispatchFulfillment(releaseDispatches, netSettledByLine) {
  if (!Array.isArray(releaseDispatches) || releaseDispatches.length === 0) return;

  const { OrderDispatch } = getModels();
  const ids = releaseDispatches.map((row) => row._id);
  const dispatchDocs = await OrderDispatch.find({
    _id: { $in: ids },
    deletedAt: null,
    dispatch_status: { $ne: 'cancelled' },
  }).sort({ createdAt: 1 });

  allocateNetDispatchedAcrossReleaseItems(dispatchDocs, netSettledByLine);

  for (const doc of dispatchDocs) {
    doc.dispatch_status = 'fully_dispatched';
    doc.markModified('dispatch_items');
    await doc.save();
  }
}

async function create(body, user, options = {}) {
  const { Order, OrderDispatch } = getModels();
  const orderDoc = await Order.findById(body.order);
  if (!orderDoc) throw new ApiError(404, 'Order not found');

  const order = toPlain(orderDoc.toObject());
  assertOrderEligibleForDispatchPhase(order);

  if (!body.finance_approval) {
    throw new ApiError(400, 'Dispatch must be linked to an order approval release');
  }

  const file = options.file || null;
  if (user.department === 'account' || file) {
    assertBillingPayload(body, file);
  }

  const dispatchItems = await validateDispatchItems(
    order,
    body.dispatch_items || body.items,
    null,
    body.finance_approval || null,
  );
  const requestedStatus = normalizeDispatchStatus(body.dispatch_status || body.status, null);

  const warehouseFields = resolveWarehouseFields(body);

  const doc = await OrderDispatch.create({
    dispatch_no: body.dispatch_no || generateDispatchNo(),
    order: body.order,
    finance_approval: body.finance_approval || undefined,
    warehouse: warehouseFields.warehouse,
    warehouse_location: warehouseFields.warehouse_location,
    dispatch_status: requestedStatus || 'partially_dispatched',
    dispatch_items: dispatchItems,
    packed_by: body.packed_by || undefined,
    dispatched_by: body.dispatched_by || user._id,
    dispatch_assignee_user: body.dispatch_assignee_user || undefined,
    packed_at: body.packed_at ? new Date(body.packed_at) : undefined,
    dispatched_at: body.dispatched_at || body.dispatch_date
      ? new Date(body.dispatched_at || body.dispatch_date)
      : new Date(),
    bill_number: body.bill_number ? String(body.bill_number).trim() : undefined,
    billing_date: body.billing_date ? new Date(body.billing_date) : undefined,
    bill_document: body.bill_document || undefined,
    remarks: body.remarks || '',
    created_by: user._id,
  });

  if (file) {
    doc.bill_document = await attachBillDocument(
      file,
      doc._id,
      user,
      body.bill_number ? String(body.bill_number).trim() : '',
    );
    await doc.save();
  }

  await workflowService.transitionOrderStatus({
    orderId: body.order,
    nextStatus: 'partial_dispatch_created',
    userId: user._id,
    remarks: body.remarks || `Dispatch ${doc.dispatch_no} recorded`,
    _systemCall: true,
  });

  await enqueuePostDispatchJobs(body.order, user._id);

  const populated = await OrderDispatch.findById(doc._id)
    .populate('bill_document', 'original_name url mime_type')
    .lean();
  const plain = toPlain(populated);
  await activityService.create({
    actor: user._id,
    entity_type: 'dispatch',
    entity_id: plain._id,
    action: 'created',
    message: `Order dispatch ${plain.dispatch_no} recorded for order ${order.order_no}`,
  });

  return plain;
}

async function patch(id, patchBody, user) {
  const { OrderDispatch } = getModels();
  const existing = await OrderDispatch.findById(id);
  if (!existing) throw new ApiError(404, DISP_NF);

  const patch = patchBody || {};
  if (user.department === 'account') {
    const allowed = new Set(['bill_number', 'billing_date', 'bill_document', 'dispatch_assignee_user']);
    const keys = Object.keys(patch);
    if (keys.some((key) => !allowed.has(key))) {
      throw new ApiError(403, 'Account users may only update billing fields on a dispatch');
    }
  }
  if (patch.dispatch_status || patch.status) {
    existing.dispatch_status = normalizeDispatchStatus(patch.dispatch_status || patch.status, existing.dispatch_status);
  }
  if (patch.dispatch_items || patch.items) {
    const order = await getModels().Order.findById(existing.order).lean();
    if (!order) throw new ApiError(404, 'Order not found');
    existing.dispatch_items = await validateDispatchItems(
      toPlain(order),
      patch.dispatch_items || patch.items,
      existing._id,
      existing.finance_approval || patch.finance_approval || null,
    );
  }
  if (patch.finance_approval !== undefined) {
    existing.finance_approval = patch.finance_approval || undefined;
  }
  if (patch.warehouse !== undefined || patch.warehouse_location !== undefined) {
    const warehouseFields = resolveWarehouseFields({
      warehouse: patch.warehouse !== undefined ? patch.warehouse : existing.warehouse,
      warehouse_location:
        patch.warehouse_location !== undefined
          ? patch.warehouse_location
          : existing.warehouse_location,
    });
    existing.warehouse = warehouseFields.warehouse;
    existing.warehouse_location = warehouseFields.warehouse_location;
  }
  if (patch.bill_number !== undefined) {
    existing.bill_number = patch.bill_number ? String(patch.bill_number).trim() : '';
  }
  if (patch.billing_date !== undefined) {
    existing.billing_date = patch.billing_date ? new Date(patch.billing_date) : undefined;
  }
  if (patch.bill_document !== undefined) {
    existing.bill_document = patch.bill_document || undefined;
  }
  if (patch.dispatch_assignee_user !== undefined) {
    existing.dispatch_assignee_user = patch.dispatch_assignee_user || undefined;
  }
  if (patch.remarks !== undefined) existing.remarks = patch.remarks || '';
  if (patch.packed_at !== undefined) existing.packed_at = patch.packed_at ? new Date(patch.packed_at) : undefined;
  if (patch.dispatched_at !== undefined) {
    existing.dispatched_at = patch.dispatched_at ? new Date(patch.dispatched_at) : undefined;
  }
  if (existing.dispatch_status === 'fully_dispatched') existing.dispatched_by = user._id;

  await existing.save();
  await recalculateOrderDispatchState(existing.order, user);
  return toPlain(existing.toObject());
}

async function listDeleted({ order } = {}) {
  const q = {};
  if (order) q.order = order;
  const rows = await listDeletedLean(getModels().OrderDispatch, q);
  return rows.map(toPlain);
}

async function softDelete(id, user) {
  const doc = await softDeleteActiveById(getModels().OrderDispatch, id, { notFoundMessage: DISP_NF });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'dispatch',
    entity_id: plain._id,
    action: 'deleted',
    message: `Order dispatch ${plain.dispatch_no} soft-deleted`,
  });
  await recalculateOrderDispatchState(plain.order, user);
  return plain;
}

async function restore(id, user) {
  const doc = await restoreSoftDeletedById(getModels().OrderDispatch, id, { notFoundMessage: DISP_NF });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'dispatch',
    entity_id: plain._id,
    action: 'restored',
    message: `Order dispatch ${plain.dispatch_no} restored`,
  });
  await recalculateOrderDispatchState(plain.order, user);
  return plain;
}

module.exports = {
  list,
  get,
  create,
  patch,
  listDeleted,
  softDelete,
  restore,
  recalculateOrderDispatchState,
  settleReleaseDispatchFulfillment,
};
