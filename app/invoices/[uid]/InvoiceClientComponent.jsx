'use client';

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
