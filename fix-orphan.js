const fs = require('fs');
const f = 'lib/localDb.js';
let lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
let cleaned = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes("_lastBackup")) continue;
  if (line.includes("orderBy('_savedAt')")) continue;
  if (line.trim() === 'return stats;' && i > 0 && !lines[i-1].includes('reduce')) continue;
  if (line.trim() === '};' && i > 0 && lines[i-1].trim() === 'return stats;') continue;
  cleaned.push(line);
}
fs.writeFileSync(f, cleaned.join('\n'), 'utf8');
console.log('OK - Orphaned lines removed');
console.log('Lines:', lines.length, '->', cleaned.length);
for (let i = Math.max(0, cleaned.length - 10); i < cleaned.length; i++) {
  console.log((i+1) + ': ' + cleaned[i]);
}
