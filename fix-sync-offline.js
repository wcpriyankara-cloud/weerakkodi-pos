const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'lib', 'syncService.js');
let code = fs.readFileSync(filePath, 'utf8');

let changes = 0;

// 1. syncAll function එකේ ආරම්භයේ offline guard add කරන්න
// syncAll ඇතුළේ cloud sync steps වලට කලින් offline check
const syncAllGuard = `
  // 🔒 OFFLINE GUARD: Cloud sync skip කරන්න offline mode එකේදී
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  if (isOffline) {
    console.log('🔌 syncAll skipped - offline mode. Disk backup only.');
    try { await doDiskBackup(uid); } catch(e) {}
    return;
  }
`;

// Try to inject after "async function syncAll" or "const syncAll" opening brace
const syncAllPattern = /(async\s+function\s+syncAll\s*\([^)]*\)\s*\{|const\s+syncAll\s*=\s*async\s*\([^)]*\)\s*=>\s*\{)/;
if (syncAllPattern.test(code) && !code.includes('OFFLINE GUARD: Cloud sync skip')) {
  code = code.replace(syncAllPattern, (match) => match + syncAllGuard);
  changes++;
  console.log('✅ syncAll offline guard added');
} else if (code.includes('OFFLINE GUARD: Cloud sync skip')) {
  console.log('⏭️ syncAll guard already exists');
} else {
  console.log('⚠️ Could not find syncAll function pattern');
}

// 2. scheduleRetry function එක offline mode එකේදී disable කරන්න
const retryPattern = /(function\s+scheduleRetry|const\s+scheduleRetry\s*=|scheduleRetry\s*\()\s*/;
const retryGuard = `
  // 🔒 OFFLINE: Retry skip
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
`;

// Find setTimeout inside scheduleRetry context and add guard before it
if (!code.includes('OFFLINE: Retry skip')) {
  // Add guard to scheduleRetry - look for the function definition
  const schedPattern = /(async\s+function\s+scheduleRetry\s*\([^)]*\)\s*\{|const\s+scheduleRetry\s*=\s*(?:async\s+)?\([^)]*\)\s*=>\s*\{)/;
  if (schedPattern.test(code)) {
    code = code.replace(schedPattern, (match) => match + retryGuard);
    changes++;
    console.log('✅ scheduleRetry offline guard added');
  } else {
    // Alternative: wrap setTimeout in syncAll retry
    const timeoutPattern = /(setTimeout\s*\(\s*(?:async\s+)?\(\s*\)\s*=>\s*\{[\s\S]*?syncAll)/;
    if (timeoutPattern.test(code)) {
      code = code.replace(/setTimeout\s*\(\s*\(\s*\)\s*=>\s*\{/g, (match) => {
        return match + '\n    if (typeof navigator !== "undefined" && !navigator.onLine) return;';
      });
      changes++;
      console.log('✅ setTimeout retry offline guard added');
    }
  }
} else {
  console.log('⏭️ Retry guard already exists');
}

// 3. syncCustomers එකේ Firestore call ට කලින් offline check
if (!code.includes('OFFLINE: skip customer cloud sync')) {
  const custSyncPattern = /(async\s+function\s+syncCustomers\s*\([^)]*\)\s*\{|const\s+syncCustomers\s*=\s*async\s*\([^)]*\)\s*=>\s*\{)/;
  if (custSyncPattern.test(code)) {
    const custGuard = `
  // 🔒 OFFLINE: skip customer cloud sync
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
`;
    code = code.replace(custSyncPattern, (match) => match + custGuard);
    changes++;
    console.log('✅ syncCustomers offline guard added');
  }
}

// 4. "Cloud වෙත යැවීමට ඇත" UI message එක offline mode එකේදී hide කරන්න
// pendingSyncCount set කරන තැන offline නම් 0 කරන්න
if (!code.includes('OFFLINE: force pending count 0')) {
  const pendingPattern = /(setPendingSyncCount|pendingSyncCount\s*=)\s*\(/;
  if (pendingPattern.test(code)) {
    // This is tricky - let's just suppress the log instead
    console.log('⏭️ Pending count UI fix skipped (handle in component)');
  }
}

if (changes > 0) {
  fs.writeFileSync(filePath, code, 'utf8');
  console.log(`\n🎉 ${changes} offline guards added to syncService.js`);
  console.log('🔄 App එක restart කරන්න (Ctrl+C → npm run dev)');
} else {
  console.log('\n⚠️ No changes made. Manual fix needed.');
  console.log('syncService.js එකේ syncAll function එකේ ආරම්භයේ මේක add කරන්න:');
  console.log('  if (typeof navigator !== "undefined" && !navigator.onLine) return;');
}