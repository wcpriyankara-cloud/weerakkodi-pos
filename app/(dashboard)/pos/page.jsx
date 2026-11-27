// app/(dashboard)/pos/page.jsx
"use client";

import React, { useState, useEffect, useRef, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useUserAuth } from '@/context/UserContext';
import { startAutoSync, forceSyncAndBackup, purgeOtherUsers } from '@/lib/syncService';
import localDb, { ensureDbOpen } from '@/lib/localDb';

// POSInvoice Component එක Dynamic ලෙස SSR රහිතව Load කෙරේ
const POSInvoice = dynamic(() => import('@/components/POSInvoice'), {
  ssr: false,
  loading: () => (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg,#0f172a,#1e293b)',
      color: '#f1f5f9',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{
        width: 54,
        height: 54,
        border: '4px solid #334155',
        borderTop: '4px solid #3b82f6',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        marginBottom: 18
      }} />
      <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>POS පද්ධතිය සූදානම් වෙමින්...</h2>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
});

export default function POSPage() {
  const router = useRouter();

  let authUser = null;
  let authLoading = false;
  try {
    const authCtx = useUserAuth();
    authUser = authCtx?.user;
    authLoading = !!authCtx?.loading;
  } catch {
    authLoading = false;
  }

  const user = authUser || { uid: 'pos_local_user', email: 'admin@pos.local' };
  const loading = authLoading;

  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [syncing, setSyncing] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const prevUidRef = useRef(null);

  // 1. Online / Offline හඳුනාගැනීම
  useEffect(() => {
    const go = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', go);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', go);
      window.removeEventListener('offline', off);
    };
  }, []);

  // 2. 🛡️ Data Protection & Legacy Item Adoption (කිසිදු දත්තයක් Delete නොකරයි)
  useEffect(() => {
    if (loading || !user?.uid) {
      setDataReady(false);
      return;
    }

    const uid = user.uid;
    if (prevUidRef.current && prevUidRef.current !== uid) {
      setDataReady(false);
    }
    prevUidRef.current = uid;

    if (dataReady) return;

    let isSubscribed = true;

    const prepare = async () => {
      try {
        await ensureDbOpen();
        // Safe adoption pass
        await purgeOtherUsers(uid);

        // පැරණි unassigned items Delete නොකර වත්මන් UID එකට adopt කරයි
        if (localDb && localDb.items) {
          const orphans = await localDb.items.filter((r) => !r.uid || r.uid === 'pos_local_user').toArray().catch(() => []);
          if (orphans.length > 0) {
            const adopted = orphans.map(item => ({ ...item, uid }));
            await localDb.items.bulkPut(adopted).catch(() => {});
            console.log(`[POS] ✅ Preserved & adopted ${adopted.length} items to ${uid.slice(0, 8)}`);
          }
        }
      } catch (err) {
        console.warn("දත්ත සූදානම් කිරීමේ සටහන:", err);
      } finally {
        if (isSubscribed) {
          setDataReady(true);
        }
      }
    };

    prepare();

    return () => {
      isSubscribed = false;
    };
  }, [user?.uid, loading, dataReady]);

  // 3. Auto-Sync ක්‍රියාත්මක කිරීම
  useEffect(() => {
    if (!user?.uid || !dataReady) return;
    let cleanup;
    try {
      cleanup = startAutoSync(user.uid);
    } catch (err) {
      console.warn("Auto-sync ආරම්භ කිරීමේ සටහන:", err);
    }
    return () => {
      if (typeof cleanup === 'function') {
        try { cleanup(); } catch {}
      }
    };
  }, [user?.uid, dataReady]);

  // 4. Manual Sync
  const handleManualSync = async () => {
    if (syncing || !user?.uid) return;
    setSyncing(true);
    try {
      await forceSyncAndBackup(user.uid);
    } catch (err) {
      console.error("Manual sync දෝෂය:", err);
    } finally {
      setSyncing(false);
    }
  };

  // Loading Screen
  if (loading || !dataReady) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#090d16',
        color: '#f8fafc'
      }}>
        <div style={{
          width: 44,
          height: 44,
          border: '4px solid #1e293b',
          borderTop: '4px solid #3b82f6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: 16
        }} />
        <p style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>
          {loading ? 'අවසර තහවුරු වෙමින්...' : '⚡ POS දත්ත සූදානම් වෙමින්...'}
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <>
      {/* Sync / Online Status Indicator */}
      <div className="no-print" style={{
        position: 'fixed',
        top: 10,
        right: 12,
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }}>
        <div style={{
          padding: '5px 12px',
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 800,
          background: isOnline ? 'linear-gradient(135deg,#16a34a,#15803d)' : 'linear-gradient(135deg,#d97706,#b45309)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
        }}>
          <span style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'white',
            animation: 'pulse 1.8s infinite',
            display: 'inline-block'
          }} />
          <span>{isOnline ? 'Online • Cloud Sync' : 'Offline • Disk Backup'}</span>
          <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.35;transform:scale(.85)} }`}</style>
        </div>

        {isOnline && (
          <button
            onClick={handleManualSync}
            disabled={syncing}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              color: '#94a3b8',
              padding: '5px 10px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            {syncing ? '⏳ Sync...' : '🔄 Sync'}
          </button>
        )}
      </div>

      <Suspense fallback={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#090d16', color: '#f8fafc' }}>
          <p>POS පූරණය වෙමින්...</p>
        </div>
      }>
        <POSInvoice key={user.uid} user={user} lang="si" />
      </Suspense>
    </>
  );
}