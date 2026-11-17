'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { localDb } from '@/lib/localDb';

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

  // STRATEGY 1: Direct import from firebaseConfig (most reliable)
  try {
    const fb = require('@/firebaseConfig');
    // Try named export first, then default
    const candidate = fb.db || fb.default;
    if (candidate) {
      db = candidate;
      console.log('[SyncButton] ✅ db loaded from @/firebaseConfig');
    }
  } catch (e) {
    console.warn('[SyncButton] @/firebaseConfig failed:', e.message);
  }

  // STRATEGY 2: Get Firestore from existing Firebase app
  if (!db) {
    try {
      const apps = firebaseApp.getApps();
      if (apps.length > 0) {
        db = firestore.getFirestore(apps[0]);
        console.log('[SyncButton] ✅ db from getFirestore(apps[0])');
      }
    } catch (e) {
      console.warn('[SyncButton] getFirestore fallback failed:', e.message);
    }
  }

  // Validation: Test if db actually works by trying to create a collection reference
  if (db) {
    try {
      const testRef = firestore.collection(db, '_test_validation_');
      if (testRef) {
        console.log('[SyncButton] ✅ Firestore instance VALIDATED');
      }
    } catch (validationError) {
      console.error('[SyncButton] ❌ db failed validation:', validationError.message);
      console.error('[SyncButton] db inspection:', {
        type: typeof db,
        constructor: db?.constructor?.name,
        hasApp: !!db?.app,
        keys: db ? Object.keys(db).slice(0, 15) : [],
      });
      db = null;
    }
  }

  if (!db) {
    console.error('[SyncButton] ❌ FATAL: No valid Firestore instance');
  }
} catch (e) {
  console.error('[SyncButton] Firebase import error:', e);
}
/* ══════════════════════════════════════════
   VALIDATE DB
══════════════════════════════════════════ */
function isValidDb() {
  return db !== null;
}

/* ══════════════════════════════════════════
   COUNT PENDING (Unsynced) RECORDS
══════════════════════════════════════════ */
async function countPending(uid) {
  if (!uid) return 0;
  let count = 0;
  try {
    try {
      const custs = await localDb.customers.where('uid').equals(uid).and(c => c.synced === false).toArray();
      count += custs.length;
    } catch {
      const all = await localDb.customers.toArray();
      count += all.filter(c => c.uid === uid && c.synced === false).length;
    }

    try {
      const txns = await localDb.customerTransactions.toArray();
      count += txns.filter(t => t.uid === uid && t.id?.startsWith('ctxn_')).length;
    } catch {}

    try {
      const invs = await localDb.invoices.where('uid').equals(uid).and(i => i.synced === false).toArray();
      count += invs.length;
    } catch {
      try {
        const all = await localDb.invoices.toArray();
        count += all.filter(i => i.uid === uid && i.synced === false).length;
      } catch {}
    }

    try {
      const cash = await localDb.cashTransactions.toArray();
      count += cash.filter(c => c.uid === uid && c.id?.startsWith('cash_')).length;
    } catch {}
  } catch (e) {
    console.warn('[Sync] countPending error:', e.message);
  }
  return count;
}

