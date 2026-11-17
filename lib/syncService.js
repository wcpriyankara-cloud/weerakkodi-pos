// lib/syncService.js
// Offline-first sync: Dexie (local) â†’ Firestore (cloud) â†’ Hard Disk backup
// âœ… Rebuilt: Multi-tenant, offline guard, disk backup, auto-sync engine

import { auth, db } from '@/shared/firebase-config';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, doc, getDoc, getDocs, setDoc, query, where, onSnapshot,
  runTransaction, increment, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import localDb from '@/lib/localDb';

// ðŸ”’ CLOUD SYNC DISABLED FLAG - offline PC à¶‘à¶šà·š cloud sync off
let CLOUD_SYNC_DISABLED = false; // âœ… Enabled for Blaze plan
export function enableCloudSync() { CLOUD_SYNC_DISABLED = false; }
export function disableCloudSync() { CLOUD_SYNC_DISABLED = true; }

// â”€â”€â”€ State â”€â”€â”€
let retryCount = 0;
let retryTimer = null;
let quotaBlocked = false;
let mirrorUnsubscribers = [];
let autoSyncInterval = null;
const MAX_RETRIES = 3;
const SYNC_INTERVAL = 30000; // 30 seconds

function clearQuotaBlock() { quotaBlocked = false; }

// â”€â”€â”€ Safe wrapper â”€â”€â”€
async function safe(name, fn) {
  try {
    return await fn();
  } catch (e) {
    if (e?.code === 'resource-exhausted' || e?.message?.includes('Quota exceeded')) {
      quotaBlocked = true;
      console.warn('âš ï¸ Quota blocked on', name);
    } else if (e?.message?.includes('offline')) {
      console.log('ðŸ”Œ Offline skip:', name);
    } else {
      console.error('Sync step "' + name + '" failed:', e?.message || e);
    }
    return null;
  }
}

// â”€â”€â”€ Sync Individual Collections â”€â”€â”€
export async function syncCustomers(uid) {
  if (CLOUD_SYNC_DISABLED || !db) return;
  const local = await localDb.customers.where('uid').equals(uid).toArray();
  const pending = local.filter(c => c._sync !== 'synced');
  for (const c of pending) {
    try {
      const ref = doc(db, 'customers', c.id || c.customerId);
      const snap = await getDoc(ref);
      if (!snap.exists() || (c._updatedAt || 0) > (snap.data()?._updatedAt || 0)) {
        await setDoc(ref, { ...c, _sync: 'synced', uid }, { merge: true });
      }
      await localDb.customers.update(c.id || c.customerId, { _sync: 'synced' });
    } catch (e) {
      if (e?.message?.includes('offline')) return;
      console.error('Customer sync failed:', c.id, e?.message);
    }
  }
}

async function syncItems(uid) {
  if (CLOUD_SYNC_DISABLED || !db) return;
  const local = await localDb.items.where('uid').equals(uid).toArray();
  const pending = local.filter(i => i._sync !== 'synced');
  for (const item of pending) {
    try {
      const ref = doc(db, 'items', item.id || item.itemId);
      await setDoc(ref, { ...item, _sync: 'synced', uid }, { merge: true });
      await localDb.items.update(item.id || item.itemId, { _sync: 'synced' });
    } catch (e) {
      if (e?.message?.includes('offline')) return;
    }
  }
}

