const fs = require('fs');
let pos = fs.readFileSync('components/POSInvoice.jsx', 'utf8');

// Fix: Remove isMountedRef check from setAllItems call after stock deduction
const oldRefresh = `      // Update React state immediately so UI reflects new stock
      try {
        const updatedItems = await localDb.items.where('uid').equals(user.uid).toArray();
        if (isMountedRef.current && updatedItems.length > 0) {
          setAllItems(updatedItems);
          console.log('[Offline] allItems state updated with local stock');
        }
      } catch(e) {}`;

const newRefresh = `      // Update React state immediately so UI reflects new stock
      try {
        const updatedItems = await localDb.items.where('uid').equals(user.uid).toArray();
        console.log('[DEBUG] Refresh: updatedItems count=', updatedItems.length, 'isMounted=', isMountedRef.current);
        if (updatedItems.length > 0) {
          setAllItems(updatedItems);
          setDataReady(true);
          console.log('[Offline] allItems state updated with local stock, count:', updatedItems.length);
        } else {
          console.warn('[DEBUG] No items in Dexie for uid:', user.uid);
        }
      } catch(e) { console.warn('[DEBUG] Refresh error:', e.message); }`;

if (pos.includes(oldRefresh)) {
  pos = pos.replace(oldRefresh, newRefresh);
  fs.writeFileSync('components/POSInvoice.jsx', pos, 'utf8');
  console.log('OK: UI refresh fix applied');
} else {
  console.log('Pattern not found, trying flexible match...');
  // Try simpler match
  pos = pos.replace(
    'if (isMountedRef.current && updatedItems.length > 0) {',
    'if (updatedItems.length > 0) {'
  );
  pos = pos.replace(
    "console.log('[Offline] allItems state updated with local stock');",
    "setDataReady(true); console.log('[Offline] allItems state updated, count:', updatedItems.length);"
  );
  fs.writeFileSync('components/POSInvoice.jsx', pos, 'utf8');
  console.log('OK: UI refresh fix applied (flexible)');
}
