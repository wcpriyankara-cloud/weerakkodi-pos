// C:\Users\chandana\StudioProjects\weerakkodi_pos_app\app\(protected)\items\edit\ItemEditClient.jsx
'use client';

import React, { Suspense } from 'react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import ItemFormPage from '@/components/items/ItemFormPage';

function ItemEditContent({ id: propId }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();

  // 1. URL Query (?id=...), 2. Route Param ([id]), 3. Direct Prop යන ඕනෑම ක්‍රමයකින් ID එක ලබාගැනීම
  const itemId = propId || searchParams.get('id') || params?.id;

  // යම් හෙයකින් ID එකක් නැතිව පිටුවට පැමිණියහොත් නැවත Items ලැයිස්තුවට හරවා යවයි
  if (!itemId) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-300 flex flex-col items-center justify-center p-6">
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 text-center max-w-md shadow-xl">
          <p className="text-amber-400 text-lg font-bold mb-2">⚠️ භාණ්ඩයේ ID අංකය හමු නොවීය</p>
          <p className="text-slate-400 text-sm mb-4">කරුණාකර භාණ්ඩ ලැයිස්තුවෙන් සංස්කරණය කිරීමට අවශ්‍ය භාණ්ඩය නැවත තෝරන්න.</p>
          <button
            onClick={() => router.push('/items')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors"
          >
            භාණ්ඩ ලැයිස්තුවට යන්න
          </button>
        </div>
      </div>
    );
  }

  return (
    <ItemFormPage
      mode="edit"
      id={itemId}
      itemId={itemId}
      onSuccess={() => router.push('/items')}
      onCancel={() => router.push('/items')}
    />
  );
}

// Next.js Static Export හිදී useSearchParams සඳහා අත්‍යවශ්‍ය Suspense Wrapper එක
export default function ItemEditClient(props) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-900 text-slate-300 flex items-center justify-center p-6">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mr-3"></div>
          <span className="font-medium text-slate-200">භාණ්ඩයේ විස්තර ලබා ගනිමින්...</span>
        </div>
      }
    >
      <ItemEditContent {...props} />
    </Suspense>
  );
}