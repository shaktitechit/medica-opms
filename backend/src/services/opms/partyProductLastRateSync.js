/**
 * @fileoverview After an order is saved, refresh last-rate cache per party+product (OPMS order entry).
 * @module services/opms/partyProductLastRateSync
 */

/**
 * @param {() => import('../../data/mongoRegistry').getModels()} getModels
 * @param {Record<string, unknown>} orderPlain
 */
async function syncPartyProductLastRatesFromOrder(getModels, orderPlain) {
  const { PartyProductLastRate } = getModels();
  if (!PartyProductLastRate || !orderPlain?.party) return;

  const partyId = orderPlain.party;
  const orderDate = orderPlain.order_date ? new Date(orderPlain.order_date) : new Date();

  for (const line of orderPlain.order_items || []) {
    const productId = line.product;
    if (!productId) continue;
    await PartyProductLastRate.findOneAndUpdate(
      { party: partyId, product: productId },
      {
        $set: {
          last_rate: Number(line.unit_price),
          last_discount_percent: Number(line.discount_percent || 0),
          last_batch: line.batch || null,
          last_order_date: orderDate,
        },
      },
      { upsert: true }
    );
  }
}

module.exports = { syncPartyProductLastRatesFromOrder };
