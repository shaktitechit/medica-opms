/**
 * @fileoverview Email Template Name Registry
 * @module modules/messages/templates/emails/emailTemplates.registry
 */

const EMAIL_TEMPLATES = {
  DEFAULT: 'default',
  WELCOME: 'welcome',
  ORDER_UPDATE: 'order_update',
  ORDER_RECEIVED: 'order_received',
  ORDER_RECEIVED_SALES: 'order_received_sales',
  ORDER_DELIVERED: 'order_delivered',
  ORDER_CANCELLED: 'order_cancelled',
  ORDER_ON_HOLD: 'order_on_hold',
  ORDER_REJECTED: 'order_rejected',
  DUE_SHEET_PENDING: 'due_sheet_pending',
  ADMIN_APPROVAL_PENDING: 'admin_approval_pending',
  FINANCE_APPROVAL_PENDING: 'finance_approval_pending',
  ACCOUNT_APPROVAL_PENDING: 'account_approval_pending',
  DISPATCH_PENDING: 'dispatch_pending',
  TRANSPORT_PENDING: 'transport_pending',
  PASSWORD_RESET: 'password_reset',
};

function isValidTemplate(templateName) {
  return Object.values(EMAIL_TEMPLATES).includes(templateName);
}

module.exports = {
  EMAIL_TEMPLATES,
  isValidTemplate,
};
