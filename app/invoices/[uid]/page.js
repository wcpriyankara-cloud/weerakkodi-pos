// Static export wrapper
import React, { Suspense } from 'react';
import UserInvoicesClient from './InvoiceClientComponent';

export async function generateStaticParams() {
  return [{ uid: 'default' }];
}

export const dynamicParams = false;

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 text-slate-400 flex items-center justify-center p-6">Loading User Invoices...</div>}>
      <UserInvoicesClient />
    </Suspense>
  );
}
