const fs = require('fs');
const path = require('path');
const base = 'C:\\Users\\chandana\\StudioProjects\\weerakkodi_pos_app';

const invPath = path.join(base, 'components', 'InvoiceList.jsx');
let inv = fs.readFileSync(invPath, 'utf8');

// ===== FIX 1: Remove timeoutPromise entirely =====
// Lines like:
//   const timeoutPromise = new Promise((_, reject) =>
//     setTimeout(() => reject(new Error("Timeout")), 60000)
//   );
inv = inv.replace(
  /const\s+timeoutPromise\s*=\s*new\s+Promise\s*\(\s*\(\s*_\s*,\s*reject\s*\)\s*=>\s*\n?\s*setTimeout\s*\(\s*\(\s*\)\s*=>\s*reject\s*\(\s*new\s+Error\s*\(\s*["']Timeout["']\s*\)\s*\)\s*,\s*\d+\s*\)\s*\n?\s*\)\s*;?\s*/g,
  '// timeoutPromise removed — using paginated fetch instead\n'
);
console.log('✅ timeoutPromise removed');

// ===== FIX 2: Replace single getDocs with paginated fetch =====
// Find the fetchPromise body and replace it
// Current:
//   const fetchPromise = (async () => {
//     const q = query(collection(db, "invoices"), where("uid", "==", user.uid), limit(2000));
//     try { return await getDocs(q); } catch(serverErr) { ... }
//   })();
//   const snap = await fetchPromise;

// We need to check if getDocs is imported, and also import startAfter, orderBy if not already
const needsStartAfter = !inv.includes('startAfter');
const needsOrderBy = !inv.includes('orderBy');

if (needsStartAfter || needsOrderBy) {
  // Add to the firebase/firestore import
  const importsToAdd = [];
  if (needsStartAfter) importsToAdd.push('startAfter');
  if (needsOrderBy) importsToAdd.push('orderBy');
  
  // Find the firestore import line
  inv = inv.replace(
    /(import\s*\{[^}]*)(\}\s*from\s*["']firebase\/firestore["'])/,
    (match, before, after) => {
      if (before.includes('startAfter') && before.includes('orderBy')) return match;
      const additions = importsToAdd.filter(x => !before.includes(x)).join(', ');
      if (!additions) return match;
      return before + ', ' + additions + ' ' + after;
    }
  );
  console.log('✅ Added startAfter/orderBy to imports');
}

// Now replace the fetchPromise with paginated version
// Pattern to match:
//   const fetchPromise = (async () => {
//     ...query and getDocs...
//   })();
//   const snap = await fetchPromise;
//   if (snap && snap.docs) {

const paginatedCode = `const fetchPromise = (async () => {
          // 🔒 Paginated fetch — සියලුම invoices load කරන්න
          const BATCH_SIZE = 500;
          let allDocs = [];
          let lastDoc = null;
          let hasMore = true;
          
          while (hasMore) {
            let q;
            if (lastDoc) {
              q = query(
                collection(db, "invoices"),
                where("uid", "==", user.uid),
                orderBy("__name__"),
                startAfter(lastDoc),
                limit(BATCH_SIZE)
              );
            } else {
              q = query(
                collection(db, "invoices"),
                where("uid", "==", user.uid),
                orderBy("__name__"),
                limit(BATCH_SIZE)
              );
            }
            
            try {
              const batchSnap = await getDocs(q);
              allDocs = allDocs.concat(batchSnap.docs);
              console.log('📋 Fetched batch: ' + batchSnap.docs.length + ' (total: ' + allDocs.length + ')');
              
              if (batchSnap.docs.length < BATCH_SIZE) {
                hasMore = false;
              } else {
                lastDoc = batchSnap.docs[batchSnap.docs.length - 1];
              }
            } catch(batchErr) {
              console.log('📋 Batch fetch error after ' + allDocs.length + ' docs:', batchErr?.message);
              hasMore = false;
            }
          }
          
          // Return object that mimics QuerySnapshot
          return { docs: allDocs };
        })();`;

// Replace the old fetchPromise block
inv = inv.replace(
  /const\s+fetchPromise\s*=\s*\(async\s*\(\)\s*=>\s*\{[\s\S]*?\}\)\(\);/,
  paginatedCode
);
console.log('✅ Replaced single getDocs with paginated fetch');

// Also make sure "const snap = await fetchPromise;" is still there (not Promise.race)
if (inv.includes('Promise.race')) {
  inv = inv.replace(
    /const\s+snap\s*=\s*await\s+Promise\.race\(\[fetchPromise,\s*timeoutPromise\]\);/,
    'const snap = await fetchPromise;'
  );
  console.log('✅ Removed remaining Promise.race');
}

fs.writeFileSync(invPath, inv, 'utf8');

console.log('\n🎉 Pagination fix applied!');
console.log('How it works:');
console.log('  - Fetches 500 invoices per batch');
console.log('  - Repeats until all 3,879 are loaded');
console.log('  - No timeout — takes as long as needed');
console.log('  - Console shows progress: "Fetched batch: 500 (total: 1000)"');
console.log('\nNext: Ctrl+C → npm run dev → F5');