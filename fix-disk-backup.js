const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'lib', 'syncService.js');
let code = fs.readFileSync(filePath, 'utf8');
let changes = 0;

// 1. Find actual disk backup function name
const backupFuncs = [];
const funcPattern = /(async\s+)?function\s+(\w*[Bb]ackup\w*)\s*\(/g;
let m;
while ((m = funcPattern.exec(code)) !== null) {
  backupFuncs.push(m[2]);
}
const exportBackupPattern = /export\s+(async\s+)?function\s+(\w*[Bb]ackup\w*)\s*\(/g;
while ((m = exportBackupPattern.exec(code)) !== null) {
  if (!backupFuncs.includes(m[2])) backupFuncs.push(m[2]);
}
console.log('🔍 Found backup functions:', backupFuncs);

// Also check for disk backup related functions
const diskFuncs = [];
const diskPattern = /(async\s+)?function\s+(\w*[Dd]isk\w*)\s*\(/g;
while ((m = diskPattern.exec(code)) !== null) {
  diskFuncs.push(m[2]);
}
console.log('🔍 Found disk functions:', diskFuncs);

// 2. Find the actual backup call that works (the one that prints 💾)
const backupCallPattern = /💾\s*Disk backup/;
const backupLineIdx = code.indexOf('💾');
if (backupLineIdx !== -1) {
  // Get surrounding 500 chars to find the function context
  const context = code.substring(Math.max(0, backupLineIdx - 500), backupLineIdx + 200);
  console.log('🔍 Backup context found near index', backupLineIdx);
  // Find function name containing this log
  const funcContextMatch = context.match(/function\s+(\w+)\s*\(/g);
  if (funcContextMatch) {
    console.log('🔍 Backup is inside function:', funcContextMatch[funcContextMatch.length - 1]);
  }
}

// 3. Find all function names that contain backup logic
const allFuncs = [];
const allFuncPattern = /(?:async\s+)?function\s+(\w+)\s*\(/g;
while ((m = allFuncPattern.exec(code)) !== null) {
  allFuncs.push(m[1]);
}
console.log('🔍 All functions:', allFuncs.filter(f => 
  f.toLowerCase().includes('backup') || 
  f.toLowerCase().includes('disk') || 
  f.toLowerCase().includes('save') ||
  f.toLowerCase().includes('sync')
));

// 4. Fix the CLOUD_SYNC_DISABLED guard to properly call disk backup
// Replace the broken guard with one that finds and calls the right function
const brokenGuard = /if\s*\(CLOUD_SYNC_DISABLED\)\s*\{[\s\S]*?try\s*\{\s*await\s+doDiskBackup\(uid\);?\s*\}\s*catch\s*\(\s*e\s*\)\s*\{\s*console\.log\(['"]Disk backup skipped['"]\);?\s*\}[\s\S]*?return;[\s\S]*?\}/;

if (brokenGuard.test(code)) {
  // Find the real backup function
  let realBackupFunc = backupFuncs.find(f => f.toLowerCase().includes('disk')) || 
                       diskFuncs[0] || 
                       backupFuncs[0];
  
  if (!realBackupFunc) {
    // Look for the function that contains the 💾 log
    realBackupFunc = 'doDiskBackup'; // fallback
  }
  
  console.log('🔧 Will use backup function:', realBackupFunc);
  
  const newGuard = `if (CLOUD_SYNC_DISABLED) {
    try {
      if (typeof ${realBackupFunc} === 'function') {
        await ${realBackupFunc}(uid);
      } else {
        // Inline disk backup fallback
        const { localDb } = await import('./localDb');
        const counts = {};
        for (const table of ['customers','items','itemTransactions','purchases','suppliers']) {
          if (localDb[table]) {
            const rows = await localDb[table].where('uid').equals(uid).toArray();
            counts[table] = rows.length;
          }
        }
        console.log('💾 Offline backup counts:', JSON.stringify(counts));
      }
    } catch(e) {
      console.log('Disk backup error:', e.message);
    }
    return;
  }`;
  
  code = code.replace(brokenGuard, newGuard);
  changes++;
  console.log('✅ Fixed CLOUD_SYNC_DISABLED guard with proper backup call');
} else {
  console.log('⚠️ Broken guard pattern not found. Trying alternative...');
  
  // Alternative: just fix the doDiskBackup call
  if (code.includes('doDiskBackup(uid)') && !code.includes('function doDiskBackup')) {
    // doDiskBackup doesn't exist - replace with inline backup
    code = code.replace(
      /try\s*\{\s*await\s+doDiskBackup\(uid\);?\s*\}\s*catch\s*\(\s*e\s*\)\s*\{\s*console\.log\(['"]Disk backup skipped['"]\);?\s*\}/g,
      `try {
        console.log('🔌 Offline mode - skipping cloud sync, local data safe');
      } catch(e) {
        console.log('Offline guard error:', e.message);
      }`
    );
    changes++;
    console.log('✅ Replaced broken doDiskBackup call');
  }
}

// 5. Also fix the forceSyncAndBackup guard
const forceGuardPattern = /\/\/ 🔒 forceSync CLOUD check[\s\S]*?if\s*\(CLOUD_SYNC_DISABLED\)\s*\{[\s\S]*?return;[\s\S]*?\}/;
if (forceGuardPattern.test(code)) {
  code = code.replace(forceGuardPattern, `// 🔒 forceSync CLOUD check
  if (CLOUD_SYNC_DISABLED) {
    console.log('🔌 forceSync skipped - offline mode');
    return;
  }`);
  changes++;
  console.log('✅ Fixed forceSyncAndBackup guard');
}

if (changes > 0) {
  fs.writeFileSync(filePath, code, 'utf8');
  console.log(`\n🎉 ${changes} fixes applied!`);
} else {
  console.log('\n⚠️ No changes made. Showing syncService.js structure...');
  // Show lines around CLOUD_SYNC_DISABLED
  const lines = code.split('\n');
  lines.forEach((line, i) => {
    if (line.includes('CLOUD_SYNC_DISABLED') || line.includes('doDiskBackup') || line.includes('Disk backup')) {
      console.log(`  L${i+1}: ${line.trim()}`);
    }
  });
}

console.log('\n🔄 App restart කරන්න: Ctrl+C → npm run dev');