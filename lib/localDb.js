// lib/localDb.js

import Dexie from 'dexie';

function initLocalDb() {
  const db = new Dexie('WeerakkodiPOS_DB');

  db.version(6).stores({
    customers:        'id, uid, name, phone, currentBalance, synced, createdAt, updatedAt',
    invoices:         'id, invoiceNo, uid, grandTotal, paidAmount, balance, paymentMethod, status, synced, createdAt',
    purchases:        'id, uid, supplierId, invoiceNo, grandTotal, paidAmount, balance, paymentMethod, status, synced, createdAt',
    items:            'id, uid, name, barcode, sellingPrice, costPrice, quantity, synced, updatedAt',
    suppliers:        'id, uid, name, phone, email, currentBalance, synced, createdAt, updatedAt',
    customerLoans:    'id, uid, customerId, invoiceId, amount, date, type, status, synced',
    cashTransactions: 'id, uid, type, amount, description, date, synced, createdAt, invoiceId',
    payments:         'id, uid, invoiceId, supplierId, amount, date, synced, createdAt',
    settings:         'id, uid, userId',
  });

  db.version(7).stores({
    customers:        'id, uid, name, phone, currentBalance, synced, createdAt, updatedAt',
    invoices:         'id, invoiceNo, uid, grandTotal, paidAmount, balance, paymentMethod, status, synced, createdAt',
    purchases:        'id, uid, supplierId, invoiceNo, grandTotal, paidAmount, balance, paymentMethod, status, synced, createdAt',
    items:            'id, uid, name, barcode, sellingPrice, costPrice, quantity, synced, updatedAt',
    suppliers:        'id, uid, name, phone, email, currentBalance, synced, createdAt, updatedAt',
    customerLoans:    'id, uid, customerId, invoiceId, amount, date, type, status, synced',
    cashTransactions: 'id, uid, type, amount, description, date, synced, createdAt, invoiceId',
    payments:         'id, uid, invoiceId, supplierId, amount, date, synced, createdAt',
    settings:         'id, uid, userId',
    syncQueue:        '++id, uid, operation, collection, docId, processed, timestamp',
  });

  db.version(8).stores({
    customers:        'id, uid, name, phone, currentBalance, balance, outstandingBalance, synced, _synced, createdAt, updatedAt',
    invoices:         'id, invoiceNo, uid, grandTotal, paidAmount, balance, paymentMethod, status, synced, createdAt',
    purchases:        'id, uid, supplierId, invoiceNo, grandTotal, paidAmount, balance, paymentMethod, status, synced, createdAt',
    items:            'id, uid, name, barcode, sellingPrice, costPrice, quantity, stock, currentStock, synced, _synced, updatedAt',
    suppliers:        'id, uid, name, phone, email, currentBalance, synced, createdAt, updatedAt',
    customerLoans:    'id, uid, customerId, invoiceId, amount, date, type, status, synced',
    cashTransactions: 'id, uid, type, amount, description, date, synced, createdAt, invoiceId',
    payments:         'id, uid, invoiceId, supplierId, amount, date, synced, createdAt',
    settings:         'id, uid, userId',
    syncQueue:        '++id, uid, operation, collection, docId, processed, timestamp',
  });

  db.version(9).stores({
    customers:          'id, uid, name, phone, currentBalance, balance, outstandingBalance, synced, _synced, createdAt, updatedAt',
    invoices:           'id, invoiceNo, uid, grandTotal, paidAmount, balance, paymentMethod, status, synced, createdAt',
    purchases:          'id, uid, supplierId, invoiceNo, grandTotal, paidAmount, balance, paymentMethod, status, synced, createdAt',
    'purchase-returns': 'id, uid, supplierId, invoiceNo, grandTotal, paidAmount, balance, paymentMethod, status, synced, createdAt',
    items:              'id, uid, name, barcode, sellingPrice, costPrice, quantity, stock, currentStock, synced, _synced, updatedAt',
    suppliers:          'id, uid, name, phone, email, currentBalance, synced, createdAt, updatedAt',
    customerLoans:      'id, uid, customerId, invoiceId, amount, date, type, status, synced',
    cashTransactions:   'id, uid, type, amount, description, date, synced, createdAt, invoiceId',
    payments:           'id, uid, invoiceId, supplierId, amount, date, synced, createdAt',
    settings:           'id, uid, userId',
    syncQueue:          '++id, uid, operation, collection, docId, processed, timestamp',
    bankAccounts:       'id, uid, accountName, accountNumber, bankName, balance, currentBalance, synced, updatedAt',
  });

  db.version(10).stores({
    customers:          'id, uid, name, phone, currentBalance, balance, outstandingBalance, synced, _synced, createdAt, updatedAt',
    invoices:           'id, invoiceNo, uid, grandTotal, paidAmount, balance, paymentMethod, status, synced, createdAt',
    purchases:          'id, uid, supplierId, invoiceNo, grandTotal, paidAmount, balance, paymentMethod, status, synced, createdAt',
    'purchase-returns': 'id, uid, supplierId, invoiceNo, grandTotal, paidAmount, balance, paymentMethod, status, synced, createdAt',
    items:              'id, uid, name, barcode, sellingPrice, costPrice, quantity, stock, currentStock, synced, _synced, updatedAt',
    suppliers:          'id, uid, name, phone, email, currentBalance, synced, createdAt, updatedAt',
    customerLoans:      'id, uid, customerId, invoiceId, amount, date, type, status, synced',
    cashTransactions:   'id, uid, type, amount, description, date, synced, createdAt, invoiceId',
    payments:           'id, uid, invoiceId, supplierId, amount, date, synced, createdAt',
    settings:           'id, uid, userId',
    syncQueue:          '++id, uid, operation, collection, docId, processed, timestamp',
    bankAccounts:       'id, uid, accountName, accountNumber, bankName, balance, currentBalance, synced, updatedAt',
    users:              'id, uid, email, role, updatedAt',
  });

  db.version(11).stores({
    customers:          'id, uid, name, phone, currentBalance, balance, outstandingBalance, synced, _synced, createdAt, updatedAt',
    invoices:           'id, invoiceNo, uid, grandTotal, paidAmount, balance, paymentMethod, status, synced, createdAt',
    purchases:          'id, uid, supplierId, invoiceNo, grandTotal, paidAmount, balance, paymentMethod, status, synced, createdAt',
    'purchase-returns': 'id, uid, supplierId, invoiceNo, grandTotal, paidAmount, balance, paymentMethod, status, synced, createdAt',
    items:              'id, uid, name, barcode, sellingPrice, costPrice, quantity, stock, currentStock, synced, _synced, updatedAt',
    suppliers:          'id, uid, name, phone, email, currentBalance, synced, createdAt, updatedAt',
    customerLoans:      'id, uid, customerId, invoiceId, amount, date, type, status, synced',
    cashTransactions:   'id, uid, type, amount, description, date, synced, createdAt, invoiceId',
    payments:           'id, uid, invoiceId, supplierId, amount, date, synced, createdAt',
    settings:           'id, uid, userId',
    syncQueue:          '++id, uid, operation, collection, docId, processed, timestamp',
    bankAccounts:       'id, uid, accountName, accountNumber, bankName, balance, currentBalance, synced, updatedAt',
    users:              'id, uid, email, role, updatedAt',
  });

  // Version 12: Adds complete indexes for items table to prevent SchemaError
  db.version(12).stores({
    customers:          'id, uid, name, phone, currentBalance, balance, outstandingBalance, synced, _synced, createdAt, updatedAt',
    invoices:           'id, invoiceNo, uid, grandTotal, paidAmount, balance, paymentMethod, status, synced, createdAt',
    purchases:          'id, uid, supplierId, invoiceNo, grandTotal, paidAmount, balance, paymentMethod, status, synced, createdAt',
    'purchase-returns': 'id, uid, supplierId, invoiceNo, grandTotal, paidAmount, balance, paymentMethod, status, synced, createdAt',
    items:              'id, uid, name, barcode, itemCode, category, subCategory, brand, supplier, sellingPrice, costPrice, quantity, stock, currentStock, synced, _synced, status, isArchived, updatedAt, firestoreId, localId',
    suppliers:          'id, uid, name, phone, email, currentBalance, synced, createdAt, updatedAt',
    customerLoans:      'id, uid, customerId, invoiceId, amount, date, type, status, synced',
    cashTransactions:   'id, uid, type, amount, description, date, synced, createdAt, invoiceId',
    payments:           'id, uid, invoiceId, supplierId, amount, date, synced, createdAt',
    settings:           'id, uid, userId',
    syncQueue:          '++id, uid, operation, collection, docId, processed, timestamp',
    bankAccounts:       'id, uid, accountName, accountNumber, bankName, balance, currentBalance, synced, updatedAt',
    users:              'id, uid, email, role, updatedAt',
  });

  return db;
}

