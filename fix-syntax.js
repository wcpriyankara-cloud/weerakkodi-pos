const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'lib', 'syncService.js');
let code = fs.readFileSync(filePath, 'utf8');

// Show first 25 lines to understand the damage
const lines = code.split('\n');
console.log('🔍 First 25 lines of syncService.js:');
for (let i = 0; i < Math.min(25, lines.length); i++) {
  console.log(`  L${i+1}: ${lines[i]}`);
}

// Fix: Find orphaned code that should be inside forceSyncAndBackup
// The broken pattern: code starts with imports, then CLOUD_SYNC flag,
// then orphaned "retryCount = 0; ..." without function wrapper

const brokenPattern = /(\/\/ 🔒 CLOUD SYNC DISABLED FLAG[\s\S]*?export function disableCloudSync\(\) \{ CLOUD_SYNC_DISABLED = true; \}\n)([\s\S]*?)(retryCount\s*=\s*0;\s*clearTimeout\(retryTimer\);)/;

if (brokenPattern.test(code)) {
  code = code.replace(brokenPattern, (match, flagBlock, gap, orphanedCode) => {
    return flagBlock + '\nexport async function forceSyncAndBackup(uid) {\n  ' + orphanedCode;
  });
  console.log('✅ Reconstructed forceSyncAndBackup function declaration');
} else {
  // Alternative: just find the orphaned block and wrap it
  const orphanPattern = /(\n)(retryCount\s*=\s*0;\s*clearTimeout\(retryTimer\);\s*clearQuotaBlock\(\);\s*\n\s*const res = await syncAll\(\);\s*\n\s*await triggerLocalDiskBackup\(\);\s*\n\s*return res;\s*\n\s*\})/;
  
  if (orphanPattern.test(code)) {
    code = code.replace(orphanPattern, '\nexport async function forceSyncAndBackup(uid) {\n  $2');
    console.log('✅ Reconstructed forceSyncAndBackup (alt pattern)');
  } else {
    console.log('⚠️ Pattern not found. Manual fix needed.');
    console.log('');
    console.log('syncService.js එකේ line 12-13 අතර මේක add කරන්න:');
    console.log('');
    console.log('export async function forceSyncAndBackup(uid) {');
    console.log('');
  }
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('\n🔄 App restart: Ctrl+C → npm run dev');