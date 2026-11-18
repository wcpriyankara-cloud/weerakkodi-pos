const fs = require('fs');
const path = require('path');

// ============================================
// 1. Check InvoiceList.jsx data loading logic
// ============================================
const invPath = path.join(__dirname, 'components', 'InvoiceList.jsx');
const invCode = fs.readFileSync(invPath, 'utf8');
const lines = invCode.split('\n');

console.log('🔍 InvoiceList.jsx data loading lines:');
lines.forEach((line, i) => {
  const lower = line.toLowerCase();
  if ((lower.includes('invoice') || lower.includes('localdb') || lower.includes('getdocs') || lower.includes('setinvoice')) &&
      (lower.includes('load') || lower.includes('fetch') || lower.includes('get') || lower.includes('set') || lower.includes('query') || lower.includes('where') || lower.includes('array'))) {
    console.log(`  L${i+1}: ${line.trim()}`);
  }
});

// Show the main useEffect
console.log('\n🔍 useEffect blocks:');
let inUseEffect = false;
let useEffectStart = 0;
lines.forEach((line, i) => {
  if (line.includes('useEffect(')) {
    inUseEffect = true;
    useEffectStart = i;
    console.log(`  L${i+1}: ${line.trim()}`);
  }
  if (inUseEffect && i > useEffectStart && i < useEffectStart + 30) {
    console.log(`  L${i+1}: ${line.trim()}`);
  }
  if (inUseEffect && line.includes('}, [') && i > useEffectStart + 2) {
    inUseEffect = false;
  }
});

// ============================================
// 2. Check if InvoiceList loads from Dexie correctly
// ============================================
// Look for the pattern: localDb.invoices.where('uid').equals(uid).toArray()
const dexieQueryPattern = /localDb\.invoices\.where\(['"]uid['"]\)\.equals\(/;
const hasDexieQuery = dexieQueryPattern.test(invCode);
console.log('\n🔍 Dexie UID query:', hasDexieQuery);

// Check if there's a Firestore fallback that overwrites Dexie data
const firestoreOverwrite = invCode.includes('setInvoices([])') || 
                           (invCode.includes('getDocs') && invCode.includes('setInvoices'));
console.log('🔍 Firestore may overwrite Dexie:', firestoreOverwrite);

// ============================================
// 3. Fix: Ensure Dexie-first with no Firestore overwrite
// ============================================
let fixed = false;

// If Firestore getDocs is called and fails, it might setInvoices([]) 
// which overwrites any Dexie data
if (firestoreOverwrite && hasDexieQuery) {
  // Find the pattern where Firestore result overwrites invoices
  // and add a guard: only overwrite if Firestore returned data
  const overwritePattern = /const\s+docs\s*=\s*snap(?:shot)?\.docs\.map\([^)]+\);[\s\n]*setInvoices\(docs\)/;
  if (overwritePattern.test(invCode)) {
    invCode = invCode.replace(overwritePattern, (match) => {
      return match.replace('setInvoices(docs)', 
        'if (docs.length > 0) setInvoices(docs); else console.log("📋 Firestore returned 0 docs, keeping Dexie data")');
    });
    fixed = true;
    console.log('✅ Fixed Firestore overwrite guard');
  }
  
  // Also check for catch block that sets empty
  const catchEmptyPattern = /catch\s*\([^)]*\)\s*\{[\s\S]*?setInvoices\(\[\]\)/;
  if (catchEmptyPattern.test(invCode)) {
    invCode = invCode.replace(/catch\s*\(([^)]*)\)\s*\{([\s\S]*?)setInvoices\(\[\]\)/g, 
      (match, err, body) => {
        return `catch (${err}) {${body}console.log('📋 Firestore error, keeping Dexie data')`;
      });
    fixed = true;
    console.log('✅ Fixed catch block empty overwrite');
  }
}

// ============================================
// 4. Add auto-pull when online
// ============================================
const syncPath = path.join(__dirname, 'lib', 'syncService.js');
let syncCode = fs.readFileSync(syncPath, 'utf8');

// Add pullInvoicesOnce if not exists
if (!syncCode.includes('pullInvoicesOnce')) {
  const pullFunc = `
// 🔌 Pull invoices from Firestore to Dexie (one-time, needs internet)
export async function pullInvoicesOnce(uid) {
  if (!uid || !db) return 0;
  try {
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
    console.log('📋 Invoice pull error (offline?):', e?.message);
    try { await disableNetwork(db); } catch(x) {}
    return 0;
  }
}
`;
  const exportIdx = syncCode.lastIndexOf('export default');
  if (exportIdx !== -1) {
    syncCode = syncCode.slice(0, exportIdx) + pullFunc + '\n' + syncCode.slice(exportIdx);
    syncCode = syncCode.replace('clearAllUserData,\n};', 'clearAllUserData,\n  pullInvoicesOnce,\n};');
    fs.writeFileSync(syncPath, syncCode, 'utf8');
    console.log('✅ Added pullInvoicesOnce to syncService.js');
  }
}

// ============================================
// 5. Add auto-pull to startAutoSync online handler
// ============================================
if (syncCode.includes('Online detected') && !syncCode.includes('pullInvoicesOnce')) {
  syncCode = syncCode.replace(
    /console\.log\(['"]🌐 Online detected[^)]*\);/g,
    `console.log('🌐 Online detected, pulling invoices...');
      try { await pullInvoicesOnce(uid); } catch(e) {}`
  );
  fs.writeFileSync(syncPath, syncCode, 'utf8');
  console.log('✅ Added auto-pull on online event');
}

if (fixed) {
  fs.writeFileSync(invPath, invCode, 'utf8');
}

console.log('\n🔄 App restart: Ctrl+C → npm run dev');
console.log('\n📌 ඊළඟ පියවර:');
console.log('   1. App restart කරන්න');
console.log('   2. Invoice List page එකට යන්න');
console.log('   3. Console එකේ "📋 Dexie invoices: X" message එක බලන්න');
console.log('   4. X = 0 නම්, PC එකට internet ලැබුණම auto-pull වෙනවා');