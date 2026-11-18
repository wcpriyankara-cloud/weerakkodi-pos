const fs = require('fs');

let pos = fs.readFileSync('components/POSInvoice.jsx', 'utf8');

// Find the Firestore listeners useEffect and add Dexie fallback
// Strategy: Add a Dexie pre-load BEFORE the onSnapshot listeners,
// and add error handlers to onSnapshot that load from Dexie

// 1. Add Dexie pre-load function before the useEffect
const dexiePreload = `
  /* ── Dexie offline pre-load ── */
  const loadFromDexie = async () => {
    try {
      if (!localDb || !user?.uid) return;
      // Load items from Dexie
      if (localDb.items) {
        const dexItems = await localDb.items.where('uid').equals(user.uid).toArray();
        if (dexItems.length > 0 && isMountedRef.current) {
          setAllItems(dexItems);
          setDataReady(true);
          console.log('[Offline] Loaded', dexItems.length, 'items from Dexie');
        }
      }
      // Load customers from Dexie
      if (localDb.customers) {
        const dexCusts = await localDb.customers.where('uid').equals(user.uid).toArray();
        if (dexCusts.length > 0 && isMountedRef.current) {
          setAllCustomers(dexCusts);
          console.log('[Offline] Loaded', dexCusts.length, 'customers from Dexie');
        }
      }
    } catch (e) {
      console.warn('[Dexie] Preload failed:', e.message);
    }
  };
`;

if (!pos.includes('loadFromDexie')) {
  pos = pos.replace(
    '/* ── Firestore listeners ── */',
    dexiePreload + '\n  /* ── Firestore listeners ── */'
  );
  console.log('✅ Added loadFromDexie function');
}

// 2. Call loadFromDexie at the start of the useEffect (before onSnapshot)
if (!pos.includes('loadFromDexie();')) {
  pos = pos.replace(
    'const unsubs = [];\n\n    unsubs.push(onSnapshot(query(collection(db, \'items\')',
    'const unsubs = [];\n\n    // Pre-load from Dexie (works offline)\n    loadFromDexie();\n\n    unsubs.push(onSnapshot(query(collection(db, \'items\')'
  );
  console.log('✅ Added loadFromDexie() call in useEffect');
}

// 3. Add error handlers to onSnapshot calls
// Items listener - add error callback
pos = pos.replace(
  /unsubs\.push\(onSnapshot\(query\(collection\(db, 'items'\), where\('uid', '==', user\.uid\)\), s => \{[\s\S]*?saveCache\(CACHE_KEY_ITEMS,[\s\S]*?\}\)\);\n    \}\)\);/,
  (match) => {
    if (match.includes('err =>')) return match; // already has error handler
    return match.replace(/\}\)\);$/, '}, err => { console.warn("[Offline] Items listener failed, using Dexie:", err.message); loadFromDexie(); }));');
  }
);
console.log('✅ Added error handler to items listener');

// Customers listener - add error callback  
pos = pos.replace(
  /unsubs\.push\(onSnapshot\(query\(collection\(db, 'customers'\), where\('uid', '==', user\.uid\)\), s => \{[\s\S]*?saveCache\(CACHE_KEY_CUSTOMERS,[\s\S]*?\}\)\);\n    \}\)\);/,
  (match) => {
    if (match.includes('err =>')) return match;
    return match.replace(/\}\)\);$/, '}, err => { console.warn("[Offline] Customers listener failed, using Dexie:", err.message); loadFromDexie(); }));');
  }
);
console.log('✅ Added error handler to customers listener');

fs.writeFileSync('components/POSInvoice.jsx', pos, 'utf8');
console.log('\n🎉 POS offline load fix applied!');
