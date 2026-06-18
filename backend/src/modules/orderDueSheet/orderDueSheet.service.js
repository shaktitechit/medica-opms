/**
 * @fileoverview Order due sheet service logic.
 * @module modules/orderDueSheet/orderDueSheet.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const { softDeleteActiveById, restoreSoftDeletedById, listDeletedLean } = require('../../utils/mongoSoftDelete');
const { generateDueSheetNo } = require('../../utils/generateDueSheetNo');
const { uploadMulterFile, getFileMeta } = require('../../services/fileManagement/index');
const { API_PUBLIC_BASE_URL, FILE_DOCUMENT_LINKS_RELATIVE } = require('../../config/fileManagement');
const activityService = require('../activity/activity.service');
const attachmentService = require('../attachments/attachment.service');
const {
  DUE_SHEET_STATUS,
  DUE_SHEET_STATUS_VALUES,
  normalizeDueSheetStatus,
} = require('./orderDueSheet.constants');

const SHEET_NF = 'Order due sheet not found';

function dueSheetQuery() {
  return getModels().OrderDueSheet.find()
    .populate('order', 'order_no status lifecycle_status workflow_stage')
    .populate('document')
    .populate('created_by', 'name username department')
    .populate('updated_by', 'name username department');
}

async function attachDocumentFromFile(file, entityId, user, remarks = '') {
  const fileId = await uploadMulterFile(file, 'order_due_sheet', String(entityId));
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
    entity_type: 'order_due_sheet',
    entity_id: String(entityId),
    remarks: remarks || 'Order due sheet document',
  }, user);

  return attachment._id;
}

async function assertAttachmentDocument(documentId) {
  const attachment = await getModels().Attachment.findOne({
    _id: documentId,
    deletedAt: null,
  }).lean();
  if (!attachment) throw new ApiError(404, 'Attachment not found');
  return attachment;
}

async function nextRevisionNumber(orderId) {
  const latest = await getModels().OrderDueSheet.findOne({
    order: orderId,
    deletedAt: null,
  })
    .sort({ revision_number: -1, createdAt: -1 })
    .select('revision_number')
    .lean();

  return Math.max(1, Number(latest?.revision_number || 0) + 1);
}

async function supersedePreviousCurrentSheets(orderId, excludeId = null) {
  const q = {
    order: orderId,
    deletedAt: null,
    is_current: true,
  };
  if (excludeId) q._id = { $ne: excludeId };

  await getModels().OrderDueSheet.updateMany(q, {
    $set: {
      is_current: false,
      status: DUE_SHEET_STATUS.SUPERSEDED,
    },
  });
}

async function list({ order, status, is_current } = {}) {
  const q = { deletedAt: null };
  if (order) q.order = order;
  if (status) q.status = normalizeDueSheetStatus(status);
  if (is_current !== undefined && is_current !== '') {
    q.is_current = String(is_current) === 'true' || is_current === true;
  }

  const rows = await dueSheetQuery()
    .find(q)
    .sort({ createdAt: -1 })
    .lean();
  return rows.map(toPlain);
}

async function get(id) {
  const row = await dueSheetQuery().findById(id).lean();
  if (!row) throw new ApiError(404, SHEET_NF);
  return toPlain(row);
}

async function getCurrentByOrder(orderId) {
  const row = await dueSheetQuery()
    .findOne({
      order: orderId,
      deletedAt: null,
      is_current: true,
      status: DUE_SHEET_STATUS.ACTIVE,
    })
    .sort({ createdAt: -1 })
    .lean();

  if (!row) throw new ApiError(404, 'No current due sheet for this order');
  return toPlain(row);
}

async function create(body, user, options = {}) {
  const { OrderDueSheet, Order, Attachment } = getModels();
  const { file } = options;

  if (!body.order) throw new ApiError(400, 'order is required');
  if (!file && !body.document) {
    throw new ApiError(400, 'document file or document attachment id is required');
  }

  const orderExists = await Order.exists({ _id: body.order, deletedAt: null });
  if (!orderExists) throw new ApiError(404, 'Order not found');

  const isCurrent = body.is_current !== false;
  const status = normalizeDueSheetStatus(body.status || DUE_SHEET_STATUS.ACTIVE);
  const revisionNumber = body.revision_number || await nextRevisionNumber(body.order);

  let documentId = body.document;
  if (file) {
    documentId = await attachDocumentFromFile(
      file,
      body.order,
      user,
      body.remarks || '',
    );
  } else {
    await assertAttachmentDocument(documentId);
  }

  if (isCurrent) {
    await supersedePreviousCurrentSheets(body.order);
  }

  const doc = await OrderDueSheet.create({
    due_sheet_no: body.due_sheet_no || generateDueSheetNo(),
    order: body.order,
    document: documentId,
    sheet_date: body.sheet_date ? new Date(body.sheet_date) : new Date(),
    revision_number: revisionNumber,
    is_current: isCurrent,
    status: isCurrent ? DUE_SHEET_STATUS.ACTIVE : status,
    remarks: body.remarks || '',
    created_by: user._id,
  });

  await Attachment.updateOne(
    { _id: documentId },
    { $set: { entity_id: String(doc._id) } },
  );

  await activityService.create({
    actor: user._id,
    entity_type: 'order_due_sheet',
    entity_id: doc._id.toString(),
    action: 'created',
    message: `Due sheet ${doc.due_sheet_no} uploaded for order ID ${body.order}`,
  });

  return get(doc._id);
}

async function patch(id, patchBody, user) {
  const { OrderDueSheet } = getModels();
  const doc = await OrderDueSheet.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, SHEET_NF);

  const patch = patchBody || {};

  if (patch.remarks !== undefined) doc.remarks = String(patch.remarks || '');
  if (patch.sheet_date !== undefined) {
    doc.sheet_date = patch.sheet_date ? new Date(patch.sheet_date) : doc.sheet_date;
  }

  if (patch.status !== undefined) {
    const nextStatus = normalizeDueSheetStatus(patch.status);
    if (!DUE_SHEET_STATUS_VALUES.includes(nextStatus)) {
      throw new ApiError(400, `Invalid status. Allowed: ${DUE_SHEET_STATUS_VALUES.join(', ')}`);
    }
    doc.status = nextStatus;
  }

  if (patch.is_current === true) {
    await supersedePreviousCurrentSheets(doc.order, doc._id);
    doc.is_current = true;
    if (doc.status === DUE_SHEET_STATUS.SUPERSEDED) {
      doc.status = DUE_SHEET_STATUS.ACTIVE;
    }
  } else if (patch.is_current === false) {
    doc.is_current = false;
  }

  doc.updated_by = user._id;
  await doc.save();

  await activityService.create({
    actor: user._id,
    entity_type: 'order_due_sheet',
    entity_id: doc._id.toString(),
    action: 'updated',
    message: `Due sheet ${doc.due_sheet_no} updated`,
  });

  return get(doc._id);
}

async function replaceDocument(id, file, user, body = {}) {
  const { OrderDueSheet } = getModels();
  const doc = await OrderDueSheet.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, SHEET_NF);
  if (!file) throw new ApiError(400, 'document file is required');

  const documentId = await attachDocumentFromFile(
    file,
    doc._id,
    user,
    body.remarks || doc.remarks || '',
  );

  doc.document = documentId;
  doc.updated_by = user._id;
  if (body.sheet_date) doc.sheet_date = new Date(body.sheet_date);
  if (body.remarks !== undefined) doc.remarks = String(body.remarks || '');
  await doc.save();

  await activityService.create({
    actor: user._id,
    entity_type: 'order_due_sheet',
    entity_id: doc._id.toString(),
    action: 'updated',
    message: `Due sheet ${doc.due_sheet_no} document replaced`,
  });

  return get(doc._id);
}

async function listDeleted({ order } = {}) {
  const q = {};
  if (order) q.order = order;
  const rows = await listDeletedLean(getModels().OrderDueSheet, q);
  const populated = await getModels().OrderDueSheet.populate(rows, [
    { path: 'order', select: 'order_no status' },
    { path: 'document' },
    { path: 'created_by', select: 'name username department' },
  ]);
  return populated.map(toPlain);
}

async function softDelete(id, user) {
  const doc = await softDeleteActiveById(getModels().OrderDueSheet, id, {
    notFoundMessage: SHEET_NF,
  });
  const plain = toPlain(doc.toObject());

  await activityService.create({
    actor: user._id,
    entity_type: 'order_due_sheet',
    entity_id: plain._id,
    action: 'deleted',
    message: `Due sheet ${plain.due_sheet_no} soft-deleted`,
  });

  return plain;
}

async function restore(id, user) {
  const doc = await restoreSoftDeletedById(getModels().OrderDueSheet, id, {
    notFoundMessage: SHEET_NF,
  });
  const plain = toPlain(doc.toObject());

  await activityService.create({
    actor: user._id,
    entity_type: 'order_due_sheet',
    entity_id: plain._id,
    action: 'restored',
    message: `Due sheet ${plain.due_sheet_no} restored`,
  });

  return plain;
}

module.exports = {
  list,
  get,
  getCurrentByOrder,
  create,
  patch,
  replaceDocument,
  listDeleted,
  softDelete,
  restore,
};
