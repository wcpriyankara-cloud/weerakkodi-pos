const fs = require('fs');
const f = 'components/POSInvoice.jsx';
let c = fs.readFileSync(f, 'utf8');
let changes = 0;

// DIAG: Check current imports
const importLines = c.split(/\r?\n/).filter(l => l.trim().startsWith('import '));
console.log('=== CURRENT IMPORTS ===');
importLines.forEach(l => console.log(l.trim().substring(0, 100)));
console.log('=======================');
console.log('Has localDb import:', c.includes("from '@/lib/localDb'") || c.includes('from "../lib/localDb"') || c.includes("from '../lib/localDb'"));
console.log('Has localDb usage:', c.includes('localDb.'));

// FIX 1: Add localDb import
const hasLocalDbImport = c.includes("from '@/lib/localDb'") || c.includes('from "../lib/localDb"') || c.includes("from '../lib/localDb'");
if (!hasLocalDbImport) {
  // Find first line that starts with 'import'
  const firstImportIdx = c.indexOf('import ');
  if (firstImportIdx !== -1) {
    const insertStr = "import localDb from '@/lib/localDb';\n";
    c = c.substring(0, firstImportIdx) + insertStr + c.substring(firstImportIdx);
    changes++;
    console.log('FIX 1 OK - Added localDb import at top');
  }
} else {
  console.log('FIX 1 SKIP - localDb already imported');
}

// FIX 2: Add timeout to setDoc in handleCreateCustomer
const oldSetDoc = 'await setDoc(custRef, cd);';
const newSetDoc = 'await Promise.race([setDoc(custRef, cd), new Promise((_,rj) => setTimeout(() => rj(new Error("setDoc timeout")), 4000))]);';
if (c.includes(oldSetDoc) && !c.includes('setDoc timeout')) {
  c = c.replace(oldSetDoc, newSetDoc);
  changes++;
  console.log('FIX 2 OK - Added 4s timeout to setDoc');
} else {
  console.log('FIX 2 SKIP - setDoc pattern not found or already fixed');
}

// FIX 3: Make sure handleSaveInvoice balance fetch timeout exists
if (!c.includes('Live balance fetch failed: timeout') && !c.includes('balance timeout')) {
  const oldGetDoc = 'const custSnap = await getDoc(doc(db, \'customers\', selectedCustomer.id));';
  const newGetDoc = 'const custSnap = await Promise.race([getDoc(doc(db, \'customers\', selectedCustomer.id)), new Promise((_,rj) => setTimeout(() => rj(new Error("timeout")), 3000))]);';
  if (c.includes(oldGetDoc)) {
    c = c.replace(oldGetDoc, newGetDoc);
    changes++;
    console.log('FIX 3 OK - Added 3s timeout to balance getDoc');
  } else {
    console.log('FIX 3 SKIP - getDoc pattern different');
  }
} else {
  console.log('FIX 3 SKIP - timeout already exists');
}

if (changes > 0) {
  fs.writeFileSync(f, c, 'utf8');
  console.log('\nSAVED - ' + changes + ' fixes!');
} else {
  console.log('\nNO CHANGES');
}