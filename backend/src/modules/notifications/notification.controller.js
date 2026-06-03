/**
 * @fileoverview Notifications: HTTP handlers (thin controllers).
 * @module modules/notifications/notification.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./notification.service');
const { ApiError } = require('../../utils/ApiError');
const sse = require('../../config/sse');

exports.list = asyncHandler(async (req, res) => {
  const unreadOnly = req.query.unread === '1' || req.query.unread === 'true';
  res.json({ success: true, data: await service.listForUser(req.user._id, { unreadOnly }) });
});

exports.markRead = asyncHandler(async (req, res) => {
  const row = await service.markRead(req.user._id, req.params.id);
  if (!row) throw new ApiError(404, 'Notification not found');
  res.json({ success: true, data: row });
});

/**
 * SSE stream: long-lived connection that pushes real-time notification events
 * to the authenticated user's browser.
 */
exports.stream = (req, res) => {
  const userId = String(req.user._id);

  // SSE headers — disable buffering for proxies/nginx
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx proxy buffering off
  res.flushHeaders();

  // Register this client
  sse.addClient(userId, res);

  // Send an initial "connected" heartbeat so the client knows the stream is live
  res.write(`event: connected\ndata: ${JSON.stringify({ userId })}\n\n`);

  // Send a heartbeat every 25 seconds to prevent proxy timeouts
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (_) {
      clearInterval(heartbeat);
    }
  }, 25_000);

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    sse.removeClient(userId, res);
  });
};
