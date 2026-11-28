// lib/syncService.js
// ✅ Strict Multi-Tenant Offline-first sync: Dexie (PC Hard Disk) <-> Firestore (Cloud)
// 🛡️ GUARANTEE: Only the currently logged-in user's data is downloaded from Firestore.
// 🛡️ Zero cross-tenant data leakage. Other users' records are strictly ignored & filtered out.

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

// ─── Helper: Normalize UID ───
const cleanUid = (uid) => String(uid || '').trim();

// ─── 1. Sync Customers (Dexie -> Firestore) ───
export async function syncCustomers(uid) {
  const activeUid = cleanUid(uid);
  if (CLOUD_SYNC_DISABLED || !db || !activeUid || quotaBlocked) return;
  if (!(await isDbReady()) || !localDb.customers) return;

  try {
    const all = await localDb.customers.toArray();
    const local = all.filter(c => cleanUid(c.uid) === activeUid);
    const pending = local.filter(c => !c.synced || c.synced === 0 || c._sync !== 'synced');

    for (const c of pending) {
      const docId = c.id || c.customerId;
      if (!docId) continue;
      try {
        const ref = doc(db, 'customers', String(docId));
        await setDoc(ref, { ...c, synced: 1, _synced: 1, _sync: 'synced', uid: activeUid }, { merge: true });
        await localDb.customers.update(docId, { synced: 1, _synced: 1, _sync: 'synced', uid: activeUid });
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
  const activeUid = cleanUid(uid);
  if (CLOUD_SYNC_DISABLED || !db || !activeUid || quotaBlocked) return;
  if (!(await isDbReady()) || !localDb.items) return;

  try {
    const all = await localDb.items.toArray();
    const local = all.filter(i => cleanUid(i.uid) === activeUid);
    const pending = local.filter(i => !i.synced || i.synced === 0 || i._sync !== 'synced');

    for (const item of pending) {
      const docId = item.id || item.itemId;
      if (!docId) continue;
      try {
        const ref = doc(db, 'items', String(docId));
        await setDoc(ref, { ...item, synced: 1, _synced: 1, _sync: 'synced', uid: activeUid }, { merge: true });
        await localDb.items.update(docId, { synced: 1, _synced: 1, _sync: 'synced', uid: activeUid });
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
  const activeUid = cleanUid(uid);
  if (CLOUD_SYNC_DISABLED || !db || !activeUid || quotaBlocked) return;
  if (!(await isDbReady()) || !localDb.customerLoans) return;

  try {
    const all = await localDb.customerLoans.toArray();
    const local = all.filter(l => cleanUid(l.uid) === activeUid);
    const pending = local.filter(l => !l.synced || l.synced === 0 || l._sync !== 'synced');

    for (const loan of pending) {
      const docId = loan.id || loan.loanId;
      if (!docId) continue;
      try {
        const ref = doc(db, 'customerLoans', String(docId));
        await setDoc(ref, { ...loan, synced: 1, _synced: 1, _sync: 'synced', uid: activeUid }, { merge: true });
        await localDb.customerLoans.update(docId, { synced: 1, _synced: 1, _sync: 'synced', uid: activeUid });
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
  const activeUid = cleanUid(uid);
  if (CLOUD_SYNC_DISABLED || !db || !activeUid || quotaBlocked) return;
  if (!(await isDbReady()) || !localDb.invoices) return;

  try {
    const all = await localDb.invoices.toArray();
    const local = all.filter(inv => cleanUid(inv.uid) === activeUid);
    const pending = local.filter(inv => !inv.synced || inv.synced === 0 || inv._sync !== 'synced');

    for (const inv of pending) {
      const docId = inv.id || inv.invoiceId;
      if (!docId) continue;
      try {
        const ref = doc(db, 'invoices', String(docId));
        await setDoc(ref, { ...inv, synced: 1, _synced: 1, _sync: 'synced', uid: activeUid }, { merge: true });

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
          uid: activeUid,
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
  const activeUid = cleanUid(uid);
  if (CLOUD_SYNC_DISABLED || !db || !activeUid || quotaBlocked) return;
  if (!(await isDbReady()) || !localDb.purchases) return;

  try {
    const all = await localDb.purchases.toArray();
    const local = all.filter(p => cleanUid(p.uid) === activeUid);
    const pending = local.filter(p => !p.synced || p.synced === 0 || p._sync !== 'synced');

    for (const p of pending) {
      const docId = p.id || p.purchaseId;
      if (!docId) continue;
      try {
        const ref = doc(db, 'purchases', String(docId));
        await setDoc(ref, { ...p, synced: 1, _synced: 1, _sync: 'synced', uid: activeUid }, { merge: true });
        await localDb.purchases.update(docId, { synced: 1, _synced: 1, _sync: 'synced', uid: activeUid });
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
  const activeUid = cleanUid(uid);
  if (CLOUD_SYNC_DISABLED || !db || !activeUid || quotaBlocked) return;
  if (!(await isDbReady()) || !localDb.suppliers) return;

  try {
    const all = await localDb.suppliers.toArray();
    const local = all.filter(s => cleanUid(s.uid) === activeUid);
    const pending = local.filter(s => !s.synced || s.synced === 0 || s._sync !== 'synced');

    for (const s of pending) {
      const docId = s.id || s.supplierId;
      if (!docId) continue;
      try {
        const ref = doc(db, 'suppliers', String(docId));
        await setDoc(ref, { ...s, synced: 1, _synced: 1, _sync: 'synced', uid: activeUid }, { merge: true });
        await localDb.suppliers.update(docId, { synced: 1, _synced: 1, _sync: 'synced', uid: activeUid });
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

// ─── 🛡️ STRICT USER-ONLY MIRROR: Firestore -> Dexie (Pull Cloud Data) ───
export async function startMirror(uid) {
  const activeUid = cleanUid(uid);
  if (CLOUD_SYNC_DISABLED || !db || !activeUid || quotaBlocked) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  if (!(await isDbReady())) return;

  const collections = ['items', 'customers', 'customerLoans', 'invoices', 'purchases', 'suppliers'];
  let totalDocs = 0;

  for (const col of collections) {
    if (!localDb[col]) continue;
    try {
      // 🛡️ 1. Root Collection Query with strict UID filter
      const q = query(collection(db, col), where('uid', '==', activeUid));
      const snap = await getDocs(q);

      // 🛡️ Strict Double-Check: Filter out ANY document that doesn't strictly match activeUid
      const validDocs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(d => d && cleanUid(d.uid) === activeUid)
        .map(d => ({
          ...d,
          uid: activeUid, // Enforce current logged-in UID
          synced: 1,
          _synced: 1,
          _sync: 'synced'
        }));

      // 🛡️ 2. User Subcollection Fallback (users/{uid}/{col}) if root is empty
      if (validDocs.length === 0) {
        try {
          const userSubColSnap = await getDocs(collection(db, 'users', activeUid, col));
          const subDocs = userSubColSnap.docs.map(d => ({
            id: d.id,
            ...d.data(),
            uid: activeUid,
            synced: 1,
            _synced: 1,
            _sync: 'synced'
          }));
          validDocs.push(...subDocs);
        } catch (subErr) {}
      }

      // Save strictly validated documents to Dexie
      if (validDocs.length > 0) {
        await localDb[col].bulkPut(validDocs);
        totalDocs += validDocs.length;
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
    console.log(`📥 [Strict Pull Complete] ${totalDocs} records updated from Cloud for user ${activeUid.slice(0, 8)}.`);
  }
}

// ─── Main Sync All ───
export async function syncAll(uid) {
  const activeUid = cleanUid(uid);
  if (CLOUD_SYNC_DISABLED || quotaBlocked || !activeUid) return;

  await safe('customers', () => syncCustomers(activeUid));
  await safe('customerLoans', () => syncCustomerLoans(activeUid));
  await safe('items', () => syncItems(activeUid));
  await safe('invoices', () => syncInvoices(activeUid));
  await safe('purchases', () => syncPurchases(activeUid));
  await safe('suppliers', () => syncSuppliers(activeUid));
}

// ─── Hard Drive Smart Backup (Scoped to Logged-in User Only) ───
export async function triggerLocalDiskBackup(uid) {
  const activeUid = cleanUid(uid);
  if (!activeUid) return;
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
          const all = await localDb[table].toArray();
          const rows = all.filter(r => cleanUid(r.uid) === activeUid);
          allData[table] = rows;
        } catch (te) {
          allData[table] = [];
        }
      }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const shortUid = activeUid.slice(0, 8);
    const snapshotFile = pathMod.join(backupDir, `backup_${shortUid}_${timestamp}.json`);

    fs.writeFileSync(snapshotFile, JSON.stringify(allData, null, 2), 'utf8');

    for (const table of tables) {
      if (allData[table] && allData[table].length > 0) {
        const tableFile = pathMod.join(backupDir, `${table}_${shortUid}_latest.json`);
        fs.writeFileSync(tableFile, JSON.stringify(allData[table], null, 2), 'utf8');
      }
    }

    console.log(`💾 [Disk Backup Success] Saved strictly for ${shortUid} to: ${backupDir}`);
  } catch (e) {
    console.warn('Disk backup error:', e?.message);
  }
}

// ─── 🛡️ Safe Adoption of Local Legacy Records ───
export async function purgeOtherUsers(uid) {
  const activeUid = cleanUid(uid);
  if (!activeUid || typeof window === 'undefined') return;

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
          const toUpdate = unassigned.map(r => ({ ...r, uid: activeUid }));
          await localDb[table].bulkPut(toUpdate);
          totalAdopted += toUpdate.length;
        }
      } catch (te) {}
    }

    if (totalAdopted > 0) {
      console.log(`🛡️ [Data Protected] Adopted ${totalAdopted} local offline records to store (${activeUid.slice(0, 8)}).`);
    }
  } catch (err) {
    console.warn('[Sync] Adoption pass handled safely:', err?.message);
  }
}

// ─── Auto-Sync Engine ───
export function startAutoSync(uid, setPendingSyncCount) {
  const activeUid = cleanUid(uid);
  if (!activeUid) return () => {};

  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
    autoSyncInterval = null;
  }

  console.log(`🚀 Auto-Sync Engine Started for user: ${activeUid.slice(0, 8)}`);
  purgeOtherUsers(activeUid).catch(() => {});

  const doSync = async () => {
    if (isSyncing) return;
    isSyncing = true;

    try {
      if (CLOUD_SYNC_DISABLED) {
        if (setPendingSyncCount) setPendingSyncCount(0);
        await triggerLocalDiskBackup(activeUid);
        return;
      }

      await syncAll(activeUid);
      await startMirror(activeUid);

      if (setPendingSyncCount && (await isDbReady())) {
        let pending = 0;
        const tables = ['customers', 'customerLoans', 'items', 'invoices', 'purchases', 'suppliers'];
        for (const table of tables) {
          if (localDb[table]) {
            const all = await localDb[table].toArray();
            const rows = all.filter(r => cleanUid(r.uid) === activeUid);
            pending += rows.filter(r => !r.synced || r.synced === 0 || r._sync !== 'synced').length;
          }
        }
        setPendingSyncCount(pending);
      }

      await triggerLocalDiskBackup(activeUid);
    } catch (err) {
      console.warn('[AutoSync] cycle warning:', err?.message);
    } finally {
      isSyncing = false;
    }
  };

  // First sync immediately
  doSync();

  autoSyncInterval = setInterval(doSync, SYNC_INTERVAL);

  let onOnline = () => {
    if (!CLOUD_SYNC_DISABLED) {
      console.log('🌐 Online detected, starting sync for active user...');
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

// ─── Strict Pull Invoices ───
export async function pullInvoicesOnce(uid) {
  const activeUid = cleanUid(uid);
  if (!activeUid || !db || quotaBlocked) return 0;
  try {
    const q1 = query(collection(db, 'invoices'), where('uid', '==', activeUid));
    let snap = await getDocs(q1);

    if (snap.empty) {
      const q2 = query(collection(db, 'users', activeUid, 'invoices'));
      snap = await getDocs(q2);
    }

    const docs = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(d => cleanUid(d.uid) === activeUid)
      .map(d => ({
        ...d,
        uid: activeUid,
        synced: 1,
        _synced: 1,
        _sync: 'synced'
      }));

    if (docs.length > 0 && (await isDbReady()) && localDb?.invoices) {
      await localDb.invoices.bulkPut(docs);
      console.log(`📋 Pulled ${docs.length} user invoices to Dexie.`);
    }
    return docs.length;
  } catch (e) {
    console.warn('Invoice pull error:', e?.message);
    return 0;
  }
}

export async function forceSyncAndBackup(uid) {
  const activeUid = cleanUid(uid);
  clearQuotaBlock();
  await syncAll(activeUid);
  await triggerLocalDiskBackup(activeUid);
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