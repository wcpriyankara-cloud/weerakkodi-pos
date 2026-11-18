const fs = require('fs');

// ═══════════════════════════════════════
// FIX 1: POSInvoice.jsx - Correct local stock deduction
// ═══════════════════════════════════════
let pos = fs.readFileSync('components/POSInvoice.jsx', 'utf8');

// Replace applyBatchSourceUpdatesLocal with correct version
// that uses invoice items (snap.items) to deduct by itemId
const oldFn = `// Offline stock deduction - updates Dexie items store directly
const applyBatchSourceUpdatesLocal = async (batchUpdates) => {
  if (!batchUpdates || !localDb) return;
  for (const [, upd] of Object.entries(batchUpdates)) {
    try {
      // Deduct item stock locally
      try {
        const item = await localDb.items.get(upd.docId);
        if (item) {
          const totalDeduct = upd.updates.reduce((sum, u) => sum + u.qty, 0);
          const newStock = Math.max(0, R2((item.stock ?? item.currentStock ?? 0) - totalDeduct));
          await localDb.items.update(upd.docId, { stock: newStock, currentStock: newStock, _synced: false });
          console.log('[Offline] Item stock deducted:', upd.docId, '-'+totalDeduct, '->', newStock);
        }
      } catch(e) { console.warn('Local item deduct:', e.message); }

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
          await localDb.purchases.update(match.id, { items, updatedAt: new Date().toISOString() });`;

const newFn = `// Offline stock deduction - deducts from localDb.items by itemId
const applyBatchSourceUpdatesLocal = async (invoiceItems) => {
  if (!invoiceItems || !Array.isArray(invoiceItems) || !localDb || !localDb.items) return;
  // Group quantities by itemId
  const qtyMap = {};
  invoiceItems.forEach(it => {
    const itemId = it.itemId || it.id || it.docId;
    if (!itemId) return;
    const qty = parseFloat(it.qty || it.quantity || 0);
    qtyMap[itemId] = (qtyMap[itemId] || 0) + qty;
  });
  for (const [itemId, totalDeduct] of Object.entries(qtyMap)) {
    if (totalDeduct <= 0) continue;
    try {
      const item = await localDb.items.get(itemId);
      if (item) {
        const curStock = item.stock ?? item.currentStock ?? 0;
        const newStock = Math.max(0, R2(curStock - totalDeduct));
        await localDb.items.update(itemId, { stock: newStock, currentStock: newStock, _synced: false });
        console.log('[Offline] Item stock deducted:', itemId, '-'+totalDeduct, '->', newStock);
      } else {
        console.warn('[Offline] Item not in Dexie:', itemId);
      }
    } catch(e) { console.warn('Local item deduct:', e.message); }
  }`;

if (pos.includes(oldFn)) {
  pos = pos.replace(oldFn, newFn);
  console.log('✅ applyBatchSourceUpdatesLocal replaced (exact match)');
} else {
  // Try regex replacement
  const regex = /\/\/ Offline stock deduction[\s\S]*?console\.log\('\[Offline\] Local stock deducted for:', upd\.docId\);[\s\S]*?\}[\s\S]*?\}[\s\S]*?\};/;
  if (regex.test(pos)) {
    pos = pos.replace(regex, newFn + '\n};');
    console.log('✅ applyBatchSourceUpdatesLocal replaced (regex)');
  } else {
    console.log('⚠️ Could not find old function, trying line-based...');
    // Find and replace by line markers
    const startMarker = '// Offline stock deduction';
    const endMarker = 'const buildCashTransactionPayload';
    const startIdx = pos.indexOf(startMarker);
    const endIdx = pos.indexOf(endMarker);
    if (startIdx > 0 && endIdx > startIdx) {
      pos = pos.substring(0, startIdx) + newFn + '\n};\n\n' + pos.substring(endIdx);
      console.log('✅ applyBatchSourceUpdatesLocal replaced (line-based)');
    } else {
      console.log('❌ Could not replace function');
    }
  }
}

// Fix the call site: pass snap.items instead of _batchUpdateMap
pos = pos.replace(
  'await applyBatchSourceUpdatesLocal(_batchUpdateMap);',
  'await applyBatchSourceUpdatesLocal(snap.items);'
);
console.log('✅ Call site fixed: snap.items passed');

fs.writeFileSync('components/POSInvoice.jsx', pos, 'utf8');

// ═══════════════════════════════════════
// FIX 2: syncService.js - Update items stock on sync
// ═══════════════════════════════════════
let sync = fs.readFileSync('lib/syncService.js', 'utf8');

// After batch deduction commit, also update items collection stock
const oldCommit = `          await fbBatch.commit();
          console.log('[Sync] Batch deductions applied for invoice:', inv.id || inv.invoiceId);`;

const newCommit = `          await fbBatch.commit();
          console.log('[Sync] Batch deductions applied for invoice:', inv.id || inv.invoiceId);

          // Also update items collection stock (POS page reads from items)
          if (inv.items && Array.isArray(inv.items)) {
            const itemQtyMap = {};
            inv.items.forEach(it => {
              const itemId = it.itemId || it.id;
              if (!itemId) return;
              const qty = parseFloat(it.qty || it.quantity || 0);
              itemQtyMap[itemId] = (itemQtyMap[itemId] || 0) + qty;
            });
            for (const [itemId, totalDeduct] of Object.entries(itemQtyMap)) {
              if (totalDeduct <= 0) continue;
              try {
                const itemRef = doc(db, 'items', itemId);
                const itemSnap = await getDoc(itemRef);
                if (itemSnap.exists()) {
                  const curStock = itemSnap.data().stock ?? itemSnap.data().currentStock ?? 0;
                  const newStock = Math.max(0, parseFloat((curStock - totalDeduct).toFixed(2)));
                  await setDoc(itemRef, { stock: newStock, currentStock: newStock }, { merge: true });
                  console.log('[Sync] Item stock updated:', itemId, '->', newStock);
                }
              } catch (ie) { console.warn('[Sync] Item stock update failed:', ie.message); }
            }
          }`;

if (sync.includes(oldCommit)) {
  sync = sync.replace(oldCommit, newCommit);
  console.log('✅ syncService: items stock update added after batch commit');
} else {
  console.log('⚠️ syncService: commit pattern not found');
}

fs.writeFileSync('lib/syncService.js', sync, 'utf8');

console.log('\n🎉 Stock deduction fix applied!');
