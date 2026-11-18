const fs = require('fs');
let pos = fs.readFileSync('components/POSInvoice.jsx', 'utf8');

// FIX 1: Remove the sync `setAllItems(data)` that overwrites local stock
// Replace the entire onSnapshot items callback logic
const oldCallback = `    unsubs.push(onSnapshot(query(collection(db, 'items'), where('uid', '==', user.uid)), s => {
      if (!isMountedRef.current) return;
      const fbData = s.docs.map(d => ({ id: d.id, ...d.data() }));
      // Merge: keep local unsynced items (async)
      (async () => {
        try {
          const localUnsynced = await localDb.items.where('uid').equals(user.uid).and(i => !i._synced && !i.synced).toArray();
          const fbIds = new Set(fbData.map(d => d.id));
          const extra = localUnsynced.filter(i => !fbIds.has(i.id));
          if (extra.length > 0 && isMountedRef.current) setAllItems([...fbData, ...extra]);
        } catch(e) {}
      })();
      const data = fbData;
      // Override stock with local values if local is more recent (unsynced)
      (async () => {
        try {
          const localItems = await localDb.items.where('uid').equals(user.uid).toArray();
          const localMap = new Map(localItems.map(li => [li.id, li]));
          const merged = data.map(d => {
            const local = localMap.get(d.id);
            if (local && (local._synced === false || local._synced === 0)) {
              return { ...d, stock: local.stock ?? d.stock, currentStock: local.currentStock ?? d.currentStock };
            }
            return d;
          });
          if (isMountedRef.current) setAllItems(merged);
        } catch(e) {}
      })();
      setAllItems(data); setDataReady(true);`;

const newCallback = `    unsubs.push(onSnapshot(query(collection(db, 'items'), where('uid', '==', user.uid)), s => {
      if (!isMountedRef.current) return;
      const fbData = s.docs.map(d => ({ id: d.id, ...d.data() }));
      // Always merge with local Dexie stock (prevents overwrite of offline deductions)
      (async () => {
        try {
          const localItems = await localDb.items.where('uid').equals(user.uid).toArray();
          const localMap = new Map(localItems.map(li => [li.id, li]));
          const localUnsynced = localItems.filter(i => !i._synced && !i.synced);
          const fbIds = new Set(fbData.map(d => d.id));
          const extra = localUnsynced.filter(i => !fbIds.has(i.id));
          const merged = [...fbData, ...extra].map(d => {
            const local = localMap.get(d.id);
            if (local) {
              // Always prefer local stock (may have offline deductions)
              return { ...d, stock: local.stock ?? d.stock, currentStock: local.currentStock ?? d.currentStock };
            }
            return d;
          });
          if (isMountedRef.current) { setAllItems(merged); setDataReady(true); }
        } catch(e) {
          if (isMountedRef.current) { setAllItems(fbData); setDataReady(true); }
        }
      })();`;

if (pos.includes(oldCallback)) {
  pos = pos.replace(oldCallback, newCallback);
  fs.writeFileSync('components/POSInvoice.jsx', pos, 'utf8');
  console.log('OK: onSnapshot items callback fixed (race condition resolved)');
} else {
  console.log('Pattern not found, trying simpler fix...');
  // Just remove the sync setAllItems(data) line
  pos = pos.replace(
    '      setAllItems(data); setDataReady(true);\n      saveCache(CACHE_KEY_ITEMS,',
    '      // setAllItems deferred to async merge above\n      saveCache(CACHE_KEY_ITEMS,'
  );
  // Also fix merge to always use local stock
  pos = pos.replace(
    "if (local && (local._synced === false || local._synced === 0)) {",
    "if (local) {"
  );
  fs.writeFileSync('components/POSInvoice.jsx', pos, 'utf8');
  console.log('OK: simpler fix applied');
}