async function syncInvoices(uid) {
  if (CLOUD_SYNC_DISABLED || !db) return;
  const local = await localDb.invoices.where('uid').equals(uid).toArray();
  const pending = local.filter(inv => inv._sync !== 'synced');
  for (const inv of pending) {
    try {
      const ref = doc(db, 'invoices', inv.id || inv.invoiceId);
      await setDoc(ref, { ...inv, _sync: 'synced', uid }, { merge: true });

      // Process pending batch deductions (stock updates from offline saves)
      if (inv._pendingBatchUpdates && Object.keys(inv._pendingBatchUpdates).length > 0) {
        try {
          const fbBatch = writeBatch(db);
          for (const [, upd] of Object.entries(inv._pendingBatchUpdates)) {
            try {
              const batchRef = doc(db, upd.col, upd.docId);
              const snap = await getDoc(batchRef);
              if (!snap.exists()) continue;
              const data = snap.data(), items = [...(data.items || [])];
              upd.updates.forEach(({ index, qty }) => {
                if (index >= 0 && index < items.length) {
                  const cur = items[index].remainingQty ?? items[index].qty ?? 0;
                  items[index] = { ...items[index], remainingQty: Math.max(0, parseFloat((cur - qty).toFixed(2))) };
                }
              });
              fbBatch.update(batchRef, { items, updatedAt: new Date().toISOString() });
            } catch (be) { console.warn('Batch deduct sync:', be.message); }
          }
          await fbBatch.commit();
          console.log('[Sync] Batch deductions applied for invoice:', inv.id || inv.invoiceId);

          // Also update items collection stock (POS page reads from items)
          if (inv.items && Array.isArray(inv.items)) {
            const itemQtyMap = {};
            inv.items.forEach(it => {
              const itemId = it.itemId || it.id;
              if (!itemId) return;
              const qty = parseFloat(it.qty || it.quantity || 0);
              itemQtyMap[itemId] = (itemQtyMap[itemId] || 0) + qty;
            });
            for (const [itemId, totalDeduct] of Object.entries(itemQtyMap)) {
              if (totalDeduct <= 0) continue;
              try {
                const itemRef = doc(db, 'items', itemId);
                const itemSnap = await getDoc(itemRef);
                if (itemSnap.exists()) {
                  const curStock = itemSnap.data().stock ?? itemSnap.data().currentStock ?? 0;
                  const newStock = Math.max(0, parseFloat((curStock - totalDeduct).toFixed(2)));
                  await setDoc(itemRef, { stock: newStock, currentStock: newStock }, { merge: true });
                  console.log('[Sync] Item stock updated:', itemId, '->', newStock);
                }
              } catch (ie) { console.warn('[Sync] Item stock update failed:', ie.message); }
            }
          }
        } catch (be) {
          console.warn('[Sync] Batch commit failed:', be.message);
        }
      }

      await localDb.invoices.update(inv.id || inv.invoiceId, { _sync: 'synced', _pendingBatchUpdates: null });
    } catch (e) {
      if (e?.message?.includes('offline')) return;
    }
  }
}

async function syncPurchases(uid) {
  if (CLOUD_SYNC_DISABLED || !db) return;
  if (!localDb.purchases) return;
  const local = await localDb.purchases.where('uid').equals(uid).toArray();
  const pending = local.filter(p => p._sync !== 'synced');
  for (const p of pending) {
    try {
      const ref = doc(db, 'purchases', p.id || p.purchaseId);
      await setDoc(ref, { ...p, _sync: 'synced', uid }, { merge: true });
      await localDb.purchases.update(p.id || p.purchaseId, { _sync: 'synced' });
    } catch (e) {
      if (e?.message?.includes('offline')) return;
    }
  }
}

async function syncSuppliers(uid) {
  if (CLOUD_SYNC_DISABLED || !db) return;
  if (!localDb.suppliers) return;
  const local = await localDb.suppliers.where('uid').equals(uid).toArray();
  const pending = local.filter(s => s._sync !== 'synced');
  for (const s of pending) {
    try {
      const ref = doc(db, 'suppliers', s.id || s.supplierId);
      await setDoc(ref, { ...s, _sync: 'synced', uid }, { merge: true });
      await localDb.suppliers.update(s.id || s.supplierId, { _sync: 'synced' });
    } catch (e) {
      if (e?.message?.includes('offline')) return;
    }
  }
}

// â”€â”€â”€ Main Sync All â”€â”€â”€
export async function syncAll(uid) {
  if (CLOUD_SYNC_DISABLED) {
    console.log('ðŸ”Œ Cloud sync disabled - offline mode');
    return;
  }
  if (quotaBlocked) {
    console.log('âš ï¸ Quota blocked, skipping sync');
    return;
  }
  if (!uid) return;

  await safe('customers', () => syncCustomers(uid));
  await safe('items', () => syncItems(uid));
  await safe('invoices', () => syncInvoices(uid));
  await safe('purchases', () => syncPurchases(uid));
  await safe('suppliers', () => syncSuppliers(uid));

  retryCount = 0;
}

// â”€â”€â”€ Sync Pending Invoices â”€â”€â”€
export async function syncPendingInvoices(uid) {
  if (CLOUD_SYNC_DISABLED || !uid) return;
  await safe('pendingInvoices', () => syncInvoices(uid));
}

// â”€â”€â”€ Force Sync and Backup â”€â”€â”€
export async function forceSyncAndBackup(uid) {
  if (CLOUD_SYNC_DISABLED) {
    console.log('ðŸ”Œ forceSync skipped - offline mode');
    try { await triggerLocalDiskBackup(uid); } catch(e) {}
    return;
  }
  retryCount = 0;
  clearTimeout(retryTimer);
  clearQuotaBlock();
  const res = await syncAll(uid);
  await triggerLocalDiskBackup(uid);
  return res;
}

