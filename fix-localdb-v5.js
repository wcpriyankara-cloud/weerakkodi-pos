const fs = require('fs');
const filePath = 'C:/Users/chandana/StudioProjects/weerakkodi_pos_app/lib/localDb.js';
let content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Remove orphaned lines near end of file (before "export default localDb")
// Look for pattern: stats._total ... try {} ... return stats; }; right before export default
let removeStart = -1;
let removeEnd = -1;

for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].trim() === 'export default localDb;') {
    removeEnd = i - 1;
    // Walk backwards to find the start of orphaned block
    for (let j = i - 1; j >= 0; j--) {
      const t = lines[j].trim();
      if (t === '' || t === '};' || t === 'return stats;' || 
          t.startsWith('try {') || t.startsWith('} catch') ||
          t.startsWith('stats._total') || t.startsWith('const stats') ||
          t.startsWith('const tables') || t.startsWith('for (const') ||
          t.startsWith('stats[t]') || t === '}') {
        removeStart = j;
      } else if (t.startsWith('localDb.getBackupStats') || t.startsWith('db.getBackupStats')) {
        removeStart = j;
        break;
      } else {
        break;
      }
    }
    break;
  }
}

if (removeStart >= 0 && removeEnd >= 0) {
  console.log('Removing orphaned lines ' + (removeStart+1) + ' to ' + (removeEnd+1) + ':');
  for (let k = removeStart; k <= removeEnd; k++) {
    console.log('  ' + (k+1) + ': ' + lines[k]);
  }
  lines.splice(removeStart, removeEnd - removeStart + 1);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  console.log('\nDone! Removed orphaned code.');
} else {
  console.log('No orphaned code found at end of file.');
}

// Show last 10 lines
const newLines = fs.readFileSync(filePath, 'utf8').split('\n');
console.log('\nLast 10 lines:');
for (let k = Math.max(0, newLines.length - 10); k < newLines.length; k++) {
  console.log('  ' + (k+1) + ': ' + newLines[k]);
}
