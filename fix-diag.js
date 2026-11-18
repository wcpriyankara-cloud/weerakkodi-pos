const fs = require('fs');
const f = 'components/POSInvoice.jsx';
let c = fs.readFileSync(f, 'utf8');

const idx = c.indexOf('catch(e5)');
if (idx === -1) {
  console.log('catch(e5) NOT FOUND!');
  const idx2 = c.indexOf('triggerLocalDiskBackup');
  if (idx2 !== -1) {
    console.log('triggerLocalDiskBackup at', idx2);
    console.log('NEARBY:', JSON.stringify(c.substring(idx2 - 20, idx2 + 200)));
  }
  process.exit();
}

console.log('Found catch(e5) at index', idx);
const after = c.substring(idx, idx + 200);
console.log('AFTER catch(e5):', JSON.stringify(after));

const idx2 = c.indexOf('[safeInvoiceItems,', idx);
if (idx2 !== -1) {
  console.log('[safeInvoiceItems at', idx2, 'gap:', idx2 - idx);
  console.log('BETWEEN:', JSON.stringify(c.substring(idx + 9, idx2)));

  const fix = 'catch(e5) {}\n    finally { savingRef.current = false; if (isMountedRef.current) setSaving(false); }\n  }, ';
  c = c.substring(0, idx) + fix + c.substring(idx2);
  fs.writeFileSync(f, c, 'utf8');
  console.log('FIXED OK!');
} else {
  console.log('[safeInvoiceItems NOT FOUND after catch(e5)');
}