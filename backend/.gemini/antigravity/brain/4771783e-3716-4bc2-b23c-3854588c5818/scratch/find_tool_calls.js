const fs = require('fs');
const path = require('path');

const logPath = 'C:\\Users\\Dell\\.gemini\\antigravity\\brain\\af2c9bc3-9ed1-47dd-81ed-36b10ef947d6\\.system_generated\\logs\\transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  try {
    const step = JSON.parse(lines[i]);
    if (step.tool_calls) {
      for (const call of step.tool_calls) {
        if (call.name && call.name.includes('replace_file_content')) {
          const args = call.args || (call.function && JSON.parse(call.function.arguments));
          if (args && args.TargetFile && args.TargetFile.toLowerCase().includes('mongoregistry.js')) {
            console.log(`Step ${i}: tool=${call.name}, args keys=${Object.keys(args)}`);
            console.log(JSON.stringify(args, null, 2));
            console.log('===============================================\n');
          }
        }
      }
    }
  } catch (err) {}
}
