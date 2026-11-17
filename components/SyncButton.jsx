'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { localDb } from '@/lib/localDb';
import { useUserAuth } from '@/context/UserContext';

// ============ FIREBASE IMPORTS (ROBUST) ============
let db = null;
let doc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp;

try {
  const firestore = require('firebase/firestore');
  const firebaseApp = require('firebase/app');

  doc = firestore.doc;
  setDoc = firestore.setDoc;
  updateDoc = firestore.updateDoc;
  collection = firestore.collection;
  query = firestore.query;
  where = firestore.where;
  getDocs = firestore.getDocs;
  serverTimestamp = firestore.serverTimestamp;

  try {
    const fb = require('@/firebaseConfig');
    const candidate = fb.db || fb.default;
    if (candidate) db = candidate;
  } catch (e) {}

  if (!db) {
    try {
      const apps = firebaseApp.getApps();
      if (apps.length > 0) db = firestore.getFirestore(apps[0]);
    } catch (e) {}
  }

  if (db) {
    try {
      firestore.collection(db, '_test_validation_');
    } catch (e) {
      db = null;
    }
  }
} catch (e) {
  console.error('[SyncButton] Firebase import error:', e);
}

function isValidDb() {
  return db !== null;
}

/* ══════════════════════════════════════════
   COUNT ALL PENDING UNLOADED DATA
══════════════════════════════════════════ */
async function countPending() {
  let count = 0;
  try {
    try {
      const custs = await localDb.customers.toArray();
      count += custs.filter(c => c.synced === false || c.synced === 0).length;
    } catch {}

    try {
      const txns = await localDb.customerTransactions.toArray();
      count += txns.filter(t => t.id?.startsWith('ctxn_')).length;
    } catch {}

    try {
      const invs = await localDb.invoices.toArray();
      count += invs.filter(i => i.synced === false || i.synced === 0).length;
    } catch {}

    try {
      const cash = await localDb.cashTransactions.toArray();
      count += cash.filter(c => c.id?.startsWith('cash_')).length;
    } catch {}
  } catch (e) {
    console.warn('[Sync] countPending error:', e.message);
  }
  return count;
}

