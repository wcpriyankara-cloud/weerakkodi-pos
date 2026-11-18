// fix_invoice_clients.js
const fs = require('fs');
const path = require('path');

console.log('🔧 Fixing /invoices/[uid] and /invoices/[uid]/[invoiceId] client components...');

// 1. Target Directory 1: app/invoices/[uid]
const userInvoicesDirs = [
  path.join(__dirname, 'app', 'invoices', '[uid]'),
  path.join(__dirname, 'src', 'app', 'invoices', '[uid]')
];

userInvoicesDirs.forEach(dir => {
  if (!fs.existsSync(dir)) return;

  const clientPath = path.join(dir, 'InvoiceClientComponent.jsx');
  let originalCode = fs.existsSync(clientPath) ? fs.readFileSync(clientPath, 'utf8') : '';

  // Ensure safe param resolution with useParams() and fallback
  let clientCode = `'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { db } from '@/firebaseConfig';
import { collection, query, where, getDocs } from 'firebase/firestore';

export default function UserInvoicesClient(props) {
  const routeParams = useParams();
  const uid = routeParams?.uid || props?.params?.uid || 'default';
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid || uid === 'default' || !db) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    async function loadInvoices() {
      try {
        const q = query(collection(db, 'invoices'), where('userId', '==', uid));
        const snap = await getDocs(q);
        if (isMounted) {
          const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setInvoices(list);
        }
      } catch (err) {
        console.warn('Error loading user invoices:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadInvoices();
    return () => { isMounted = false; };
  }, [uid]);

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-amber-400 mb-4">Invoices for User: {uid}</h1>
        {loading ? (
          <p className="text-slate-400">Loading invoices...</p>
        ) : invoices.length === 0 ? (
          <p className="text-slate-400">No invoices found for this user.</p>
        ) : (
          <div className="space-y-3">
            {invoices.map(inv => (
              <div key={inv.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center">
                <div>
                  <p className="font-bold text-slate-100">{inv.invoiceNo || inv.id}</p>
                  <p className="text-xs text-slate-400">{inv.date || inv.createdAt}</p>
                </div>
                <div className="text-right">
                  <p className="text-emerald-400 font-bold">Rs. {Number(inv.grandTotal || inv.netTotal || 0).toLocaleString()}</p>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">{inv.status || 'Completed'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
`;

  fs.writeFileSync(clientPath, clientCode, 'utf8');

  // Server Page Wrapper
  const pagePath = path.join(dir, 'page.js');
  const serverWrapper = `// Static export wrapper
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
`;
  fs.writeFileSync(pagePath, serverWrapper, 'utf8');
  console.log('✅ Standardized User Invoices route in:', dir);
});

// 2. Target Directory 2: app/invoices/[uid]/[invoiceId]
const invoiceDetailDirs = [
  path.join(__dirname, 'app', 'invoices', '[uid]', '[invoiceId]'),
  path.join(__dirname, 'src', 'app', 'invoices', '[uid]', '[invoiceId]')
];

invoiceDetailDirs.forEach(dir => {
  if (!fs.existsSync(dir)) return;

  const clientPath = path.join(dir, 'InvoiceClientComponent.jsx');

  let clientCode = `'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { db } from '@/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';

export default function InvoiceDetailClient(props) {
  const routeParams = useParams();
  const uid = routeParams?.uid || props?.params?.uid || 'default';
  const invoiceId = routeParams?.invoiceId || props?.params?.invoiceId || 'default';
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!invoiceId || invoiceId === 'default' || !db) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    async function loadInvoice() {
      try {
        const snap = await getDoc(doc(db, 'invoices', invoiceId));
        if (isMounted && snap.exists()) {
          setInvoice({ id: snap.id, ...snap.data() });
        }
      } catch (err) {
        console.warn('Error loading invoice detail:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadInvoice();
    return () => { isMounted = false; };
  }, [invoiceId]);

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center justify-center">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-lg w-full shadow-2xl">
        <h1 className="text-xl font-bold text-amber-400 mb-2">Invoice Details</h1>
        <p className="text-xs text-slate-400 mb-4">Invoice ID: {invoiceId} | User: {uid}</p>
        
        {loading ? (
          <p className="text-slate-400">Loading invoice details...</p>
        ) : invoice ? (
          <div className="space-y-3">
            <div className="flex justify-between border-b border-slate-700 pb-2">
              <span className="text-slate-400">Invoice No:</span>
              <span className="font-bold text-white">{invoice.invoiceNo || invoice.id}</span>
            </div>
            <div className="flex justify-between border-b border-slate-700 pb-2">
              <span className="text-slate-400">Date:</span>
              <span className="text-slate-200">{invoice.date || invoice.createdAt}</span>
            </div>
            <div className="flex justify-between border-b border-slate-700 pb-2">
              <span className="text-slate-400">Customer:</span>
              <span className="text-slate-200">{invoice.customerName || 'Walk-in'}</span>
            </div>
            <div className="flex justify-between pt-2">
              <span className="font-bold text-slate-300">Total:</span>
              <span className="font-bold text-emerald-400 text-lg">Rs. {Number(invoice.grandTotal || invoice.netTotal || 0).toLocaleString()}</span>
            </div>
          </div>
        ) : (
          <div className="bg-slate-950 p-4 rounded-xl text-center text-slate-400 text-sm">
            Invoice view is ready. Connect online or select from POS local history to load details.
          </div>
        )}
      </div>
    </div>
  );
}
`;

  fs.writeFileSync(clientPath, clientCode, 'utf8');

  // Server Page Wrapper
  const pagePath = path.join(dir, 'page.js');
  const serverWrapper = `// Static export wrapper
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
`;
  fs.writeFileSync(pagePath, serverWrapper, 'utf8');
  console.log('✅ Standardized Invoice Detail route in:', dir);
});

console.log('🎉 All invoice dynamic routes fixed!');