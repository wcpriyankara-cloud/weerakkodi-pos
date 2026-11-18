const fs = require('fs');
let fc = fs.readFileSync('firebase-config.js', 'utf8');

// Remove duplicate setLogLevel
fc = fc.replace('  setLogLevel,\n  setLogLevel,', '  setLogLevel,');

fs.writeFileSync('firebase-config.js', fc, 'utf8');
console.log('✅ Duplicate setLogLevel removed');
