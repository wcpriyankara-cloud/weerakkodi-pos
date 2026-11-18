const fs = require('fs');
const f = 'next.config.js';
let c = fs.readFileSync(f, 'utf8');

console.log('=== BEFORE ===');
console.log(c.substring(0, 500));

// Uncomment output: 'export'
c = c.replace(/\/\/\s*output:\s*['"]export['"]/, "output: 'export'");

// Uncomment trailingSlash: true
c = c.replace(/\/\/\s*trailingSlash:\s*true/, "trailingSlash: true");

// Also handle /* */ style comments
c = c.replace(/\/\*\s*output:\s*['"]export['"]\s*\*\//, "output: 'export'");
c = c.replace(/\/\*\s*trailingSlash:\s*true\s*\*\//, "trailingSlash: true");

console.log('\n=== AFTER ===');
console.log(c.substring(0, 500));

fs.writeFileSync(f, c, 'utf8');
console.log('\nOK - next.config.js updated for static export!');