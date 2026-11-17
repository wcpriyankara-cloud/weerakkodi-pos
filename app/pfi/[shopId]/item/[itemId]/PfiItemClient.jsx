'use client';

import React from 'react';
import { useParams } from 'next/navigation';

export default function PfiItemClient({ initialData = null }) {
  const params = useParams();
  const shopId = params?.shopId || 'shop';
  const itemId = params?.itemId || 'item';

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center justify-center">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-md w-full shadow-2xl text-center">
        <h1 className="text-2xl font-bold text-amber-400 mb-2">PFI Item View</h1>
        <p className="text-slate-400 text-sm mb-4">Shop: {shopId} | Item: {itemId}</p>
        <div className="bg-slate-950 p-4 rounded-xl text-left font-mono text-xs text-emerald-400 overflow-x-auto">
          {initialData ? JSON.stringify(initialData, null, 2) : 'Offline Item Profile Ready'}
        </div>
      </div>
    </div>
  );
}
