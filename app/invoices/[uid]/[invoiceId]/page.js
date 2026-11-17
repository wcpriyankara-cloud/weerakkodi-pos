// Static export wrapper
import React, { Suspense } from 'react';
import InvoiceDetailClient from './InvoiceClientComponent';

export async function generateStaticParams() {
  return [{ uid: 'default', invoiceId: 'default' }];
}

export const dynamicParams = false;

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 text-slate-400 flex items-center justify-center p-6">Loading Invoice...</div>}>
      <InvoiceDetailClient />
    </Suspense>
  );
}
