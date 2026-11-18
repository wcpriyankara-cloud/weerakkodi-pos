const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'lib', 'syncService.js');
let code = fs.readFileSync(filePath, 'utf8');
let changes = 0;

// 1. Module-level flag add කරන්න file එකේ මුලට
if (!code.includes('CLOUD_SYNC_DISABLED')) {
  const flagCode = `
// 🔒 CLOUD SYNC DISABLED FLAG - Firestore disableNetwork() නිසා
let CLOUD_SYNC_DISABLED = true;
export function enableCloudSync() { CLOUD_SYNC_DISABLED = false; }
export function disableCloudSync() { CLOUD_SYNC_DISABLED = true; }
`;
  // Insert after imports
  const lastImportIdx = code.lastIndexOf('import ');
  if (lastImportIdx !== -1) {
    const endOfLine = code.indexOf('\n', lastImportIdx);
    code = code.slice(0, endOfLine + 1) + flagCode + code.slice(endOfLine + 1);
    changes++;
    console.log('✅ CLOUD_SYNC_DISABLED flag added');
  }
} else {
  console.log('⏭️ Flag already exists');
}

// 2. syncAll function එකේ cloud sync steps වලට කලින් hard return
// "safe(" call කරන තැනට කලින් check
if (!code.includes('CLOUD_SYNC_DISABLED) return')) {
  // Find the syncAll function body and add guard right after opening brace
  // Look for pattern: async function syncAll or const syncAll = async
  const syncAllMatch = code.match(/(async\s+function\s+syncAll\s*\([^)]*\)\s*\{)/);
  if (syncAllMatch) {
    const insertPos = syncAllMatch.index + syncAllMatch[0].length;
    const guard = `
  // 🔒 HARD OFFLINE GUARD
  if (CLOUD_SYNC_DISABLED) {
    try { await doDiskBackup(uid); } catch(e) { console.log('Disk backup skipped'); }
    return;
  }`;
    code = code.slice(0, insertPos) + guard + code.slice(insertPos);
    changes++;
    console.log('✅ syncAll hard guard added');
  }
} else {
  console.log('⏭️ syncAll guard already exists');
}

// 3. syncCustomers function එකේ hard return
if (!code.includes('syncCustomers CLOUD check')) {
  const custMatch = code.match(/(async\s+function\s+syncCustomers\s*\([^)]*\)\s*\{)/);
  if (custMatch) {
    const insertPos = custMatch.index + custMatch[0].length;
    const guard = `
  // 🔒 syncCustomers CLOUD check
  if (CLOUD_SYNC_DISABLED) return;`;
    code = code.slice(0, insertPos) + guard + code.slice(insertPos);
    changes++;
    console.log('✅ syncCustomers guard added');
  }
}

// 4. scheduleRetry disable
if (!code.includes('scheduleRetry CLOUD check')) {
  const retryMatch = code.match(/(function\s+scheduleRetry\s*\([^)]*\)\s*\{|const\s+scheduleRetry\s*=\s*(?:async\s+)?\([^)]*\)\s*=>\s*\{)/);
  if (retryMatch) {
    const insertPos = retryMatch.index + retryMatch[0].length;
    const guard = `
  // 🔒 scheduleRetry CLOUD check
  if (CLOUD_SYNC_DISABLED) return;`;
    code = code.slice(0, insertPos) + guard + code.slice(insertPos);
    changes++;
    console.log('✅ scheduleRetry guard added');
  }
}

// 5. onOnline handler එකේ syncAll call disable
// "🌐 Online detected" log එක තියෙන තැන
if (code.includes('Online detected')) {
  code = code.replace(
    /console\.log\(['"]🌐 Online detected[^)]*\);/g,
    'console.log("🌐 Online detected but CLOUD_SYNC_DISABLED=" + CLOUD_SYNC_DISABLED); if (CLOUD_SYNC_DISABLED) return;'
  );
  changes++;
  console.log('✅ onOnline handler guarded');
}

// 6. forceSyncAndBackup එකේත් guard
if (!code.includes('forceSync CLOUD check')) {
  const forceMatch = code.match(/(async\s+function\s+forceSyncAndBackup\s*\([^)]*\)\s*\{|export\s+async\s+function\s+forceSyncAndBackup\s*\([^)]*\)\s*\{)/);
  if (forceMatch) {
    const insertPos = forceMatch.index + forceMatch[0].length;
    const guard = `
  // 🔒 forceSync CLOUD check
  if (CLOUD_SYNC_DISABLED) {
    try { await doDiskBackup(uid); } catch(e) {}
    return;
  }`;
    code = code.slice(0, insertPos) + guard + code.slice(insertPos);
    changes++;
    console.log('✅ forceSyncAndBackup guard added');
  }
}

if (changes > 0) {
  fs.writeFileSync(filePath, code, 'utf8');
  console.log(`\n🎉 ${changes} fixes applied!`);
  console.log('🔄 App restart කරන්න: Ctrl+C → npm run dev');
} else {
  console.log('\n⚠️ No changes made');
}