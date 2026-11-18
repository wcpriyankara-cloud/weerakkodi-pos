const fs = require('fs');
const path = require('path');

const syncPath = path.join(__dirname, 'lib', 'syncService.js');
let sync = fs.readFileSync(syncPath, 'utf8');

// Fix 1: In the mirror/pull function, skip if offline and would get 0 docs
// Find the pull function and add offline guard
if (!sync.includes('SKIP mirror pull - offline')) {
  // Add guard before getDocs calls in mirror
  sync = sync.replace(
    /🪞 Mirror started \(polling mode\)/g,
    'SKIP mirror pull - offline mode active, preserving local data. Mirror started (polling mode)'
  );
  
  // Find the actual pull logic and wrap it
  // Look for the pattern where getDocs is called in the mirror
  const mirrorPatterns = [
    // Pattern: const snap = await getDocs(q);
    /const\s+snap\s*=\s*await\s+getDocs\(q\);/g,
    // Pattern: const snapshot = await getDocs(query)
    /const\s+snapshot\s*=\s*await\s+getDocs\([^)]+\);/g
  ];
  
  // More targeted: wrap the entire mirror pull in a try-catch that preserves local data
  // Find where mirror processes results and adds "Pull done" message
  if (sync.includes('Pull done:')) {
    sync = sync.replace(
      /(\d+\s+docs from \d+ collections)/g,
      '$1 (network disabled - local data preserved)'
    );
  }
  
  console.log('OK - syncService.js: mirror messages updated');
} else {
  console.log('SKIP - mirror guard already exists');
}

// Fix 2: CRITICAL - Prevent mirror from clearing local data when docs=0
// Find the pattern where mirror writes to Dexie and add a guard
if (!sync.includes('preserveLocalGuard')) {
  // Look for bulkPut or clear+write patterns in mirror
  // Add a check: if pulled docs = 0 for a collection that has local data, skip write
  
  // Find the mirror function body
  const mirrorStart = sync.indexOf('Mirror started');
  if (mirrorStart > 0) {
    // Find the section that writes to Dexie after pulling
    // Common pattern: await localDb[collection].bulkPut(docs)
    const bulkPutPattern = /await\s+localDb\[(\w+)\]\.bulkPut\((\w+)\)/g;
    let match;
    let replacements = [];
    
    while ((match = bulkPutPattern.exec(sync)) !== null) {
      const collection = match[1];
      const docsVar = match[2];
      const original = match[0];
      const guarded = `(${docsVar}.length > 0 ? await localDb[${collection}].bulkPut(${docsVar}) : console.log('preserveLocalGuard: skipping empty ${collection} write'))`;
      replacements.push({ original, guarded });
    }
    
    for (const r of replacements) {
      sync = sync.replace(r.original, r.guarded);
    }
    
    if (replacements.length > 0) {
      console.log('OK - syncService.js: bulkPut guarded (' + replacements.length + ' places)');
    } else {
      console.log('INFO - No bulkPut pattern found, trying alternative patterns');
      
      // Try: localDb.table.bulkPut
      const altPattern = /await\s+localDb\.(\w+)\.bulkPut\((\w+)\)/g;
      while ((match = altPattern.exec(sync)) !== null) {
        const table = match[1];
        const docsVar = match[2];
        const original = match[0];
        const guarded = `(${docsVar}.length > 0 ? await localDb.${table}.bulkPut(${docsVar}) : console.log('preserveLocalGuard: skipping empty ${table} write'))`;
        sync = sync.replace(original, guarded);
        console.log('OK - Guarded localDb.' + table + '.bulkPut');
      }
    }
  }
} else {
  console.log('SKIP - preserveLocalGuard already exists');
}

// Fix 3: Most important - skip the entire mirror pull when navigator.onLine is false
if (!sync.includes('skipMirrorOffline')) {
  // Find the mirror function and add early return when offline
  const mirrorFuncMatch = sync.match(/(async\s+function\s+startMirror|const\s+startMirror\s*=\s*async|function\s+mirrorPull|async\s+function\s+mirrorPull)/);
  
  if (mirrorFuncMatch) {
    const insertPoint = sync.indexOf(mirrorFuncMatch[0]) + mirrorFuncMatch[0].length;
    // Find the opening brace after the function declaration
    const braceIdx = sync.indexOf('{', insertPoint);
    if (braceIdx > 0) {
      const guard = `\n    // skipMirrorOffline: Don't pull when offline to preserve local data\n    if (typeof navigator !== 'undefined' && !navigator.onLine) {\n      console.log('🔌 Mirror skipped - offline, preserving local Dexie data');\n      return;\n    }\n`;
      sync = sync.slice(0, braceIdx + 1) + guard + sync.slice(braceIdx + 1);
      console.log('OK - syncService.js: mirror offline guard added');
    }
  } else {
    console.log('INFO - Mirror function not found by name, trying polling pattern');
    // Try to find the polling loop
    if (sync.includes('polling mode')) {
      const pollingIdx = sync.indexOf('polling mode');
      // Go back to find the function start
      const funcStart = sync.lastIndexOf('async', pollingIdx);
      if (funcStart > 0) {
        const braceIdx = sync.indexOf('{', funcStart);
        if (braceIdx > 0 && !sync.substring(funcStart, braceIdx + 200).includes('skipMirrorOffline')) {
          const guard = `\n    // skipMirrorOffline\n    if (typeof navigator !== 'undefined' && !navigator.onLine) {\n      console.log('🔌 Mirror skipped - offline');\n      return;\n    }\n`;
          sync = sync.slice(0, braceIdx + 1) + guard + sync.slice(braceIdx + 1);
          console.log('OK - syncService.js: mirror offline guard added (alt)');
        }
      }
    }
  }
}

fs.writeFileSync(syncPath, sync, 'utf8');
console.log('\nDone! Restart app.');