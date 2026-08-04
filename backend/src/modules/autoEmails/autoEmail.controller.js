/**
 * @fileoverview Auto Email Controller: exposes endpoint to trigger automated emails.
 * @module modules/autoEmails/autoEmail.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./autoEmail.service');

/**
 * Endpoint to trigger and queue an auto-email.
 * POST /api/auto-emails/trigger
 */
exports.triggerAutoEmail = asyncHandler(async (req, res) => {
  const { recipient, templateName, templateParams } = req.body;

  const result = await service.shootAutoEmail({
    recipient,
    templateName,
    templateParams,
  });

  res.status(202).json(result);
});
