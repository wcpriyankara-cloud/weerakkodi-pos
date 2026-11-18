const fs = require('fs');
const path = 'C:/Users/chandana/StudioProjects/weerakkodi_pos_app/lib/syncService.js';
let code = fs.readFileSync(path, 'utf8');

// 1. Add module-level listener tracking at the top (after imports)
const listenerTracker = `
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
  console.warn(\`⚠️ Quota hit from \${source}, backing off listeners for 60s\`);
  cleanupMirror();
  if (_quotaBackoffTimer) clearTimeout(_quotaBackoffTimer);
  _quotaBackoffTimer = setTimeout(() => {
    console.log('🔄 Quota backoff expired, re-checking...');
    _quotaBackoffTimer = null;
  }, 60000);
}
`;

// Insert after the last import/require block
const insertAfter = "import { localDb } from './localDb';";
if (code.includes(insertAfter) && !code.includes('cleanupMirror')) {
  code = code.replace(insertAfter, insertAfter + '\n' + listenerTracker);
  console.log('✅ Added listener tracker & cleanup functions');
} else if (code.includes('cleanupMirror')) {
  console.log('⏭️ Listener tracker already exists');
}

// 2. Replace the startMirror function to use cleanup + track unsubscribes
const oldMirrorStart = "function startMirror(uid)";
const oldMirrorPattern = /function startMirror\(uid\)\s*\{[\s\S]*?console\.log\(`🪞 Mirror started for uid=\$\{uid\.slice\(0,10\)\}:\s*\$\{tables\.join\(', '\)\}`\);[\s\S]*?\}/;

const newMirrorFn = `function startMirror(uid) {
  // Singleton guard: cleanup old listeners first
  cleanupMirror();
  if (_quotaBackoffTimer) {
    console.log('⏳ Quota backoff active, skipping mirror start');
    return;
  }
  _mirrorActive = true;
  const tables = ['items', 'customers', 'invoices', 'purchases', 'suppliers'];

  tables.forEach(col => {
    try {
      const table = localDb[col];
      if (!table) return;
      const q = query(collection(db, col), where('uid', '==', uid));
      const unsub = onSnapshot(q,
        async (snap) => {
          if (!_mirrorActive) return;
          try {
            for (const change of snap.docChanges()) {
              await applyDoc(table, change.doc, change.type);
            }
          } catch (e) {
            if (isQuotaError(e)) handleQuotaBackoff('mirror-apply-' + col);
          }
        },
        (err) => {
          console.error(\`❌ Mirror error [\${col}]:\`, err?.message || err);
          if (isQuotaError(err)) handleQuotaBackoff('mirror-listen-' + col);
        }
      );
      _mirrorUnsubs.push(unsub);
    } catch (e) {
      console.error(\`❌ Failed to start mirror for \${col}:\`, e?.message || e);
    }
  });

  console.log(\`🪞 Mirror started for uid=\${uid.slice(0,10)}: \${tables.join(', ')} (\${_mirrorUnsubs.length} listeners)\`);
}`;

if (code.includes('function startMirror(uid)')) {
  // Find and replace the entire startMirror function
  const startIdx = code.indexOf('function startMirror(uid)');
  if (startIdx !== -1) {
    // Find the end of the function by counting braces
    let braceCount = 0;
    let endIdx = startIdx;
    let started = false;
    for (let i = startIdx; i < code.length; i++) {
      if (code[i] === '{') { braceCount++; started = true; }
      if (code[i] === '}') { braceCount--; }
      if (started && braceCount === 0) { endIdx = i + 1; break; }
    }
    code = code.slice(0, startIdx) + newMirrorFn + code.slice(endIdx);
    console.log('✅ Replaced startMirror with cleanup-enabled version');
  }
}

// 3. Add cleanup call at the beginning of initSync to prevent duplicate init
const oldInitSync = "async function initSync(uid)";
if (code.includes(oldInitSync) && !code.includes('_initInProgress')) {
  // Find initSync and add guard
  const initIdx = code.indexOf(oldInitSync);
  if (initIdx !== -1) {
    const braceStart = code.indexOf('{', initIdx);
    const guardCode = `\n  if (_initInProgress) { console.log('⏳ initSync already running, skip'); return; }\n  _initInProgress = true;\n  try {\n  cleanupMirror(); // Clean up any stale listeners from hot reload`;
    code = code.slice(0, braceStart + 1) + guardCode + code.slice(braceStart + 1);
    
    // Find the end of initSync to add finally block
    let braceCount = 0;
    let endIdx = braceStart;
    for (let i = braceStart; i < code.length; i++) {
      if (code[i] === '{') braceCount++;
      if (code[i] === '}') braceCount--;
      if (braceCount === 0) { endIdx = i; break; }
    }
    code = code.slice(0, endIdx) + '\n  } finally { _initInProgress = false; }' + code.slice(endIdx);
    console.log('✅ Added singleton guard to initSync');
  }
}

// 4. Fix onOnline handler to also cleanup before restart
if (code.includes("window.addEventListener('online'")) {
  code = code.replace(
    /window\.addEventListener\('online',\s*\(\)\s*=>\s*\{/,
    "window.addEventListener('online', () => {\n    cleanupMirror(); // Reset listeners on reconnect"
  );
  console.log('✅ Added cleanup to online handler');
}

fs.writeFileSync(path, code, 'utf8');
console.log('✅ syncService.js updated with listener cleanup & quota backoff!');
