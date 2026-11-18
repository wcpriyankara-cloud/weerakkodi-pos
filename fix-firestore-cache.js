const fs = require('fs');
let pos = fs.readFileSync('components/POSInvoice.jsx', 'utf8');

// After Dexie stock deduction, also update Firestore local cache
// so onSnapshot listener picks up the new stock
const oldDeduct = `      // Deduct item stock locally in Dexie
      try {
        await applyBatchSourceUpdatesLocal(snap.items);
      } catch(e) { console.warn('[Offline] Stock deduct err:', e.message); }`;

const newDeduct = `      // Deduct item stock locally in Dexie
      try {
        await applyBatchSourceUpdatesLocal(snap.items);
      } catch(e) { console.warn('[Offline] Stock deduct err:', e.message); }

      // Also update Firestore local cache so onSnapshot reflects new stock
      try {
        const deductions = buildDeductionMap(snap.items);
        for (const [itemId, qty] of Object.entries(deductions)) {
          try {
            const itemRef = doc(db, 'items', itemId);
            const itemSnap = await getDoc(itemRef);
            if (itemSnap.exists()) {
              const curStock = itemSnap.data().stock ?? itemSnap.data().currentStock ?? 0;
              const newStock = Math.max(0, R2(curStock - qty));
              await updateDoc(itemRef, { stock: newStock, currentStock: newStock });
              console.log('[Offline] Firestore cache updated:', itemId, '->', newStock);
            }
          } catch(fe) { console.warn('[Offline] Firestore cache update skip:', fe.message); }
        }
      } catch(e) { console.warn('[Offline] Firestore cache batch skip:', e.message); }`;

if (pos.includes(oldDeduct)) {
  pos = pos.replace(oldDeduct, newDeduct);
  fs.writeFileSync('components/POSInvoice.jsx', pos, 'utf8');
  console.log('OK: Firestore cache update added after Dexie deduction');
} else {
  console.log('Pattern not found');
}
