const fs = require('fs');
const path = require('path');

const invPath = path.join(__dirname, 'components', 'InvoiceList.jsx');
let code = fs.readFileSync(invPath, 'utf8');

// Fix: Replace allLocal reference with safe version
code = code.replace(
  "console.log('📋 INVOICE DEBUG: invoiceMap size =', invoiceMap.size, '| Dexie local =', allLocal?.length || 0);",
  "console.log('📋 INVOICE DEBUG: invoiceMap size =', invoiceMap.size);"
);

fs.writeFileSync(invPath, code, 'utf8');
console.log('✅ Fixed allLocal reference error');
console.log('🔄 Hot reload වෙන්න ඕන — browser refresh කරන්න');