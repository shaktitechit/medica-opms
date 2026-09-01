/**
 * @fileoverview Sequence generator for Lead Numbers (e.g. LEAD-YYYY-000001).
 * @module utils/generateLeadNo
 */
const { getModels } = require('../data/mongoRegistry');

/**
 * Generates a unique human-readable lead number.
 * Format: LEAD-YYYY-000001 (annual sequence)
 * @param {Date|string} [leadDate] - Creation date
 * @returns {Promise<string>} The generated lead number
 */
async function generateLeadNo(leadDate) {
  const { Lead } = getModels();
  const dateObj = leadDate ? new Date(leadDate) : new Date();
  const year = dateObj.getUTCFullYear();
  const prefix = `LEAD-${year}-`;

  try {
    // 1. Inspect collection directly for the highest sequence number in the current year
    const latestDocs = await Lead.collection
      .find({ lead_no: { $regex: `^${prefix}\\d+` } })
      .sort({ lead_no: -1 })
      .limit(1)
      .toArray();

    let nextSeq = 1;
    if (latestDocs && latestDocs.length > 0 && latestDocs[0].lead_no) {
      const match = String(latestDocs[0].lead_no).match(/LEAD-\d+-(\d+)/);
      if (match && match[1]) {
        const parsed = parseInt(match[1], 10);
        if (!isNaN(parsed) && parsed >= nextSeq) {
          nextSeq = parsed + 1;
        }
      }
    }

    let candidate = `${prefix}${String(nextSeq).padStart(6, '0')}`;

    // 2. Double-check raw collection directly to avoid soft-delete/filter collisions
    let exists = await Lead.collection.findOne({ lead_no: candidate });
    while (exists) {
      nextSeq++;
      candidate = `${prefix}${String(nextSeq).padStart(6, '0')}`;
      exists = await Lead.collection.findOne({ lead_no: candidate });
    }

    return candidate;
  } catch (_err) {
    // Safe timestamp fallback in case of collection access issues
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${prefix}${ts}-${rand}`;
  }
}

module.exports = { generateLeadNo };

