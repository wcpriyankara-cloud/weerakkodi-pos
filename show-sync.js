const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'lib', 'syncService.js');
const code = fs.readFileSync(filePath, 'utf8');
const lines = code.split('\n');

console.log('📊 syncService.js: ' + lines.length + ' lines total\n');

// Show all function declarations
console.log('🔍 Function declarations:');
lines.forEach((line, i) => {
  if (line.match(/function\s+\w+/) || line.match(/const\s+\w+\s*=\s*async/) || line.match(/export\s+(async\s+)?function/)) {
    console.log(`  L${i+1}: ${line.trim()}`);
  }
});

console.log('\n🔍 Export default block:');
lines.forEach((line, i) => {
  if (line.includes('export default') || (i > 160 && i < 180)) {
    console.log(`  L${i+1}: ${line.trim()}`);
  }
});

console.log('\n🔍 CLOUD_SYNC references:');
lines.forEach((line, i) => {
  if (line.includes('CLOUD_SYNC')) {
    console.log(`  L${i+1}: ${line.trim()}`);
  }
});

console.log('\n🔍 syncAll references:');
lines.forEach((line, i) => {
  if (line.includes('syncAll')) {
    console.log(`  L${i+1}: ${line.trim()}`);
  }
});

// Show lines 1-30
console.log('\n📄 Lines 1-30:');
for (let i = 0; i < Math.min(30, lines.length); i++) {
  console.log(`  L${i+1}: ${lines[i]}`);
}