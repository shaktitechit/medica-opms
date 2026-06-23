/**
 * @fileoverview Upserts seed permissions/roles/example users against MongoDB.
 * @module data/mongoSyncUsers
 */
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const db = require('../config/db');
const { MONGODB_URI } = require('../config/env');
const { CORE_USERS, EXTRA_EXAMPLE_USERS } = require('./exampleUserSeeder');
const { PERMISSION_DEFS } = require('./seed');

/** Mirrors roles in seed.js mkRole(...) */
const ROLE_SEED_DEFS = [
  { name: 'Super Administrator', code: 'super_admin', department: 'super_admin', permCodes: ['*'], is_system_role: true },
  { name: 'Administrator', code: 'admin', department: 'admin', permCodes: ['*'], is_system_role: true },
  {
    name: 'Sales',
    code: 'sales',
    department: 'sales',
    permCodes: ['parties:manage', 'products:manage', 'orders:read', 'orders:write', 'flags:suite', 'dashboard:view','records:delete'],
  },
  {
    name: 'Finance',
    code: 'finance',
    department: 'finance',
    permCodes: ['parties:manage', 'orders:read', 'orders:write', 'finance:suite', 'flags:suite', 'dashboard:view'],
  },
  {
    name: 'Account',
    code: 'account',
    department: 'account',
    permCodes: ['orders:read', 'orders:write', 'finance:suite', 'dispatch:suite', 'flags:suite', 'dashboard:view'],
  },
  {
    name: 'Dispatch',
    code: 'dispatch',
    department: 'dispatch',
    permCodes: ['orders:read', 'dispatch:suite', 'transport:suite', 'flags:suite', 'dashboard:view', 'parties:manage'],
  },
];

const { getMongoModels } = require('./mongoModels');

