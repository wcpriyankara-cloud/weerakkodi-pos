// app/(protected)/items/edit/page.jsx
'use client';

import React, { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import ItemFormPage from '@/components/items/ItemFormPage';

function EditItemContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // URL එකෙන් id parameter එක කියවීම (?id=123)
  const itemId = searchParams.get('id');

  return (
    <ItemFormPage
      mode="edit"
      itemId={itemId}
      onSuccess={() => router.push('/items')}
      onCancel={() => router.push('/items')}
    />
  );
}

export default function EditItemPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900 text-slate-300 flex items-center justify-center p-6">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mr-3"></div>
        Loading Item Form...
      </div>
    }>
      <EditItemContent />
    </Suspense>
  );
}