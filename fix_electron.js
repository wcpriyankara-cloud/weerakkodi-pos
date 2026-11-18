// fix_electron.js
const fs = require('fs');
const path = require('path');

console.log('⚡ Repairing Electron configuration and package.json...');

// 1. Update package.json to ensure correct main path and electron start script
const pkgPath = path.join(__dirname, 'package.json');
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  // Ensure "main" points to main/main.js
  pkg.main = 'main/main.js';

  // Ensure "scripts" has electron runner
  pkg.scripts = pkg.scripts || {};
  pkg.scripts.electron = 'electron .';
  pkg.scripts.app = 'electron .';

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
  console.log('✅ package.json main entry set to: main/main.js');
}

// 2. Remove corrupted electron folder in node_modules if it exists
const electronDistPath = path.join(__dirname, 'node_modules', 'electron');
if (fs.existsSync(electronDistPath)) {
  try {
    fs.rmSync(electronDistPath, { recursive: true, force: true });
    console.log('✅ Removed corrupted electron binaries from node_modules.');
  } catch (e) {
    console.warn('Note: Could not delete node_modules/electron directly, npm will overwrite it.');
  }
}

console.log('🎉 Setup ready for fresh Electron installation!');