async function upsertPermissions(Permission) {
  const map = new Map();
  for (const d of PERMISSION_DEFS) {
    const name = (d.description || d.code).trim() || d.code;
    const row = await Permission.findOneAndUpdate(
      { code: d.code },
      {
        name,
        code: d.code,
        module: d.module,
        description: d.description || '',
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    map.set(d.code, row._id);
  }
  return map;
}

async function upsertRoles(Role, permissionIdsByCode) {
  const allPermIds = [...permissionIdsByCode.values()];

  for (const role of ROLE_SEED_DEFS) {
    let permIds;
    if (role.permCodes.includes('*')) permIds = allPermIds;
    else {
      permIds = [];
      for (const c of role.permCodes) {
        const id = permissionIdsByCode.get(c);
        if (!id) throw new Error(`Permission code missing from catalog: ${c}`);
        permIds.push(id);
      }
    }

    await Role.findOneAndUpdate(
      { code: role.code },
      {
        name: role.name,
        code: role.code,
        department: role.department,
        permissions: permIds,
        is_system_role: !!role.is_system_role,
        is_active: true,
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }
}

async function roleIdsByCodeMap(Role) {
  const map = new Map();
  const rows = await Role.find().lean();
  for (const r of rows) map.set(r.code, r._id);
  return map;
}

function summarizeRolesAndPermissions(permissionRows, roleRows) {
  const codeByPermId = new Map(
    permissionRows.map((p) => [String(p._id), p.code])
  );

  return {
    permissions: permissionRows.map((p) => ({
      id: String(p._id),
      code: p.code,
      module: p.module,
      name: p.name,
    })),
    roles: roleRows.map((r) => ({
      id: String(r._id),
      code: r.code,
      name: r.name,
      department: r.department,
      is_system_role: !!r.is_system_role,
      permissionCodes: (r.permissions || [])
        .map((pid) => codeByPermId.get(String(pid)) || String(pid))
        .filter(Boolean),
    })),
  };
}

/**
 * Upsert permission catalog and system roles into MongoDB (no user changes).
 *
 * @param {{ fixEmptyUserRoles?: boolean }} opts
 */
async function syncRolesAndPermissionsToMongo(opts = {}) {
  if (!MONGODB_URI || String(MONGODB_URI).trim() === '') {
    return {
      synced: false,
      reason:
        'Set MONGO_URI or MONGODB_URI in .env to write to MongoDB. In-memory seed does not touch Atlas.',
    };
  }

  if (mongoose.connection.readyState !== 1) await db.connect();

  const { Permission, Role, User } = getMongoModels();
  const permMap = await upsertPermissions(Permission);
  await upsertRoles(Role, permMap);

  const permissionRows = await Permission.find().sort({ code: 1 }).lean();
  const roleRows = await Role.find().sort({ code: 1 }).lean();
  const summary = summarizeRolesAndPermissions(permissionRows, roleRows);

  let usersRolesFixed = [];
  if (opts.fixEmptyUserRoles) {
    const rolesByCode = await roleIdsByCodeMap(Role);
    const users = await User.find({
      $or: [{ roles: { $exists: false } }, { roles: { $size: 0 } }],
    }).lean();

    for (const u of users) {
      const roleId = rolesByCode.get(u.department);
      if (!roleId) continue;
      await User.updateOne({ _id: u._id }, { $set: { roles: [roleId] } });
      usersRolesFixed.push(u.email);
    }
  }

  return {
    synced: true,
    database: mongoose.connection.db?.databaseName,
    permissionsUpserted: PERMISSION_DEFS.length,
    rolesUpserted: ROLE_SEED_DEFS.length,
    usersRolesFixed,
    ...summary,
  };
}

function buildUserList(opts = {}) {
  const includeExtras = opts.includeExtras !== false;
  const onlyExtras = !!opts.onlyExtras;
  let list = onlyExtras ? [...EXTRA_EXAMPLE_USERS] : [...CORE_USERS];
  if (!onlyExtras && includeExtras) list.push(...EXTRA_EXAMPLE_USERS);
  return list;
}

/**
 * Upsert permissions → roles → example users into MongoDB (collections: permissions, roles, users).
 * Assumes mongoose is connected via config/db.connect().
 *
 * @param {string} plainPassword shared bcrypt source when row has no passwordPlain
 * @param {{ includeExtras?: boolean, onlyExtras?: boolean }} opts
 */
async function syncExampleUsersToMongo(plainPassword, opts = {}) {
  if (!MONGODB_URI || String(MONGODB_URI).trim() === '') {
    return {
      synced: false,
      reason:
        'Set MONGO_URI or MONGODB_URI in .env to write to MongoDB. In-memory seed does not touch Atlas.',
    };
  }

  if (mongoose.connection.readyState !== 1) await db.connect();

  await syncRolesAndPermissionsToMongo();

  const { User, Role } = getMongoModels();
  const rolesByCode = await roleIdsByCodeMap(Role);

  const list = buildUserList(opts);
  const defaultHash = bcrypt.hashSync(String(plainPassword || 'ChangeMe123!'), 10);

  const created = [];
  const updated = [];

  for (const row of list) {
    const email = String(row.email).toLowerCase().trim();
    const roleId = rolesByCode.get(row.roleCode);
    if (!roleId) throw new Error(`Mongo seed: unknown role "${row.roleCode}" for ${email}`);

    const hash = row.passwordPlain ? bcrypt.hashSync(String(row.passwordPlain), 10) : defaultHash;

    const base = {
      name: row.name,
      phone: row.phone || '',
      department: row.department,
      roles: [roleId],
      is_active: row.is_active !== false,
    };

    const existing = await User.findOne({ email });
    if (!existing) {
      await User.create({ email, password: hash, ...base });
      created.push(email);
    } else {
      await User.updateOne({ _id: existing._id }, { $set: { ...base, email } });
      updated.push(email);
    }
  }

  const dbName = mongoose.connection.db?.databaseName;
  return { synced: true, database: dbName, usersCreated: created, usersUpdated: updated };
}

const DEFAULT_SUPER_ADMIN = {
  name: 'Super Admin',
  email: 'superadmin@medica.example',
  phone: '+91000000000',
  department: 'super_admin',
  roleCode: 'super_admin',
};

/**
 * Upsert permissions, roles, and a single super_admin user into MongoDB.
 *
 * @param {string} plainPassword bcrypt source for the super admin account
 * @param {{ name?: string, email?: string, phone?: string }} overrides optional user fields
 */
async function syncSuperAdminUserToMongo(plainPassword, overrides = {}) {
  if (!MONGODB_URI || String(MONGODB_URI).trim() === '') {
    return {
      synced: false,
      reason:
        'Set MONGO_URI or MONGODB_URI in .env to write to MongoDB. In-memory seed does not touch Atlas.',
    };
  }

  if (mongoose.connection.readyState !== 1) await db.connect();

  await syncRolesAndPermissionsToMongo();

  const { User, Role } = getMongoModels();
  const rolesByCode = await roleIdsByCodeMap(Role);

  const row = { ...DEFAULT_SUPER_ADMIN, ...overrides };
  const email = String(row.email).toLowerCase().trim();
  const roleId = rolesByCode.get(row.roleCode);
  if (!roleId) throw new Error(`Mongo seed: unknown role "${row.roleCode}" for ${email}`);

  const hash = bcrypt.hashSync(String(plainPassword || 'ChangeMe123!'), 10);
  const base = {
    name: row.name,
    phone: row.phone || '',
    department: row.department,
    roles: [roleId],
    is_active: true,
  };

  const existing = await User.findOne({ email });
  if (!existing) {
    await User.create({ email, password: hash, ...base });
    return {
      synced: true,
      database: mongoose.connection.db?.databaseName,
      email,
      action: 'created',
    };
  }

  await User.updateOne({ _id: existing._id }, { $set: { ...base, email, password: hash } });
  return {
    synced: true,
    database: mongoose.connection.db?.databaseName,
    email,
    action: 'updated',
  };
}

module.exports = {
  ROLE_SEED_DEFS,
  PERMISSION_DEFS,
  syncRolesAndPermissionsToMongo,
  syncExampleUsersToMongo,
  syncSuperAdminUserToMongo,
};
