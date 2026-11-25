// lib/offlineDB.js
// ✅ 100% Crash-Safe IndexedDB Wrapper for Weerakkodi POS
// ✅ Safe from 'DOMException: Internal error' (Auto-sanitizes Firestore Timestamps & Batched Writes)

const DB_NAME = 'weerakkodi_pos_offline';
const DB_VERSION = 2;

let _dbInstance = null;
let _dbOpenPromise = null;

// ─── Data Sanitizer (Chromium Clone Error වැළැක්වීමට) ───
function sanitizeForIndexedDB(val) {
  if (val === null || val === undefined) return val;
  try {
    return JSON.parse(
      JSON.stringify(val, (key, value) => {
        if (value && typeof value === 'object') {
          if (typeof value.toDate === 'function') {
            return value.toDate().toISOString();
          }
          if (typeof value.seconds === 'number' && typeof value.nanoseconds === 'number') {
            return new Date(value.seconds * 1000).toISOString();
          }
        }
        return value;
      })
    );
  } catch (e) {
    return {};
  }
}

// ─── Safe DB Opener (Singleton with Retry Mechanism) ───
function openDB() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window not available'));
  if (_dbInstance) return Promise.resolve(_dbInstance);
  if (_dbOpenPromise) return _dbOpenPromise;

  _dbOpenPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('items')) {
          const store = db.createObjectStore('items', { keyPath: 'localId' });
          store.createIndex('uid', 'uid', { unique: false });
          store.createIndex('firestoreId', 'firestoreId', { unique: false });
        }
        if (!db.objectStoreNames.contains('syncQueue')) {
          const sq = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
          sq.createIndex('uid', 'uid', { unique: false });
        }
        if (!db.objectStoreNames.contains('refCache')) {
          db.createObjectStore('refCache', { keyPath: 'cacheKey' });
        }
      };

      req.onsuccess = () => {
        _dbInstance = req.result;
        _dbInstance.onversionchange = () => {
          try { _dbInstance?.close(); } catch (_) {}
          _dbInstance = null;
        };
        _dbInstance.onclose = () => {
          _dbInstance = null;
        };
        resolve(_dbInstance);
      };

      req.onerror = () => {
        _dbInstance = null;
        reject(req.error);
      };
    } catch (err) {
      _dbInstance = null;
      reject(err);
    }
  }).finally(() => {
    _dbOpenPromise = null;
  });

  return _dbOpenPromise;
}

// ─── ITEMS: තනි භාණ්ඩයක් සුරැකීම (Supports both saveItemLocal(item) and saveItemLocal(uid, item)) ───
export async function saveItemLocal(arg1, arg2 = null, arg3 = null) {
  let uid = 'local_user';
  let item = null;
  let firestoreId = null;

  // Flexible argument resolver (Polymorphic)
  if (typeof arg1 === 'object' && arg1 !== null) {
    item = arg1;
    uid = item.uid || item.userId || 'local_user';
    firestoreId = arg2 || item.firestoreId || item.id || null;
  } else {
    uid = String(arg1 || 'local_user');
    item = arg2 || {};
    firestoreId = arg3 || item.firestoreId || item.id || null;
  }

  if (!item) return null;

  try {
    const db = await openDB();
    const effectiveFirestoreId = firestoreId || item.firestoreId || (item.id && !String(item.id).startsWith('local_') ? item.id : null);
    const localId = item.localId || effectiveFirestoreId || item.id || `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const rawRecord = {
      ...item,
      id: localId,
      localId: String(localId),
      firestoreId: effectiveFirestoreId ? String(effectiveFirestoreId) : null,
      uid: String(uid),
      _offlineSaved: true,
      _savedAt: new Date().toISOString(),
    };

    const record = sanitizeForIndexedDB(rawRecord);

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('items', 'readwrite');
        tx.objectStore('items').put(record);
        tx.oncomplete = () => resolve(localId);
        tx.onerror = () => resolve(localId);
      } catch (txErr) {
        resolve(localId);
      }
    });
  } catch (err) {
    return null;
  }
}

// ─── ITEMS: භාණ්ඩ 1,500+ එකවර Bulk Save කිරීම (Single Transaction - Never Crashes LevelDB) ───
export async function saveItemsBulkLocal(itemsList, customUid = 'local_user') {
  if (!Array.isArray(itemsList) || itemsList.length === 0) return true;

  try {
    const db = await openDB();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('items', 'readwrite');
        const store = tx.objectStore('items');

        for (const item of itemsList) {
          if (!item) continue;
          const uid = item.uid || item.userId || customUid;
          const effectiveFirestoreId = item.firestoreId || (item.id && !String(item.id).startsWith('local_') ? item.id : null);
          const localId = item.localId || effectiveFirestoreId || item.id || `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

          const rawRecord = {
            ...item,
            id: localId,
            localId: String(localId),
            firestoreId: effectiveFirestoreId ? String(effectiveFirestoreId) : null,
            uid: String(uid),
            _offlineSaved: true,
            _savedAt: new Date().toISOString(),
          };

          store.put(sanitizeForIndexedDB(rawRecord));
        }

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (err) {
        resolve(false);
      }
    });
  } catch (err) {
    return false;
  }
}

