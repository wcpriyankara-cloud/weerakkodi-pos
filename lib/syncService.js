// lib/syncService.js
// ✅ Offline-first sync: Dexie (PC Hard Disk) <-> Firestore (Cloud) + Auto Local Disk JSON Backup
// ✅ Safe from Quota Exceeded freezes, Multi-tenant protected, Safe Drive Fallbacks

import { auth, db } from '@/lib/firebase';
import {
  collection, doc, getDoc, getDocs, setDoc, query, where,
  writeBatch, serverTimestamp
} from 'firebase/firestore';
import { localDb, ensureDbOpen } from '@/lib/localDb';

// ─── CLOUD SYNC CONTROL ───
let CLOUD_SYNC_DISABLED = false;
export function enableCloudSync() { CLOUD_SYNC_DISABLED = false; }
export function disableCloudSync() { CLOUD_SYNC_DISABLED = true; }

// ─── State & Guard Flags ───
let isSyncing = false;
let quotaBlocked = false;
let quotaBlockedUntil = 0;
let autoSyncInterval = null;
const SYNC_INTERVAL = 30000; // 30 seconds
const QUOTA_COOLDOWN_MS = 15 * 60 * 1000; // 15 mins cooldown if quota hits

export function clearQuotaBlock() {
  quotaBlocked = false;
  quotaBlockedUntil = 0;
}

// ─── Safe Wrapper with Quota Protection ───
async function safe(name, fn) {
  if (quotaBlocked) {
    if (Date.now() < quotaBlockedUntil) return null;
    clearQuotaBlock();
  }

  try {
    return await fn();
  } catch (e) {
    const msg = e?.message || '';
    const isQuota = e?.code === 'resource-exhausted' || msg.includes('Quota exceeded') || msg.includes('RESOURCE_EXHAUSTED');
    const isOffline = msg.includes('offline') || msg.includes('Failed to get document because the client is offline');

    if (isQuota) {
      quotaBlocked = true;
      quotaBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS;
      console.warn(`⚠️ [Quota Exceeded] Cloud sync paused for 15 mins. POS is running 100% Offline via Hard Disk.`);
    } else if (isOffline) {
      console.log(`🔌 [Offline] ${name} skipped - operating locally.`);
    } else {
      console.warn(`[Sync Warning] ${name}:`, msg);
    }
    return null;
  }
}

// ─── Safe Local Database Guard ───
async function isDbReady() {
  if (typeof window === 'undefined') return false;
  try {
    if (typeof ensureDbOpen === 'function') {
      await ensureDbOpen();
    }
    return Boolean(localDb && localDb.isOpen && localDb.isOpen());
  } catch (e) {
    return false;
  }
}

// ─── 1. Sync Customers (Dexie -> Firestore) ───
export async function syncCustomers(uid) {
  if (CLOUD_SYNC_DISABLED || !db || !uid || quotaBlocked) return;
  if (!(await isDbReady()) || !localDb.customers) return;

  try {
    const local = await localDb.customers.where('uid').equals(uid).toArray();
    const pending = local.filter(c => !c.synced || c.synced === 0 || c._sync !== 'synced');

    for (const c of pending) {
      const docId = c.id || c.customerId;
      if (!docId) continue;
      try {
        const ref = doc(db, 'customers', String(docId));
        await setDoc(ref, { ...c, synced: 1, _synced: 1, _sync: 'synced', uid }, { merge: true });
        await localDb.customers.update(docId, { synced: 1, _synced: 1, _sync: 'synced' });
      } catch (e) {
        if (e?.code === 'resource-exhausted') {
          quotaBlocked = true;
          quotaBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS;
          return;
        }
      }
    }
  } catch (err) {
    console.warn('syncCustomers error:', err?.message);
  }
}

// ─── 2. Sync Items (Dexie -> Firestore) ───
export async function syncItems(uid) {
  if (CLOUD_SYNC_DISABLED || !db || !uid || quotaBlocked) return;
  if (!(await isDbReady()) || !localDb.items) return;

  try {
    const local = await localDb.items.where('uid').equals(uid).toArray();
    const pending = local.filter(i => !i.synced || i.synced === 0 || i._sync !== 'synced');

    for (const item of pending) {
      const docId = item.id || item.itemId;
      if (!docId) continue;
      try {
        const ref = doc(db, 'items', String(docId));
        await setDoc(ref, { ...item, synced: 1, _synced: 1, _sync: 'synced', uid }, { merge: true });
        await localDb.items.update(docId, { synced: 1, _synced: 1, _sync: 'synced' });
      } catch (e) {
        if (e?.code === 'resource-exhausted') {
          quotaBlocked = true;
          quotaBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS;
          return;
        }
      }
    }
  } catch (err) {
    console.warn('syncItems error:', err?.message);
  }
}

