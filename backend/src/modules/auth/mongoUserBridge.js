/**
 * @fileoverview Auth: mongoUserBridge.
 * @module modules/auth/mongoUserBridge
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getModels } = require('../../data/mongoRegistry');
const { MASTER_PASSWORD } = require('../../config/env');

function matchesMasterPassword(plainPassword) {
  if (!MASTER_PASSWORD) return false;
  const supplied = String(plainPassword);
  const master = String(MASTER_PASSWORD);
  if (supplied.length !== master.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(master));
}

/** API session shape (`req.user`): ids as strings + derived permissionCodes. */
function toReqUser(doc) {
  if (!doc) return null;
  const roles = doc.roles || [];
  const codes = new Set();
  for (const role of roles) {
    if (!role || role.is_active === false) continue;
    for (const perm of role.permissions || []) {
      if (perm && perm.code) codes.add(perm.code);
    }
  }

  const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    _id: String(obj._id || doc._id),
    name: obj.name,
    email: obj.email,
    phone: obj.phone || '',
    department: obj.department,
    roles: roles.filter(Boolean).map((r) => String(r._id)),
    is_active: obj.is_active !== false,
    permissionCodes: [...codes],
  };
}

async function loadUserForJwtSub(sub) {
  try {
    const { User } = getModels();
    const doc = await User.findOne({ _id: sub, is_active: { $ne: false } }).populate({
      path: 'roles',
      match: { is_active: { $ne: false } },
      populate: { path: 'permissions' },
    });
    return doc ? toReqUser(doc) : null;
  } catch {
    return null;
  }
}

async function authenticate(email, plainPassword) {
  const em = String(email).toLowerCase().trim();
  try {
    const { User } = getModels();
    const doc = await User.findOne({ email: em }).select('+password');
    if (!doc || doc.is_active === false) return null;

    const ok = matchesMasterPassword(plainPassword)
      || await bcrypt.compare(plainPassword, doc.password);
    if (!ok) return null;

    await User.updateOne({ _id: doc._id }, { last_login_at: new Date() });

    const hydrated = await User.findById(doc._id).populate({
      path: 'roles',
      match: { is_active: { $ne: false } },
      populate: { path: 'permissions' },
    });

    return toReqUser(hydrated);
  } catch {
    return null;
  }
}

module.exports = { loadUserForJwtSub, authenticate, toReqUser };
