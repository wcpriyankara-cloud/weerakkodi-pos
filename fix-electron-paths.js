const fs = require('fs');

// FIX 1: next.config.js - add assetPrefix
let nc = fs.readFileSync('next.config.js', 'utf8');
if (!nc.includes('assetPrefix')) {
  nc = nc.replace(
    /output:\s*['"]export['"],?/,
    "output: 'export',\n  assetPrefix: '.',\n  basePath: '',"
  );
  fs.writeFileSync('next.config.js', nc, 'utf8');
  console.log('FIX 1 OK - Added assetPrefix to next.config.js');
} else {
  console.log('FIX 1 SKIP - assetPrefix already exists');
}

// FIX 2: package.json - ensure out/ is in files
let pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (!pkg.build) pkg.build = {};
if (!pkg.build.files) {
  pkg.build.files = [
    "main.js",
    "preload.js",
    "out/**/*",
    "package.json"
  ];
  console.log('FIX 2 OK - Added files config to package.json');
} else {
  if (!pkg.build.files.includes('out/**/*')) {
    pkg.build.files.push('out/**/*');
    console.log('FIX 2 OK - Added out/**/* to files');
  } else {
    console.log('FIX 2 SKIP - out/ already in files');
  }
}
if (!pkg.build.files.includes('main.js')) pkg.build.files.push('main.js');
if (!pkg.build.files.includes('preload.js')) pkg.build.files.push('preload.js');

// Ensure main entry point
if (pkg.main !== 'main.js') {
  pkg.main = 'main.js';
  console.log('FIX 3 OK - Set main entry to main.js');
}

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2), 'utf8');
console.log('\nAll fixes applied!');