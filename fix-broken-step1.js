const fs = require('fs');
let pos = fs.readFileSync('components/POSInvoice.jsx', 'utf8');

// Find the broken STEP 1 section and replace entirely
const startMarker = '// STEP 1: Dexie local save FIRST (always works offline)';
const endMarker = '// STEP 2: Try Firestore';

const startIdx = pos.indexOf(startMarker);
const endIdx = pos.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.log('Markers not found:', startIdx, endIdx);
  process.exit(1);
}

const cleanStep1 = `// STEP 1: Dexie local save FIRST (always works offline)
    let dexieSaved = false;
    try {
      await localDb.invoices.put({
        id: invoiceId, invoiceNo, uid: user.uid,
        ...invoicePayload,
        _localSaved: true, _synced: false,
        _pendingBatchUpdates: Object.keys(_batchUpdateMap).length > 0 ? _batchUpdateMap : null,
        _savedAt: new Date().toISOString()
      });
      dexieSaved = true;

      // Deduct item stock locally in Dexie
      try {
        await applyBatchSourceUpdatesLocal(snap.items);
      } catch(e) { console.warn('[Offline] Stock deduct err:', e.message); }

      // Update React state immediately so UI reflects new stock
      try {
        const updatedItems = await localDb.items.where('uid').equals(user.uid).toArray();
        if (isMountedRef.current && updatedItems.length > 0) {
          setAllItems(updatedItems);
          console.log('[Offline] allItems state updated with local stock');
        }
      } catch(e) {}

      // Update customer balance locally
      if (selectedCustomer && actionType !== 'draft') {
        try {
          await localDb.customers.update(selectedCustomer.id, {
            currentBalance: customerBalanceAfter, _synced: false, _localSaved: true
          });
          console.log('[Offline] Customer balance updated:', selectedCustomer.id, '->', customerBalanceAfter);
        } catch(e) { console.warn('Local customer update:', e.message); }
      }

      console.log('[Offline] Dexie save OK:', invoiceId);
    } catch (dexErr) {
      console.error('[Dexie] Save failed:', dexErr);
    }

    `;

pos = pos.substring(0, startIdx) + cleanStep1 + pos.substring(endIdx);
fs.writeFileSync('components/POSInvoice.jsx', pos, 'utf8');
console.log('OK: STEP 1 section replaced with clean code');
