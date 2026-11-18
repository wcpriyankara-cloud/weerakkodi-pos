const fs = require('fs');
const f = 'next.config.js';
let c = fs.readFileSync(f, 'utf8');

// Find the problematic area and fix missing comma
// Pattern: closing brace of previous object + assetPrefix without comma
c = c.replace(/(\})\s*\n\s*(assetPrefix:)/g, '$1,\n  $2');

// Also ensure there's no double comma
c = c.replace(/,\s*,/g, ',');

fs.writeFileSync(f, c, 'utf8');
console.log('OK - Fixed syntax');

// Verify
try {
  require('./next.config.js');
  console.log('Config loads OK!');
} catch(e) {
  console.log('Still broken:', e.message);
}