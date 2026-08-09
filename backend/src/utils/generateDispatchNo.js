/**
 * @fileoverview Utilities (generateDispatchNo).
 * @module utils/generateDispatchNo
 */
const { getModels } = require('../data/mongoRegistry');

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generates a dispatch number in the format: DSP-PartyInitials-YYYYMMDD-Serial
 * Serial is max existing for that prefix + 1 (includes soft-deleted) so unique index collisions are avoided.
 * @param {string} partyId - Mongoose ID of the Party
 * @param {Date|string} [dispatchDate] - Date of the dispatch
 * @returns {Promise<string>} The generated dispatch number
 */
async function generateDispatchNo(partyId, dispatchDate) {
  if (!partyId) {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `DSP-TEMP-${ts}-${rand}`;
  }

  const { Party, OrderDispatch } = getModels();

  const partyDoc = await Party.findById(partyId).lean();
  const partyName = partyDoc ? partyDoc.party_name : 'UNKNOWN';

  const cleanName = partyName.replace(/[^a-zA-Z0-9\s]/g, ' ');
  const words = cleanName.trim().split(/\s+/).filter(Boolean);
  const initials = words
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase();
  const partyInitials = initials || 'XX';

  const dateObj = dispatchDate ? new Date(dispatchDate) : new Date();

  const year = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getUTCDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  const prefix = `DSP-${partyInitials}-${dateStr}-`;
  const existing = await OrderDispatch.find({
    dispatch_no: new RegExp(`^${escapeRegex(prefix)}\\d+$`),
  })
    .select('dispatch_no')
    .lean();

  let maxSerial = 0;
  for (const row of existing) {
    const match = String(row.dispatch_no || '').match(/-(\d+)$/);
    if (!match) continue;
    const n = Number.parseInt(match[1], 10);
    if (Number.isFinite(n) && n > maxSerial) maxSerial = n;
  }

  const serial = String(maxSerial + 1).padStart(3, '0');
  return `${prefix}${serial}`;
}

module.exports = { generateDispatchNo };
