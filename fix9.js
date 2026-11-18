const fs = require('fs');
const path = require('path');

// ===== Fix 1: Add diagnostic log to POSInvoice.jsx =====
const posPath = path.join(__dirname, 'components', 'POSInvoice.jsx');
let pos = fs.readFileSync(posPath, 'utf8');

if (!pos.includes('DIAGNOSTIC: Dexie item count')) {
  pos = pos.replace(
    'setAllItems(items);',
    `setAllItems(items);
      console.log('DIAGNOSTIC: Dexie item count =', items.length, '| customer count =', custs.length, '| uid =', uid);
      if (items.length === 0) {
        const allItemsNoUid = await localDb.items.toArray().catch(() => []);
        console.log('DIAGNOSTIC: Total items in Dexie (any uid) =', allItemsNoUid.length);
        if (allItemsNoUid.length > 0) {
          console.log('DIAGNOSTIC: First item uid =', allItemsNoUid[0].uid, '| expected uid =', uid);
        }
      }`
  );
  fs.writeFileSync(posPath, pos, 'utf8');
  console.log('OK - POSInvoice.jsx: diagnostic log added');
} else {
  console.log('SKIP - diagnostic already exists');
}

// ===== Fix 2: Suppress Firestore resource-exhausted in firebase-config.js =====
const cfgPath = path.join(__dirname, 'firebase-config.js');
let cfg = fs.readFileSync(cfgPath, 'utf8');

if (!cfg.includes('Suppress Firestore quota errors')) {
  const suppressCode = `
// Suppress Firestore quota errors (offline PC - Blaze plan)
if (typeof window !== 'undefined') {
  const origConsoleError = console.error;
  console.error = function(...args) {
    const msg = args.map(a => String(a)).join(' ');
    if (msg.includes('resource-exhausted') || msg.includes('Quota exceeded') || msg.includes('maximum backoff')) return;
    return origConsoleError.apply(console, args);
  };
}
`;
  // Add after setLogLevel
  if (cfg.includes('setLogLevel("silent")')) {
    cfg = cfg.replace('setLogLevel("silent");', 'setLogLevel("silent");' + suppressCode);
  } else if (cfg.includes("setLogLevel('silent')")) {
    cfg = cfg.replace("setLogLevel('silent');", "setLogLevel('silent');" + suppressCode);
  } else {
    cfg = suppressCode + '\n' + cfg;
  }
  fs.writeFileSync(cfgPath, cfg, 'utf8');
  console.log('OK - firebase-config.js: Firestore error suppression added');
} else {
  console.log('SKIP - error suppression already exists');
}

// ===== Fix 3: Ensure disableNetwork is awaited in POS page wrapper =====
const posPagePath = path.join(__dirname, 'app', '(dashboard)', 'pos', 'page.jsx');
let posPage = fs.readFileSync(posPagePath, 'utf8');

if (!posPage.includes('goOfflineMode')) {
  // Add import
  if (posPage.includes("from '@/lib/syncService'")) {
    posPage = posPage.replace(
      "import { startAutoSync, forceSyncAndBackup, purgeOtherUsers } from '@/lib/syncService';",
      "import { startAutoSync, forceSyncAndBackup, purgeOtherUsers } from '@/lib/syncService';\nimport { goOfflineMode } from '@/firebase-config';"
    );
  }
  
  // Add goOfflineMode call in first useEffect
  if (posPage.includes('useEffect(() => {') && posPage.includes('startAutoSync')) {
    posPage = posPage.replace(
      'startAutoSync',
      'goOfflineMode().catch(() => {});\n    startAutoSync'
    );
  }
  
  fs.writeFileSync(posPagePath, posPage, 'utf8');
  console.log('OK - POS page: goOfflineMode added');
} else {
  console.log('SKIP - goOfflineMode already in POS page');
}

console.log('\nDone! Restart and check console for DIAGNOSTIC messages.');