// â”€â”€â”€ Trigger Local Disk Backup â”€â”€â”€
export async function triggerLocalDiskBackup(uid) {
  if (!uid) return;
  try {
    const isElectron = typeof window !== 'undefined' && window.require;
    if (!isElectron) {
      console.log('ðŸ’¾ Disk backup skipped (not Electron)');
      return;
    }
    const fs = window.require('fs');
    const pathMod = window.require('path');
    const backupDir = 'D:\\Weerakkodi_POS_Backups';

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const tables = ['customers', 'items', 'itemTransactions', 'purchases', 'suppliers'];
    const counts = {};
    const allData = {};

    for (const table of tables) {
      if (localDb[table]) {
        const rows = await localDb[table].where('uid').equals(uid).toArray();
        counts[table] = rows.length;
        allData[table] = rows;
      } else {
        counts[table] = 0;
        allData[table] = [];
      }
    }

    // Write full snapshot
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const shortUid = uid.slice(0, 12);
    const snapshotFile = pathMod.join(backupDir, 'full_snapshot_' + shortUid + '_' + timestamp + '.json');
    fs.writeFileSync(snapshotFile, JSON.stringify(allData, null, 2), 'utf8');

    // Write individual table files
    for (const table of tables) {
      if (allData[table].length > 0) {
        const tableFile = pathMod.join(backupDir, table + '_' + shortUid + '.json');
        fs.writeFileSync(tableFile, JSON.stringify(allData[table], null, 2), 'utf8');
      }
    }

    const c = counts.customers || 0;
    const i = counts.invoices || 0;
    const it = counts.items || 0;
    const p = counts.purchases || 0;
    const s = counts.suppliers || 0;
    console.log('ðŸ’¾ Disk backup [' + shortUid + ']: ' + c + 'c, ' + i + 'i, ' + it + 'it, ' + p + 'p, ' + s + 's');
  } catch (e) {
    console.error('Disk backup error:', e?.message);
  }
}

// â”€â”€â”€ Purge Other Users â”€â”€â”€
export async function purgeOtherUsers(uid) {
  // âœ… Purge re-enabled
  if (!uid) return;
  console.log('[Sync] Purging data not belonging to uid=' + uid.slice(0, 8) + '...');

  const tables = ['items', 'customers', 'invoices', 'purchases', 'suppliers'];
  let totalPurged = 0;

  for (const table of tables) {
    if (!localDb[table]) continue;
    try {
      const all = await localDb[table].toArray();
      const others = all.filter(r => r.uid && r.uid !== uid);
      if (others.length > 0) {
        const keys = others.map(r => r.id || r.itemId || r.customerId || r.invoiceId || r.purchaseId || r.supplierId).filter(Boolean);
        if (keys.length > 0) {
          await localDb[table].bulkDelete(keys);
          totalPurged += keys.length;
        }
      }
    } catch (e) {
      console.error('Purge error on', table, e?.message);
    }
  }

  if (totalPurged > 0) {
    console.log('ðŸ§¹ Purged ' + totalPurged + ' records from other users');
  }
}

// â”€â”€â”€ Clear All User Data â”€â”€â”€
export async function clearAllUserData(uid) {
  if (!uid) return;
  const tables = ['items', 'customers', 'invoices', 'purchases', 'suppliers', 'itemTransactions'];
  for (const table of tables) {
    if (!localDb[table]) continue;
    try {
      const rows = await localDb[table].where('uid').equals(uid).toArray();
      const keys = rows.map(r => r.id || r.itemId || r.customerId || r.invoiceId).filter(Boolean);
      if (keys.length > 0) await localDb[table].bulkDelete(keys);
    } catch (e) {
      console.error('Clear error on', table, e?.message);
    }
  }
  console.log('ðŸ—‘ï¸ Cleared all data for uid=' + uid.slice(0, 8));
}

// â”€â”€â”€ Cleanup â”€â”€â”€
function cleanupAutoSync() {
  if (autoSyncInterval) { clearInterval(autoSyncInterval); autoSyncInterval = null; }
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  mirrorUnsubscribers.forEach(unsub => { try { unsub(); } catch(e) {} });
  mirrorUnsubscribers = [];
  console.log('ðŸ›‘ Auto-Sync Engine Stopped');
}

