const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'lib/syncService.js');
const content = `// lib/syncService.js
// Offline→Firestore push  +  Firestore(uid-scoped)→Dexie→Hard Disk mirror
// ✅ Fixed: Multi-tenant, purchases, suppliers, quota guard, orphan cleanup
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, doc, getDoc, getDocs, setDoc, query, where, onSnapshot,
  runTransaction, increment, serverTimestamp,
} from 'firebase/firestore';
import { localDb } from '@/lib/localDb';

/* ── State ── */
let running = false;
let queued = false;
let retryTimer = null;
let retryCount = 0;
const MAX_RETRIES = 5;
const RETRY_DELAYS = [3000, 8000, 20000, 45000, 90000];
let autoSyncActive = false;
let previousAuthUid = null;
const QUOTA_KEY = 'fs_quota_blocked_until';

/* ── Helpers ── */
const FAKE_UIDS = ['offline_master_admin', 'offline_user', 'unknown'];
const R2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const strip = (obj) => JSON.parse(JSON.stringify(obj, (_, v) => (v === undefined ? null : v)));
const isPersisted = (id) => id && id !== 'CASH_CUSTOMER' && id !== 'TEMP_ORDER_CUSTOMER';
const isNetworkErr = (e) => /offline|unavailable|network/i.test(e?.message || '');
const isQuota = (e) => e?.code === 'resource-exhausted' || /quota/i.test(e?.message || '');

const plain = (v) => {
  if (v === null || v === undefined) return v;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = plain(v[k]);
    return o;
  }
  return v;
};

/* ── Quota Guard ── */
function quotaBlocked() {
  try { return Date.now() < Number(localStorage.getItem(QUOTA_KEY) || 0); } catch { return false; }
}
function blockQuota() {
  try {
    const d = new Date();
    d.setUTCHours(8, 0, 0, 0);
    if (d <= new Date()) d.setUTCDate(d.getUTCDate() + 1);
    localStorage.setItem(QUOTA_KEY, String(d.getTime()));
    console.warn('⛔ Firestore quota ඉවරයි. Sync නවතා ඇත →', d.toString());
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('pos-quota-exceeded'));
  } catch {}
}
function clearQuotaBlock() {
  try { localStorage.removeItem(QUOTA_KEY); } catch {}
}

const safe = async (name, fn) => {
  try { return await fn(); }
  catch (e) {
    if (isQuota(e)) { blockQuota(); throw e; }
    console.warn(\`Sync step "\${name}" failed:\`, e.message);
    if (isNetworkErr(e)) throw e;
    return 0;
  }
};

/* ══════════════ UID ══════════════ */
async function getEffectiveUID() {
  if (auth?.currentUser?.uid) return auth.currentUser.uid;
  try {
    const uid = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 3000);
      const unsub = onAuthStateChanged(auth, (u) => { clearTimeout(timeout); unsub(); resolve(u?.uid || null); });
    });
    if (uid) return uid;
  } catch {}
  try {
    const cached = await localDb.settings.get('current_user');
    if (cached?.uid && !FAKE_UIDS.includes(cached.uid)) return cached.uid;
  } catch {}
  return null;
}

/* ══════════════ HARD DISK BACKUP ══════════════ */
let backupTimer = null;
let notifyTimer = null;

export async function triggerLocalDiskBackup(uidOverride) {
  try {
    if (typeof window === 'undefined' || !window.electronAPI?.saveLocalData) return;
    const uid = uidOverride || (await getEffectiveUID());
    if (!uid) return;

    const [customers, invoices, items, purchases, suppliers] = await Promise.all([
      localDb.customers.where('uid').equals(uid).toArray().catch(() => []),
      localDb.invoices.where('uid').equals(uid).toArray().catch(() => []),
      localDb.items.where('uid').equals(uid).toArray().catch(() => []),
      localDb.purchases ? localDb.purchases.where('uid').equals(uid).toArray().catch(() => []) : [],
      localDb.suppliers ? localDb.suppliers.where('uid').equals(uid).toArray().catch(() => []) : [],
    ]);
    const customerLoans = localDb.customerLoans
      ? (await localDb.customerLoans.toArray().catch(() => [])).filter((l) => !l.uid || l.uid === uid)
      : [];

    const tag = uid.slice(0, 12);
    const day = new Date().toISOString().slice(0, 10);

    await Promise.allSettled([
      window.electronAPI.saveLocalData(\`customers_\${tag}\`, customers),
      window.electronAPI.saveLocalData(\`invoices_\${tag}\`, invoices),
      window.electronAPI.saveLocalData(\`items_\${tag}\`, items),
      window.electronAPI.saveLocalData(\`purchases_\${tag}\`, purchases),
      window.electronAPI.saveLocalData(\`suppliers_\${tag}\`, suppliers),
      window.electronAPI.saveLocalData(\`customerLoans_\${tag}\`, customerLoans),
      window.electronAPI.saveLocalData(\`full_snapshot_\${tag}_\${day}\`, {
        customers, invoices, items, purchases, suppliers, customerLoans,
        exportedAt: new Date().toISOString(),
      }),
    ]);
    console.log(\`💾 Disk backup [\${tag}]: \${customers.length}c, \${invoices.length}i, \${items.length}it, \${purchases.length}p, \${suppliers.length}s\`);
  } catch (e) {
    console.warn('Disk backup warning:', e.message);
  }
}

function notifyChanged(uid) {
  clearTimeout(backupTimer);
  backupTimer = setTimeout(() => triggerLocalDiskBackup(uid), 3000);
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('pos-data-synced'));
  }, 400);
}

/* ══════════════ PUSH: Offline → Firestore ══════════════ */
async function syncCustomers(uid) {
  const pending = await localDb.customers.where('uid').equals(uid).filter((c) => c.synced === false).toArray();
  let ok = 0;
  for (const c of pending) {
    try {
      const custRef = doc(db, 'customers', c.id);
      const existing = await getDoc(custRef);
      const { synced, currentBalance, localId, ...rest } = c;
      const payload = { ...rest, uid, syncedAt: serverTimestamp(), source: 'offline-pos' };
      if (!existing.exists()) payload.currentBalance = Number(currentBalance) || 0;
      await setDoc(custRef, strip(payload), { merge: true });
      await localDb.customers.update(c.id, { synced: true });
      ok++;
    } catch (e) {
      console.warn('Customer sync failed:', c.id, e.message);
      if (isQuota(e) || isNetworkErr(e)) throw e;
    }
  }
  return ok;
}

async function syncSuppliers(uid) {
  if (!localDb.suppliers) return 0;
  const pending = await localDb.suppliers.where('uid').equals(uid).filter((s) => s.synced === false).toArray();
  let ok = 0;
  for (const s of pending) {
    try {
      const ref = doc(db, 'suppliers', s.id);
      const { synced, localId, ...rest } = s;
      await setDoc(ref, strip({ ...rest, uid, syncedAt: serverTimestamp(), source: 'offline-pos' }), { merge: true });
      await localDb.suppliers.update(s.id, { synced: true });
      ok++;
    } catch (e) {
      console.warn('Supplier sync failed:', s.id, e.message);
      if (isQuota(e) || isNetworkErr(e)) throw e;
    }
  }
  return ok;
}

async function syncCustomerLoans(uid) {
  if (!localDb.customerLoans) return 0;
  const all = await localDb.customerLoans.toArray();
  const pending = all.filter((l) => l.synced === false && (!l.uid || l.uid === uid));
  let ok = 0;
  for (const loan of pending) {
    try {
      const loanRef = doc(db, 'customerLoans', loan.id);
      const custRef = doc(db, 'customers', loan.customerId);
      const amount = Number(loan.amount) || 0;
      await runTransaction(db, async (tx) => {
        const existing = await tx.get(loanRef);
        if (existing.exists()) return;
        const custSnap = await tx.get(custRef);
        const { synced, localId, ...rest } = loan;
        tx.set(loanRef, strip({ ...rest, uid, syncedAt: serverTimestamp(), source: 'offline-pos' }));
        if (custSnap.exists() && amount !== 0) {
          tx.update(custRef, { currentBalance: increment(loan.type === 'payment' ? -Math.abs(amount) : Math.abs(amount)) });
        }
      });
      await localDb.customerLoans.update(loan.id, { synced: true, uid });
      ok++;
    } catch (e) {
      console.warn('Loan sync failed:', loan.id, e.message);
      if (isQuota(e) || isNetworkErr(e)) throw e;
    }
  }
  return ok;
}

async function syncInvoices(uid) {
  const all = await localDb.invoices.where('uid').equals(uid).toArray();
  const pending = all.filter((i) => !i.synced && i.type !== 'purchase').sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  let ok = 0;

  for (const inv of pending) {
    try {
      const isDraft = inv.status === 'draft';
      const invRef = doc(db, isDraft ? 'drafts' : 'invoices', inv.id);

      const deductions = {};
      if (!isDraft) {
        (inv.items || []).forEach((i) => {
          const itemId = i.itemId || i.id;
          if (!itemId) return;
          const base = R2(Number(i.qty || i.quantity || 1) / Number(i.uomFactor || 1));
          deductions[itemId] = R2((deductions[itemId] || 0) + base);
        });
      }
      const delta = R2((Number(inv.newOutstanding) || 0) - (Number(inv.previousOutstanding) || 0));

      await runTransaction(db, async (tx) => {
        const existing = await tx.get(invRef);
        if (existing.exists()) return;

        const itemRefs = Object.keys(deductions).map((id) => doc(db, 'items', id));
        const itemSnaps = await Promise.all(itemRefs.map((r) => tx.get(r)));
        const custRef = isPersisted(inv.customerId) ? doc(db, 'customers', inv.customerId) : null;
        const custSnap = custRef ? await tx.get(custRef) : null;

        const { synced, localId, ...rest } = inv;
        tx.set(invRef, strip({
          ...rest, uid,
          date: inv.createdAt,
          createdAt: inv.createdAt,
          syncedAt: serverTimestamp(),
          source: 'offline-pos',
        }));

        if (!isDraft) {
          itemSnaps.forEach((snap, idx) => {
            if (!snap.exists()) return;
            const q = deductions[snap.id];
            tx.update(itemRefs[idx], {
              stock: increment(-q), currentStock: increment(-q), 'stocks.Main_Store': increment(-q),
            });
          });
          if (custSnap?.exists() && delta !== 0) tx.update(custRef, { currentBalance: increment(delta) });
        }
      });

      await localDb.invoices.update(inv.id, { synced: true });
      ok++;
    } catch (e) {
      console.warn('Invoice sync failed:', inv.id, e.message);
      if (isQuota(e) || isNetworkErr(e)) throw e;
    }
  }
  return ok;
}

async function syncPurchases(uid) {
  if (!localDb.purchases) return 0;
  const all = await localDb.purchases.where('uid').equals(uid).toArray();
  const pending = all.filter((p) => !p.synced).sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  let ok = 0;

  for (const pur of pending) {
    try {
      const ref = doc(db, 'purchases', pur.id);
      const existing = await getDoc(ref);
      if (existing.exists()) {
        await localDb.purchases.update(pur.id, { synced: true });
        ok++;
        continue;
      }
      const { synced, localId, ...rest } = pur;
      await setDoc(ref, strip({
        ...rest, uid,
        syncedAt: serverTimestamp(),
        source: 'offline-pos',
      }), { merge: true });
      await localDb.purchases.update(pur.id, { synced: true });
      ok++;
    } catch (e) {
      console.warn('Purchase sync failed:', pur.id, e.message);
      if (isQuota(e) || isNetworkErr(e)) throw e;
    }
  }
  return ok;
}

/* ══════════════ PULL / MIRROR: Firestore (uid-scoped) → Dexie ══════════════ */
async function applyDoc(name, id, raw, uid) {
  if (!raw || raw.uid !== uid) return false;
  const table = localDb[name];
  if (!table) return false;
  const local = await table.get(id);
  if (local && local.synced === false) return false;
  const data = plain(raw);
  const rec = { ...(local || {}), ...data, id, uid, synced: true };
  if (name === 'items') {
    const s = data.stock ?? data.currentStock ?? data.quantity;
    if (s !== undefined && s !== null) { rec.stock = Number(s); rec.quantity = Number(s); }
  }
  await table.put(rec);
  return true;
}

async function settleItems(uid) {
  const pend = await localDb.invoices.where('uid').equals(uid).filter((i) => !i.synced && i.type !== 'purchase').count();
  if (pend > 0) return;
  await localDb.items.where('uid').equals(uid).modify({ synced: true });
  try {
    const snap = await getDocs(query(collection(db, 'items'), where('uid', '==', uid)));
    for (const d of snap.docs) await applyDoc('items', d.id, d.data(), uid);
  } catch (e) {
    if (isQuota(e)) blockQuota();
    else console.warn('settleItems failed:', e.message);
  }
  notifyChanged(uid);
}

let mirrorUnsubs = [];
let mirrorChain = Promise.resolve();

function stopMirror() {
  mirrorUnsubs.forEach((u) => { try { u(); } catch {} });
  mirrorUnsubs = [];
}

function startMirror(uid) {
  stopMirror();
  const watch = (name) => {
    if (!localDb[name]) return () => {};
    return onSnapshot(
      query(collection(db, name), where('uid', '==', uid)),
      (snap) => {
        mirrorChain = mirrorChain.then(async () => {
          let changed = false;
          for (const ch of snap.docChanges()) {
            if (ch.doc.metadata.hasPendingWrites) continue;
            if (ch.type === 'removed') {
              const local = await localDb[name].get(ch.doc.id);
              if (local && local.synced !== false) { await localDb[name].delete(ch.doc.id); changed = true; }
              continue;
            }
            if (await applyDoc(name, ch.doc.id, ch.doc.data(), uid)) changed = true;
          }
          if (changed) notifyChanged(uid);
        }).catch((e) => console.warn('Mirror error:', name, e.message));
      },
      (err) => {
        console.warn('Mirror listener error:', name, err?.code, err?.message);
        if (isQuota(err)) blockQuota();
      }
    );
  };
  // ✅ All 5 main tables mirrored
  mirrorUnsubs = [
    watch('items'),
    watch('customers'),
    watch('invoices'),
    watch('purchases'),
    watch('suppliers'),
  ];
  console.log(\`🪞 Mirror started for uid=\${uid.slice(0, 8)}: items, customers, invoices, purchases, suppliers\`);
}

/* ══════════════ ORCHESTRATOR ══════════════ */
export async function syncAll() {
  if (running) { queued = true; return null; }
  if (typeof navigator === 'undefined' || !navigator.onLine || quotaBlocked()) return null;

  const uid = await getEffectiveUID();
  if (!uid) return null;

  running = true;
  try {
    const customers = await safe('customers', () => syncCustomers(uid));
    const suppliers = await safe('suppliers', () => syncSuppliers(uid));
    const loans = await safe('loans', () => syncCustomerLoans(uid));
    const invoices = await safe('invoices', () => syncInvoices(uid));
    const purchases = await safe('purchases', () => syncPurchases(uid));

    if (invoices > 0) await safe('settleItems', () => settleItems(uid));
    const total = customers + suppliers + loans + invoices + purchases;
    if (total > 0) {
      console.log(\`☁️ Synced [\${uid.slice(0, 8)}]: \${customers}c, \${suppliers}s, \${loans}l, \${invoices}i, \${purchases}p\`);
      retryCount = 0;
      notifyChanged(uid);
    }
    return { customers, suppliers, loans, invoices, purchases };
  } catch (e) {
    if (!isQuota(e)) scheduleRetry();
    return null;
  } finally {
    running = false;
    if (queued) { queued = false; setTimeout(syncAll, 500); }
  }
}

function scheduleRetry() {
  if (retryCount >= MAX_RETRIES) return;
  const delay = RETRY_DELAYS[retryCount++] || 60000;
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => { retryTimer = null; if (navigator.onLine && !quotaBlocked()) syncAll(); }, delay);
}

/* ══════════════ PUBLIC API ══════════════ */
export async function syncPendingInvoices() {
  try {
    const res = await syncAll();
    if (!res) return { success: false, syncedCount: 0 };
    return { success: true, syncedCount: (res.invoices || 0) + (res.customers || 0) + (res.loans || 0) + (res.purchases || 0) };
  } catch (e) {
    return { success: false, syncedCount: 0, error: e };
  }
}

export async function forceSyncAndBackup() {
  retryCount = 0; clearTimeout(retryTimer); clearQuotaBlock();
  const res = await syncAll();
  await triggerLocalDiskBackup();
  return res;
}

/* ══════════════ PURGE ══════════════ */
export async function purgeOtherUsers(uid) {
  if (!uid) return;
  console.log(\`[Sync] Purging data not belonging to uid=\${uid.slice(0, 8)}...\`);

  const tables = ['items', 'customers', 'invoices', 'purchases', 'suppliers'];
  let totalPurged = 0;

  for (const t of tables) {
    if (!localDb[t]) continue;
    try {
      const deletedOther = await localDb[t].filter((r) => r.uid && r.uid !== uid).delete();
      const deletedOrphan = await localDb[t].filter((r) => !r.uid || r.uid === null || r.uid === undefined || r.uid === '').delete();
      totalPurged += deletedOther + deletedOrphan;
      if (deletedOther > 0 || deletedOrphan > 0) {
        console.log(\`[Sync] \${t}: purged \${deletedOther} wrong-uid + \${deletedOrphan} orphan\`);
      }
    } catch (e) {
      console.warn(\`[Sync] purge(\${t}) error:\`, e.message);
    }
  }

  for (const t of ['customerLoans', 'cashTransactions', 'payments']) {
    if (!localDb[t]) continue;
    try {
      const d = await localDb[t].filter((r) => !r.uid || r.uid !== uid).delete();
      totalPurged += d;
    } catch {}
  }

  if (totalPurged > 0) {
    console.log(\`[Sync] Total purged: \${totalPurged} records\`);
    notifyChanged(uid);
  }
}

export async function clearAllUserData(uid) {
  if (!uid) return;
  console.log(\`[Sync] Clearing ALL data for uid=\${uid.slice(0, 8)}...\`);
  try {
    const tables = ['items', 'customers', 'invoices', 'purchases', 'suppliers', 'customerLoans', 'cashTransactions', 'payments'];
    await Promise.all(
      tables
        .filter((t) => localDb[t])
        .map((t) => localDb[t].where('uid').equals(uid).delete().catch(() => {}))
    );
    await localDb.settings.delete('current_user').catch(() => {});
  } catch (e) {
    console.warn('[Sync] clearAllUserData failed:', e.message);
  }
}

/* ══════════════ AUTO SYNC ══════════════ */
export function startAutoSync() {
  if (typeof window === 'undefined') return () => {};

  if (autoSyncActive) {
    console.log('[Sync] Auto-Sync already active, re-initializing...');
  }
  autoSyncActive = true;
  console.log('🚀 Auto-Sync Engine Started');

  // ✅ Clear stale quota block on startup if time has passed
  if (quotaBlocked()) {
    const blockedUntil = Number(localStorage.getItem(QUOTA_KEY) || 0);
    if (Date.now() >= blockedUntil) clearQuotaBlock();
  }

  const onOnline = () => {
    retryCount = 0; clearTimeout(retryTimer); clearQuotaBlock();
    setTimeout(syncAll, 2000);
  };
  window.addEventListener('online', onOnline);

  const timer = setInterval(async () => {
    if (!navigator.onLine || quotaBlocked()) return;
    const uid = auth?.currentUser?.uid;
    if (!uid) return;
    const pend =
      (await localDb.invoices.where('uid').equals(uid).filter((i) => !i.synced && i.type !== 'purchase').count().catch(() => 0)) +
      (await localDb.customers.where('uid').equals(uid).filter((c) => c.synced === false).count().catch(() => 0)) +
      (localDb.purchases ? await localDb.purchases.where('uid').equals(uid).filter((p) => !p.synced).count().catch(() => 0) : 0) +
      (localDb.suppliers ? await localDb.suppliers.where('uid').equals(uid).filter((s) => s.synced === false).count().catch(() => 0) : 0);
    if (pend > 0) syncAll();
  }, 30000);

  const unsubAuth = onAuthStateChanged(auth, async (u) => {
    if (u && !FAKE_UIDS.includes(u.uid)) {
      const newUid = u.uid;
      if (previousAuthUid && previousAuthUid !== newUid) {
        console.warn(\`[Sync] 🔀 User switch: \${previousAuthUid.slice(0, 8)} → \${newUid.slice(0, 8)}\`);
        stopMirror();
      }
      previousAuthUid = newUid;
      await purgeOtherUsers(newUid);
      startMirror(newUid);
      syncAll();
    } else {
      if (previousAuthUid) {
        console.log(\`[Sync] 🔒 User logged out: \${previousAuthUid.slice(0, 8)}\`);
        stopMirror();
        await clearAllUserData(previousAuthUid);
        previousAuthUid = null;
      } else {
        stopMirror();
      }
    }
  });

  return () => {
    autoSyncActive = false;
    previousAuthUid = null;
    window.removeEventListener('online', onOnline);
    clearInterval(timer);
    clearTimeout(retryTimer);
    unsubAuth();
    stopMirror();
    console.log('🛑 Auto-Sync Engine Stopped');
  };
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

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ lib/syncService.js updated successfully!');
console.log('');
console.log('Changes made:');
console.log('  1. ✅ Added quota guard (isQuota, blockQuota, quotaBlocked)');
console.log('  2. ✅ Added syncSuppliers() push function');
console.log('  3. ✅ Added syncPurchases() push function');
console.log('  4. ✅ startMirror() now watches: items, customers, invoices, purchases, suppliers');
console.log('  5. ✅ triggerLocalDiskBackup() now includes purchases + suppliers');
console.log('  6. ✅ purgeOtherUsers() now includes purchases + suppliers + payments');
console.log('  7. ✅ clearAllUserData() now includes all 8 tables');
console.log('  8. ✅ syncAll() orchestrator includes all 5 sync functions');
console.log('  9. ✅ Auto-sync interval checks purchases + suppliers pending');
console.log(' 10. ✅ Online event clears quota block');
