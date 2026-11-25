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

export default localDb;