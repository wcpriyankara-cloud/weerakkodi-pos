const fs = require('fs');
const path = require('path');

// ===== Fix 1: lib/firebase.js - add disableNetwork =====
const fbPath = path.join(__dirname, 'lib', 'firebase.js');
let fb = fs.readFileSync(fbPath, 'utf8');

if (!fb.includes('disableNetwork')) {
  // Add disableNetwork import
  fb = fb.replace(
    "import { getFirestore } from 'firebase/firestore';",
    "import { getFirestore, disableNetwork } from 'firebase/firestore';"
  );
  
  // Add disableNetwork call after db creation
  fb = fb.replace(
    "export const db = getFirestore(app);",
    `export const db = getFirestore(app);

// Offline PC - disable network immediately
if (typeof window !== 'undefined') {
  disableNetwork(db).catch(() => {});
}`
  );
  
  fs.writeFileSync(fbPath, fb, 'utf8');
  console.log('OK - lib/firebase.js: disableNetwork added');
} else {
  console.log('SKIP - lib/firebase.js already has disableNetwork');
}

// ===== Fix 2: firebase-config.js - remove online/offline handler =====
const cfgPath = path.join(__dirname, 'firebase-config.js');
let cfg = fs.readFileSync(cfgPath, 'utf8');

// Remove the navigator.onLine handler that re-enables network
const onlineHandlerRegex = /if\s*\(typeof\s+window\s*!==\s*["']undefined["']\)\s*\{[\s\S]*?window\.addEventListener\(["']offline["'],\s*handleNetworkChange\);\s*\}/;

if (onlineHandlerRegex.test(cfg)) {
  cfg = cfg.replace(onlineHandlerRegex, `// Offline PC - network handler disabled to prevent resource-exhausted
// Original online/offline handler removed`);
  fs.writeFileSync(cfgPath, cfg, 'utf8');
  console.log('OK - firebase-config.js: online/offline handler removed');
} else {
  console.log('SKIP - firebase-config.js: online handler not found or already removed');
}

// ===== Fix 3: syncService.js - ensure no enableNetwork calls =====
const syncPath = path.join(__dirname, 'lib', 'syncService.js');
if (fs.existsSync(syncPath)) {
  let sync = fs.readFileSync(syncPath, 'utf8');
  
  // Comment out any enableNetwork calls
  let changed = false;
  if (sync.includes('enableNetwork(') && !sync.includes('// DISABLED: enableNetwork')) {
    sync = sync.replace(/await\s+enableNetwork\([^)]+\)/g, '/* DISABLED: enableNetwork */ null');
    sync = sync.replace(/enableNetwork\([^)]+\)/g, '/* DISABLED: enableNetwork */ null');
    changed = true;
  }
  
  if (changed) {
    fs.writeFileSync(syncPath, sync, 'utf8');
    console.log('OK - syncService.js: enableNetwork calls disabled');
  } else {
    console.log('SKIP - syncService.js: no active enableNetwork calls');
  }
} else {
  console.log('SKIP - syncService.js not found');
}

console.log('\nDone! Restart app with: npm run electron:dev');