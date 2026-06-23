/**
 * @fileoverview Utilities (generateDueSheetNo).
 * @module utils/generateDueSheetNo
 */
const { getModels } = require('../data/mongoRegistry');

/**
 * Generates a due sheet number in the format: ODS-PartyInitials-YYYYMMDD-Serial
 * @param {string} partyId - Mongoose ID of the Party
 * @param {Date|string} [sheetDate] - Date of the due sheet
 * @returns {Promise<string>} The generated due sheet number
 */
async function generateDueSheetNo(partyId, sheetDate) {
  if (!partyId) {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `ODS-TEMP-${ts}-${rand}`;
  }

  const { Party, OrderDueSheet } = getModels();

  const partyDoc = await Party.findById(partyId).lean();
  const partyName = partyDoc ? partyDoc.party_name : 'UNKNOWN';

  const cleanName = partyName.replace(/[^a-zA-Z0-9\s]/g, ' ');
  const words = cleanName.trim().split(/\s+/).filter(Boolean);
  const initials = words
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase();
  const partyInitials = initials || 'XX';

  const dateObj = sheetDate ? new Date(sheetDate) : new Date();
  
  const year = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getUTCDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  const startOfDay = new Date(dateObj);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(dateObj);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const count = await OrderDueSheet.countDocuments({
    sheet_date: {
      $gte: startOfDay,
      $lte: endOfDay
    },
    deletedAt: null
  });

  const serial = String(count + 1).padStart(3, '0');

  return `ODS-${partyInitials}-${dateStr}-${serial}`;
}

module.exports = { generateDueSheetNo };

