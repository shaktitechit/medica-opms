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
      if (f.toLowerCase().includes('registry') || f.endsWith('.bak') || f.endsWith('.old')) {
        console.log(`Found: ${full} (${stats.size} bytes)`);
      }
    }
  }
}

search('C:\\Users\\Dell\\Desktop\\medica\\backend');
