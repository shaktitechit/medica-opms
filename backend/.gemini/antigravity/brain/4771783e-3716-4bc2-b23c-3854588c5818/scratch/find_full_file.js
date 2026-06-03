const fs = require('fs');
const path = require('path');

const logPath = 'C:\\Users\\Dell\\.gemini\\antigravity\\brain\\4771783e-3716-4bc2-b23c-3854588c5818\\.system_generated\\logs\\transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

console.log('Searching for all occurrences of mongoregistry.js in transcript.jsonl...');

for (let idx = 0; idx < lines.length; idx++) {
  const line = lines[idx];
  if (!line.trim()) continue;
  try {
    const step = JSON.parse(line);
    if (step.content && typeof step.content === 'string' && step.content.includes('mongoregistry.js')) {
      console.log(`[Step ${idx}] contains mongoregistry.js. Length: ${step.content.length}`);
      if (step.content.includes('Showing lines')) {
        const linesMatch = step.content.match(/Showing lines (\d+) to (\d+)/);
        console.log(`  -> Shows lines ${linesMatch ? linesMatch[1] + ' to ' + linesMatch[2] : 'unknown'}`);
      }
    }
  } catch (err) {}
}
