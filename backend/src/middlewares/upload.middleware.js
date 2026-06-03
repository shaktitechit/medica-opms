/**
 * @fileoverview Express middleware (upload.middleware).
 * @module middlewares/upload.middleware
 */
const multer = require('multer');

const storage = multer.memoryStorage();

function uploadMiddleware(options = {}) {
  const limits = options.limits || { fileSize: 100 * 1024 * 1024 }; // 100MB default limit
  return multer({
    storage,
    limits,
    ...options
  });
}

module.exports = { uploadMiddleware };
