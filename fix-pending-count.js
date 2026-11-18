const fs = require('fs');
const path = require('path');

// 1. syncService.js fix
const syncPath = path.join(__dirname, 'lib', 'syncService.js');
let syncCode = fs.readFileSync(syncPath, 'utf8');
let changes = 0;

// setPendingSyncCount calls වලට CLOUD_SYNC_DISABLED check add කරන්න
// Pattern: setPendingSyncCount(something)
const pendingPattern = /setPendingSyncCount\(([^)]+)\)/g;
let match;
const replacements = [];

while ((match = pendingPattern.exec(syncCode)) !== null) {
  const fullMatch = match[0];
  const arg = match[1];
  // Already guarded?
  if (syncCode.substring(Math.max(0, match.index - 50), match.index).includes('CLOUD_SYNC_DISABLED')) {
    continue;
  }
  replacements.push({
    index: match.index,
    original: fullMatch,
    replacement: `(CLOUD_SYNC_DISABLED ? setPendingSyncCount(0) : setPendingSyncCount(${arg}))`
  });
}

// Apply replacements in reverse order to preserve indices
for (let i = replacements.length - 1; i >= 0; i--) {
  const r = replacements[i];
  syncCode = syncCode.slice(0, r.index) + r.replacement + syncCode.slice(r.index + r.original.length);
  changes++;
}

if (changes > 0) {
  fs.writeFileSync(syncPath, syncCode, 'utf8');
  console.log(`✅ ${changes} setPendingSyncCount calls guarded in syncService.js`);
} else {
  console.log('⚠️ No setPendingSyncCount calls found in syncService.js');
  console.log('   POSInvoice.jsx එකේ තියෙන්න පුළුවන්...');
}

// 2. POSInvoice.jsx fix - pendingSyncCount state එක offline එකේ 0 කරන්න
const posPath = path.join(__dirname, 'components', 'POSInvoice.jsx');
if (fs.existsSync(posPath)) {
  let posCode = fs.readFileSync(posPath, 'utf8');
  let posChanges = 0;

  // Find where pendingSyncCount is set and add offline guard
  const posPendingPattern = /setPendingSyncCount\(([^)]+)\)/g;
  const posReplacements = [];

  while ((match = posPendingPattern.exec(posCode)) !== null) {
    const fullMatch = match[0];
    const arg = match[1];
    if (posCode.substring(Math.max(0, match.index - 80), match.index).includes('CLOUD_SYNC_DISABLED')) {
      continue;
    }
    posReplacements.push({
      index: match.index,
      original: fullMatch,
      replacement: `setPendingSyncCount(0)`
    });
  }

  for (let i = posReplacements.length - 1; i >= 0; i--) {
    const r = posReplacements[i];
    posCode = posCode.slice(0, r.index) + r.replacement + posCode.slice(r.index + r.original.length);
    posChanges++;
  }

  if (posChanges > 0) {
    fs.writeFileSync(posPath, posCode, 'utf8');
    console.log(`✅ ${posChanges} setPendingSyncCount calls fixed in POSInvoice.jsx`);
  }
}

// 3. POS page.jsx fix
const pagePath = path.join(__dirname, 'app', '(dashboard)', 'pos', 'page.jsx');
if (fs.existsSync(pagePath)) {
  let pageCode = fs.readFileSync(pagePath, 'utf8');
  let pageChanges = 0;

  const pagePendingPattern = /setPendingSyncCount\(([^)]+)\)/g;
  const pageReplacements = [];

  while ((match = pagePendingPattern.exec(pageCode)) !== null) {
    const fullMatch = match[0];
    pageReplacements.push({
      index: match.index,
      original: fullMatch,
      replacement: `setPendingSyncCount(0)`
    });
  }

  for (let i = pageReplacements.length - 1; i >= 0; i--) {
    const r = pageReplacements[i];
    pageCode = pageCode.slice(0, r.index) + r.replacement + pageCode.slice(r.index + r.original.length);
    pageChanges++;
  }

  if (pageChanges > 0) {
    fs.writeFileSync(pagePath, pageCode, 'utf8');
    console.log(`✅ ${pageChanges} setPendingSyncCount calls fixed in pos/page.jsx`);
  }
}

console.log('\n🔄 App restart කරන්න: Ctrl+C → npm run dev');