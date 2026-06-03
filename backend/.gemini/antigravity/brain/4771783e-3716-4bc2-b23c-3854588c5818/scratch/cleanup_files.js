const fs = require('fs');
const path = require('path');

const pathsToDelete = [
  'C:\\Users\\Dell\\Desktop\\medica\\backend\\src\\models\\Tenant.js',
  'C:\\Users\\Dell\\Desktop\\medica\\backend\\src\\models\\ApiKey.js',
  'C:\\Users\\Dell\\Desktop\\medica\\backend\\src\\models\\File.js',
  'C:\\Users\\Dell\\Desktop\\medica\\backend\\src\\modules\\files\\file.validation.js',
  'C:\\Users\\Dell\\Desktop\\medica\\backend\\src\\modules\\files\\file.service.js',
  'C:\\Users\\Dell\\Desktop\\medica\\backend\\src\\modules\\files\\file.controller.js',
  'C:\\Users\\Dell\\Desktop\\medica\\backend\\src\\modules\\files\\file.routes.js',
  'C:\\Users\\Dell\\Desktop\\medica\\backend\\scripts\\test-filemanagement.js'
];

for (const p of pathsToDelete) {
  if (fs.existsSync(p)) {
    console.log(`Deleting file: ${p}`);
    fs.unlinkSync(p);
  }
}

const filesDir = 'C:\\Users\\Dell\\Desktop\\medica\\backend\\src\\modules\\files';
if (fs.existsSync(filesDir)) {
  console.log(`Deleting directory: ${filesDir}`);
  try {
    fs.rmdirSync(filesDir);
  } catch (err) {
    console.error(`Could not delete dir ${filesDir}:`, err.message);
  }
}

const uploadsDir = 'C:\\Users\\Dell\\Desktop\\medica\\backend\\uploads';
if (fs.existsSync(uploadsDir)) {
  console.log(`Deleting uploads directory: ${uploadsDir}`);
  try {
    const files = fs.readdirSync(uploadsDir);
    for (const f of files) {
      fs.unlinkSync(path.join(uploadsDir, f));
    }
    fs.rmdirSync(uploadsDir);
  } catch (err) {
    console.error(`Could not delete uploads dir:`, err.message);
  }
}

console.log('Cleanup finished!');
