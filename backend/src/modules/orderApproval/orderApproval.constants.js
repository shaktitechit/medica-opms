/**
 * @fileoverview Order approval helpers aligned with models/OrderApproval.js
 * @module modules/orderApproval/orderApproval.constants
 */

const { APPROVAL_STATUS } = require('../orders/order.constants');

/** API-facing batch status (derived, not stored on schema). */
const BATCH_APPROVAL_STATUS = Object.freeze({
  PENDING_REVIEW: 'pending_review',
  APPROVED: 'approved',
  SENT_TO_FINANCE: 'sent_to_finance',
  PARTIALLY_APPROVED: 'partially_approved',
  FULLY_APPROVED: 'fully_approved',
  REJECTED: 'rejected',
});

/** API-facing line status (derived from quantities). */
const LINE_APPROVAL_STATUS = Object.freeze({
  REJECTED: 'rejected',
  PARTIALLY_APPROVED: 'partially_approved',
  FULLY_APPROVED: 'fully_approved',
});

function calcBucketTotal(qty, unitPrice, discountPercent = 0, gstPercent = 0) {
  const gross = Math.max(0, Number(qty || 0)) * Math.max(0, Number(unitPrice || 0));
  const disc = Number(discountPercent || 0) > 0 ? (gross * Number(discountPercent)) / 100 : 0;
  const taxable = Math.max(0, gross - disc);
  const gst = (taxable * Number(gstPercent || 0)) / 100;
  return { disc, taxable, gst, total: taxable + gst };
}

function recalcApprovalItemTotals(item) {
  const orderedQty = Math.max(0, Number(item.ordered_quantity || 0));
  const rawApproved = Math.max(0, Number(item.approved_quantity || 0));
  // When ordered_quantity is missing/0, do not wipe a positive approved qty
  // (that was leaving Create Dispatch disabled after partial clearance).
  const approvedQty =
    orderedQty > 0 ? Math.min(rawApproved, orderedQty) : rawApproved;
  const orderedPrice = Number(item.ordered_unit_price ?? item.approved_unit_price ?? 0);
  const approvedPrice = Number(item.approved_unit_price ?? orderedPrice);
  const discountPercent = Number(item.discount_percent ?? 0);
  const gstPercent = Number(item.gst_percent ?? 0);

  item.approved_quantity = approvedQty;
  if (orderedQty <= 0 && approvedQty > 0) {
    item.ordered_quantity = approvedQty;
  }

  const approved = calcBucketTotal(approvedQty, approvedPrice, discountPercent, gstPercent);
  if (discountPercent > 0) item.discount_amount = approved.disc;
  item.approved_total_amount = approved.total;

  const effectiveOrderedQty = Math.max(orderedQty, approvedQty);
  const ordered = calcBucketTotal(effectiveOrderedQty, orderedPrice, discountPercent, gstPercent);
  item.ordered_total_amount = ordered.total;

  return item;
}

function deriveItemApprovalStatus(item) {
  const approvedQty = Number(item?.approved_quantity || 0);
  const orderedQty = Number(item?.ordered_quantity || 0);
  if (approvedQty <= 0) return LINE_APPROVAL_STATUS.REJECTED;
  if (approvedQty >= orderedQty) return LINE_APPROVAL_STATUS.FULLY_APPROVED;
  return LINE_APPROVAL_STATUS.PARTIALLY_APPROVED;
}

function isLineFullyRejected(item) {
  return deriveItemApprovalStatus(item) === LINE_APPROVAL_STATUS.REJECTED;
}

function isLineFullyApproved(item) {
  return deriveItemApprovalStatus(item) === LINE_APPROVAL_STATUS.FULLY_APPROVED;
}

function summarizeApprovalItems(items = []) {
  const rows = items || [];
  const allRejected = rows.length > 0 && rows.every((item) => isLineFullyRejected(item));
  const allFullyApproved = rows.length > 0 && rows.every((item) => isLineFullyApproved(item));
  const hasPartial = rows.some(
    (item) => !isLineFullyRejected(item) && !isLineFullyApproved(item),
  );
  return { allRejected, allFullyApproved, hasPartial };
}

