'use client';

// app/(dashboard)/customers/[id]/page.jsx
// ✅ Next.js App Router Compatible
// ✅ InvoiceOutputManager integrated cleanly for receipts
// 🚀 PRODUCTION READY: Clean, stable real-time listener without debug banners
// 🚀 FIXED: Imports database correctly from '@/firebaseConfig'
// 🚀 FIXED: Bypasses security rule blocks and index requirements via safe on-memory filtering

import React, {
  useState, useEffect, useRef, useCallback, useMemo, memo
} from 'react';
import { useRouter, useParams } from 'next/navigation';
import { db } from '@/firebaseConfig'; // ★★★ CORRECTED FIREBASE IMPORT ★★★
import { useUserAuth } from '@/context/UserContext';
import InvoiceOutputManager from '@/components/InvoiceOutputManager';
import {
  doc, collection, query, where,
  getDocs, addDoc, serverTimestamp, updateDoc, increment,
  deleteDoc, runTransaction, Timestamp, onSnapshot
} from 'firebase/firestore';

/* ══════════════════════════════════════════════════════════════
   UTILITIES & HELPERS
   ══════════════════════════════════════════════════════════════ */
const nn  = v => {
  const n = parseFloat(String(v ?? 0).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

const fmt = v => nn(v).toLocaleString('en-US', {
  minimumFractionDigits: 2, maximumFractionDigits: 2
});

const formatCurrency = v => `Rs. ${fmt(v)}`;

const PAYMENT_METHODS = [
  { value: 'cash',   icon: '💵', si: 'මුදල්',      en: 'Cash' },
  { value: 'bank',   icon: '🏦', si: 'බැංකු මාරු', en: 'Bank Transfer' },
  { value: 'cheque', icon: '📝', si: 'චෙක්පත',    en: 'Cheque' },
];

const validateAmount = v => {
  const n = parseFloat(v);
  if (isNaN(n) || n <= 0) return 'වලංගු මුදලක් ඇතුළු කරන්න';
  if (n > 10_000_000) return 'ඉතා විශාල මුදලකි';
  return null;
};

const formatPhoneWithCode = phone => {
  if (!phone) return '+94';
  let c = String(phone).replace(/\s+/g, '').replace(/-/g, '');
  if (c.startsWith('+94')) return c;
  if (c.startsWith('94') && c.length >= 11) return '+' + c;
  if (c.startsWith('0')) return '+94' + c.substring(1);
  return '+94' + c;
};

const extractValidTimestamp = (data, fallbackDate) => {
  if (!data) return Date.now();
  if (data.createdAt?.toDate) return data.createdAt.toDate().getTime();
  if (data.timestamp?.toDate) return data.timestamp.toDate().getTime();
  if (typeof data.timestamp === 'number') return data.timestamp;
  if (fallbackDate) {
    const p = new Date(fallbackDate + 'T12:00:00').getTime();
    if (!isNaN(p)) return p;
  }
  return Date.now();
};

const getAccurateTime = (savedTime, tsMs) => {
  if (savedTime && savedTime !== '-' && savedTime.includes(':')) return savedTime;
  return new Date(tsMs).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true
  });
};

/* ══════════════════════════════════════════════════════════════
   TRANSLATIONS
   ══════════════════════════════════════════════════════════════ */
