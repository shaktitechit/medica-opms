const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\Dell\\Desktop\\medica\\backend\\src\\data\\mongoRegistry.js', 'utf8');

const startIdx = content.indexOf('const permissionSchema = new mongoose.Schema');
const roleIdx = content.indexOf('const roleSchema = new mongoose.Schema');
const mongooseRoleIdx = content.indexOf('const roleSchema = new mongoose.Schema');

console.log('startIdx:', startIdx);
console.log('roleIdx:', roleIdx);
console.log('mongooseRoleIdx:', mongooseRoleIdx);

if (startIdx !== -1) {
  const next500 = content.substring(startIdx, startIdx + 800);
  console.log('Next 800 chars:\n', next500);
}