const globalDb = globalThis;
if (!globalDb.__weerakkodi_localDb) {
  globalDb.__weerakkodi_localDb = initLocalDb();
}
export const localDb = globalDb.__weerakkodi_localDb;

let _openPromise = null;
let _circuitBreakerUntil = 0;

export async function ensureDbOpen() {
  if (typeof window === 'undefined') return null;
  if (localDb && localDb.isOpen && localDb.isOpen()) {
    return localDb;
  }
  if (Date.now() < _circuitBreakerUntil) {
    return null;
  }
  if (_openPromise) {
    return _openPromise;
  }

  _openPromise = (async () => {
    try {
      if (!localDb) return null;
      const openOp = localDb.open();
      const timeoutOp = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('IndexedDB open timeout')), 1500)
      );
      await Promise.race([openOp, timeoutOp]);
      if (localDb.isOpen()) {
        return localDb;
      }
      return null;
    } catch (err) {
      console.warn('[localDb] Open notice (safely handled):', err?.message || err);
      _circuitBreakerUntil = Date.now() + 3000;
      return null;
    } finally {
      _openPromise = null;
    }
  })();

  return _openPromise;
}

export function isDbReady() {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(localDb && localDb.isOpen && localDb.isOpen());
  } catch (e) {
    return false;
  }
}

