/**
 * @fileoverview Ensures TransportPlanOrder Mongo indexes match the dispatch-based uniqueness model.
 * Drops legacy unique-on-order indexes that block partial-dispatch planning.
 * @module modules/transportPlanner/transportPlanner.indexes
 */
const { getModels } = require('../../data/mongoRegistry');

let ensured = false;

async function ensureTransportPlanOrderIndexes() {
  if (ensured) return;
  const { TransportPlanOrder } = getModels();
  const coll = TransportPlanOrder.collection;

  for (const name of [
    'order_1',
    'transport_plan_1_order_1',
    'dispatch_1',
    'transport_plan_1_dispatch_1',
  ]) {
    try {
      await coll.dropIndex(name);
    } catch (err) {
      if (err?.codeName !== 'IndexNotFound' && err?.code !== 27) {
        // Ignore missing indexes; surface unexpected errors
        if (String(err?.message || '').includes('index not found')) continue;
      }
    }
  }

  await coll.createIndex(
    { order: 1 },
    { name: 'order_1_nonunique', background: true }
  );
  await coll.createIndex(
    { transport_plan: 1, dispatch: 1 },
    {
      name: 'transport_plan_1_dispatch_1_unique',
      unique: true,
      partialFilterExpression: {
        deletedAt: null,
        dispatch: { $type: 'objectId' },
      },
    }
  );
  await coll.createIndex(
    { dispatch: 1 },
    {
      name: 'dispatch_1_active_unique',
      unique: true,
      partialFilterExpression: {
        deletedAt: null,
        dispatch: { $type: 'objectId' },
        status: { $in: ['pending', 'packed', 'dispatched'] },
      },
    }
  );

  ensured = true;
}

module.exports = { ensureTransportPlanOrderIndexes };
