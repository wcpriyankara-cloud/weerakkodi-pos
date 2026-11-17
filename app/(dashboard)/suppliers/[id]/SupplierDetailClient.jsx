'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { db } from '@/shared/firebase-config';
import { useUserAuth } from '@/context/UserContext';
import {
  doc, getDoc, collection, query, where, getDocs, orderBy
} from 'firebase/firestore';

const fmtCur = (v) => `Rs. ${(parseFloat(v) || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function SupplierDetailClient({ id: propId }) {
  const router = useRouter();
  const params = useParams();
  const supplierId = propId || params?.id;
  const { user } = useUserAuth();

  const [supplier, setSupplier] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSupplierData = useCallback(async () => {
    if (!supplierId || !user?.uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // 1. Supplier විස්තර ලබා ගැනීම
      const sDoc = await getDoc(doc(db, 'suppliers', supplierId));
      if (sDoc.exists()) {
        setSupplier({ id: sDoc.id, ...sDoc.data() });
      }

      // 2. අදාළ Supplier ගේ Purchase Invoices ලබා ගැනීම
      try {
        const invQ = query(
          collection(db, 'purchaseInvoices'),
          where('uid', '==', user.uid),
          where('supplierId', '==', supplierId),
          orderBy('createdAt', 'desc')
        );
        const invSnap = await getDocs(invQ);
        setInvoices(invSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        // Index හෝ query issue එකක් ආවහොත් fallback query
        const invQ = query(
          collection(db, 'purchaseInvoices'),
          where('uid', '==', user.uid),
          where('supplierId', '==', supplierId)
        );
        const invSnap = await getDocs(invQ);
        setInvoices(invSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    } catch (err) {
      console.error('Error fetching supplier details:', err);
    } finally {
      setLoading(false);
    }
  }, [supplierId, user?.uid]);

  useEffect(() => {
    fetchSupplierData();
  }, [fetchSupplierData]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', flexDirection: 'column', gap: 12 }}>
        <div style={{ width: 36, height: 36, border: '3px solid #e2e8f0', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: '#64748b', fontSize: 14 }}>දත්ත ලබා ගනිමින් පවතී...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!supplier) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h2>⚠️ සැපයුම්කරු හමු නොවීය</h2>
        <button
          onClick={() => router.back()}
          style={{ marginTop: 15, padding: '10px 20px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}
        >
          ← ආපසු යන්න
        </button>
      </div>
    );
  }

  const balance = parseFloat(supplier.balance ?? supplier.currentBalance ?? supplier.openingBalance ?? 0);

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: '0 auto', fontFamily: 'sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => router.back()}
          style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', color: '#475569' }}
        >
          ← ආපසු
        </button>
        <h1 style={{ margin: 0, fontSize: 22, color: '#1e293b' }}>🏭 සැපයුම්කරුගේ විස්තර</h1>
      </div>

      {/* Supplier Profile Card */}
      <div style={{ background: 'white', borderRadius: 16, padding: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginBottom: 24, border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#7c3aed', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 'bold', overflow: 'hidden' }}>
            {supplier.profilePicture ? <img src={supplier.profilePicture} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : supplier.name?.[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 20, color: '#1e293b' }}>{supplier.name}</h2>
            {supplier.companyName && <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>{supplier.companyName}</div>}
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 13, color: '#475569', flexWrap: 'wrap' }}>
              {supplier.phone && <span>📞 {supplier.phone}</span>}
              {supplier.email && <span>✉️ {supplier.email}</span>}
              {supplier.city && <span>📍 {supplier.city}</span>}
            </div>
          </div>
          <div style={{ background: balance > 0 ? '#fef2f2' : '#f0fdf4', padding: '14px 20px', borderRadius: 12, border: `1px solid ${balance > 0 ? '#fecaca' : '#bbf7d0'}`, textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>වත්මන් ශේෂය (ණය)</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: balance > 0 ? '#dc2626' : '#16a34a', marginTop: 4 }}>
              {fmtCur(balance)}
            </div>
          </div>
        </div>
      </div>

      {/* Purchases / Invoices History */}
      <div style={{ background: 'white', borderRadius: 16, padding: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#1e293b' }}>📦 මිලදී ගැනීමේ ඉතිහාසය ({invoices.length})</h3>
        {invoices.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🧾</div>
            <p>මිලදී ගැනීම් පිළිබඳ දත්ත නොමැත</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                  <th style={{ padding: 10 }}>ඉන්වොයිස් අංකය</th>
                  <th style={{ padding: 10 }}>දිනය</th>
                  <th style={{ padding: 10, textAlign: 'right' }}>මුළු මුදල</th>
                  <th style={{ padding: 10, textAlign: 'right' }}>ගෙවූ මුදල</th>
                  <th style={{ padding: 10, textAlign: 'right' }}>ශේෂය</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: 10, fontWeight: 600, color: '#7c3aed' }}>{inv.invoiceNo || inv.invoiceNumber || inv.id.slice(-6).toUpperCase()}</td>
                    <td style={{ padding: 10, color: '#64748b' }}>{inv.date || (inv.createdAt?.toDate ? inv.createdAt.toDate().toLocaleDateString() : '-')}</td>
                    <td style={{ padding: 10, textAlign: 'right', fontWeight: 600 }}>{fmtCur(inv.grandTotal || inv.netAmount || inv.totalAmount || 0)}</td>
                    <td style={{ padding: 10, textAlign: 'right', color: '#16a34a' }}>{fmtCur(inv.paidAmount || inv.payAmount || 0)}</td>
                    <td style={{ padding: 10, textAlign: 'right', fontWeight: 'bold', color: (inv.balance || 0) > 0 ? '#dc2626' : '#16a34a' }}>
                      {fmtCur(inv.balance || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}