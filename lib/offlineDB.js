// lib/offlineDB.js
// IndexedDB wrapper — No external dependencies needed

const DB_NAME = 'weerakkodi_pos_offline';
const DB_VERSION = 2;

function openDB() {
  return new Promise((resolve, reject) => {
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
        const rc = db.createObjectStore('refCache', { keyPath: 'cacheKey' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── ITEMS ───
export async function saveItemLocal(uid, item, firestoreId = null) {
  const db = await openDB();
  const localId = firestoreId || `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const record = {
    ...item,
    localId,
    firestoreId,
    uid,
    _offlineSaved: true,
    _savedAt: new Date().toISOString(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction('items', 'readwrite');
    tx.objectStore('items').put(record);
    tx.oncomplete = () => resolve(localId);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getItemsLocal(uid) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('items', 'readonly');
    const idx = tx.objectStore('items').index('uid');
    const req = idx.getAll(uid);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteItemLocal(localId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('items', 'readwrite');
    tx.objectStore('items').delete(localId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── SYNC QUEUE ───
export async function addToSyncQueue(uid, operation, collection, data, docId = null) {
  const db = await openDB();
  const entry = {
    uid,
    operation,   // 'add' | 'update' | 'delete'
    collection,
    data,
    docId,
    timestamp: Date.now(),
    retries: 0,
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readwrite');
    tx.objectStore('syncQueue').add(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getSyncQueue(uid) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readonly');
    const idx = tx.objectStore('syncQueue').index('uid');
    const req = idx.getAll(uid);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function removeFromSyncQueue(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readwrite');
    tx.objectStore('syncQueue').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── REFERENCE DATA CACHE (brands, categories, uoms, etc.) ───
export async function cacheRefData(uid, collectionName, data) {
  const db = await openDB();
  const cacheKey = `${uid}_${collectionName}`;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('refCache', 'readwrite');
    tx.objectStore('refCache').put({ cacheKey, data, updatedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedRefData(uid, collectionName) {
  const db = await openDB();
  const cacheKey = `${uid}_${collectionName}`;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('refCache', 'readonly');
    const req = tx.objectStore('refCache').get(cacheKey);
    req.onsuccess = () => resolve(req.result?.data || []);
    req.onerror = () => reject(req.error);
  });
}
