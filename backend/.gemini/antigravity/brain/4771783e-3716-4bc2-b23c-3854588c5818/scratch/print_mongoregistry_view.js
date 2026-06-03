const fs = require('fs');
const logPath = 'C:\\Users\\Dell\\.gemini\\antigravity\\brain\\4771783e-3716-4bc2-b23c-3854588c5818\\.system_generated\\logs\\transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');
for (const line of lines) {
  if (!line.trim()) continue;
  const step = JSON.parse(line);
  if (step.type === 'VIEW_FILE' && step.content.includes('mongoRegistry.js') && step.content.includes('Total Lines: 683')) {
    console.log(step.content);
    break;
  }
}
