const fs = require('fs');
const path = require('path');

let totalChanges = 0;

// ============================================
// 1. Fix InvoiceList.jsx
// ============================================
const invPath = path.join(__dirname, 'components', 'InvoiceList.jsx');
let invCode = fs.readFileSync(invPath, 'utf8');

// Fix 1a: Remove setInvoices([]) at start of fetchInvoices (L66)
// This clears invoices before loading, causing flash of empty state
if (invCode.includes('setInvoices([]);\n') || invCode.includes('setInvoices([]);\r\n')) {
  // Only remove the FIRST occurrence (inside fetchInvoices)
  const fetchIdx = invCode.indexOf('const fetchInvoices');
  if (fetchIdx !== -1) {
    const setEmptyIdx = invCode.indexOf('setInvoices([]);', fetchIdx);
    if (setEmptyIdx !== -1 && setEmptyIdx < fetchIdx + 500) {
      invCode = invCode.slice(0, setEmptyIdx) + 
        '// setInvoices([]); // 🔒 Removed: don\'t clear before loading' + 
        invCode.slice(setEmptyIdx + 'setInvoices([]);'.length);
      totalChanges++;
      console.log('✅ Removed setInvoices([]) at start of fetchInvoices');
    }
  }
}

// Fix 1b: Add "Sync from Cloud" button and pullInvoicesOnce call
// Find the refresh button area (L477: onClick={fetchInvoices})
if (!invCode.includes('handleSyncFromCloud')) {
  // Add the sync handler function before fetchInvoices
  const fetchIdx = invCode.indexOf('const fetchInvoices');
  if (fetchIdx !== -1) {
    const syncHandler = `// 🔌 Sync invoices from Firestore (needs internet momentarily)
  const handleSyncFromCloud = async () => {
    try {
      setLoading(true);
      const uid = user?.uid || auth?.currentUser?.uid;
      if (!uid) return;
      
      // Import dynamically to avoid circular deps
      const { pullInvoicesOnce } = await import('@/lib/syncService');
      const count = await pullInvoicesOnce(uid);
      console.log('📋 Synced ' + count + ' invoices from cloud');
      
      // Reload from Dexie
      await fetchInvoices();
    } catch(e) {
      console.error('Cloud sync error:', e?.message);
      alert('Sync failed: ' + (e?.message || 'Check internet connection'));
    } finally {
      setLoading(false);
    }
  };

  `;
    invCode = invCode.slice(0, fetchIdx) + syncHandler + invCode.slice(fetchIdx);
    totalChanges++;
    console.log('✅ Added handleSyncFromCloud function');
  }
  
  // Add sync button next to refresh button
  if (invCode.includes('onClick={fetchInvoices}')) {
    invCode = invCode.replace(
      'onClick={fetchInvoices}',
      `onClick={fetchInvoices}
              title="Refresh from local"
            >
              🔄
            </button>
            <button
              onClick={handleSyncFromCloud}
              title="Sync from Cloud (needs internet)"
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"`
    );
    // Clean up the duplicate that might result
    totalChanges++;
    console.log('✅ Added Sync from Cloud button');
  }
}

// Fix 1c: Show helpful message when 0 invoices
if (!invCode.includes('No invoices in local database')) {
  // Find where empty state is shown
  if (invCode.includes('invoices.length === 0') || invCode.includes('!invoices.length')) {
    invCode = invCode.replace(
      /(invoices\.length\s*===\s*0|!invoices\.length)([\s\S]*?<\/div>)/,
      (match, condition, rest) => {
        return match + `
          {/* 🔌 Offline hint */}
          {invoices.length === 0 && (
            <div className="mt-4 p-4 bg-yellow-900/30 border border-yellow-600 rounded text-yellow-300 text-sm">
              ⚠️ බිල්පත් හමු නොවීය. PC එකට internet සම්බන්ධ කර "☁️ Cloud Sync" button එක click කරන්න.
            </div>
          )}`;
      }
    );
    totalChanges++;
    console.log('✅ Added offline hint message');
  }
}

fs.writeFileSync(invPath, invCode, 'utf8');

// ============================================
// 2. Ensure pullInvoicesOnce exists in syncService.js
// ============================================
const syncPath = path.join(__dirname, 'lib', 'syncService.js');
let syncCode = fs.readFileSync(syncPath, 'utf8');

if (!syncCode.includes('pullInvoicesOnce')) {
  const pullFunc = `
// 🔌 Pull invoices from Firestore to Dexie (temporarily enables network)
export async function pullInvoicesOnce(uid) {
  if (!uid || !db) return 0;
  try {
    console.log('📋 Enabling network temporarily for invoice pull...');
    await enableNetwork(db);
    
    // Wait a moment for connection
    await new Promise(r => setTimeout(r, 2000));
    
    const q = query(collection(db, 'users', uid, 'invoices'));
    const snap = await getDocs(q);
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data(), uid, _sync: 'synced' }));
    
    if (docs.length > 0 && localDb?.invoices) {
      await localDb.invoices.bulkPut(docs);
      console.log('📋 Pulled ' + docs.length + ' invoices to Dexie');
    } else {
      console.log('📋 No invoices found in Firestore');
    }
    
    await disableNetwork(db);
    return docs.length;
  } catch(e) {
    console.log('📋 Invoice pull error:', e?.message);
    try { await disableNetwork(db); } catch(x) {}
    return 0;
  }
}
`;
  const exportIdx = syncCode.lastIndexOf('export default');
  if (exportIdx !== -1) {
    syncCode = syncCode.slice(0, exportIdx) + pullFunc + '\n' + syncCode.slice(exportIdx);
    syncCode = syncCode.replace(
      /clearAllUserData,(\s*\n\s*\};)/,
      'clearAllUserData,\n  pullInvoicesOnce,$1'
    );
    fs.writeFileSync(syncPath, syncCode, 'utf8');
    totalChanges++;
    console.log('✅ Added pullInvoicesOnce to syncService.js');
  }
} else {
  console.log('⏭️ pullInvoicesOnce already exists');
}

console.log(`\n🎉 Total ${totalChanges} fixes applied!`);
console.log('🔄 App restart: Ctrl+C → npm run dev');
console.log('\n📌 ඊළඟ පියවර:');
console.log('   1. App restart කරන්න');
console.log('   2. Invoice List page එකට යන්න');
console.log('   3. "☁️ Cloud Sync" button එක click කරන්න (internet ඕන)');
console.log('   4. Firestore එකෙන් invoices pull වෙලා Dexie එකට save වෙනවා');
console.log('   5. ඊට පස්සේ offline එකේත් invoices පේනවා');