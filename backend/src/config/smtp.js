/**
 * @fileoverview Configuration (smtp).
 * @module config/smtp
 */
const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = require('./env');

function isConfigured() {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

/** Options shape compatible with nodemailer `createTransport` */
function transportOptions() {
  return {
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  };
}

module.exports = { isConfigured, transportOptions };
