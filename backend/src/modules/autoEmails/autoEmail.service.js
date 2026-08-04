/**
 * @fileoverview Auto Email Service: handles triggering and enqueuing automatic emails.
 * @module modules/autoEmails/autoEmail.service
 */
const autoEmailQueue = require('../../queues/autoEmail.queue');
const { isValidTemplate } = require('../messages/templates/emails/emailTemplates.registry');
const { ApiError } = require('../../utils/ApiError');

/**
 * Enqueues a background task to shoot an automated email.
 * @param {object} params
 * @param {string} params.recipient
 * @param {string} params.templateName
 * @param {object} [params.templateParams]
 */
async function shootAutoEmail({ recipient, templateName, templateParams = {} }) {
  if (!recipient) {
    throw new ApiError(400, 'Recipient email is required.');
  }

  if (!templateName) {
    throw new ApiError(400, 'Template name is required.');
  }

  if (!isValidTemplate(templateName)) {
    throw new ApiError(400, `Invalid email template name: ${templateName}. Please use a registered template.`);
  }

  await autoEmailQueue.enqueue({
    recipient,
    templateName,
    templateParams,
  });

  return { success: true, message: 'Auto-email enqueued successfully.' };
}

module.exports = {
  shootAutoEmail,
};