/* ══════════════════════════════════════════
   SYNC ALL PENDING DATA TO FIRESTORE
══════════════════════════════════════════ */
async function syncAllPending(activeUid, onProgress) {
  if (!activeUid || !navigator.onLine || !isValidDb()) return { success: 0, failed: 0, total: 0 };

  let success = 0;
  let failed = 0;
  let total = 0;

  const report = (msg) => {
    if (onProgress) onProgress(msg);
    console.log(`[Sync] ${msg}`);
  };

  try {
    // ── 1. NEW CUSTOMERS ──
    let allCusts = [];
    try {
      allCusts = await localDb.customers.toArray();
    } catch {}

    const unsyncedCusts = allCusts.filter(c => c.synced === false || c.synced === 0);
    for (const cust of unsyncedCusts) {
      total++;
      report(`Customer: ${cust.name}`);
      try {
        const payload = {
          ...cust,
          uid: cust.uid && cust.uid !== 'offline_user' ? cust.uid : activeUid,
          synced: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(doc(db, 'customers', cust.id), payload);
        await localDb.customers.update(cust.id, { synced: true, uid: payload.uid });
        success++;
      } catch (e) {
        report(`❌ ${cust.name}: ${e.message}`);
        failed++;
      }
    }

    // ── 2. CUSTOMER BALANCES ──
    const myCusts = allCusts.filter(c => c.uid === activeUid || !c.uid || c.uid === 'offline_user');
    if (myCusts.length > 0 && getDocs && query && where && collection) {
      try {
        const cloudSnap = await getDocs(query(collection(db, 'customers'), where('uid', '==', activeUid)));
        const cloudMap = new Map(cloudSnap.docs.map(d => [d.id, d.data()]));

        for (const local of myCusts) {
          const cloud = cloudMap.get(local.id);
          if (!cloud) continue;
          const localBal = parseFloat(local.currentBalance) || 0;
          const cloudBal = parseFloat(cloud.currentBalance) || 0;
          if (Math.abs(localBal - cloudBal) > 0.01) {
            const localTime = new Date(local.updatedAt || local.createdAt || 0).getTime();
            const cloudRaw = cloud.updatedAt;
            const cloudTime = cloudRaw?.toDate ? cloudRaw.toDate().getTime() : new Date(cloudRaw || 0).getTime();
            if (localTime >= cloudTime) {
              total++;
              report(`Balance: ${local.name} Rs.${localBal}`);
              try {
                await updateDoc(doc(db, 'customers', local.id), {
                  currentBalance: localBal, updatedAt: serverTimestamp()
                });
                success++;
              } catch { failed++; }
            }
          }
        }
      } catch (e) {
        report(`⚠️ Balance sync skipped: ${e.message}`);
      }
    }

    // ── 3. CUSTOMER TRANSACTIONS ──
    try {
      const txns = await localDb.customerTransactions.toArray();
      const offlineTxns = txns.filter(t => t.id?.startsWith('ctxn_'));
      for (const tx of offlineTxns) {
        total++;
        report(`Txn: ${tx.type} Rs.${tx.amount}`);
        try {
          const payload = {
            ...tx,
            uid: tx.uid && tx.uid !== 'offline_user' ? tx.uid : activeUid,
            createdAt: serverTimestamp(),
          };
          await setDoc(doc(db, 'customerTransactions', tx.id), payload);
          success++;
        } catch { failed++; }
      }
    } catch {}

    // ── 4. INVOICES ──
    let unsyncedInvoices = [];
    try {
      const allInvs = await localDb.invoices.toArray();
      unsyncedInvoices = allInvs.filter(i => i.synced === false || i.synced === 0);
    } catch {}

    for (const inv of unsyncedInvoices) {
      total++;
      report(`Invoice: ${inv.invoiceNo || inv.id}`);
      try {
        const payload = {
          ...inv,
          uid: inv.uid && inv.uid !== 'offline_user' ? inv.uid : activeUid,
          synced: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(doc(db, 'invoices', inv.id), payload);
        await localDb.invoices.update(inv.id, { synced: true, uid: payload.uid });
        success++;
      } catch { failed++; }
    }

    // ── 5. CASH TRANSACTIONS ──
    try {
      const cash = await localDb.cashTransactions.toArray();
      const offlineCash = cash.filter(c => c.id?.startsWith('cash_'));
      for (const c of offlineCash) {
        total++;
        report(`Cash: ${c.type} Rs.${c.amount}`);
        try {
          const payload = {
            ...c,
            uid: c.uid && c.uid !== 'offline_user' ? c.uid : activeUid,
            createdAt: serverTimestamp(),
          };
          await setDoc(doc(db, `users/${activeUid}/cashTransactions`, c.id), payload);
          success++;
        } catch { failed++; }
      }
    } catch {}

  } catch (e) {
    report(`❌ Sync error: ${e.message}`);
  }

  return { success, failed, total };
}

/* ══════════════════════════════════════════
   SYNC BUTTON COMPONENT (ALWAYS VISIBLE)
══════════════════════════════════════════ */
export default function SyncButton({ uid: propUid }) {
  let user = null;
  try {
    const authContext = useUserAuth ? useUserAuth() : null;
    user = authContext?.user;
  } catch (e) {}

  // Resolve UID safely with fallback to real UID
  const activeUid = propUid || user?.uid || (typeof window !== 'undefined' ? localStorage.getItem('weerakkodi_last_uid') : null) || 'wlknSmbTOEbcxp527cqGBnc3yu93';

  const [mounted, setMounted] = useState(false);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const intervalRef = useRef(null);

  useEffect(() => {
    setMounted(true);
    if (typeof navigator !== 'undefined') {
      setIsOnline(navigator.onLine);
    }
  }, []);

  useEffect(() => {
    if (user?.uid && typeof window !== 'undefined') {
      localStorage.setItem('weerakkodi_last_uid', user.uid);
    }
  }, [user]);

  const refreshCount = useCallback(async () => {
    try {
      const c = await countPending();
      setPending(c);
    } catch (e) {
      console.warn('[Sync] Count error:', e.message);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    refreshCount();
    intervalRef.current = setInterval(refreshCount, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [mounted, refreshCount]);

  useEffect(() => {
    if (!mounted) return;
    const onOnline = () => {
      setIsOnline(true);
      refreshCount();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [mounted, refreshCount]);

  const handleSync = async () => {
    if (syncing || !isOnline || !activeUid) return;
    setSyncing(true);
    setShowResult(false);
    setStatus('ආරම්භ කරමින්...');

    const res = await syncAllPending(activeUid, (msg) => setStatus(msg));

    setResult(res);
    setShowResult(true);
    setSyncing(false);
    setStatus('');
    refreshCount();

    setTimeout(() => setShowResult(false), 5000);
  };

  if (!mounted) return null;

  return (
    <>
      <button
        onClick={handleSync}
        disabled={syncing || !isOnline}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 999999,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: syncing ? '12px 20px' : '14px 22px',
          borderRadius: 50,
          border: 'none',
          cursor: syncing || !isOnline ? 'not-allowed' : 'pointer',
          fontWeight: 800,
          fontSize: 15,
          color: 'white',
          background: !isOnline
            ? 'linear-gradient(135deg,#f59e0b,#d97706)'
            : syncing
              ? 'linear-gradient(135deg,#6366f1,#4f46e5)'
              : pending > 0
                ? 'linear-gradient(135deg,#ef4444,#dc2626)'
                : 'linear-gradient(135deg,#10b981,#059669)',
          boxShadow: '0 6px 24px rgba(0,0,0,0.3)',
          transition: 'all 0.3s ease',
          animation: pending > 0 && !syncing ? 'syncPulse 2s infinite' : 'none',
        }}
        title={!isOnline ? 'Offline — Internet නැත' : `${pending} items sync කිරීමට ඇත`}
      >
        {syncing ? (
          <span style={{
            width: 18, height: 18,
            border: '3px solid rgba(255,255,255,0.3)',
            borderTopColor: 'white',
            borderRadius: '50%',
            animation: 'syncSpin 0.8s linear infinite',
            display: 'inline-block',
          }} />
        ) : !isOnline ? (
          <span style={{ fontSize: 18 }}>📡</span>
        ) : (
          <span style={{ fontSize: 18 }}>🔄</span>
        )}

        <span>
          {syncing
            ? status || 'Sync...'
            : !isOnline
              ? 'Offline'
              : pending > 0
                ? `Sync (${pending})`
                : 'Synced ✓'
          }
        </span>

        {pending > 0 && !syncing && isOnline && (
          <span style={{
            background: 'white',
            color: '#dc2626',
            borderRadius: '50%',
            width: 24, height: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 900,
          }}>
            {pending > 99 ? '99+' : pending}
          </span>
        )}
      </button>

      {showResult && result && (
        <div style={{
          position: 'fixed',
          bottom: 90,
          right: 24,
          zIndex: 999999,
          background: result.failed === 0 ? '#10b981' : '#f59e0b',
          color: 'white',
          padding: '12px 20px',
          borderRadius: 12,
          fontWeight: 700,
          fontSize: 14,
          boxShadow: '0 6px 20px rgba(0,0,0,0.2)',
          animation: 'syncSlideUp 0.3s ease',
        }}>
          {result.failed === 0
            ? `✅ ${result.success} items sync විය!`
            : `⚠️ ${result.success} sync, ${result.failed} failed`
          }
        </div>
      )}

      <style>{`
        @keyframes syncSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes syncPulse {
          0%, 100% { box-shadow: 0 6px 24px rgba(239,68,68,0.3); }
          50% { box-shadow: 0 6px 32px rgba(239,68,68,0.6); }
        }
        @keyframes syncSlideUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}