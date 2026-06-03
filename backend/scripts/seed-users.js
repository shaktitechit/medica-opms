#!/usr/bin/env node
/**
 * Upserts permissions, roles, and example users in MongoDB.
 *
 * Usage:
 *   npm run seed:users
 *   npm run seed:users -- --core-only
 *   npm run seed:users -- --extras-only
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { syncExampleUsersToMongo } = require('../src/data/mongoSyncUsers');
const db = require('../src/config/db');

const args = process.argv.slice(2);
const coreOnly = args.includes('--core-only');
const extrasOnly = args.includes('--extras-only');

const plain = process.env.SEED_PASSWORD || 'ChangeMe123!';

if (extrasOnly && coreOnly) {
  console.error('Use either --extras-only or --core-only, not both.');
  process.exit(1);
}

const opts = extrasOnly ? { includeExtras: true, onlyExtras: true } : { includeExtras: !coreOnly };

async function main() {
  try {
    await db.connect();
    const mongoSummary = await syncExampleUsersToMongo(plain, opts);
    console.log(
      JSON.stringify(
        {
          mongo: mongoSummary,
          compassHints: {
            database: mongoSummary?.database || '(from your connection URI path)',
            collections: ['permissions', 'roles', 'users'],
          },
        },
        null,
        2
      )
    );
    if (mongoSummary?.error) process.exitCode = 1;
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await db.disconnect().catch(() => {});
  }
}

main();
