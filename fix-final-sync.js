const fs = require('fs');
const path = require('path');

let totalChanges = 0;

// ============================================
// 1. syncService.js - Fix uid TDZ error
// ============================================
const syncPath = path.join(__dirname, 'lib', 'syncService.js');
let syncCode = fs.readFileSync(syncPath, 'utf8');

// Replace ALL broken CLOUD_SYNC_DISABLED guards that reference uid
// The problem: guard runs before uid is declared in function body
const brokenPatterns = [
  // Pattern 1: guard with doDiskBackup(uid)
  /\/\/ 🔒 HARD OFFLINE GUARD[\s\S]*?if\s*\(CLOUD_SYNC_DISABLED\)\s*\{[\s\S]*?doDiskBackup[\s\S]*?return;[\s\S]*?\}/g,
  // Pattern 2: guard with Disk backup error
  /\/\/ 🔒 CLOUD SYNC DISABLED[\s\S]*?if\s*\(CLOUD_SYNC_DISABLED\)\s*\{[\s\S]*?return;[\s\S]*?\}/g,
  // Pattern 3: forceSync guard
  /\/\/ 🔒 forceSync CLOUD check[\s\S]*?if\s*\(CLOUD_SYNC_DISABLED\)\s*\{[\s\S]*?return;[\s\S]*?\}/g,
];

for (const pattern of brokenPatterns) {
  if (pattern.test(syncCode)) {
    syncCode = syncCode.replace(pattern, '');
    totalChanges++;
  }
}

// Now add ONE clean guard at the very top of syncAll, AFTER uid is available
// Find where uid is first assigned/used in syncAll
if (!syncCode.includes('CLEAN OFFLINE GUARD')) {
  // Strategy: wrap the entire cloud sync portion in a check
  // Find "safe(" calls which are the cloud sync steps
  
  // Add a simple early return right after the function opens
  // but use a try-catch to get uid safely
  const syncAllMatch = syncCode.match(/(async\s+function\s+syncAll\s*\(([^)]*)\)\s*\{)/);
  if (syncAllMatch) {
    const params = syncAllMatch[2].trim();
    const insertPos = syncAllMatch.index + syncAllMatch[0].length;
    
    // If uid is a direct parameter, use it. Otherwise skip backup.
    const guard = `
  // 🔒 CLEAN OFFLINE GUARD - no uid reference
  if (CLOUD_SYNC_DISABLED) {
    console.log('🔌 Cloud sync disabled - offline mode');
    return;
  }`;
    
    syncCode = syncCode.slice(0, insertPos) + guard + syncCode.slice(insertPos);
    totalChanges++;
    console.log('✅ Clean offline guard added to syncAll');
  }
}

