const fs = require('fs');
const path = 'C:/Users/chandana/StudioProjects/weerakkodi_pos_app/lib/syncService.js';
let code = fs.readFileSync(path, 'utf8');

// Check what is missing
const hasCleanup = code.includes('function cleanupMirror()');
const hasTracker = code.includes('_mirrorUnsubs');
const hasInitGuard = code.includes('_initInProgress');

console.log('Status check:');
console.log('  cleanupMirror:', hasCleanup ? '✅' : '❌ MISSING');
console.log('  _mirrorUnsubs:', hasTracker ? '✅' : '❌ MISSING');
console.log('  _initInProgress:', hasInitGuard ? '✅' : '❌ MISSING');

if (!hasCleanup || !hasTracker) {
  // Find a good insertion point - after the last import line
  const lines = code.split('\n');
  let lastImportLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('import ')) lastImportLine = i;
  }
  
  const trackerCode = `
// ═══════════════════════════════════════════════════════════
// 🔒 Listener cleanup & singleton guard (hot-reload safe)
// ═══════════════════════════════════════════════════════════
let _mirrorUnsubs = [];
let _mirrorActive = false;
let _quotaBackoffTimer = null;
let _initInProgress = false;

function cleanupMirror() {
  if (_mirrorUnsubs.length > 0) {
    console.log(\`🧹 Cleaning up \${_mirrorUnsubs.length} old listeners\`);
    _mirrorUnsubs.forEach(fn => { try { fn(); } catch(e) {} });
    _mirrorUnsubs = [];
  }
  _mirrorActive = false;
}

function isQuotaError(err) {
  if (!err) return false;
  const msg = (err.message || err.code || '').toString().toLowerCase();
  return msg.includes('resource-exhausted') || msg.includes('quota');
}

function handleQuotaBackoff(source) {
  console.warn(\`⚠️ Quota hit from \${source}, backing off 60s\`);
  cleanupMirror();
  if (_quotaBackoffTimer) clearTimeout(_quotaBackoffTimer);
  _quotaBackoffTimer = setTimeout(() => {
    console.log('🔄 Quota backoff expired');
    _quotaBackoffTimer = null;
  }, 60000);
}
`;
  
  if (lastImportLine >= 0) {
    lines.splice(lastImportLine + 1, 0, trackerCode);
    code = lines.join('\n');
    console.log('✅ Inserted listener tracker after line ' + (lastImportLine + 1));
  } else {
    // Fallback: insert at top after 'use client' or first line
    code = trackerCode + '\n' + code;
    console.log('✅ Inserted listener tracker at top of file');
  }
}

if (!hasInitGuard) {
  // Add singleton guard to initSync
  const initMatch = code.match(/(async\s+function\s+initSync\s*\(\s*uid\s*\)\s*\{)/);
  if (initMatch) {
    const guard = `\n  if (_initInProgress) { console.log('⏳ initSync already running'); return; }\n  _initInProgress = true;\n  cleanupMirror();\n  try {`;
    code = code.replace(initMatch[0], initMatch[0] + guard);
    
    // Find the closing brace of initSync to add finally
    const initIdx = code.indexOf(initMatch[0]);
    const braceStart = code.indexOf('{', initIdx);
    let depth = 0;
    let endIdx = braceStart;
    for (let i = braceStart; i < code.length; i++) {
      if (code[i] === '{') depth++;
      if (code[i] === '}') depth--;
      if (depth === 0) { endIdx = i; break; }
    }
    code = code.slice(0, endIdx) + '\n  } finally { _initInProgress = false; }' + code.slice(endIdx);
    console.log('✅ Added singleton guard to initSync');
  } else {
    console.log('⚠️ Could not find initSync function');
  }
}

fs.writeFileSync(path, code, 'utf8');
console.log('✅ syncService.js fully patched!');