/* ══════════════════════════════════════════
   SYNC ALL PENDING DATA TO FIRESTORE
══════════════════════════════════════════ */
async function syncAllPending(uid, onProgress) {
  if (!uid || !navigator.onLine || !isValidDb()) return { success: 0, failed: 0, total: 0 };

  let success = 0;
  let failed = 0;
  let total = 0;

  const report = (msg) => {
    if (onProgress) onProgress(msg);
    console.log(`[Sync] ${msg}`);
  };

  try {
    // ── 1. NEW CUSTOMERS ──
    let newCustomers = [];
    try {
      newCustomers = await localDb.customers.where('uid').equals(uid).and(c => c.synced === false).toArray();
    } catch {
      const all = await localDb.customers.toArray();
      newCustomers = all.filter(c => c.uid === uid && c.synced === false);
    }

    for (const cust of newCustomers) {
      total++;
      report(`Customer: ${cust.name}`);
      try {
        await setDoc(doc(db, 'customers', cust.id), {
          ...cust, synced: true,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
        await localDb.customers.update(cust.id, { synced: true });
        success++;
      } catch (e) {
        report(`❌ ${cust.name}: ${e.message}`);
        failed++;
      }
    }

    // ── 2. CUSTOMER BALANCES ──
    let allCustomers = [];
    try {
      allCustomers = await localDb.customers.where('uid').equals(uid).toArray();
    } catch {
      const all = await localDb.customers.toArray();
      allCustomers = all.filter(c => c.uid === uid);
    }

    if (allCustomers.length > 0 && getDocs && query && where && collection) {
      try {
        const cloudSnap = await getDocs(query(collection(db, 'customers'), where('uid', '==', uid)));
        const cloudMap = new Map(cloudSnap.docs.map(d => [d.id, d.data()]));

        for (const local of allCustomers) {
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
      const offlineTxns = txns.filter(t => t.uid === uid && t.id?.startsWith('ctxn_'));
      for (const tx of offlineTxns) {
        total++;
        report(`Txn: ${tx.type} Rs.${tx.amount}`);
        try {
          await setDoc(doc(db, 'customerTransactions', tx.id), {
            ...tx, createdAt: serverTimestamp()
          });
          success++;
        } catch { failed++; }
      }
    } catch {}

    // ── 4. INVOICES ──
    let unsyncedInvoices = [];
    try {
      unsyncedInvoices = await localDb.invoices.where('uid').equals(uid).and(i => i.synced === false).toArray();
    } catch {
      try {
        const all = await localDb.invoices.toArray();
        unsyncedInvoices = all.filter(i => i.uid === uid && i.synced === false);
      } catch {}
    }

    for (const inv of unsyncedInvoices) {
      total++;
      report(`Invoice: ${inv.invoiceNo || inv.id}`);
      try {
        await setDoc(doc(db, 'invoices', inv.id), {
          ...inv, synced: true,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
        await localDb.invoices.update(inv.id, { synced: true });
        success++;
      } catch { failed++; }
    }

    // ── 5. CASH TRANSACTIONS ──
    try {
      const cash = await localDb.cashTransactions.toArray();
      const offlineCash = cash.filter(c => c.uid === uid && c.id?.startsWith('cash_'));
      for (const c of offlineCash) {
        total++;
        report(`Cash: ${c.type} Rs.${c.amount}`);
        try {
          await setDoc(doc(db, `users/${uid}/cashTransactions`, c.id), {
            ...c, createdAt: serverTimestamp()
          });
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
   SYNC BUTTON COMPONENT
══════════════════════════════════════════ */
export default function SyncButton({ uid }) {
  // ✅ FIX: Start with mounted=false to prevent hydration mismatch
  const [mounted, setMounted] = useState(false);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState(null);
  const [isOnline, setIsOnline] = useState(true); // ✅ Safe default
  const intervalRef = useRef(null);

  // ✅ Mark as mounted — only renders on client
  useEffect(() => {
    setMounted(true);
    if (typeof navigator !== 'undefined') {
      setIsOnline(navigator.onLine);
    }
  }, []);

  const refreshCount = useCallback(async () => {
    if (!uid) return;
    try {
      const c = await countPending(uid);
      setPending(c);
    } catch (e) {
      console.warn('[Sync] Count error:', e.message);
    }
  }, [uid]);

  useEffect(() => {
    if (!mounted || !uid) return;
    refreshCount();
    intervalRef.current = setInterval(refreshCount, 10000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [mounted, uid, refreshCount]);

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
    if (syncing || !isOnline || !uid) return;
    setSyncing(true);
    setShowResult(false);
    setStatus('ආරම්භ කරමින්...');

    const res = await syncAllPending(uid, (msg) => setStatus(msg));

    setResult(res);
    setShowResult(true);
    setSyncing(false);
    setStatus('');
    refreshCount();

    setTimeout(() => setShowResult(false), 5000);
  };

    // ✅ CRITICAL: Don't render anything server-side OR until mounted
  if (!mounted) return null;

  // ✅ DEBUG: Log render state
  console.log('[SyncButton] Render:', { uid, pending, isOnline, dbReady: !!db });

  return (
    <>
      <button
        onClick={handleSync}
        disabled={syncing || !isOnline}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 9998,
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
          boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
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
          {!uid
            ? '🔑 No User'
            : syncing
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
          zIndex: 9999,
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