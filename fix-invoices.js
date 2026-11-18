const fs = require('fs');
const path = require('path');

let totalChanges = 0;

// ============================================
// 1. Check InvoiceList.jsx structure
// ============================================
const invPath = path.join(__dirname, 'components', 'InvoiceList.jsx');
const invPagePath = path.join(__dirname, 'app', '(dashboard)', 'invoice-list', 'page.jsx');

let invCode = '';
let invFile = '';

if (fs.existsSync(invPath)) {
  invCode = fs.readFileSync(invPath, 'utf8');
  invFile = invPath;
  console.log('📄 Found InvoiceList.jsx (' + invCode.split('\n').length + ' lines)');
} else if (fs.existsSync(invPagePath)) {
  invCode = fs.readFileSync(invPagePath, 'utf8');
  invFile = invPagePath;
  console.log('📄 Found invoice-list/page.jsx (' + invCode.split('\n').length + ' lines)');
} else {
  console.log('❌ InvoiceList not found!');
  process.exit(1);
}

// Check data loading method
const usesFirestore = invCode.includes('getDocs') || invCode.includes('collection(db');
const usesDexie = invCode.includes('localDb.invoices') || invCode.includes('localDb[\'invoices\']');
const usesOnSnapshot = invCode.includes('onSnapshot');

console.log('🔍 Data loading:');
console.log('   Firestore getDocs:', usesFirestore);
console.log('   Firestore onSnapshot:', usesOnSnapshot);
console.log('   Dexie localDb:', usesDexie);

// ============================================
// 2. Ensure localDb import exists
// ============================================
if (!invCode.includes('localDb')) {
  const lastImportIdx = invCode.lastIndexOf('import ');
  if (lastImportIdx !== -1) {
    const endOfLine = invCode.indexOf('\n', lastImportIdx);
    invCode = invCode.slice(0, endOfLine + 1) + 
      "import { localDb } from '@/lib/localDb';\n" +
      invCode.slice(endOfLine + 1);
    totalChanges++;
    console.log('✅ Added localDb import');
  }
}

// ============================================
// 3. Add offline-first invoice loading
// ============================================
// Strategy: Replace Firestore-only loading with Dexie-first + Firestore fallback

