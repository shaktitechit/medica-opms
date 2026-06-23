/**
 * @fileoverview Utilities (generateDispatchNo).
 * @module utils/generateDispatchNo
 */
const { getModels } = require('../data/mongoRegistry');

/**
 * Generates a dispatch number in the format: DSP-PartyInitials-YYYYMMDD-Serial
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

  const startOfDay = new Date(dateObj);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(dateObj);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const count = await OrderDispatch.countDocuments({
    dispatched_at: {
      $gte: startOfDay,
      $lte: endOfDay
    },
    deletedAt: null
  });

  const serial = String(count + 1).padStart(3, '0');

  return `DSP-${partyInitials}-${dateStr}-${serial}`;
}

module.exports = { generateDispatchNo };

