const fs = require('fs');
let fc = fs.readFileSync('firebase-config.js', 'utf8');

// Remove setLogLevel from import
fc = fc.replace('  setLogLevel,\n', '');

// Remove setLogLevel call
fc = fc.replace('// Console එකේ WebChannel RPC Listen error spam වීම 100% නවත්වයි\nsetLogLevel("silent");\n', '');
fc = fc.replace('setLogLevel("silent");\n', '');

fs.writeFileSync('firebase-config.js', fc, 'utf8');
console.log('✅ setLogLevel removed from firebase-config.js');

// Also check lib/firestore-safe.js exports
let safe = fs.readFileSync('lib/firestore-safe.js', 'utf8');
console.log('\n=== lib/firestore-safe.js (first 30 lines) ===');
console.log(safe.split('\n').slice(0, 30).join('\n'));
