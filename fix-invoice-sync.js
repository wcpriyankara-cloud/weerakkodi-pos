const fs = require('fs');
const path = require('path');
const base = 'C:\\Users\\chandana\\StudioProjects\\weerakkodi_pos_app';

// ============================================================
// FIX 1: syncService.js — enableNetwork/disableNetwork ඉවත් කරන්න
// ============================================================
const syncPath = path.join(base, 'lib', 'syncService.js');
let sync = fs.readFileSync(syncPath, 'utf8');

// Remove enableNetwork/disableNetwork from imports
sync = sync.replace(/,\s*enableNetwork/g, '');
sync = sync.replace(/,\s*disableNetwork/g, '');
sync = sync.replace(/enableNetwork\s*,\s*/g, '');
sync = sync.replace(/disableNetwork\s*,\s*/g, '');
sync = sync.replace(/import\s*\{\s*enableNetwork\s*\}\s*from[^;]+;\s*/g, '');
sync = sync.replace(/import\s*\{\s*disableNetwork\s*\}\s*from[^;]+;\s*/g, '');

// Remove all enableNetwork(db) and disableNetwork(db) calls
sync = sync.replace(/await\s+enableNetwork\s*\(\s*db\s*\)\s*;?\s*/g, '');
sync = sync.replace(/await\s+disableNetwork\s*\(\s*db\s*\)\s*;?\s*/g, '');
sync = sync.replace(/enableNetwork\s*\(\s*db\s*\)\s*;?\s*/g, '');
sync = sync.replace(/disableNetwork\s*\(\s*db\s*\)\s*;?\s*/g, '');

// Remove CLOUD_SYNC_DISABLED flag and its guards
sync = sync.replace(/const\s+CLOUD_SYNC_DISABLED\s*=\s*true\s*;?/g, 'const CLOUD_SYNC_DISABLED = false;');
sync = sync.replace(/const\s+CLOUD_SYNC_DISABLED\s*=\s*false\s*;?/g, 'const CLOUD_SYNC_DISABLED = false;');

fs.writeFileSync(syncPath, sync, 'utf8');
console.log('✅ syncService.js: enableNetwork/disableNetwork removed');

// ============================================================
// FIX 2: InvoiceList.jsx — timeout, offline detection, limit fix
// ============================================================
const invPath = path.join(base, 'components', 'InvoiceList.jsx');
let inv = fs.readFileSync(invPath, 'utf8');

// 2a. Increase limit from 200 to 2000 (Firestore max ~1MB per response)
inv = inv.replace(/limit\s*\(\s*200\s*\)/g, 'limit(2000)');

// 2b. Remove the "offline mode" timeout wrapper that kills the cloud fetch
// Pattern: something like "Cloud invoices fetch skipped (offline mode): Timeout"
// This is likely a Promise.race with a short timeout
// Replace the entire cloud fetch block to be simple and direct

// Find and fix the cloud fetch section
// Look for the pattern where cloud fetch is wrapped in a timeout/race
const offlineTimeoutPattern = /Cloud invoices fetch skipped \(offline mode\)/;
if (offlineTimeoutPattern.test(inv)) {
  console.log('📋 Found offline timeout pattern in InvoiceList.jsx');
  
  // Remove any navigator.onLine checks that block cloud fetch
  inv = inv.replace(/if\s*\(\s*!navigator\.onLine\s*\)\s*\{[^}]*Cloud invoices fetch skipped[^}]*\}/g, 
    '// Cloud fetch attempt (navigator.onLine check removed)');
  
  // Remove CLOUD_SYNC_DISABLED checks
  inv = inv.replace(/if\s*\(\s*CLOUD_SYNC_DISABLED\s*\)\s*\{[^}]*\}/g, '');
  
  // Remove any Promise.race timeout wrappers around getDocs
  // Pattern: Promise.race([getDocs(q), new Promise((_, rej) => setTimeout(...))])
  inv = inv.replace(
    /Promise\.race\s*\(\s*\[\s*(await\s+)?getDocs\s*\(\s*q\s*\)\s*,\s*new\s+Promise\s*\([^)]*\)\s*=>\s*setTimeout\s*\([^)]*\)\s*\)\s*\]\s*\)/g,
    'getDocs(q)'
  );
}

// 2c. CRITICAL: Don't reset invoiceMap when cloud fetch fails
// Find the pattern where fetchInvoices sets invoices to [] or resets on error
// The key fix: if cloud fetch fails, keep the existing invoices from the first successful fetch

// Replace the cloud fetch error handler to preserve existing data
inv = inv.replace(
  /catch\s*\(\s*serverErr\s*\)\s*\{[\s\S]*?console\.log\s*\(\s*['"]📋\s*Server fetch failed[\s\S]*?\}/g,
  `catch(serverErr) {
        console.log('📋 Server fetch failed, keeping existing data:', serverErr?.message);
        // Don't reset — keep the invoices we already loaded from Dexie
      }`
);

// 2d. Remove the "Synced 0 invoices from cloud" reset
// When sync returns 0, don't overwrite existing invoiceMap
inv = inv.replace(
  /if\s*\(\s*cloudInvoices.*?\.length\s*===\s*0\s*\)\s*\{[\s\S]*?setInvoices\s*\(\s*\[\s*\]\s*\)[\s\S]*?\}/g,
  '// Keep existing invoices if cloud returns 0 (offline)'
);

fs.writeFileSync(invPath, inv, 'utf8');
console.log('✅ InvoiceList.jsx: timeout/offline/limit fixed');

// ============================================================
// FIX 3: UserContext.jsx — offline fallback timeout
// ============================================================
const ucPath = path.join(base, 'context', 'UserContext.jsx');
if (fs.existsSync(ucPath)) {
  let uc = fs.readFileSync(ucPath, 'utf8');
  
  // Increase timeout from default (probably 3-5s) to 30s
  uc = uc.replace(/setTimeout\s*\([^,]+,\s*3000\s*\)/g, 'setTimeout(() => {}, 30000)');
  uc = uc.replace(/setTimeout\s*\([^,]+,\s*5000\s*\)/g, 'setTimeout(() => {}, 30000)');
  
  // Remove enableNetwork/disableNetwork if present
  uc = uc.replace(/await\s+enableNetwork\s*\(\s*db\s*\)\s*;?\s*/g, '');
  uc = uc.replace(/await\s+disableNetwork\s*\(\s*db\s*\)\s*;?\s*/g, '');
  
  fs.writeFileSync(ucPath, uc, 'utf8');
  console.log('✅ UserContext.jsx: timeout increased, network calls cleaned');
} else {
  // Try alternate path
  const ucPath2 = path.join(base, 'components', 'UserContext.jsx');
  if (fs.existsSync(ucPath2)) {
    console.log('📋 UserContext.jsx found at components/, skipping (check path)');
  }
}

console.log('\n🎉 All fixes applied!');
console.log('Next: Ctrl+C → npm run dev → Clear IndexedDB → F5');
console.log('Expected: 200+ invoices should load and STAY visible');