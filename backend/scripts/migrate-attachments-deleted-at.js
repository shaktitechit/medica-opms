#!/usr/bin/env node
/**
 * One-time: migrate legacy Attachment.is_deleted → deletedAt, drop is_deleted field.
 *
 *   npm run migrate:attachments-deleted-at
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const db = require('../src/config/db');
const { getModels } = require('../src/data/mongoRegistry');

async function main() {
  await db.connect();
  const Attachment = getModels().Attachment;
  const col = Attachment.collection;

  const flagged = await col.updateMany(
    { is_deleted: true },
    { $set: { deletedAt: new Date() }, $unset: { is_deleted: '' } }
  );
  const cleared = await col.updateMany(
    { is_deleted: false },
    { $unset: { is_deleted: '' } }
  );

  console.log(
    JSON.stringify(
      {
        matchedDeletedLegacy: flagged.matchedCount,
        modifiedDeletedLegacy: flagged.modifiedCount,
        matchedClearedFalse: cleared.matchedCount,
        modifiedClearedFalse: cleared.modifiedCount,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.disconnect().catch(() => {});
  });
