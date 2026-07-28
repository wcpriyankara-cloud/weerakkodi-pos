'use client';

// src/components/SupplierReport.jsx
// ═══════════════════════════════════════════════════════════════
// v2.0 — Next.js App Router Compatible
// useParams + useNavigate → useParams + useRouter (next/navigation)
// firebaseConfig → @/shared/firebase-config
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from "@/shared/firebase-config";
import {
  doc, getDoc, collection, query, where,
  getDocs, updateDoc, arrayUnion, deleteDoc
} from "firebase/firestore";
import { useUserAuth } from "@/context/UserContext";

const toNum = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

const parseDate = (val) => {
  try {
    if (!val) return new Date();
    if (val.toDate) return val.toDate();
    if (val.seconds) return new Date(val.seconds * 1000);
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date() : d;
  } catch { return new Date(); }
};

const formatDate = (d) => {
  try { return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return '-'; }
};

const formatCurrency = (amt) =>
  `Rs. ${toNum(amt).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

const getSupBalance = (sup) => {
  if (!sup) return 0;
  const b = parseFloat(sup.balance);
  if (!isNaN(b) && b !== 0) return b;
  const c = parseFloat(sup.currentBalance);
  if (!isNaN(c) && c !== 0) return c;
  return parseFloat(sup.openingBalance) || 0;
};

const extractAllImages = (data) => {
  if (!data) return [];
  const imgs = [];
  const add = (u) => { if (u && typeof u === 'string' && u.length > 20 && !imgs.includes(u)) imgs.push(u); };
  if (Array.isArray(data.receiptImages)) data.receiptImages.forEach(add);
  if (Array.isArray(data.images)) data.images.forEach(add);
  ['receiptUrl', 'receiptImage', 'imageUrl', 'image', 'receipt', 'slipImage', 'bankSlip', 'paymentImage', 'billUrl', 'attachment'].forEach(k => add(data[k]));
  return imgs;
};

const normalizePurchaseItems = (raw) => {
  const items = [];
  let src = raw;
  if (src && typeof src === 'object' && !Array.isArray(src)) src = Object.values(src);
  if (Array.isArray(src)) {
    src.forEach(it => {
      if (!it || typeof it !== 'object') return;
      const p = toNum(it.buyingPrice || it.costPrice || it.price || it.unitPrice || it.rate || 0);
      const q = toNum(it.qty || it.quantity || 1);
      items.push({
        name: it.name || it.itemName || it.productName || 'Unknown',
        qty: q, price: p,
        total: toNum(it.totalCost || it.total || it.subTotal || q * p),
      });
    });
  }
  return items;
};

const compressImage = (file) => new Promise((resolve) => {
  if (!file.type.startsWith('image/')) { alert("පින්තූරයක් පමණක් තෝරන්න!"); resolve(null); return; }
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (e) => {
    const img = new Image(); img.src = e.target.result;
    img.onload = () => {
      const c = document.createElement('canvas');
      const s = img.width > 1000 ? 1000 / img.width : 1;
      c.width = img.width * s; c.height = img.height * s;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve(null);
  };
  reader.onerror = () => resolve(null);
});

const detectCashTxnType = (dt) => {
  const category = String(dt.category || '').toLowerCase();
  const rawType = String(dt.type || dt.transactionType || '').toLowerCase();
  if (category === 'supplierpayment') return 'payment';
  if (category === 'supplierreceipt') return 'receipt';
  if (rawType === 'out' || rawType === 'expense' || rawType === 'payment') return 'payment';
  if (rawType === 'in' || rawType === 'income' || rawType === 'receive' || rawType === 'receipt') return 'receipt';
  return 'payment';
};

const isPurchaseInvoiceDoc = (dt) => {
  const category = String(dt.category || '').toLowerCase();
  if (category === 'supplierpayment' || category === 'supplierreceipt') return false;
  if (String(dt.source || '').toLowerCase() === 'purchase' && category) return false;
  if (dt.grandTotal) return true;
  return false;
};

const buildRunningBalancesFromCurrent = (txnsAsc, currentBalance) => {
  const desc = [...txnsAsc].sort((a, b) => b.date.getTime() - a.date.getTime());
  let cursor = toNum(currentBalance);
  return desc.map((txn) => {
    const row = { ...txn, runningBalance: cursor };
    if (txn.type === 'purchase') cursor -= txn.amount;
    else if (txn.type === 'payment') cursor += txn.amount;
    else if (txn.type === 'receipt') cursor -= txn.amount;
    return row;
  });
};

const getNoteText = (rawData) => {
  if (!rawData) return '';
  return rawData.notes || rawData.note || rawData.description || rawData.remarks || rawData.memo || rawData.comment || '';
};

const getPaymentStatusInfo = (rawData) => {
  if (!rawData) return null;
  const ps = rawData.paymentStatus;
  const bal = toNum(rawData.balance);
  const gt = toNum(rawData.grandTotal || rawData.total || rawData.totalAmount);
  const paid = toNum(rawData.paidAmount);
  let status;
  if (ps) { status = ps; }
  else if (gt > 0) {
    if (bal <= 0.01 || paid >= gt) status = 'paid';
    else if (paid > 0) status = 'partial';
    else status = 'credit';
  } else { return null; }
  const map = {
    paid:    { label: '🟢 Paid',    labelSi: '✅ සම්පූර්ණ', color: '#16a34a', bg: '#dcfce7' },
    partial: { label: '🟡 Partial', labelSi: '🟡 අර්ධ',     color: '#d97706', bg: '#fef3c7' },
    credit:  { label: '🔴 Credit',  labelSi: '🔴 ණය',      color: '#dc2626', bg: '#fee2e2' },
  };
  return map[status] || map.credit;
};

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */
export default function SupplierReport() {
  const params   = useParams();
  const id       = params?.id;
  const router   = useRouter();
  const { user } = useUserAuth();

  const [supplier, setSupplier]       = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [transactions, setTxns]       = useState([]);
  const [stats, setStats]             = useState({ totalPurchase: 0, totalPaid: 0, totalReceived: 0, currentBalance: 0 });
  const [filterTab, setFilterTab]     = useState('all');
  const [expandedRows, setExpanded]   = useState({});
  const [viewReceiptUrl, setViewRec]  = useState(null);
  const [uploadingId, setUploadingId] = useState(null);
  const [deletingId, setDeletingId]   = useState(null);

  const toggleRow = (key) => setExpanded(p => ({ ...p, [key]: !p[key] }));

  const fetchReport = useCallback(async () => {
    if (!user || !id) return;
    setLoading(true);
    setError(null);

    try {
      // Supplier doc
      const supSnap = await getDoc(doc(db, 'suppliers', id));
      if (!supSnap.exists()) throw new Error('Supplier not found');
      const supData = { id: supSnap.id, ...supSnap.data() };
      setSupplier(supData);

      const storedBalance = getSupBalance(supData);
      const txns = [];
      const seen = new Set();

      // ── Purchases ──────────────────────────────────────
      const purchaseCollection = collection(db, 'purchaseInvoices');
      for (const fld of ['supplierId', 'supplier_id']) {
        try {
          const snap = await getDocs(query(purchaseCollection, where(fld, '==', id), where('uid', '==', user.uid)));
          snap.forEach(d => {
            const key = d.ref.path;
            if (seen.has(key)) return;
            seen.add(key);
            const dt = d.data();
            const amt = toNum(dt.grandTotal || dt.total || dt.amount || dt.netTotal);
            if (amt <= 0) return;
            const ri = extractAllImages(dt);
            txns.push({
              key, id: d.id, type: 'purchase',
              date: parseDate(dt.createdAt || dt.date || dt.timestamp),
              amount: amt,
              note: `📦 මිලදී ගැනීම ${dt.refNo || dt.invoiceNo ? `[${dt.refNo || dt.invoiceNo}]` : ''}`,
              items: normalizePurchaseItems(dt.items || dt.cart || dt.products || dt.purchaseItems || dt.details || []),
              receiptImages: ri, receiptUrl: ri[0] || null,
              _path: d.ref.path, _rawData: dt,
            });
          });
        } catch (e) { console.warn(`purchaseInvoices (${fld}):`, e.message); }
      }

      // ── Payments / Receipts ────────────────────────────
      const cashCol = collection(db, 'users', user.uid, 'cashTransactions');
      const payMap  = new Map();
      for (const fld of ['supplierId', 'supplier_id']) {
        try {
          const snap = await getDocs(query(cashCol, where(fld, '==', id)));
          snap.forEach(d => { if (!payMap.has(d.ref.path)) payMap.set(d.ref.path, d); });
        } catch {}
      }
      payMap.forEach((d, key) => {
        if (seen.has(key)) return;
        const dt = d.data();
        if (isPurchaseInvoiceDoc(dt)) return;
        const amt = toNum(dt.amount || dt.paymentAmount || dt.paidAmount || dt.cash || 0);
        if (amt <= 0) return;
        seen.add(key);
        const txnType = detectCashTxnType(dt);
        const method  = (dt.method || dt.paymentMethod || 'cash').toLowerCase();
        const ri = extractAllImages(dt);
        txns.push({
          key, id: d.id, type: txnType,
          date: parseDate(dt.timestamp || dt.createdAt || dt.date || dt.paymentDate),
          amount: amt,
          note: txnType === 'receipt' ? `📥 ලැබීම [${method.toUpperCase()}]` : `💵 ගෙවීම [${method.toUpperCase()}]`,
          items: [], receiptImages: ri, receiptUrl: ri[0] || null,
          _path: d.ref.path, _paymentMethod: method,
          _bankName: dt.bankName || dt.bank || dt.bankAccountName || '',
          _accountNo: dt.accountNo || dt.accountNumber || '',
          _transactionId: dt.transactionId || dt.txnId || '',
          _chequeNo: dt.chequeNo || '',
          _reference: dt.reference || dt.refNo || '',
          _description: getNoteText(dt), _rawData: dt,
        });
      });

      // ── Stats ──────────────────────────────────────────
      const txnsAsc = [...txns].sort((a, b) => a.date.getTime() - b.date.getTime());
      let totalPurchase = 0, totalPaid = 0, totalReceived = 0;
      txnsAsc.forEach(t => {
        if (t.type === 'purchase') totalPurchase += t.amount;
        else if (t.type === 'payment') totalPaid += t.amount;
        else if (t.type === 'receipt') totalReceived += t.amount;
      });

      const txnsForDisplay = buildRunningBalancesFromCurrent(txnsAsc, storedBalance);
      setStats({ totalPurchase, totalPaid, totalReceived, currentBalance: storedBalance });
      setTxns(txnsForDisplay);

    } catch (e) { setError(e.message || 'Error'); }
    finally { setLoading(false); }
  }, [id, user]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const handleUpload = async (txn, file) => {
    if (!file || !user) return;
    try {
      setUploadingId(txn._path);
      const b64 = await compressImage(file);
      if (!b64) return;
      await updateDoc(doc(db, txn._path), { receiptImages: arrayUnion(b64), receiptUrl: b64 });
      setTxns(p => p.map(t =>
        t._path === txn._path ? { ...t, receiptImages: [...(t.receiptImages || []), b64], receiptUrl: b64 } : t
      ));
      alert('✅ Save කරන ලදී!');
    } catch (e) { alert('❌ ' + e.message); }
    finally { setUploadingId(null); }
  };

  const handleDelete = async (txn) => {
    if (!window.confirm(`මෙම ගනුදෙනුව මකන්න?\n${formatCurrency(txn.amount)}`)) return;
    try {
      setDeletingId(txn._path);
      await deleteDoc(doc(db, txn._path));
      const bal = getSupBalance(supplier);
      let newBal = bal;
      if (txn.type === 'purchase') newBal = bal - txn.amount;
      else if (txn.type === 'payment') newBal = bal + txn.amount;
      else if (txn.type === 'receipt') newBal = bal - txn.amount;
      await updateDoc(doc(db, 'suppliers', id), { balance: newBal, currentBalance: newBal });
      setSupplier(p => ({ ...p, balance: newBal, currentBalance: newBal }));
      await fetchReport();
      alert('✅ මකා දමන ලදී!');
    } catch (e) { alert('❌ ' + e.message); }
    finally { setDeletingId(null); }
  };

  const filtered = filterTab === 'all' ? transactions
    : filterTab === 'payment' ? transactions.filter(t => t.type === 'payment' || t.type === 'receipt')
    : transactions.filter(t => t.type === filterTab);

  const purchaseCount = transactions.filter(t => t.type === 'purchase').length;
  const paymentCount  = transactions.filter(t => t.type === 'payment' || t.type === 'receipt').length;

  /* ── Loading ── */
  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f5f3ff', gap: 20 }}>
      <div style={{ width: 60, height: 60, border: '5px solid #e2e8f0', borderTop: '5px solid #7c3aed', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <h2 style={{ color: '#7c3aed', margin: 0 }}>දත්ත පූරණය වෙමින්...</h2>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  /* ── Error ── */
  if (error) return (
    <div style={{ textAlign: 'center', padding: 50 }}>
      <h2 style={{ color: '#dc2626' }}>❌ {error}</h2>
      <button onClick={() => router.push('/suppliers')} style={{ padding: '10px 20px', background: '#64748b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', marginTop: 20 }}>← ආපසු</button>
    </div>
  );

  /* ── Not found ── */
  if (!supplier) return (
    <div style={{ textAlign: 'center', padding: 50 }}>
      <h2>⚠️ සැපයුම්කරු සොයාගත නොහැක</h2>
      <button onClick={() => router.push('/suppliers')} style={{ padding: '10px 20px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', marginTop: 20 }}>← ආපසු</button>
    </div>
  );

  /* ════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════ */
  return (
    <div style={{ background: '#f0e7ff', minHeight: '100vh', padding: 20, fontFamily: 'sans-serif' }}>

      {/* Action buttons */}
      <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }} className="no-print">
        <button onClick={() => router.push('/suppliers')} style={{ padding: '10px 20px', background: '#64748b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>← ආපසු</button>
        <button onClick={() => window.print()} style={{ padding: '10px 20px', background: '#10b981', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>🖨️ මුද්‍රණය</button>
        <button onClick={fetchReport} style={{ padding: '10px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>🔄 Refresh</button>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', background: 'white', padding: 30, borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
        <h1 style={{ textAlign: 'center', color: '#7c3aed', borderBottom: '3px solid #7c3aed', paddingBottom: 15, margin: '0 0 30px' }}>සැපයුම්කරු වාර්තාව</h1>

        {/* Summary */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 30, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, background: 'linear-gradient(135deg,#faf5ff,#f3e8ff)', padding: 20, borderRadius: 12, minWidth: 250, border: '2px solid #e9d5ff' }}>
            <h2 style={{ margin: '0 0 15px', color: '#1e293b' }}>{supplier.name}</h2>
            {supplier.companyName && <p style={{ margin: '8px 0', color: '#64748b' }}>🏢 {supplier.companyName}</p>}
            {supplier.phone && <p style={{ margin: '8px 0', color: '#64748b' }}>📞 {supplier.phone}</p>}
            {supplier.address && <p style={{ margin: '8px 0', color: '#64748b' }}>📍 {supplier.address}</p>}
          </div>

          <div style={{ flex: 1, background: '#f8fafc', padding: 20, borderRadius: 12, minWidth: 250, border: '2px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 16 }}>
              <span style={{ color: '#475569' }}>මුළු මිලදී ගැනීම්:</span>
              <b style={{ color: '#dc2626' }}>{formatCurrency(stats.totalPurchase)}</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 16 }}>
              <span style={{ color: '#475569' }}>මුළු ගෙවීම්:</span>
              <b style={{ color: '#16a34a' }}>{formatCurrency(stats.totalPaid)}</b>
            </div>
            {stats.totalReceived > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 16 }}>
                <span style={{ color: '#475569' }}>මුළු ලැබීම්:</span>
                <b style={{ color: '#2563eb' }}>{formatCurrency(stats.totalReceived)}</b>
              </div>
            )}
            {toNum(supplier.openingBalance) !== 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 14 }}>
                <span style={{ color: '#64748b' }}>ආරම්භක ශේෂය:</span>
                <b style={{ color: '#7c3aed' }}>{formatCurrency(supplier.openingBalance)}</b>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, borderTop: '3px solid #cbd5e1', paddingTop: 15, marginTop: 10 }}>
              <b style={{ color: '#0f172a' }}>වත්මන් ශේෂය:</b>
              <b style={{ color: stats.currentBalance > 0 ? '#dc2626' : '#16a34a', fontSize: 22 }}>
                {formatCurrency(Math.abs(stats.currentBalance))}
                <span style={{ fontSize: 13, marginLeft: 6, fontWeight: 'normal' }}>
                  {stats.currentBalance > 0 ? '(ගෙවිය යුතු)' : stats.currentBalance < 0 ? '(අධිකව ගෙවූ)' : '(ශේෂ නැත)'}
                </span>
              </b>
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="no-print" style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { key: 'all',      label: `සියල්ල (${transactions.length})`,                 bg: '#7c3aed' },
            { key: 'purchase', label: `📦 මිලදී ගැනීම් (${purchaseCount})`,              bg: '#dc2626' },
            { key: 'payment',  label: `💵 ගෙවීම් / ලැබීම් (${paymentCount})`,            bg: '#16a34a' },
          ].map(f => (
            <button key={f.key} onClick={() => setFilterTab(f.key)} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', fontWeight: 'bold', cursor: 'pointer', background: filterTab === f.key ? f.bg : '#f1f5f9', color: filterTab === f.key ? 'white' : '#475569' }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto', border: '2px solid #e2e8f0', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', color: 'white' }}>
              <tr>
                <th style={{ padding: 15, textAlign: 'left' }}>දිනය</th>
                <th style={{ padding: 15, textAlign: 'left' }}>විස්තරය</th>
                <th style={{ padding: 15, textAlign: 'center' }}>තත්ත්වය</th>
                <th style={{ padding: 15, textAlign: 'right' }}>මිලදී ගැනීම්</th>
                <th style={{ padding: 15, textAlign: 'right' }}>ගෙවීම්</th>
                <th style={{ padding: 15, textAlign: 'right' }}>ශේෂය</th>
                <th style={{ padding: 15, textAlign: 'center' }} className="no-print">📄</th>
                <th style={{ padding: 15, textAlign: 'center' }} className="no-print">🗑️</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan="8" style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>ගනුදෙනු නොමැත.</td></tr>
              ) : filtered.map((txn, i) => {
                const noteText  = getNoteText(txn._rawData);
                const statusInfo = txn.type === 'purchase' ? getPaymentStatusInfo(txn._rawData) : null;

                return (
                  <React.Fragment key={txn.key}>
                    <tr style={{
                      background: txn.type === 'payment' ? '#f0fdf4' : txn.type === 'receipt' ? '#eff6ff' : (i % 2 === 0 ? 'white' : '#faf5ff'),
                      borderBottom: '1px solid #e2e8f0',
                      borderLeft: txn.type === 'payment' ? '4px solid #16a34a' : txn.type === 'receipt' ? '4px solid #3b82f6' : '4px solid transparent',
                    }}>
                      <td style={{ padding: 15, fontSize: 13, color: '#475569', whiteSpace: 'nowrap' }}>{formatDate(txn.date)}</td>

                      <td style={{ padding: 15, cursor: 'pointer' }} onClick={() => toggleRow(txn.key)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <b style={{ color: txn.type === 'purchase' ? '#dc2626' : txn.type === 'receipt' ? '#2563eb' : '#16a34a' }}>
                            {txn.note.split('[')[0].trim()}
                          </b>
                          <span style={{ fontSize: 11, background: txn.type === 'payment' ? '#dcfce7' : txn.type === 'receipt' ? '#dbeafe' : '#f3e8ff', color: txn.type === 'payment' ? '#166534' : txn.type === 'receipt' ? '#1d4ed8' : '#7c3aed', padding: '3px 8px', borderRadius: 6, fontWeight: 'bold' }}>
                            {expandedRows[txn.key] ? '▼' : '▶'} විස්තර
                          </span>
                        </div>
                        {noteText && (
                          <div style={{ marginTop: 4, fontSize: 12, color: '#64748b', fontStyle: 'italic', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            📝 {noteText}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: 15, textAlign: 'center' }}>
                        {statusInfo ? (
                          <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 'bold', background: statusInfo.bg, color: statusInfo.color, whiteSpace: 'nowrap' }}>
                            {statusInfo.labelSi}
                          </span>
                        ) : <span style={{ fontSize: 11, color: '#94a3b8' }}>—</span>}
                      </td>

                      <td style={{ padding: 15, textAlign: 'right', color: '#dc2626', fontWeight: 'bold' }}>
                        {txn.type === 'purchase' ? formatCurrency(txn.amount) : '-'}
                      </td>

                      <td style={{ padding: 15, textAlign: 'right', fontWeight: 'bold' }}>
                        {txn.type === 'payment' ? <span style={{ color: '#16a34a' }}>{formatCurrency(txn.amount)}</span>
                          : txn.type === 'receipt' ? <span style={{ color: '#2563eb' }}>+ {formatCurrency(txn.amount)}</span>
                          : '-'}
                      </td>

                      <td style={{ padding: 15, textAlign: 'right', fontWeight: 'bold', color: txn.runningBalance > 0 ? '#dc2626' : '#16a34a' }}>
                        {formatCurrency(Math.abs(txn.runningBalance))}
                      </td>

                      <td style={{ padding: 10, textAlign: 'center' }} className="no-print">
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          {txn.receiptImages?.length > 0 && (
                            <button onClick={() => setViewRec(txn.receiptImages[0])} style={{ padding: '5px 8px', background: '#0369a1', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>👁️</button>
                          )}
                          <label style={{ padding: '5px 8px', background: uploadingId === txn._path ? '#94a3b8' : '#f59e0b', color: 'white', borderRadius: 4, cursor: uploadingId === txn._path ? 'wait' : 'pointer', fontSize: 12 }}>
                            {uploadingId === txn._path ? '⏳' : '📤'}
                            <input type="file" hidden accept="image/*" onChange={e => e.target.files[0] && handleUpload(txn, e.target.files[0])} disabled={uploadingId === txn._path} />
                          </label>
                        </div>
                      </td>

                      <td style={{ padding: 10, textAlign: 'center' }} className="no-print">
                        <button onClick={() => handleDelete(txn)} disabled={deletingId === txn._path} style={{ padding: '5px 8px', background: deletingId === txn._path ? '#94a3b8' : '#dc2626', color: 'white', border: 'none', borderRadius: 4, cursor: deletingId === txn._path ? 'wait' : 'pointer', fontSize: 12 }}>
                          {deletingId === txn._path ? '⏳' : '🗑️'}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded: Purchase */}
                    {expandedRows[txn.key] && txn.type === 'purchase' && (
                      <tr style={{ background: '#fef2f2' }}>
                        <td colSpan="8" style={{ padding: '15px 25px' }}>
                          <div style={{ background: 'white', borderRadius: 8, padding: 15, border: '2px solid #fca5a5', marginBottom: txn.items?.length > 0 ? 12 : 0 }}>
                            <h4 style={{ margin: '0 0 10px', color: '#dc2626' }}>📦 මිලදී ගැනීමේ විස්තර</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
                              {txn._rawData?.invoiceNo && <div style={{ padding: 10, background: '#f8fafc', borderRadius: 6 }}><div style={{ fontSize: 11, color: '#64748b' }}>Invoice No</div><b>{txn._rawData.invoiceNo}</b></div>}
                              {txn._rawData?.refNo && <div style={{ padding: 10, background: '#f8fafc', borderRadius: 6 }}><div style={{ fontSize: 11, color: '#64748b' }}>Ref No</div><b>{txn._rawData.refNo}</b></div>}
                              {statusInfo && (
                                <div style={{ padding: 10, background: statusInfo.bg, borderRadius: 6, border: `1px solid ${statusInfo.color}30` }}>
                                  <div style={{ fontSize: 11, color: '#64748b' }}>ගෙවීම් තත්ත්වය</div>
                                  <b style={{ color: statusInfo.color }}>{statusInfo.labelSi}</b>
                                </div>
                              )}
                              {toNum(txn._rawData?.paidAmount) > 0 && (
                                <div style={{ padding: 10, background: '#f0fdf4', borderRadius: 6, border: '1px solid #86efac' }}>
                                  <div style={{ fontSize: 11, color: '#16a34a' }}>ගෙවූ මුදල</div>
                                  <b style={{ color: '#16a34a' }}>{formatCurrency(txn._rawData.paidAmount)}</b>
                                </div>
                              )}
                              {toNum(txn._rawData?.balance) > 0 && (
                                <div style={{ padding: 10, background: '#fef2f2', borderRadius: 6, border: '1px solid #fca5a5' }}>
                                  <div style={{ fontSize: 11, color: '#dc2626' }}>ඉතිරි මුදල</div>
                                  <b style={{ color: '#dc2626' }}>{formatCurrency(txn._rawData.balance)}</b>
                                </div>
                              )}
                            </div>
                            {noteText && (
                              <div style={{ marginTop: 12, padding: 12, background: '#fef3c7', borderRadius: 8, borderLeft: '4px solid #f59e0b', fontSize: 14 }}>
                                <div style={{ fontSize: 11, color: '#92400e', fontWeight: 'bold', marginBottom: 4 }}>📝 සටහන</div>
                                <div style={{ color: '#78350f', lineHeight: 1.5 }}>{noteText}</div>
                              </div>
                            )}
                          </div>

                          {txn.items?.length > 0 && (
                            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                              <thead style={{ background: '#f1f5f9' }}>
                                <tr>
                                  <th style={{ padding: 10, textAlign: 'left', fontSize: 12 }}>#</th>
                                  <th style={{ padding: 10, textAlign: 'left', fontSize: 12 }}>භාණ්ඩය</th>
                                  <th style={{ padding: 10, textAlign: 'center', fontSize: 12 }}>ප්‍රමාණය</th>
                                  <th style={{ padding: 10, textAlign: 'right', fontSize: 12 }}>මිල</th>
                                  <th style={{ padding: 10, textAlign: 'right', fontSize: 12 }}>එකතුව</th>
                                </tr>
                              </thead>
                              <tbody>
                                {txn.items.map((it, j) => (
                                  <tr key={j} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: 10, fontSize: 12, color: '#64748b' }}>{j + 1}</td>
                                    <td style={{ padding: 10, fontSize: 13 }}>{it.name}</td>
                                    <td style={{ padding: 10, textAlign: 'center', fontWeight: 'bold' }}>{it.qty}</td>
                                    <td style={{ padding: 10, textAlign: 'right', fontSize: 13 }}>{formatCurrency(it.price)}</td>
                                    <td style={{ padding: 10, textAlign: 'right', fontWeight: 'bold', color: '#dc2626' }}>{formatCurrency(it.total)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}

                    {/* Expanded: Payment / Receipt */}
                    {expandedRows[txn.key] && (txn.type === 'payment' || txn.type === 'receipt') && (
                      <tr style={{ background: txn.type === 'receipt' ? '#eff6ff' : '#f0fdf4' }}>
                        <td colSpan="8" style={{ padding: '15px 25px' }}>
                          <div style={{ background: 'white', borderRadius: 8, padding: 15, border: `2px solid ${txn.type === 'receipt' ? '#93c5fd' : '#86efac'}` }}>
                            <h4 style={{ margin: '0 0 12px', color: txn.type === 'receipt' ? '#1d4ed8' : '#16a34a' }}>
                              {txn.type === 'receipt' ? '📥 ලැබීම් විස්තර' : '💵 ගෙවීම් විස්තර'}
                            </h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
                              {txn._paymentMethod && <div style={{ padding: 10, background: '#f8fafc', borderRadius: 6 }}><div style={{ fontSize: 11, color: '#64748b' }}>ක්‍රමය</div><b>{txn._paymentMethod === 'bank' ? '🏦 බැංකු' : txn._paymentMethod === 'cheque' ? '📝 චෙක්' : txn._paymentMethod === 'cash' ? '💵 මුදල්' : txn._paymentMethod.toUpperCase()}</b></div>}
                              {txn._bankName && <div style={{ padding: 10, background: '#f8fafc', borderRadius: 6 }}><div style={{ fontSize: 11, color: '#64748b' }}>බැංකුව</div><b>{txn._bankName}</b></div>}
                              {txn._reference && <div style={{ padding: 10, background: '#f8fafc', borderRadius: 6 }}><div style={{ fontSize: 11, color: '#64748b' }}>Reference</div><b>{txn._reference}</b></div>}
                              {txn._chequeNo && <div style={{ padding: 10, background: '#f8fafc', borderRadius: 6 }}><div style={{ fontSize: 11, color: '#64748b' }}>චෙක්</div><b>{txn._chequeNo}</b></div>}
                              {txn._transactionId && <div style={{ padding: 10, background: '#f8fafc', borderRadius: 6 }}><div style={{ fontSize: 11, color: '#64748b' }}>Txn ID</div><b>{txn._transactionId}</b></div>}
                            </div>
                            {txn._description && (
                              <div style={{ marginTop: 12, padding: 12, background: '#fef3c7', borderRadius: 8, borderLeft: '4px solid #f59e0b', fontSize: 14 }}>
                                <div style={{ fontSize: 11, color: '#92400e', fontWeight: 'bold', marginBottom: 4 }}>📝 සටහන</div>
                                <div style={{ color: '#78350f', lineHeight: 1.5 }}>{txn._description}</div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Receipt Modal */}
      {viewReceiptUrl && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }} onClick={() => setViewRec(null)}>
          <div style={{ background: 'white', padding: 20, borderRadius: 15, maxWidth: 600, width: '90%', textAlign: 'center', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setViewRec(null)} style={{ position: 'absolute', top: 10, right: 10, background: '#dc2626', color: 'white', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>✕</button>
            <img src={viewReceiptUrl} alt="Receipt" style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 10 }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 15, justifyContent: 'center' }}>
              <a href={viewReceiptUrl} target="_blank" rel="noreferrer" style={{ padding: '10px 20px', background: '#7c3aed', color: 'white', textDecoration: 'none', borderRadius: 6, fontWeight: 'bold' }}>🔍 විශාල</a>
              <a href={viewReceiptUrl} download="receipt.jpg" style={{ padding: '10px 20px', background: '#059669', color: 'white', textDecoration: 'none', borderRadius: 6, fontWeight: 'bold' }}>⬇️ Download</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}