/**
 * @fileoverview Attachments: HTTP handlers (thin controllers).
 * @module modules/attachments/attachment.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./attachment.service');
const { uploadMulterFile, getFileMeta } = require('../../services/fileManagement/index');
const { API_PUBLIC_BASE_URL, FILE_DOCUMENT_LINKS_RELATIVE } = require('../../config/fileManagement');

exports.list = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.list(req.query) });
});

exports.get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.get(req.params.id) });
});

exports.create = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  if (req.file) {
    const { entity_type, entity_id } = req.body;
    if (!entity_type || !entity_id) {
      res.status(400);
      throw new Error('entity_type and entity_id are required when uploading a file');
    }

    const fileId = await uploadMulterFile(req.file, entity_type, entity_id);
    const meta = await getFileMeta(fileId);

    const base = FILE_DOCUMENT_LINKS_RELATIVE ? '' : API_PUBLIC_BASE_URL;

    body.original_name = meta.originalName || req.file.originalname;
    body.file_name = meta.originalName || req.file.originalname;
    body.mime_type = meta.mimeType || req.file.mimetype;
    body.size = meta.sizeBytes || req.file.size;
    body.storage_provider = 'minio';
    body.bucket = meta.bucket || 'company-files';
    body.key = meta.objectKey || fileId;
    body.url = `${base}/api/files/${fileId}/view`;
  }

  res.status(201).json({ success: true, data: await service.create(body, req.user) });
});

exports.remove = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.remove(req.params.id, req.user) });
});

exports.restore = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.restore(req.params.id, req.user) });
});

exports.listDeleted = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.listDeleted(req.query) });
});
