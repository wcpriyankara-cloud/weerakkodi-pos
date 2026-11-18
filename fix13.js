const fs = require('fs');
const path = require('path');

// Fix 1: Change wait-on from tcp to http in package.json
const pkgPath = path.join(__dirname, 'package.json');
let pkg = fs.readFileSync(pkgPath, 'utf8');

if (pkg.includes('tcp:3000')) {
  pkg = pkg.replace(/tcp:3000/g, 'http://localhost:3000');
  fs.writeFileSync(pkgPath, pkg, 'utf8');
  console.log('OK - package.json: wait-on changed to http://localhost:3000');
} else {
  console.log('SKIP - tcp:3000 not found');
}

// Fix 2: Check if backup exists
const backupDir = 'D:\\Weerakkodi_POS_Backups';
if (fs.existsSync(backupDir)) {
  const files = fs.readdirSync(backupDir);
  console.log('\n=== Backup files in ' + backupDir + ' ===');
  files.forEach(f => {
    const stat = fs.statSync(path.join(backupDir, f));
    console.log(f + ' (' + Math.round(stat.size / 1024) + ' KB) - ' + stat.mtime.toISOString().split('T')[0]);
  });
} else {
  console.log('\nNo backup directory found at ' + backupDir);
}

// Fix 3: Check Dexie data directly
console.log('\n=== Current localDb.js tables ===');
const localDbPath = path.join(__dirname, 'lib', 'localDb.js');
const localDb = fs.readFileSync(localDbPath, 'utf8');
const tableMatches = localDb.match(/this\.version\(\d+\)\.stores\(\{[\s\S]*?\}\)/);
if (tableMatches) {
  console.log(tableMatches[0].substring(0, 500));
}

console.log('\nDone!');