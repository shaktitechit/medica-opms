/**
 * @fileoverview Utilities (ApiResponse).
 * @module utils/ApiResponse
 */
function ok(res, data, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data });
}

function fail(res, message, statusCode = 400, details) {
  return res.status(statusCode).json({
    success: false,
    error: { message, details },
  });
}

module.exports = { ok, fail };
