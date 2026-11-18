const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, 'app', '(dashboard)', 'pos', 'page.jsx');
let code = fs.readFileSync(p, 'utf8');

// Fix 1: Restore broken import line
code = code.replace(
  "import { goOfflineMode().catch(() => {});\n    startAutoSync, forceSyncAndBackup, purgeOtherUsers } from '@/lib/syncService';",
  "import { startAutoSync, forceSyncAndBackup, purgeOtherUsers } from '@/lib/syncService';"
);

// Fix 2: Remove duplicate goOfflineMode import (keep only one)
const goOfflineImports = code.match(/import\s*\{[^}]*goOfflineMode[^}]*\}\s*from\s*['"][^'"]+['"];?\s*/g);
if (goOfflineImports && goOfflineImports.length > 1) {
  for (let i = 1; i < goOfflineImports.length; i++) {
    code = code.replace(goOfflineImports[i], '');
  }
}

// Fix 3: Ensure goOfflineMode import exists (from firebase-config)
if (!code.includes('goOfflineMode')) {
  code = code.replace(
    "import { startAutoSync, forceSyncAndBackup, purgeOtherUsers } from '@/lib/syncService';",
    "import { startAutoSync, forceSyncAndBackup, purgeOtherUsers } from '@/lib/syncService';\nimport { goOfflineMode } from '@/firebase-config';"
  );
}

// Fix 4: Ensure goOfflineMode is called inside useEffect, NOT in imports
if (code.includes('goOfflineMode') && !code.includes('goOfflineMode()')) {
  // Find the useEffect that calls startAutoSync and add goOfflineMode before it
  code = code.replace(
    /(\bstartAutoSync\b)/,
    'goOfflineMode().catch(() => {});\n    $1'
  );
}

fs.writeFileSync(p, code, 'utf8');
console.log('OK - POS page.jsx syntax fixed');

// Verify
const lines = code.split('\n');
console.log('\n--- First 15 lines ---');
lines.slice(0, 15).forEach((l, i) => console.log('L' + (i+1) + ': ' + l.substring(0, 120)));

console.log('\n--- Lines with goOfflineMode ---');
lines.forEach((l, i) => {
  if (l.includes('goOfflineMode')) console.log('L' + (i+1) + ': ' + l.trim().substring(0, 120));
});