const fs = require('fs');
const wrapperCode = `// ═══════════════════════════════════════════════════════════
// 🔒 firestore-safe.js — Global onSnapshot → getDocs polling
//    Fixes resource-exhausted quota errors on Blaze/Spark plans
//    by eliminating ALL persistent Firestore connections.
// ═══════════════════════════════════════════════════════════
const firestore = require('firebase/firestore');

const POLL_INTERVAL = 120000; // 2 minutes — gentle on quota
let _patchCount = 0;

const _origOnSnapshot = firestore.onSnapshot;

firestore.onSnapshot = function safeOnSnapshot(refOrQuery, ...args) {
  _patchCount++;
  if (_patchCount <= 5) {
    console.log(\`[firewall] onSnapshot #\${_patchCount} → polling mode\`);
  } else if (_patchCount === 6) {
    console.log(\`[firewall] ... more onSnapshot calls intercepted (silent)\`);
  }

  // ── Parse the many onSnapshot overloads ──
  let onNext, onError;
  let startIdx = 0;

  // Skip SnapshotListenOptions if present
  if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0]) &&
      typeof args[0].next !== 'function' &&
      (args[0].includeMetadataChanges !== undefined || args[0].source !== undefined)) {
    startIdx = 1;
  }

  const cb = args[startIdx];
  const errCb = args[startIdx + 1];

  if (typeof cb === 'function') {
    onNext = cb;
    onError = typeof errCb === 'function' ? errCb : undefined;
  } else if (cb && typeof cb === 'object' && typeof cb.next === 'function') {
    onNext = cb.next;
    onError = typeof cb.error === 'function' ? cb.error : undefined;
  } else if (typeof args[0] === 'object' && args[0] !== null && typeof args[0].next === 'function') {
    onNext = args[0].next;
    onError = typeof args[0].error === 'function' ? args[0].error : undefined;
  }

  if (!onNext) {
    console.warn('[firewall] Cannot parse onSnapshot args, using original');
    return _origOnSnapshot.call(this, refOrQuery, ...args);
  }

  // ── Polling implementation ──
  let active = true;

  const doPoll = async () => {
    if (!active) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    try {
      let snap;
      // Check if it is a document reference or a query/collection
      const isDoc = refOrQuery && refOrQuery._key &&
                    refOrQuery._key.path &&
                    refOrQuery._key.path.segments &&
                    refOrQuery._key.path.segments.length % 2 === 0;
      if (isDoc) {
        const docSnap = await firestore.getDoc(refOrQuery);
        snap = {
          docs: docSnap.exists() ? [docSnap] : [],
          docChanges: () => docSnap.exists() ? [{ type: 'modified', doc: docSnap }] : [],
          empty: !docSnap.exists(),
          size: docSnap.exists() ? 1 : 0,
          metadata: { hasPendingWrites: false, fromCache: false }
        };
      } else {
        snap = await firestore.getDocs(refOrQuery);
      }
      if (active) onNext(snap);
    } catch (e) {
      if (e && e.code === 'resource-exhausted') {
        console.warn('[firewall] Quota exceeded, pausing poll 5min');
        active = false;
        setTimeout(() => { active = true; doPoll(); }, 300000);
        return;
      }
      if (active && onError) onError(e);
    }
  };

  // Initial fetch after short delay (let auth settle)
  const initTimer = setTimeout(doPoll, 1500);

  // Poll every 2 minutes
  const pollTimer = setInterval(doPoll, POLL_INTERVAL);

  // Return unsubscribe function
  return () => {
    active = false;
    clearTimeout(initTimer);
    clearInterval(pollTimer);
  };
};

module.exports = firestore;
`;

fs.writeFileSync('C:/Users/chandana/StudioProjects/weerakkodi_pos_app/lib/firestore-safe.js', wrapperCode, 'utf8');
console.log('✅ Created lib/firestore-safe.js');
