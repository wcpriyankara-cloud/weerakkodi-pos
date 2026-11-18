const fs = require('fs');
const filePath = 'C:/Users/chandana/StudioProjects/weerakkodi_pos_app/components/POSInvoice.jsx';
let content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Extract full handleSaveInvoice function
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

console.log(`Function: lines ${start+1} to ${end+1}`);

// Show the MIDDLE section we haven't seen
const midStart = start + 29;
const midEnd = end - 20;
console.log(`\n--- MIDDLE SECTION (lines ${midStart+1}-${midEnd+1}) ---`);
for (let k = midStart; k <= midEnd; k++) {
  console.log(`${k+1}: ${lines[k]}`);
}

// Check if savingRef.current = false exists in cleanup
const funcText = lines.slice(start, end+1).join('\n');
const hasSavingRefFalse = funcText.includes('savingRef.current = false');
const hasSetSavingFalse = funcText.includes('setSaving(false)');
console.log(`\nHas savingRef.current = false: ${hasSavingRefFalse}`);
console.log(`Has setSaving(false): ${hasSetSavingFalse}`);

// Count occurrences
const refFalseCount = (funcText.match(/savingRef\.current\s*=\s*false/g) || []).length;
const setSavingCount = (funcText.match(/setSaving\(false\)/g) || []).length;
console.log(`savingRef.current = false count: ${refFalseCount}`);
console.log(`setSaving(false) count: ${setSavingCount}`);
