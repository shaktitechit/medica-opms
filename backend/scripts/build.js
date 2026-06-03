/**
 * Verifies the CommonJS application graph loads (this project does not compile TypeScript).
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const root = path.resolve(__dirname, '..');
process.chdir(root);

require(path.resolve(root, 'src/data/mongoRegistry.js')).getModels();
require(path.resolve(root, 'src/app.js'));
require(path.resolve(root, 'src/queues/index.js')).registerQueues(console);

console.log('[build] OK');
