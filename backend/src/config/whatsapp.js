/**
 * @fileoverview Configuration (whatsapp).
 * @module config/whatsapp
 */
const { WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_API_VERSION } = require('./env');

function isConfigured() {
  return Boolean(WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID);
}

function getBaseUrl() {
  const version = WHATSAPP_API_VERSION || 'v19.0';
  return `https://graph.facebook.com/${version}/${WHATSAPP_PHONE_NUMBER_ID}`;
}

function getHeaders() {
  return {
    'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

module.exports = {
  isConfigured,
  getBaseUrl,
  getHeaders,
  WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_API_VERSION,
};
