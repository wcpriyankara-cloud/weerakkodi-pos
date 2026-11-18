const fs = require('fs');
let ss = fs.readFileSync('lib/syncService.js', 'utf8');
let changes = 0;

// 1. Add enableNetwork, disableNetwork to firestore imports
if (!ss.includes('enableNetwork') || !ss.includes('disableNetwork')) {
  ss = ss.replace(
    'runTransaction, increment, serverTimestamp,',
    'runTransaction, increment, serverTimestamp, enableNetwork, disableNetwork,'
  );
  console.log('  ✅ Added enableNetwork/disableNetwork to imports');
  changes++;
} else {
  console.log('  ⏭️ enableNetwork/disableNetwork already imported');
}

// 2. Wrap pullFromFirestore with enable/disable network
const pullStart = 'if (quotaBlocked()) return;\n    _pullInProgress = true;';
const pullStartNew = `if (quotaBlocked()) return;
    _pullInProgress = true;

    // 🔒 Network enable for pull only
    try { await enableNetwork(db); } catch(e) {}`;

if (ss.includes(pullStart) && !ss.includes('Network enable for pull')) {
  ss = ss.replace(pullStart, pullStartNew);
  console.log('  ✅ enableNetwork added to pullFromFirestore');
  changes++;
} else {
  console.log('  ⏭️ pullFromFirestore already patched or format differs');
}

// Add disableNetwork after pull completes
const pullEnd = 'console.log(`📥 Pull done: ${totalDocs} docs from ${tables.length} collections`);\n    _pullInProgress = false;';
const pullEndNew = `console.log(\`📥 Pull done: \${totalDocs} docs from \${tables.length} collections\`);
    // 🔒 Network disable after pull
    try { await disableNetwork(db); } catch(e) {}
    _pullInProgress = false;`;

if (ss.includes('Pull done:') && !ss.includes('Network disable after pull')) {
  ss = ss.replace(pullEnd, pullEndNew);
  console.log('  ✅ disableNetwork added after pull');
  changes++;
} else {
  console.log('  ⏭️ pull end already patched or format differs');
}

// 3. Wrap syncAll with enable/disable network
// Find syncAll function
const syncAllIdx = ss.indexOf('async function syncAll');
if (syncAllIdx >= 0 && !ss.includes('Network enable for syncAll')) {
  // Find the opening brace
  const braceIdx = ss.indexOf('{', syncAllIdx);
  if (braceIdx >= 0) {
    const insertPos = braceIdx + 1;
    const injection = '\n  // 🔒 Network enable for push sync\n  try { await enableNetwork(db); } catch(e) {}\n';
    ss = ss.slice(0, insertPos) + injection + ss.slice(insertPos);
    console.log('  ✅ enableNetwork added to syncAll');
    changes++;

    // Find the end of syncAll to add disableNetwork
    // Look for the closing of syncAll — find next top-level function
    const nextExport = ss.indexOf('\nexport ', insertPos + 100);
    const nextFunc = ss.indexOf('\nfunction ', insertPos + 100);
    const nextAsync = ss.indexOf('\nasync function ', insertPos + 100);
    let endPos = ss.length;
    [nextExport, nextFunc, nextAsync].forEach(p => {
      if (p > insertPos && p < endPos) endPos = p;
    });

    // Insert disableNetwork before the end
    const disableInjection = '\n  // 🔒 Network disable after push sync\n  try { await disableNetwork(db); } catch(e) {}\n';
    ss = ss.slice(0, endPos) + disableInjection + ss.slice(endPos);
    console.log('  ✅ disableNetwork added at end of syncAll');
    changes++;
  }
} else {
  console.log('  ⏭️ syncAll already patched or not found');
}

fs.writeFileSync('lib/syncService.js', ss, 'utf8');
console.log(`\n✅ syncService.js patched! (${changes} changes)`);

// Verify
const verify = fs.readFileSync('lib/syncService.js', 'utf8');
console.log('\n--- Verification ---');
console.log('enableNetwork in imports:', verify.includes('enableNetwork, disableNetwork,'));
console.log('enableNetwork in pull:', verify.includes('Network enable for pull'));
console.log('disableNetwork after pull:', verify.includes('Network disable after pull'));
console.log('enableNetwork in syncAll:', verify.includes('Network enable for syncAll'));
