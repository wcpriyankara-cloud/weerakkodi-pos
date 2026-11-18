const fs = require('fs');
let nc = fs.readFileSync('next.config.js', 'utf8');

// Remove turbopack resolveAlias
nc = nc.replace(/  turbopack: \{[\s\S]*?resolveAlias:[\s\S]*?\},\s*\},\s*\n/, '');

// Remove webpack alias for firebase/firestore
nc = nc.replace(/      'firebase\/firestore': path\.resolve\(__dirname, 'lib\/firestore-safe\.js'\),\s*\n/, '');

// Clean up empty resolve.alias if needed
nc = nc.replace(/    config\.resolve\.alias = \{\s*\.\.\.config\.resolve\.alias,\s*\};\s*\n/, '');

fs.writeFileSync('next.config.js', nc, 'utf8');
console.log('✅ Aliases removed from next.config.js');
console.log('\n=== Updated next.config.js ===');
console.log(fs.readFileSync('next.config.js', 'utf8'));
