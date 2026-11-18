const fs = require('fs');
let inv = fs.readFileSync('components/InvoiceList.jsx', 'utf8');
const lines = inv.split('\n');
for (let i = 24; i < 45 && i < lines.length; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}
