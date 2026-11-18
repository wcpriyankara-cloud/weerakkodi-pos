const fs = require('fs');
const f = 'next.config.js';
let c = fs.readFileSync(f, 'utf8');

// Replace static output: 'export' with conditional
c = c.replace(
  /output:\s*['"]export['"],?/g,
  "// output: 'export' is set via CLI for production builds only"
);

// Also remove trailingSlash for dev
c = c.replace(
  /trailingSlash:\s*true,?/g,
  "trailingSlash: process.env.NODE_ENV === 'production',"
);

fs.writeFileSync(f, c, 'utf8');
console.log('OK - output:export removed from config (use CLI for prod)');
console.log('\nCurrent config:');
console.log(c.substring(0, 500));