function deriveBatchApprovalStatus(doc) {
  if (!doc) return BATCH_APPROVAL_STATUS.PENDING_REVIEW;
  if (doc.rejected_by || doc.rejection_reason) return BATCH_APPROVAL_STATUS.REJECTED;

  const items = doc.approval_items || [];
  if (doc.is_finance_approved && items.length > 0) {
    const { allRejected, allFullyApproved, hasPartial } = summarizeApprovalItems(items);
    if (allRejected) return BATCH_APPROVAL_STATUS.REJECTED;
    if (allFullyApproved && !hasPartial) return BATCH_APPROVAL_STATUS.FULLY_APPROVED;
    return BATCH_APPROVAL_STATUS.PARTIALLY_APPROVED;
  }

  if (doc.is_account_approved && items.length > 0) {
    const { allRejected, allFullyApproved, hasPartial } = summarizeApprovalItems(items);
    if (allRejected) return BATCH_APPROVAL_STATUS.REJECTED;
    if (allFullyApproved && !hasPartial) return BATCH_APPROVAL_STATUS.FULLY_APPROVED;
    return BATCH_APPROVAL_STATUS.PARTIALLY_APPROVED;
  }

  if (doc.is_admin_approved) {
    return doc.assigned_finance_user
      ? BATCH_APPROVAL_STATUS.SENT_TO_FINANCE
      : BATCH_APPROVAL_STATUS.APPROVED;
  }

  return BATCH_APPROVAL_STATUS.PENDING_REVIEW;
}

function attachDerivedApprovalFields(doc) {
  if (!doc) return doc;
  doc.approval_status = deriveBatchApprovalStatus(doc);
  if (Array.isArray(doc.approval_items)) {
    for (const item of doc.approval_items) {
      recalcApprovalItemTotals(item);
      item.approval_status = deriveItemApprovalStatus(item);
    }
  }
  const orderedTotal = (doc.approval_items || []).reduce(
    (sum, item) => sum + Number(item.ordered_total_amount || 0),
    0,
  );
  const approvedTotal = (doc.approval_items || []).reduce(
    (sum, item) => sum + Number(item.approved_total_amount || 0),
    0,
  );
  if (doc.ordered_total_amount == null) doc.ordered_total_amount = orderedTotal;
  if (doc.approved_total_amount == null) doc.approved_total_amount = approvedTotal;
  if (doc.rejected_total_amount == null) {
    doc.rejected_total_amount = Math.max(0, orderedTotal - approvedTotal);
  }
  return doc;
}

function deriveBatchFinanceStatus(items, isRejected) {
  if (isRejected) return BATCH_APPROVAL_STATUS.REJECTED;
  const { allRejected, allFullyApproved, hasPartial } = summarizeApprovalItems(items);
  if (allRejected) return BATCH_APPROVAL_STATUS.REJECTED;
  if (allFullyApproved && !hasPartial) return BATCH_APPROVAL_STATUS.FULLY_APPROVED;
  return BATCH_APPROVAL_STATUS.PARTIALLY_APPROVED;
}

function adminClearedQtyForLine(line, adminClearedByLine = {}) {
  const key = String(line._id);
  if (adminClearedByLine[key] != null) return Number(adminClearedByLine[key]);
  return 0;
}

module.exports = {
  APPROVAL_STATUS,
  BATCH_APPROVAL_STATUS,
  LINE_APPROVAL_STATUS,
  calcBucketTotal,
  recalcApprovalItemTotals,
  deriveItemApprovalStatus,
  isLineFullyRejected,
  isLineFullyApproved,
  summarizeApprovalItems,
  deriveBatchApprovalStatus,
  attachDerivedApprovalFields,
  deriveBatchFinanceStatus,
  adminClearedQtyForLine,
};
