/**
 * @fileoverview WhatsApp Helper: encapsulates formatting and calls to WhatsApp Cloud API.
 * @module modules/messages/helpers/whatsapp.helper
 */
const axios = require('axios');
const whatsappConfig = require('../../../config/whatsapp');
const { logger } = require('../../../config/logger');
const { WHATSAPP_TEMPLATES, isValidTemplate } = require('../whatsappTemplates.registry');

/**
 * Sends a raw payload to WhatsApp Cloud API.
 * @param {string} recipient - The phone number of the recipient (with country code, e.g. "919876543210").
 * @param {object} payload - The message payload object.
 * @returns {Promise<object>} The API response data.
 */
async function sendRawMessage(recipient, payload) {
  if (!whatsappConfig.isConfigured()) {
    throw new Error('WhatsApp Cloud API is not configured. Check WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.');
  }

  const url = whatsappConfig.getBaseUrl() + '/messages';
  const headers = whatsappConfig.getHeaders();

  const body = {
    messaging_product: 'whatsapp',
    to: recipient,
    ...payload,
  };

  logger.info(`[WhatsApp Helper] Sending message to ${recipient}...`);

  try {
    const response = await axios.post(url, body, { headers, timeout: 15000 });
    logger.info(`[WhatsApp Helper] Message sent successfully to ${recipient}. Message ID: ${response.data.messages?.[0]?.id}`);
    return response.data;
  } catch (error) {
    const errorMsg = error.response?.data?.error?.message || error.message;
    logger.error(`[WhatsApp Helper] Error sending message to ${recipient}: ${errorMsg}`, error.response?.data);
    throw new Error(errorMsg);
  }
}

/**
 * Send a plain text message.
 * @param {string} recipient
 * @param {string} text
 */
async function sendTextMessage(recipient, text) {
  return sendRawMessage(recipient, {
    type: 'text',
    text: { body: text },
  });
}

/**
 * Send a template message.
 * @param {string} recipient
 * @param {string} templateName
 * @param {string} languageCode - e.g. "en_US"
 * @param {Array} components - template component parameters (optional)
 */
async function sendTemplateMessage(recipient, templateName, languageCode = 'en_US', components = []) {
  const payload = {
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: languageCode,
      },
    },
  };

  if (components && components.length > 0) {
    payload.template.components = components;
  }

  return sendRawMessage(recipient, payload);
}

/**
 * Send a media message.
 * @param {string} recipient
 * @param {string} mediaType - 'image' | 'video' | 'document' | 'audio'
 * @param {string} mediaUrl
 * @param {string} [caption] - optional caption for images/videos/documents
 * @param {string} [filename] - optional filename for documents
 */
async function sendMediaMessage(recipient, mediaType, mediaUrl, caption = '', filename = '') {
  const mediaObj = { link: mediaUrl };
  if (caption) mediaObj.caption = caption;
  if (filename && mediaType === 'document') mediaObj.filename = filename;

  return sendRawMessage(recipient, {
    type: mediaType,
    [mediaType]: mediaObj,
  });
}

module.exports = {
  sendRawMessage,
  sendTextMessage,
  sendTemplateMessage,
  sendMediaMessage,
  WHATSAPP_TEMPLATES,
  isValidTemplate,
};

