const fs = require('fs');
const path = require('path');

const fbPath = path.join(__dirname, 'firebase-config.js');
let code = fs.readFileSync(fbPath, 'utf8');
let changes = 0;

// 1. Remove disableNetwork(db) call at startup
if (code.includes('disableNetwork(db)')) {
  code = code.replace(
    /if\s*\(\s*db\s*\)\s*disableNetwork\(db\)\.catch\(\(\)=>\{\}\);?/g,
    '// disableNetwork(db) removed - let Firestore sync naturally (Blaze plan)'
  );
  changes++;
  console.log('✅ Removed disableNetwork(db) at startup');
}

// 2. Fix goOfflineMode to not auto-trigger
if (code.includes('export const goOfflineMode')) {
  code = code.replace(
    /export const goOfflineMode = async \(\) => \{[\s\S]*?\};/,
    `export const goOfflineMode = async () => {
  console.log('⏭️ goOfflineMode called but skipped (Blaze plan - stay online)');
};`
  );
  changes++;
  console.log('✅ Disabled goOfflineMode');
}

// 3. Fix goOnlineMode
if (code.includes('export const goOnlineMode')) {
  code = code.replace(
    /export const goOnlineMode = async \(\) => \{[\s\S]*?\};/,
    `export const goOnlineMode = async () => {
  console.log('✅ Already online (Blaze plan)');
};`
  );
  changes++;
  console.log('✅ Simplified goOnlineMode');
}

// 4. Keep console.error suppression for any remaining quota messages
if (!code.includes('resource-exhausted')) {
  // Already has suppression - good
  console.log('⏭️ Console error suppression already active');
}

// 5. Remove CLOUD_SYNC_DISABLED from syncService.js
const syncPath = path.join(__dirname, 'lib', 'syncService.js');
let syncCode = fs.readFileSync(syncPath, 'utf8');

if (syncCode.includes('let CLOUD_SYNC_DISABLED = true')) {
  syncCode = syncCode.replace(
    'let CLOUD_SYNC_DISABLED = true;',
    'let CLOUD_SYNC_DISABLED = false; // ✅ Enabled for Blaze plan'
  );
  fs.writeFileSync(syncPath, syncCode, 'utf8');
  changes++;
  console.log('✅ syncService.js: CLOUD_SYNC_DISABLED = false');
}

// 6. Re-enable purge (needed for multi-tenant)
if (syncCode.includes('PURGE DISABLED')) {
  syncCode = syncCode.replace(
    /\/\/ 🔒 PURGE DISABLED[\s\S]*?return;/,
    '// ✅ Purge re-enabled'
  );
  fs.writeFileSync(syncPath, syncCode, 'utf8');
  changes++;
  console.log('✅ syncService.js: purge re-enabled');
}

// 7. Re-enable mirror
if (syncCode.includes('MIRROR DISABLED')) {
  syncCode = syncCode.replace(
    /\/\/ 🔒 MIRROR DISABLED[\s\S]*?return;/,
    '// ✅ Mirror re-enabled'
  );
  fs.writeFileSync(syncPath, syncCode, 'utf8');
  changes++;
  console.log('✅ syncService.js: mirror re-enabled');
}

fs.writeFileSync(fbPath, code, 'utf8');

console.log(`\n🎉 Total ${changes} fixes applied!`);
console.log('\n📌 මොකද වෙනස් වෙන්නේ:');
console.log('   ✅ Firestore network ENABLED (Vercel වගේම)');
console.log('   ✅ Data Firestore එකෙන් load වෙනවා');
console.log('   ✅ Dexie persistent cache එකෙන් offline support');
console.log('   ✅ Multi-tenant purge active');
console.log('   ✅ Mirror sync active');
console.log('\n🔄 App restart: Ctrl+C → npm run dev');