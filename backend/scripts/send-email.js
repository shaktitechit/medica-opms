/**
 * Script to test email sending.
 * Usage: node scripts/send-email.js <recipient_email> [template_name] [json_params]
 * Example: node scripts/send-email.js mailtoajit143@gmail.com default '{"subject":"Hi AJIT","body":"Testing SPSPL Graph API"}'
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const emailHelper = require('../src/modules/messages/helpers/email.helper');

const recipient = process.argv[2];
const templateName = process.argv[3] || 'default';
const paramsRaw = process.argv[4];

if (!recipient) {
  console.log('\nUsage: node scripts/send-email.js <recipient_email> [template_name] [json_params]');
  console.log('Example: node scripts/send-email.js mailtoajit143@gmail.com default \'{"subject":"Hi","body":"Body content"}\'\n');
  process.exit(1);
}

let templateParams = {};
if (paramsRaw) {
  try {
    templateParams = JSON.parse(paramsRaw);
  } catch (err) {
    console.error('Warning: Failed to parse JSON params, using empty object.');
  }
}

async function run() {
  console.log(`Sending template "${templateName}" to ${recipient}...`);
  try {
    const result = await emailHelper.sendTemplateEmail(recipient, templateName, {
      subject: templateParams.subject || `Test ${templateName}`,
      body: templateParams.body || `Testing template: ${templateName}`,
      ...templateParams,
    });
    console.log('Email sent successfully!', result);
  } catch (error) {
    console.error('Failed to send email:', error);
  }
}

run();
