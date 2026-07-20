#!/usr/bin/env node
/**
 * Reset OrderDispatch rows that were created but never got a TransportShipment
 * back to `draft` (so Account can re-submit them into the transport-planner flow).
 *
 * Skips:
 *  - soft-deleted dispatches
 *  - cancelled dispatches
 *  - dispatches that already have a non-returned TransportShipment
 *
 * Usage (from backend/):
 *   npm run seed:order-dispatch-draft
 */
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const db = require('../src/config/db');
const { getModels } = require('../src/data/mongoRegistry');

async function main() {
  try {
    await db.connect();
    const { OrderDispatch, TransportShipment } = getModels();

    const shippedDispatchIds = await TransportShipment.distinct('dispatch', {
      deletedAt: null,
      shipment_status: { $ne: 'returned' },
      dispatch: { $ne: null },
    });

    const filter = {
      deletedAt: null,
      dispatch_status: { $nin: ['draft', 'cancelled'] },
      ...(shippedDispatchIds.length
        ? { _id: { $nin: shippedDispatchIds } }
        : {}),
    };

    const candidates = await OrderDispatch.find(filter)
      .select('_id dispatch_no dispatch_status order')
      .lean();

    console.log(
      '[seed:order-dispatch-draft] Dispatches without active transport (non-draft/cancelled):',
      candidates.length
    );

    if (candidates.length === 0) {
      console.log('[seed:order-dispatch-draft] Nothing to update.');
      return;
    }

    for (const row of candidates.slice(0, 20)) {
      console.log(
        `  - ${row.dispatch_no || row._id}  (${row.dispatch_status}) → draft`
      );
    }
    if (candidates.length > 20) {
      console.log(`  … and ${candidates.length - 20} more`);
    }

    const result = await OrderDispatch.updateMany(filter, {
      $set: { dispatch_status: 'draft' },
    });

    console.log(
      '[seed:order-dispatch-draft] Updated matched/modified:',
      result.matchedCount,
      '/',
      result.modifiedCount
    );
    console.log(
      '[seed:order-dispatch-draft] Done. Re-submit these batches from Account before transport planning.'
    );
  } catch (err) {
    console.error('[seed:order-dispatch-draft]', err.message);
    process.exitCode = 1;
  } finally {
    await db.disconnect().catch(() => {});
  }
}

main();
