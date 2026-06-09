/**
 * @fileoverview Parties: request validation.
 * @module modules/parties/party.validation
 */
const { ApiError } = require('../../utils/ApiError');

const PARTY_TYPES = new Set(['customer', 'supplier', 'both']);

function hasContactPhone(body) {
  if (body.mobile && typeof body.mobile === 'string' && body.mobile.trim()) return true;
  if (!Array.isArray(body.contacts)) return false;
  return body.contacts.some(
    (c) => c && typeof c === 'object' && typeof c.phone === 'string' && c.phone.trim()
  );
}

function assertCreate(body) {
  if (!body || typeof body !== 'object') throw new ApiError(400, 'JSON body required');
  if (!body.party_name || typeof body.party_name !== 'string' || !body.party_name.trim()) {
    throw new ApiError(400, 'party_name is required');
  }
  if (!hasContactPhone(body)) {
    throw new ApiError(400, 'At least one contact phone number is required');
  }
  if (body.party_type != null && !PARTY_TYPES.has(body.party_type)) {
    throw new ApiError(400, 'Invalid party_type');
  }
}

module.exports = { assertCreate, PARTY_TYPES };
