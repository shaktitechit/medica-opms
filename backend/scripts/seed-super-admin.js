#!/usr/bin/env node
/**
 * Upserts permissions, roles, and one super_admin user in MongoDB.
 *
 * Usage:
 *   npm run seed:super-admin
 *
 * Optional env (.env):
 *   SUPER_ADMIN_EMAIL=you@example.com
 *   SUPER_ADMIN_NAME=Your Name
 *   SUPER_ADMIN_PHONE=+91000000000
 *   SUPER_ADMIN_PASSWORD=secret   (falls back to SEED_PASSWORD, then ChangeMe123!)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { syncSuperAdminUserToMongo } = require('../src/data/mongoSyncUsers');
const db = require('../src/config/db');

const plain =
  process.env.SUPER_ADMIN_PASSWORD ||
  process.env.SEED_PASSWORD ||
  'ChangeMe123!';

const overrides = {};
if (process.env.SUPER_ADMIN_NAME) overrides.name = process.env.SUPER_ADMIN_NAME;
if (process.env.SUPER_ADMIN_EMAIL) overrides.email = process.env.SUPER_ADMIN_EMAIL;
if (process.env.SUPER_ADMIN_PHONE) overrides.phone = process.env.SUPER_ADMIN_PHONE;

async function main() {
  try {
    await db.connect();
    const result = await syncSuperAdminUserToMongo(plain, overrides);
    console.log(JSON.stringify({ mongo: result }, null, 2));
    if (!result.synced) process.exitCode = 1;
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await db.disconnect().catch(() => {});
  }
}

main();
