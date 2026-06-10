#!/usr/bin/env node
/**
 * Upserts the permission catalog and system roles in MongoDB.
 * Does not create or modify users unless --fix-user-roles is passed.
 *
 * Usage:
 *   npm run seed:roles
 *   npm run seed:roles -- --fix-user-roles
 *
 * Requires MONGODB_URI (or MONGO_URI) in backend/.env
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const db = require('../src/config/db');
const { syncRolesAndPermissionsToMongo } = require('../src/data/mongoSyncUsers');

const args = process.argv.slice(2);
const fixEmptyUserRoles = args.includes('--fix-user-roles');

if (args.some((a) => a.startsWith('--') && a !== '--fix-user-roles')) {
  console.error('Unknown option. Supported: --fix-user-roles');
  process.exit(1);
}

async function main() {
  try {
    await db.connect();
    const result = await syncRolesAndPermissionsToMongo({ fixEmptyUserRoles });

    console.log(
      JSON.stringify(
        {
          mongo: result,
          hint: fixEmptyUserRoles
            ? 'Users with empty roles[] were assigned the role matching their department.'
            : 'Re-run with --fix-user-roles to assign default roles to users missing roles.',
        },
        null,
        2
      )
    );

    if (!result.synced) process.exitCode = 1;
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await db.disconnect().catch(() => {});
  }
}

main();
