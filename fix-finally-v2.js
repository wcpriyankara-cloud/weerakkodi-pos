const fs = require('fs');
const f = 'components/POSInvoice.jsx';
let c = fs.readFileSync(f, 'utf8');

const old = 'finally { savingRef.current = false; if (isMountedRef.current) setSaving(false); }';
const rep = 'savingRef.current = false; if (isMountedRef.current) setSaving(false);';

if (c.includes(old)) {
  c = c.replace(old, rep);
  fs.writeFileSync(f, c, 'utf8');
  console.log('OK - Removed finally keyword, cleanup runs unconditionally.');
} else {
  console.log('NOT FOUND');
}