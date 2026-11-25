// C:\Users\chandana\StudioProjects\weerakkodi_pos_app\app\(protected)\items\page.js
'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUserAuth } from '@/context/UserContext';
import { useLang } from '@/hooks/useLang';
import { db } from '@/lib/firebase';
import {
  collection, query, where,
  onSnapshot, deleteDoc, doc,
} from 'firebase/firestore';

// ★ OFFLINE IMPORTS
import {
  saveItemsBulkLocal, getItemsLocal, deleteItemLocal,
  addToSyncQueue, getSyncQueue,
  cacheRefData,
} from '@/lib/offlineDB';
import { localDb, ensureDbOpen } from '@/lib/localDb';
import { processSyncQueue } from '@/lib/syncManager';

import { getSafeImageUrl, DEFAULT_IMG as HELPER_DEFAULT_IMG, deleteImageFromStorage }
  from '@/helpers/imageHelpers';

// ✅ Offline-Safe Default Image Fallback (Infinite Loop වැළැක්වීමට)
const DEFAULT_IMG = HELPER_DEFAULT_IMG || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='18' height='18' x='3' y='3' rx='2' ry='2'/%3E%3Ccircle cx='9' cy='9' r='2'/%3E%3Cpath d='m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'/%3E%3C/svg%3E";

