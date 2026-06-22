/**
 * @fileoverview WhatsApp Template Name Registry
 * Centralizes the template names configured in the Meta WhatsApp Business Manager.
 * @module modules/messages/whatsappTemplates.registry
 */

const WHATSAPP_TEMPLATES = {
  // Account / User Welcome
  WELCOME: 'welcome',

  // Order related notifications
  ORDER_CREATED: 'order_created',
  ORDER_CONFIRMED: 'order_confirmed',
  ORDER_RECEIVED: 'order_recieved',
  ORDER_STATUS_UPDATE: 'order_status_update',
  ORDER_DELIVERED: 'order_delivered',

  // Payment notifications
  PAYMENT_RECEIVED: 'payment_received',

  // Verification
  OTP: 'otp_verification',
};

/**
 * Check if a template name is registered.
 * @param {string} templateName 
 * @returns {boolean}
 */
function isValidTemplate(templateName) {
  return Object.values(WHATSAPP_TEMPLATES).includes(templateName);
}

module.exports = {
  WHATSAPP_TEMPLATES,
  isValidTemplate,
};
