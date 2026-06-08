/**
 * @fileoverview Email Helper: manages SMTP connection and compiles templates using Nodemailer.
 * @module modules/messages/helpers/email.helper
 */
const nodemailer = require('nodemailer');
const smtpConfig = require('../../../config/smtp');
const { logger } = require('../../../config/logger');

let transporterInstance = null;

/**
 * Returns the nodemailer transporter singleton.
 */
function getTransporter() {
  if (transporterInstance) {
    return transporterInstance;
  }

  if (!smtpConfig.isConfigured()) {
    logger.warn('[Email Helper] SMTP is not fully configured (missing host, user, or pass). Email sending might fail.');
  }

  const options = smtpConfig.transportOptions();
  transporterInstance = nodemailer.createTransport(options);

  return transporterInstance;
}

/**
 * Core send email function.
 * @param {string} recipient - Recipient email.
 * @param {string} subject - Subject line.
 * @param {string} textBody - Plain text body.
 * @param {string} htmlBody - HTML body.
 * @returns {Promise<object>} Nodemailer send status.
 */
async function sendEmail(recipient, subject, textBody, htmlBody) {
  const transporter = getTransporter();
  const from = smtpConfig.transportOptions().auth?.user || 'no-reply@medica-opms.com';

  const mailOptions = {
    from,
    to: recipient,
    subject,
    text: textBody,
    html: htmlBody,
  };

  logger.info(`[Email Helper] Sending email to ${recipient}...`);

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`[Email Helper] Email sent successfully. Message ID: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error(`[Email Helper] Error sending email to ${recipient}: ${error.message}`);
    throw error;
  }
}

/**
 * Basic template compilation (substitutes {{variable}} placeholders).
 * @param {string} template - The HTML or Text template string.
 * @param {object} data - Key-value replacements.
 * @returns {string} The compiled string.
 */
function compileTemplate(template, data) {
  if (!template) return '';
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    return data[key] !== undefined ? String(data[key]) : match;
  });
}

// Predefined templates
const TEMPLATES = {
  welcome: {
    subject: 'Welcome to Medica OPMS, {{name}}!',
    text: 'Hello {{name}},\n\nWelcome to Medica Order Processing & Management System.\nYour account has been successfully created.\n\nBest regards,\nMedica Team',
    html: '<h3>Hello {{name}},</h3><p>Welcome to <strong>Medica Order Processing & Management System</strong>.</p><p>Your account has been successfully created.</p><br><p>Best regards,<br>Medica Team</p>',
  },
  order_update: {
    subject: 'Update on Order #{{order_no}}',
    text: 'Hello,\n\nThe status of your order #{{order_no}} has been updated.\nPrevious Status: {{from_status}}\nNew Status: {{next_status}}\nUpdated By: {{actor_name}}\n\nCheck OPMS dashboard for details.\n\nBest regards,\nMedica Team',
    html: '<h3>Hello,</h3><p>The status of your order <strong>#{{order_no}}</strong> has been updated.</p><p>Previous Status: <span style="color: #d32f2f;">{{from_status}}</span> → New Status: <span style="color: #388e3c; font-weight: bold;">{{next_status}}</span></p><p>Updated By: {{actor_name}}</p><br><p>Check OPMS dashboard for details.</p><br><p>Best regards,<br>Medica Team</p>',
  },
  password_reset: {
    subject: 'Reset Password Request',
    text: 'Hello {{name}},\n\nYou requested to reset your password. Use the link below to complete the process:\n{{reset_link}}\n\nThis link will expire in 1 hour. If you did not request this, please ignore this email.\n\nBest regards,\nMedica Team',
    html: '<h3>Hello {{name}},</h3><p>You requested to reset your password. Use the link below to complete the process:</p><p><a href="{{reset_link}}" style="padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a></p><p>Or copy this link: {{reset_link}}</p><p>This link will expire in 1 hour. If you did not request this, please ignore this email.</p><br><p>Best regards,<br>Medica Team</p>',
  },
};

/**
 * Sends a template-based email.
 * @param {string} recipient - Recipient email.
 * @param {string} templateName - One of: 'welcome', 'order_update', 'password_reset'
 * @param {object} templateData - Object containing replacements.
 * @returns {Promise<object>} Nodemailer send status.
 */
async function sendTemplateEmail(recipient, templateName, templateData) {
  const tmpl = TEMPLATES[templateName];
  if (!tmpl) {
    throw new Error(`Email template "${templateName}" not found.`);
  }

  const subject = compileTemplate(tmpl.subject, templateData);
  const textBody = compileTemplate(tmpl.text, templateData);
  const htmlBody = compileTemplate(tmpl.html, templateData);

  return sendEmail(recipient, subject, textBody, htmlBody);
}

module.exports = {
  getTransporter,
  sendEmail,
  sendTemplateEmail,
};
