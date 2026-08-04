/**
 * @fileoverview Email Template Name Registry
 * @module modules/messages/templates/emails/emailTemplates.registry
 */

const EMAIL_TEMPLATES = {
  DEFAULT: 'default',
  WELCOME: 'welcome',
  ORDER_UPDATE: 'order_update',
  PASSWORD_RESET: 'password_reset',
};

function isValidTemplate(templateName) {
  return Object.values(EMAIL_TEMPLATES).includes(templateName);
}

module.exports = {
  EMAIL_TEMPLATES,
  isValidTemplate,
};
