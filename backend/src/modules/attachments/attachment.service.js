/**
 * @fileoverview Attachments: business rules and mongoose persistence helpers.
 * @module modules/attachments/attachment.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const { restoreSoftDeletedById, softDeleteActiveById, listDeletedLean } = require('../../utils/mongoSoftDelete');
const activityService = require('../activity/activity.service');

async function create(body, user) {
  if (!body.entity_type || !body.entity_id) {
    throw new ApiError(400, 'entity_type and entity_id are required');
  }

  const doc = await getModels().Attachment.create({
    original_name: body.original_name || 'file',
    file_name: body.file_name || body.original_name || 'file',
    mime_type: body.mime_type || 'application/octet-stream',
    size: Number(body.size ?? 0),
    storage_provider: body.storage_provider || 'local',
    bucket: body.bucket || '',
    key: body.key || '',
    url: body.url || '',
    entity_type: body.entity_type,
    entity_id: body.entity_id,
    uploaded_by: user._id,
    remarks: body.remarks || '',
  });

  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'attachment',
    entity_id: plain._id,
    action: 'uploaded',
    message: body.original_name || 'Attachment stored',
  });

  return plain;
}

async function list({ entity_type, entity_id } = {}) {
  const q = {};
  if (entity_type) q.entity_type = entity_type;
  if (entity_id) q.entity_id = entity_id;
  const rows = await getModels().Attachment.find(q)
    .populate('uploaded_by', 'name username department')
    .sort({ createdAt: -1 })
    .lean();
  return rows.map(toPlain);
}

async function get(id) {
  const row = await getModels().Attachment.findOne({ _id: id }).lean();
  if (!row) throw new ApiError(404, 'Attachment not found');
  return toPlain(row);
}

async function remove(id, user) {
  const doc = await softDeleteActiveById(getModels().Attachment, id, {
    notFoundMessage: 'Attachment not found',
  });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'attachment',
    entity_id: plain._id,
    action: 'deleted',
    message: plain.original_name || 'Attachment removed',
  });
  return plain;
}

async function restore(id, user) {
  const doc = await restoreSoftDeletedById(getModels().Attachment, id, {
    notFoundMessage: 'Attachment not found',
  });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'attachment',
    entity_id: plain._id,
    action: 'restored',
    message: plain.original_name || 'Attachment restored',
  });
  return plain;
}

async function listDeleted({ entity_type, entity_id } = {}) {
  const q = {};
  if (entity_type) q.entity_type = entity_type;
  if (entity_id) q.entity_id = entity_id;
  const rows = await listDeletedLean(getModels().Attachment, q);
  const populated = await getModels().Attachment.populate(rows, {
    path: 'uploaded_by',
    select: 'name username department'
  });
  return populated.map(toPlain);
}

module.exports = { create, list, get, remove, restore, listDeleted };
