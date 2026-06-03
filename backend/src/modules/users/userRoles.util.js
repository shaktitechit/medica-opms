/**
 * @fileoverview User `roles[]` coercion: string/ObjectId lists, dedupe, existence check against active Role documents.
 * @module modules/users/userRoles.util
 */
const mongoose = require('mongoose');
const { getModels } = require('../../data/mongoRegistry');
const { ApiError } = require('../../utils/ApiError');

/**
 * Normalize client payloads to a list of Role ObjectIds (deduped).
 * Accepts: array of ids, comma-separated string, JSON array string, or array-like `{ 0: id0, ... }`.
 */
function coerceRoleIds(raw) {
  let list = [];
  if (raw == null || raw === '') list = [];
  else if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'string') {
    const t = raw.trim();
    if (t.startsWith('[')) {
      try {
        const parsed = JSON.parse(t);
        list = Array.isArray(parsed) ? parsed : [];
      } catch {
        list = [];
      }
    } else {
      list = t.split(',').map((s) => s.trim()).filter(Boolean);
    }
  } else if (typeof raw === 'object') {
    const keys = Object.keys(raw)
      .filter((k) => /^\d+$/.test(k))
      .sort((a, b) => Number(a) - Number(b));
    if (keys.length) list = keys.map((k) => raw[k]).filter(Boolean);
  }

  const seen = new Set();
  const out = [];
  for (const item of list) {
    const s = String(item).trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    if (!mongoose.Types.ObjectId.isValid(s)) {
      throw new ApiError(400, `Invalid role id: ${s}`);
    }
    try {
      out.push(new mongoose.Types.ObjectId(s));
    } catch {
      throw new ApiError(400, `Invalid role id: ${s}`);
    }
  }
  return out;
}

/** Ensure each id exists as an active Role (avoids silently saving bad refs → empty populate). */
async function assertRolesExist(roleObjectIds) {
  if (!roleObjectIds.length) return;
  const { Role } = getModels();
  const existing = await Role.find({
    _id: { $in: roleObjectIds },
    is_active: { $ne: false },
  })
    .select('_id')
    .lean();

  const have = new Set(existing.map((r) => String(r._id)));
  const missing = roleObjectIds.filter((id) => !have.has(String(id)));
  if (missing.length) {
    throw new ApiError(
      400,
      `Unknown or inactive role id(s): ${missing.map(String).join(', ')}`
    );
  }
}

module.exports = { coerceRoleIds, assertRolesExist };
