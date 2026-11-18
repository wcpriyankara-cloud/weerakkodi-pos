const fs = require('fs');

let sync = fs.readFileSync('lib/syncService.js', 'utf8');

// Add batch imports if not present
if (!sync.includes('writeBatch')) {
  sync = sync.replace(
    'runTransaction, increment, serverTimestamp,',
    'runTransaction, increment, serverTimestamp, writeBatch,'
  );
  console.log('✅ Added writeBatch import');
}

// Replace syncInvoices function with batch-aware version
const oldSyncInvoices = `async function syncInvoices(uid) {
  if (CLOUD_SYNC_DISABLED || !db) return;
  const local = await localDb.invoices.where('uid').equals(uid).toArray();
  const pending = local.filter(inv => inv._sync !== 'synced');
  for (const inv of pending) {
    try {
      const ref = doc(db, 'users', uid, 'invoices', inv.id || inv.invoiceId);
      await setDoc(ref, { ...inv, _sync: 'synced', uid }, { merge: true });
      await localDb.invoices.update(inv.id || inv.invoiceId, { _sync: 'synced' });
    } catch (e) {
      if (e?.message?.includes('offline')) return;
    }
  }
}`;

const newSyncInvoices = `async function syncInvoices(uid) {
  if (CLOUD_SYNC_DISABLED || !db) return;
  const local = await localDb.invoices.where('uid').equals(uid).toArray();
  const pending = local.filter(inv => inv._sync !== 'synced');
  for (const inv of pending) {
    try {
      const ref = doc(db, 'users', uid, 'invoices', inv.id || inv.invoiceId);
      await setDoc(ref, { ...inv, _sync: 'synced', uid }, { merge: true });

      // Process pending batch deductions (stock updates from offline saves)
      if (inv._pendingBatchUpdates && Object.keys(inv._pendingBatchUpdates).length > 0) {
        try {
          const fbBatch = writeBatch(db);
          for (const [, upd] of Object.entries(inv._pendingBatchUpdates)) {
            try {
              const batchRef = doc(db, upd.col, upd.docId);
              const snap = await getDoc(batchRef);
              if (!snap.exists()) continue;
              const data = snap.data(), items = [...(data.items || [])];
              upd.updates.forEach(({ index, qty }) => {
                if (index >= 0 && index < items.length) {
                  const cur = items[index].remainingQty ?? items[index].qty ?? 0;
                  items[index] = { ...items[index], remainingQty: Math.max(0, parseFloat((cur - qty).toFixed(2))) };
                }
              });
              fbBatch.update(batchRef, { items, updatedAt: new Date().toISOString() });
            } catch (be) { console.warn('Batch deduct sync:', be.message); }
          }
          await fbBatch.commit();
          console.log('[Sync] Batch deductions applied for invoice:', inv.id || inv.invoiceId);
        } catch (be) {
          console.warn('[Sync] Batch commit failed:', be.message);
        }
      }

      await localDb.invoices.update(inv.id || inv.invoiceId, { _sync: 'synced', _pendingBatchUpdates: null });
    } catch (e) {
      if (e?.message?.includes('offline')) return;
    }
  }
}`;

if (sync.includes(oldSyncInvoices)) {
  sync = sync.replace(oldSyncInvoices, newSyncInvoices);
  console.log('✅ syncInvoices: _pendingBatchUpdates processing added');
} else {
  console.log('⚠️ syncInvoices: exact pattern not found, trying regex...');
  // Try a more flexible match
  const regex = /async function syncInvoices\(uid\) \{[\s\S]*?if \(e\?\.message\?\.includes\('offline'\)\) return;[\s\S]*?\}[\s\S]*?\}/;
  if (regex.test(sync)) {
    sync = sync.replace(regex, newSyncInvoices);
    console.log('✅ syncInvoices: replaced via regex');
  } else {
    console.log('❌ syncInvoices: could not find function to replace');
  }
}

fs.writeFileSync('lib/syncService.js', sync, 'utf8');
console.log('\n🎉 Sync batch fix applied!');
