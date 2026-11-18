const fs = require('fs');
const f = 'components/POSInvoice.jsx';
let c = fs.readFileSync(f, 'utf8');
let changes = 0;

// FIX 1: Add localDb import if missing
if (!c.includes('localDb')) {
  // Find the last import line
  const importRegex = /^import .+ from .+;?\s*$/gm;
  let lastImport = null, match;
  while ((match = importRegex.exec(c)) !== null) lastImport = match;
  if (lastImport) {
    const insertPos = lastImport.index + lastImport[0].length;
    const newImport = "\nimport localDb from '@/lib/localDb';";
    c = c.substring(0, insertPos) + newImport + c.substring(insertPos);
    changes++;
    console.log('FIX 1 OK - Added localDb import');
  }
} else {
  console.log('FIX 1 SKIP - localDb already referenced');
}

// FIX 2: Add setDoc to firestore import
const fsImportRegex = /import\s*\{([^}]+)\}\s*from\s*['"]firebase\/firestore['"]/;
const fsMatch = c.match(fsImportRegex);
if (fsMatch && !fsMatch[1].includes('setDoc')) {
  const oldImport = fsMatch[0];
  const newImport = oldImport.replace(fsMatch[1], fsMatch[1].trim() + ', setDoc');
  c = c.replace(oldImport, newImport);
  changes++;
  console.log('FIX 2 OK - Added setDoc to firestore import');
} else if (fsMatch && fsMatch[1].includes('setDoc')) {
  console.log('FIX 2 SKIP - setDoc already imported');
} else {
  console.log('FIX 2 WARN - firestore import not found');
}

// FIX 3: Replace navigator.onLine with timeout-only approach for balance fetch
const oldOnline = "const isOnline = typeof navigator !== 'undefined' && navigator.onLine;";
if (c.includes(oldOnline)) {
  c = c.replace(oldOnline, "const isOnline = true; // always try, rely on timeout");
  changes++;
  console.log('FIX 3 OK - Removed unreliable navigator.onLine');
} else {
  const oldOnline2 = oldOnline.replace(/\n/g, '\r\n');
  if (c.includes(oldOnline2)) {
    c = c.replace(oldOnline2, "const isOnline = true;");
    changes++;
    console.log('FIX 3 OK (CRLF)');
  } else {
    console.log('FIX 3 SKIP - navigator.onLine not found');
  }
}

// FIX 4: Add timeout to Firestore batch commit
const oldCommit = 'await fbBatch.commit();';
const newCommit = 'await Promise.race([fbBatch.commit(), new Promise((_,rj) => setTimeout(() => rj(new Error("batch timeout")), 5000))]);';
if (c.includes(oldCommit) && !c.includes('batch timeout')) {
  c = c.replace(oldCommit, newCommit);
  changes++;
  console.log('FIX 4 OK - Added 5s timeout to batch commit');
} else {
  console.log('FIX 4 SKIP');
}

if (changes > 0) {
  fs.writeFileSync(f, c, 'utf8');
  console.log('\nSAVED - ' + changes + ' fixes applied!');
} else {
  console.log('\nNO CHANGES');
}