/**
 * @fileoverview Web Push HTTP controllers.
 * @module modules/push/push.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./push.service');

/**
 * Public VAPID key for PushManager.subscribe.
 * GET /api/push/vapid-public-key
 */
exports.getVapidPublicKey = asyncHandler(async (_req, res) => {
  res.json({
    success: true,
    data: { publicKey: service.getVapidPublicKey() },
  });
});

/**
 * Store (or refresh) the browser push subscription for the current user.
 * POST /api/subscribe
 */
exports.subscribe = asyncHandler(async (req, res) => {
  const data = await service.subscribe(
    req.user._id,
    req.body,
    req.get('user-agent') || undefined
  );
  res.status(201).json({
    success: true,
    message: 'Push subscription saved',
    data,
  });
});

/**
 * Remove a push subscription for the current user.
 * DELETE /api/subscribe
 * Body: { endpoint: string }
 */
exports.unsubscribe = asyncHandler(async (req, res) => {
  const data = await service.unsubscribe(req.user._id, req.body?.endpoint);
  res.json({
    success: true,
    message: data.deleted ? 'Push subscription removed' : 'Subscription not found',
    data,
  });
});

/**
 * Send a Web Push notification to the authenticated user's subscriptions.
 * POST /api/push/notify
 * Body: { title: string, body?: string, url?: string, data?: object }
 */
exports.notifySelf = asyncHandler(async (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  if (!title) {
    res.status(400).json({ success: false, message: 'title is required' });
    return;
  }
  const data = await service.sendToUser(req.user._id, {
    title,
    body: typeof req.body?.body === 'string' ? req.body.body : '',
    url: typeof req.body?.url === 'string' ? req.body.url : undefined,
    data: req.body?.data && typeof req.body.data === 'object' ? req.body.data : undefined,
  });
  res.json({
    success: true,
    message: 'Push notification dispatched',
    data,
  });
});
