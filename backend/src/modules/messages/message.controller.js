/**
 * @fileoverview Message log + WhatsApp webhook controllers.
 * Typed outbound queues live in modules/communication.
 * @module modules/messages/message.controller
 */
const crypto = require('crypto');
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./message.service');
const { ApiError } = require('../../utils/ApiError');
const whatsappConfig = require('../../config/whatsapp');
const { logger } = require('../../config/logger');

/**
 * Verification GET endpoint for Meta Webhook setup.
 * GET /api/messages/webhook
 */
exports.verifyWebhook = asyncHandler(async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === whatsappConfig.WHATSAPP_VERIFY_TOKEN) {
    logger.info('[WhatsApp Webhook] Verification successful');
    return res.status(200).send(challenge);
  }

  logger.warn('[WhatsApp Webhook] Verification failed - token mismatch or invalid mode');
  throw new ApiError(403, 'Verification failed');
});

/**
 * Event reception POST endpoint for Meta Webhook.
 * POST /api/messages/webhook
 */
exports.receiveWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-hub-signature-256'];

  const appSecret = whatsappConfig.WHATSAPP_APP_SECRET;
  if (appSecret && appSecret !== 'medica_app_secret_default_value') {
    if (!signature) {
      logger.warn('[WhatsApp Webhook] Missing x-hub-signature-256 header');
      throw new ApiError(401, 'Signature missing');
    }

    const elements = signature.split('=');
    const signatureHash = elements[1];

    const bodyPayload = req.rawBody ? req.rawBody : Buffer.from(JSON.stringify(req.body));
    const expectedHash = crypto
      .createHmac('sha256', appSecret)
      .update(bodyPayload)
      .digest('hex');

    if (signatureHash !== expectedHash) {
      logger.warn('[WhatsApp Webhook] Signature verification failed');
      throw new ApiError(401, 'Signature mismatch');
    }
  }

  logger.info('[WhatsApp Webhook] Received webhook payload:', JSON.stringify(req.body));

  res.status(200).json({ success: true });
});

/**
 * Endpoint to list message log.
 * GET /api/messages
 */
exports.list = asyncHandler(async (req, res) => {
  const { order, recipient, channel, status, page, limit } = req.query;

  const filter = { order, recipient, channel, status };
  const options = { page, limit };

  const result = await service.listMessages(filter, options);
  res.json({
    success: true,
    ...result,
  });
});

/**
 * Endpoint to fetch a message by ID.
 * GET /api/messages/:id
 */
exports.getById = asyncHandler(async (req, res) => {
  const row = await service.getMessageById(req.params.id);
  if (!row) {
    throw new ApiError(404, 'Message log not found');
  }
  res.json({
    success: true,
    data: row,
  });
});
