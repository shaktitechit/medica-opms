const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\Dell\\Desktop\\medica\\backend\\src\\data\\mongoRegistry.js', 'utf8');
const lines = content.split('\n');
let start = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('permissionSchema')) {
    start = i;
    break;
  }
}
if (start !== -1) {
  console.log(lines.slice(start, start + 30).join('\n'));
} else {
  console.log('Not found');
}
