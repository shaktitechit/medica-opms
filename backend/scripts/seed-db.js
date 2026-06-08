#!/usr/bin/env node
/**
 * Drops all collections data and initializes database with seed data.
 * Usage:
 *   npm run seed
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const db = require('../src/config/db');
const { getModels } = require('../src/data/mongoRegistry');
const { bootstrap } = require('../src/data/seedMongo');

async function main() {
  try {
    await db.connect();
    console.log('[seed] Connected to MongoDB. Clearing existing collections...');

    const models = getModels();
    for (const name of Object.keys(models)) {
      const model = models[name];
      if (model && typeof model.deleteMany === 'function') {
        await model.deleteMany({});
        console.log(`[seed] Cleared collection for model: ${name}`);
      }
    }

    console.log('[seed] All collections cleared. Running bootstrap seeding...');
    
    // bootstrap() will run syncExampleUsersToMongo() for permissions/roles/users, 
    // and then seed the default catalog (Apollo Pharmacy, gloves, vehicle, driver)
    const result = await bootstrap();

    console.log('[seed] Database seeded successfully.', result.catalog);
  } catch (err) {
    console.error('[seed] Seeding failed:', err);
    process.exitCode = 1;
  } finally {
    await db.disconnect().catch(() => {});
  }
}

main();
