const fs = require('fs');
const f = 'components/POSInvoice.jsx';
let c = fs.readFileSync(f, 'utf8');

const broken = "catch(e5) {} [safeInvoiceItems,";
const fixed = `catch(e5) {}
    finally { savingRef.current = false; if (isMountedRef.current) setSaving(false); }
  }, [safeInvoiceItems,`;

if (c.includes(broken)) {
  c = c.replace(broken, fixed);
  fs.writeFileSync(f, c, 'utf8');
  console.log('OK - Fixed! finally block added.');
} else {
  console.log('Pattern not found. Trying flexible match...');
  const regex = /catch\(e5\)\s*\{\}\s*\[safeInvoiceItems,/;
  if (regex.test(c)) {
    c = c.replace(regex, fixed);
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK - Fixed with regex!');
  } else {
    console.log('ERROR: Could not find the broken pattern.');
  }
}