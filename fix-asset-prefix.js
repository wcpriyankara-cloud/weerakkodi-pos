const fs = require('fs');
const f = 'next.config.js';
let c = fs.readFileSync(f, 'utf8');

// Remove static assetPrefix line
c = c.replace(/\s*assetPrefix:\s*['"]\.['"],?\s*\n/g, '\n');
c = c.replace(/\s*basePath:\s*['"]['"],?\s*\n/g, '\n');

// Add dynamic assetPrefix before the closing };
// Find the last } of nextConfig
const configEnd = c.lastIndexOf('};');
if (configEnd !== -1) {
  const dynamicPrefix = `
  // assetPrefix: '.' for Electron production, '' for dev
  assetPrefix: process.env.NODE_ENV === 'production' ? '.' : '',
`;
  c = c.substring(0, configEnd) + dynamicPrefix + c.substring(configEnd);
}

fs.writeFileSync(f, c, 'utf8');
console.log('OK - assetPrefix is now dynamic (dev=empty, prod=dot)');
console.log('\nCurrent config:');
console.log(c.substring(0, 600));