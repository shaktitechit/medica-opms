/**
 * @fileoverview Messages: HTTP handlers (thin controllers).
 * @module modules/messages/message.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./message.service');
const { ApiError } = require('../../utils/ApiError');

/**
 * Endpoint to queue a communication message (WhatsApp or Email).
 * POST /api/messages/send
 */
exports.queueMessage = asyncHandler(async (req, res) => {
  const { recipient, channel, subject, body, templateName, templateParams } = req.body;

  // Basic validation
  if (!recipient) {
    throw new ApiError(400, 'Recipient is required');
  }
  if (!channel || !['email', 'whatsapp'].includes(channel)) {
    throw new ApiError(400, "Channel is required and must be either 'email' or 'whatsapp'");
  }

  const data = await service.createAndQueueMessage({
    recipient,
    channel,
    subject,
    body,
    templateName,
    templateParams,
  });

  res.status(201).json({
    success: true,
    message: 'Message queued successfully',
    data,
  });
});

/**
 * Endpoint to list message log.
 * GET /api/messages
 */
exports.list = asyncHandler(async (req, res) => {
  const { recipient, channel, status, page, limit } = req.query;
  
  const filter = { recipient, channel, status };
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
