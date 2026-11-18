const fs = require('fs');

// ===== 1. Patch firebase-config.js =====
let fc = fs.readFileSync('firebase-config.js', 'utf8');

// 1a. Add disableNetwork right after db creation (before auth/storage)
if (!fc.includes('Startup network disable')) {
  fc = fc.replace(
    'const auth = getAuth(app);',
    `// 🔒 Startup network disable — onSnapshot quota errors 100% නවත්වයි
// සියලුම onSnapshot listeners local cache එකෙන් පමණක් data කියවයි
if (db) disableNetwork(db).catch(() => {});

const auth = getAuth(app);`
  );
  console.log('  ✅ disableNetwork(db) added at startup');
} else {
  console.log('  ⏭️ disableNetwork already present');
}

// 1b. Fix online handler — don't auto-enable network when going online
// (syncService එක manage කරනවා)
const oldHandler = `if (navigator.onLine) {
        await enableNetwork(db);
      } else {
        await disableNetwork(db);
      }`;

const newHandler = `if (!navigator.onLine) {
        await disableNetwork(db);
      }
      // 🔒 Online වූ විට auto-enable නොකරයි — syncService manage කරයි`;

if (fc.includes('await enableNetwork(db)') && fc.includes('navigator.onLine')) {
  fc = fc.replace(oldHandler, newHandler);
  console.log('  ✅ Online handler fixed (no auto-enable)');
} else {
  console.log('  ⏭️ Online handler already fixed or different format');
}

fs.writeFileSync('firebase-config.js', fc, 'utf8');
console.log('✅ firebase-config.js patched!\n');

// ===== 2. Show syncService startMirror for next step =====
let ss = fs.readFileSync('lib/syncService.js', 'utf8');

// Find startMirror function
const mirrorStart = ss.indexOf('function startMirror');
const mirrorStart2 = ss.indexOf('async function startMirror');
const start = mirrorStart >= 0 ? mirrorStart : mirrorStart2;

if (start >= 0) {
  // Find the end (next function or end of relevant block)
  const nextFunc = ss.indexOf('\nexport ', start + 10);
  const nextFunc2 = ss.indexOf('\nfunction ', start + 10);
  const nextFunc3 = ss.indexOf('\nasync function ', start + 10);
  let end = ss.length;
  [nextFunc, nextFunc2, nextFunc3].forEach(pos => {
    if (pos > start && pos < end) end = pos;
  });
  console.log('=== startMirror function ===');
  console.log(ss.slice(start, Math.min(end, start + 2000)));
} else {
  console.log('⚠️ startMirror not found, searching for polling...');
  const pollIdx = ss.indexOf('setInterval');
  if (pollIdx >= 0) {
    console.log(ss.slice(Math.max(0, pollIdx - 500), pollIdx + 500));
  }
}

// Show imports
console.log('\n=== syncService imports ===');
const importEnd = ss.indexOf('\n\n');
console.log(ss.slice(0, Math.min(importEnd > 0 ? importEnd : 500, 500)));
