const fs = require('fs');
const path = require('path');

let totalChanges = 0;

// ============================================
// 1. Fix Restore page - UID stamp on restore
// ============================================
const restorePath = path.join(__dirname, 'app', '(dashboard)', 'restore', 'page.jsx');
if (fs.existsSync(restorePath)) {
  let restoreCode = fs.readFileSync(restorePath, 'utf8');
  
  // Find the bulkPut call and add UID stamping before it
  if (!restoreCode.includes('UID STAMP')) {
    // Replace the batch processing section
    const bulkPutPattern = /await localDb\[tableName\]\.bulkPut\(batch\);/;
    if (bulkPutPattern.test(restoreCode)) {
      restoreCode = restoreCode.replace(bulkPutPattern, `// 🔒 UID STAMP: Force current user UID on all records
            const { auth } = await import('@/lib/firebase');
            const currentUid = auth?.currentUser?.uid;
            const stampedBatch = currentUid ? batch.map(row => ({ ...row, uid: currentUid })) : batch;
            await localDb[tableName].bulkPut(stampedBatch);`);
      totalChanges++;
      console.log('✅ Restore page: UID stamping added');
    }
  }
  
  fs.writeFileSync(restorePath, restoreCode, 'utf8');
}

// ============================================
// 2. Fix syncService.js - Disable purge temporarily
// ============================================
const syncPath = path.join(__dirname, 'lib', 'syncService.js');
let syncCode = fs.readFileSync(syncPath, 'utf8');

// Disable purgeOtherUsers by adding early return
if (!syncCode.includes('PURGE DISABLED')) {
  syncCode = syncCode.replace(
    /export async function purgeOtherUsers\(uid\) \{/,
    `export async function purgeOtherUsers(uid) {
  // 🔒 PURGE DISABLED - data loss risk after restore
  console.log('⏭️ Purge skipped (disabled after restore)');
  return;`
  );
  totalChanges++;
  console.log('✅ syncService.js: purge disabled');
}

// Also disable mirror pull completely
if (!syncCode.includes('MIRROR DISABLED')) {
  syncCode = syncCode.replace(
    /async function startMirror\(uid\) \{/,
    `async function startMirror(uid) {
  // 🔒 MIRROR DISABLED - prevents overwriting local data
  console.log('⏭️ Mirror skipped (disabled)');
  return;`
  );
  totalChanges++;
  console.log('✅ syncService.js: mirror disabled');
}

fs.writeFileSync(syncPath, syncCode, 'utf8');

// ============================================
// 3. Fix POSInvoice.jsx - Remove auto-sync trigger that causes data loss
// ============================================
const posPath = path.join(__dirname, 'components', 'POSInvoice.jsx');
if (fs.existsSync(posPath)) {
  let posCode = fs.readFileSync(posPath, 'utf8');
  
  // Check if startAutoSync is called and if purgeOtherUsers is called
  if (posCode.includes('purgeOtherUsers') && !posCode.includes('PURGE DISABLED IN POS')) {
    // Comment out purgeOtherUsers calls in POS
    posCode = posCode.replace(
      /await purgeOtherUsers\(/g,
      '// await purgeOtherUsers( // 🔒 PURGE DISABLED IN POS'
    );
    totalChanges++;
    console.log('✅ POSInvoice.jsx: purge calls disabled');
  }
  
  fs.writeFileSync(posPath, posCode, 'utf8');
}

console.log(`\n🎉 Total ${totalChanges} fixes applied!`);
console.log('\n📌 ඊළඟ පියවර:');
console.log('   1. App restart: Ctrl+C → npm run dev');
console.log('   2. /restore page එකට යන්න');
console.log('   3. 23 MB full_snapshot file එක නැවත select කරන්න');
console.log('   4. POS page එකට යන්න — items stay වෙන්න ඕන');