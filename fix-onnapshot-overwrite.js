const fs = require('fs');
let pos = fs.readFileSync('components/POSInvoice.jsx', 'utf8');

// FIX 1: Add navigator.onLine guard to items onSnapshot callback
pos = pos.replace(
  "unsubs.push(onSnapshot(query(collection(db, 'items'), where('uid', '==', user.uid)), s => {\n      if (!isMountedRef.current) return;",
  "unsubs.push(onSnapshot(query(collection(db, 'items'), where('uid', '==', user.uid)), s => {\n      if (!isMountedRef.current) return;\n      if (!navigator.onLine) return; // Don't overwrite local stock changes when offline"
);
console.log('OK: items onSnapshot offline guard added');

// FIX 2: Add navigator.onLine guard to customers onSnapshot callback
pos = pos.replace(
  "unsubs.push(onSnapshot(query(collection(db, 'customers'), where('uid', '==', user.uid)), s => {\n      if (!isMountedRef.current) return;",
  "unsubs.push(onSnapshot(query(collection(db, 'customers'), where('uid', '==', user.uid)), s => {\n      if (!isMountedRef.current) return;\n      if (!navigator.onLine) return; // Don't overwrite local changes when offline"
);
console.log('OK: customers onSnapshot offline guard added');

// FIX 3: Replace setAllItems with functional update after Dexie deduction
const oldRefresh = `        if (updatedItems.length > 0) {
          setAllItems(updatedItems);
          setDataReady(true);
          console.log('[Offline] allItems state updated with local stock, count:', updatedItems.length);
        }`;

const newRefresh = `        if (updatedItems.length > 0) {
          setAllItems(updatedItems);
          setDataReady(true);
          console.log('[Offline] allItems state updated with local stock, count:', updatedItems.length);
        }
        // Also directly patch allItems state for immediate UI update
        const deductions = buildDeductionMap(snap.items);
        setAllItems(prev => prev.map(item => {
          const itemId = item.id || item.itemId;
          if (deductions[itemId]) {
            const newStock = Math.max(0, R2((item.stock ?? item.currentStock ?? 0) - deductions[itemId]));
            return { ...item, stock: newStock, currentStock: newStock };
          }
          return item;
        }));
        console.log('[Offline] allItems patched via functional update');`;

if (pos.includes(oldRefresh)) {
  pos = pos.replace(oldRefresh, newRefresh);
  console.log('OK: functional setAllItems update added');
} else {
  console.log('WARN: refresh pattern not found');
}

fs.writeFileSync('components/POSInvoice.jsx', pos, 'utf8');
console.log('\nDone!');
