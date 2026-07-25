// catalog/app/invoices/[uid]/InvoiceListClient.js
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore, collection, query, where,
  getDocs, deleteDoc, doc, addDoc,
  serverTimestamp, updateDoc, limit, orderBy,
} from 'firebase/firestore';

function getDb() {
  const config = {
    apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  const app = getApps().length === 0 ? initializeApp(config) : getApps()[0];
  return getFirestore(app);
}

const toNum = (val) => { const n = parseFloat(val); return isNaN(n) ? 0 : n; };

const fmtAmt = (v) =>
  toNum(v).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatTimestamp = (ts) => {
  if (!ts) return '-';
  try {
    const date = ts.toDate ? ts.toDate()
      : ts.seconds ? new Date(ts.seconds * 1000)
      : new Date(ts);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('si-LK', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch { return '-'; }
};

const getTimestampMs = (ts) => {
  if (!ts) return 0;
  try {
    if (ts.seconds) return ts.seconds * 1000;
    if (ts.toDate) return ts.toDate().getTime();
    const d = new Date(ts);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  } catch { return 0; }
};

const getAgeDays = (ts) => {
  const ms = getTimestampMs(ts);
  if (!ms) return 0;
  return Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24));
};

const normalizeInvoice = (rawData, docId, colName) => {
  const netAmount  = toNum(rawData.netAmount  || rawData.grandTotal || rawData.total    || 0);
  const payAmount  = toNum(rawData.payAmount  || rawData.paidAmount || rawData.paid     || 0);
  const grossTotal = toNum(rawData.grossTotal || rawData.subTotal   || rawData.invoiceValue || 0);

  return {
    id: docId,
    _collection: colName,
    customerName:    rawData.customerName    || rawData.customer || '',
    customerPhone:   rawData.customerPhone   || rawData.phone    || '',
    customerId:      rawData.customerId      || '',
    netAmount, grossTotal, payAmount,
    balance: rawData.balance !== undefined ? toNum(rawData.balance) : (payAmount - netAmount),
    totalDiscount:      toNum(rawData.totalDiscount      || 0),
    billDiscount:       toNum(rawData.billDiscount       || 0),
    billDiscountPercent:toNum(rawData.billDiscountPercent || 0),
    items:     rawData.items     || [],
    itemCount: rawData.itemCount || rawData.items?.length || 0,
    status: rawData.status || (colName === 'drafts' ? 'draft' : 'completed'),
    type:   colName === 'drafts' ? 'draft' : 'invoice',
    paymentMethod: rawData.paymentMethod || 'cash',
    createdAt: rawData.createdAt || null,
    date: rawData.date || formatTimestamp(rawData.createdAt),
    age: getAgeDays(rawData.createdAt),
    invoiceNo:   rawData.invoiceNo   || rawData.invoiceNumber || `#${docId.slice(-6).toUpperCase()}`,
    invoiceCode: rawData.invoiceCode || `INV-${docId.slice(-6).toUpperCase()}`,
    remarks: rawData.remarks || '',
  };
};

const getPaymentIcon = (method) => {
  const icons = { cash:'💵', card:'💳', etransfer:'📱', cheque:'📄', credit:'🏦', bank:'🏦' };
  return icons[method?.toLowerCase()] || '💰';
};

const getDateStart = (filter) => {
  const now = new Date();
  switch (filter) {
    case 'today':     return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    case 'thisWeek': {
      const day  = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(now.getFullYear(), now.getMonth(), diff).getTime();
    }
    case 'thisMonth': return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    default: return 0;
  }
};// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════
export default function InvoiceListClient({ uid }) {
  const [invoices,        setInvoices       ] = useState([]);
  const [customers,       setCustomers      ] = useState({});
  const [loading,         setLoading        ] = useState(true);
  const [searchTerm,      setSearchTerm     ] = useState('');
  const [statusFilter,    setStatusFilter   ] = useState('all');
  const [dateFilter,      setDateFilter     ] = useState('allTime');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [expandedRow,     setExpandedRow    ] = useState(null);
  const [toastMsg,        setToastMsg       ] = useState('');
  const [lastFetch,       setLastFetch      ] = useState(0);
  const [quotaError,      setQuotaError     ] = useState(false);
  const [paymentModal,    setPaymentModal   ] = useState(null);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  }, []);

  // ── ONE-TIME FETCH — quota safe ──
  const fetchInvoices = useCallback(async () => {
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    setQuotaError(false);

    try {
      const db = getDb();

      const [invoiceResult, draftResult, custResult] = await Promise.allSettled([
        getDocs(query(
          collection(db, 'invoices'),
          where('uid', '==', uid),
          orderBy('createdAt', 'desc'),
          limit(150)
        )),
        getDocs(query(
          collection(db, 'drafts'),
          where('uid', '==', uid),
          limit(50)
        )),
        getDocs(query(
          collection(db, 'customers'),
          where('uid', '==', uid),
          limit(300)
        )),
      ]);

      // Invoices + Drafts
      const merged = [];

      if (invoiceResult.status === 'fulfilled') {
        invoiceResult.value.docs.forEach(d => {
          merged.push(normalizeInvoice(d.data(), d.id, 'invoices'));
        });
      }

      if (draftResult.status === 'fulfilled') {
        draftResult.value.docs.forEach(d => {
          merged.push(normalizeInvoice(d.data(), d.id, 'drafts'));
        });
      }

      // Deduplicate
      const seen   = new Set();
      const unique = merged.filter(inv => {
        if (seen.has(inv.id)) return false;
        seen.add(inv.id);
        return true;
      });

      unique.sort((a, b) => getTimestampMs(b.createdAt) - getTimestampMs(a.createdAt));
      setInvoices(unique);

      // Customers
      if (custResult.status === 'fulfilled') {
        const map = {};
        custResult.value.docs.forEach(d => {
          map[d.id] = { id: d.id, ...d.data() };
        });
        setCustomers(map);
      }

      setLastFetch(Date.now());
    } catch (e) {
      console.error('Fetch error:', e.code, e.message);
      if (e.code === 'resource-exhausted') {
        setQuotaError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // ── Filtered ──
  const filteredInvoices = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return invoices.filter(inv => {
      if (term) {
        const match =
          (inv.customerName?.toLowerCase()  || '').includes(term) ||
          (inv.invoiceNo?.toLowerCase()     || '').includes(term) ||
          (inv.invoiceCode?.toLowerCase()   || '').includes(term) ||
          (inv.id?.toLowerCase()            || '').includes(term) ||
          (inv.customerPhone               || '').includes(term);
        if (!match) return false;
      }
      if (statusFilter === 'completed') { if (inv.status === 'draft') return false; }
      else if (statusFilter === 'draft')   { if (inv.status !== 'draft') return false; }
      else if (statusFilter === 'paid')    { if (!(inv.payAmount >= inv.netAmount - 0.01 && inv.netAmount > 0)) return false; }
      else if (statusFilter === 'unpaid')  { if (inv.payAmount >= inv.netAmount - 0.01) return false; }
      if (dateFilter !== 'allTime' && getTimestampMs(inv.createdAt) < getDateStart(dateFilter)) return false;
      return true;
    });
  }, [invoices, searchTerm, statusFilter, dateFilter]);

  // ── Stats ──
  const stats = useMemo(() => ({
    total:       filteredInvoices.length,
    totalAmount: filteredInvoices.reduce((s, i) => s + i.netAmount, 0),
    totalPaid:   filteredInvoices.reduce((s, i) => s + i.payAmount, 0),
    get totalBalance() { return this.totalAmount - this.totalPaid; },
  }), [filteredInvoices]);

  // ── Helpers ──
  const getStatusBadge = (inv) => {
    if (inv.status === 'draft')
      return { bg: '#fef3c7', color: '#92400e', label: '📝 Draft', accent: '#f59e0b' };
    if (inv.netAmount <= 0 || inv.payAmount >= inv.netAmount - 0.01)
      return { bg: '#dcfce7', color: '#166534', label: '✅ Paid', accent: '#22c55e' };
    if (inv.payAmount > 0)
      return { bg: '#fed7aa', color: '#9a3412', label: '⏳ Partial', accent: '#f97316' };
    return { bg: '#fecaca', color: '#991b1b', label: '🔴 Unpaid', accent: '#ef4444' };
  };

  const getAgeColor = (days) => {
    if (days <= 7)  return '#16a34a';
    if (days <= 30) return '#d97706';
    if (days <= 60) return '#ea580c';
    return '#dc2626';
  };

  // ── Payment ──
  const handlePayment = useCallback(async (inv, amount, method) => {
    if (!uid || !amount || amount <= 0) return;

    try {
      const db = getDb();
      const customer = customers[inv.customerId];

      await addDoc(collection(db, 'customerTransactions'), {
        customerId:    inv.customerId || '',
        customerName:  inv.customerName || '',
        customerPhone: inv.customerPhone || '',
        invoiceId:     inv.id,
        invoiceCode:   inv.invoiceCode || '',
        amount,
        method,
        type:   'payment',
        status: 'confirmed',
        uid,
        source:    'next-invoice-list',
        createdAt: serverTimestamp(),
        date:      new Date().toISOString(),
      });

      const newPayAmount = inv.payAmount + amount;
      const newBalance   = newPayAmount - inv.netAmount;

      await updateDoc(doc(db, inv._collection, inv.id), {
        payAmount:  newPayAmount,
        paidAmount: newPayAmount,
        balance:    newBalance,
        status:     newBalance >= -0.01 ? 'paid' : 'partial',
        updatedAt:  serverTimestamp(),
      });

      if (inv.customerId && customer) {
        const custBal = toNum(customer.currentBalance || 0);
        await updateDoc(doc(db, 'customers', inv.customerId), {
          currentBalance: custBal - amount,
          updatedAt:      serverTimestamp(),
        });
      }

      showToast('✅ ගෙවීම සාර්ථකයි!');
      fetchInvoices();
    } catch (e) {
      console.error('Payment error:', e);
      showToast('❌ ගෙවීම අසාර්ථකයි');
    }
  }, [uid, customers, showToast, fetchInvoices]);

  // ── Delete ──
  const handleDelete = useCallback(async (inv) => {
    if (!window.confirm('මෙම ඉන්වොයිසය මකා දැමීමට අවශ්‍යද?')) return;
    try {
      const db = getDb();
      await deleteDoc(doc(db, inv._collection, inv.id));
      setInvoices(prev => prev.filter(i => i.id !== inv.id));
      if (selectedInvoice?.id === inv.id) setSelectedInvoice(null);
      showToast('✅ මකා දැමීය!');
    } catch (e) {
      showToast(`❌ ${e.message}`);
    }
  }, [selectedInvoice, showToast]);

  // ── RENDER ──
  if (loading) return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#f8fafc', fontFamily: 'Arial, sans-serif',
    }}>
      <div style={{
        width: 36, height: 36, border: '3px solid #e2e8f0',
        borderTopColor: '#3b82f6', borderRadius: '50%',
        animation: 'spin 1s linear infinite', marginBottom: 16,
      }} />
      <p style={{ color: '#64748b', fontSize: 14 }}>ඉන්වොයිස් ලබා ගනිමින්...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{
      maxWidth: 800, margin: '0 auto', minHeight: '100vh',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      background: '#f8fafc', padding: '16px 12px 80px',
    }}>
      {/* Toast */}
      {toastMsg && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          background: '#334155', color: '#fff', padding: '10px 20px',
          borderRadius: 8, zIndex: 9999, fontSize: 15, fontWeight: 700,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          {toastMsg}
        </div>
      )}

      {/* ── DETAIL VIEW ── */}
      {selectedInvoice ? (
        <div>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 15 }}>
            <button
              onClick={() => setSelectedInvoice(null)}
              style={{
                background: '#f1f5f9', border: 'none', padding: '8px 14px',
                borderRadius: 8, fontSize: 15, cursor: 'pointer',
                fontWeight: 'bold', color: '#475569',
              }}
            >
              ← ආපසු
            </button>
            <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a', flex: 1 }}>
              🧾 {selectedInvoice.invoiceCode}
            </h2>
            <button
              onClick={() => handleDelete(selectedInvoice)}
              style={{
                background: '#ef4444', color: 'white', border: 'none',
                borderRadius: 6, width: 36, height: 36, fontSize: 16,
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              🗑️
            </button>
          </div>

          {/* Invoice Info */}
          <div style={{
            background: 'linear-gradient(135deg,#eff6ff,#dbeafe)',
            borderRadius: 12, padding: 15, marginBottom: 15,
            border: '1px solid #bfdbfe',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Invoice Code</div>
                <div style={{ fontSize: 16, fontWeight: 'bold', color: '#1e40af', fontFamily: 'monospace' }}>
                  {selectedInvoice.invoiceCode}
                </div>
              </div>
              {(() => {
                const b = getStatusBadge(selectedInvoice);
                return (
                  <span style={{
                    padding: '5px 12px', borderRadius: 20,
                    fontSize: 13, fontWeight: 'bold',
                    background: b.bg, color: b.color,
                  }}>
                    {b.label}
                  </span>
                );
              })()}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 14 }}>
              <div>📅 {selectedInvoice.date}</div>
              <div>
                ⏰ Age:{' '}
                <span style={{ color: getAgeColor(selectedInvoice.age), fontWeight: 'bold' }}>
                  {selectedInvoice.age} දින
                </span>
              </div>
              <div>👤 {selectedInvoice.customerName || 'Cash'}</div>
              <div>📞 {selectedInvoice.customerPhone || '-'}</div>
            </div>
          </div>

          {/* Items */}
          {selectedInvoice.items?.length > 0 && (
            <div style={{ marginBottom: 15 }}>
              <div style={{ fontSize: 15, fontWeight: 'bold', color: '#334155', marginBottom: 8 }}>
                📦 භාණ්ඩ ({selectedInvoice.items.length})
              </div>
              <div style={{
                background: 'white', borderRadius: 10,
                border: '1px solid #e2e8f0', overflow: 'hidden',
              }}>
                {selectedInvoice.items.map((item, idx) => (
                  <div key={idx} style={{
                    padding: 12, display: 'flex', alignItems: 'center', gap: 10,
                    borderBottom: idx < selectedInvoice.items.length - 1 ? '1px solid #f1f5f9' : 'none',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.name || `Item ${idx + 1}`}
                      </div>
                      {(item.nameSi || item.sinhalaName) && (
                        <div style={{ fontSize: 12, color: '#1e40af' }}>{item.nameSi || item.sinhalaName}</div>
                      )}
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        {toNum(item.qty || 1)} × Rs.{fmtAmt(toNum(item.yourPrice || item.sellingPrice))}
                      </div>
                    </div>
                    <div style={{ fontWeight: 'bold', fontSize: 15, color: '#1e40af', flexShrink: 0 }}>
                      Rs.{fmtAmt(toNum(item.lineTotal))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Totals */}
          <div style={{
            background: 'white', borderRadius: 10, padding: 15,
            border: '1px solid #e2e8f0', marginBottom: 15,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 'bold', borderTop: '2px solid #e2e8f0', paddingTop: 10 }}>
              <span>ශුද්ධ මුදල</span>
              <span>Rs. {fmtAmt(selectedInvoice.netAmount)}</span>
            </div>
          </div>

          {/* Payment info */}
          <div style={{
            background: 'white', borderRadius: 10, padding: 15,
            border: '1px solid #e2e8f0', marginBottom: 15,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, marginBottom: 8 }}>
              <span>ගෙවීම් ක්‍රමය</span>
              <span style={{ fontWeight: 600 }}>
                {getPaymentIcon(selectedInvoice.paymentMethod)} {(selectedInvoice.paymentMethod || 'cash').toUpperCase()}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, marginBottom: 8 }}>
              <span>ගෙවූ මුදල</span>
              <span style={{ fontWeight: 600, color: '#16a34a' }}>
                Rs. {fmtAmt(selectedInvoice.payAmount)}
              </span>
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 16, fontWeight: 'bold', padding: '10px 12px', borderRadius: 8,
              background: selectedInvoice.balance >= 0 ? '#f0fdf4' : '#fef2f2',
              color: selectedInvoice.balance >= 0 ? '#16a34a' : '#dc2626',
            }}>
              <span>ශේෂය</span>
              <span>Rs. {fmtAmt(selectedInvoice.balance)}</span>
            </div>
          </div>

          {/* Customer Balance */}
          {(() => {
            const customer = customers[selectedInvoice.customerId];
            if (!customer || !selectedInvoice.customerId) return null;
            const totalDebt = toNum(customer.currentBalance || 0);
            if (Math.abs(totalDebt) <= 0.01) return null;
            return (
              <div style={{
                background: totalDebt > 0 ? '#fef2f2' : '#f0fdf4',
                border: `2px solid ${totalDebt > 0 ? '#fecaca' : '#bbf7d0'}`,
                borderRadius: 12, padding: 16, marginBottom: 15,
              }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#334155', marginBottom: 8 }}>
                  💳 පාරිභෝගික ණය ශේෂය
                </div>
                <div style={{
                  fontSize: 20, fontWeight: 900,
                  color: totalDebt > 0 ? '#dc2626' : '#16a34a',
                }}>
                  Rs. {fmtAmt(totalDebt)}
                </div>
              </div>
            );
          })()}
        </div>

      ) : (

        /* ── LIST VIEW ── */
        <div>
          {/* Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8,
          }}>
            <h2 style={{ margin: 0, fontSize: 22, color: '#0f172a' }}>📋 ඉන්වොයිස් ලැයිස්තුව</h2>
            <button
              onClick={fetchInvoices}
              disabled={loading}
              style={{
                padding: '8px 14px',
                background: loading ? '#94a3b8' : '#f1f5f9',
                color: '#374151', border: '1px solid #e2e8f0',
                borderRadius: 8, cursor: loading ? 'wait' : 'pointer',
                fontWeight: 700, fontSize: 13,
              }}
            >
              {loading ? '⏳' : '🔄 Refresh'}
            </button>
          </div>

          {/* Last fetch */}
          {lastFetch > 0 && (
            <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'right', marginBottom: 8 }}>
              ⏱️ Updated: {new Date(lastFetch).toLocaleTimeString()}
            </div>
          )}

          {/* Quota error */}
          {quotaError && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 12, padding: '14px 16px', marginBottom: 16,
              display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 24 }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#dc2626', marginBottom: 4 }}>
                  Firebase Quota Exceeded
                </div>
                <div style={{ fontSize: 12, color: '#991b1b', lineHeight: 1.6 }}>
                  Daily read limit exceed. ටිකක් wait කරලා Refresh click කරන්න.
                </div>
              </div>
              <button
                onClick={fetchInvoices}
                style={{
                  padding: '8px 16px', background: '#dc2626', color: 'white',
                  border: 'none', borderRadius: 8, cursor: 'pointer',
                  fontWeight: 700, fontSize: 13, flexShrink: 0,
                }}
              >
                🔄 Retry
              </button>
            </div>
          )}

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 12 }}>
            <div style={{ background: '#eff6ff', padding: 10, borderRadius: 8, borderLeft: '3px solid #3b82f6' }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>🧾 ඉන්වොයිස්</div>
              <div style={{ fontSize: 22, fontWeight: 'bold', color: '#1e40af' }}>{stats.total}</div>
            </div>
            <div style={{ background: '#f0fdf4', padding: 10, borderRadius: 8, borderLeft: '3px solid #22c55e' }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>💰 මුළු විකිණීම්</div>
              <div style={{ fontSize: 17, fontWeight: 'bold', color: '#15803d' }}>Rs.{fmtAmt(stats.totalAmount)}</div>
            </div>
            <div style={{ background: '#f0fdf4', padding: 10, borderRadius: 8, borderLeft: '3px solid #16a34a' }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>✅ ගෙවූ</div>
              <div style={{ fontSize: 17, fontWeight: 'bold', color: '#16a34a' }}>Rs.{fmtAmt(stats.totalPaid)}</div>
            </div>
            <div style={{
              background: stats.totalBalance > 0.5 ? '#fef2f2' : '#f0fdf4',
              padding: 10, borderRadius: 8,
              borderLeft: `3px solid ${stats.totalBalance > 0.5 ? '#ef4444' : '#22c55e'}`,
            }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>📊 හිඟ</div>
              <div style={{ fontSize: 17, fontWeight: 'bold', color: stats.totalBalance > 0.5 ? '#dc2626' : '#16a34a' }}>
                Rs.{fmtAmt(stats.totalBalance)}
              </div>
            </div>
          </div>

          {/* Date Filter */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 8, background: '#f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
            {[
              { key: 'today',     label: 'අද' },
              { key: 'thisWeek',  label: 'සතිය' },
              { key: 'thisMonth', label: 'මාසය' },
              { key: 'allTime',   label: 'සමස්ත' },
            ].map(f => (
              <button key={f.key} onClick={() => setDateFilter(f.key)} style={{
                flex: 1, padding: '10px 2px', fontSize: 13, fontWeight: 'bold',
                border: 'none', cursor: 'pointer',
                background: dateFilter === f.key ? '#3b82f6' : 'transparent',
                color: dateFilter === f.key ? 'white' : '#64748b',
              }}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 8, background: '#f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
            {[
              { key: 'all',       label: `සියල්ල (${invoices.length})` },
              { key: 'completed', label: 'සම්පූර්ණ' },
              { key: 'draft',     label: 'Draft' },
              { key: 'paid',      label: 'Paid' },
              { key: 'unpaid',    label: 'Unpaid' },
            ].map(tab => (
              <button key={tab.key} onClick={() => setStatusFilter(tab.key)} style={{
                flex: 1, padding: '8px 2px', fontSize: 11, fontWeight: 'bold',
                border: 'none', cursor: 'pointer',
                background: statusFilter === tab.key ? 'white' : 'transparent',
                color: statusFilter === tab.key ? '#3b82f6' : '#64748b',
                boxShadow: statusFilter === tab.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                borderRadius: statusFilter === tab.key ? 6 : 0,
              }}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="🔍 පාරිභෝගිකයා / Invoice ID සොයන්න..."
            style={{
              width: '100%', padding: 14, borderRadius: 8,
              border: '1px solid #e2e8f0', fontSize: 15,
              boxSizing: 'border-box', marginBottom: 12, background: 'white',
            }}
          />

          {/* Invoice Cards */}
          {filteredInvoices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
              <div style={{ fontSize: 50, marginBottom: 15 }}>📭</div>
              <div style={{ fontSize: 16 }}>ඉන්වොයිස් නොමැත</div>
              <button
                onClick={fetchInvoices}
                style={{
                  marginTop: 16, padding: '10px 24px',
                  background: '#3b82f6', color: 'white', border: 'none',
                  borderRadius: 8, cursor: 'pointer', fontWeight: 700,
                }}
              >
                🔄 Refresh
              </button>
            </div>
          ) : (
            filteredInvoices.map(inv => {
              const badge      = getStatusBadge(inv);
              const isExpanded = expandedRow === inv.id;
              const isDue      = inv.payAmount < inv.netAmount - 0.01 && inv.status !== 'draft';

              return (
                <div key={inv.id} style={{
                  background: 'white', borderRadius: 10, marginBottom: 8,
                  border: '1px solid #e2e8f0', overflow: 'hidden',
                  borderLeft: `4px solid ${badge.accent}`,
                }}>
                  {/* Card Header */}
                  <div
                    onClick={() => setExpandedRow(isExpanded ? null : inv.id)}
                    style={{ padding: 12, cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 'bold', fontSize: 16, color: '#0f172a', marginBottom: 2 }}>
                          {inv.customerName || 'Cash'}
                        </div>
                        <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>
                          {inv.invoiceCode}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 'bold', fontSize: 18, color: '#1e40af' }}>
                          Rs.{fmtAmt(inv.netAmount)}
                        </div>
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 10,
                          background: badge.bg, color: badge.color, fontWeight: 'bold',
                        }}>
                          {badge.label}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, color: '#64748b' }}>📅 {inv.date}</span>
                        <span style={{ fontSize: 12, color: '#64748b' }}>📦 {inv.itemCount}</span>
                        <span style={{ fontSize: 12 }}>{getPaymentIcon(inv.paymentMethod)}</span>
                        {isDue && (
                          <span style={{
                            fontSize: 10, color: '#dc2626', fontWeight: 800,
                            background: '#fef2f2', padding: '2px 6px', borderRadius: 6,
                            border: '1px solid #fecaca',
                          }}>
                            🔴 Due: Rs.{fmtAmt(Math.abs(inv.balance))}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 13, color: '#6366f1', fontWeight: 600 }}>
                        {isExpanded ? '▲' : '▼'}
                      </span>
                    </div>
                  </div>

                  {/* Expanded */}
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid #e2e8f0', padding: 12, background: '#f8fafc' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                        {[
                          { label: 'Invoice',  value: inv.invoiceCode },
                          { label: 'දිනය',     value: inv.date },
                          { label: 'ශුද්ධ',    value: `Rs.${fmtAmt(inv.netAmount)}`,  bold: true },
                          { label: 'ගෙවූ',     value: `Rs.${fmtAmt(inv.payAmount)}`,  color: '#16a34a', bold: true },
                          { label: 'ශේෂය',     value: `Rs.${fmtAmt(inv.balance)}`,    color: inv.balance >= 0 ? '#16a34a' : '#dc2626', bold: true },
                        ].map((row, i) => (
                          <div key={i} style={{ padding: '4px 0' }}>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{row.label}</div>
                            <div style={{ fontSize: 14, fontWeight: row.bold ? 'bold' : 500, color: row.color || '#0f172a' }}>
                              {row.value}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'grid', gridTemplateColumns: isDue ? '1fr 1fr' : '1fr', gap: 6 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedInvoice(inv); }}
                          style={{
                            padding: '10px 12px', borderRadius: 8,
                            background: '#eff6ff', border: '1px solid #bfdbfe',
                            color: '#1e40af', fontWeight: 700, fontSize: 13,
                            cursor: 'pointer', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', gap: 6,
                          }}
                        >
                          👁️ විස්තර
                        </button>

                        {isDue && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const due = Math.abs(inv.balance);
                              handlePayment(inv, due, 'cash');
                            }}
                            style={{
                              padding: '10px 12px', borderRadius: 8,
                              background: 'linear-gradient(135deg,#16a34a,#15803d)',
                              border: 'none', color: 'white', fontWeight: 800,
                              fontSize: 13, cursor: 'pointer',
                              display: 'flex', alignItems: 'center',
                              justifyContent: 'center', gap: 6,
                            }}
                          >
                            💰 Settle Rs.{fmtAmt(Math.abs(inv.balance))}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}// ══════════════════════════════════════════════════════════════
// Part 3 — UI RENDER & MODALS
// ══════════════════════════════════════════════════════════════

// Payment Collection Modal (Internal to InvoiceListClient)
const InternalPaymentModal = ({ invoice, customer, onClose, onSuccess, uid }) => {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [busy,   setBusy]   = useState(false);

  useEffect(() => {
    const due = Math.abs(invoice.balance);
    if (due > 0) setAmount(due.toFixed(2));
  }, [invoice]);

  const handleSave = async () => {
    const payAmt = toNum(amount);
    if (payAmt <= 0) return alert('මුදල ඇතුළත් කරන්න');
    setBusy(true);
    try {
      const db = getDb();
      await addDoc(collection(db, 'customerTransactions'), {
        customerId: invoice.customerId, customerName: invoice.customerName,
        invoiceId: invoice.id, invoiceCode: invoice.invoiceCode,
        amount: payAmt, method, type: 'payment', status: 'confirmed',
        uid, source: 'next-invoice-list', createdAt: serverTimestamp(),
        date: new Date().toISOString()
      });

      const newPaid = invoice.payAmount + payAmt;
      const newBal  = newPaid - invoice.netAmount;

      await updateDoc(doc(db, invoice._collection, invoice.id), {
        payAmount: newPaid, paidAmount: newPaid, balance: newBal,
        status: newBal >= -0.01 ? 'paid' : 'partial',
        updatedAt: serverTimestamp()
      });

      if (invoice.customerId) {
        const cRef = doc(db, 'customers', invoice.customerId);
        const cSnap = await getDoc(cRef);
        if (cSnap.exists()) {
          const cur = toNum(cSnap.data().currentBalance);
          await updateDoc(cRef, { currentBalance: cur - payAmt });
        }
      }
      onSuccess();
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:10000, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'white', borderRadius:20, width:'100%', maxWidth:400, overflow:'hidden' }}>
        <div style={{ background:'#1e3a8a', color:'white', padding:20, textAlign:'center' }}>
          <h3 style={{ margin:0 }}>💰 ගෙවීම් එකතු කිරීම</h3>
          <div style={{ fontSize:12, opacity:0.8, marginTop:4 }}>{invoice.invoiceCode}</div>
        </div>
        <div style={{ padding:20 }}>
          <label style={{ display:'block', fontSize:13, fontWeight:700, marginBottom:8 }}>ගෙවන මුදල (Rs.)</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={{ width:'100%', padding:14, fontSize:22, fontWeight:900, border:'2px solid #e2e8f0', borderRadius:12, outline:'none', color:'#059669' }} />
          
          <div style={{ marginTop:16 }}>
            <label style={{ display:'block', fontSize:13, fontWeight:700, marginBottom:8 }}>ගෙවීම් ක්‍රමය</label>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {['cash', 'bank', 'card', 'cheque'].map(m => (
                <button key={m} onClick={() => setMethod(m)} style={{ padding:10, borderRadius:10, border: method === m ? '2px solid #3b82f6' : '1px solid #e2e8f0', background: method === m ? '#eff6ff' : 'white', fontWeight:700, textTransform:'capitalize' }}>{m}</button>
              ))}
            </div>
          </div>

          <button onClick={handleSave} disabled={busy} style={{ width:'100%', marginTop:20, padding:15, background:'#059669', color:'white', border:'none', borderRadius:12, fontWeight:800, fontSize:16, cursor:'pointer' }}>
            {busy ? 'සුරකිමින්...' : '✅ ගෙවීම සුරකින්න'}
          </button>
          <button onClick={onClose} style={{ width:'100%', marginTop:10, background:'none', border:'none', color:'#64748b', fontWeight:700, cursor:'pointer' }}>අවලංගු කරන්න</button>
        </div>
      </div>
    </div>
  );
};