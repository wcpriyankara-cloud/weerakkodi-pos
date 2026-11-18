const fs = require('fs');
const path = require('path');

let totalChanges = 0;

// ============================================
// 1. syncService.js - Add missing named exports
// ============================================
const syncPath = path.join(__dirname, 'lib', 'syncService.js');
let syncCode = fs.readFileSync(syncPath, 'utf8');

// Add export to syncAll
if (syncCode.includes('async function syncAll(uid)') && !syncCode.includes('export async function syncAll')) {
  syncCode = syncCode.replace(
    'async function syncAll(uid)',
    'export async function syncAll(uid)'
  );
  totalChanges++;
  console.log('✅ Added export to syncAll');
}

// Add export to syncCustomers if missing
if (syncCode.includes('async function syncCustomers(uid)') && !syncCode.includes('export async function syncCustomers')) {
  syncCode = syncCode.replace(
    'async function syncCustomers(uid)',
    'export async function syncCustomers(uid)'
  );
  totalChanges++;
  console.log('✅ Added export to syncCustomers');
}

// Add export to startMirror if missing
if (syncCode.includes('async function startMirror(uid)') && !syncCode.includes('export async function startMirror')) {
  syncCode = syncCode.replace(
    'async function startMirror(uid)',
    'export async function startMirror(uid)'
  );
  totalChanges++;
}

fs.writeFileSync(syncPath, syncCode, 'utf8');

// ============================================
// 2. POSInvoice.jsx - Check and fix syncAll import
// ============================================
const posPath = path.join(__dirname, 'components', 'POSInvoice.jsx');
if (fs.existsSync(posPath)) {
  let posCode = fs.readFileSync(posPath, 'utf8');
  
  // Check what's imported from syncService
  const importMatch = posCode.match(/import\s*\{([^}]+)\}\s*from\s*['"]@\/lib\/syncService['"]/);
  if (importMatch) {
    console.log('🔍 POSInvoice.jsx imports from syncService:', importMatch[1].trim());
  }
  
  // Check if syncAll is actually used
  const syncAllUsages = (posCode.match(/syncAll/g) || []).length;
  console.log('🔍 syncAll usages in POSInvoice.jsx:', syncAllUsages);
  
  // If syncAll is imported but not really used, remove it from import
  if (importMatch && importMatch[1].includes('syncAll')) {
    // Check if it's called anywhere (not just in import)
    const callPattern = /(?<!import\s*\{[^}]*)\bsyncAll\s*\(/g;
    const calls = posCode.match(callPattern);
    if (!calls || calls.length === 0) {
      // syncAll imported but never called - remove from import
      const newImports = importMatch[1]
        .split(',')
        .map(s => s.trim())
        .filter(s => s && s !== 'syncAll')
        .join(', ');
      posCode = posCode.replace(
        importMatch[0],
        `import { ${newImports} } from '@/lib/syncService'`
      );
      totalChanges++;
      console.log('✅ Removed unused syncAll import from POSInvoice.jsx');
    }
  }
  
  fs.writeFileSync(posPath, posCode, 'utf8');
}

// ============================================
// 3. InvoiceList.jsx - Fix to load from Dexie
// ============================================
const invPath = path.join(__dirname, 'components', 'InvoiceList.jsx');
if (fs.existsSync(invPath)) {
  let invCode = fs.readFileSync(invPath, 'utf8');
  
  // Check how invoices are loaded
  const hasFirestoreQuery = invCode.includes('collection(db') || invCode.includes('getDocs');
  const hasDexieQuery = invCode.includes('localDb.invoices');
  
  console.log('🔍 InvoiceList.jsx:');
  console.log('   Firestore query:', hasFirestoreQuery);
  console.log('   Dexie query:', hasDexieQuery);
  
  if (hasFirestoreQuery && !hasDexieQuery) {
    console.log('⚠️ InvoiceList uses Firestore only - needs Dexie fallback for offline');
    
    // Check if localDb is imported
    if (!invCode.includes('localDb')) {
      // Add localDb import
      const lastImport = invCode.lastIndexOf('import ');
      const endOfLine = invCode.indexOf('\n', lastImport);
      invCode = invCode.slice(0, endOfLine + 1) + 
        "import { localDb } from '@/lib/localDb';\n" + 
        invCode.slice(endOfLine + 1);
      totalChanges++;
      console.log('✅ Added localDb import to InvoiceList.jsx');
    }
    
    // Find the main data loading useEffect and add Dexie fallback
    // Look for pattern where invoices are fetched
    const getDocsPattern = /const\s+(?:snap|snapshot|querySnapshot)\s*=\s*await\s+getDocs\(/;
    if (getDocsPattern.test(invCode)) {
      // Wrap the Firestore call with try-catch and Dexie fallback
      // This is complex - let's add a simpler fix: add a Dexie load before the Firestore call
      if (!invCode.includes('OFFLINE INVOICE LOAD')) {
        // Find the function that loads invoices and add Dexie pre-load
        const loadFuncPattern = /(async\s+function\s+\w*[Ll]oad\w*[Ii]nvoice\w*\s*\([^)]*\)\s*\{|const\s+\w*[Ll]oad\w*[Ii]nvoice\w*\s*=\s*async\s*\([^)]*\)\s*=>\s*\{)/;
        if (loadFuncPattern.test(invCode)) {
          invCode = invCode.replace(loadFuncPattern, (match) => {
            return match + `
  // 🔌 OFFLINE INVOICE LOAD - Dexie fallback
  try {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const uid = auth?.currentUser?.uid;
      if (uid && localDb?.invoices) {
        const localInvoices = await localDb.invoices.where('uid').equals(uid).toArray();
        if (localInvoices.length > 0) {
          console.log('📋 Loaded ' + localInvoices.length + ' invoices from Dexie (offline)');
          setInvoices(localInvoices);
          setLoading(false);
          return;
        }
      }
    }
  } catch(e) { console.log('Dexie invoice load error:', e?.message); }`;
          });
          totalChanges++;
          console.log('✅ Added Dexie offline fallback to InvoiceList.jsx');
        }
      }
    }
    
    fs.writeFileSync(invPath, invCode, 'utf8');
  } else if (hasDexieQuery) {
    console.log('✅ InvoiceList already uses Dexie');
  }
} else {
  console.log('⚠️ InvoiceList.jsx not found at', invPath);
  
  // Check alternative paths
  const altPath = path.join(__dirname, 'app', '(dashboard)', 'invoice-list', 'page.jsx');
  if (fs.existsSync(altPath)) {
    console.log('🔍 Found invoice-list at:', altPath);
  }
}

// ============================================
// 4. Check invoice-list page.jsx
// ============================================
const invPagePath = path.join(__dirname, 'app', '(dashboard)', 'invoice-list', 'page.jsx');
if (fs.existsSync(invPagePath)) {
  let invPageCode = fs.readFileSync(invPagePath, 'utf8');
  const hasLocalDb = invPageCode.includes('localDb');
  const hasFirestore = invPageCode.includes('getDocs') || invPageCode.includes('collection(');
  console.log('🔍 invoice-list/page.jsx: Dexie=' + hasLocalDb + ', Firestore=' + hasFirestore);
}

console.log(`\n🎉 Total ${totalChanges} fixes applied!`);
console.log('🔄 App restart: Ctrl+C → npm run dev');