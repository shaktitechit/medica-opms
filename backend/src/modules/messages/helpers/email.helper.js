/**
 * @fileoverview Email Helper: manages SMTP connection and compiles templates using Nodemailer.
 * @module modules/messages/helpers/email.helper
 */
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const smtpConfig = require('../../../config/smtp');
const microsoftGraph = require('../../../config/microsoftGraph');
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

async function sendEmailViaGraph(recipient, subject, textBody, htmlBody) {
  logger.info(`[Email Helper] Sending email to ${recipient} via Microsoft Graph API...`);
  
  const tokenUrl = `https://login.microsoftonline.com/${microsoftGraph.tenantId}/oauth2/v2.0/token`;
  const params = new URLSearchParams();
  params.append('client_id', microsoftGraph.clientId);
  params.append('scope', 'https://graph.microsoft.com/.default');
  params.append('client_secret', microsoftGraph.clientSecret);
  params.append('grant_type', 'client_credentials');

  const tokenRes = await axios.post(tokenUrl, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  const accessToken = tokenRes.data.access_token;

  const sendMailUrl = `https://graph.microsoft.com/v1.0/users/${microsoftGraph.senderEmail}/sendMail`;
  const mailBody = {
    message: {
      subject: subject,
      body: {
        contentType: htmlBody ? 'HTML' : 'Text',
        content: htmlBody || textBody
      },
      toRecipients: [
        {
          emailAddress: {
            address: recipient
          }
        }
      ]
    },
    saveToSentItems: 'true'
  };

  const response = await axios.post(sendMailUrl, mailBody, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  logger.info(`[Email Helper] Email sent successfully via Microsoft Graph API.`);
  return response.data || { success: true };
}

/**
 * Core send email function.
 * @param {string} recipient - Recipient email.
 * @param {string} subject - Subject line.
 * @param {string} textBody - Plain text body.
 * @param {string} htmlBody - HTML body.
 * @returns {Promise<object>} Nodemailer or Microsoft Graph send status.
 */
async function sendEmail(recipient, subject, textBody, htmlBody) {
  if (microsoftGraph.isConfigured()) {
    try {
      return await sendEmailViaGraph(recipient, subject, textBody, htmlBody);
    } catch (graphError) {
      logger.error(`[Email Helper] Microsoft Graph send failed: ${graphError.message}. Falling back to SMTP.`);
    }
  }

  const transporter = getTransporter();
  const from = smtpConfig.transportOptions().auth?.user || 'no-reply@medica-opms.com';

  const mailOptions = {
    from,
    to: recipient,
    subject,
    text: textBody,
    html: htmlBody,
  };

  logger.info(`[Email Helper] Sending email to ${recipient} via SMTP...`);

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`[Email Helper] Email sent successfully via SMTP. Message ID: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error(`[Email Helper] Error sending email to ${recipient} via SMTP: ${error.message}`);
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

/**
 * Sends a template-based email.
 * @param {string} recipient - Recipient email.
 * @param {string} templateName - The name of the HTML template file (without extension).
 * @param {object} templateData - Object containing replacements.
 * @returns {Promise<object>} Nodemailer send status.
 */
async function sendTemplateEmail(recipient, templateName, templateData) {
  const templatesDir = path.join(__dirname, '..', 'templates', 'emails');
  const templatePath = path.join(templatesDir, `${templateName}.html`);
  const defaultTemplatePath = path.join(templatesDir, 'default.html');

  let htmlBody;
  const subject = templateData.subject || 'Notification';
  const textBody = templateData.body || templateData.text || '';

  try {
    // Try to load requested template
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    htmlBody = compileTemplate(templateContent, templateData);
  } catch (err) {
    logger.warn(`[Email Helper] Template "${templateName}" not found on disk. Falling back to default.html.`);
    try {
      // Fallback to default.html
      const defaultContent = await fs.readFile(defaultTemplatePath, 'utf-8');
      const compiledData = {
        subject,
        body: templateData.body || templateData.text || '',
        year: new Date().getFullYear(),
        ...templateData,
      };
      htmlBody = compileTemplate(defaultContent, compiledData);
    } catch (fallbackErr) {
      logger.error(`[Email Helper] Failed to read default.html template. Sending plain text fallback.`);
      htmlBody = textBody;
    }
  }

  return sendEmail(recipient, subject, textBody, htmlBody);
}

module.exports = {
  getTransporter,
  sendEmail,
  sendTemplateEmail,
};
