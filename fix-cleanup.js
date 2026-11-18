const fs = require('fs');
const filePath = 'C:/Users/chandana/StudioProjects/weerakkodi_pos_app/components/POSInvoice.jsx';
let content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Find handleSaveInvoice function boundaries
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

// Check if setSaving(false) exists in the function
const funcLines = lines.slice(start, end + 1);
const funcText = funcLines.join('\n');
const hasSetSavingFalse = funcText.includes('setSaving(false)');
console.log('Function lines: ' + (start+1) + ' to ' + (end+1));
console.log('Has setSaving(false): ' + hasSetSavingFalse);

if (!hasSetSavingFalse) {
  // Find the line with triggerLocalDiskBackup and insert cleanup after it
  for (let i = end; i >= start; i--) {
    if (lines[i].includes('triggerLocalDiskBackup')) {
      console.log('Inserting cleanup after line ' + (i+1) + ': ' + lines[i].trim());
      lines.splice(i + 1, 0, '    savingRef.current = false;', '    setSaving(false);');
      break;
    }
  }
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  console.log('Cleanup added!');
} else {
  console.log('Already has cleanup, skipping.');
}

// Verify
const newContent = fs.readFileSync(filePath, 'utf8');
const newLines = newContent.split('\n');
for (let i = start; i < Math.min(start + 110, newLines.length); i++) {
  if (newLines[i].includes('savingRef.current = false') || newLines[i].includes('setSaving(false)')) {
    console.log('  ' + (i+1) + ': ' + newLines[i]);
  }
}
