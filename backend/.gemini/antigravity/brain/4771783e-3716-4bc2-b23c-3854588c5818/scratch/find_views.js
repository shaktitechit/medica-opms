const fs = require('fs');
const logPath = 'C:\\Users\\Dell\\.gemini\\antigravity\\brain\\4771783e-3716-4bc2-b23c-3854588c5818\\.system_generated\\logs\\transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  try {
    const step = JSON.parse(lines[i]);
    if (step.content && typeof step.content === 'string' && step.content.toLowerCase().includes('mongoregistry.js')) {
      console.log(`Step ${i}: type=${step.type}, source=${step.source}, content length=${step.content.length}`);
      console.log(step.content.substring(0, 300));
      console.log('-----------------------------------------------------\n');
    }
  } catch(e) {}
}
