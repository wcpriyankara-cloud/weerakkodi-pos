const fs = require('fs');
const path = 'C:/Users/chandana/StudioProjects/weerakkodi_pos_app/lib/syncService.js';
const code = fs.readFileSync(path, 'utf8');
const lines = code.split('\n');

console.log('=== File stats ===');
console.log('Total lines:', lines.length);
console.log('');

console.log('=== All function declarations ===');
lines.forEach((line, i) => {
  if (line.match(/^(export\s+)?(async\s+)?function\s+\w+/) || 
      line.match(/^(export\s+)?const\s+\w+\s*=\s*(async\s+)?\(/)) {
    console.log(`  Line ${i+1}: ${line.trim().substring(0, 80)}`);
  }
});

console.log('');
console.log('=== Mirror & Init related ===');
lines.forEach((line, i) => {
  const l = line.toLowerCase();
  if (l.includes('mirror') || l.includes('initsync') || l.includes('init') || 
      l.includes('start') || l.includes('cleanup') || l.includes('quota')) {
    if (l.includes('function') || l.includes('const') || l.includes('let') || l.includes('=>')) {
      console.log(`  Line ${i+1}: ${line.trim().substring(0, 90)}`);
    }
  }
});

console.log('');
console.log('=== First 15 lines ===');
lines.slice(0, 15).forEach((l, i) => console.log(`  ${i+1}: ${l.substring(0, 100)}`));

console.log('');
console.log('=== Last 20 lines ===');
lines.slice(-20).forEach((l, i) => console.log(`  ${lines.length-19+i}: ${l.substring(0, 100)}`));
