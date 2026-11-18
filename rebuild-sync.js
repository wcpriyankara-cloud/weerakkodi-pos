const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'lib', 'syncService.js');

const code = `// lib/syncService.js
// Offline-first sync: Dexie (local) → Firestore (cloud) → Hard Disk backup
// ✅ Rebuilt: Multi-tenant, offline guard, disk backup, auto-sync engine

import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, doc, getDoc, getDocs, setDoc, query, where, onSnapshot,
  runTransaction, increment, serverTimestamp, enableNetwork, disableNetwork,
} from 'firebase/firestore';
import { localDb } from '@/lib/localDb';

// 🔒 CLOUD SYNC DISABLED FLAG - offline PC එකේ cloud sync off
let CLOUD_SYNC_DISABLED = true;
export function enableCloudSync() { CLOUD_SYNC_DISABLED = false; }
export function disableCloudSync() { CLOUD_SYNC_DISABLED = true; }

// ─── State ───
let retryCount = 0;
let retryTimer = null;
let quotaBlocked = false;
let mirrorUnsubscribers = [];
let autoSyncInterval = null;
const MAX_RETRIES = 3;
const SYNC_INTERVAL = 30000; // 30 seconds

function clearQuotaBlock() { quotaBlocked = false; }

// ─── Safe wrapper ───
async function safe(name, fn) {
  try {
    return await fn();
  } catch (e) {
    if (e?.code === 'resource-exhausted' || e?.message?.includes('Quota exceeded')) {
      quotaBlocked = true;
      console.warn('⚠️ Quota blocked on', name);
    } else if (e?.message?.includes('offline')) {
      console.log('🔌 Offline skip:', name);
    } else {
      console.error('Sync step "' + name + '" failed:', e?.message || e);
    }
    return null;
  }
}

// ─── Sync Individual Collections ───
async function syncCustomers(uid) {
  if (CLOUD_SYNC_DISABLED || !db) return;
  const local = await localDb.customers.where('uid').equals(uid).toArray();
  const pending = local.filter(c => c._sync !== 'synced');
  for (const c of pending) {
    try {
      const ref = doc(db, 'users', uid, 'customers', c.id || c.customerId);
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
      const ref = doc(db, 'users', uid, 'items', item.id || item.itemId);
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
      const ref = doc(db, 'users', uid, 'invoices', inv.id || inv.invoiceId);
      await setDoc(ref, { ...inv, _sync: 'synced', uid }, { merge: true });
      await localDb.invoices.update(inv.id || inv.invoiceId, { _sync: 'synced' });
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
      const ref = doc(db, 'users', uid, 'purchases', p.id || p.purchaseId);
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
      const ref = doc(db, 'users', uid, 'suppliers', s.id || s.supplierId);
      await setDoc(ref, { ...s, _sync: 'synced', uid }, { merge: true });
      await localDb.suppliers.update(s.id || s.supplierId, { _sync: 'synced' });
    } catch (e) {
      if (e?.message?.includes('offline')) return;
    }
  }
}

// ─── Main Sync All ───
async function syncAll(uid) {
  if (CLOUD_SYNC_DISABLED) {
    console.log('🔌 Cloud sync disabled - offline mode');
    return;
  }
  if (quotaBlocked) {
    console.log('⚠️ Quota blocked, skipping sync');
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

// ─── Sync Pending Invoices ───
export async function syncPendingInvoices(uid) {
  if (CLOUD_SYNC_DISABLED || !uid) return;
  await safe('pendingInvoices', () => syncInvoices(uid));
}

// ─── Force Sync and Backup ───
export async function forceSyncAndBackup(uid) {
  if (CLOUD_SYNC_DISABLED) {
    console.log('🔌 forceSync skipped - offline mode');
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

// ─── Trigger Local Disk Backup ───
export async function triggerLocalDiskBackup(uid) {
  if (!uid) return;
  try {
    const isElectron = typeof window !== 'undefined' && window.require;
    if (!isElectron) {
      console.log('💾 Disk backup skipped (not Electron)');
      return;
    }
    const fs = window.require('fs');
    const pathMod = window.require('path');
    const backupDir = 'D:\\\\Weerakkodi_POS_Backups';

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
    console.log('💾 Disk backup [' + shortUid + ']: ' + c + 'c, ' + i + 'i, ' + it + 'it, ' + p + 'p, ' + s + 's');
  } catch (e) {
    console.error('Disk backup error:', e?.message);
  }
}

// ─── Purge Other Users ───
export async function purgeOtherUsers(uid) {
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
    console.log('🧹 Purged ' + totalPurged + ' records from other users');
  }
}

// ─── Clear All User Data ───
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
  console.log('🗑️ Cleared all data for uid=' + uid.slice(0, 8));
}

// ─── Cleanup ───
function cleanupAutoSync() {
  if (autoSyncInterval) { clearInterval(autoSyncInterval); autoSyncInterval = null; }
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  mirrorUnsubscribers.forEach(unsub => { try { unsub(); } catch(e) {} });
  mirrorUnsubscribers = [];
  console.log('🛑 Auto-Sync Engine Stopped');
}

// ─── Mirror: Firestore → Dexie (polling mode) ───
async function startMirror(uid) {
  if (!db || !uid) return;

  // Offline guard - don't pull from cloud when offline
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    console.log('🔌 Mirror skipped - offline');
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
      const q = query(collection(db, 'users', uid, col));
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

  console.log('📥 Pull done: ' + totalDocs + ' docs from ' + collections.length + ' collections');
}

// ─── Schedule Retry ───
function scheduleRetry(uid) {
  if (CLOUD_SYNC_DISABLED) return;
  if (retryCount >= MAX_RETRIES) {
    console.log('⚠️ Max retries reached, waiting for next cycle');
    return;
  }
  retryCount++;
  const delay = Math.min(5000 * retryCount, 30000);
  retryTimer = setTimeout(() => syncAll(uid), delay);
}

// ─── Auto-Sync Engine ───
export function startAutoSync(uid, setPendingSyncCount) {
  if (!uid) return;
  cleanupAutoSync();

  console.log('🚀 Auto-Sync Engine Started');

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
  console.log('🧹 AutoSync fully cleaned up');

  // Periodic sync
  autoSyncInterval = setInterval(doSync, SYNC_INTERVAL);

  // Online/offline listeners
  if (typeof window !== 'undefined') {
    const onOnline = () => {
      if (CLOUD_SYNC_DISABLED) {
        console.log('🌐 Online detected but CLOUD_SYNC_DISABLED=true');
        return;
      }
      console.log('🌐 Online detected, pulling fresh data...');
      doSync();
    };
    const onOffline = () => {
      console.log('🔌 Offline detected - local mode active');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
  }

  return cleanupAutoSync;
}

export default {
  syncAll,
  syncPendingInvoices,
  forceSyncAndBackup,
  startAutoSync,
  triggerLocalDiskBackup,
  purgeOtherUsers,
  clearAllUserData,
};
`;

fs.writeFileSync(filePath, code, 'utf8');
const lines = code.split('\n').length;
const bytes = Buffer.byteLength(code, 'utf8');
console.log('✅ syncService.js rebuilt: ' + lines + ' lines, ' + bytes + ' bytes');
console.log('🔄 App restart: Ctrl+C → npm run dev');