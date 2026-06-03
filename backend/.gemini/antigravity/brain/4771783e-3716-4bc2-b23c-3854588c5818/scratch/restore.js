const fs = require('fs');
const path = require('path');

const logPath = 'C:\\Users\\Dell\\.gemini\\antigravity\\brain\\4771783e-3716-4bc2-b23c-3854588c5818\\.system_generated\\logs\\transcript.jsonl';

if (!fs.existsSync(logPath)) {
  console.error('Log path does not exist:', logPath);
  process.exit(1);
}

const lines = fs.readFileSync(logPath, 'utf8').split('\n');
console.log(`Read ${lines.length} lines from log.`);

// We want to track the FIRST read content of each modified file
const originalContents = {};

for (const line of lines) {
  if (!line.trim()) continue;
  try {
    const step = JSON.parse(line);
    
    // We are looking for tool calls to view_file or tool outputs of view_file
    if (step.tool_calls) {
      for (const call of step.tool_calls) {
        if (call.name === 'view_file' || (call.function && call.function.name === 'view_file')) {
          // Check if we have the file path
          const args = call.args || (call.function && JSON.parse(call.function.arguments));
          if (args && args.AbsolutePath) {
            const filePath = path.normalize(args.AbsolutePath).toLowerCase();
            // We want to find the output for this tool call.
            // In transcript.jsonl, the output of a tool call is typically in the same or next step.
            // Let's look for step results or step content that contains the file output.
          }
        }
      }
    }

    // Alternatively, let's scan for any step output that contains "File Path: `file:///..." or line numbers
    if (step.content && typeof step.content === 'string') {
      const filePathMatch = step.content.match(/File Path: `file:\/\/\/(.*?)`/i);
      if (filePathMatch) {
        const filePath = path.normalize(filePathMatch[1]).toLowerCase();
        
        // Extract the lines
        // The output shows:
        // Showing lines X to Y
        // 1: first line
        // 2: second line
        const contentLines = step.content.split('\n');
        const codeLines = [];
        let startExtracting = false;
        
        for (const cl of contentLines) {
          if (cl.startsWith('Showing lines')) {
            startExtracting = true;
            continue;
          }
          if (startExtracting) {
            const match = cl.match(/^\d+:\s?(.*)/);
            if (match) {
              codeLines.push(match[1]);
            } else if (cl.trim() === 'The above content shows the entire, complete file contents of the requested file.' || cl.startsWith('The above content does NOT show')) {
              break;
            }
          }
        }
        
        if (codeLines.length > 0 && !originalContents[filePath]) {
          originalContents[filePath] = codeLines.join('\n');
          console.log('Found original content for:', filePath, `(${codeLines.length} lines)`);
        }
      }
    }
  } catch (err) {
    // Ignore JSON parse errors for incomplete lines
  }
}

console.log('\n--- Restore Plan ---');
const filesToRestore = [
  'c:\\users\\dell\\desktop\\medica\\backend\\src\\data\\mongoregistry.js',
  'c:\\users\\dell\\desktop\\medica\\backend\\src\\config\\env.js',
  'c:\\users\\dell\\desktop\\medica\\backend\\.env',
  'c:\\users\\dell\\desktop\\medica\\backend\\.env.example',
  'c:\\users\\dell\\desktop\\medica\\backend\\src\\middlewares\\auth.middleware.js',
  'c:\\users\\dell\\desktop\\medica\\backend\\src\\data\\seedmongo.js',
  'c:\\users\\dell\\desktop\\medica\\backend\\src\\modules\\auth\\mongouserbridge.js',
  'c:\\users\\dell\\desktop\\medica\\backend\\src\\modules\\auth\\auth.service.js',
  'c:\\users\\dell\\desktop\\medica\\backend\\src\\modules\\auth\\auth.controller.js',
  'c:\\users\\dell\\desktop\\medica\\backend\\src\\modules\\auth\\auth.routes.js',
  'c:\\users\\dell\\desktop\\medica\\backend\\src\\modules\\attachments\\attachment.service.js',
  'c:\\users\\dell\\desktop\\medica\\backend\\src\\app.js'
];

for (const f of filesToRestore) {
  const normF = path.normalize(f).toLowerCase();
  if (originalContents[normF]) {
    console.log(`[RESTORE] ${f} - found in logs.`);
    fs.writeFileSync(f, originalContents[normF], 'utf8');
  } else {
    console.warn(`[WARNING] ${f} - NOT found in logs!`);
  }
}

// Newly created files to delete
const filesToDelete = [
  'c:\\users\\dell\\desktop\\medica\\backend\\src\\models\\tenant.js',
  'c:\\users\\dell\\desktop\\medica\\backend\\src\\models\\apikey.js',
  'c:\\users\\dell\\desktop\\medica\\backend\\src\\models\\file.js',
  'c:\\users\\dell\\desktop\\medica\\backend\\src\\modules\\files\\file.validation.js',
  'c:\\users\\dell\\desktop\\medica\\backend\\src\\modules\\files\\file.service.js',
  'c:\\users\\dell\\desktop\\medica\\backend\\src\\modules\\files\\file.controller.js',
  'c:\\users\\dell\\desktop\\medica\\backend\\src\\modules\\files\\file.routes.js',
  'c:\\users\\dell\\desktop\\medica\\backend\\scripts\\test-filemanagement.js'
];

console.log('\n--- Cleanup Plan ---');
for (const f of filesToDelete) {
  if (fs.existsSync(f)) {
    console.log(`[DELETE] ${f}`);
    fs.unlinkSync(f);
  }
}

// Clean files dir if empty
const filesDir = 'c:\\users\\dell\\desktop\\medica\\backend\\src\\modules\\files';
if (fs.existsSync(filesDir) && fs.readdirSync(filesDir).length === 0) {
  console.log(`[RMDIR] ${filesDir}`);
  fs.rmdirSync(filesDir);
}
console.log('\nRecovery execution complete.');
