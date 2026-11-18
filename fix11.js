const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, 'app', '(dashboard)', 'pos', 'page.jsx');
let code = fs.readFileSync(p, 'utf8');
let lines = code.split('\n');

// Find and fix the broken lines
let newLines = [];
let skipNext = false;

for (let i = 0; i < lines.length; i++) {
  if (skipNext) { skipNext = false; continue; }
  
  const l = lines[i];
  
  // Fix broken import line 7-8
  if (l.includes('import { goOfflineMode().catch')) {
    // Replace this line AND the next line with correct import
    newLines.push("import { startAutoSync, forceSyncAndBackup, purgeOtherUsers } from '@/lib/syncService';");
    skipNext = true; // skip the continuation line
    continue;
  }
  
  // Remove duplicate goOfflineMode import (keep the one from firebase-config)
  if (l.includes("goOfflineMode") && l.includes("firebase-config")) {
    // Keep this one - it's correct
    newLines.push(l);
    continue;
  }
  
  newLines.push(l);
}

// Now find startAutoSync call inside useEffect and add goOfflineMode before it
let finalLines = [];
for (let i = 0; i < newLines.length; i++) {
  const l = newLines[i];
  if (l.trim().startsWith('startAutoSync') && !l.includes('import')) {
    finalLines.push(l.replace('startAutoSync', 'goOfflineMode().catch(() => {});\n    startAutoSync'));
  } else {
    finalLines.push(l);
  }
}

code = finalLines.join('\n');
fs.writeFileSync(p, code, 'utf8');
console.log('OK - POS page.jsx fixed');

// Verify
const vLines = code.split('\n');
console.log('\n--- First 15 lines ---');
vLines.slice(0, 15).forEach((l, i) => console.log('L' + (i+1) + ': ' + l.substring(0, 120)));

console.log('\n--- Lines with goOfflineMode ---');
vLines.forEach((l, i) => {
  if (l.includes('goOfflineMode')) console.log('L' + (i+1) + ': ' + l.trim().substring(0, 120));
});