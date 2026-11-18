const fs = require('fs');
let ss = fs.readFileSync('lib/syncService.js', 'utf8');

// Find all function definitions
const lines = ss.split('\n');
lines.forEach((line, i) => {
  if (line.includes('syncAll') || line.includes('sync_all') || line.includes('syncToFirestore')) {
    console.log(`Line ${i+1}: ${line.trim()}`);
  }
});

// Also show the area around line 416 (from memory)
console.log('\n=== Lines 410-440 ===');
for (let i = 409; i < 440 && i < lines.length; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}