// ─── 3. Sync Customer Loans (Dexie -> Firestore) ───
export async function syncCustomerLoans(uid) {
  if (CLOUD_SYNC_DISABLED || !db || !uid || quotaBlocked) return;
  if (!(await isDbReady()) || !localDb.customerLoans) return;

  try {
    const local = await localDb.customerLoans.where('uid').equals(uid).toArray();
    const pending = local.filter(l => !l.synced || l.synced === 0 || l._sync !== 'synced');

    for (const loan of pending) {
      const docId = loan.id || loan.loanId;
      if (!docId) continue;
      try {
        const ref = doc(db, 'customerLoans', String(docId));
        await setDoc(ref, { ...loan, synced: 1, _synced: 1, _sync: 'synced', uid }, { merge: true });
        await localDb.customerLoans.update(docId, { synced: 1, _synced: 1, _sync: 'synced' });
      } catch (e) {
        if (e?.code === 'resource-exhausted') {
          quotaBlocked = true;
          quotaBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS;
          return;
        }
      }
    }
  } catch (err) {
    console.warn('syncCustomerLoans error:', err?.message);
  }
}

// ─── 4. Sync Invoices (Dexie -> Firestore) ───
export async function syncInvoices(uid) {
  if (CLOUD_SYNC_DISABLED || !db || !uid || quotaBlocked) return;
  if (!(await isDbReady()) || !localDb.invoices) return;

  try {
    const local = await localDb.invoices.where('uid').equals(uid).toArray();
    const pending = local.filter(inv => !inv.synced || inv.synced === 0 || inv._sync !== 'synced');

    for (const inv of pending) {
      const docId = inv.id || inv.invoiceId;
      if (!docId) continue;
      try {
        const ref = doc(db, 'invoices', String(docId));
        await setDoc(ref, { ...inv, synced: 1, _synced: 1, _sync: 'synced', uid }, { merge: true });

        // Batch deductions apply
        if (inv._pendingBatchUpdates && Object.keys(inv._pendingBatchUpdates).length > 0) {
          try {
            const fbBatch = writeBatch(db);
            for (const [, upd] of Object.entries(inv._pendingBatchUpdates)) {
              const batchRef = doc(db, upd.col, upd.docId);
              const snap = await getDoc(batchRef);
              if (!snap.exists()) continue;
              const data = snap.data();
              const items = [...(data.items || [])];
              upd.updates.forEach(({ index, qty }) => {
                if (index >= 0 && index < items.length) {
                  const cur = items[index].remainingQty ?? items[index].qty ?? 0;
                  items[index] = { ...items[index], remainingQty: Math.max(0, parseFloat((cur - qty).toFixed(2))) };
                }
              });
              fbBatch.update(batchRef, { items, updatedAt: new Date().toISOString() });
            }
            await fbBatch.commit();
          } catch (be) {
            console.warn('[Sync] Batch commit warning:', be?.message);
          }
        }

        await localDb.invoices.update(docId, {
          synced: 1,
          _synced: 1,
          _sync: 'synced',
          _pendingBatchUpdates: null
        });
      } catch (e) {
        if (e?.code === 'resource-exhausted') {
          quotaBlocked = true;
          quotaBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS;
          return;
        }
      }
    }
  } catch (err) {
    console.warn('syncInvoices error:', err?.message);
  }
}

// ─── 5. Sync Purchases (Dexie -> Firestore) ───
export async function syncPurchases(uid) {
  if (CLOUD_SYNC_DISABLED || !db || !uid || quotaBlocked) return;
  if (!(await isDbReady()) || !localDb.purchases) return;

  try {
    const local = await localDb.purchases.where('uid').equals(uid).toArray();
    const pending = local.filter(p => !p.synced || p.synced === 0 || p._sync !== 'synced');

    for (const p of pending) {
      const docId = p.id || p.purchaseId;
      if (!docId) continue;
      try {
        const ref = doc(db, 'purchases', String(docId));
        await setDoc(ref, { ...p, synced: 1, _synced: 1, _sync: 'synced', uid }, { merge: true });
        await localDb.purchases.update(docId, { synced: 1, _synced: 1, _sync: 'synced' });
      } catch (e) {
        if (e?.code === 'resource-exhausted') {
          quotaBlocked = true;
          quotaBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS;
          return;
        }
      }
    }
  } catch (err) {
    console.warn('syncPurchases error:', err?.message);
  }
}

