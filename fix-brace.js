const fs = require('fs');
const f = 'components/POSInvoice.jsx';
let c = fs.readFileSync(f, 'utf8');

const bad = "} catch(e5) {}, [safeInvoiceItems,";
const good = "} catch(e5) {}\n  }, [safeInvoiceItems,";

if (c.includes(bad)) {
  c = c.replace(bad, good);
  fs.writeFileSync(f, c, 'utf8');
  console.log('✅ Fixed! Added closing brace for handleSaveInvoice useCallback.');
} else {
  console.log('❌ Pattern not found');
}