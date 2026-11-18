const fs = require('fs');
const path = require('path');

// Fix 1: Add getBackupStats to userBackupService.js
const svcPath = path.join(__dirname, 'lib', 'userBackupService.js');
if (fs.existsSync(svcPath)) {
  let svc = fs.readFileSync(svcPath, 'utf8');
  if (!svc.includes('getBackupStats')) {
    const stub = `
// Auto-added stub for offline compatibility
export async function getBackupStats() {
  return { totalBackups: 0, lastBackup: null, totalSize: 0, status: 'offline' };
}
`;
    // Add before last export default or at end
    if (svc.includes('export default')) {
      svc = svc.replace(/export default/, stub + '\nexport default');
    } else {
      svc += '\n' + stub;
    }
    fs.writeFileSync(svcPath, svc, 'utf8');
    console.log('OK - getBackupStats added to userBackupService.js');
  } else {
    console.log('SKIP - getBackupStats already exists');
  }
} else {
  console.log('SKIP - userBackupService.js not found');
}

// Fix 2: Wrap the call in UserCloudBackup.jsx with try/catch
const compPath = path.join(__dirname, 'components', 'UserCloudBackup.jsx');
if (fs.existsSync(compPath)) {
  let comp = fs.readFileSync(compPath, 'utf8');
  if (comp.includes('getBackupStats') && !comp.includes('try {') || 
      (comp.includes('getBackupStats') && !comp.match(/try\s*\{[\s\S]*?getBackupStats/))) {
    comp = comp.replace(
      /const\s+stats\s*=\s*await\s+userBackup\.getBackupStats\(\)/g,
      'let stats = { totalBackups: 0, lastBackup: null, totalSize: 0, status: "offline" };\n    try { stats = await userBackup.getBackupStats(); } catch(e) { console.warn("Backup stats unavailable:", e.message); }'
    );
    fs.writeFileSync(compPath, comp, 'utf8');
    console.log('OK - UserCloudBackup.jsx wrapped with try/catch');
  } else {
    console.log('SKIP - UserCloudBackup.jsx already safe or no getBackupStats call');
  }
} else {
  console.log('SKIP - UserCloudBackup.jsx not found');
}