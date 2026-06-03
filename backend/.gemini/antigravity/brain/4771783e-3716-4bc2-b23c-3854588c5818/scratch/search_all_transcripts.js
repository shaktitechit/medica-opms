const fs = require('fs');
const path = require('path');

const brainPath = 'C:\\Users\\Dell\\.gemini\\antigravity\\brain';
const dirs = fs.readdirSync(brainPath);

console.log('Scanning all conversation directories for views of mongoregistry.js...');

for (const dir of dirs) {
  const logPath = path.join(brainPath, dir, '.system_generated', 'logs', 'transcript.jsonl');
  if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      try {
        const step = JSON.parse(lines[i]);
        if (step.content && typeof step.content === 'string' && step.content.toLowerCase().includes('mongoregistry.js')) {
          if (step.content.includes('Showing lines 1 to')) {
            const match = step.content.match(/Showing lines 1 to (\d+)/);
            const lineCount = match ? match[1] : 'unknown';
            console.log(`FOUND in folder [${dir}], step ${i}: type=${step.type}, showing lines 1 to ${lineCount}, content length=${step.content.length}`);
          }
        }
      } catch (err) {}
    }
  }
}
