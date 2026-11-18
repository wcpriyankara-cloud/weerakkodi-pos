const fs = require('fs');
const path = 'C:/Users/chandana/StudioProjects/weerakkodi_pos_app/lib/syncService.js';
let code = fs.readFileSync(path, 'utf8');

// Find and replace the entire startMirror function
const startIdx = code.indexOf('function startMirror(uid)');
if (startIdx === -1) {
  console.log('ERROR: startMirror not found!');
  process.exit(1);
}

// Find end of function by brace counting
let braceCount = 0;
let endIdx = startIdx;
let started = false;
for (let i = startIdx; i < code.length; i++) {
  if (code[i] === '{') { braceCount++; started = true; }
  if (code[i] === '}') braceCount--;
  if (started && braceCount === 0) { endIdx = i + 1; break; }
}

const newStartMirror = `function startMirror(uid) {
  // Singleton guard: cleanup old listeners/pollers first
  cleanupMirror();
  if (_quotaBackoffTimer) {
    console.log('⏳ Quota backoff active, skipping mirror start');
    return;
  }
  _mirrorActive = true;
  const tables = ['items', 'customers', 'invoices', 'purchases', 'suppliers'];

  // ═══════════════════════════════════════════════════════════
  // 📥 POLLING MODE: getDocs instead of onSnapshot
  //    Avoids persistent connections that trigger quota errors
  //    on Blaze/Spark plans with high read volumes.
  // ═══════════════════════════════════════════════════════════
  let _pullInProgress = false;

  const pullFromFirestore = async () => {
    if (!_mirrorActive || _pullInProgress) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (quotaBlocked()) return;
    _pullInProgress = true;

    let totalDocs = 0;
    for (const col of tables) {
      try {
        const table = localDb[col];
        if (!table) continue;
        const q = query(collection(db, col), where('uid', '==', uid));
        const snap = await getDocs(q);
        for (const d of snap.docs) {
          await applyDoc(table, d, 'modified');
          totalDocs++;
        }
      } catch (e) {
        if (isQuotaError(e)) {
          handleQuotaBackoff('pull-' + col);
          _pullInProgress = false;
          return;
        }
        console.error(\`❌ Pull error [\${col}]:\`, e?.message || e);
      }
    }
    console.log(\`📥 Pull done: \${totalDocs} docs from \${tables.length} collections\`);
    _pullInProgress = false;
  };

  // Initial pull (delayed 3s to let auth settle)
  const initTimer = setTimeout(pullFromFirestore, 3000);
  _mirrorUnsubs.push(() => clearTimeout(initTimer));

  // Poll every 5 minutes (300s) — gentle on quota
  const pollTimer = setInterval(pullFromFirestore, 300000);
  _mirrorUnsubs.push(() => clearInterval(pollTimer));

  // Also pull on online event
  const onlinePull = () => {
    if (_mirrorActive) {
      console.log('🌐 Online detected, pulling fresh data...');
      setTimeout(pullFromFirestore, 2000);
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('online', onlinePull);
    _mirrorUnsubs.push(() => window.removeEventListener('online', onlinePull));
  }

  console.log(\`🪞 Mirror started (polling mode) for uid=\${uid.slice(0,10)}: \${tables.join(', ')}\`);
}`;

code = code.slice(0, startIdx) + newStartMirror + code.slice(endIdx);

// Also need to make sure getDocs is imported
if (!code.includes('getDocs') || !code.match(/import.*getDocs.*from.*firebase/)) {
  // Check if getDocs is in the import line
  const importMatch = code.match(/import\s*\{([^}]+)\}\s*from\s*['"]firebase\/firestore['"]/);
  if (importMatch && !importMatch[1].includes('getDocs')) {
    code = code.replace(
      importMatch[0],
      importMatch[0].replace(importMatch[1], importMatch[1] + ', getDocs')
    );
    console.log('✅ Added getDocs to imports');
  }
}

fs.writeFileSync(path, code, 'utf8');
console.log('✅ startMirror replaced with polling mode (getDocs every 5min)');
console.log('✅ No more persistent onSnapshot connections!');
