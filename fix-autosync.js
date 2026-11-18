const fs = require('fs');
const path = 'C:/Users/chandana/StudioProjects/weerakkodi_pos_app/lib/syncService.js';
let code = fs.readFileSync(path, 'utf8');
let changes = 0;

// 1. Fix stopMirror to use _mirrorUnsubs
if (code.includes('mirrorUnsubs.forEach') && !code.includes('_mirrorUnsubs.forEach((u)')) {
  code = code.replace(
    'mirrorUnsubs.forEach((u) => { try { u(); } catch {} });\n  mirrorUnsubs = [];',
    '_mirrorUnsubs.forEach((u) => { try { u(); } catch {} });\n  _mirrorUnsubs = [];'
  );
  changes++;
  console.log('1. Fixed stopMirror: mirrorUnsubs -> _mirrorUnsubs');
}

// 2. Add module-level tracking for autoSync cleanup
const autoSyncVars = `
// Hot-reload safe: track autoSync resources
let _autoSyncTimer = null;
let _autoSyncOnlineHandler = null;
let _autoSyncAuthUnsub = null;

function cleanupAutoSync() {
  if (_autoSyncTimer) { clearInterval(_autoSyncTimer); _autoSyncTimer = null; }
  if (_autoSyncOnlineHandler) { window.removeEventListener('online', _autoSyncOnlineHandler); _autoSyncOnlineHandler = null; }
  if (_autoSyncAuthUnsub) { try { _autoSyncAuthUnsub(); } catch {} _autoSyncAuthUnsub = null; }
  cleanupMirror();
  console.log('🧹 AutoSync fully cleaned up');
}
`;

if (!code.includes('cleanupAutoSync')) {
  // Insert before startAutoSync
  code = code.replace(
    'export function startAutoSync() {',
    autoSyncVars + '\nexport function startAutoSync() {'
  );
  changes++;
  console.log('2. Added cleanupAutoSync function');
}

// 3. Add cleanup call at start of startAutoSync
if (code.includes('if (autoSyncActive) {') && !code.includes('cleanupAutoSync();')) {
  code = code.replace(
    "if (autoSyncActive) {\n    console.log('[Sync] Auto-Sync already active, re-initializing...');\n  }",
    "cleanupAutoSync(); // Clean up from previous hot-reload\n  if (autoSyncActive) {\n    console.log('[Sync] Auto-Sync re-initializing after cleanup...');\n  }"
  );
  changes++;
  console.log('3. Added cleanupAutoSync() at start of startAutoSync');
}

// 4. Track the online handler
if (code.includes("window.addEventListener('online', onOnline)") && !code.includes('_autoSyncOnlineHandler = onOnline')) {
  code = code.replace(
    "window.addEventListener('online', onOnline);",
    "_autoSyncOnlineHandler = onOnline;\n  window.addEventListener('online', onOnline);"
  );
  changes++;
  console.log('4. Tracking online handler for cleanup');
}

// 5. Track the interval timer
if (code.includes('const timer = setInterval') && !code.includes('_autoSyncTimer = timer')) {
  code = code.replace(
    'const timer = setInterval',
    'const timer = _autoSyncTimer = setInterval'
  );
  changes++;
  console.log('5. Tracking interval timer for cleanup');
}

// 6. Track the auth listener
if (code.includes('const unsubAuth = onAuthStateChanged') && !code.includes('_autoSyncAuthUnsub')) {
  code = code.replace(
    'const unsubAuth = onAuthStateChanged',
    'const unsubAuth = _autoSyncAuthUnsub = onAuthStateChanged'
  );
  changes++;
  console.log('6. Tracking auth listener for cleanup');
}

// 7. Add cleanupMirror to onOnline handler
if (code.includes('retryCount = 0; clearTimeout(retryTimer); clearQuotaBlock();') && 
    !code.includes('cleanupMirror()')) {
  code = code.replace(
    'retryCount = 0; clearTimeout(retryTimer); clearQuotaBlock();',
    'retryCount = 0; clearTimeout(retryTimer); clearQuotaBlock(); cleanupMirror();'
  );
  changes++;
  console.log('7. Added cleanupMirror to onOnline handler');
}

fs.writeFileSync(path, code, 'utf8');
console.log(`\nDone! ${changes} changes applied.`);
