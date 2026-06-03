const fs = require('fs');
const path = require('path');

const modelsDir = 'C:\\Users\\Dell\\Desktop\\medica\\backend\\src\\models';
const registryPath = 'C:\\Users\\Dell\\Desktop\\medica\\backend\\src\\data\\mongoRegistry.js';

const models = [
  'Permission',
  'Role',
  'User',
  'Customer',
  'Product',
  'Vehicle',
  'Driver',
  'Order',
  'OrderStatusHistory',
  'OrderApproval',
  'OrderFlag',
  'Invoice',
  'Payment',
  'Collection',
  'Attachment',
  'Dispatch',
  'Transport',
  'ActivityLog',
  'Notification'
];

let schemasCode = '';
const pluginsList = [];

for (const model of models) {
  const file = path.join(modelsDir, `${model}.js`);
  if (!fs.existsSync(file)) {
    console.error(`Mirror file not found: ${file}`);
    continue;
  }
  let content = fs.readFileSync(file, 'utf8');

  // Strip imports and exports
  content = content.replace(/import\s+.*?\s+from\s+['"].*?['"];?/g, '');
  content = content.replace(/export\s+default\s+.*?;?/g, '');

  // Find all schema names declared in this file
  const schemaRegex = /const\s+([a-zA-Z0-9_]+Schema)\s*=/g;
  let match;
  while ((match = schemaRegex.exec(content)) !== null) {
    const schemaName = match[1];
    // Check if it has deletedAt and needs softDeletePlugin
    // We search the chunk of content after this match for deletedAt
    const startIndex = match.index;
    const nextSchemaMatch = schemaRegex.exec(content);
    const endIndex = nextSchemaMatch ? nextSchemaMatch.index : content.length;
    // reset regex lastIndex since we are doing manual exec inside
    schemaRegex.lastIndex = match.index + match[0].length;
    
    const schemaChunk = content.substring(startIndex, endIndex);
    if (schemaChunk.includes('deletedAt')) {
      pluginsList.push(`${schemaName}.plugin(softDeletePlugin);`);
    }
  }

  schemasCode += `  // --- Schemas from ${model}.js ---\n`;
  schemasCode += content.trim().split('\n').map(line => '  ' + line).join('\n') + '\n\n';
}

const fileTemplate = `/**
 * @fileoverview Registers all mongoose models/schemas used by this API (includes soft-delete where applied).
 * @module data/mongoRegistry
 */
const mongoose = require('mongoose');
const softDeletePlugin = require('../plugins/softDelete.plugin');

const MODULE_ENUM = [
  'user',
  'customer',
  'product',
  'order',
  'finance',
  'dispatch',
  'transport',
  'collection',
  'flag',
  'dashboard',
  'report',
  'system',
];

/** @type {Record<string, mongoose.Model> | null} */
let _cached = null;

function registerModels() {
${schemasCode}
  // --- Apply plugins ---
  ${pluginsList.map(p => '  ' + p).join('\n')}

  return {
    Permission: mongoose.models.Permission || mongoose.model('Permission', permissionSchema),
    Role: mongoose.models.Role || mongoose.model('Role', roleSchema),
    User: mongoose.models.User || mongoose.model('User', userSchema),
    Customer: mongoose.models.Customer || mongoose.model('Customer', customerSchema),
    Product: mongoose.models.Product || mongoose.model('Product', productSchema),
    Vehicle: mongoose.models.Vehicle || mongoose.model('Vehicle', vehicleSchema),
    Driver: mongoose.models.Driver || mongoose.model('Driver', driverSchema),
    Order: mongoose.models.Order || mongoose.model('Order', orderSchema),
    OrderStatusHistory:
      mongoose.models.OrderStatusHistory || mongoose.model('OrderStatusHistory', orderStatusHistorySchema),
    OrderApproval: mongoose.models.OrderApproval || mongoose.model('OrderApproval', orderApprovalSchema),
    OrderFlag: mongoose.models.OrderFlag || mongoose.model('OrderFlag', orderFlagSchema),
    Invoice: mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema),
    Payment: mongoose.models.Payment || mongoose.model('Payment', paymentSchema),
    Collection: mongoose.models.Collection || mongoose.model('Collection', collectionSchema, 'collections'),
    Attachment: mongoose.models.Attachment || mongoose.model('Attachment', attachmentSchema),
    Dispatch: mongoose.models.Dispatch || mongoose.model('Dispatch', dispatchSchema),
    Transport: mongoose.models.Transport || mongoose.model('Transport', transportSchema),
    ActivityLog: mongoose.models.ActivityLog || mongoose.model('ActivityLog', activityLogSchema),
    Notification: mongoose.models.Notification || mongoose.model('Notification', notificationSchema),
  };
}

/** @typedef {NonNullable<typeof _cached>} MongoModelsRegistry */

/** @returns {MongoModelsRegistry} */
function getModels() {
  if (!_cached) _cached = registerModels();
  return _cached;
}

/** @deprecated Prefer getModels(); kept for mongoSyncUsers + mongoUserBridge */
function getMongoModels() {
  const all = getModels();
  const { Permission, Role, User } = all;
  return { Permission, Role, User };
}

module.exports = {
  getModels,
  getMongoModels,
};
`;

fs.writeFileSync(registryPath, fileTemplate, 'utf8');
console.log('Reconstructed mongoRegistry.js successfully!');
