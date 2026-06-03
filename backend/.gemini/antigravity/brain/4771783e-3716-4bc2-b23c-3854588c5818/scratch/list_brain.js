const fs = require('fs');
const path = require('path');

const brainPath = 'C:\\Users\\Dell\\.gemini\\antigravity\\brain';
if (fs.existsSync(brainPath)) {
  const dirs = fs.readdirSync(brainPath);
  console.log('Folders under brain:');
  for (const d of dirs) {
    const stats = fs.statSync(path.join(brainPath, d));
    if (stats.isDirectory()) {
      console.log(` - ${d} (created: ${stats.birthtime})`);
    }
  }
} else {
  console.log('brain path does not exist');
}
