/**
 * @fileoverview Shared helpers for communication queue handlers.
 * @module modules/communication/communication.utils
 */

function normalizeRecipients(raw) {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) {
    return raw.map((r) => String(r ?? '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw.split(',').map((r) => r.trim()).filter(Boolean);
  }
  return [String(raw).trim()].filter(Boolean);
}

function resolveContactName(contactName, index) {
  if (Array.isArray(contactName)) {
    return String(contactName[index] ?? '').trim();
  }
  if (typeof contactName === 'string') {
    const parts = contactName.split(',').map((s) => s.trim());
    return parts[index] || parts[0] || '';
  }
  return contactName != null ? String(contactName).trim() : '';
}

module.exports = {
  normalizeRecipients,
  resolveContactName,
};
