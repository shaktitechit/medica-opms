/**
 * @fileoverview Suggest batches for allocation: nearest expiry first, then FIFO by inward date.
 * @module services/opms/batchAllocation
 */

/**
 * @param {import('mongoose').Model} Batch
 * @param {string|import('mongoose').Types.ObjectId} productId
 * @param {{ warehouseId?: string|import('mongoose').Types.ObjectId }} [opts]
 */
async function suggestBatchesForProduct(Batch, productId, opts = {}) {
  const q = {
    product: productId,
    status: 'active',
    deletedAt: null,
    available_qty: { $gt: 0 },
  };
  if (opts.warehouseId) q.warehouse = opts.warehouseId;
  return Batch.find(q)
    .sort({ expiry_date: 1, inward_date: 1, createdAt: 1 })
    .limit(25)
    .lean();
}

module.exports = { suggestBatchesForProduct };
