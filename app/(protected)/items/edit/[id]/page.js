// Auto-generated static export wrapper
import React, { Suspense } from 'react';
import DynamicClient from './DynamicClient';

export async function generateStaticParams() {
  return [
    {
    "id": "default"
}
  ];
}

export const dynamicParams = false;

export default function StaticExportPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 text-slate-300 flex items-center justify-center p-6">Loading...</div>}>
      <DynamicClient />
    </Suspense>
  );
}
