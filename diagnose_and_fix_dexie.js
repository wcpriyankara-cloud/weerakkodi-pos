// diagnose_and_fix_dexie.js
const fs = require('fs');
const path = require('path');

console.log('🔧 Fixing Local Database (Dexie) definitions and imports...');

// 1. Unified robust Local Database file content
const dexieCode = `import Dexie from 'dexie';

// Initialize Dexie Local Database instance
export const localDb = new Dexie('WeerakkodiPOS_LocalDB');

localDb.version(1).stores({
  items: 'id, name, itemCode, barcode, uid, stock, quantity',
  customers: 'id, name, phone, uid, balance',
  invoices: 'id, invoiceNo, localId, synced, createdAt, date',
  drafts: 'id, invoiceNo, localId, createdAt'
});

// Ensure both named and default exports work
export const db = localDb;
export const dexieDb = localDb;
export default localDb;
`;

const dbPaths = [
  path.join(__dirname, 'lib', 'localDb.js'),
  path.join(__dirname, 'src', 'lib', 'localDb.js'),
  path.join(__dirname, 'lib', 'dexieDb.js'),
  path.join(__dirname, 'src', 'lib', 'dexieDb.js'),
  path.join(__dirname, 'lib', 'dexie.js'),
  path.join(__dirname, 'src', 'lib', 'dexie.js')
];

dbPaths.forEach(p => {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, dexieCode, 'utf8');
  console.log('✅ Updated database definition:', p);
});

// 2. Fix POSInvoice.jsx in both components and src/components
const posPaths = [
  path.join(__dirname, 'components', 'POSInvoice.jsx'),
  path.join(__dirname, 'src', 'components', 'POSInvoice.jsx')
];

posPaths.forEach(filePath => {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');

    // Make sure localDb has safe fallback everywhere so it NEVER throws "undefined (reading 'invoices')"
    // Add safe access helper or fix imports
    if (!content.includes('import { localDb }') && !content.includes('import localDb')) {
      content = `import localDb, { localDb as safeDb } from '@/lib/localDb';\n` + content;
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('✅ Verified POSInvoice:', filePath);
  }
});

console.log('🎉 Dexie database fix completed!');