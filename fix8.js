const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, 'components', 'POSInvoice.jsx');
const code = fs.readFileSync(p, 'utf8');
const lines = code.split('\n');

console.log('=== POSInvoice.jsx L529-L600 (data loading useEffect) ===\n');
for (let i = 528; i < Math.min(600, lines.length); i++) {
  console.log('L' + (i+1) + ': ' + lines[i].substring(0, 180));
}

console.log('\n=== POSInvoice.jsx L345-L400 (first useEffect) ===\n');
for (let i = 344; i < Math.min(400, lines.length); i++) {
  console.log('L' + (i+1) + ': ' + lines[i].substring(0, 180));
}

console.log('\n=== POSInvoice.jsx L456-L530 (state declarations) ===\n');
for (let i = 455; i < Math.min(530, lines.length); i++) {
  console.log('L' + (i+1) + ': ' + lines[i].substring(0, 180));
}