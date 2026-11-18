const fs = require('fs');
let fc = fs.readFileSync('firebase-config.js', 'utf8');

// Remove duplicate setLogLevel using regex (handles \r\n and \n)
fc = fc.replace(/setLogLevel,\s*\r?\n\s*setLogLevel,/, 'setLogLevel,');

fs.writeFileSync('firebase-config.js', fc, 'utf8');

// Verify
const lines = fc.split('\n');
for (let i = 0; i < 15; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}
console.log('\n✅ Done');
