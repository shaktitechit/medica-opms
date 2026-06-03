const fs = require('fs');
const registryPath = 'C:\\Users\\Dell\\Desktop\\medica\\backend\\src\\data\\mongoRegistry.js';
let content = fs.readFileSync(registryPath, 'utf8');

const startIdx = content.indexOf('const permissionSchema = new mongoose.Schema');
const endIdx = content.indexOf('const roleSchema = new mongoose.Schema');
if (startIdx !== -1 && endIdx !== -1) {
  let sub = content.substring(startIdx, endIdx);
  sub = sub.replace(/module:\s*\{\s*type:\s*String,\s*required:\s*true,\s*enum:\s*\[[\s\S]*?\]\s*\},?/, 'module: { type: String, required: true, enum: MODULE_ENUM },');
  content = content.substring(0, startIdx) + sub + content.substring(endIdx);
  fs.writeFileSync(registryPath, content, 'utf8');
  console.log('Successfully fixed permission schema!');
} else {
  console.log('Could not locate permissionSchema block');
}