// â”€â”€â”€ Mirror: Firestore â†’ Dexie (polling mode) â”€â”€â”€
export async function startMirror(uid) {
  // âœ… Mirror re-enabled
  if (!db || !uid) return;

  // Offline guard - don't pull from cloud when offline
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    console.log('ðŸ”Œ Mirror skipped - offline');
    return;
  }
  if (CLOUD_SYNC_DISABLED) {
    console.log('SKIP mirror pull - offline mode active, preserving local data. Mirror started (polling mode) for uid=' + uid.slice(0, 10) + ': items, customers, invoices, purchases, suppliers');
    return;
  }

  const collections = ['items', 'customers', 'invoices', 'purchases', 'suppliers'];
  let totalDocs = 0;

  for (const col of collections) {
    if (!localDb[col]) continue;
    try {
      const q = query(collection(db, col), where('uid', '==', uid));
      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data(), uid, _sync: 'synced' }));
      if (docs.length > 0) {
        await localDb[col].bulkPut(docs);
        totalDocs += docs.length;
      }
    } catch (e) {
      if (e?.message?.includes('offline')) break;
    }
  }

  console.log('ðŸ“¥ Pull done: ' + totalDocs + ' docs from ' + collections.length + ' collections');
}

// â”€â”€â”€ Schedule Retry â”€â”€â”€
function scheduleRetry(uid) {
  if (CLOUD_SYNC_DISABLED) return;
  if (retryCount >= MAX_RETRIES) {
    console.log('âš ï¸ Max retries reached, waiting for next cycle');
    return;
  }
  retryCount++;
  const delay = Math.min(5000 * retryCount, 30000);
  retryTimer = setTimeout(() => syncAll(uid), delay);
}

// â”€â”€â”€ Auto-Sync Engine â”€â”€â”€
export function startAutoSync(uid, setPendingSyncCount) {
  if (!uid) return;
  cleanupAutoSync();

  console.log('ðŸš€ Auto-Sync Engine Started');

  // Initial purge
  purgeOtherUsers(uid);

  // Initial sync
  const doSync = async () => {
    if (CLOUD_SYNC_DISABLED) {
      if (setPendingSyncCount) setPendingSyncCount(0);
      // Still do disk backup
      try { await triggerLocalDiskBackup(uid); } catch(e) {}
      return;
    }

    await syncAll(uid);
    await startMirror(uid);

    // Count pending
    if (setPendingSyncCount) {
      try {
        let pending = 0;
        for (const table of ['customers', 'items', 'invoices', 'purchases', 'suppliers']) {
          if (localDb[table]) {
            const rows = await localDb[table].where('uid').equals(uid).filter(r => r._sync !== 'synced').toArray();
            pending += rows.length;
          }
        }
        setPendingSyncCount(pending);
      } catch(e) {
        setPendingSyncCount(0);
      }
    }

    // Disk backup
    try { await triggerLocalDiskBackup(uid); } catch(e) {}
  };

  doSync();
  console.log('ðŸ§¹ AutoSync fully cleaned up');

  // Periodic sync
  autoSyncInterval = setInterval(doSync, SYNC_INTERVAL);

  // Online/offline listeners
  if (typeof window !== 'undefined') {
    const onOnline = () => {
      if (CLOUD_SYNC_DISABLED) {
        console.log('ðŸŒ Online detected but CLOUD_SYNC_DISABLED=true');
        return;
      }
      console.log('ðŸŒ Online detected, pulling fresh data...');
      doSync();
    };
    const onOffline = () => {
      console.log('ðŸ”Œ Offline detected - local mode active');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
  }

  return cleanupAutoSync;
}


// ðŸ”Œ One-time invoice pull from Firestore to Dexie
export async function pullInvoicesOnce(uid) {
  if (!uid || !db) return 0;
  try {
    const { } = await import('firebase/firestore');
    const q = query(collection(db, 'users', uid, 'invoices'));
    const snap = await getDocs(q);
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data(), uid, _sync: 'synced' }));
    if (docs.length > 0 && localDb?.invoices) {
      await localDb.invoices.bulkPut(docs);
      console.log('ðŸ“‹ Pulled ' + docs.length + ' invoices to Dexie');
    }
    return docs.length;
  } catch(e) {
    console.log('Invoice pull error:', e?.message);
    try { } catch(x) {}
    return 0;
  }
}

export default {
  syncAll,
  syncPendingInvoices,
  forceSyncAndBackup,
  startAutoSync,
  triggerLocalDiskBackup,
  purgeOtherUsers,
  clearAllUserData,
  pullInvoicesOnce,
};