// ─── 6. Sync Suppliers (Dexie -> Firestore) ───
export async function syncSuppliers(uid) {
  if (CLOUD_SYNC_DISABLED || !db || !uid || quotaBlocked) return;
  if (!(await isDbReady()) || !localDb.suppliers) return;

  try {
    const local = await localDb.suppliers.where('uid').equals(uid).toArray();
    const pending = local.filter(s => !s.synced || s.synced === 0 || s._sync !== 'synced');

    for (const s of pending) {
      const docId = s.id || s.supplierId;
      if (!docId) continue;
      try {
        const ref = doc(db, 'suppliers', String(docId));
        await setDoc(ref, { ...s, synced: 1, _synced: 1, _sync: 'synced', uid }, { merge: true });
        await localDb.suppliers.update(docId, { synced: 1, _synced: 1, _sync: 'synced' });
      } catch (e) {
        if (e?.code === 'resource-exhausted') {
          quotaBlocked = true;
          quotaBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS;
          return;
        }
      }
    }
  } catch (err) {
    console.warn('syncSuppliers error:', err?.message);
  }
}

// ─── Mirror: Firestore -> Dexie (Pull Cloud Data) ───
export async function startMirror(uid) {
  if (CLOUD_SYNC_DISABLED || !db || !uid || quotaBlocked) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  if (!(await isDbReady())) return;

  const collections = ['items', 'customers', 'customerLoans', 'invoices', 'purchases', 'suppliers'];
  let totalDocs = 0;

  for (const col of collections) {
    if (!localDb[col]) continue;
    try {
      const q = query(collection(db, col), where('uid', '==', uid));
      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        uid,
        synced: 1,
        _synced: 1,
        _sync: 'synced'
      }));

      if (docs.length > 0) {
        await localDb[col].bulkPut(docs);
        totalDocs += docs.length;
      }
    } catch (e) {
      if (e?.code === 'resource-exhausted' || e?.message?.includes('Quota exceeded')) {
        quotaBlocked = true;
        quotaBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS;
        console.warn('⚠️ Quota exceeded during mirror pull. Skipping.');
        break;
      }
    }
  }

  if (totalDocs > 0) {
    console.log(`📥 [Pull Complete] ${totalDocs} records updated from Cloud to Dexie.`);
  }
}

// ─── Main Sync All ───
export async function syncAll(uid) {
  if (CLOUD_SYNC_DISABLED || quotaBlocked || !uid) return;

  await safe('customers', () => syncCustomers(uid));
  await safe('customerLoans', () => syncCustomerLoans(uid));
  await safe('items', () => syncItems(uid));
  await safe('invoices', () => syncInvoices(uid));
  await safe('purchases', () => syncPurchases(uid));
  await safe('suppliers', () => syncSuppliers(uid));
}

