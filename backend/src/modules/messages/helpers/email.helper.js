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

function extractCleanBase64(content) {
  if (!content) return '';
  if (Buffer.isBuffer(content)) {
    return content.toString('base64');
  }
  if (typeof content === 'string') {
    const commaIdx = content.indexOf(',');
    if (content.startsWith('data:') && commaIdx !== -1) {
      return content.slice(commaIdx + 1).trim();
    }
    return content.trim();
  }
  return '';
}

function parseEmailAddresses(value) {
  if (!value) return [];
  const parts = Array.isArray(value)
    ? value.flatMap((v) => String(v || '').split(/[,;]/))
    : String(value).split(/[,;]/);
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    const email = String(part).trim();
    if (!email || !email.includes('@')) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

function toGraphRecipients(emails) {
  return emails.map((address) => ({ emailAddress: { address } }));
}

function parseFromAddress(fromVal) {
  if (!fromVal) return null;
  const str = String(fromVal).trim();
  if (!str) return null;
  const match = str.match(/^(?:["']?([^"']+)["']?\s+<)?([^<>\s]+@[^<>\s]+)>?$/);
  if (match) {
    return {
      name: match[1] ? match[1].trim() : undefined,
      address: match[2].trim(),
    };
  }
  if (str.includes('@')) {
    return { address: str };
  }
  return null;
}

async function sendEmailViaGraph(recipient, subject, textBody, htmlBody, attachments = [], cc = [], from = null) {
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

  const graphAttachments = (attachments || []).map((att) => {
    return {
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: att.filename || att.name || 'document.pdf',
      contentType: att.contentType || 'application/pdf',
      contentBytes: extractCleanBase64(att.content),
    };
  });

  const toRecipients = parseEmailAddresses(recipient);
  const toKeys = new Set(toRecipients.map((e) => e.toLowerCase()));
  const ccRecipients = parseEmailAddresses(cc).filter((e) => !toKeys.has(e.toLowerCase()));
  const fromObj = parseFromAddress(from);
  const senderEmailAddress = (fromObj && fromObj.address) ? fromObj.address : microsoftGraph.senderEmail;

  const fromPayload = fromObj
    ? { emailAddress: { address: fromObj.address, name: fromObj.name } }
    : { emailAddress: { address: senderEmailAddress } };

  const replyToPayload = fromObj && fromObj.address
    ? [{ emailAddress: { address: fromObj.address, name: fromObj.name } }]
    : [{ emailAddress: { address: senderEmailAddress } }];

  logger.info(`[Email Helper] Sending email to ${recipient} via Microsoft Graph API (From: ${senderEmailAddress})${ccRecipients.length ? ` (CC: ${ccRecipients.join(', ')})` : ''}...`);

  const sendMailUrl = `https://graph.microsoft.com/v1.0/users/${senderEmailAddress}/sendMail`;
  const mailBody = {
    message: {
      subject: subject,
      body: {
        contentType: htmlBody ? 'HTML' : 'Text',
        content: htmlBody || textBody
      },
      toRecipients: toGraphRecipients(
        toRecipients.length ? toRecipients : [String(recipient || '').trim()].filter(Boolean)
      ),
      ...(ccRecipients.length > 0 ? { ccRecipients: toGraphRecipients(ccRecipients) } : {}),
      from: fromPayload,
      replyTo: replyToPayload,
      ...(graphAttachments.length > 0 ? { attachments: graphAttachments } : {})
    },
    saveToSentItems: 'true'
  };

  try {
    const response = await axios.post(sendMailUrl, mailBody, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    logger.info(`[Email Helper] Email sent successfully via Microsoft Graph API from ${senderEmailAddress}.`);
    return response.data || { success: true };
  } catch (graphErr) {
    if (senderEmailAddress !== microsoftGraph.senderEmail && microsoftGraph.senderEmail) {
      logger.warn(`[Email Helper] Failed to send email via Graph API using sender ${senderEmailAddress} (${graphErr.message}). Retrying with default Graph mailbox (${microsoftGraph.senderEmail})...`);
      const fallbackUrl = `https://graph.microsoft.com/v1.0/users/${microsoftGraph.senderEmail}/sendMail`;
      const response = await axios.post(fallbackUrl, mailBody, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      logger.info(`[Email Helper] Email sent successfully via fallback Graph mailbox (${microsoftGraph.senderEmail}).`);
      return response.data || { success: true };
    }
    throw graphErr;
  }
}

/**
 * Core send email function.
 * @param {string} recipient - Recipient email.
 * @param {string} subject - Subject line.
 * @param {string} textBody - Plain text body.
 * @param {string} htmlBody - HTML body.
 * @param {Array} [attachments] - List of attachments [{ filename, content, contentType, path }].
 * @param {string|string[]} [cc] - CC recipient email(s).
 * @returns {Promise<object>} Nodemailer or Microsoft Graph send status.
 */
async function sendEmail(recipient, subject, textBody, htmlBody, attachments = [], cc = [], from = null) {
  if (microsoftGraph.isConfigured()) {
    try {
      return await sendEmailViaGraph(recipient, subject, textBody, htmlBody, attachments, cc, from);
    } catch (graphError) {
      logger.error(`[Email Helper] Microsoft Graph send failed: ${graphError.message}. Falling back to SMTP.`);
    }
  }

  const transporter = getTransporter();
  const defaultFrom = smtpConfig.transportOptions().auth?.user || 'no-reply@medica-opms.com';
  const mailFrom = from || defaultFrom;

  const normalizedAttachments = (attachments || []).map((att) => {
    if ((typeof att.content === 'string' || Buffer.isBuffer(att.content)) && !att.path) {
      const cleanBase64 = extractCleanBase64(att.content);
      return {
        filename: att.filename || att.name || 'document.pdf',
        content: Buffer.from(cleanBase64, 'base64'),
        contentType: att.contentType || 'application/pdf',
      };
    }
    return att;
  });

  const toKeys = new Set(parseEmailAddresses(recipient).map((e) => e.toLowerCase()));
  const ccList = parseEmailAddresses(cc).filter((e) => !toKeys.has(e.toLowerCase()));

  const mailOptions = {
    from: mailFrom,
    to: recipient,
    subject,
    text: textBody,
    html: htmlBody,
    attachments: normalizedAttachments,
    ...(ccList.length > 0 ? { cc: ccList.join(', ') } : {}),
  };

  logger.info(`[Email Helper] Sending email to ${recipient} via SMTP... (${normalizedAttachments.length} attachments${ccList.length ? `, CC: ${ccList.join(', ')}` : ''})`);

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
 * @param {Array} [attachments] - List of attachments [{ filename, content, contentType, path }].
 * @param {string|string[]} [cc] - CC recipient email(s).
 * @returns {Promise<object>} Nodemailer send status.
 */
async function sendTemplateEmail(recipient, templateName, templateData = {}, attachments = [], cc = [], from = null) {
  const templatesDir = path.join(__dirname, '..', 'templates', 'emails');
  const templatePath = path.join(templatesDir, `${templateName}.html`);
  const defaultTemplatePath = path.join(templatesDir, 'default.html');

  let company = {};
  try {
    const { getCompanyInfo } = require('../../companyInfo/companyInfo.service');
    if (typeof getCompanyInfo === 'function') {
      company = (await getCompanyInfo()) || {};
    }
  } catch (err) {
    logger.warn(`[Email Helper] Could not retrieve CompanyInfo: ${err.message}`);
  }

  const companyName = templateData.companyName || company.trade_name || company.legal_name || 'Medica';
  const companyLegalName = templateData.companyLegalName || company.legal_name || company.trade_name || 'Medica';
  const companyLogo = (() => {
    const raw = templateData.companyLogo || templateData.logoUrl || company.logo_url || '';
    if (!raw) return '';
    // Already absolute — use as-is
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    // Relative path — prepend the server's public base URL so email clients can load it
    const base = (
      process.env.API_PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_API_ORIGIN ||
      ''
    ).replace(/\/$/, '');
    return base ? `${base}${raw.startsWith('/') ? '' : '/'}${raw}` : raw;
  })();
  const companyPhone = templateData.companyPhone || company.phone || '';
  const companyEmail = templateData.companyEmail || company.email || company.billing_email || '';
  const companyWebsite = templateData.companyWebsite || company.website || '';
  const companyAddress = templateData.companyAddress || [company.address, company.city, company.state, company.pincode, company.country].filter(Boolean).join(', ');
  const companyTagline = templateData.companyTagline || company.tagline || '';
  const companyGstin = templateData.companyGstin || company.gstin || '';
  const companyPan = templateData.companyPan || company.pan || '';
  const companyBankName = templateData.companyBankName || company.bank_name || '';
  const companyAccountName = templateData.companyAccountName || company.account_name || '';
  const companyAccountNo = templateData.companyAccountNo || company.account_number || '';
  const companyIfsc = templateData.companyIfsc || company.ifsc_code || '';
  const companyBranch = templateData.companyBranch || company.branch_name || '';
  const companyUpi = templateData.companyUpi || company.upi_id || '';
  const year = new Date().getFullYear();

  // Build pre-rendered footer HTML (no Handlebars conditionals needed in templates)
  const footerLines = [];
  if (companyAddress) footerLines.push(`<p>Head Office: ${companyAddress}</p>`);
  const contactParts = [];
  if (companyPhone) contactParts.push(`Phone: ${companyPhone}`);
  if (companyEmail) contactParts.push(`Email: <a href="mailto:${companyEmail}">${companyEmail}</a>`);
  if (companyWebsite) contactParts.push(`Website: <a href="${companyWebsite}">${companyWebsite}</a>`);
  if (contactParts.length) footerLines.push(`<p>${contactParts.join(' &nbsp;&nbsp; ')}</p>`);
  const companyFooterHtml = footerLines.join('\n');

  const defaultCompanyLogoHtml = companyLogo
    ? `<img src="${companyLogo}" alt="${companyName} Logo" class="header-logo" style="max-height: 72px; max-width: 180px; display: block; margin: 0 auto 10px auto;">`
    : '';

  const mergedData = {
    companyName,
    companyLegalName,
    companyLogo,
    logoUrl: companyLogo,
    companyLogoHtml: templateData.companyLogoHtml || defaultCompanyLogoHtml,
    companyPhone,
    companyEmail,
    companyWebsite,
    companyAddress,
    companyTagline,
    companyFooterHtml,
    companyGstin,
    companyPan,
    companyBankName,
    companyAccountName,
    companyAccountNo,
    companyIfsc,
    companyBranch,
    companyUpi,
    year,
    ...templateData,
  };

  let htmlBody;
  const subject = mergedData.subject || 'Notification';
  const textBody = mergedData.body || mergedData.text || '';

  try {
    // Try to load requested template
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    htmlBody = compileTemplate(templateContent, mergedData);
  } catch (err) {
    logger.warn(`[Email Helper] Template "${templateName}" not found on disk. Falling back to default.html.`);
    try {
      // Fallback to default.html
      const defaultContent = await fs.readFile(defaultTemplatePath, 'utf-8');
      htmlBody = compileTemplate(defaultContent, mergedData);
    } catch (fallbackErr) {
      logger.error(`[Email Helper] Failed to read default.html template. Sending plain text fallback.`);
      htmlBody = textBody;
    }
  }

  const finalAttachments = attachments && attachments.length > 0 ? attachments : mergedData.attachments || [];
  const finalCc = (Array.isArray(cc) && cc.length > 0) || (typeof cc === 'string' && cc.trim())
    ? cc
    : mergedData.cc || [];
  const finalFrom = from || mergedData.from;
  return sendEmail(recipient, subject, textBody, htmlBody, finalAttachments, finalCc, finalFrom);
}

module.exports = {
  getTransporter,
  sendEmail,
  sendTemplateEmail,
};
