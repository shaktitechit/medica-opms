#!/usr/bin/env node
/**
 * One-time: `department: "transport"` is no longer valid on User/Role schemas.
 * Moves users to `dispatch` and assigns the Dispatch seeded role (single role).
 *
 * Usage:
 *   npm run migrate:transport-users
 */
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const db = require('../src/config/db');
const { getModels } = require('../src/data/mongoRegistry');

async function main() {
  try {
    await db.connect();
    const { User, Role } = getModels();
    const dispatchRole = await Role.findOne({ code: 'dispatch', is_active: true }).lean();
    if (!dispatchRole) {
      console.error('[migrate] Dispatch role not found. Run `npm run seed:users` first.');
      process.exitCode = 1;
      return;
    }
    const dispatchRoleId = dispatchRole._id;

    const financeRole = await Role.findOne({ code: 'finance', is_active: true }).lean();
    if (!financeRole) {
      console.error('[migrate] Finance role not found. Run `npm run seed:users` first.');
      process.exitCode = 1;
      return;
    }

    const legacyTransportUsers = await User.countDocuments({ department: 'transport' });
    const legacyCollectionUsers = await User.countDocuments({ department: 'collection' });

    const r1 = await User.updateMany(
      { department: 'transport' },
      { $set: { department: 'dispatch', roles: [dispatchRoleId] } }
    );

    const r2 = await User.updateMany(
      { department: 'collection' },
      { $set: { department: 'finance', roles: [financeRole._id] } }
    );

    console.log('[migrate] Users with legacy department "transport":', legacyTransportUsers);
    console.log('[migrate]   updated (matched/modified):', r1.matchedCount, '/', r1.modifiedCount);

    console.log('[migrate] Users with legacy department "collection":', legacyCollectionUsers);
    console.log('[migrate]   patched to finance (matched/modified):', r2.matchedCount, '/', r2.modifiedCount);

    if (legacyTransportUsers === 0 && legacyCollectionUsers === 0) {
      console.log('[migrate] Nothing to do.');
    }

    console.log(
      '[migrate] Tip: re-run `npm run seed:users` to upsert roles/permissions without dropping data.'
    );
  } catch (err) {
    console.error('[migrate]', err.message);
    process.exitCode = 1;
  } finally {
    await db.disconnect().catch(() => {});
  }
}

main();
