const fs = require('fs');
const f = 'components/POSInvoice.jsx';
let c = fs.readFileSync(f, 'utf8');

const broken = 'catch(e5) {} [safeInvoiceItems,';
const fixed = 'catch(e5) {}\n    savingRef.current = false; if (isMountedRef.current) setSaving(false);\n  }, [safeInvoiceItems,';

if (c.includes(broken)) {
  c = c.replace(broken, fixed);
  fs.writeFileSync(f, c, 'utf8');
  console.log('OK - Fixed! Added cleanup + closing brace.');
} else {
  console.log('Exact match failed. Trying regex...');
  const re = /catch\(e5\)\s*\{\}\s*\[safeInvoiceItems,/;
  if (re.test(c)) {
    c = c.replace(re, fixed);
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK - Fixed with regex!');
  } else {
    const idx = c.indexOf('catch(e5)');
    if (idx !== -1) {
      console.log('NEARBY:', JSON.stringify(c.substring(idx, idx + 150)));
    } else {
      console.log('catch(e5) NOT FOUND at all');
    }
  }
}