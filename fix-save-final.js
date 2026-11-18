const fs = require('fs');
const filePath = 'C:/Users/chandana/StudioProjects/weerakkodi_pos_app/components/POSInvoice.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// FIX 1: Wrap fbBatch.commit() with 5s timeout
content = content.replace(
  'await fbBatch.commit();',
  'await Promise.race([fbBatch.commit(), new Promise((_, rej) => setTimeout(() => rej(new Error("Firestore timeout (offline)")), 5000))]);'
);

// FIX 2: Add cleanup before the closing of handleSaveInvoice useCallback
// Find the pattern: triggerLocalDiskBackup line followed by }, [deps]
content = content.replace(
  /try \{ if \(typeof triggerLocalDiskBackup === 'function'\) triggerLocalDiskBackup\(\);\} catch\(e5\) \{\}\n  \}, \[/,
  'try { if (typeof triggerLocalDiskBackup === \'function\') triggerLocalDiskBackup();} catch(e5) {}\n    savingRef.current = false;\n    setSaving(false);\n  }, ['
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed!');

// Verify
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Promise.race') && lines[i].includes('fbBatch')) {
    console.log(`\nFIX 1 at line ${i+1}: ${lines[i].trim().substring(0, 100)}...`);
  }
  if (lines[i].includes('savingRef.current = false') && i > 1380) {
    console.log(`FIX 2 at line ${i+1}: ${lines[i].trim()}`);
    console.log(`  next: ${lines[i+1]?.trim()}`);
  }
}
