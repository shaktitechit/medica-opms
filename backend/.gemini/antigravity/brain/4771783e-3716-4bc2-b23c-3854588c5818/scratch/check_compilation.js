const { execSync } = require('child_process');

const files = [
  'src/data/mongoRegistry.js',
  'src/config/env.js',
  'src/middlewares/auth.middleware.js',
  'src/data/seedMongo.js',
  'src/modules/auth/mongoUserBridge.js',
  'src/modules/auth/auth.service.js',
  'src/modules/auth/auth.controller.js',
  'src/modules/auth/auth.routes.js',
  'src/modules/attachments/attachment.service.js',
  'src/app.js'
];

console.log('Checking compilation for all restored files...');

for (const f of files) {
  try {
    execSync(`node -c ${f}`, { stdio: 'ignore' });
    console.log(`[OK] ${f}`);
  } catch (err) {
    console.error(`[ERROR] ${f} failed to compile:`, err.message);
  }
}
