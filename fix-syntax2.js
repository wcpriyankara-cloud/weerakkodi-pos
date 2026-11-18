const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'lib', 'syncService.js');
let code = fs.readFileSync(filePath, 'utf8');

// Replace the broken section (lines 11-12 area)
const broken = `import { localDb } from '@/lib/localDb';


  retryCount = 0; clearTimeout(retryTimer); clearQuotaBlock();`;

const fixed = `import { localDb } from '@/lib/localDb';

// 🔒 CLOUD SYNC DISABLED FLAG
let CLOUD_SYNC_DISABLED = true;
export function enableCloudSync() { CLOUD_SYNC_DISABLED = false; }
export function disableCloudSync() { CLOUD_SYNC_DISABLED = true; }

export async function forceSyncAndBackup(uid) {
  if (CLOUD_SYNC_DISABLED) {
    console.log('🔌 forceSync skipped - offline mode');
    return;
  }
  retryCount = 0; clearTimeout(retryTimer); clearQuotaBlock();`;

if (code.includes(broken)) {
  code = code.replace(broken, fixed);
  fs.writeFileSync(filePath, code, 'utf8');
  console.log('✅ Fixed! CLOUD_SYNC_DISABLED flag + forceSyncAndBackup restored');
} else {
  console.log('⚠️ Pattern not matched exactly. Trying flexible fix...');
  
  // Flexible: just insert before "retryCount = 0"
  if (code.includes('retryCount = 0; clearTimeout(retryTimer); clearQuotaBlock();')) {
    code = code.replace(
      'retryCount = 0; clearTimeout(retryTimer); clearQuotaBlock();',
      `// 🔒 CLOUD SYNC DISABLED FLAG
let CLOUD_SYNC_DISABLED = true;
export function enableCloudSync() { CLOUD_SYNC_DISABLED = false; }
export function disableCloudSync() { CLOUD_SYNC_DISABLED = true; }

export async function forceSyncAndBackup(uid) {
  if (CLOUD_SYNC_DISABLED) {
    console.log('🔌 forceSync skipped - offline mode');
    return;
  }
  retryCount = 0; clearTimeout(retryTimer); clearQuotaBlock();`
    );
    fs.writeFileSync(filePath, code, 'utf8');
    console.log('✅ Fixed (flexible)!');
  } else {
    console.log('❌ Cannot find target code. Manual edit needed.');
  }
}

console.log('\n🔄 App restart: Ctrl+C → npm run dev');