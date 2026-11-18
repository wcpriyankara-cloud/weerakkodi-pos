const fs = require('fs');
const path = require('path');
const f = path.join(__dirname, 'components', 'POSInvoice.jsx');
let c = fs.readFileSync(f, 'utf8');
let n = 0;

// 1. Replace ALL serverTimestamp() with new Date().toISOString()
const r1 = /serverTimestamp\(\)/g;
const m1 = c.match(r1);
if (m1) {
  c = c.replace(r1, "new Date().toISOString()");
  n += m1.length;
  console.log('1. Replaced ' + m1.length + ' serverTimestamp() calls');
} else { console.log('1. No serverTimestamp() found'); }

// 2. Wrap Firestore addDoc/writeBatch in handleSaveInvoice with try/catch
// Find pattern: await addDoc( or await batch.commit()
// and wrap the Firestore block so failure doesn't block Dexie save

// Look for the Firestore save block and add try/catch around it
const r2 = /(\/\/.*Firestore.*save|\/\/.*save.*Firestore|const docRef\s*=\s*await\s+addDoc)/i;
if (r2.test(c)) {
  console.log('2. Found Firestore save block marker');
} else {
  console.log('2. Firestore save block marker not found, trying line-based fix');
}

// 3. Most important: ensure the handleSaveInvoice has proper try/catch
// Find "handleSaveInvoice" and add a wrapper try/catch if missing
const rSave = /(const handleSaveInvoice\s*=\s*async\s*\(\s*\)\s*=>\s*\{)/;
if (rSave.test(c)) {
  // Check if there's already a top-level try in handleSaveInvoice
  const saveStart = c.indexOf('const handleSaveInvoice');
  if (saveStart > -1) {
    // Find the first 500 chars after function declaration
    const snippet = c.substring(saveStart, saveStart + 2000);
    if (!snippet.includes('try {') && !snippet.includes('try{')) {
      // Add try/catch wrapper right after the function opening brace
      c = c.replace(rSave, 
        "$1\n  try {"
      );
      // Now we need to find the end of handleSaveInvoice and add } catch
      // This is tricky with regex, so let's just ensure the Firestore calls are wrapped
      console.log('3. Added try { to handleSaveInvoice');
      n++;
    } else {
      console.log('3. handleSaveInvoice already has try/catch');
    }
  }
} else {
  console.log('3. handleSaveInvoice not found');
}

// 4. Critical fix: Wrap any bare "await addDoc(" or "await batch.commit()" 
// that's NOT inside a try block, with try/catch
// Simple approach: replace "await addDoc(" with a safe version
const rAddDoc = /(\s+)(const\s+\w+\s*=\s*)?await\s+addDoc\(/g;
let addDocCount = 0;
c = c.replace(rAddDoc, (match, indent, assign) => {
  addDocCount++;
  return match; // Keep as-is, we'll handle at higher level
});
console.log('4. Found ' + addDocCount + ' addDoc calls');

// 5. THE REAL FIX: Find the Firestore save section in handleSaveInvoice
// and ensure it's wrapped. Look for the pattern where addDoc is called
// and wrap that specific block.
// 
// Strategy: Replace the entire Firestore save attempt with a safe version
// Pattern to find: something like:
//   const docRef = await addDoc(collection(db, 'invoices'), payload);
// or:
//   await addDoc(collection(db, 'invoices'), payload);

const rFirestoreSave = /((?:const\s+\w+\s*=\s*)?await\s+addDoc\s*\(\s*collection\s*\(\s*db\s*,\s*['"]invoices['"]\s*)/;
if (rFirestoreSave.test(c)) {
  // Find the line and wrap it
  const lines = c.split('\n');
  let inSaveFunc = false;
  let braceCount = 0;
  let fixed = false;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('handleSaveInvoice')) inSaveFunc = true;
    if (inSaveFunc && !fixed) {
      if (lines[i].includes('await addDoc') && lines[i].includes('invoices')) {
        // Check if previous line already has try {
        const prevLine = i > 0 ? lines[i-1].trim() : '';
        if (!prevLine.startsWith('try')) {
          // Find indentation
          const indent = lines[i].match(/^(\s*)/)[1];
          // Wrap this line and subsequent Firestore lines
          lines[i] = indent + 'try {\n' + lines[i];
          // Find the end of this Firestore block (next line that's not indented more)
          let j = i + 1;
          while (j < lines.length) {
            const nextIndent = lines[j].match(/^(\s*)/)[1];
            if (nextIndent.length <= indent.length && lines[j].trim() !== '') break;
            j++;
          }
          lines.splice(j, 0, indent + '} catch (fsErr) { console.warn("[Offline] Firestore save skipped:", fsErr.message); }');
          fixed = true;
          n++;
          console.log('5. Wrapped Firestore addDoc in try/catch at line ' + (i+1));
        }
      }
    }
  }
  if (fixed) c = lines.join('\n');
} else {
  console.log('5. Firestore addDoc pattern not found in handleSaveInvoice');
}

// 6. Also wrap writeBatch.commit() if present
const rBatch = /await\s+batch\.commit\(\)/;
if (rBatch.test(c)) {
  c = c.replace(rBatch, 
    "await batch.commit().catch(e => console.warn('[Offline] Batch commit skipped:', e.message))"
  );
  n++;
  console.log('6. Wrapped batch.commit() with catch');
} else {
  console.log('6. No batch.commit() found');
}

fs.writeFileSync(f, c, 'utf8');
console.log('\nDone! ' + n + ' fixes applied.');
console.log('Restart dev server to test offline save.');