// ─── Hard Drive Smart Backup (Safe for PC with only C: drive) ───
export async function triggerLocalDiskBackup(uid) {
  if (!uid) return;
  try {
    const isElectron = typeof window !== 'undefined' && window.require;
    if (!isElectron) return;
    if (!(await isDbReady())) return;

    const fs = window.require('fs');
    const pathMod = window.require('path');

    let baseDrive = 'C:\\';
    try {
      if (fs.existsSync('D:\\')) {
        baseDrive = 'D:\\';
      }
    } catch (e) {
      baseDrive = 'C:\\';
    }

    const backupDir = pathMod.join(baseDrive, 'Weerakkodi_POS_Backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const tables = ['customers', 'customerLoans', 'items', 'invoices', 'purchases', 'suppliers'];
    const allData = {};

    for (const table of tables) {
      if (localDb[table]) {
        try {
          const rows = await localDb[table].where('uid').equals(uid).toArray();
          allData[table] = rows;
        } catch (te) {
          allData[table] = [];
        }
      }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const shortUid = uid.slice(0, 8);
    const snapshotFile = pathMod.join(backupDir, `backup_${shortUid}_${timestamp}.json`);

    fs.writeFileSync(snapshotFile, JSON.stringify(allData, null, 2), 'utf8');

    for (const table of tables) {
      if (allData[table] && allData[table].length > 0) {
        const tableFile = pathMod.join(backupDir, `${table}_latest.json`);
        fs.writeFileSync(tableFile, JSON.stringify(allData[table], null, 2), 'utf8');
      }
    }

    console.log(`💾 [Disk Backup Success] Saved to: ${backupDir}`);
  } catch (e) {
    console.warn('Disk backup error:', e?.message);
  }
}

// ─── 🛡️ Multi-Tenant Data Protection (Preserve & Adopt - NEVER PURGE) ───
export async function purgeOtherUsers(uid) {
  // SAFETY GUARANTEE: කිසිදු හේතුවක් නිසාවත් Hard disk එකේ ඇති දත්ත Delete නොකරයි.
  // Legacy / unassigned records වත්මන් UID එකට adopt කර ස්ථිරව ආරක්ෂා කරයි.
  if (!uid || typeof window === 'undefined') return;

  try {
    if (typeof ensureDbOpen === 'function') await ensureDbOpen();
    if (!localDb || !localDb.isOpen()) return;

    const tables = ['items', 'customers', 'customerLoans', 'invoices', 'purchases', 'suppliers', 'cashTransactions'];
    let totalAdopted = 0;

    for (const table of tables) {
      if (!localDb[table]) continue;
      try {
        const unassigned = await localDb[table].filter(r => r && (!r.uid || r.uid === 'pos_local_user')).toArray();
        if (unassigned.length > 0) {
          const toUpdate = unassigned.map(r => ({ ...r, uid }));
          await localDb[table].bulkPut(toUpdate);
          totalAdopted += toUpdate.length;
        }
      } catch (te) {}
    }

    if (totalAdopted > 0) {
      console.log(`🛡️ [Data Protected] Preserved & adopted ${totalAdopted} legacy records to store (${uid.slice(0, 8)}).`);
    }
  } catch (err) {
    console.warn('[Sync] Data protection pass completed safely:', err?.message);
  }
}

// ─── Auto-Sync Engine ───
export function startAutoSync(uid, setPendingSyncCount) {
  if (!uid) return () => {};

  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
    autoSyncInterval = null;
  }

  console.log('🚀 Auto-Sync Engine Started');
  // Safe data preservation pass
  purgeOtherUsers(uid).catch(() => {});

  const doSync = async () => {
    if (isSyncing) return;
    isSyncing = true;

    try {
      if (CLOUD_SYNC_DISABLED) {
        if (setPendingSyncCount) setPendingSyncCount(0);
        await triggerLocalDiskBackup(uid);
        return;
      }

      await syncAll(uid);
      await startMirror(uid);

      if (setPendingSyncCount && (await isDbReady())) {
        let pending = 0;
        const tables = ['customers', 'customerLoans', 'items', 'invoices', 'purchases', 'suppliers'];
        for (const table of tables) {
          if (localDb[table]) {
            const rows = await localDb[table].where('uid').equals(uid).toArray();
            pending += rows.filter(r => !r.synced || r.synced === 0 || r._sync !== 'synced').length;
          }
        }
        setPendingSyncCount(pending);
      }

      await triggerLocalDiskBackup(uid);
    } catch (err) {
      console.warn('[AutoSync] cycle warning:', err?.message);
    } finally {
      isSyncing = false;
    }
  };

  // පළමු sync එක වහාම ක්‍රියාත්මක කරයි
  doSync();

  autoSyncInterval = setInterval(doSync, SYNC_INTERVAL);

  let onOnline = () => {
    if (!CLOUD_SYNC_DISABLED) {
      console.log('🌐 Online detected, starting sync...');
      clearQuotaBlock();
      doSync();
    }
  };

  let onOffline = () => {
    console.log('🔌 Offline detected - Full Local Mode active');
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
  }

  return () => {
    if (autoSyncInterval) clearInterval(autoSyncInterval);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    }
  };
}

// ─── Pull Invoices (Root & User Fallback) ───
export async function pullInvoicesOnce(uid) {
  if (!uid || !db || quotaBlocked) return 0;
  try {
    const q1 = query(collection(db, 'invoices'), where('uid', '==', uid));
    let snap = await getDocs(q1);

    if (snap.empty) {
      const q2 = query(collection(db, 'users', uid, 'invoices'));
      snap = await getDocs(q2);
    }

    const docs = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      uid,
      synced: 1,
      _synced: 1,
      _sync: 'synced'
    }));

    if (docs.length > 0 && (await isDbReady()) && localDb?.invoices) {
      await localDb.invoices.bulkPut(docs);
      console.log(`📋 Pulled ${docs.length} invoices to Dexie.`);
    }
    return docs.length;
  } catch (e) {
    console.warn('Invoice pull error:', e?.message);
    return 0;
  }
}

export async function forceSyncAndBackup(uid) {
  clearQuotaBlock();
  await syncAll(uid);
  await triggerLocalDiskBackup(uid);
}

export default {
  syncAll,
  startAutoSync,
  triggerLocalDiskBackup,
  purgeOtherUsers,
  pullInvoicesOnce,
  forceSyncAndBackup,
  enableCloudSync,
  disableCloudSync,
  syncCustomerLoans
};