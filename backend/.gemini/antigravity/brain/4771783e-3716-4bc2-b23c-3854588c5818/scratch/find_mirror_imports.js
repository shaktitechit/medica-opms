const fs = require('fs');
const path = require('path');

function search(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    let stats;
    try {
      stats = fs.statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      if (f !== 'node_modules' && f !== '.git' && f !== '.gemini') {
        search(full);
      }
    } else {
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes('models/') && !full.includes('models\\') && !full.includes('scratch\\')) {
        console.log(`Found reference in ${full}`);
      }
    }
  }
}

search('C:\\Users\\Dell\\Desktop\\medica\\backend\\src');
