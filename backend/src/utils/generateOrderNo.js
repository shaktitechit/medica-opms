/**
 * @fileoverview Utilities (generateOrderNo).
 * @module utils/generateOrderNo
 */
const { getModels } = require('../data/mongoRegistry');

/**
 * Generates an order number in the format: ORD-PartyInitials-YYYYMMDD-Serial
 * @param {string} partyId - Mongoose ID of the Party
 * @param {Date|string} [orderDate] - Date of the order
 * @returns {Promise<string>} The generated order number
 */
async function generateOrderNo(partyId, orderDate) {
  if (!partyId) {
    // Fallback if partyId is missing
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `ORD-TEMP-${ts}-${rand}`;
  }

  const { Party, Order } = getModels();

  // 1. Get Party Name and extract initials
  const partyDoc = await Party.findById(partyId).lean();
  const partyName = partyDoc ? partyDoc.party_name : 'UNKNOWN';

  // Replace punctuation/special chars with space to treat dotted words separately
  const cleanName = partyName.replace(/[^a-zA-Z0-9\s]/g, ' ');
  const words = cleanName.trim().split(/\s+/).filter(Boolean);
  const initials = words
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase();
  const partyInitials = initials || 'XX';

  // 2. Format date as YYYYMMDD
  const dateObj = orderDate ? new Date(orderDate) : new Date();
  
  // Use UTC values to ensure consistency across servers/containers
  const year = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getUTCDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  // 3. Count how many orders exist on that day to compute the serial number
  const startOfDay = new Date(dateObj);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(dateObj);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const count = await Order.countDocuments({
    order_date: {
      $gte: startOfDay,
      $lte: endOfDay
    },
    deletedAt: null
  });

  const serial = String(count + 1).padStart(3, '0');

  return `ORD-${partyInitials}-${dateStr}-${serial}`;
}

module.exports = { generateOrderNo };

