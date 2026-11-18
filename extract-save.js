const fs = require('fs');
const content = fs.readFileSync('C:/Users/chandana/StudioProjects/weerakkodi_pos_app/components/POSInvoice.jsx', 'utf8');
const lines = content.split('\n');

let start = -1, end = -1, depth = 0;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('handleSaveInvoice') && lines[i].includes('useCallback')) {
    start = i;
  }
  if (start >= 0) {
    for (const ch of lines[i]) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
    }
    if (depth === 0 && i > start) { end = i; break; }
  }
}

if (start >= 0 && end >= 0) {
  console.log(`handleSaveInvoice: lines ${start+1} to ${end+1} (${end-start+1} lines)`);
  const snippet = lines.slice(start, end+1).join('\n');
  fs.writeFileSync('C:/Users/chandana/StudioProjects/weerakkodi_pos_app/handleSaveInvoice_extract.txt', snippet, 'utf8');
  console.log('Saved to handleSaveInvoice_extract.txt');
  // Show first 30 and last 20 lines
  const sLines = snippet.split('\n');
  console.log('\n--- FIRST 30 LINES ---');
  for (let k = 0; k < Math.min(30, sLines.length); k++) console.log(`${start+k+1}: ${sLines[k]}`);
  console.log('\n--- LAST 20 LINES ---');
  for (let k = Math.max(0, sLines.length-20); k < sLines.length; k++) console.log(`${start+k+1}: ${sLines[k]}`);
} else {
  console.log('Not found! start=' + start + ' end=' + end);
}
