// firestore-safe.js — ESM compatible wrapper
import * as _fs from '@firebase/firestore';

const POLL_MS = 120000;
let _n = 0;
const _orig = _fs.onSnapshot;

function safeOnSnapshot(ref, ...args) {
  _n++;
  if (_n <= 3) console.log('[FIREWALL] onSnapshot #' + _n + ' -> polling');
  else if (_n === 4) console.log('[FIREWALL] ...more intercepted');

  let onNext, onError, si = 0;
  if (args[0] && typeof args[0] === 'object' && typeof args[0].next !== 'function' &&
      (args[0].includeMetadataChanges !== undefined || args[0].source !== undefined)) si = 1;
  const cb = args[si], ec = args[si + 1];
  if (typeof cb === 'function') { onNext = cb; onError = typeof ec === 'function' ? ec : null; }
  else if (cb && typeof cb.next === 'function') { onNext = cb.next; onError = typeof cb.error === 'function' ? cb.error : null; }
  else if (args[0] && typeof args[0].next === 'function') { onNext = args[0].next; onError = typeof args[0].error === 'function' ? args[0].error : null; }

  if (!onNext) { console.warn('[FIREWALL] fallback'); return _orig.call(this, ref, ...args); }

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
        console.warn('[FIREWALL] quota, pause 5min');
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
}

export const {
  getFirestore, initializeFirestore, enableIndexedDbPersistence,
  enableMultiTabIndexedDbPersistence, clearIndexedDbPersistence,
  collection, collectionGroup, doc, query, where, orderBy, limit,
  limitToLast, startAt, startAfter, endAt, endBefore,
  getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  writeBatch, runTransaction, increment, arrayUnion, arrayRemove,
  serverTimestamp, Timestamp, GeoPoint, FieldPath, FieldValue,
  snapshotEqual, queryEqual, refEqual,
  enableNetwork, disableNetwork, waitForPendingWrites,
  terminate, loadBundle, namedQuery, connectFirestoreEmulator,
  persistentLocalCache, persistentSingleTabManager, persistentMultipleTabManager,
  memoryLocalCache, memoryEagerGarbageCollector, memoryLruGarbageCollector,
  getAggregateFromServer, getCountFromServer,
  documentId, or, and, average, count, sum,
} = _fs;

export { safeOnSnapshot as onSnapshot };
export default _fs;
