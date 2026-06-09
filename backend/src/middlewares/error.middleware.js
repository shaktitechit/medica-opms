/**
 * @fileoverview Express middleware (error.middleware).
 * @module middlewares/error.middleware
 */
const { ApiError } = require('../utils/ApiError');
const { logger } = require('../config/logger');

function errorMiddleware(err, req, res, _next) {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: {
        message:
          'Request payload too large. Upload fewer rows per batch or ask your admin to raise JSON_BODY_LIMIT.',
      },
    });
  }

  const status = err instanceof ApiError ? err.statusCode : err.statusCode || 500;
  const message =
    err instanceof ApiError ? err.message : err.message || 'Internal Server Error';
  const details = err.details;

  // Log every error so it's visible in dev server output
  if (status >= 500) {
    logger.error(`[${req.method} ${req.path}] ${status} — ${message}`, err.stack || '');
  } else {
    logger.warn(`[${req.method} ${req.path}] ${status} — ${message}`, details ? JSON.stringify(details) : '');
  }

  const body = { success: false, error: { message } };
  if (details !== undefined) body.error.details = details;
  res.status(status).json(body);
}

module.exports = { errorMiddleware };
