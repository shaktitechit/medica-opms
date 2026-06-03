/**
 * @fileoverview Shared constants (flagTypes).
 * @module constants/flagTypes
 */
/** Matches models/OrderFlag.js flag_type enum */
const FLAG_TYPES = Object.freeze([
  'urgent',
  'payment_issue',
  'dispatch_issue',
  'stock_issue',
  'customer_issue',
  'document_missing',
  'approval_delay',
  'vehicle_issue',
  'pod_missing',
  'invoice_mismatch',
  'customer_dispute',
]);

function isValidFlagType(value) {
  return typeof value === 'string' && FLAG_TYPES.includes(value);
}

module.exports = { FLAG_TYPES, isValidFlagType };
