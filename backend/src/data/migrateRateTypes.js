/**
 * @fileoverview One-off database migration to convert SSR rate types to SRA.
 * @module data/migrateRateTypes
 */
require('dotenv').config();
const { connect, disconnect } = require('../config/db');
const { getModels } = require('./mongoRegistry');

async function run() {
  console.log('Connecting to database...');
  await connect();
  
  const { PartyProductRate, Order } = getModels();
  
  console.log('Updating PartyProductRate rate_types...');
  const ratesResult = await PartyProductRate.updateMany(
    { rate_type: 'SSR' },
    { $set: { rate_type: 'SRA' } }
  );
  console.log(`Updated ${ratesResult.modifiedCount} PartyProductRate documents.`);
  
  console.log('Updating Order applied_rate_types...');
  const ordersResult = await Order.updateMany(
    { 'order_items.applied_rate_type': 'SSR' },
    { $set: { 'order_items.$[elem].applied_rate_type': 'SRA' } },
    { arrayFilters: [{ 'elem.applied_rate_type': 'SSR' }] }
  );
  console.log(`Updated ${ordersResult.modifiedCount} Order documents.`);
  
  console.log('Migration finished successfully!');
  await disconnect();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