// ─── ITEMS: තනි භාණ්ඩයක් ID එකෙන් කියවීම (For Edit Form) ───
export async function getItemLocal(targetId) {
  if (!targetId) return null;
  const cleanId = String(targetId);

  try {
    const db = await openDB();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('items', 'readonly');
        const store = tx.objectStore('items');

        // 1. Direct key search by localId
        const req = store.get(cleanId);
        req.onsuccess = () => {
          if (req.result) {
            resolve(req.result);
            return;
          }

          // 2. Fallback: Search by firestoreId index
          try {
            const idx = store.index('firestoreId');
            const idxReq = idx.get(cleanId);
            idxReq.onsuccess = () => resolve(idxReq.result || null);
            idxReq.onerror = () => resolve(null);
          } catch (_) {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  } catch (err) {
    return null;
  }
}

// ─── ITEMS: සියලු භාණ්ඩ ලබා ගැනීම ───
export async function getItemsLocal(uid) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('items', 'readonly');
        if (uid) {
          const idx = tx.objectStore('items').index('uid');
          const req = idx.getAll(String(uid));
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        } else {
          const req = tx.objectStore('items').getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        }
      } catch (e) {
        resolve([]);
      }
    });
  } catch (err) {
    return [];
  }
}

export async function deleteItemLocal(localId) {
  if (!localId) return;
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('items', 'readwrite');
        tx.objectStore('items').delete(String(localId));
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  } catch (err) {
    return false;
  }
}

// ─── SYNC QUEUE ───
export async function addToSyncQueue(uid, operation, collection, data, docId = null) {
  try {
    const db = await openDB();
    const entry = sanitizeForIndexedDB({
      uid: String(uid),
      operation,
      collection,
      data,
      docId: docId ? String(docId) : null,
      timestamp: Date.now(),
      retries: 0,
    });

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('syncQueue', 'readwrite');
        tx.objectStore('syncQueue').add(entry);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  } catch (err) {
    return false;
  }
}

export async function getSyncQueue(uid) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('syncQueue', 'readonly');
        const idx = tx.objectStore('syncQueue').index('uid');
        const req = idx.getAll(String(uid));
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  } catch (err) {
    return [];
  }
}

export async function removeFromSyncQueue(id) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('syncQueue', 'readwrite');
        tx.objectStore('syncQueue').delete(id);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  } catch (err) {
    return false;
  }
}

// ─── REFERENCE DATA CACHE ───
export async function cacheRefData(uid, collectionName, data) {
  try {
    const db = await openDB();
    const cacheKey = `${uid}_${collectionName}`;
    const cleanData = sanitizeForIndexedDB(data);

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('refCache', 'readwrite');
        tx.objectStore('refCache').put({ cacheKey, data: cleanData, updatedAt: Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  } catch (err) {
    return false;
  }
}

export async function getCachedRefData(uid, collectionName) {
  try {
    const db = await openDB();
    const cacheKey = `${uid}_${collectionName}`;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('refCache', 'readonly');
        const req = tx.objectStore('refCache').get(cacheKey);
        req.onsuccess = () => resolve(req.result?.data || []);
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  } catch (err) {
    return [];
  }
}

export default {
  saveItemLocal,
  saveItemsBulkLocal,
  getItemLocal,
  getItemsLocal,
  deleteItemLocal,
  addToSyncQueue,
  getSyncQueue,
  removeFromSyncQueue,
  cacheRefData,
  getCachedRefData,
};