const fs = require('fs');
const logPath = 'C:\\Users\\Dell\\.gemini\\antigravity\\brain\\4771783e-3716-4bc2-b23c-3854588c5818\\.system_generated\\logs\\transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');
console.log('Total lines:', lines.length);
for (let i = 0; i < Math.min(15, lines.length); i++) {
  if (!lines[i].trim()) continue;
  const step = JSON.parse(lines[i]);
  console.log(`Line ${i}: source=${step.source}, type=${step.type}, tool_calls=${step.tool_calls ? step.tool_calls.map(t => t.name).join(',') : 'none'}`);
  if (step.tool_calls) {
    console.log(JSON.stringify(step.tool_calls, null, 2));
  }
}
