const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\Dell\\Desktop\\medica\\backend\\src\\data\\mongoRegistry.js', 'utf8');

const occurrences = [];
let idx = content.indexOf('permissionSchema');
while (idx !== -1) {
  occurrences.push(idx);
  idx = content.indexOf('permissionSchema', idx + 1);
}

console.log(`Found permissionSchema ${occurrences.length} times at indices:`, occurrences);
for (const o of occurrences) {
  console.log(`Snippet around index ${o}:`);
  console.log(content.substring(Math.max(0, o - 50), Math.min(content.length, o + 200)));
  console.log('-----------------------------------------------------\n');
}
