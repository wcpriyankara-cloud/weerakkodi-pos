'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
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
  saveItemLocal, getItemsLocal, deleteItemLocal,
  addToSyncQueue, getSyncQueue,
  cacheRefData, getCachedRefData,
} from '@/lib/offlineDB';
import { processSyncQueue, isOnline } from '@/lib/syncManager';

import { getSafeImageUrl, DEFAULT_IMG, deleteImageFromStorage }
  from '@/helpers/imageHelpers';

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
      setSyncCount(q.length);
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

  // ★ OFFLINE: Load from cache when offline
  const loadFromCache = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const cached = await getItemsLocal(user.uid);
      if (cached.length > 0) {
        setItems(cached);
        setIsLoading(false);
      }
    } catch (e) {
      console.error('Cache load error:', e);
    }
  }, [user?.uid]);

  // Main data loading effect
  useEffect(() => {
    if (!user?.uid) return;

    // ★ OFFLINE: If offline, load from cache only
    if (!online) {
      loadFromCache();
      return;
    }

    const q = query(
      collection(db, 'items'),
      where('uid', '==', user.uid)
    );
    const unsub = onSnapshot(q, async (snap) => {
      const firestoreItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setItems(firestoreItems);
      setIsLoading(false);

      // ★ OFFLINE: Cache to IndexedDB for offline use
      try {
        for (const item of firestoreItems) {
          await saveItemLocal(user.uid, item, item.id);
        }
        await cacheRefData(user.uid, 'items', firestoreItems);
      } catch (e) {
        console.error('Cache save error:', e);
      }
    }, (error) => {
      // ★ OFFLINE: If Firestore fails (network), fall back to cache
      console.warn('Firestore error, loading cache:', error);
      loadFromCache();
    });

    return () => unsub();
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

  // ★ OFFLINE: Delete with offline support
  const handleDelete = async (item) => {
    if (!confirm('මකා දැමීම තහවුරු කරන්න?')) return;
    try {
      if (online && !item.id?.startsWith('local_')) {
        // Online: Delete from Firestore + Storage (original behavior)
        const paths = Array.isArray(item.imagePaths) ? item.imagePaths : [];
        await Promise.all(paths.map((p) => deleteImageFromStorage(p)));
        await deleteDoc(doc(db, 'items', item.id));
      } else {
        // ★ OFFLINE: Queue delete + remove from local cache
        await addToSyncQueue(user.uid, 'delete', 'items', {}, item.firestoreId || item.id);
        await deleteItemLocal(item.localId || item.id);
        // Remove from UI immediately
        setItems(prev => prev.filter(i =>
          (i.localId || i.id) !== (item.localId || item.id)
        ));
      }
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
          <h1 className="text-xl font-bold">📦 භාණ්ඩ ලියාපදිංචිය</h1>
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
                         font-bold hover:bg-blue-700"
            >
              ➕ නව+
            </button>
          </div>
        </div>
        <input
          className="w-full p-3 border-2 rounded-xl
                     focus:border-blue-400 outline-none"
          placeholder="🔍 සොයන්න..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        {/* ★ OFFLINE: Status banners */}
        {!online && (
          <div className="mt-2 p-2 bg-orange-100 border border-orange-300
                          rounded-lg text-orange-800 text-sm font-bold
                          flex items-center gap-2">
            <span>📡</span>
            <span>Offline Mode — 💾 Local දත්ත පෙන්වයි</span>
            {syncCount > 0 && (
              <span className="bg-orange-500 text-white text-xs px-2 py-0.5
                               rounded-full ml-auto">
                ⏳ {syncCount} pending
              </span>
            )}
          </div>
        )}
        {syncMsg && (
          <div className="mt-2 p-2 bg-blue-100 border border-blue-300
                          rounded-lg text-blue-800 text-sm font-bold
                          flex items-center gap-2">
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
          const price    = parseFloat(item.sellingPriceRetail || 0);
          const stock    = parseFloat(item.stock || 0);
          const img      = getSafeImageUrl(item);
          const imgCount = item.images?.length || (item.picture ? 1 : 0);
          // ★ OFFLINE: Check if this is a local-only item
          const isLocal  = item._offlineSaved || item.id?.startsWith('local_');

          return (
            <div
              key={item.localId || item.id}
              className={`bg-white p-4 rounded-xl shadow-sm flex gap-4
                         border hover:shadow-md transition-shadow
                         ${isLocal ? 'border-orange-300 bg-orange-50/30' : ''}`}
            >
              <div className="w-20 h-20 bg-gray-100 rounded-lg
                              overflow-hidden border shrink-0 relative">
                <img
                  src={img}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = DEFAULT_IMG;
                  }}
                  alt={item.name}
                />
                {imgCount > 1 && (
                  <div className="absolute bottom-0 right-0 bg-black/60
                                  text-white text-xs px-1.5 py-0.5
                                  rounded-tl-lg font-bold">
                    +{imgCount - 1}
                  </div>
                )}
                {/* ★ OFFLINE: Local indicator */}
                {isLocal && (
                  <div className="absolute top-0 left-0 bg-orange-500
                                  text-white text-[8px] px-1 py-0.5
                                  rounded-br-lg font-bold">
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
                    <span className="text-[10px] bg-red-100 text-red-700
                                     px-1.5 py-0.5 rounded font-bold">
                      🚫 Hidden
                    </span>
                  )}
                  {item.warrantyPeriod && (
                    <span className="text-[10px] bg-amber-100 text-amber-700
                                     px-1.5 py-0.5 rounded font-bold">
                      🛡️ {item.warrantyPeriod}
                    </span>
                  )}
                  {/* ★ OFFLINE: Pending sync badge */}
                  {isLocal && (
                    <span className="text-[10px] bg-orange-100 text-orange-700
                                     px-1.5 py-0.5 rounded font-bold">
                      ⏳ Sync Pending
                    </span>
                  )}
                </div>
                <div className="mt-1.5 font-bold text-green-700">
                  Rs. {price.toFixed(2)}
                </div>
                <div className="text-xs text-gray-400">
                  තොග: {stock}
                </div>
              </div>

              <div className="flex flex-col gap-2 justify-center">
                <button
                  onClick={() => router.push(
                    `/items/edit/${item.firestoreId || item.id}`
                  )}
                  className="bg-blue-100 text-blue-700 px-3 py-2
                             rounded text-sm font-bold hover:bg-blue-200"
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleDelete(item)}
                  className="bg-red-100 text-red-700 px-3 py-2
                             rounded text-sm font-bold hover:bg-red-200"
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