if (usesFirestore && !usesDexie) {
  console.log('⚠️ InvoiceList uses Firestore only - adding Dexie-first loading');
  
  // Find the main useEffect that loads invoices
  // Look for getDocs(collection(db pattern
  const getDocsPattern = /getDocs\s*\(\s*(?:query\s*\()?\s*collection\s*\(\s*db\s*,/;
  
  if (getDocsPattern.test(invCode)) {
    // Find the function/useEffect containing this and wrap with Dexie-first
    // Add a Dexie pre-check before the Firestore call
    
    // Insert Dexie load function before the component
    const componentMatch = invCode.match(/export\s+default\s+function\s+(\w+)/);
    if (componentMatch && !invCode.includes('loadInvoicesFromDexie')) {
      const insertPos = componentMatch.index;
      const dexieHelper = `
// 🔌 Offline-first invoice loader
async function loadInvoicesFromDexie(uid) {
  try {
    if (!localDb?.invoices) return null;
    const invoices = await localDb.invoices.where('uid').equals(uid).toArray();
    console.log('📋 Dexie invoices:', invoices.length);
    return invoices;
  } catch(e) {
    console.log('Dexie invoice load error:', e?.message);
    return null;
  }
}

`;
      invCode = invCode.slice(0, insertPos) + dexieHelper + invCode.slice(insertPos);
      totalChanges++;
      console.log('✅ Added Dexie invoice loader helper');
    }
    
    // Now wrap the Firestore getDocs call with try-catch + Dexie fallback
    // Find the line with getDocs and the setInvoices/setData call after it
    const firestoreBlockPattern = /(const\s+(?:snap|snapshot|querySnapshot|result)\s*=\s*await\s+getDocs\s*\([^)]+\);[\s\S]*?)(set(?:Invoices|Data|Loading)\s*\()/;
    
    if (firestoreBlockPattern.test(invCode)) {
      invCode = invCode.replace(firestoreBlockPattern, (match, firestoreCall, setCall) => {
        return `// 🔌 Try Dexie first (offline), then Firestore
    let dexieData = await loadInvoicesFromDexie(uid);
    if (dexieData && dexieData.length > 0) {
      setInvoices(dexieData);
      setLoading(false);
      return;
    }
    ${firestoreCall}${setCall}`;
      });
      totalChanges++;
      console.log('✅ Added Dexie-first fallback before Firestore query');
    }
  }
  
  // If onSnapshot is used, add Dexie pre-load
  if (usesOnSnapshot && !invCode.includes('loadInvoicesFromDexie')) {
    // Add Dexie pre-load at the start of the useEffect
    const useEffectPattern = /(useEffect\s*\(\s*\(\s*\)\s*=>\s*\{)/;
    if (useEffectPattern.test(invCode)) {
      invCode = invCode.replace(useEffectPattern, (match) => {
        return match + `
    // 🔌 Offline-first: load from Dexie immediately
    (async () => {
      try {
        const uid = auth?.currentUser?.uid || user?.uid;
        if (uid && localDb?.invoices) {
          const local = await localDb.invoices.where('uid').equals(uid).toArray();
          if (local.length > 0) {
            setInvoices(local);
            setLoading(false);
            console.log('📋 Loaded ' + local.length + ' invoices from Dexie');
          }
        }
      } catch(e) {}
    })();`;
      });
      totalChanges++;
      console.log('✅ Added Dexie pre-load in useEffect');
    }
  }
  
  fs.writeFileSync(invFile, invCode, 'utf8');
} else if (usesDexie) {
  console.log('✅ InvoiceList already uses Dexie');
} else {
  console.log('⚠️ Unknown data loading pattern');
  // Show relevant lines
  const lines = invCode.split('\n');
  lines.forEach((line, i) => {
    if (line.includes('invoice') && (line.includes('get') || line.includes('fetch') || line.includes('load') || line.includes('query'))) {
      console.log(`  L${i+1}: ${line.trim()}`);
    }
  });
}

// ============================================
// 4. Add invoice pull to syncService mirror
// ============================================
const syncPath = path.join(__dirname, 'lib', 'syncService.js');
let syncCode = fs.readFileSync(syncPath, 'utf8');

// Ensure mirror pulls invoices even when CLOUD_SYNC_DISABLED
// Add a one-time invoice pull function
if (!syncCode.includes('pullInvoicesOnce')) {
  const pullFunc = `
// 🔌 One-time invoice pull from Firestore to Dexie
export async function pullInvoicesOnce(uid) {
  if (!uid || !db) return 0;
  try {
    const { enableNetwork, disableNetwork } = await import('firebase/firestore');
    await enableNetwork(db);
    const q = query(collection(db, 'users', uid, 'invoices'));
    const snap = await getDocs(q);
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data(), uid, _sync: 'synced' }));
    if (docs.length > 0 && localDb?.invoices) {
      await localDb.invoices.bulkPut(docs);
      console.log('📋 Pulled ' + docs.length + ' invoices to Dexie');
    }
    await disableNetwork(db);
    return docs.length;
  } catch(e) {
    console.log('Invoice pull error:', e?.message);
    try { await disableNetwork(db); } catch(x) {}
    return 0;
  }
}
`;
  // Insert before export default
  const exportDefaultIdx = syncCode.lastIndexOf('export default');
  if (exportDefaultIdx !== -1) {
    syncCode = syncCode.slice(0, exportDefaultIdx) + pullFunc + '\n' + syncCode.slice(exportDefaultIdx);
    
    // Add to export default
    syncCode = syncCode.replace(
      'clearAllUserData,\n};',
      'clearAllUserData,\n  pullInvoicesOnce,\n};'
    );
    totalChanges++;
    console.log('✅ Added pullInvoicesOnce to syncService.js');
  }
}

fs.writeFileSync(syncPath, syncCode, 'utf8');

// ============================================
// 5. Add "Sync Invoices" button to invoice-list page
// ============================================
if (fs.existsSync(invPagePath)) {
  let pageCode = fs.readFileSync(invPagePath, 'utf8');
  
  if (!pageCode.includes('pullInvoicesOnce') && !pageCode.includes('Sync Invoices')) {
    // Add import
    if (pageCode.includes('syncService')) {
      pageCode = pageCode.replace(
        /from\s*['"]@\/lib\/syncService['"]/,
        (match) => match
      );
      // Add pullInvoicesOnce to existing import
      const syncImportMatch = pageCode.match(/import\s*\{([^}]+)\}\s*from\s*['"]@\/lib\/syncService['"]/);
      if (syncImportMatch && !syncImportMatch[1].includes('pullInvoicesOnce')) {
        pageCode = pageCode.replace(
          syncImportMatch[0],
          `import { ${syncImportMatch[1].trim()}, pullInvoicesOnce } from '@/lib/syncService'`
        );
      }
    }
    
    totalChanges++;
    console.log('✅ Updated invoice-list page imports');
    fs.writeFileSync(invPagePath, pageCode, 'utf8');
  }
}

console.log(`\n🎉 Total ${totalChanges} fixes applied!`);
console.log('🔄 App restart: Ctrl+C → npm run dev');
console.log('\n📌 ඊළඟ පියවර:');
console.log('   1. App restart කරන්න');
console.log('   2. Invoice List page එකට යන්න');
console.log('   3. Console එකේ "📋 Dexie invoices:" message එක බලන්න');
console.log('   4. 0 නම්, internet ලැබුණම sync වෙනවා');