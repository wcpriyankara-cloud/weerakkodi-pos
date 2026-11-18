const fs = require('fs');

// ═══════════════════════════════════════
// FIX 1: POSInvoice.jsx - Offline stock deduction
// ═══════════════════════════════════════
let pos = fs.readFileSync('components/POSInvoice.jsx', 'utf8');

// 1a. Add _pendingBatchUpdates to Dexie save
// Find the Dexie save line and add batch update map before it
const dexieSavePattern = /await localDb\.invoices\.put\(\{/;
if (dexieSavePattern.test(pos)) {
  // Add batchUpdateMap computation before Dexie save
  pos = pos.replace(
    /\/\/ STEP 1.*?await localDb\.invoices\.put\(\{/,
    `// STEP 1: Dexie save (offline-first)
    const _batchUpdateMap = buildBatchUpdateMap(snap.items);
    await localDb.invoices.put({`
  );
  
  // Add _pendingBatchUpdates field to the put payload
  pos = pos.replace(
    /_localSaved:\s*true,\s*_synced:\s*false/,
    `_localSaved: true, _synced: false, _pendingBatchUpdates: Object.keys(_batchUpdateMap).length > 0 ? _batchUpdateMap : null`
  );
  console.log('✅ POSInvoice: _pendingBatchUpdates added to Dexie save');
} else {
  console.log('⚠️ POSInvoice: Dexie save pattern not found');
}

// 1b. Add local stock deduction function after applyBatchSourceUpdates
const localDeductFn = `
// Offline stock deduction - updates Dexie items store directly
const applyBatchSourceUpdatesLocal = async (batchUpdates) => {
  if (!batchUpdates || !localDb) return;
  for (const [, upd] of Object.entries(batchUpdates)) {
    try {
      // Try to find matching purchase/batch in localDb
      if (localDb.purchases) {
        const purchases = await localDb.purchases.toArray();
        const match = purchases.find(p => p.id === upd.docId || p.firestoreId === upd.docId);
        if (match && match.items) {
          const items = [...match.items];
          upd.updates.forEach(({ index, qty }) => {
            if (index >= 0 && index < items.length) {
              const cur = items[index].remainingQty ?? items[index].qty ?? 0;
              items[index] = { ...items[index], remainingQty: Math.max(0, R2(cur - qty)) };
            }
          });
          await localDb.purchases.update(match.id, { items, updatedAt: new Date().toISOString() });
          console.log('[Offline] Local stock deducted for:', upd.docId);
        }
      }
    } catch (e) { console.warn('Local batch deduct:', e.message); }
  }
};
`;

if (!pos.includes('applyBatchSourceUpdatesLocal')) {
  pos = pos.replace(
    /(const buildCashTransactionPayload)/,
    localDeductFn + '\n$1'
  );
  console.log('✅ POSInvoice: applyBatchSourceUpdatesLocal function added');
}

// 1c. Call local stock deduction after Dexie save (both online and offline)
if (!pos.includes('applyBatchSourceUpdatesLocal(_batchUpdateMap)')) {
  pos = pos.replace(
    /dexieSaved = true;/,
    `dexieSaved = true;
      // Deduct stock locally in Dexie (works offline)
      await applyBatchSourceUpdatesLocal(_batchUpdateMap);`
  );
  console.log('✅ POSInvoice: Local stock deduction call added after Dexie save');
}

fs.writeFileSync('components/POSInvoice.jsx', pos, 'utf8');

// ═══════════════════════════════════════
// FIX 2: Customers.jsx - db validity guard
// ═══════════════════════════════════════
let cust = fs.readFileSync('components/Customers.jsx', 'utf8');

// 2a. Fix require() interop - try multiple paths to get db
const oldDbAssign = "db = firebaseApp.db || null;";
const newDbAssign = "db = firebaseApp.db || (firebaseApp.default && firebaseApp.default.db) || firebaseApp.default || null;";
if (cust.includes(oldDbAssign)) {
  cust = cust.replace(oldDbAssign, newDbAssign);
  console.log('✅ Customers: db import interop fixed');
}

// 2b. Add db.app validity check to all guard conditions
// This ensures db is a real Firestore instance (has .app property)
cust = cust.replace(
  /if \(!user\?\.uid \|\| !db \|\| !collection/g,
  'if (!user?.uid || !db || !db.app || !collection'
);
console.log('✅ Customers: db.app validity guard added');

fs.writeFileSync('components/Customers.jsx', cust, 'utf8');

console.log('\n🎉 All fixes applied!');