export async function safeCount(tableName) {
  if (typeof window === 'undefined') return 0;
  try {
    const db = await ensureDbOpen();
    if (!db || !localDb.isOpen() || !localDb[tableName]) return 0;
    return await localDb[tableName].count();
  } catch (err) {
    return 0;
  }
}

export async function safeGetAll(tableName) {
  if (typeof window === 'undefined') return [];
  try {
    const db = await ensureDbOpen();
    if (!db || !localDb.isOpen() || !localDb[tableName]) return [];
    return await localDb[tableName].toArray();
  } catch (err) {
    return [];
  }
}

// Universal Helper: සියලු පැරණි හා නව භාණ්ඩ Hard Disk එකෙන් ලබා ගැනීම
export async function getAllLocalItems() {
  return await safeGetAll('items');
}

// Universal Helper: භාණ්ඩයක් Hard Disk එකට සුරැකීම
export async function saveLocalItem(itemData) {
  try {
    const db = await ensureDbOpen();
    if (!db || !localDb.isOpen() || !localDb.items || !itemData) return null;
    const id = String(itemData.id || itemData.firestoreId || itemData.localId || `item_${Date.now()}`);
    const normalized = {
      ...itemData,
      id,
      updatedAt: itemData.updatedAt || new Date().toISOString()
    };
    await localDb.items.put(normalized);
    return normalized;
  } catch (err) {
    console.error('[localDb] saveLocalItem error:', err);
    return itemData;
  }
}

