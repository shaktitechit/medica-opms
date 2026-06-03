/**
 * @fileoverview Files: HTTP handlers (thin controllers).
 * @module modules/files/files.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const {
  getViewPresignedUrl,
  getDownloadPresignedUrl,
} = require('../../services/fileManagement/index');
const { getModels } = require('../../data/mongoRegistry');
const mongoose = require('mongoose');

/**
 * Resolve the FM fileId from what was passed.
 *
 * `invoice_file` (and similar) stores an Attachment ObjectId.
 * The Attachment's `url` field contains the actual FM fileId, e.g.
 *   "http://localhost:5000/api/files/<fmFileId>/view"
 * We extract <fmFileId> from that URL.
 *
 * If the param is NOT a valid ObjectId (already an FM fileId), pass through.
 */
async function resolveFmFileId(fileId) {
  if (mongoose.Types.ObjectId.isValid(fileId)) {
    const { Attachment } = getModels();
    const att = await Attachment.findById(fileId).lean();
    if (att) {
      // Try extracting FM fileId from the stored url:
      //   .../api/files/<fmFileId>/view  or  .../api/files/<fmFileId>/download
      if (att.url) {
        const match = String(att.url).match(/\/api\/files\/([^/]+)\//);
        if (match && match[1]) return match[1];
      }
      // Fallback: if key looks like a short hex ID (not a path), use it
      if (att.key && !String(att.key).includes('/')) {
        return att.key;
      }
    }
  }
  return fileId;
}

exports.redirectToViewUrl = asyncHandler(async (req, res) => {
  const fmId = await resolveFmFileId(req.params.fileId);
  const url = await getViewPresignedUrl(fmId);
  res.redirect(302, url);
});

exports.redirectToDownloadUrl = asyncHandler(async (req, res) => {
  const fmId = await resolveFmFileId(req.params.fileId);
  const url = await getDownloadPresignedUrl(fmId);
  res.redirect(302, url);
});
