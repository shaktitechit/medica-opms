/**
 * @fileoverview WhatsApp Template Name Registry
 * Centralizes the template names configured in the Meta WhatsApp Business Manager.
 * @module modules/messages/whatsappTemplates.registry
 */

/**
 * Names must match Meta WhatsApp Manager exactly (including spelling + language).
 * Override per-env via WHATSAPP_TEMPLATE_* when needed.
 */
const WHATSAPP_TEMPLATES = {
  // Account / User Welcome
  WELCOME: process.env.WHATSAPP_TEMPLATE_WELCOME || 'welcome',

  // Order related notifications
  ORDER_CREATED: process.env.WHATSAPP_TEMPLATE_ORDER_CREATED || 'order_created',
  ORDER_CONFIRMED: process.env.WHATSAPP_TEMPLATE_ORDER_CONFIRMED || 'order_confirmed',
  // Correct spelling — previous `order_recieved` triggers Meta (#132001) when that name is not approved
  ORDER_RECEIVED: process.env.WHATSAPP_TEMPLATE_ORDER_RECEIVED || 'order_received',
  ORDER_STATUS_UPDATE: process.env.WHATSAPP_TEMPLATE_ORDER_STATUS_UPDATE || 'order_status_update',
  ORDER_DELIVERED: process.env.WHATSAPP_TEMPLATE_ORDER_DELIVERED || 'order_delivered',

  // Payment notifications
  PAYMENT_RECEIVED: process.env.WHATSAPP_TEMPLATE_PAYMENT_RECEIVED || 'payment_received',

  // Verification
  OTP: process.env.WHATSAPP_TEMPLATE_OTP || 'otp_verification',
};

/** Default language code for template sends. Prefer Meta Manager language (often `en_US`). */
const WHATSAPP_TEMPLATE_LANGUAGE =
  process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US';

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
  WHATSAPP_TEMPLATE_LANGUAGE,
  isValidTemplate,
};
