const fs = require('fs');

const ids = [
  'af2c9bc3-9ed1-47dd-81ed-36b10ef947d6',
  'b077044f-e418-471b-b1d2-a9980f12971e',
  'db839b92-fa6f-4f42-a2c0-01ec30798a9a',
  'e01a8355-ec7c-469d-a411-26517e23295d'
];

for (const id of ids) {
  const p = `C:\\Users\\Dell\\.gemini\\antigravity\\brain\\${id}\\.system_generated\\logs\\transcript.jsonl`;
  console.log(`${id}: exists=${fs.existsSync(p)}`);
}
