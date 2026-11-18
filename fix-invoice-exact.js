const fs = require('fs');
const path = require('path');
const base = 'C:\\Users\\chandana\\StudioProjects\\weerakkodi_pos_app';

const invPath = path.join(base, 'components', 'InvoiceList.jsx');
let inv = fs.readFileSync(invPath, 'utf8');
const lines = inv.split('\n');

// ===== FIX 1: Remove navigator.onLine check at L130 =====
// Change: "navigator.onLine &&" to "true &&" (always attempt cloud fetch)
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('navigator.onLine') && lines[i].includes('&&')) {
    lines[i] = lines[i].replace('navigator.onLine &&', 'true && /* was navigator.onLine */');
    console.log(`✅ L${i+1}: Removed navigator.onLine gate`);
  }
  // Also fix L224 standalone check
  if (lines[i].trim() === 'if (!navigator.onLine) {' || lines[i].includes('if (!navigator.onLine)')) {
    lines[i] = lines[i].replace('!navigator.onLine', 'false /* was !navigator.onLine */');
    console.log(`✅ L${i+1}: Disabled navigator.onLine check`);
  }
}

// ===== FIX 2: Increase timeout from 3000 to 60000 (60 seconds) =====
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('setTimeout') && lines[i].includes('reject') && lines[i].includes('Timeout')) {
    lines[i] = lines[i].replace('3000', '60000');
    console.log(`✅ L${i+1}: Timeout increased to 60s`);
  }
  // Also fix if timeout is on separate line
  if (lines[i].includes('3000') && i > 0 && lines[i-1].includes('timeoutPromise')) {
    lines[i] = lines[i].replace('3000', '60000');
    console.log(`✅ L${i+1}: Timeout increased to 60s`);
  }
}

// ===== FIX 3: Replace Promise.race with direct await =====
// Find L155: "const snap = await Promise.race([fetchPromise, timeoutPromise]);"
// Replace with: "const snap = await fetchPromise;"
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Promise.race') && lines[i].includes('fetchPromise') && lines[i].includes('timeoutPromise')) {
    lines[i] = lines[i].replace(
      /await Promise\.race\(\[fetchPromise,\s*timeoutPromise\]\)/,
      'await fetchPromise'
    );
    console.log(`✅ L${i+1}: Removed Promise.race, using direct await`);
  }
}

// ===== FIX 4: Fix the try-catch syntax inside fetchPromise (L149-152) =====
// Current broken code:
//   try { return await getDocs(q); } catch(serverErr) {
//     console.log('...');
//   };    <-- stray semicolon
// Fix: proper structure
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('try { return await getDocs(q); } catch(serverErr)')) {
    // This line is OK but the closing }; on L152 needs fixing
    console.log(`📋 L${i+1}: Found try-catch in fetchPromise`);
  }
  if (lines[i].trim() === '};' && i > 0 && lines[i-1].includes('Don\'t reset')) {
    lines[i] = '      }';
    console.log(`✅ L${i+1}: Fixed stray semicolon in catch block`);
  }
}

inv = lines.join('\n');
fs.writeFileSync(invPath, inv, 'utf8');

console.log('\n🎉 All exact fixes applied!');
console.log('Key changes:');
console.log('  - navigator.onLine gate removed (always tries cloud)');
console.log('  - Timeout: 3s → 60s');
console.log('  - Promise.race removed (no more timeout killing fetch)');
console.log('\nNext: Ctrl+C → npm run dev → F5');