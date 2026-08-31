'use client';

// components/Customers.jsx  ·  v4
// ✅ Integrated with separate Customer Loan Management system
// ✅ Real InvoiceOutputManager import
// ✅ Fresh Firestore balance read
// ✅ Portal payment support + Loan Quick Status Link
// 🚀 FIXED: Profile picture upload with automatic compression & Telegraph cloud upload
// 🚀 FIXED: Mobile contacts integration (Contact Picker API) to select directly from Phone contacts

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { db } from '@/firebaseConfig';
import { useUserAuth } from '@/context/UserContext';
import {
  collection, query, where,
  addDoc, updateDoc, doc, getDocs, getDoc,
  serverTimestamp, increment, onSnapshot,
  Timestamp,
} from 'firebase/firestore';

// ✅ REAL InvoiceOutputManager
import InvoiceOutputManager from './InvoiceOutputManager';

/* ════════════════════════════════════════
   HELPERS
════════════════════════════════════════ */
const nn = (v) => {
  const n = parseFloat(String(v ?? 0).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

const fmt = (v) =>
  nn(v).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const pad2 = (n) => String(n).padStart(2, '0');

// ★★★ 24-hour format (HH:mm)
const nowHHMM24 = () => {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

// ★★★ Local date string (YYYY-MM-DD)
const localDateStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const slugify = (s) =>
  String(s || 'customer').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const makePortalKey = (name) =>
  `${slugify(name)}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* ════════════════════════════════════════
   CACHE
════════════════════════════════════════ */
const CACHE_TTL = 5 * 60 * 1000;

const saveCache = (uid, list) => {
  try {
    sessionStorage.setItem(`customers_${uid}`, JSON.stringify({ data: list, ts: Date.now() }));
  } catch {}
};

const loadCache = (uid) => {
  try {
    const raw = sessionStorage.getItem(`customers_${uid}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    return Date.now() - ts > CACHE_TTL ? null : data;
  } catch { return null; }
};

const clearCache = (uid) => {
  try { sessionStorage.removeItem(`customers_${uid}`); } catch {}
};

/* ════════════════════════════════════════
   TRANSLATIONS
════════════════════════════════════════ */
const T = {
  si: {
    title: 'පාරිභෝගිකයින්', addNew: 'නව පාරිභෝගිකයෙක්', refresh: '🔄 Refresh',
    search: 'නම / දුරකථනය සොයන්න...', showCredit: 'ණය ඇති අය පමණක්',
    name: 'නම', mobile: 'දුරකථන', address: 'ලිපිනය', balance: 'ශේෂය', action: 'ක්‍රියා',
    loading: 'පූරණය වෙමින්...', noData: 'පාරිභෝගිකයින් හමු නොවීය',
    save: 'සුරකින්න', cancel: 'අවලංගු කරන්න', adding: 'එකතු කරමින්...',
    success: 'සාර්ථකව ඇතුළත් කරන ලදී!', loginRequired: 'කරුණාකර පළමුව ලොග් වන්න',
    totalReceivables: 'ලබාගත යුතු මුළු හිඟ මුදල', settled: 'පියවා ඇත',
    totalCustomers: 'මුළු පාරිභෝගිකයින්', creditCustomers: 'ණය ඇති',
    settledCustomers: 'පියවා ඇති', showing: 'පෙන්වන්නේ', of: 'න්',
    sortBalHigh: 'ශේෂය (වැඩි→අඩු)', sortBalLow: 'ශේෂය (අඩු→වැඩි)',
    sortNameAZ: 'නම (අ-ඔ)', sortNameZA: 'නම (ඔ-අ)',
    perPage: 'පිටුවට', prev: 'පෙර', next: 'ඊළඟ', page: 'පිටුව',
    receivePayment: 'මුදල් ලබාගැනීම', amountReceived: 'ලැබෙන මුදල',
    paymentMethod: 'ගෙවීම් ක්‍රමය', receiveNow: 'ලබාගන්න',
    paymentNote: 'ගෙවීම් සටහන (Optional)',
    overpaid: 'අතිරේක ගෙවීම', lastUpdated: 'අවසන් update',
    offlineMsg: '⚠️ Offline — Cache data', quotaMsg: '⚠️ Quota exceeded',
    addCreditTitle: 'ණය ඇතුළු කිරීම', creditAmount: 'ණය මුදල',
    creditNote: 'ණය විස්තරය (Optional)', addCredit: 'ණය ඇතුළු කරන්න',
    newBalance: 'නව ශේෂය', currentBalance: 'වත්මන් ශේෂය',
    creditInfoMsg: 'Cash Management හි "ණය (OUT)" ලෙස පෙනෙනු ඇත.',
    paymentInfoMsg: 'Cash & Bank Register හි "ලැබීම (IN)" ලෙස ස්වයංක්‍රීයව සටහන් වේ.',
    fetchingBalance: 'Balance ලබාගනිමින්...',
    activeLoan: '💰 සක්‍රීය ණයක් ඇත',
    importContact: '📱 Contacts වලින් ගන්න',
    contactPickerError: '❌ Contacts ලබාගැනීමට නොහැකි විය.',
    contactPickerNotSupported: '⚠️ ඔබගේ දුරකථනය මෙම පහසුකම සපයන්නේ නැත.',
  },
  en: {
    title: 'Customers', addNew: 'New Customer', refresh: '🔄 Refresh',
    search: 'Search Name / Mobile...', showCredit: 'Credit Only',
    name: 'Name', mobile: 'Mobile', address: 'Address', balance: 'Balance', action: 'Action',
    loading: 'Loading...', noData: 'No customers found',
    save: 'Save', cancel: 'Cancel', adding: 'Adding...',
    success: 'Customer added!', loginRequired: 'Please login first',
    totalReceivables: 'Total Receivables', settled: 'Settled',
    totalCustomers: 'Total Customers', creditCustomers: 'Credit',
    settledCustomers: 'Settled', showing: 'Showing', of: 'of',
    sortBalHigh: 'Balance (High→Low)', sortBalLow: 'Balance (Low→High)',
    sortNameAZ: 'Name (A-Z)', sortNameZA: 'Name (Z-A)',
    perPage: 'Per Page', prev: 'Prev', next: 'Next', page: 'Page',
    receivePayment: 'Receive Payment', amountReceived: 'Amount Received',
    paymentMethod: 'Payment Method', receiveNow: 'Receive Now',
    paymentNote: 'Payment Note (Optional)',
    overpaid: 'Overpaid', lastUpdated: 'Last updated',
    offlineMsg: '⚠️ Offline — Cache data', quotaMsg: '⚠️ Quota exceeded',
    addCreditTitle: 'Add Credit Entry', creditAmount: 'Credit Amount',
    creditNote: 'Credit Description (Optional)', addCredit: 'Add Credit',
    newBalance: 'New Balance', currentBalance: 'Current Balance',
    creditInfoMsg: 'Will appear as "Credit (OUT)" in Cash Management.',
    paymentInfoMsg: 'Automatically recorded as "Cash In" in Cash & Bank Register.',
    fetchingBalance: 'Fetching balance...',
    activeLoan: '💰 Active Loan Exist',
    importContact: '📱 From Phone Contacts',
    contactPickerError: '❌ Could not retrieve contacts.',
    contactPickerNotSupported: '⚠️ Contact picker is not supported on this device.',
  },
};

/* ════════════════════════════════════════
   PAYMENT MODAL
════════════════════════════════════════ */
function PaymentModal({ customer, onClose, onSuccess, t, user }) {
  const [amount,      setAmount     ] = useState('');
  const [method,      setMethod     ] = useState('cash');
  const [note,        setNote       ] = useState('');
  const [saving,      setSaving     ] = useState(false);
  const [freshBal,    setFreshBal   ] = useState(null);
  const [fetchingBal, setFetchingBal] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setFetchingBal(true);
      try {
        const snap = await getDoc(doc(db, 'customers', customer.id));
        if (!active) return;
        if (snap.exists()) {
          const bal = nn(snap.data().currentBalance);
          setFreshBal(bal);
          if (bal > 0) setAmount(bal.toFixed(2));
        } else {
          setFreshBal(nn(customer.currentBalance));
        }
      } catch (e) {
        console.error('Fresh balance error:', e);
        const bal = nn(customer.currentBalance);
        setFreshBal(bal);
        if (bal > 0) setAmount(bal.toFixed(2));
      } finally {
        if (active) setFetchingBal(false);
      }
    })();
    return () => { active = false; };
  }, []); // eslint-disable-line

  const currentBal = freshBal !== null ? freshBal : nn(customer?.currentBalance);

  const handleSave = async () => {
    const payAmt = nn(amount);
    if (payAmt <= 0) return alert(t.amountReceived);
    if (fetchingBal) return alert('Balance loading...');
    if (!user?.uid) return alert(t.loginRequired);

    const prevBal = currentBal;
    const newBal  = prevBal - payAmt;

    setSaving(true);
    try {
      const refNo    = `PAY${Date.now().toString(36).toUpperCase().slice(-8)}`;
      const dateStr  = localDateStr();
      const timeStr  = nowHHMM24();
      const nowTs    = Timestamp.now();
      const now      = new Date();

      /* ── 1. Customer transaction record ── */
      const cusTxnRef = await addDoc(collection(db, 'customerTransactions'), {
        uid: user.uid,
        customerId: customer.id,
        customerName: customer.name || '',
        customerPhone: customer.phone || '',
        type: 'payment',
        amount: payAmt,
        method,
        note: note || '',
        status: 'confirmed',
        refNo,
        createdAt: serverTimestamp(),
        timestamp: nowTs,
        date: dateStr,
        time: timeStr,
      });

      /* ── 2. Update customer outstanding balance ── */
      await updateDoc(doc(db, 'customers', customer.id), {
        currentBalance: increment(-payAmt),
        lastPaymentAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      /* ── 3. Cash & Bank Register Sync ── */
      await addDoc(collection(db, `users/${user.uid}/cashTransactions`), {
        type: 'in',
        source: 'invoicePayment',
        category: 'invoicePayment',
        description: `💵 පාරිභෝගික ගෙවීම් ලැබීම [${customer.name || 'Customer'}]${note ? ' | ' + note : ''}`,
        amount: payAmt,
        paymentMethod: method,
        customerId: customer.id,
        customerName: customer.name || '',
        customerPhone: customer.phone || '',
        customerTxnId: cusTxnRef.id,
        reference: refNo,
        notes: note || '',
        note: note || '',
        previousOutstanding: prevBal,
        newOutstanding: newBal,
        date: dateStr,
        time: timeStr,
        timestamp: nowTs,
        createdAt: serverTimestamp(),
        createdBy: user?.email || '',
        uid: user.uid,
        isAutomatic: true,
      });

      /* ── 4. Bank Sync (optional) ── */
      if (method === 'bank' && customer.defaultBankAccountId) {
        try {
          await addDoc(collection(db, `users/${user.uid}/bankTransactions`), {
            type: 'deposit',
            source: 'invoicePayment',
            category: 'invoicePayment',
            accountId: customer.defaultBankAccountId,
            amount: payAmt,
            description: `පාරිභෝගික ගෙවීම — ${customer.name}`,
            reference: refNo,
            date: nowTs,
            createdAt: serverTimestamp(),
          });
          await updateDoc(doc(db, `users/${user.uid}/bankAccounts`, customer.defaultBankAccountId), {
            currentBalance: increment(payAmt),
            liveBalance: increment(payAmt),
            updatedAt: serverTimestamp(),
          });
        } catch (bankErr) {
          console.warn('Bank sync skipped:', bankErr.message);
        }
      }

      const methodMap = { cash: 'cash', bank: 'etransfer', card: 'card', cheque: 'cheque', online: 'etransfer' };

      const synthetic = {
        _isReceipt:   true,
        _receiptType: 'payment',

        id:          `payment-${refNo}`,
        invoiceNo:   refNo,
        invoiceCode: `PAY-${refNo}`,

        customerId:      customer.id      || '',
        customerName:    customer.name    || '',
        customerPhone:   customer.phone   || '',
        customerAddress: customer.address || '',

        items: [{
          name: 'ගෙවීම් රිසිට්පත', nameSi: 'ගෙවීම',
          qty: 1, sellingPrice: payAmt, yourPrice: payAmt,
          lineTotal: payAmt, uom: 'unit', warrantyCode: '',
        }],

        grossTotal: payAmt, totalDiscount: 0, billDiscount: 0,
        billDiscountPercent: 0, exchangeAmount: 0,
        netAmount: payAmt, payAmount: payAmt, balance: 0,
        paymentMethod: methodMap[method] || 'cash',
        remarks: note || '', invoiceRemark: note || '',

        previousOutstanding:    prevBal,
        newOutstanding:         newBal,
        customerCurrentBalance: newBal,

        createdAt: { toDate: () => now },
        date: dateStr, status: 'completed', type: 'receipt',
        _collection: 'customerTransactions',
      };

      onSuccess(synthetic);
    } catch (e) {
      console.error('Payment error:', e);
      alert(`❌ ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={S.overlay}>
      <div style={{ ...S.modal, maxWidth: 440 }}>
        <div style={S.modalHead}>
          <h3 style={{ margin: 0, color: '#16a34a' }}>💰 {t.receivePayment}</h3>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <div style={{ padding: '10px 0 20px' }}>

          <div style={{ marginBottom: 16, padding: 14, background: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {customer.profilePicture ? (
                <img src={customer.profilePicture} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} alt="" />
              ) : (
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 18 }}>
                  {(customer.name || '?')[0]}
                </div>
              )}
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{customer.name}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{customer.phone}</div>
              </div>
            </div>
            <div style={{ marginTop: 10, padding: '8px 12px', background: 'white', borderRadius: 8, border: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#166534', fontWeight: 700 }}>{t.currentBalance}:</span>
              {fetchingBal ? (
                <span style={{ fontSize: 14, color: '#64748b', fontStyle: 'italic' }}>⏳ {t.fetchingBalance}</span>
              ) : (
                <span style={{ fontSize: 20, fontWeight: 900, color: '#dc2626' }}>Rs.{fmt(currentBal)}</span>
              )}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>{t.amountReceived} *</label>
            <input
              type="number" autoFocus placeholder="0.00"
              value={amount} onChange={(e) => setAmount(e.target.value)}
              style={{ ...S.input, fontSize: 24, fontWeight: 'bold', color: '#16a34a', textAlign: 'center', padding: 16 }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {currentBal > 0 && (
                <button onClick={() => setAmount(currentBal.toFixed(2))} style={S.quickBtn}>
                  ✅ Full Rs.{fmt(currentBal)}
                </button>
              )}
              {[1000, 5000, 10000].map(a => (
                <button key={a} onClick={() => setAmount(a.toString())} style={S.quickBtn}>
                  Rs.{a.toLocaleString()}
                </button>
              ))}
            </div>
            {nn(amount) > 0 && (
              <div style={{ marginTop: 8, padding: '8px 12px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>{t.newBalance}:</span>
                <span style={{ fontWeight: 800, color: '#16a34a', fontSize: 16 }}>
                  Rs.{fmt(currentBal - nn(amount))}
                </span>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>{t.paymentMethod}</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
              {[
                { v: 'cash',   i: '💵', l: 'Cash'   },
                { v: 'card',   i: '💳', l: 'Card'   },
                { v: 'bank',   i: '🏦', l: 'Bank'   },
                { v: 'cheque', i: '🧾', l: 'Cheque' },
              ].map(m => (
                <button key={m.v} onClick={() => setMethod(m.v)} style={{
                  padding: '10px 6px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  border:     method === m.v ? '2px solid #16a34a' : '2px solid #e2e8f0',
                  background: method === m.v ? '#f0fdf4' : 'white',
                  color:      method === m.v ? '#16a34a' : '#64748b',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                  <span style={{ fontSize: 18 }}>{m.i}</span><span>{m.l}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>{t.paymentNote}</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
              style={S.input} placeholder="ගෙවීම් විස්තරය..." />
          </div>

          <div style={{ marginBottom: 16, padding: '10px 14px', background: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe', fontSize: 12, color: '#1e40af' }}>
            ℹ️ {t.paymentInfoMsg}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={S.cancelBtn}>{t.cancel}</button>
            <button onClick={handleSave} disabled={saving || nn(amount) <= 0 || fetchingBal}
              style={{ ...S.saveBtn, opacity: (saving || nn(amount) <= 0 || fetchingBal) ? 0.6 : 1 }}>
              {saving ? '⏳ සුරකිමින්...' : fetchingBal ? '⏳...' : `💰 ${t.receiveNow}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   CREDIT MODAL
════════════════════════════════════════ */
function CreditModal({ customer, onClose, onSuccess, t, user }) {
  const [amount,      setAmount     ] = useState('');
  const [note,        setNote       ] = useState('');
  const [saving,      setSaving     ] = useState(false);
  const [freshBal,    setFreshBal   ] = useState(null);
  const [fetchingBal, setFetchingBal] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setFetchingBal(true);
      try {
        const snap = await getDoc(doc(db, 'customers', customer.id));
        if (!active) return;
        setFreshBal(snap.exists() ? nn(snap.data().currentBalance) : nn(customer.currentBalance));
      } catch {
        setFreshBal(nn(customer.currentBalance));
      } finally {
        if (active) setFetchingBal(false);
      }
    })();
    return () => { active = false; };
  }, []); // eslint-disable-line

  const currentBal = freshBal !== null ? freshBal : nn(customer?.currentBalance);

  const handleSave = async () => {
    const creditAmt = nn(amount);
    if (creditAmt <= 0) return alert('Enter valid amount');
    if (fetchingBal) return alert('Balance loading...');
    if (!user?.uid) return alert(t.loginRequired);

    const prevBal = currentBal;
    const newBal  = prevBal + creditAmt;

    setSaving(true);
    try {
      const refNo   = `CRD${Date.now().toString(36).toUpperCase().slice(-8)}`;
      const dateStr = localDateStr();
      const timeStr = nowHHMM24();
      const nowTs   = Timestamp.now();
      const now     = new Date();

      /* ── 1. Customer transaction record ── */
      const cusTxnRef = await addDoc(collection(db, 'customerTransactions'), {
        uid: user.uid,
        customerId: customer.id,
        customerName: customer.name || '',
        customerPhone: customer.phone || '',
        type: 'credit',
        amount: creditAmt,
        note: note || t.addCreditTitle,
        status: 'confirmed',
        source: 'manual_credit',
        refNo,
        createdAt: serverTimestamp(),
        timestamp: nowTs,
        date: dateStr,
        time: timeStr,
        createdBy: user.email || 'Unknown',
      });

      /* ── 2. Update balance ── */
      await updateDoc(doc(db, 'customers', customer.id), {
        currentBalance: increment(creditAmt),
        updatedAt: serverTimestamp(),
      });

      /* ── 3. Cash Register sync (type: 'out') ── */
      await addDoc(collection(db, `users/${user.uid}/cashTransactions`), {
        type: 'out',
        source: 'customerCredit',
        category: 'customerCredit',
        description: `👤 ${customer.name || 'Customer'} — ණය ලබාදීම${note ? ' | ' + note : ''}`,
        amount: creditAmt,
        paymentMethod: 'credit',
        customerId: customer.id,
        customerName: customer.name || '',
        customerPhone: customer.phone || '',
        customerTxnId: cusTxnRef.id,
        reference: refNo,
        notes: note || '',
        note: note || '',
        previousOutstanding: prevBal,
        newOutstanding: newBal,
        date: dateStr,
        time: timeStr,
        timestamp: nowTs,
        createdAt: serverTimestamp(),
        createdBy: user?.email || '',
        uid: user.uid,
        isAutomatic: true,
      });

      const synthetic = {
        _isReceipt:   true,
        _receiptType: 'credit',

        id:          `credit-${refNo}`,
        invoiceNo:   refNo,
        invoiceCode: `CRD-${refNo}`,

        customerId:      customer.id      || '',
        customerName:    customer.name    || '',
        customerPhone:   customer.phone   || '',
        customerAddress: customer.address || '',

        items: [{
          name: 'ණය ඇතුළු කිරීම', nameSi: 'ණය',
          qty: 1, sellingPrice: creditAmt, yourPrice: creditAmt,
          lineTotal: creditAmt, uom: 'unit', warrantyCode: '',
        }],

        grossTotal: creditAmt, totalDiscount: 0, billDiscount: 0,
        billDiscountPercent: 0, exchangeAmount: 0,
        netAmount: creditAmt, payAmount: 0, balance: -creditAmt,
        paymentMethod: 'credit',
        remarks: note || '', invoiceRemark: note || '',

        previousOutstanding:    prevBal,
        newOutstanding:         newBal,
        customerCurrentBalance: newBal,

        createdAt: { toDate: () => now },
        date: dateStr, status: 'completed', type: 'receipt',
        _collection: 'customerTransactions',
      };

      onSuccess(synthetic);
    } catch (e) {
      console.error('Credit error:', e);
      alert(`❌ ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={S.overlay}>
      <div style={{ ...S.modal, maxWidth: 420 }}>
        <div style={S.modalHead}>
          <h3 style={{ margin: 0, color: '#dc2626' }}>➕ {t.addCreditTitle}</h3>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <div style={{ padding: '10px 0 20px' }}>

          <div style={{ marginBottom: 16, padding: 14, background: '#fef2f2', borderRadius: 12, border: '1px solid #fecaca' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {customer.profilePicture ? (
                <img src={customer.profilePicture} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} alt="" />
              ) : (
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 18 }}>
                  {(customer.name || '?')[0]}
                </div>
              )}
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{customer.name}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{customer.phone}</div>
              </div>
            </div>
            <div style={{ marginTop: 10, padding: '8px 12px', background: 'white', borderRadius: 8, border: '1px solid #fecaca', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#991b1b', fontWeight: 700 }}>{t.currentBalance}:</span>
              {fetchingBal ? (
                <span style={{ fontSize: 14, color: '#64748b', fontStyle: 'italic' }}>⏳ {t.fetchingBalance}</span>
              ) : (
                <span style={{ fontSize: 18, fontWeight: 900, color: currentBal < -0.01 ? '#2563eb' : '#dc2626' }}>
                  {currentBal < 0 ? `-Rs.${fmt(Math.abs(currentBal))}` : `Rs.${fmt(currentBal)}`}
                </span>
              )}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>{t.creditAmount} *</label>
            <input
              type="number" autoFocus placeholder="0.00"
              value={amount} onChange={(e) => setAmount(e.target.value)}
              style={{ ...S.input, fontSize: 24, fontWeight: 'bold', color: '#dc2626', textAlign: 'center', padding: 16 }}
            />
            {nn(amount) > 0 && (
              <div style={{ marginTop: 8, padding: '8px 12px', background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>{t.newBalance}:</span>
                <span style={{ fontWeight: 800, color: '#dc2626', fontSize: 16 }}>
                  Rs.{fmt(currentBal + nn(amount))}
                </span>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={S.label}>{t.creditNote}</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
              style={S.input} placeholder="භාණ්ඩ / සේවා විස්තරය..." />
          </div>

          <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fffbeb', borderRadius: 10, border: '1px solid #fde68a', fontSize: 12, color: '#92400e' }}>
            ℹ️ {t.creditInfoMsg}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={S.cancelBtn}>{t.cancel}</button>
            <button onClick={handleSave} disabled={saving || nn(amount) <= 0 || fetchingBal}
              style={{ ...S.saveBtn, background: 'linear-gradient(135deg,#dc2626,#b91c1c)', opacity: (saving || nn(amount) <= 0 || fetchingBal) ? 0.6 : 1 }}>
              {saving ? '⏳ සුරකිමින්...' : fetchingBal ? '⏳...' : `➕ ${t.addCredit}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ★ Smart Image Compressor & Telegraph Cloud Upload helper specifically for Customers Page
const handleAddLogoUpload = (e, setNewCust, showToast) => {
  const file = e.target.files?.[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    showToast('❌ Image එක විශාල වැඩියි. (Max: 5MB)');
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 150; 
      const MAX_HEIGHT = 150;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          const formData = new FormData();
          formData.append('file', blob, 'customer_avatar.jpg');
          
          const res = await fetch('https://telegra.ph/upload', {
            method: 'POST',
            body: formData,
          });
          
          if (!res.ok) throw new Error('Cloud storage failed');
          const data = await res.json();
          
          if (Array.isArray(data) && data[0]?.src) {
            const cloudUrl = `https://telegra.ph${data[0].src}`;
            setNewCust(prev => ({ ...prev, profilePicture: cloudUrl }));
            showToast('✅ Profile Photo එක සාර්ථකව සකසා ගත්තා!');
          }
        } catch {
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
          setNewCust(prev => ({ ...prev, profilePicture: compressedBase64 }));
          showToast('⚠️ Cloud upload අසාර්ථකයි. Base64 ලෙස එක් විය.');
        }
      }, 'image/jpeg', 0.8);
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
};

/* ════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════ */
export default function Customers({ lang = 'si' }) {
  const t = T[lang] || T.si;
  const { user, loading: authLoading } = useUserAuth();

  const [customers,      setCustomers    ] = useState([]);
  const [activeLoans,    setActiveLoans  ] = useState([]);
  const [loading,        setLoading      ] = useState(true);
  const [lastFetchTs,    setLastFetchTs  ] = useState(0);
  const [fetchErrMsg,    setFetchErrMsg  ] = useState('');
  const [searchTerm,     setSearchTerm   ] = useState('');
  const [showCreditOnly, setShowCreditOnly] = useState(false);
  const [sortBy,         setSortBy       ] = useState('balHigh');
  const [viewMode,       setViewMode     ] = useState('table');
  const [page,           setPage         ] = useState(1);
  const [perPage,        setPerPage      ] = useState(25);

  const [showAddModal,  setShowAddModal ] = useState(false);
  const [newCust,       setNewCust      ] = useState({ name: '', phone: '', address: '', email: '', nic: '', notes: '', profilePicture: '' });
  const [phoneSuffix,   setPhoneSuffix  ] = useState('');
  const [isSaving,      setIsSaving     ] = useState(false);

  const [paymentCust,   setPaymentCust  ] = useState(null);
  const [creditCust,    setCreditCust   ] = useState(null);

  const [outputInvoice, setOutputInvoice] = useState(null);
  const [toastMsg,      setToastMsg     ] = useState('');

  const showToast = useCallback((m)=>{setToastMsg(m);setTimeout(()=>setToastMsg(''),3000);},[]);

  /* ── Fetch customers ── */
  const fetchCustomers = useCallback(async (force = false) => {
    if (!user?.uid) { setCustomers([]); setLoading(false); return; }
    setFetchErrMsg('');

    if (!force) {
      const cached = loadCache(user.uid);
      if (cached?.length) {
        setCustomers(cached.map(c => ({ ...c, currentBalance: nn(c.currentBalance) })));
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'customers'), where('uid', '==', user.uid)));
      const list = snap.docs.map(d => ({
        id: d.id, ...d.data(),
        currentBalance: nn(d.data().currentBalance),
      }));
      list.sort((a, b) => nn(b.currentBalance) - nn(a.currentBalance));
      setCustomers(list);
      setLastFetchTs(Date.now());
      saveCache(user.uid, list);
    } catch (e) {
      console.error(e);
      const cached = loadCache(user.uid);
      if (cached?.length) {
        setCustomers(cached.map(c => ({ ...c, currentBalance: nn(c.currentBalance) })));
        setFetchErrMsg(e.code === 'resource-exhausted' ? t.quotaMsg : t.offlineMsg);
      }
    } finally {
      setLoading(false);
    }
  }, [user?.uid, t.quotaMsg, t.offlineMsg]);

  /* ── Realtime Sync: Active Loans ── */
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, `users/${user.uid}/customerLoans`),
      where('status', '==', 'active')
    );
    const unsub = onSnapshot(q,
      snap => setActiveLoans(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err  => console.warn('Loans listener:', err.message)
    );
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => { if (!authLoading) fetchCustomers(); }, [authLoading, fetchCustomers]);

  /* ── Add customer ── */
  const handleAdd = async (e) => {
    if (e) e.preventDefault();
    if (!newCust.name || !phoneSuffix) return alert('Name + Phone required');
    if (!user) return alert(t.loginRequired);
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'customers'), {
        name: newCust.name, phone: `+94${phoneSuffix}`,
        address: newCust.address || '', email: newCust.email || '',
        nic: newCust.nic || '', notes: newCust.notes || '',
        profilePicture: newCust.profilePicture || '',
        uid: user.uid, currentBalance: 0,
        portalAccessKey: makePortalKey(newCust.name),
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      showToast(t.success);
      setShowAddModal(false);
      setNewCust({ name: '', phone: '', address: '', email: '', nic: '', notes: '', profilePicture: '' });
      setPhoneSuffix('');
      clearCache(user.uid);
      fetchCustomers(true);
    } catch (err) { alert('Error: ' + err.message); }
    finally { setIsSaving(false); }
  };

  /* ── Contact Picker Integration ── */
  const handleImportContact = async () => {
    const isSupported = ('contacts' in navigator && 'ContactsManager' in window);
    if (!isSupported) {
      showToast(t.contactPickerNotSupported);
      return;
    }

    try {
      const props = ['name', 'tel'];
      const opts = { multiple: false };
      const contacts = await navigator.contacts.select(props, opts);
      
      if (contacts && contacts.length > 0) {
        const contact = contacts[0];
        const rawName = contact.name?.[0] || '';
        const rawTel = contact.tel?.[0] || '';

        // Extract 9-digit suffix from raw phone number
        let cleanTel = rawTel.replace(/\D/g, ''); // Keep only digits
        if (cleanTel.startsWith('94') && cleanTel.length === 11) {
          cleanTel = cleanTel.substring(2);
        } else if (cleanTel.startsWith('0') && cleanTel.length === 10) {
          cleanTel = cleanTel.substring(1);
        } else if (cleanTel.length > 9) {
          cleanTel = cleanTel.slice(-9);
        }

        setNewCust(prev => ({ ...prev, name: rawName }));
        setPhoneSuffix(cleanTel);
        showToast('✅ Contact එක සාර්ථකව ඇතුළත් කළා!');
      }
    } catch (err) {
      console.error(err);
      showToast(t.contactPickerError);
    }
  };

  /* ── Active Loan finder ── */
  const getCustomerActiveLoan = useCallback((phone) => {
    if (!phone) return null;
    const cleanPhone = phone.replace(/\s+/g, '');
    return activeLoans.find(loan => {
      const loanPhone = (loan.customerPhone || '').replace(/\s+/g, '');
      if (!loanPhone) return false;
      return loanPhone.includes(cleanPhone) || cleanPhone.includes(loanPhone);
    });
  }, [activeLoans]);

  /* ── Stats ── */
  const stats = useMemo(() => ({
    total:      customers.length,
    totalRec:   customers.reduce((s, c) => s + Math.max(0, nn(c.currentBalance)), 0),
    creditCnt:  customers.filter(c => nn(c.currentBalance) > 0.01).length,
    settledCnt: customers.filter(c => Math.abs(nn(c.currentBalance)) <= 0.01).length,
  }), [customers]);

  /* ── Filter + sort ── */
  const filtered = useMemo(() => {
    const words = searchTerm.toLowerCase().trim().split(/\s+/).filter(Boolean);
    let res = customers.filter(c => {
      const hay = [c.name, c.phone, c.address, c.email, c.nic].filter(Boolean).join(' ').toLowerCase();
      return (words.length === 0 || words.every(w => hay.includes(w))) &&
             (!showCreditOnly || nn(c.currentBalance) > 0);
    });
    if (sortBy === 'nameAZ')  res = [...res].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (sortBy === 'nameZA')  res = [...res].sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    if (sortBy === 'balHigh') res = [...res].sort((a, b) => nn(b.currentBalance) - nn(a.currentBalance));
    if (sortBy === 'balLow')  res = [...res].sort((a, b) => nn(a.currentBalance) - nn(b.currentBalance));
    return res;
  }, [customers, searchTerm, showCreditOnly, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = useMemo(() => filtered.slice((page - 1) * perPage, page * perPage), [filtered, page, perPage]);
  useEffect(() => { setPage(1); }, [searchTerm, showCreditOnly, sortBy, perPage]);

  const BalBadge = ({ bal }) => {
    const b = nn(bal);
    if (b > 0.01)  return <div style={{ fontWeight: 800, color: '#dc2626', fontSize: 16 }}>Rs.{fmt(b)}</div>;
    if (b < -0.01) return <div style={{ fontWeight: 800, color: '#2563eb', fontSize: 14 }}>-Rs.{fmt(Math.abs(b))} <span style={{ fontSize: 10, background: '#eff6ff', color: '#2563eb', padding: '1px 5px', borderRadius: 8 }}>💰 {t.overpaid}</span></div>;
    return <div style={{ fontWeight: 600, color: '#16a34a', fontSize: 13, background: '#dcfce7', padding: '4px 12px', borderRadius: 20, display: 'inline-block' }}>✅ {t.settled}</div>;
  };

  if (authLoading || loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 18, fontWeight: 600 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 40, height: 40, border: '4px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto 12px' }} />
      {t.loading}
    </div>
  );

  return (
    <div style={S.container}>
      {toastMsg && (
        <div style={{ position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', background:'#1e293b', color:'#fff', padding:'10px 20px', borderRadius:10, zIndex:10002, fontWeight:700, fontSize:14, boxShadow:'0 4px 20px rgba(0,0,0,0.4)', whiteSpace:'nowrap' }}>{toastMsg}</div>
      )}

      {/* Invoice Receipt Output */}
      {outputInvoice && (
        <InvoiceOutputManager
          invoice={outputInvoice}
          initialMode="whatsapp"
          onClose={() => setOutputInvoice(null)}
        />
      )}

      {/* Payment Modal */}
      {paymentCust && (
        <PaymentModal
          customer={paymentCust} t={t} user={user}
          onClose={() => setPaymentCust(null)}
          onSuccess={(synthetic) => {
            setPaymentCust(null);
            setOutputInvoice(synthetic);
            clearCache(user.uid);
            fetchCustomers(true);
          }}
        />
      )}

      {/* Credit Modal */}
      {creditCust && (
        <CreditModal
          customer={creditCust} t={t} user={user}
          onClose={() => setCreditCust(null)}
          onSuccess={(synthetic) => {
            setCreditCust(null);
            setOutputInvoice(synthetic);
            clearCache(user.uid);
            fetchCustomers(true);
          }}
        />
      )}

      {/* Header */}
      <div style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 28 }}>👥</span>
          <div>
            <h2 style={S.title}>{t.title}</h2>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>{stats.total} {t.totalCustomers}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => fetchCustomers(true)} disabled={loading}
            style={{ padding: '10px 16px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
            {t.refresh}
          </button>
          <button onClick={() => setShowAddModal(true)} style={S.addBtn}>➕ {t.addNew}</button>
        </div>
      </div>

      {fetchErrMsg && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde068', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#92400e', fontWeight: 600 }}>
          {fetchErrMsg}
        </div>
      )}

      {lastFetchTs > 0 && (
        <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'right', marginBottom: 8 }}>
          ⏱️ {t.lastUpdated}: {new Date(lastFetchTs).toLocaleTimeString()}
        </div>
      )}

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { bg: 'linear-gradient(135deg,#fef2f2,#fee2e2)', bc: '#fca5a5', tc: '#991b1b', vc: '#dc2626', icon: '💸', label: t.totalReceivables, value: `Rs.${fmt(stats.totalRec)}` },
          { bg: 'linear-gradient(135deg,#eff6ff,#dbeafe)', bc: '#93c5fd', tc: '#1e40af', vc: '#2563eb', icon: '👥', label: t.totalCustomers,    value: stats.total },
          { bg: 'linear-gradient(135deg,#fff7ed,#fed7aa)', bc: '#fdba74', tc: '#9a3412', vc: '#ea580c', icon: '⚠️', label: t.creditCustomers,   value: stats.creditCnt },
          { bg: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', bc: '#86efac', tc: '#166534', vc: '#16a34a', icon: '✅', label: t.settledCustomers,  value: stats.settledCnt },
        ].map((s, i) => (
          <div key={i} style={{ padding: '14px 16px', borderRadius: 14, background: s.bg, border: `2px solid ${s.bc}` }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: s.tc }}>{s.icon} {s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: s.vc, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center', background: '#f8fafc', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <div style={{ position: 'relative', flex: 2, minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
          <input type="text" placeholder={t.search} value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ padding: '11px 32px 11px 38px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box', background: 'white' }} />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#94a3b8' }}>✕</button>
          )}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', background: showCreditOnly ? '#fef2f2' : 'white', padding: '8px 14px', borderRadius: 10, border: `2px solid ${showCreditOnly ? '#dc2626' : '#e2e8f0'}`, userSelect: 'none' }}>
          <input type="checkbox" checked={showCreditOnly} onChange={e => setShowCreditOnly(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#dc2626' }} />
          <span style={{ color: showCreditOnly ? '#dc2626' : '#475569', fontWeight: showCreditOnly ? 700 : 500 }}>💳 {t.showCredit}</span>
        </label>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ padding: '10px 12px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 13, outline: 'none', background: 'white', cursor: 'pointer' }}>
          <option value="balHigh">📉 {t.sortBalHigh}</option>
          <option value="balLow">📈 {t.sortBalLow}</option>
          <option value="nameAZ">🔤 {t.sortNameAZ}</option>
          <option value="nameZA">🔤 {t.sortNameZA}</option>
        </select>
        <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 8, padding: 3 }}>
          {[{ v: 'table', i: '📋' }, { v: 'cards', i: '🃏' }].map(m => (
            <button key={m.v} onClick={() => setViewMode(m.v)}
              style={{ width: 36, height: 36, border: 'none', borderRadius: 6, background: viewMode === m.v ? 'white' : 'transparent', cursor: 'pointer', fontSize: 16, boxShadow: viewMode === m.v ? '0 1px 3px rgba(0,0,0,.1)' : 'none' }}>
              {m.i}
            </button>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600, marginBottom: 12 }}>
        {t.showing} {paged.length} {t.of} {filtered.length}
      </div>

      {/* TABLE VIEW */}
      {viewMode === 'table' && (
        <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['#', '', t.name, t.mobile, t.address, t.balance, t.action].map((h, i) => (
                  <th key={i} style={{ padding: '14px 12px', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: i === 5 ? 'right' : 'left' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr><td colSpan="7" style={{ padding: 50, textAlign: 'center', color: '#94a3b8' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                  <div>{t.noData}</div>
                </td></tr>
              ) : paged.map((cus, idx) => {
                const activeLoan = getCustomerActiveLoan(cus.phone);
                return (
                  <tr key={cus.id}
                    style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={S.td}>{(page - 1) * perPage + idx + 1}</td>
                    <td style={S.td}>
                      {cus.profilePicture ? (
                        <img src={cus.profilePicture} style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', border: '2px solid #e2e8f0' }} alt="" />
                      ) : (
                        <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'white', fontSize: 16 }}>
                          {(cus.name || '?')[0].toUpperCase()}
                        </div>
                      )}
                    </td>
                    <td style={{ ...S.td, cursor: 'pointer' }} onClick={() => window.location.href = `/customers/${cus.id}`}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, color: '#1e293b', fontSize: 15 }}>{cus.name}</span>
                        {activeLoan && (
                          <span 
                            onClick={(e) => { e.stopPropagation(); window.location.href = '/loans'; }}
                            style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac', padding: '2px 6px', borderRadius: 6, fontSize: 10, fontWeight: 800, cursor: 'pointer' }}
                            title={`Remaining: Rs.${fmt(activeLoan.remainingBalance)}`}
                          >
                            {t.activeLoan}
                          </span>
                        )}
                      </div>
                      {cus.email && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>📧 {cus.email}</div>}
                    </td>
                    <td style={S.td}>{cus.phone || '-'}</td>
                    <td style={S.td}>{cus.address || '-'}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}><BalBadge bal={cus.currentBalance} /></td>
                    <td style={{ ...S.td, textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                        <button
                          onClick={e => { e.stopPropagation(); setCreditCust(cus); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', whiteSpace: 'nowrap' }}>
                          ➕ {t.addCreditTitle}
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setPaymentCust(cus); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: '#dcfce7', color: '#16a34a', border: '1px solid #86efac', whiteSpace: 'nowrap' }}>
                          💰 {t.receivePayment}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* CARDS VIEW */}
      {viewMode === 'cards' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 12 }}>
          {paged.length === 0 ? (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 50, color: '#94a3b8' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div><div>{t.noData}</div>
            </div>
          ) : paged.map(cus => {
            const activeLoan = getCustomerActiveLoan(cus.phone);
            return (
              <div key={cus.id} style={{ background: 'white', borderRadius: 14, padding: 16, border: '1px solid #e2e8f0', borderLeft: `5px solid ${nn(cus.currentBalance) > 0.01 ? '#dc2626' : nn(cus.currentBalance) < -0.01 ? '#2563eb' : '#16a34a'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, cursor: 'pointer' }}
                  onClick={() => window.location.href = `/customers/${cus.id}`}>
                  {cus.profilePicture ? (
                    <img src={cus.profilePicture} style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} alt="" />
                  ) : (
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'white', fontSize: 20 }}>
                      {(cus.name || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cus.name}</div>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{cus.phone || '-'}</div>
                  </div>
                  <BalBadge bal={cus.currentBalance} />
                </div>
                
                {activeLoan && (
                  <div 
                    onClick={() => window.location.href = '/loans'}
                    style={{ marginBottom: 10, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, fontSize: 11, fontWeight: 700, color: '#16a34a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                  >
                    <span>💸 {t.activeLoan} ({activeLoan.collectionMethod?.toUpperCase() || '-'})</span>
                    <span>Rs.{fmt(activeLoan.remainingBalance)} ➡️</span>
                  </div>
                )}

                {cus.address && <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>📍 {cus.address}</div>}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={e => { e.stopPropagation(); setCreditCust(cus); }}
                    style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>
                    ➕ {t.addCreditTitle}
                  </button>
                  <button onClick={e => { e.stopPropagation(); setPaymentCust(cus); }}
                    style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #86efac', background: '#dcfce7', color: '#16a34a', fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>
                    💰 {t.receivePayment}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '14px 16px', background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>{t.perPage}:</span>
            <select value={perPage} onChange={e => setPerPage(Number(e.target.value))}
              style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}>
              {[10, 25, 50, 100].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', opacity: page === 1 ? 0.4 : 1 }}>
              ◀ {t.prev}
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', opacity: page === totalPages ? 0.4 : 1 }}>
              {t.next} ▶
            </button>
          </div>
          <span style={{ fontSize: 12, color: '#64748b' }}>{t.page} {page} / {totalPages}</span>
        </div>
      )}

      {/* Add Customer Modal */}
      {showAddModal && (
        <div style={S.overlay}>
          <div style={S.modal}>
            <div style={S.modalHead}>
              <h3 style={{ margin: 0, fontSize: 18 }}>👤 {t.addNew}</h3>
              <button onClick={() => setShowAddModal(false)} style={S.closeBtn}>✕</button>
            </div>
            
            {/* profilePicture drag/select upload field inside Add Customer modal */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ position: 'relative', width: 85, height: 85 }}>
                {newCust.profilePicture ? (
                  <img src={newCust.profilePicture} style={{ width: 85, height: 85, borderRadius: '50%', objectFit: 'cover', border: '3px solid #3b82f6' }} alt="" />
                ) : (
                  <div style={{ width: 85, height: 85, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: '#94a3b8', border: '1px solid #cbd5e1' }}>👤</div>
                )}
                {newCust.profilePicture && (
                  <button 
                    type="button" 
                    onClick={() => setNewCust(p => ({ ...p, profilePicture: '' }))} 
                    style={{ position: 'absolute', top: 0, right: 0, background: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 11, fontWeight: 'bold' }}
                  >
                    ✕
                  </button>
                )}
              </div>
              <input 
                type="file" 
                accept="image/*" 
                id="add-profile-pic-input" 
                style={{ display: 'none' }} 
                onChange={(e) => handleAddLogoUpload(e, setNewCust, showToast)} 
              />
              <button 
                type="button" 
                onClick={() => document.getElementById('add-profile-pic-input').click()} 
                style={{ padding: '6px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#475569' }}
              >
                📷 Photo එකක් තෝරන්න (Select Image)
              </button>
            </div>

            <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              
              {/* Import Contacts from Phonebook Button */}
              <button 
                type="button" 
                onClick={handleImportContact} 
                style={{ width: '100%', padding: '12px', borderRadius: 10, background: '#f0f9ff', border: '2px solid #bfdbfe', color: '#0369a1', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                {t.importContact}
              </button>

              <div>
                <label style={S.label}>{t.name} *</label>
                <input style={S.input} value={newCust.name}
                  onChange={e => setNewCust({ ...newCust, name: e.target.value })}
                  required autoFocus placeholder={t.name} />
              </div>
              <div>
                <label style={S.label}>{t.mobile} *</label>
                <div style={{ display: 'flex', alignItems: 'center', border: '2px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', background: 'white' }}>
                  <span style={{ padding: '10px 12px', background: '#f1f5f9', fontWeight: 'bold', color: '#475569', fontSize: 14, borderRight: '2px solid #e2e8f0' }}>+94</span>
                  <input style={{ ...S.input, border: 'none', borderRadius: 0, paddingLeft: 8 }} type="tel"
                    value={phoneSuffix} onChange={e => setPhoneSuffix(e.target.value.replace(/\D/g, ''))}
                    placeholder="771234567" required maxLength={9} />
                </div>
              </div>
              <div>
                <label style={S.label}>{t.address}</label>
                <textarea style={{ ...S.input, height: 60, resize: 'vertical' }}
                  value={newCust.address} onChange={e => setNewCust({ ...newCust, address: e.target.value })}
                  placeholder={t.address} />
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button type="button" onClick={() => setShowAddModal(false)} style={S.cancelBtn}>{t.cancel}</button>
                <button type="submit" disabled={isSaving} style={{ ...S.saveBtn, opacity: isSaving ? 0.6 : 1 }}>
                  {isSaving ? `⏳ ${t.adding}` : `💾 ${t.save}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════
   STYLES
════════════════════════════════════════ */
const S = {
  container: { padding: 20, maxWidth: 1400, margin: '0 auto', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' },
  header:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  title:     { margin: 0, color: '#1e293b', fontSize: 24, fontWeight: 800 },
  addBtn:    { padding: '10px 20px', background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14, boxShadow: '0 4px 12px rgba(59,130,246,0.3)', whiteSpace: 'nowrap' },
  td:        { padding: '12px 12px', color: '#334155', verticalAlign: 'middle' },
  overlay:   { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  modal:     { background: 'white', padding: 28, borderRadius: 20, width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' },
  modalHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 14, borderBottom: '2px solid #f1f5f9' },
  closeBtn:  { background: '#f1f5f9', border: 'none', width: 34, height: 34, borderRadius: '50%', fontSize: 16, cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' },
  input:     { width: '100%', padding: 12, borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', outline: 'none' },
  label:     { display: 'block', marginBottom: 5, fontWeight: 700, fontSize: 13, color: '#475569' },
  cancelBtn: { flex: 1, padding: 13, background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14 },
  saveBtn:   { flex: 1, padding: 13, background: 'linear-gradient(135deg,#10b981,#059669)', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14 },
  quickBtn:  { flex: 1, padding: '6px 4px', borderRadius: 8, border: '1px solid #86efac', background: '#f0fdf4', color: '#16a34a', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
};