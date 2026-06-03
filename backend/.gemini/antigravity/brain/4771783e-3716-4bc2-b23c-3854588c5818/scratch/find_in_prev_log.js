const fs = require('fs');
const path = require('path');

const logPath = 'C:\\Users\\Dell\\.gemini\\antigravity\\brain\\b077044f-e418-471b-b1d2-a9980f12971e\\.system_generated\\logs\\transcript.jsonl';
if (!fs.existsSync(logPath)) {
  console.log('Log does not exist:', logPath);
  process.exit(1);
}

const lines = fs.readFileSync(logPath, 'utf8').split('\n');
console.log('Total lines in previous log:', lines.length);

for (let i = 0; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  try {
    const step = JSON.parse(lines[i]);
    if (step.content && typeof step.content === 'string' && step.content.toLowerCase().includes('mongoregistry.js')) {
      console.log(`Step ${i}: type=${step.type}, source=${step.source}, content length=${step.content.length}`);
      if (step.content.includes('Showing lines')) {
        const linesMatch = step.content.match(/Showing lines (\d+) to (\d+)/);
        console.log(`  -> Shows lines ${linesMatch ? linesMatch[1] + ' to ' + linesMatch[2] : 'unknown'}`);
      }
    }
  } catch (err) {}
}
