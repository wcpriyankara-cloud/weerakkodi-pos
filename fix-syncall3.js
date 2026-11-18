const fs = require('fs');
let ss = fs.readFileSync('lib/syncService.js', 'utf8');

// Step 1: Remove ALL floating disableNetwork blocks outside functions
// Pattern: lines between } and function/const/export that contain disableNetwork
ss = ss.replace(/\n\s*\/\/ 🔒 Network disable after (?:push sync|syncAll)\n\s*try \{ await disableNetwork\(db\); \} catch\(e\) \{\}\n/g, '\n');
console.log('  ✅ Removed floating disableNetwork blocks');

// Step 2: Remove duplicate enableNetwork at top of syncAll
// Keep only one enableNetwork call
const syncAllStart = ss.indexOf('export async function syncAll()');
if (syncAllStart >= 0) {
  const funcBody = ss.slice(syncAllStart);
  const firstBrace = funcBody.indexOf('{');
  const afterBrace = funcBody.slice(firstBrace + 1);
  
  // Count enableNetwork occurrences in the first 200 chars after {
  const header = afterBrace.slice(0, 300);
  const enableCount = (header.match(/enableNetwork/g) || []).length;
  console.log(`  📊 enableNetwork count in syncAll header: ${enableCount}`);
  
  if (enableCount > 1) {
    // Remove the first duplicate (the one with "push sync" comment)
    ss = ss.replace(
      /\n\s*\/\/ 🔒 Network enable for push sync\n\s*try \{ await enableNetwork\(db\); \} catch\(e\) \{\}\n/,
      '\n'
    );
    console.log('  ✅ Removed duplicate enableNetwork');
  }
}

// Step 3: Add disableNetwork inside the finally block of syncAll
// Find the finally block
const finallyPattern = 'finally {\n    running = false;\n    if (queued) { queued = false; setTimeout(syncAll, 500); }\n  }';
const finallyReplacement = `finally {
    running = false;
    // 🔒 Network disable after syncAll completes
    try { await disableNetwork(db); } catch(e) {}
    if (queued) { queued = false; setTimeout(syncAll, 500); }
  }`;

if (ss.includes(finallyPattern) && !ss.includes('Network disable after syncAll completes')) {
  ss = ss.replace(finallyPattern, finallyReplacement);
  console.log('  ✅ disableNetwork added inside finally block');
} else {
  // Try alternate format
  const altPattern = /finally \{\s*\n\s*running = false;\s*\n\s*if \(queued\)/;
  const match = ss.match(altPattern);
  if (match && !ss.includes('Network disable after syncAll completes')) {
    ss = ss.replace(
      altPattern,
      `finally {\n    running = false;\n    // 🔒 Network disable after syncAll completes\n    try { await disableNetwork(db); } catch(e) {}\n    if (queued)`
    );
    console.log('  ✅ disableNetwork added inside finally block (alt)');
  } else {
    console.log('  ⚠️ Could not find finally block or already patched');
  }
}

fs.writeFileSync('lib/syncService.js', ss, 'utf8');

// Verify final state
console.log('\n=== Final syncAll function ===');
const finalSS = fs.readFileSync('lib/syncService.js', 'utf8');
const finalStart = finalSS.indexOf('export async function syncAll()');
if (finalStart >= 0) {
  const lines = finalSS.slice(finalStart).split('\n');
  for (let i = 0; i < Math.min(40, lines.length); i++) {
    console.log(`${i+1}: ${lines[i]}`);
  }
}

console.log('\n--- Verification ---');
console.log('Floating disableNetwork:', (finalSS.match(/Network disable after (?:push sync|syncAll)\n/g) || []).length, '(should be 0)');
console.log('enableNetwork in syncAll:', (finalSS.slice(finalStart, finalStart+500).match(/enableNetwork/g) || []).length, '(should be 1)');
console.log('disableNetwork in finally:', finalSS.includes('Network disable after syncAll completes'));