export default function ItemsPage() {
  const { user } = useUserAuth();
  const router   = useRouter();
  const { lang } = useLang();

  const [items, setItems]             = useState([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // ★ OFFLINE: Online/Offline state + sync status
  const [online, setOnline]           = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [syncCount, setSyncCount]     = useState(0);
  const [syncing, setSyncing]         = useState(false);
  const [syncMsg, setSyncMsg]         = useState('');
  const isCachingRef                  = useRef(false);

  // ★ OFFLINE: Track online/offline events
  useEffect(() => {
    const goOnline  = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // ★ OFFLINE: Update sync queue count
  const refreshSyncCount = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const q = await getSyncQueue(user.uid);
      setSyncCount(q?.length || 0);
    } catch {}
  }, [user?.uid]);

  useEffect(() => {
    refreshSyncCount();
  }, [refreshSyncCount]);

  // ★ OFFLINE: Auto-sync when coming back online
  useEffect(() => {
    if (!online || !user?.uid || syncing) return;
    if (syncCount === 0) return;

    const doSync = async () => {
      setSyncing(true);
      setSyncMsg('🔄 Syncing...');
      try {
        await processSyncQueue(user.uid, ({ total, done, status }) => {
          if (status === 'done') {
            setSyncMsg(`✅ Synced ${done}/${total}`);
            setTimeout(() => setSyncMsg(''), 3000);
          } else {
            setSyncMsg(`🔄 ${done}/${total}`);
          }
        });
        await refreshSyncCount();
      } catch (e) {
        setSyncMsg('❌ Sync error');
        setTimeout(() => setSyncMsg(''), 3000);
      } finally {
        setSyncing(false);
      }
    };
    doSync();
  }, [online, user?.uid, syncCount, syncing, refreshSyncCount]);

  // ★ OFFLINE: Load from local Hard Disk cache (Dexie WeerakkodiPOS_DB & offlineDB)
  const loadFromCache = useCallback(async () => {
    if (!user?.uid) return;
    try {
      let cached = [];

      // 1. Try Dexie WeerakkodiPOS_DB
      try {
        await ensureDbOpen();
        if (localDb.isOpen() && localDb.items) {
          cached = await localDb.items.where('uid').equals(user.uid).toArray();
        }
      } catch (e) {
        console.warn('[ItemsPage] Dexie load warning:', e?.message);
      }

      // 2. Fallback to offlineDB
      if (!cached || cached.length === 0) {
        cached = await getItemsLocal(user.uid);
      }

      if (cached && cached.length > 0) {
        setItems(cached);
      }
    } catch (e) {
      console.error('Cache load error:', e);
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid]);

  // Main data loading effect
  useEffect(() => {
    if (!user?.uid) return;

    // Offline නම් Local Cache එකෙන් පමණක් Load කරයි
    if (!online || !db) {
      loadFromCache();
      return;
    }

    let unsub = () => {};
    try {
      const q = query(
        collection(db, 'items'),
        where('uid', '==', user.uid)
      );

      unsub = onSnapshot(q, async (snap) => {
        const firestoreItems = snap.docs.map((d) => ({
          id: d.id,
          localId: d.id,
          firestoreId: d.id,
          uid: user.uid,
          _offlineSaved: true,
          ...d.data(),
        }));

        setItems(firestoreItems);
        setIsLoading(false);

        // ✅ SAFE BULK CACHE TO HARD DISK (භාණ්ඩ 1542 ම තනි Transaction එකකින් ලියයි - No LevelDB Freeze)
        if (!isCachingRef.current && firestoreItems.length > 0) {
          isCachingRef.current = true;
          (async () => {
            try {
              // 1. Dexie WeerakkodiPOS_DB Bulk Put
              await ensureDbOpen();
              if (localDb.isOpen() && localDb.items) {
                await localDb.items.bulkPut(firestoreItems);
              }

              // 2. offlineDB Single-Transaction Bulk Save
              if (typeof saveItemsBulkLocal === 'function') {
                await saveItemsBulkLocal(firestoreItems, user.uid);
              }
              await cacheRefData(user.uid, 'items', firestoreItems);
            } catch (e) {
              console.warn('[ItemsPage] Safe bulk cache notice:', e?.message);
            } finally {
              isCachingRef.current = false;
            }
          })();
        }
      }, (error) => {
        console.warn('Firestore snapshot / Quota exceeded, falling back to PC disk:', error?.message);
        loadFromCache();
      });
    } catch (err) {
      console.warn('Firestore query error:', err?.message);
      loadFromCache();
    }

    return () => {
      try { unsub(); } catch (e) {}
    };
  }, [user?.uid, online, loadFromCache]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const terms = searchQuery.trim().toLowerCase().split(/\s+/);
    return items.filter((item) => {
      const str = [
        item.name, item.sinhalaName, item.itemCode,
        item.barcode, item.brandName, item.categoryName,
      ].map((v) => (v || '').toLowerCase()).join(' ');
      return terms.every((t) => str.includes(t));
    });
  }, [items, searchQuery]);

  // 📊 Calculate Total Items and Stock Totals
  const summaryStats = useMemo(() => {
    const totalTypes = items.length;
    const totalStock = items.reduce((sum, item) => sum + (parseFloat(item.currentStock ?? item.stock ?? item.quantity ?? 0) || 0), 0);
    const filteredTypes = filtered.length;
    const filteredStock = filtered.reduce((sum, item) => sum + (parseFloat(item.currentStock ?? item.stock ?? item.quantity ?? 0) || 0), 0);

    return { totalTypes, totalStock, filteredTypes, filteredStock };
  }, [items, filtered]);

  // ★ OFFLINE: Delete with offline support
  const handleDelete = async (item) => {
    if (!confirm('මකා දැමීම තහවුරු කරන්න?')) return;
    try {
      const itemId = item.id || item.localId || item.firestoreId;
      if (online && db && !String(itemId).startsWith('local_')) {
        const paths = Array.isArray(item.imagePaths) ? item.imagePaths : [];
        await Promise.all(paths.map((p) => deleteImageFromStorage(p))).catch(() => {});
        await deleteDoc(doc(db, 'items', itemId)).catch(() => {});
      } else {
        await addToSyncQueue(user.uid, 'delete', 'items', {}, item.firestoreId || itemId);
      }
      
      await deleteItemLocal(itemId);
      try {
        await ensureDbOpen();
        if (localDb.isOpen() && localDb.items) {
          await localDb.items.delete(itemId);
        }
      } catch (_) {}

      setItems((prev) => prev.filter((i) => (i.localId || i.id) !== itemId));
      await refreshSyncCount();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  // ★ OFFLINE: Manual sync trigger
  const handleManualSync = async () => {
    if (!user?.uid || syncing) return;
    setSyncing(true);
    setSyncMsg('🔄 Syncing...');
    try {
      await processSyncQueue(user.uid, ({ total, done, status }) => {
        if (status === 'done') {
          setSyncMsg(`✅ Synced ${done}/${total}`);
          setTimeout(() => setSyncMsg(''), 3000);
        } else {
          setSyncMsg(`🔄 ${done}/${total}`);
        }
      });
      await refreshSyncCount();
    } catch {
      setSyncMsg('❌ Sync error');
      setTimeout(() => setSyncMsg(''), 3000);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white p-4 shadow-sm sticky top-0 z-10 border-b">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold flex items-center gap-2">
              📦 භාණ්ඩ ලියාපදිංචිය
            </h1>
            <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full border border-blue-200">
              මුළු භාණ්ඩ: {summaryStats.totalTypes}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* ★ OFFLINE: Sync button */}
            {syncCount > 0 && (
              <button
                onClick={handleManualSync}
                disabled={syncing || !online}
                className="bg-orange-500 text-white px-3 py-2 rounded-lg
                           font-bold text-sm hover:bg-orange-600
                           disabled:opacity-50 flex items-center gap-1"
              >
                {syncing ? '⏳' : '🔄'} {syncCount}
              </button>
            )}
            <button
              onClick={() => router.push('/items/add')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg
                         font-bold hover:bg-blue-700 shadow-sm"
            >
              ➕ නව+
            </button>
          </div>
        </div>

        <input
          className="w-full p-3 border-2 rounded-xl focus:border-blue-400 outline-none"
          placeholder="🔍 සොයන්න (නම, කේතය, බාර්කෝඩ්, සන්නාමය...)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        {/* 📊 SUMMARY COUNTER BAR */}
        <div className="mt-2.5 flex flex-wrap justify-between items-center text-xs font-bold bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-gray-700">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              📦 මුළු භාණ්ඩ වර්ග: <strong className="text-blue-700 text-sm">{summaryStats.totalTypes}</strong>
            </span>
            <span className="flex items-center gap-1 border-l pl-3 border-gray-300">
              📊 මුළු තොග ප්‍රමාණය: <strong className="text-emerald-700 text-sm">{summaryStats.totalStock}</strong>
            </span>
          </div>

          {searchQuery.trim() !== '' && (
            <div className="text-amber-800 bg-amber-50 px-2.5 py-1 rounded border border-amber-200 flex items-center gap-2">
              <span>🔍 සෙවූ ප්‍රතිඵල: <strong>{summaryStats.filteredTypes}</strong></span>
              <span>(තොගය: <strong>{summaryStats.filteredStock}</strong>)</span>
            </div>
          )}
        </div>

        {/* ★ OFFLINE: Status banners */}
        {!online && (
          <div className="mt-2 p-2 bg-orange-100 border border-orange-300 rounded-lg text-orange-800 text-sm font-bold flex items-center gap-2">
            <span>📡</span>
            <span>Offline Mode — 💾 Local දත්ත පෙන්වයි</span>
            {syncCount > 0 && (
              <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full ml-auto">
                ⏳ {syncCount} pending
              </span>
            )}
          </div>
        )}
        {syncMsg && (
          <div className="mt-2 p-2 bg-blue-100 border border-blue-300 rounded-lg text-blue-800 text-sm font-bold flex items-center gap-2">
            <span>{syncMsg}</span>
          </div>
        )}
      </div>

      <div className="p-4 space-y-3">
        {isLoading ? (
          <div className="text-center py-10 text-gray-500">
            දත්ත ලබා ගනිමින්...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            භාණ්ඩ නොමැත
          </div>
        ) : filtered.map((item) => {
          const price    = parseFloat(item.sellingPriceRetail || item.sellingPrice || 0);
          const stock    = parseFloat(item.currentStock ?? item.stock ?? item.quantity ?? 0);
          const img      = getSafeImageUrl ? getSafeImageUrl(item) : (item.imageUrl || item.image || DEFAULT_IMG);
          const imgCount = item.images?.length || (item.picture ? 1 : 0);
          const isLocal  = item._offlineSaved || String(item.id || '').startsWith('local_');
          const itemId   = item.firestoreId || item.id || item.localId;

          return (
            <div
              key={item.localId || item.id}
              className={`bg-white p-4 rounded-xl shadow-sm flex gap-4 border hover:shadow-md transition-shadow ${isLocal ? 'border-orange-300 bg-orange-50/30' : ''}`}
            >
              <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden border shrink-0 relative">
                <img
                  src={img}
                  loading="lazy"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // 404 infinite network loop වැළැක්වීම
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = DEFAULT_IMG;
                  }}
                  alt={item.name || 'Item'}
                />
                {imgCount > 1 && (
                  <div className="absolute bottom-0 right-0 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded-tl-lg font-bold">
                    +{imgCount - 1}
                  </div>
                )}
                {/* ★ OFFLINE: Local indicator */}
                {isLocal && (
                  <div className="absolute top-0 left-0 bg-orange-500 text-white text-[8px] px-1 py-0.5 rounded-br-lg font-bold">
                    💾
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-bold truncate text-gray-900 text-base">
                  {item.name}
                </h3>
                {item.sinhalaName && (
                  <div className="text-xs text-gray-500">
                    {item.sinhalaName}
                  </div>
                )}
                <div className="text-xs text-gray-400 mt-0.5">
                  {item.itemCode}
                  {item.barcode && ` • ${item.barcode}`}
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {item.isHidden && (
                    <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">
                      🚫 Hidden
                    </span>
                  )}
                  {item.warrantyPeriod && (
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">
                      🛡️ {item.warrantyPeriod}
                    </span>
                  )}
                  {/* ★ OFFLINE: Pending sync badge */}
                  {isLocal && (
                    <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-bold">
                      ⏳ Sync Pending
                    </span>
                  )}
                </div>
                <div className="mt-1.5 font-bold text-green-700">
                  Rs. {price.toFixed(2)}
                </div>
                <div className="text-xs font-bold text-gray-600 mt-0.5">
                  තොග: <span className="text-emerald-700">{stock}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 justify-center">
                {/* ✅ Static Export & Electron Safe Edit Route */}
                <button
                  onClick={() => router.push(`/items/edit?id=${itemId}`)}
                  className="bg-blue-100 text-blue-700 px-3 py-2 rounded text-sm font-bold hover:bg-blue-200"
                  title="Edit Item"
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleDelete(item)}
                  className="bg-red-100 text-red-700 px-3 py-2 rounded text-sm font-bold hover:bg-red-200"
                  title="Delete Item"
                >
                  🗑️
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}