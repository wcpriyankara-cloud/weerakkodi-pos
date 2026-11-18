const fs = require('fs');
let ss = fs.readFileSync('lib/syncService.js', 'utf8');
let changes = 0;

// Show syncAll function
const syncAllIdx = ss.indexOf('export async function syncAll()');
if (syncAllIdx >= 0) {
  console.log('=== syncAll function (first 60 lines) ===');
  const lines = ss.slice(syncAllIdx).split('\n');
  for (let i = 0; i < Math.min(60, lines.length); i++) {
    console.log(`${i+1}: ${lines[i]}`);
  }
}

// Fix: patch syncAll with export keyword
if (!ss.includes('Network enable for syncAll')) {
  const target = 'export async function syncAll() {';
  const replacement = `export async function syncAll() {
  // 🔒 Network enable for syncAll push
  try { await enableNetwork(db); } catch(e) {}`;
  
  if (ss.includes(target)) {
    ss = ss.replace(target, replacement);
    console.log('\n  ✅ enableNetwork added to syncAll');
    changes++;
  }
}

// Add disableNetwork at end of syncAll
// Find the closing of syncAll — look for the next export or function after syncAll
if (!ss.includes('Network disable after syncAll')) {
  const syncAllStart = ss.indexOf('export async function syncAll()');
  if (syncAllStart >= 0) {
    // Find next top-level declaration after syncAll
    const afterSyncAll = ss.slice(syncAllStart + 50);
    // Look for patterns like "\nexport " or "\nfunction " or "\nconst " at top level
    const nextDecl = afterSyncAll.search(/\n(?:export |function |const |let |var )/);
    if (nextDecl > 0) {
      const insertPos = syncAllStart + 50 + nextDecl;
      const injection = '\n  // 🔒 Network disable after syncAll\n  try { await disableNetwork(db); } catch(e) {}\n';
      ss = ss.slice(0, insertPos) + injection + ss.slice(insertPos);
      console.log('  ✅ disableNetwork added at end of syncAll');
      changes++;
    } else {
      console.log('  ⚠️ Could not find end of syncAll');
    }
  }
}

if (changes > 0) {
  fs.writeFileSync('lib/syncService.js', ss, 'utf8');
  console.log(`\n✅ syncService.js patched! (${changes} changes)`);
} else {
  console.log('\n⏭️ No changes needed');
}

// Verify
const verify = fs.readFileSync('lib/syncService.js', 'utf8');
console.log('\n--- Final Verification ---');
console.log('enableNetwork in imports:', verify.includes('enableNetwork, disableNetwork,'));
console.log('enableNetwork in pull:', verify.includes('Network enable for pull'));
console.log('disableNetwork after pull:', verify.includes('Network disable after pull'));
console.log('enableNetwork in syncAll:', verify.includes('Network enable for syncAll'));
console.log('disableNetwork after syncAll:', verify.includes('Network disable after syncAll'));
