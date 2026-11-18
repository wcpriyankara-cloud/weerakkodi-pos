const fs = require('fs');
const path = require('path');

// Find the actual firestore module entry
const pkgPath = path.join('node_modules', '@firebase', 'firestore', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const mainFile = pkg.module || pkg.main || 'dist/index.esm2017.js';
const fullPath = path.join('node_modules', '@firebase', 'firestore', mainFile);

console.log('Patching:', fullPath);
console.log('File exists:', fs.existsSync(fullPath));

if (!fs.existsSync(fullPath)) {
  // Try alternatives
  const alts = [
    'dist/index.esm2017.js',
    'dist/esm/index.esm2017.js', 
    'dist/index.mjs',
    'dist/esm/index.mjs'
  ];
  for (const alt of alts) {
    const p = path.join('node_modules', '@firebase', 'firestore', alt);
    if (fs.existsSync(p)) {
      console.log('Found at:', alt);
      break;
    }
  }
}

let code = fs.readFileSync(fullPath, 'utf8');
console.log('File size:', code.length, 'bytes');

// Check if already patched
if (code.includes('__SAFE_ONSNAPSHOT__')) {
  console.log('Already patched!');
  process.exit(0);
}

// Find the onSnapshot export and wrap it
// The SDK exports: function onSnapshot(ref, ...args) { ... }
// We need to find and replace it

const patch = `
// __SAFE_ONSNAPSHOT__ — Quota-safe polling wrapper
const __origOnSnapshot = onSnapshot;
let __pollN = 0;
onSnapshot = function safeOnSnapshot(ref, ...args) {
  __pollN++;
  if (__pollN <= 3) console.log('[FIREWALL] onSnapshot #' + __pollN + ' -> polling');
  else if (__pollN === 4) console.log('[FIREWALL] ...more intercepted');
  let onNext, onError, si = 0;
  if (args[0] && typeof args[0] === 'object' && typeof args[0].next !== 'function' &&
      (args[0].includeMetadataChanges !== undefined || args[0].source !== undefined)) si = 1;
  const cb = args[si], ec = args[si + 1];
  if (typeof cb === 'function') { onNext = cb; onError = typeof ec === 'function' ? ec : null; }
  else if (cb && typeof cb.next === 'function') { onNext = cb.next; onError = typeof cb.error === 'function' ? cb.error : null; }
  else if (args[0] && typeof args[0].next === 'function') { onNext = args[0].next; onError = typeof args[0].error === 'function' ? args[0].error : null; }
  if (!onNext) return __origOnSnapshot.call(this, ref, ...args);
  let active = true;
  const poll = async () => {
    if (!active) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    try {
      const isDoc = ref && ref._key && ref._key.path && ref._key.path.segments && ref._key.path.segments.length % 2 === 0;
      let snap;
      if (isDoc) {
        const d = await getDoc(ref);
        snap = { docs: d.exists() ? [d] : [], docChanges: () => d.exists() ? [{ type: 'modified', doc: d }] : [], empty: !d.exists(), size: d.exists() ? 1 : 0, metadata: { hasPendingWrites: false, fromCache: false } };
      } else {
        snap = await getDocs(ref);
      }
      if (active) onNext(snap);
    } catch (e) {
      if (e && e.code === 'resource-exhausted') {
        console.warn('[FIREWALL] quota, pause 5min');
        active = false;
        setTimeout(() => { active = true; poll(); }, 300000);
        return;
      }
      if (active && onError) onError(e);
    }
  };
  const t1 = setTimeout(poll, 1500);
  const t2 = setInterval(poll, 120000);
  return () => { active = false; clearTimeout(t1); clearInterval(t2); };
};
`;

// Find a good insertion point — right before the first export of onSnapshot
// Look for the pattern where onSnapshot is defined as a function
const patterns = [
  /function onSnapshot\(/,
  /var onSnapshot\s*=/,
  /const onSnapshot\s*=/,
  /let onSnapshot\s*=/
];

let inserted = false;
for (const pat of patterns) {
  const match = code.match(pat);
  if (match) {
    const idx = match.index;
    // Find the end of the onSnapshot function/block
    // Insert our patch right after the function definition
    // Actually, insert at the very end of the file, before exports
    console.log('Found onSnapshot at position:', idx);
    inserted = true;
    break;
  }
}

if (!inserted) {
  console.log('onSnapshot pattern not found, trying end-of-file patch');
}

// Insert patch at the end of the file (before any final export statements)
// This ensures onSnapshot is already defined when we wrap it
code = code + '\n' + patch + '\n';

fs.writeFileSync(fullPath, code, 'utf8');
console.log('Patched successfully! Size:', code.length, 'bytes');
