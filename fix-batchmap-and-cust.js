const fs = require('fs');

// ═══════════════════════════════════════
// FIX 1: POSInvoice.jsx - _batchUpdateMap not defined
// ═══════════════════════════════════════
let pos = fs.readFileSync('components/POSInvoice.jsx', 'utf8');

// Add _batchUpdateMap declaration right after snap creation
const snapLine = 'const snap = snapshotInvoiceState({ safeInvoiceItems, selectedCustomer, finalNetAmount,payAmount, balance, paymentMethod, subTotal, billDiscountPercent, billDiscount, exchangeAmount, totalDiscount, invoiceRemark, selectedBankAccountId, selectedBankAccount });';
const snapLineWithMap = snapLine + '\n    const _batchUpdateMap = buildBatchUpdateMap(snap.items);';

if (!pos.includes('const _batchUpdateMap = buildBatchUpdateMap')) {
  pos = pos.replace(snapLine, snapLineWithMap);
  console.log('✅ POSInvoice: _batchUpdateMap declared after snap creation');
} else {
  console.log('⚠️ POSInvoice: _batchUpdateMap already exists');
}

fs.writeFileSync('components/POSInvoice.jsx', pos, 'utf8');

// ═══════════════════════════════════════
// FIX 2: Customers.jsx - db validity
// ═══════════════════════════════════════
let cust = fs.readFileSync('components/Customers.jsx', 'utf8');

// The real problem: require('@/firebaseConfig') returns ESM module object
// db might be nested differently. Let's add a proper guard function.
const guardFn = `
// Safe db check - handles CJS/ESM interop
const isValidDb = () => {
  if (!db) return false;
  if (db.app) return true;
  if (typeof db._databaseId !== 'undefined') return true;
  if (db.type === 'firestore') return true;
  return false;
};
`;

if (!cust.includes('isValidDb')) {
  // Insert after the try/catch firebase import block
  cust = cust.replace(
    "import { useUserAuth } from '@/context/UserContext';",
    guardFn + "\nimport { useUserAuth } from '@/context/UserContext';"
  );
  console.log('✅ Customers: isValidDb guard function added');
}

// Replace all !db checks with !isValidDb()
cust = cust.replace(/!db \|\| !db\.app/g, '!isValidDb()');
cust = cust.replace(/!db \|\| !collection/g, '!isValidDb() || !collection');
console.log('✅ Customers: db guards replaced with isValidDb()');

fs.writeFileSync('components/Customers.jsx', cust, 'utf8');

console.log('\n🎉 All fixes applied!');