localDb.getBackupStats = async function() {
  await ensureDbOpen();
  const stats = {};
  const tables = ['invoices', 'customers', 'items', 'purchases', 'suppliers', 'settings', 'bankAccounts', 'users'];
  for (const t of tables) {
    try {
      stats[t] = await safeCount(t);
    } catch (e) {
      stats[t] = 0;
    }
  }
  stats._total = Object.values(stats).reduce((a, b) => a + b, 0);
  return stats;
};

export async function saveToLocal(collection, uid, data, docId = null) {
  try {
    const db = await ensureDbOpen();
    if (!db || !localDb.isOpen() || !localDb[collection]) return null;
    const table = localDb.table(collection);
    const id = String(docId || data.id || `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    const now = new Date().toISOString();

    const record = {
      ...data,
      id,
      uid: uid || data.uid || 'system',
      synced: false,
      _synced: false,
      updatedAt: now,
    };

    if (!data.createdAt) {
      record.createdAt = now;
    }

    await table.put(record);
    return id;
  } catch (err) {
    console.error(`[localDb] saveToLocal error (${collection}):`, err);
    return null;
  }
}

// පැරණි භාණ්ඩ කිසිවිටෙකත් UID නිසා hide නොවන පරිදි සකසා ඇත
export async function getLocalRecords(collection, uid) {
  try {
    const db = await ensureDbOpen();
    if (!db || !localDb.isOpen() || !localDb[collection]) return [];
    const table = localDb.table(collection);

    if (!uid) {
      return await table.toArray();
    }

    const records = await table
      .filter(r => !r.uid || r.uid === uid || r.uid === 'system' || r.uid === 'all' || r.uid === 'local_user')
      .toArray();

    // Items collection එකේදී UID match නොවූවත් Hard Disk හි ඇති සියල්ල පෙන්වයි
    if (collection === 'items' && records.length === 0) {
      return await table.toArray();
    }

    return records;
  } catch (err) {
    console.error(`[localDb] getLocalRecords error (${collection}):`, err);
    return [];
  }
}

export async function getUnsyncedRecords(collection, uid) {
  try {
    const db = await ensureDbOpen();
    if (!db || !localDb.isOpen() || !localDb[collection]) return [];
    return await localDb.table(collection)
      .filter(r =>
        (!uid || !r.uid || r.uid === uid) &&
        (r.synced === false || r.synced === 0 || r._synced === false || r._synced === 0)
      )
      .toArray();
  } catch (err) {
    console.error(`[localDb] getUnsyncedRecords error (${collection}):`, err);
    return [];
  }
}

export async function markSynced(collection, id) {
  try {
    const db = await ensureDbOpen();
    if (!db || !localDb.isOpen() || !localDb[collection]) return;
    await localDb.table(collection).update(id, { synced: true, _synced: true, _deductedAt: null });
  } catch (err) {
    console.error(`[localDb] markSynced error:`, err);
  }
}

export async function queueSync(uid, operation, collection, data, docId) {
  try {
    const db = await ensureDbOpen();
    if (!db || !localDb.isOpen() || !localDb.syncQueue) return;
    await localDb.syncQueue.add({
      uid: uid || 'system',
      operation,
      collection,
      docId: docId || data?.id || null,
      data,
      processed: false,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error(`[localDb] queueSync error:`, err);
  }
}

export async function getPendingSync(uid) {
  try {
    const db = await ensureDbOpen();
    if (!db || !localDb.isOpen() || !localDb.syncQueue) return [];
    return await localDb.syncQueue
      .filter(q => (!uid || !q.uid || q.uid === uid) && (q.processed === false || q.processed === 0))
      .toArray();
  } catch (err) {
    console.error(`[localDb] getPendingSync error:`, err);
    return [];
  }
}

export async function markQueueProcessed(id) {
  try {
    const db = await ensureDbOpen();
    if (!db || !localDb.isOpen() || !localDb.syncQueue) return;
    await localDb.syncQueue.update(id, { processed: true });
  } catch (err) {
    console.error(`[localDb] markQueueProcessed error:`, err);
  }
}

// ============================================================================
// 🛡️ MULTI-TENANT LOCAL DISK BACKUP & RESTORE UTILITIES (SETTINGS & BACKUP)
// ============================================================================

const BACKUP_DIR_KEY = 'weerakkodi_backup_dir_handle';
const BACKUP_DB_STORE = 'WeerakkodiDirectoryHandles';

function getHandleDB() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return resolve(null);
    }
    const request = window.indexedDB.open(BACKUP_DB_STORE, 1);
    request.onupgradeneeded = (e) => {
      const idb = e.target.result;
      if (!idb.objectStoreNames.contains('handles')) {
        idb.createObjectStore('handles');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

// 1. Get Stored Directory Handle from IndexedDB
export async function getBackupDirHandle() {
  if (typeof window === 'undefined') return null;
  try {
    const idb = await getHandleDB();
    if (!idb) return null;
    return new Promise((resolve) => {
      const tx = idb.transaction('handles', 'readonly');
      const store = tx.objectStore('handles');
      const req = store.get(BACKUP_DIR_KEY);
      req.onsuccess = async () => {
        const handle = req.result;
        if (!handle) return resolve(null);
        try {
          if (typeof handle.queryPermission === 'function') {
            const perm = await handle.queryPermission({ mode: 'readwrite' });
            if (perm === 'granted') return resolve(handle);
          }
        } catch (e) {}
        resolve(handle);
      };
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('[localDb] getBackupDirHandle error:', err);
    return null;
  }
}

// 2. Setup Backup Directory using showDirectoryPicker
export async function setupBackupDirectory() {
  if (typeof window === 'undefined') return null;
  try {
    if (!window.showDirectoryPicker) {
      console.warn('showDirectoryPicker is not supported in this browser/environment.');
      return null;
    }
    const handle = await window.showDirectoryPicker({
      id: 'weerakkodi_pos_backups',
      mode: 'readwrite',
    });

    if (handle) {
      const idb = await getHandleDB();
      if (idb) {
        await new Promise((resolve, reject) => {
          const tx = idb.transaction('handles', 'readwrite');
          const store = tx.objectStore('handles');
          const req = store.put(handle, BACKUP_DIR_KEY);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      }
    }
    return handle;
  } catch (err) {
    if (err?.name !== 'AbortError') {
      console.error('[localDb] setupBackupDirectory error:', err);
    }
    return null;
  }
}

// 3. Manual Backup to PC Hard Disk (Strictly Multi-Tenant for logged in User)
export async function manualBackupToDisk(activeUid) {
  try {
    await ensureDbOpen();
    let cleanUid = String(activeUid || '').trim();
    if (!cleanUid && typeof window !== 'undefined') {
      cleanUid = localStorage.getItem('weerakkodi_active_uid') || '';
    }

    if (!cleanUid) {
      throw new Error('Active UID is required to create a user-isolated backup.');
    }

    const tables = [
      'items', 'customers', 'invoices', 'customerLoans',
      'purchases', 'suppliers', 'cashTransactions', 'payments', 'bankAccounts'
    ];

    const backupData = {
      app: 'weerakkodi-pos',
      version: '1.0',
      timestamp: new Date().toISOString(),
      uid: cleanUid,
      tables: {},
    };

    for (const tableName of tables) {
      if (localDb[tableName]) {
        const records = await localDb[tableName].toArray();
        // Strict isolation: only records that belong to the active tenant
        backupData.tables[tableName] = records.filter(r =>
          r && (String(r.uid || r.userId || '').trim() === cleanUid)
        );
      }
    }

    const jsonString = JSON.stringify(backupData, null, 2);
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `WeerakkodiPOS_Backup_${cleanUid.slice(0, 8)}_${dateStr}.json`;

    // Attempt writing to Directory Handle if configured
    const dirHandle = await getBackupDirHandle();
    if (dirHandle && typeof dirHandle.getFileHandle === 'function') {
      try {
        let perm = 'granted';
        if (typeof dirHandle.queryPermission === 'function') {
          perm = await dirHandle.queryPermission({ mode: 'readwrite' });
          if (perm !== 'granted' && typeof dirHandle.requestPermission === 'function') {
            perm = await dirHandle.requestPermission({ mode: 'readwrite' });
          }
        }
        if (perm === 'granted') {
          const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(jsonString);
          await writable.close();
          return { success: true, fileName, location: 'directory' };
        }
      } catch (dirErr) {
        console.warn('[localDb] Failed to write directly to DirectoryHandle, falling back to download:', dirErr);
      }
    }

    // Fallback: Trigger browser file download
    if (typeof window !== 'undefined') {
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return { success: true, fileName, location: 'download' };
    }

    return { success: true, fileName };
  } catch (err) {
    console.error('[localDb] manualBackupToDisk failed:', err);
    throw err;
  }
}

// 4. List all Backup Files from directory
export async function listBackupFiles() {
  if (typeof window === 'undefined') return [];
  try {
    const dirHandle = await getBackupDirHandle();
    if (!dirHandle || typeof dirHandle.values !== 'function') return [];

    if (typeof dirHandle.queryPermission === 'function') {
      const perm = await dirHandle.queryPermission({ mode: 'read' });
      if (perm !== 'granted') return [];
    }

    const files = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.json')) {
        try {
          const file = await entry.getFile();
          files.push({
            name: entry.name,
            size: file.size,
            lastModified: file.lastModified,
            handle: entry,
          });
        } catch (e) {}
      }
    }
    return files.sort((a, b) => b.lastModified - a.lastModified);
  } catch (err) {
    console.warn('[localDb] listBackupFiles error:', err);
    return [];
  }
}

// 5. Read contents of a chosen backup file
export async function readBackupFile(fileOrHandle) {
  try {
    let file = fileOrHandle;
    if (fileOrHandle && typeof fileOrHandle.getFile === 'function') {
      file = await fileOrHandle.getFile();
    }
    if (!file) throw new Error('No valid backup file provided.');

    if (typeof file.text === 'function') {
      const text = await file.text();
      return JSON.parse(text);
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          resolve(JSON.parse(e.target.result));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  } catch (err) {
    console.error('[localDb] readBackupFile error:', err);
    throw err;
  }
}

// 6. Restore from Backup Data (Strict Multi-Tenant Isolation)
export async function restoreFromBackup(backupData, activeUid) {
  try {
    await ensureDbOpen();
    let cleanUid = String(activeUid || '').trim();
    if (!cleanUid && typeof window !== 'undefined') {
      cleanUid = localStorage.getItem('weerakkodi_active_uid') || '';
    }

    if (!cleanUid) {
      throw new Error('Active UID is required to safely restore tenant data.');
    }
    if (!backupData || !backupData.tables) {
      throw new Error('Invalid backup file structure.');
    }

    const tables = Object.keys(backupData.tables);
    for (const tableName of tables) {
      if (localDb[tableName] && Array.isArray(backupData.tables[tableName])) {
        // Enforce active UID on restored items so they are strictly isolated to this user
        const records = backupData.tables[tableName].map(r => ({
          ...r,
          uid: cleanUid,
          synced: 0,
          _synced: false,
        }));
        if (records.length > 0) {
          await localDb[tableName].bulkPut(records);
        }
      }
    }
    return { success: true };
  } catch (err) {
    console.error('[localDb] restoreFromBackup failed:', err);
    throw err;
  }
}

export default localDb;