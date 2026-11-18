const fs = require('fs');
const f = 'C:/Users/chandana/StudioProjects/weerakkodi_pos_app/components/POSInvoice.jsx';
let c = fs.readFileSync(f, 'utf8');
const lines = c.split('\n');

// FIX 1: Ensure localDb import exists
const hasLocalDbImport = c.includes("import localDb from") || c.includes("import { localDb }");
if (!hasLocalDbImport) {
  // Add import after first import line
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('import ')) {
      lines.splice(i, 0, "import localDb from '@/lib/localDb';");
      console.log('FIX 1: Added localDb import at line ' + (i+1));
      break;
    }
  }
} else {
  console.log('FIX 1: localDb import already exists');
}

c = lines.join('\n');

// FIX 2: Fix custSnap null check
// Old: if (custSnap.exists())
// New: if (custSnap && custSnap.exists())
c = c.replace(
  /if \(custSnap\.exists\(\)\)/g,
  'if (custSnap && custSnap.exists())'
);
console.log('FIX 2: Added null check for custSnap');

// FIX 3: Find getDoc calls around line 651 and wrap with offline check
// Look for pattern: await getDoc(doc(db, 'items', ...))
const getDocPattern = /const\s+(\w+)\s*=\s*await\s+getDoc\(doc\(db,\s*'items'/g;
let match;
let fix3Count = 0;
while ((match = getDocPattern.exec(c)) !== null) {
  const varName = match[1];
  const fullMatch = match[0];
  const wrapped = `let ${varName} = null; if (navigator.onLine) { try { ${varName} = await getDoc(doc(db, 'items'`;
  c = c.replace(fullMatch, wrapped);
  fix3Count++;
}
if (fix3Count > 0) {
  console.log('FIX 3: Wrapped ' + fix3Count + ' getDoc(items) calls with offline check');
} else {
  console.log('FIX 3: No getDoc(items) pattern found, checking line 645-665...');
  const ls = c.split('\n');
  for (let i = 644; i <= 665 && i < ls.length; i++) {
    if (ls[i].includes('getDoc')) {
      console.log('  Line ' + (i+1) + ': ' + ls[i].trim());
    }
  }
}

fs.writeFileSync(f, c, 'utf8');
console.log('\nAll fixes saved!');

// Verify
const vc = fs.readFileSync(f, 'utf8');
console.log('Has localDb import:', vc.includes("import localDb from"));
console.log('Has custSnap null check:', vc.includes("custSnap && custSnap.exists()"));
