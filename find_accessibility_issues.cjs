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

  // Find icon only buttons: <button> emoji/icon </button>
  const buttonRegex = /<button[^>]*>([\s\S]*?)<\/button>/g;
  let match;
  while ((match = buttonRegex.exec(content)) !== null) {
    const btnTag = match[0].split('>')[0] + '>';
    const btnContent = match[1].trim();

    // Naive icon check: no alphabet chars and no nested tags with text
    const textContent = btnContent.replace(/<[^>]+>/g, '').trim();
    const hasAriaLabel = btnTag.includes('aria-label');

    if (!hasAriaLabel && textContent.length > 0 && !/[a-zA-Z]/.test(textContent)) {
      console.log(`Potential icon-only button without aria-label in ${filePath}:`);
      console.log(match[0]);
      console.log('---');
    }
  }

  // Find inputs without associated labels or aria-labels
  const inputRegex = /<input[^>]*>/g;
  while ((match = inputRegex.exec(content)) !== null) {
      const inputTag = match[0];
      if (inputTag.includes('type="hidden"')) continue;

      const hasId = inputTag.includes('id=');
      const hasAriaLabel = inputTag.includes('aria-label') || inputTag.includes('aria-labelledby');

      if (!hasAriaLabel && !hasId) {
          // If no aria-label and no id (meaning it can't have an external label with htmlFor), it's probably inaccessible
          // (Unless it's wrapped in a <label>, which is harder to detect with regex, but we can flag it)
          console.log(`Input might be missing label/aria-label in ${filePath}:`);
          console.log(match[0]);
          console.log('---');
      }
  }
});
