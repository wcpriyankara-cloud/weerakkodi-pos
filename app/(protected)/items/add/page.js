// C:\Users\chandana\StudioProjects\weerakkodi_pos_app\app\(protected)\items\add\page.js
'use client';

import React, { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import ItemFormPage from '@/components/items/ItemFormPage';

export default function AddItemPage() {
  const router = useRouter();

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-900 text-slate-300 flex items-center justify-center p-6">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mr-3"></div>
          <span className="font-medium text-slate-200">නව භාණ්ඩ Form එක සූදානම් වෙමින් පවතී...</span>
        </div>
      }
    >
      <ItemFormPage
        mode="add"
        onSuccess={() => router.push('/items')}
        onCancel={() => router.push('/items')}
      />
    </Suspense>
  );
}