'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUserAuth } from '@/context/UserContext';
import { useLang } from '@/hooks/useLang';
import { db } from '@/lib/firebase';
import {
  collection, query, where,
  onSnapshot, deleteDoc, doc,
} from 'firebase/firestore';
import { useEffect } from 'react';
import { getSafeImageUrl, DEFAULT_IMG, deleteImageFromStorage }
  from '@/helpers/imageHelpers';

export default function ItemsPage() {
  const { user } = useUserAuth();
  const router   = useRouter();
  const { lang } = useLang();

  const [items, setItems]           = useState([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'items'),
      where('uid', '==', user.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setIsLoading(false);
    });
    return () => unsub();
  }, [user?.uid]);

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

  const handleDelete = async (item) => {
    if (!confirm('මකා දැමීම තහවුරු කරන්න?')) return;
    try {
      const paths = Array.isArray(item.imagePaths) ? item.imagePaths : [];
      await Promise.all(paths.map((p) => deleteImageFromStorage(p)));
      await deleteDoc(doc(db, 'items', item.id));
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white p-4 shadow-sm sticky top-0 z-10 border-b">
        <div className="flex justify-between items-center mb-3">
          <h1 className="text-xl font-bold">📦 භාණ්ඩ ලියාපදිංචිය</h1>
          <button
            onClick={() => router.push('/items/add')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg
                       font-bold hover:bg-blue-700"
          >
            ➕ නව+
          </button>
        </div>
        <input
          className="w-full p-3 border-2 rounded-xl
                     focus:border-blue-400 outline-none"
          placeholder="🔍 සොයන්න..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
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

          return (
            <div
              key={item.id}
              className="bg-white p-4 rounded-xl shadow-sm flex gap-4
                         border hover:shadow-md transition-shadow"
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
                  onClick={() => router.push(`/items/edit/${item.id}`)}
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