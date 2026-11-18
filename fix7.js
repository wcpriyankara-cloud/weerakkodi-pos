const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, 'components', 'POSInvoice.jsx');
const code = fs.readFileSync(p, 'utf8');
const lines = code.split('\n');

console.log('=== POSInvoice.jsx: item loading code ===\n');
lines.forEach((line, i) => {
  const l = line.trim();
  if (l.match(/items|setItems|fetchItems|loadItems|onSnapshot|getDocs|localDb\.items|collection.*items|useEffect/i) && !l.match(/display:|flex|align|justify|margin|padding|color:|fontSize|fontWeight|border|background|width|height|grid|gap/i)) {
    console.log('L' + (i+1) + ': ' + l.substring(0, 160));
  }
});

console.log('\n=== POSInvoice.jsx: first 40 lines (imports) ===\n');
lines.slice(0, 40).forEach((line, i) => {
  console.log('L' + (i+1) + ': ' + line.substring(0, 160));
});

console.log('\n=== Total lines: ' + lines.length + ' ===');