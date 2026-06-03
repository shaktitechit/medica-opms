const fs = require('fs');
const registryPath = 'C:\\Users\\Dell\\Desktop\\medica\\backend\\src\\data\\mongoRegistry.js';
const content = fs.readFileSync(registryPath, 'utf8');

// Normalize line endings to do processing
const lines = content.split(/\r?\n/);
let startLineIdx = -1;
let endLineIdx = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const permissionSchema = new mongoose.Schema')) {
    startLineIdx = i;
  }
  if (startLineIdx !== -1 && lines[i].includes('module: {')) {
    // Find the end of this module block, which is the line with '},'
    for (let j = i; j < lines.length; j++) {
      if (lines[j].includes('},')) {
        endLineIdx = j;
        break;
      }
    }
    if (endLineIdx !== -1) {
      // Replace lines from i to endLineIdx with our new line
      const indent = lines[i].match(/^\s*/)[0];
      lines.splice(i, endLineIdx - i + 1, `${indent}module: { type: String, required: true, enum: MODULE_ENUM },`);
      break;
    }
  }
}

if (startLineIdx !== -1 && endLineIdx !== -1) {
  fs.writeFileSync(registryPath, lines.join('\n'), 'utf8');
  console.log('Successfully replaced permission schema lines!');
} else {
  console.log('Could not find start/end lines');
}
