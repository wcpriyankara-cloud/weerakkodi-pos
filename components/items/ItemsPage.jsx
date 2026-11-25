'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Package, Plus, Search, Edit3, RefreshCw, 
  CloudOff, Filter, Barcode
} from 'lucide-react';
import { localDb, getAllLocalItems } from '@/lib/localDb';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import SafeItemImage from '@/components/common/SafeItemImage';

export default function ItemsPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [isSyncing, setIsSyncing] = useState(false);
  const [quotaLimited, setQuotaLimited] = useState(false);

  // 1. Instant Hard Disk Read (0ms)
  const loadLocalItems = useCallback(async () => {
    try {
      const localData = await getAllLocalItems();
      if (Array.isArray(localData) && localData.length > 0) {
        setItems(localData);
        setLoading(false);
        return localData;
      }
    } catch (err) {
      console.warn('[ItemsPage] Local read notice:', err);
    }
    return [];
  }, []);

  // 2. Background Cloud Sync (Quota Safe - Never blocks UI)
  const syncCloudItems = useCallback(async () => {
    if (typeof window === 'undefined' || !navigator.onLine || !db) return;

    setIsSyncing(true);
    try {
      const fetchPromise = getDocs(collection(db, 'items'));
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT')), 2000)
      );

      const querySnapshot = await Promise.race([fetchPromise, timeoutPromise]);
      const cloudItems = [];

      querySnapshot.forEach((docSnap) => {
        const d = docSnap.data();
        cloudItems.push({
          ...d,
          id: String(docSnap.id),
          firestoreId: String(docSnap.id),
          name: d.name || d.itemName || 'Unnamed Item',
          sellingPrice: Number(d.sellingPriceRetail ?? d.sellingPrice ?? d.price ?? d.retailPrice ?? 0),
          costPrice: Number(d.buyingPrice ?? d.costPrice ?? d.cost ?? 0),
          stock: Number(d.currentStock ?? d.stock ?? d.quantity ?? 0),
          category: d.categoryName || d.category || 'General',
          barcode: d.barcode || d.itemCode || '',
          imageUrl: d.picture || d.imageUrl || (Array.isArray(d.images) ? d.images[0] : '') || '',
          synced: true,
          _synced: true
        });
      });

      if (cloudItems.length > 0) {
        setItems(cloudItems);
        setQuotaLimited(false);
        if (localDb && localDb.items) {
          try {
            await localDb.items.bulkPut(cloudItems);
          } catch (dexErr) {
            console.warn('[Dexie] Bulk put notice:', dexErr);
          }
        }
      }
    } catch (err) {
      setQuotaLimited(true);
      console.warn('[ItemsPage] Offline or Quota limited. Using Hard Disk items.');
    } finally {
      setIsSyncing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    async function init() {
      const localList = await loadLocalItems();
      if (mounted) {
        setLoading(false);
        syncCloudItems();
      }
    }
    init();
    return () => { mounted = false; };
  }, [loadLocalItems, syncCloudItems]);

  const categories = useMemo(() => {
    const set = new Set();
    items.forEach(i => {
      const cat = i.categoryName || i.category;
      if (cat && typeof cat === 'string') {
        set.add(cat.trim());
      }
    });
    return ['ALL', ...Array.from(set)];
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return items.filter(item => {
      // Legacy safeguard: do NOT hide items if status or isArchived is undefined
      const isArchived = item.isArchived === true || item.status === 'archived';
      if (isArchived) return false;

      if (selectedCategory !== 'ALL') {
        const itemCat = String(item.categoryName || item.category || '').trim().toLowerCase();
        if (itemCat !== selectedCategory.toLowerCase()) return false;
      }

      if (!q) return true;

      const name = String(item.name || '').toLowerCase();
      const sName = String(item.sinhalaName || '').toLowerCase();
      const code = String(item.itemCode || '').toLowerCase();
      const barcode = String(item.barcode || '').toLowerCase();
      const brand = String(item.brandName || item.brand || '').toLowerCase();

      return name.includes(q) || sName.includes(q) || code.includes(q) || barcode.includes(q) || brand.includes(q);
    });
  }, [items, searchQuery, selectedCategory]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-400">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                  භාණ්ඩ කළමනාකරණය (Items List)
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  පරිගණකයේ ඇති මුළු භාණ්ඩ: <span className="font-semibold text-slate-800 dark:text-slate-200">{items.length}</span> | දර්ශනය වන ගණන: <span className="font-semibold text-blue-600 dark:text-blue-400">{filteredItems.length}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {quotaLimited && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                <CloudOff className="w-3.5 h-3.5" />
                Hard Disk Mode (Safe)
              </span>
            )}

            <button
              onClick={() => {
                loadLocalItems();
                syncCloudItems();
              }}
              disabled={isSyncing}
              className="p-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 transition"
              title="Refresh Items"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
            </button>

            <Link
              href="/items/new"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              නව භාණ්ඩයක් ඇතුළත් කරන්න
            </Link>
          </div>
        </div>

        {/* Filter and Search */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="md:col-span-8 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="නම, Barcode, Item Code හෝ Brand මගින් සොයන්න..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white placeholder:text-slate-400"
            />
          </div>

          <div className="md:col-span-4 relative">
            <Filter className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'ALL' ? 'සියලුම Categories' : cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table View */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
              <p className="text-sm font-medium text-slate-500">Hard Disk Database එකෙන් භාණ්ඩ ලබාගනිමින් පවතී...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Package className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto" />
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
                භාණ්ඩ හමු නොවීය
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {searchQuery ? 'ඔබ සෙවූ නමට අදාළ භාණ්ඩ නොමැත.' : 'තවමත් කිසිදු භාණ්ඩයක් ඇතුළත් කර නොමැත.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 text-xs uppercase font-semibold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-3.5">Image</th>
                    <th className="px-4 py-3.5">භාණ්ඩයේ නම (Item Name)</th>
                    <th className="px-4 py-3.5">Category</th>
                    <th className="px-4 py-3.5 text-right">Cost (රු.)</th>
                    <th className="px-4 py-3.5 text-right">Selling (රු.)</th>
                    <th className="px-4 py-3.5 text-center">Stock</th>
                    <th className="px-4 py-3.5 text-center">ක්‍රියාමාර්ග</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredItems.map((item) => {
                    const itemId = item.id || item.firestoreId || item.localId;
                    const stockVal = Number(item.currentStock ?? item.stock ?? item.quantity ?? 0);
                    const sellingVal = Number(item.sellingPriceRetail ?? item.sellingPrice ?? item.price ?? 0);
                    const costVal = Number(item.buyingPrice ?? item.costPrice ?? item.cost ?? 0);
                    const imgUrl = item.picture || item.imageUrl || (Array.isArray(item.images) ? item.images[0] : '');

                    return (
                      <tr 
                        key={String(itemId)}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition duration-150"
                      >
                        <td className="px-4 py-3 w-14">
                          <SafeItemImage 
                            src={imgUrl} 
                            alt={item.name} 
                            className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                          />
                        </td>

                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {item.name || 'Unnamed Item'}
                          </div>
                          {(item.barcode || item.itemCode) && (
                            <div className="flex items-center gap-1 text-xs text-slate-400 font-mono mt-0.5">
                              <Barcode className="w-3 h-3" />
                              {item.barcode || item.itemCode}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {item.categoryName || item.category || 'General'}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-right font-mono text-slate-500 dark:text-slate-400">
                          {costVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>

                        <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 dark:text-white">
                          {sellingVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>

                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            stockVal > 10 
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' 
                              : stockVal > 0 
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                              : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                          }`}>
                            {stockVal}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => router.push(`/items/edit?id=${encodeURIComponent(String(itemId))}`)}
                            className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition"
                            title="Edit Item"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}