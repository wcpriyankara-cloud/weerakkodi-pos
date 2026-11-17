import Dexie from 'dexie';

export const localDb = new Dexie('WeerakkodiPOS_DB');

// ── Version 6: original schema ──
localDb.version(6).stores({
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

// ── Version 7: syncQueue table ──
localDb.version(7).stores({
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

// ── Version 8: stock, currentStock, balance, outstandingBalance fields add ──
localDb.version(8).stores({
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

// Backup stats helper
localDb.getBackupStats = async function() {
  const stats = {};
  const tables = ['invoices', 'customers', 'items', 'purchases', 'suppliers', 'settings'];
  for (const t of tables) {
    try { stats[t] = await localDb[t].count(); } catch(e) { stats[t] = 0; }
  }
  stats._total = Object.values(stats).reduce((a, b) => a + b, 0);
  return stats;
};

// ══════════════════════════════════════════════════════
//  Helper Functions
// ══════════════════════════════════════════════════════

export async function saveToLocal(collection, uid, data, docId = null) {
  try {
    const table = localDb.table(collection);
    const id = docId || data.id || `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const record = {
      ...data,
      id,
      uid,
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

export async function getLocalRecords(collection, uid) {
  try {
    return await localDb.table(collection).where('uid').equals(uid).toArray();
  } catch (err) {
    console.error(`[localDb] getLocalRecords error (${collection}):`, err);
    return [];
  }
}

export async function getUnsyncedRecords(collection, uid) {
  try {
    return await localDb.table(collection)
      .where('uid').equals(uid)
      .and(r =>
        r.synced === false || r.synced === 0 ||
        r._synced === false || r._synced === 0
      )
      .toArray();
  } catch (err) {
    console.error(`[localDb] getUnsyncedRecords error (${collection}):`, err);
    return [];
  }
}

export async function markSynced(collection, id) {
  try {
    await localDb.table(collection).update(id, { synced: true, _synced: true, _deductedAt: null });
  } catch (err) {
    console.error(`[localDb] markSynced error:`, err);
  }
}

export async function queueSync(uid, operation, collection, data, docId) {
  try {
    await localDb.syncQueue.add({
      uid,
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
    return await localDb.syncQueue
      .where('uid').equals(uid)
      .and(q => q.processed === false || q.processed === 0)
      .sortBy('timestamp');
  } catch (err) {
    console.error(`[localDb] getPendingSync error:`, err);
    return [];
  }
}

export async function markQueueProcessed(id) {
  try {
    await localDb.syncQueue.update(id, { processed: true });
  } catch (err) {
    console.error(`[localDb] markQueueProcessed error:`, err);
  }
}

// ══════════════════════════════════════════════════════
//  AUTO-BACKUP: Dexie → Hard Disk (Browser + Electron)
// ══════════════════════════════════════════════════════

let _backupDirHandle = null;

/**
 * Get user-selected custom backup path from localStorage
 * Returns null if not set — Electron will use default D:\Weerakkodi_POS_Backups
 */
export function getCustomBackupPath() {
  if (typeof window === 'undefined') return null;
  try {
    return (
      localStorage.getItem('weerakkodi_backup_path') ||
      localStorage.getItem('pos_backup_path') ||
      null
    );
  } catch (e) {
    return null;
  }
}

/**
 * Get stored backup directory handle (Browser File System Access API)
 * Returns handle if permission granted, null otherwise
 */
export async function getBackupDirHandle() {
  // Electron එකේ IPC use කරන නිසා handle අවශ්‍ය නැහැ
  if (typeof window !== 'undefined' && window.electronAPI?.saveLocalData) {
    return 'electron';
  }

  // Module-level cache check
  if (_backupDirHandle) {
    try {
      const perm = await _backupDirHandle.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') return _backupDirHandle;
    } catch (e) {
      _backupDirHandle = null;
    }
  }

  // Try to restore from IndexedDB
  try {
    const stored = await localDb.settings.get('backupDirHandle');
    if (stored?.handle) {
      _backupDirHandle = stored.handle;
      const perm = await _backupDirHandle.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') return _backupDirHandle;
      _backupDirHandle = null;
    }
  } catch (e) {
    console.warn('[Backup] Could not restore handle:', e.message);
  }

  return null;
}

/**
 * Open directory picker and save handle for future auto-backups
 * Call this from Settings/Backup page "Setup Backup Folder" button
 */
export async function setupBackupDirectory() {
  if (typeof window === 'undefined' || !window.showDirectoryPicker) {
    console.warn('[Backup] showDirectoryPicker not available');
    return false;
  }

  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    _backupDirHandle = dirHandle;

    // Persist handle in IndexedDB for page reloads
    try {
      await localDb.settings.put({
        id: 'backupDirHandle',
        uid: 'system',
        handle: dirHandle,
      });
    } catch (e) {
      console.warn('[Backup] Could not persist handle to IndexedDB:', e.message);
    }

    console.log('✅ [Backup] Directory saved for auto-backup');
    return true;
  } catch (e) {
    if (e.name !== 'AbortError') {
      console.warn('[Backup] Setup failed:', e.message);
    }
    return false;
  }
}

/**
 * Auto-backup all Dexie data to hard disk
 * - Electron: saves via IPC to user-selected folder OR D:\Weerakkodi_POS_Backups\
 * - Browser: saves to previously selected directory, or triggers download
 */
export async function autoBackupToDisk(uid) {
  if (!uid) return false;

  try {
    const isElectron = typeof window !== 'undefined' && window.electronAPI?.saveLocalData;
    const customPath = getCustomBackupPath();

    // Collect all data from Dexie
    const backupData = {
      version: 1,
      timestamp: new Date().toISOString(),
      uid,
      invoices: await localDb.invoices.where('uid').equals(uid).toArray(),
      customers: await localDb.customers.where('uid').equals(uid).toArray(),
      items: await localDb.items.where('uid').equals(uid).toArray(),
      purchases: await localDb.purchases.where('uid').equals(uid).toArray(),
      suppliers: await localDb.suppliers.where('uid').equals(uid).toArray(),
      settings: await localDb.settings.where('uid').equals(uid).toArray(),
    };

    const json = JSON.stringify(backupData);
    const dateStr = new Date().toISOString().slice(0, 10);
    const timeStr = new Date().toISOString().slice(11, 19).replace(/:/g, '-');
    const fileName = `weerakkodi_backup_${dateStr}_${timeStr}.json`;

    // ── Electron: save via IPC ──
    if (isElectron) {
      try {
        // Pass customPath if user selected one
        await window.electronAPI.saveLocalData(fileName, json, customPath);
        console.log(`✅ [Auto-Backup] Electron saved: ${fileName}${customPath ? ` → ${customPath}` : ''}`);
        return true;
      } catch (e) {
        console.warn('[Auto-Backup] Electron save failed:', e.message);
      }
    }

    // ── Browser: save to selected directory ──
    const dirHandle = await getBackupDirHandle();
    if (dirHandle && dirHandle !== 'electron') {
      try {
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(json);
        await writable.close();
        console.log(`✅ [Auto-Backup] Browser saved: ${fileName}`);
        return true;
      } catch (e) {
        console.warn('[Auto-Backup] Browser write failed, falling back to download:', e.message);
      }
    }

    // ── Fallback: auto-download ──
    downloadBackupFile(json, fileName);
    return true;
  } catch (e) {
    console.warn('[Auto-Backup] Failed:', e.message);
    return false;
  }
}

/**
 * Trigger browser file download (fallback when no directory selected)
 */
export function downloadBackupFile(json, fileName) {
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`✅ [Auto-Backup] Downloaded: ${fileName}`);
  } catch (e) {
    console.warn('[Auto-Backup] Download failed:', e.message);
  }
}

/**
 * List backup files from selected directory (Browser) or backup folder (Electron)
 * Returns array of { name, size, lastModified } or [] if no directory
 */
export async function listBackupFiles() {
  const isElectron = typeof window !== 'undefined' && window.electronAPI?.listBackupFiles;

  // Electron: use IPC
  if (isElectron) {
    try {
      const customPath = getCustomBackupPath();
      const result = await window.electronAPI.listBackupFiles(customPath);
      if (result?.success && Array.isArray(result.files)) {
        return result.files;
      }
      return [];
    } catch (e) {
      console.warn('[Backup] Electron list failed:', e.message);
      return [];
    }
  }

  // Browser: iterate directory handle
  const dirHandle = await getBackupDirHandle();
  if (!dirHandle || dirHandle === 'electron') return [];

  const files = [];
  try {
    for await (const [name, handle] of dirHandle) {
      if (handle.kind === 'file' && name.endsWith('.json')) {
        try {
          const file = await handle.getFile();
          files.push({
            name,
            size: file.size,
            lastModified: file.lastModified,
          });
        } catch (e) {
          // Skip unreadable files
        }
      }
    }
    // Sort by name descending (newest first)
    files.sort((a, b) => b.name.localeCompare(a.name));
  } catch (e) {
    console.warn('[Backup] List files failed:', e.message);
  }

  return files;
}

/**
 * Read a specific backup file and return parsed JSON
 */
export async function readBackupFile(fileName) {
  const isElectron = typeof window !== 'undefined' && window.electronAPI?.loadLocalData;

  if (isElectron) {
    try {
      const customPath = getCustomBackupPath();
      const data = await window.electronAPI.loadLocalData(fileName, customPath);
      return data ? (typeof data === 'string' ? JSON.parse(data) : data) : null;
    } catch (e) {
      console.warn('[Backup] Electron read failed:', e.message);
      return null;
    }
  }

  const dirHandle = await getBackupDirHandle();
  if (!dirHandle || dirHandle === 'electron') return null;

  try {
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: false });
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text);
  } catch (e) {
    console.warn('[Backup] Read file failed:', e.message);
    return null;
  }
}

/**
 * Restore all data from a backup JSON object into Dexie
 * Clears existing data for the uid before restoring
 */
export async function restoreFromBackup(backupData) {
  if (!backupData || !backupData.uid) {
    console.error('[Restore] Invalid backup data');
    return false;
  }

  const uid = backupData.uid;
  const collections = ['invoices', 'customers', 'items', 'purchases', 'suppliers', 'settings'];
  let totalRestored = 0;

  for (const col of collections) {
    const records = backupData[col];
    if (!Array.isArray(records) || records.length === 0) continue;

    try {
      const table = localDb.table(col);
      // Clear existing data for this uid first
      await table.where('uid').equals(uid).delete();
      // Insert backup data
      await table.bulkPut(records);
      totalRestored += records.length;
      console.log(`[Restore] ${col}: ${records.length} records restored`);
    } catch (e) {
      console.error(`[Restore] ${col} failed:`, e.message);
    }
  }

  console.log(`✅ [Restore] Total: ${totalRestored} records restored for uid=${uid}`);
  return totalRestored > 0;
}

/**
 * Manual backup trigger — creates backup file with custom name suffix
 */
export async function manualBackupToDisk(uid, suffix = 'manual') {
  if (!uid) return false;

  try {
    const isElectron = typeof window !== 'undefined' && window.electronAPI?.saveLocalData;
    const customPath = getCustomBackupPath();

    const backupData = {
      version: 1,
      timestamp: new Date().toISOString(),
      uid,
      invoices: await localDb.invoices.where('uid').equals(uid).toArray(),
      customers: await localDb.customers.where('uid').equals(uid).toArray(),
      items: await localDb.items.where('uid').equals(uid).toArray(),
      purchases: await localDb.purchases.where('uid').equals(uid).toArray(),
      suppliers: await localDb.suppliers.where('uid').equals(uid).toArray(),
      settings: await localDb.settings.where('uid').equals(uid).toArray(),
    };

    const json = JSON.stringify(backupData);
    const dateStr = new Date().toISOString().slice(0, 10);
    const timeStr = new Date().toISOString().slice(11, 19).replace(/:/g, '-');
    const fileName = `weerakkodi_backup_${suffix}_${dateStr}_${timeStr}.json`;

    if (isElectron) {
      await window.electronAPI.saveLocalData(fileName, json, customPath);
      console.log(`✅ [Manual Backup] Saved: ${fileName}${customPath ? ` → ${customPath}` : ''}`);
      return fileName;
    }

    const dirHandle = await getBackupDirHandle();
    if (dirHandle && dirHandle !== 'electron') {
      try {
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(json);
        await writable.close();
        console.log(`✅ [Manual Backup] Saved: ${fileName}`);
        return fileName;
      } catch (e) {
        console.warn('[Manual Backup] Write failed:', e.message);
      }
    }

    downloadBackupFile(json, fileName);
    return fileName;
  } catch (e) {
    console.warn('[Manual Backup] Failed:', e.message);
    return false;
  }
}

// Named export for safe importing
export async function getBackupStats() {
  const stats = {};
  const tables = ['invoices', 'customers', 'items', 'purchases', 'suppliers', 'settings'];
  for (const t of tables) {
    try { stats[t] = await localDb[t].count(); } catch(e) { stats[t] = 0; }
  }
  stats._total = Object.values(stats).reduce((a, b) => a + b, 0);
  return stats;
}

export default localDb;