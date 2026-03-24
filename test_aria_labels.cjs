const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walk(dirPath, callback) : callback(dirPath);
  });
}

walk('./public/components', function(filePath) {
  if (!filePath.endsWith('.jsx')) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const buttonRegex = /<button[^>]*>([\s\S]*?)<\/button>/g;
  let match;
  while ((match = buttonRegex.exec(content)) !== null) {
    const btnTag = match[0].split('>')[0] + '>';
    const btnContent = match[1].trim();

    if (!btnTag.includes('aria-label')) {
      console.log(`Missing aria-label in ${filePath}:`);
      console.log(match[0]);
      console.log('---');
    }
  }
});
