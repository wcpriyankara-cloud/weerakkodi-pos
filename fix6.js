const fs = require('fs');
const path = require('path');

// Read POS page
const posPath = path.join(__dirname, 'app', '(dashboard)', 'pos', 'page.jsx');
const pos = fs.readFileSync(posPath, 'utf8');
const lines = pos.split('\n');

console.log('=== POS page: item/customer loading code ===\n');
lines.forEach((line, i) => {
  const l = line.trim();
  if (l.match(/items|setItems|customers|setCustomers|onSnapshot|getDocs|localDb|collection|useEffect|fetchItems|fetchCustomers|loadItems|loadCustomers/i)) {
    console.log('L' + (i+1) + ': ' + l.substring(0, 150));
  }
});

console.log('\n=== POS page: first 30 lines (imports) ===\n');
lines.slice(0, 30).forEach((line, i) => {
  console.log('L' + (i+1) + ': ' + line.substring(0, 150));
});

console.log('\n=== Total lines: ' + lines.length + ' ===');