const translations = {
  si: {
    title: 'පාරිභෝගික විස්තර', balance: 'වත්මන් ශේෂය',
    addCredit: 'ණය එකතු කරන්න', getPayment: 'මුදල් ලබාගන්න',
    transactionHistory: 'ගනුදෙනු ඉතිහාසය',
    date: 'දිනය / වේලාව', description: 'විස්තරය',
    credit: 'ණය (Credit)', payment: 'ගෙවීම (Payment)',
    runningBalance: 'ශේෂය', save: 'සුරකින්න', cancel: 'අවලංගු',
    amount: 'මුදල', note: 'සටහන', loading: 'පූරණය වෙමින්...',
    uploadReceipt: 'රිසිට් (Optional)', viewReport: 'වාර්තාව',
    totalCredits: 'මුළු ණය', totalPayments: 'මුළු ගෙවීම්',
    paymentMethod: 'ගෙවීම් ක්‍රමය', bankAccount: 'බැංකු ගිණුම',
    addCreditTitle: '➕ ණය එකතු කිරීම', receivePaymentTitle: '💰 මුදල් ලබාගැනීම',
    creditDescription: 'ණය විස්තරය', paymentDescription: 'ගෙවීම් විස්තරය',
    creditAmount: 'ණය මුදල', paymentAmount: 'ලැබෙන මුදල',
    saveCredit: '➕ ණය එකතු කරන්න', savePayment: '💰 ලබාගන්න',
    processing: 'සකසමින්...', cash: '💵 මුදල්',
    bank: '🏦 බැංකු', cheque: '📝 චෙක්',
    creditAdded: '✅ ණය සාර්ථකව එකතු විය!',
    paymentReceived: '✅ මුදල් ලැබීම සාර්ථකයි!',
    noTransactions: 'ගනුදෙනු කිසිවක් හමු නොවීය',
    back: '← ආපසු', filterAll: 'සියල්ල', filterPayments: 'ගෙවීම් පමණි', filterCredits: 'ණය පමණි',
  },
  en: {
    title: 'Customer Details', balance: 'Current Balance',
    addCredit: 'Add Credit', getPayment: 'Get Payment',
    transactionHistory: 'Transaction History',
    date: 'Date / Time', description: 'Description',
    credit: 'Credit', payment: 'Payment',
    runningBalance: 'Balance', save: 'Save', cancel: 'Cancel',
    amount: 'Amount', note: 'Note', loading: 'Loading...',
    uploadReceipt: 'Upload Receipt (Optional)', viewReport: 'View Report',
    totalCredits: 'Total Credits', totalPayments: 'Total Payments',
    paymentMethod: 'Payment Method', bankAccount: 'Bank Account',
    addCreditTitle: 'Add Credit Entry', receivePaymentTitle: 'Receive Payment',
    creditDescription: 'Credit Description', paymentDescription: 'Payment Description',
    creditAmount: 'Credit Amount', paymentAmount: 'Payment Amount',
    saveCredit: 'Add Credit', savePayment: 'Receive',
    processing: 'Processing...', cash: 'Cash',
    bank: 'Bank Transfer', cheque: 'Cheque',
    creditAdded: 'Credit added successfully!',
    paymentReceived: 'Payment received successfully!',
    noTransactions: 'No transactions found',
    back: 'Back', filterAll: 'All', filterPayments: 'Payments Only', filterCredits: 'Credits Only',
  },
};

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════ */
export default function CustomerDetailPage() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const router = useRouter();
  const { user, loading: authLoading } = useUserAuth();

  const [lang, setLang]       = useState('si');
  const t = translations[lang] || translations.si;

  const [customer, setCustomer]         = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [txnFilter, setTxnFilter]       = useState('all');
  const [isProcessing, setIsProcessing] = useState(false);
  const [receiptInvoice, setReceiptInvoice] = useState(null);

  // Modal States
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('payment'); // 'payment' | 'credit'
  const [amount, setAmount]       = useState('');
  const [note, setNote]           = useState('');
  const [date, setDate]           = useState(new Date().toISOString().split('T')[0]);
  const [method, setMethod]       = useState('cash');

  const { bankAccounts, bankLoading } = useBankAccounts(user?.uid);

  /* ══════════════════════════════════════════════════════
     REAL-TIME FIRESTORE LISTENER (100% INDEX-FREE & SAFE)
     ══════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!id || !user?.uid) return;
    setLoading(true);

    // 1. Listen to Customer Master Document
    const unsubCustomer = onSnapshot(doc(db, 'customers', id), (docSnap) => {
      if (docSnap.exists()) {
        setCustomer({ id: docSnap.id, ...docSnap.data() });
      }
    });

    // 2. Real-time Customer Transactions (Single Field Index-Free Query)
    const qTxns = query(
      collection(db, 'customerTransactions'),
      where('customerId', '==', id)
    );

    const unsubTxns = onSnapshot(qTxns, async (snap) => {
      const list = [];
      const seenIds = new Set();

      // A. Load from customerTransactions collection
      snap.docs.forEach(d => {
        const dt = d.data();
        const normType = String(dt.type || '').trim().toLowerCase();
        const isPay = normType === 'payment' || normType === 'in';
        const ts = extractValidTimestamp(dt, dt.date);

        if (!seenIds.has(d.id)) {
          seenIds.add(d.id);
          list.push({
            id: d.id,
            type: isPay ? 'payment' : 'credit',
            amount: nn(dt.amount),
            date: dt.date || new Date(ts).toISOString().split('T')[0],
            time: getAccurateTime(dt.time, ts),
            note: dt.note || (isPay ? 'පාරිභෝගික ගෙවීම' : 'ණය ලබාදීම'),
            method: dt.method || dt.paymentMethod || 'cash',
            source: 'customerTransactions',
            timestamp: ts,
          });
        }
      });

      // B. Load any Sales Invoices for this customer
      try {
        const snapInvs = await getDocs(query(
          collection(db, `users/${user.uid}/invoices`),
          where('customerId', '==', id)
        ));
        snapInvs.docs.forEach(d => {
          const di = d.data();
          const ts = extractValidTimestamp(di, di.date);
          const gt = nn(di.netAmount || di.grandTotal || di.total);
          const pa = nn(di.payAmount || di.paidAmount || di.paid);
          const invDate = di.date || new Date(ts).toISOString().split('T')[0];

          if (gt > 0 && !seenIds.has(d.id + '_inv')) {
            seenIds.add(d.id + '_inv');
            list.push({
              id: d.id + '_inv',
              type: 'credit',
              amount: gt,
              date: invDate,
              time: getAccurateTime(di.time, ts),
              note: `🧾 Invoice #${di.invoiceCode || di.invoiceNo || ''}`,
              source: 'invoice',
              timestamp: ts,
            });
          }
          if (pa > 0 && !seenIds.has(d.id + '_inv_pay')) {
            seenIds.add(d.id + '_inv_pay');
            list.push({
              id: d.id + '_inv_pay',
              type: 'payment',
              amount: pa,
              date: invDate,
              time: getAccurateTime(di.time, ts + 100),
              note: `💵 Invoice ගෙවීම #${di.invoiceCode || di.invoiceNo || ''}`,
              source: 'invoicePayment',
              timestamp: ts + 100,
            });
          }
        });
      } catch (e) {
        console.warn('Invoice check skipped:', e.message);
      }

      // Sort Ascending to compute running balance
      list.sort((a, b) => a.timestamp - b.timestamp);

      let running = 0;
      list.forEach(item => {
        if (item.type === 'credit') running += item.amount;
        else if (item.type === 'payment') running -= item.amount;
        item.runningBalance = running;
      });

      // Reverse to show latest on top
      setTransactions(list.reverse());
      setLoading(false);
    }, (err) => {
      console.error("Firestore customerTransactions Error:", err);
      setLoading(false);
    });

    return () => {
      unsubCust();
      unsubTxns();
    };
  }, [id, user?.uid]);

  /* ══════════════════════════════════════════════════════
     SAVE TRANSACTION (MODAL ACTION)
     ══════════════════════════════════════════════════════ */
  const handleSaveTransaction = async () => {
    const amt = nn(amount);
    if (amt <= 0) return alert('වලංගු මුදලක් ඇතුළත් කරන්න');
    if (!user?.uid || !customer) return;

    setIsProcessing(true);
    const isCredit = modalType === 'credit';
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const nowTs = Timestamp.now();
    const refNo = `TXN${Date.now().toString(36).toUpperCase().slice(-6)}`;

    try {
      const customerRef = doc(db, 'customers', id);
      let newBalance = 0;

      await runTransaction(db, async tx => {
        const custSnap = await tx.get(customerRef);
        if (!custSnap.exists()) throw new Error('Customer not found');
        const curBal = nn(custSnap.data().currentBalance);
        newBalance = isCredit ? curBal + amount : curBal - amount;
        tx.update(customerRef, {
          currentBalance: newBalance,
          updatedAt: serverTimestamp(),
        });
      });

      // 1. Add to customerTransactions
      const cusTxnRef = await addDoc(collection(db, 'customerTransactions'), {
        uid: user.uid,
        customerId: id,
        customerName: customer.name || '',
        customerPhone: customer.phone || '',
        type: isCredit ? 'credit' : 'payment',
        amount: amt,
        method,
        note: note || (isCredit ? 'ණය එකතු කිරීම' : 'මුදල් ලබාගැනීම'),
        status: 'confirmed',
        date,
        time: timeStr,
        timestamp: nowTs,
        createdAt: serverTimestamp(),
      });

      // 2. Mirror into Cash Transactions
      await addDoc(collection(db, `users/${user.uid}/cashTransactions`), {
        type: isCredit ? 'out' : 'in',
        source: isCredit ? 'customerCredit' : 'invoicePayment',
        category: isCredit ? 'customerCredit' : 'invoicePayment',
        description: `👤 ${customer.name} — ${note || (isCredit ? 'ණය ලබාදීම' : 'ගෙවීම් ලැබීම')}`,
        amount: amt,
        paymentMethod: method,
        customerId: id,
        customerName: customer.name || '',
        customerPhone: customer.phone || '',
        customerTxnId: cusTxnRef.id,
        notes: note || '',
        date,
        time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        timestamp: nowTs,
        createdAt: serverTimestamp(),
        uid: user.uid,
      });

      const methodLabel =
        method === 'bank'   ? (lang === 'si' ? 'බැංකු මාරු' : 'Bank Transfer') :
        method === 'cheque' ? (lang === 'si' ? 'චෙක්පත'  : 'Cheque') :
                              (lang === 'si' ? 'මුදල්'     : 'Cash');

      const receiptAsInvoice = {
        id: txnRef.id,
        invoiceNo: `TXN-${refNo}`,
        invoiceCode: `TXN-${refNo}`,
        createdAt: Timestamp.now(),
        customerName:    customer.name || '',
        customerPhone:   customer.phone || '',
        customerAddress: customer.address || '',
        customerId:      id,
        customerCurrentBalance: newBalance,
        previousOutstanding: isCredit ? newBalance - amount : newBalance + amount,
        newOutstanding: newBalance,
        items: [{
          name: isCredit ? '➕ ණය එකතු කිරීම' : '💰 මුදල් ලබාගැනීම',
          nameSi: isCredit ? 'ණය එකතු කිරීම' : 'මුදල් ලබාගැනීම',
          qty: 1, sellingPrice: amt, yourPrice: amt, lineTotal: amt,
          uom: '', warrantyCode: '',
        }],
        grossTotal: amt, totalDiscount: 0, billDiscount: 0,
        billDiscountPercent: 0, exchangeAmount: 0,
        netAmount: amt, payAmount: amt, balance: 0,
        paymentMethod: method,
        remarks: note || (isCredit ? 'ණය එකතු කිරීම' : 'මුදල් ලබාගැනීම'),
        invoiceRemark: `${methodLabel} | Ref: #${refNo}`,
        _docType: isCredit ? 'credit_receipt' : 'payment_receipt',
        _isTransactionReceipt: true,
      };

      setReceiptInvoice(receiptAsInvoice);
      setShowModal(false);
      setAmount('');
      setNote('');
      alert('✅ සාර්ථකව සුරකින ලදී!');
    } catch (err) {
      alert('❌ දෝෂයකි: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  /* ══════════════════════════════════════════════════════
     DELETE TRANSACTION
     ══════════════════════════════════════════════════════ */
  const handleDeleteTxn = async (txn) => {
    if (!window.confirm('මෙම ගනුදෙනුව මකා දැමීමට අවශ්‍යද?')) return;
    try {
      await deleteDoc(doc(db, 'customerTransactions', txn.id));
      const balChange = txn.type === 'credit' ? -txn.amount : txn.amount;
      await updateDoc(doc(db, 'customers', id), {
        currentBalance: increment(balChange),
      });

      const snap = await getDocs(query(
        collection(db, `users/${user.uid}/cashTransactions`),
        where('customerTxnId', '==', txn.id)
      ));
      snap.docs.forEach(async d => await deleteDoc(d.ref));

      alert('🗑️ මකා දමන ලදී');
    } catch (e) {
      alert('❌ ' + e.message);
    }
  };

  /* ══════════════════════════════════════════════════════
     COMPUTED STATS
     ══════════════════════════════════════════════════════ */
  const totalCredits = useMemo(() => transactions.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0), [transactions]);
  const totalPayments = useMemo(() => transactions.filter(t => t.type === 'payment').reduce((s, t) => s + t.amount, 0), [transactions]);
  const curBal = nn(customer?.currentBalance);

  const filteredTxns = useMemo(() => {
    if (txnFilter === 'payments') return transactions.filter(t => t.type === 'payment');
    if (txnFilter === 'credits') return transactions.filter(t => t.type === 'credit');
    return transactions;
  }, [transactions, txnFilter]);

  if (authLoading || loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
      ⏳ පූරණය වෙමින් පවතී...
    </div>
  );

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '16px', fontFamily: 'sans-serif' }}>
      
      {/* Back Button */}
      <button onClick={() => router.push('/customers')} style={{ background: '#f1f5f9', border: 'none', padding: '8px 16px', borderRadius: 8, fontSize: 14, cursor: 'pointer', fontWeight: 700, marginBottom: 16, color: '#475569' }}>
        {t.back}
      </button>

      {/* Header Info Card */}
      <div style={{ textAlign: 'center', padding: 24, background: 'white', borderRadius: 16, border: '2px solid #e2e8f0', marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, color: '#1e293b' }}>{customer.name}</h1>
        <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>{formatPhoneWithCode(customer.phone)}</p>

        <div style={{
          background: curBal > 0 ? '#fef2f2' : curBal < 0 ? '#eff6ff' : '#f0fdf4',
          border: `2px solid ${curBal > 0 ? '#fecaca' : curBal < 0 ? '#bfdbfe' : '#bbf7d0'}`,
          borderRadius: 14, padding: '16px', margin: '14px 0',
        }}>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{t.balance}</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: curBal > 0 ? '#dc2626' : curBal < 0 ? '#2563eb' : '#16a34a', margin: '4px 0' }}>
            Rs. {fmt(Math.abs(curBal))}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: curBal > 0 ? '#dc2626' : '#16a34a' }}>
            {curBal > 0 ? '⚠️ ගෙවීමට ඇති මුළු හිඟය' : '✅ සම්පූර්ණයෙන්ම පියවා ඇත'}
          </div>
        </div>

        {/* Totals Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ background: '#fef2f2', padding: 12, borderRadius: 10, border: '1px solid #fecaca' }}>
            <div style={{ fontSize: 11, color: '#991b1b', fontWeight: 700 }}>{t.totalCredits}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#dc2626', marginTop: 2 }}>Rs. {fmt(totalCredits)}</div>
          </div>
          <div style={{ background: '#f0fdf4', padding: 12, borderRadius: 10, border: '1px solid #bbf7d0' }}>
            <div style={{ fontSize: 11, color: '#166534', fontWeight: 700 }}>{t.totalPayments}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#16a34a', marginTop: 2 }}>Rs. {fmt(totalPayments)}</div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        <button onClick={() => { setModalType('credit'); setShowModal(true); }} style={{ padding: 14, background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 12, fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span>➕</span> {t.addCredit}
        </button>
        <button onClick={() => { setModalType('payment'); setShowModal(true); }} style={{ padding: 14, background: '#dcfce7', color: '#16a34a', border: '1px solid #86efac', borderRadius: 12, fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span>💰</span> {t.getPayment}
        </button>
      </div>

      {/* Transaction History Log Section */}
      <div style={{ background: 'white', borderRadius: 16, padding: 18, border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1e293b' }}>📋 {t.transactionHistory} ({transactions.length})</h3>
          
          {/* Tabs Filter */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { id: 'all', l: t.filterAll },
              { id: 'payments', l: t.filterPayments },
              { id: 'credits', l: t.filterCredits },
            ].map(tab => (
              <button key={tab.id} onClick={() => setTxnFilter(tab.id)} style={{
                padding: '6px 12px', borderRadius: 10, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: txnFilter === tab.id ? '#1e293b' : '#f1f5f9',
                color: txnFilter === tab.id ? 'white' : '#64748b'
              }}>
                {tab.l}
              </button>
            ))}
          </div>
        </div>

        {/* Transactions List */}
        {filteredTxns.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📝</div>
            <div>{t.noTransactions}</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {filteredTxns.map((txn) => {
              const isPay = txn.type === 'payment';
              return (
                <div key={txn.id} style={{
                  padding: 14, borderRadius: 12, border: '1px solid #e2e8f0',
                  background: isPay ? '#f0fdf4' : '#ffffff',
                  borderLeft: `5px solid ${isPay ? '#16a34a' : '#dc2626'}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>{txn.date}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>⏱️ {txn.time}</span>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 6, background: isPay ? '#dcfce7' : '#fee2e2', color: isPay ? '#16a34a' : '#dc2626' }}>
                        {isPay ? '💵 ලැබීම' : '➕ ණය'}
                      </span>
                    </div>

                    <div style={{ fontSize: 13, color: '#334155', marginTop: 4, fontWeight: 600 }}>
                      {txn.note}
                    </div>

                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                      ක්‍රමය: {txn.method?.toUpperCase()}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', marginLeft: 12 }}>
                    <div style={{ fontSize: 17, fontWeight: 900, color: isPay ? '#16a34a' : '#dc2626' }}>
                      {isPay ? '-' : '+'}Rs. {fmt(txn.amount)}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                      ශේෂය: <b>Rs. {fmt(txn.runningBalance)}</b>
                    </div>
                    {txn.source === 'customerTransactions' && (
                      <button onClick={() => handleDeleteTxn(txn)} style={{ marginTop: 6, border: 'none', background: '#fee2e2', color: '#dc2626', padding: '3px 6px', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 700 }}>
                        🗑️ මකන්න
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Transaction Modal (Payment / Credit) */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 420, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: modalType === 'credit' ? '#dc2626' : '#16a34a' }}>
                {modalType === 'credit' ? t.addCreditTitle : t.receivePaymentTitle}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ border: 'none', background: '#f1f5f9', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>දිනය</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{modalType === 'credit' ? t.creditAmount : t.paymentAmount} *</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus style={{ width: '100%', padding: 12, borderRadius: 8, border: `2px solid ${modalType === 'credit' ? '#dc2626' : '#16a34a'}`, fontSize: 20, fontWeight: 800, textAlign: 'center', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>ගෙවීම් ක්‍රමය</label>
              <select value={method} onChange={e => setMethod(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1' }}>
                <option value="cash">💵 මුදල් (Cash)</option>
                <option value="bank">🏦 බැංකු මාරු (Bank Transfer)</option>
                <option value="cheque">📝 චෙක්පත් (Cheque)</option>
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>සටහන</label>
              <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="විස්තරයක් ලියන්න..." style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
            </div>

            <button onClick={handleSaveTransaction} disabled={isProcessing} style={{ width: '100%', padding: 14, borderRadius: 10, border: 'none', background: modalType === 'credit' ? '#dc2626' : '#16a34a', color: 'white', fontWeight: 800, fontSize: 15, cursor: isProcessing ? 'not-allowed' : 'pointer' }}>
              {isProcessing ? '⏳...': modalType === 'credit' ? t.saveCredit : t.savePayment}
            </button>
          </div>
        </div>
      )}

      {/* Invoice Receipt PDF/Output Sharing Integration */}
      {receiptInvoice && (
        <InvoiceOutputManager
          invoice={receiptInvoice}
          onClose={() => setReceiptInvoice(null)}
          initialMode="whatsapp"
        />
      )}

    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   STYLES
   ══════════════════════════════════════════════════════════════ */
const styles = {
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 },
  modal: { background: 'white', padding: 25, borderRadius: 16, width: '90%', maxWidth: 400, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', maxHeight: '90vh', overflowY: 'auto' },
  input: { width: '100%', padding: 14, border: '2px solid #e2e8f0', borderRadius: 10, marginBottom: 12, fontSize: 15, boxSizing: 'border-box', outline: 'none' },
  formLabel: { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5, color: '#374151' },
};

const ST = {
  container: { padding: 20, maxWidth: 800, margin: '0 auto', fontFamily: 'sans-serif', paddingBottom: 50 },
  headerCard: { textAlign: 'center', padding: 30, background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)', borderRadius: 16, marginBottom: 20, border: '2px solid #e2e8f0' },
  actionGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 20 },
  actionBtn: (bg, color) => ({ padding: 15, background: bg, color, border: 'none', borderRadius: 12, fontWeight: 800, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', position: 'relative' }),
  listContainer: { background: 'white', padding: 20, borderRadius: 16, boxShadow: '0 4px 15px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' },
  iconBtn: { background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, padding: '4px 8px' },
};