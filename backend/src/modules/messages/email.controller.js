/**
 * @fileoverview Email controller handling endpoints for email messages.
 * @module modules/messages/email.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./email.service');
const { ApiError } = require('../../utils/ApiError');

/**
 * Send/queue an email message.
 * POST /api/emails
 */
exports.sendEmail = asyncHandler(async (req, res) => {
  const { recipient, subject, body, templateName, templateParams, orderId, attachments, cc } = req.body;

  if (!recipient) {
    throw new ApiError(400, 'Recipient email is required');
  }

  const result = await service.sendEmailMessage({
    recipient,
    subject,
    body,
    templateName,
    templateParams,
    orderId,
    attachments,
    cc,
  });

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * List email message logs.
 * GET /api/emails
 */
exports.listEmails = asyncHandler(async (req, res) => {
  const { order, recipient, status, page, limit } = req.query;

  const filter = { order, recipient, status };
  const options = { page, limit };

  const result = await service.listEmails(filter, options);
  res.json({
    success: true,
    ...result,
  });
});

/**
 * Get specific email message log by ID.
 * GET /api/emails/:id
 */
exports.getEmailById = asyncHandler(async (req, res) => {
  const row = await service.getEmailById(req.params.id);
  if (!row) {
    throw new ApiError(404, 'Email message log not found');
  }
  res.json({
    success: true,
    data: row,
  });
});
