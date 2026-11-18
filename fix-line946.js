const fs = require('fs');
let pos = fs.readFileSync('components/POSInvoice.jsx', 'utf8');

// Remove the sync setAllItems(data) that overwrites local stock
pos = pos.replace(
  '      setAllItems(data); setDataReady(true);',
  '      // setAllItems deferred to async merge above (prevents stock overwrite)'
);

// Also ensure merge always uses local stock (not just unsynced)
pos = pos.replace(
  "if (local && (local._synced === false || local._synced === 0)) {",
  "if (local) { // Always prefer local stock"
);

fs.writeFileSync('components/POSInvoice.jsx', pos, 'utf8');
console.log('OK: setAllItems(data) removed, merge always uses local stock');
