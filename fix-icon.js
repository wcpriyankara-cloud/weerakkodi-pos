const fs = require('fs');
const f = 'package.json';
let pkg = JSON.parse(fs.readFileSync(f, 'utf8'));

if (pkg.build) {
  // Remove icon requirement
  if (pkg.build.win) {
    delete pkg.build.win.icon;
    console.log('Removed win.icon');
  }
  if (pkg.build.icon) {
    delete pkg.build.icon;
    console.log('Removed build.icon');
  }
  // Add basic metadata to avoid warnings
  if (!pkg.description) pkg.description = 'Weerakkodi POS System';
  if (!pkg.author) pkg.author = 'Weerakkodi';
  
  fs.writeFileSync(f, JSON.stringify(pkg, null, 2), 'utf8');
  console.log('OK - package.json fixed!');
} else {
  console.log('No build config found');
}