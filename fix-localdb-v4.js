const fs = require('fs');
const filePath = 'C:/Users/chandana/StudioProjects/weerakkodi_pos_app/lib/localDb.js';
let content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Find first "return stats;" that is NOT followed by "};" within 2 lines
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() === 'return stats;') {
    const next1 = (lines[i+1] || '').trim();
    const next2 = (lines[i+2] || '').trim();
    if (next1 !== '};' && next2 !== '};') {
      console.log('Inserting }; after line ' + (i+1));
      lines.splice(i+1, 0, '};');
      break;
    }
  }
}

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('Done!');

// Verify lines 24-30
const newLines = fs.readFileSync(filePath, 'utf8').split('\n');
for (let k = 23; k <= 31; k++) {
  console.log((k+1) + ': ' + newLines[k]);
}