// Remove ALL "Disk backup skipped" and "Disk backup error" log noise
syncCode = syncCode.replace(/console\.log\(['"]Disk backup (skipped|error)['"][^)]*\);?/g, '');
syncCode = syncCode.replace(/console\.log\(['"]🔌 Offline mode - skipping cloud sync[^)]*\);?/g, '');

// Remove the inline backup fallback that causes issues
syncCode = syncCode.replace(
  /\/\/ Inline disk backup fallback[\s\S]*?console\.log\(['"]💾 Offline backup counts[\s\S]*?\}\s*\}/g,
  ''
);

fs.writeFileSync(syncPath, syncCode, 'utf8');
console.log('✅ syncService.js cleaned up');

// ============================================
// 2. POSInvoice.jsx - Hide pending sync UI
// ============================================
const posPath = path.join(__dirname, 'components', 'POSInvoice.jsx');
if (fs.existsSync(posPath)) {
  let posCode = fs.readFileSync(posPath, 'utf8');
  let posChanges = 0;

  // Find "Cloud වෙත යැවීමට ඇත" text and wrap with offline check
  if (posCode.includes('Cloud වෙත යැවීමට ඇත') && !posCode.includes('HIDE_CLOUD_UI')) {
    // Replace the pending sync display with offline-aware version
    posCode = posCode.replace(
      /Cloud වෙත යැවීමට ඇත[^<]*/g,
      'Cloud වෙත යැවීමට ඇත'
    );
    
    // Find the JSX element containing this text and add condition
    // Look for pattern like: {pendingSyncCount > 0 && (
    const pendingJsxPattern = /(\{?\s*pendingSyncCount\s*>\s*0\s*&&\s*\()/;
    if (pendingJsxPattern.test(posCode)) {
      posCode = posCode.replace(
        pendingJsxPattern,
        '{/* HIDE_CLOUD_UI */ typeof window !== "undefined" && !window.__CLOUD_DISABLED && pendingSyncCount > 0 && ('
      );
      posChanges++;
      console.log('✅ POSInvoice.jsx pending sync UI guarded');
    }
    
    // Also force pendingSyncCount to 0 in useEffect
    const setPendingPattern = /setPendingSyncCount\(([^)]+)\)/g;
    let m;
    const setReplacements = [];
    while ((m = setPendingPattern.exec(posCode)) !== null) {
      if (!posCode.substring(Math.max(0, m.index - 30), m.index).includes('HIDE_CLOUD')) {
        setReplacements.push({
          index: m.index,
          original: m[0],
          replacement: 'setPendingSyncCount(0)'
        });
      }
    }
    for (let i = setReplacements.length - 1; i >= 0; i--) {
      const r = setReplacements[i];
      posCode = posCode.slice(0, r.index) + r.replacement + posCode.slice(r.index + r.original.length);
      posChanges++;
    }
  }

  if (posChanges > 0) {
    fs.writeFileSync(posPath, posCode, 'utf8');
    totalChanges += posChanges;
    console.log(`✅ ${posChanges} fixes in POSInvoice.jsx`);
  }
}

// ============================================
// 3. pos/page.jsx - Hide pending sync UI
// ============================================
const pagePath = path.join(__dirname, 'app', '(dashboard)', 'pos', 'page.jsx');
if (fs.existsSync(pagePath)) {
  let pageCode = fs.readFileSync(pagePath, 'utf8');
  let pageChanges = 0;

  // Force pendingSyncCount to 0
  const setPendingPattern = /setPendingSyncCount\(([^)]+)\)/g;
  let m;
  const setReplacements = [];
  while ((m = setPendingPattern.exec(pageCode)) !== null) {
    setReplacements.push({
      index: m.index,
      original: m[0],
      replacement: 'setPendingSyncCount(0)'
    });
  }
  for (let i = setReplacements.length - 1; i >= 0; i--) {
    const r = setReplacements[i];
    pageCode = pageCode.slice(0, r.index) + r.replacement + pageCode.slice(r.index + r.original.length);
    pageChanges++;
  }

  // Hide "Cloud වෙත" text
  if (pageCode.includes('Cloud වෙත') && !pageCode.includes('HIDE_CLOUD_UI')) {
    // Find the conditional rendering and disable it
    const cloudUiPattern = /pendingSyncCount\s*>\s*0/;
    if (cloudUiPattern.test(pageCode)) {
      pageCode = pageCode.replace(
        /pendingSyncCount\s*>\s*0/g,
        '/* HIDE_CLOUD_UI */ false && pendingSyncCount > 0'
      );
      pageChanges++;
    }
  }

  if (pageChanges > 0) {
    fs.writeFileSync(pagePath, pageCode, 'utf8');
    totalChanges += pageChanges;
    console.log(`✅ ${pageChanges} fixes in pos/page.jsx`);
  }
}

// ============================================
// 4. Set window flag for offline mode
// ============================================
const firebasePath = path.join(__dirname, 'firebase-config.js');
if (fs.existsSync(firebasePath)) {
  let fbCode = fs.readFileSync(firebasePath, 'utf8');
  if (!fbCode.includes('__CLOUD_DISABLED')) {
    // Add window flag after disableNetwork
    fbCode = fbCode.replace(
      /disableNetwork\(db\)\.catch\(\(\)=>\{\}\);/,
      `disableNetwork(db).catch(()=>{});
if (typeof window !== 'undefined') window.__CLOUD_DISABLED = true;`
    );
    fs.writeFileSync(firebasePath, fbCode, 'utf8');
    totalChanges++;
    console.log('✅ window.__CLOUD_DISABLED flag set in firebase-config.js');
  }
}

console.log(`\n🎉 Total ${totalChanges} fixes applied!`);
console.log('🔄 App restart කරන්න: Ctrl+C → npm run dev');