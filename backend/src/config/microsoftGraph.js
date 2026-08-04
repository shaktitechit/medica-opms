/**
 * @fileoverview Configuration (Microsoft Graph API).
 * @module config/microsoftGraph
 */
const env = require('./env');

function isConfigured() {
  return Boolean(
    env.MICROSOFT_GRAPH_TENANT_ID &&
    env.MICROSOFT_GRAPH_CLIENT_ID &&
    env.MICROSOFT_GRAPH_CLIENT_SECRET &&
    env.MICROSOFT_GRAPH_SENDER_EMAIL
  );
}

module.exports = {
  isConfigured,
  tenantId: env.MICROSOFT_GRAPH_TENANT_ID,
  clientId: env.MICROSOFT_GRAPH_CLIENT_ID,
  clientSecret: env.MICROSOFT_GRAPH_CLIENT_SECRET,
  senderEmail: env.MICROSOFT_GRAPH_SENDER_EMAIL,
};
