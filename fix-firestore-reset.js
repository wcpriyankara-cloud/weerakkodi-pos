const fs = require('fs');
const path = require('path');

let totalChanges = 0;

// ============================================
// 1. firebase-config.js - Remove persistentLocalCache
// ============================================
const fbPath = path.join(__dirname, 'firebase-config.js');
let fbCode = fs.readFileSync(fbPath, 'utf8');

// Replace initializeFirestore with simple getFirestore
if (fbCode.includes('persistentLocalCache') || fbCode.includes('initializeFirestore')) {
  // Remove the complex initializeFirestore block
  fbCode = fbCode.replace(
    /let db;\s*try\s*\{[\s\S]*?db = initializeFirestore[\s\S]*?\}[\s\S]*?catch[\s\S]*?\{[\s\S]*?db = getFirestore[\s\S]*?\}/,
    `const db = getFirestore(app);`
  );
  
  // Clean up unused imports
  fbCode = fbCode.replace(
    /initializeFirestore,\s*persistentLocalCache,\s*persistentMultipleTabManager,?\s*/g,
    ''
  );
  fbCode = fbCode.replace(
    /,\s*enableNetwork,\s*disableNetwork/g,
    ''
  );
  
  // Remove disableNetwork call
  fbCode = fbCode.replace(
    /\/\/ disableNetwork\(db\) removed[\s\S]*?\n/,
    ''
  );
  fbCode = fbCode.replace(
    /if\s*\(db\)\s*disableNetwork[\s\S]*?\n/,
    ''
  );
  
  // Remove goOfflineMode/goOnlineMode
  fbCode = fbCode.replace(
    /export const goOfflineMode[\s\S]*?\};/g,
    'export const goOfflineMode = async () => {};'
  );
  fbCode = fbCode.replace(
    /export const goOnlineMode[\s\S]*?\};/g,
    'export const goOnlineMode = async () => {};'
  );
  
  // Remove __CLOUD_DISABLED flag
  fbCode = fbCode.replace(
    /if\s*\(typeof window[\s\S]*?__CLOUD_DISABLED[\s\S]*?\n/,
    ''
  );
  
  totalChanges++;
  console.log('✅ firebase-config.js: Simplified to match Vercel config');
}

fs.writeFileSync(fbPath, fbCode, 'utf8');

// ============================================
// 2. syncService.js - Remove all enableNetwork/disableNetwork calls
// ============================================
const syncPath = path.join(__dirname, 'lib', 'syncService.js');
let syncCode = fs.readFileSync(syncPath, 'utf8');

// Remove pullInvoicesOnce (it causes the crash)
if (syncCode.includes('pullInvoicesOnce')) {
  syncCode = syncCode.replace(
    /\/\/ 🔌 Pull invoices from Firestore[\s\S]*?export async function pullInvoicesOnce[\s\S]*?return 0;\s*\}\s*\}/g,
    `// pullInvoicesOnce removed - Firestore state corruption fix
export async function pullInvoicesOnce(uid) {
  console.log('⏭️ pullInvoicesOnce disabled');
  return 0;
}`
  );
  totalChanges++;
  console.log('✅ syncService.js: pullInvoicesOnce disabled');
}

// Remove enableNetwork/disableNetwork from imports
syncCode = syncCode.replace(/,\s*enableNetwork,\s*disableNetwork/g, '');
syncCode = syncCode.replace(/enableNetwork,\s*disableNetwork,?\s*/g, '');

fs.writeFileSync(syncPath, syncCode, 'utf8');

// ============================================
// 3. InvoiceList.jsx - Remove getDocsFromServer, use simple getDocs
// ============================================
const invPath = path.join(__dirname, 'components', 'InvoiceList.jsx');
let invCode = fs.readFileSync(invPath, 'utf8');

// Remove getDocsFromServer import
invCode = invCode.replace(/,\s*getDocsFromServer/g, '');

// Replace getDocsFromServer with getDocs
invCode = invCode.replace(/getDocsFromServer/g, 'getDocs');

// Remove the retry logic that causes crashes
if (invCode.includes('RETRY INVOICE FETCH')) {
  invCode = invCode.replace(
    /\/\/ 🔧 RETRY INVOICE FETCH[\s\S]*?console\.log\(['"]📋 Retry also failed[\s\S]*?\}/,
    'console.log("📋 Cloud fetch failed, using Dexie data only");'
  );
  totalChanges++;
  console.log('✅ InvoiceList.jsx: Removed crash-causing retry logic');
}

// Remove the server fetch try-catch wrapper
if (invCode.includes('Force server fetch')) {
  invCode = invCode.replace(
    /\/\/ 🔧 Force server fetch[\s\S]*?try\s*\{[\s\S]*?return await getDocs\(q\);[\s\S]*?\}/,
    'return await getDocs(q);'
  );
  totalChanges++;
  console.log('✅ InvoiceList.jsx: Simplified to plain getDocs');
}

fs.writeFileSync(invPath, invCode, 'utf8');

// ============================================
// 4. Clear corrupted IndexedDB cache
// ============================================
console.log('\n⚠️ IMPORTANT: Browser එකේ IndexedDB clear කරන්න:');
console.log('   1. F12 → Application tab');
console.log('   2. IndexedDB → "firestore" database');
console.log('   3. Right-click → Delete');
console.log('   4. Page refresh (F5)');

console.log(`\n🎉 Total ${totalChanges} fixes applied!`);
console.log('🔄 App restart: Ctrl+C → npm run dev');
console.log('\n📌 මොකද වෙනස් වුණේ:');
console.log('   ✅ persistentLocalCache REMOVED (Vercel වගේම)');
console.log('   ✅ enableNetwork/disableNetwork REMOVED');
console.log('   ✅ Firestore SDK crash fix');
console.log('   ✅ Invoices getDocs simple fetch');