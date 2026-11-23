'use client';

import React, { useEffect, useState, Suspense, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useUserAuth } from '@/context/UserContext';
import { startAutoSync, forceSyncAndBackup, purgeOtherUsers } from '@/lib/syncService';
import localDb, { ensureDbOpen } from '@/lib/localDb'; // 👈 Fixed Default Import

// POSInvoice Component එක Dynamic ලෙස SSR නැතිව Load කිරීම (Electron / Next.js Hydration Mismatch වැළැක්වීමට)
const POSInvoice = dynamic(() => import('@/components/POSInvoice'), {
  ssr: false,
  loading: () => (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh',
      background: 'linear-gradient(135deg,#0f172a,#1e293b)',
      color: '#f1f5f9', fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        width: 54, height: 54, border: '4px solid #334155',
        borderTop: '4px solid #3b82f6', borderRadius: '50%',
        animation: 'spin 1s linear infinite', marginBottom: 18,
      }} />
      <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>POS පද්ධතිය සූදානම් වෙමින්...</h2>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  ),
});

export default function POSPage() {
  const router = useRouter();

  // Safe Auth Hook Invocation (Offline / Context Guard)
  let authUser = null;
  let authLoading = false;
  try {
    const authCtx = useUserAuth();
    authUser = authCtx?.user;
    authLoading = !!authCtx?.loading;
  } catch {
    authLoading = false;
  }

  // Offline / Desktop Local User Fallback
  const user = authUser || { uid: 'pos_local_user', email: 'admin@pos.local' };
  const loading = authLoading;

  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [syncing, setSyncing] = useState(false);
  const [dataPurged, setDataPurged] = useState(false);
  const prevUidRef = useRef(null);

  // 1. Online / Offline සජීවීව පරීක්ෂා කිරීම
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

  // 2. CRITICAL: POS එක පෙන්වීමට පෙර පෙර පරිශීලකයාගේ Local Data ආරක්ෂිතව Purge කිරීම
  useEffect(() => {
    if (loading || !user?.uid) {
      setDataPurged(false);
      return;
    }

    const uid = user.uid;

    if (prevUidRef.current && prevUidRef.current !== uid) {
      setDataPurged(false);
    }
    prevUidRef.current = uid;

    if (dataPurged) return;

    let isSubscribed = true;

    const prepare = async () => {
      try {
        await ensureDbOpen();
        await purgeOtherUsers(uid);

        if (localDb && localDb.items) {
          const orphans = await localDb.items.filter((r) => !r.uid).count().catch(() => 0);
          if (orphans > 0) {
            await localDb.items.filter((r) => !r.uid).delete().catch(() => {});
          }
        }
      } catch (err) {
        console.warn("දත්ත පිරිසිදු කිරීමේ සටහන:", err);
      } finally {
        if (isSubscribed) {
          setDataPurged(true);
        }
      }
    };

    prepare();

    return () => {
      isSubscribed = false;
    };
  }, [user?.uid, loading, dataPurged]);

  // 3. Purge එක සාර්ථක වූ පසු පමණක් Auto-Sync සක්‍රීය කිරීම
  useEffect(() => {
    if (!user?.uid || !dataPurged) return;
    let cleanup;
    try {
      cleanup = startAutoSync();
    } catch (err) {
      console.warn("Auto-sync ආරම්භ කිරීමේ සටහන:", err);
    }
    return () => {
      if (typeof cleanup === 'function') {
        try { cleanup(); } catch {}
      }
    };
  }, [user?.uid, dataPurged]);

  // 4. Manual Sync බොත්තම ක්‍රියා කරවීම
  const handleManualSync = async () => {
    if (syncing || !user?.uid) return;
    setSyncing(true);
    try {
      await forceSyncAndBackup();
    } catch (err) {
      console.error("Manual sync දෝෂය:", err);
    } finally {
      setSyncing(false);
    }
  };

  // Loading Screen
  if (loading || !dataPurged) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '100vh', background: '#090d16', color: '#f8fafc',
      }}>
        <div style={{
          width: 44, height: 44, border: '4px solid #1e293b',
          borderTop: '4px solid #3b82f6', borderRadius: '50%',
          animation: 'spin 1s linear infinite', marginBottom: 16,
        }} />
        <p style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>
          {loading ? 'අවසර තහවුරු වෙමින්...' : '🔒 දත්ත ආරක්ෂාව සකසමින්...'}
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <>
      {/* Sync / Online Status Indicator */}
      <div className="no-print" style={{
        position: 'fixed', top: 10, right: 12, zIndex: 9998,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <div style={{
          padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800,
          background: isOnline ? 'linear-gradient(135deg,#16a34a,#15803d)' : 'linear-gradient(135deg,#d97706,#b45309)',
          color: 'white', display: 'flex', alignItems: 'center', gap: 6,
          boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'white', animation: 'pulse 1.8s infinite', display: 'inline-block' }} />
          <span>{isOnline ? 'Online • Cloud Sync' : 'Offline • Disk Backup'}</span>
          <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.35;transform:scale(.85)} }`}</style>
        </div>
        {isOnline && (
          <button onClick={handleManualSync} disabled={syncing} style={{
            background: '#1e293b', border: '1px solid #334155', color: '#94a3b8',
            padding: '5px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}>
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