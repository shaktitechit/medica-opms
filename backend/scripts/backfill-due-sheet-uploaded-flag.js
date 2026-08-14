/**
 * Set OrderApproval.is_due_sheet_uploaded = true for orders that already
 * have a current/active OrderDueSheet.
 *
 * Usage (from repo root or backend/):
 *   node backend/scripts/backfill-due-sheet-uploaded-flag.js
 *   node scripts/backfill-due-sheet-uploaded-flag.js
 *
 * Dry run:
 *   DRY_RUN=1 node backend/scripts/backfill-due-sheet-uploaded-flag.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { connect } = require('../src/config/db');
const { getModels } = require('../src/data/mongoRegistry');

const dryRun = String(process.env.DRY_RUN || '') === '1';

connect()
  .then(async () => {
    const { OrderDueSheet, OrderApproval } = getModels();

    const dueSheetOrderIds = await OrderDueSheet.distinct('order', {
      is_current: true,
      status: 'active',
      deletedAt: null,
    });

    console.log(`Orders with current/active due sheet: ${dueSheetOrderIds.length}`);

    const match = {
      order: { $in: dueSheetOrderIds },
      deletedAt: null,
      $or: [
        { is_due_sheet_uploaded: { $ne: true } },
        { is_due_sheet_uploaded: { $exists: false } },
      ],
    };

    const toUpdate = await OrderApproval.countDocuments(match);
    console.log(`OrderApprovals needing is_due_sheet_uploaded=true: ${toUpdate}`);

    if (dryRun) {
      console.log('DRY_RUN=1 — no writes performed.');
      process.exit(0);
    }

    if (toUpdate === 0) {
      console.log('Nothing to update.');
      process.exit(0);
    }

    const result = await OrderApproval.updateMany(match, {
      $set: { is_due_sheet_uploaded: true },
    });

    console.log({
      matched: result.matchedCount ?? result.n,
      modified: result.modifiedCount ?? result.nModified,
    });

    const stillMissing = await OrderApproval.countDocuments(match);
    const flagged = await OrderApproval.countDocuments({
      order: { $in: dueSheetOrderIds },
      deletedAt: null,
      is_due_sheet_uploaded: true,
    });

    console.log(`After backfill — flagged true: ${flagged}, still missing: ${stillMissing}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
