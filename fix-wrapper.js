const fs = require('fs');
const code = `// ═══════════════════════════════════════════════════════════
// firestore-safe.js — onSnapshot → getDocs polling wrapper
// Uses @firebase/firestore (internal) to avoid alias loop
// ═══════════════════════════════════════════════════════════
const _fs = require('@firebase/firestore');
const POLL_MS = 120000;
let _n = 0;

const _orig = _fs.onSnapshot;

_fs.onSnapshot = function safeOnSnapshot(ref, ...args) {
  _n++;
  if (_n <= 3) console.log('[firewall] onSnapshot #' + _n + ' -> polling');
  else if (_n === 4) console.log('[firewall] ...more intercepted (silent)');

  let onNext, onError, si = 0;
  if (args[0] && typeof args[0] === 'object' && typeof args[0].next !== 'function' &&
      (args[0].includeMetadataChanges !== undefined || args[0].source !== undefined)) si = 1;
  const cb = args[si], ec = args[si + 1];
  if (typeof cb === 'function') { onNext = cb; onError = typeof ec === 'function' ? ec : null; }
  else if (cb && typeof cb.next === 'function') { onNext = cb.next; onError = typeof cb.error === 'function' ? cb.error : null; }
  else if (args[0] && typeof args[0].next === 'function') { onNext = args[0].next; onError = typeof args[0].error === 'function' ? args[0].error : null; }

  if (!onNext) { console.warn('[firewall] fallback to orig'); return _orig.call(this, ref, ...args); }

  let active = true;
  const poll = async () => {
    if (!active) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    try {
      const isDoc = ref && ref._key && ref._key.path && ref._key.path.segments && ref._key.path.segments.length % 2 === 0;
      let snap;
      if (isDoc) {
        const d = await _fs.getDoc(ref);
        snap = { docs: d.exists() ? [d] : [], docChanges: () => d.exists() ? [{ type: 'modified', doc: d }] : [], empty: !d.exists(), size: d.exists() ? 1 : 0, metadata: { hasPendingWrites: false, fromCache: false } };
      } else {
        snap = await _fs.getDocs(ref);
      }
      if (active) onNext(snap);
    } catch (e) {
      if (e && e.code === 'resource-exhausted') {
        console.warn('[firewall] quota hit, pause 5min');
        active = false;
        setTimeout(() => { active = true; poll(); }, 300000);
        return;
      }
      if (active && onError) onError(e);
    }
  };

  const t1 = setTimeout(poll, 1500);
  const t2 = setInterval(poll, POLL_MS);
  return () => { active = false; clearTimeout(t1); clearInterval(t2); };
};

module.exports = _fs;
`;

fs.writeFileSync('C:/Users/chandana/StudioProjects/weerakkodi_pos_app/lib/firestore-safe.js', code, 'utf8');
console.log('✅ firestore-safe.js rewritten with @firebase/firestore (no circular dep)');
