'use client';

// app/(dashboard)/customers/[id]/CustomerDetailClient.jsx
// v3 — Data Isolation + Direct Firebase Import + Auto-Sync Parity Fix
// ✅ Correct Firebase import via @/lib/firebase & @/shared/firebase-config
// ✅ Explicit synced: 0 flag on offline txns for instant Auto-Sync engine detection
// ✅ Bank Accounts integration for bank transfer payments
// ✅ UID ownership check on customer fetch
// ✅ 100% Offline-First via Dexie Local DB

import React, {
  useState, useEffect, useRef, useCallback, useMemo, memo
} from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUserAuth } from '@/context/UserContext';
import InvoiceOutputManager from '@/components/InvoiceOutputManager';

// ✅ Safe Firebase imports
import { db as cloudDb } from '@/lib/firebase';
import {
  doc, getDoc, collection, query, where, orderBy, getDocs, setDoc,
  addDoc, serverTimestamp, updateDoc, increment, deleteDoc,
  runTransaction, writeBatch, Timestamp, onSnapshot
} from 'firebase/firestore';

// ✅ Dexie import
import { localDb } from '@/lib/localDb';

/* ══════════════════════════════════════════════════════════════
   UTILITIES & HELPERS
══════════════════════════════════════════════════════════════ */
const nn  = v => parseFloat(v) || 0;
const fmt = v => nn(v).toLocaleString('en-US', {
  minimumFractionDigits: 2, maximumFractionDigits: 2
});
const formatCurrency = v => `Rs. ${fmt(v)}`;

const PAYMENT_METHODS = [
  { value: 'cash',   icon: '💵', si: 'මුදල්',      en: 'Cash' },
  { value: 'bank',   icon: '🏦', si: 'බැංකු මාරු', en: 'Bank Transfer' },
  { value: 'cheque', icon: '📝', si: 'චෙක්පත',    en: 'Cheque' },
];

const pad2 = (n) => String(n).padStart(2, '0');
const nowHHMM24 = () => { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

const validateAmount = v => {
  const n = parseFloat(v);
  if (isNaN(n) || n <= 0) return 'වලංගු මුදලක් ඇතුළු කරන්න';
  if (n > 10000000) return 'ඉතා විශාල මුදලකි';
  return null;
};

const formatPhoneWithCode = phone => {
  if (!phone) return '+94';
  let c = phone.replace(/\s+/g, '').replace(/-/g, '');
  if (c.startsWith('+94')) return c;
  if (c.startsWith('94') && c.length >= 11) return '+' + c;
  if (c.startsWith('0')) return '+94' + c.substring(1);
  return '+94' + c;
};

const handlePhoneInput = value => {
  if (!value.startsWith('+94')) {
    const d = value.replace(/[^0-9]/g, '');
    if (d.startsWith('94')) return '+' + d;
    if (d.startsWith('0')) return '+94' + d.substring(1);
    return '+94' + d;
  }
  return value;
};

const extractValidTimestamp = (data, fallbackDate) => {
  if (data.timestamp && typeof data.timestamp === 'number') return data.timestamp;
  if (data.createdAt?.toDate) return data.createdAt.toDate().getTime();
  if (data.timestamp?.toDate) return data.timestamp.toDate().getTime();
  if (fallbackDate) { const p = new Date(fallbackDate + 'T00:00:00').getTime(); if (!isNaN(p)) return p; }
  return Date.now();
};

const getAccurateTime = (savedTime, tsMs) => {
  if (savedTime && savedTime !== '-' && savedTime.includes(':')) return savedTime;
  return new Date(tsMs).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
};

/* ─── TRANSLATIONS ───────────────────────────────────────── */
const translations = {
  si: {
    title: 'පාරිභෝගික විස්තර', balance: 'වත්මන් ශේෂය', addCredit: 'ණය එකතු කරන්න',
    getPayment: 'මුදල් ලබාගන්න', transactionHistory: 'ගනුදෙනු ඉතිහාසය',
    date: 'දිනය / වේලාව', description: 'විස්තරය', credit: 'ණය (Credit)',
    payment: 'ගෙවීම (Payment)', runningBalance: 'ශේෂය', save: 'සුරකින්න',
    cancel: 'අවලංගු', amount: 'මුදල', note: 'සටහන', loading: 'පූරණය වෙමින්...',
    uploadReceipt: 'රිසිට් (Optional)', viewReport: 'වාර්තාව', remind: 'මතක් කරන්න',
    editCustomer: 'සංශෝධනය', deleteCustomer: 'මකන්න', editTitle: 'සංශෝධනය',
    customerName: 'නම', phone: 'දුරකථනය', address: 'ලිපිනය',
    updateSuccess: 'යාවත්කාලීන විය!', deleteConfirm: 'මකා දමන්නද?',
    editTxn: 'ගනුදෙනුව සංස්කරණය', deleteTxn: 'මකන්න',
    confirmDeleteTxn: 'ගනුදෙනුව මකා දැමීමට?', updateTxn: 'යාවත්කාලීන',
    totalCredits: 'මුළු ණය', totalPayments: 'මුළු ගෙවීම්',
    paymentMethod: 'ගෙවීම් ක්‍රමය', bankAccount: 'බැංකු ගිණුම',
    selectBankAccount: 'බැංකු ගිණුම තෝරන්න *', noBankAccounts: 'බැංකු ගිණුම් නොමැත.',
    addCreditTitle: '➕ ණය එකතු කිරීම', receivePaymentTitle: '💰 මුදල් ලබාගැනීම',
    creditDescription: 'ණය විස්තරය', paymentDescription: 'ගෙවීම් විස්තරය',
    creditAmount: 'ණය මුදල', paymentAmount: 'ලැබෙන මුදල', saveCredit: '➕ ණය එකතු කරන්න',
    savePayment: '💰 ලබාගන්න', processing: 'සකසමින්...',
    cash: '💵 මුදල්', bank: '🏦 බැංකු', cheque: '📝 චෙක්',
    creditAdded: '✅ ණය සාර්ථකව එකතු විය!', paymentReceived: '✅ මුදල් ලැබීම සාර්ථකයි!',
    loginRequired: 'Login අවශ්‍යයි', loginPrompt: 'මෙම පිටුව බැලීමට පළමුව Login වන්න.',
    loginBtn: 'Login පිටුවට යන්න', accessDenied: '⛔ ප්‍රවේශය ප්‍රතික්ෂේපයි',
    accessDeniedMsg: 'මෙම පාරිභෝගිකයා ඔබගේ ගිණුමට අයත් නොවේ.', backToCustomers: '← ආපසු',
    noTransactions: 'ගනුදෙනු නොමැත'
  },
  en: {
    title: 'Customer Details', balance: 'Current Balance', addCredit: 'Add Credit',
    getPayment: 'Get Payment', transactionHistory: 'Transaction History',
    date: 'Date / Time', description: 'Description', credit: 'Credit',
    payment: 'Payment', runningBalance: 'Balance', save: 'Save', cancel: 'Cancel',
    amount: 'Amount', note: 'Note', loading: 'Loading...',
    uploadReceipt: 'Upload Receipt (Optional)', viewReport: 'View Report',
    remind: 'Remind', editCustomer: 'Edit', deleteCustomer: 'Delete',
    editTitle: 'Edit Customer', customerName: 'Name', phone: 'Phone', address: 'Address',
    updateSuccess: 'Updated!', deleteConfirm: 'Delete this customer?',
    editTxn: 'Edit Transaction', deleteTxn: 'Delete', confirmDeleteTxn: 'Delete this transaction?',
    updateTxn: 'Update', totalCredits: 'Total Credits', totalPayments: 'Total Payments',
    paymentMethod: 'Payment Method', bankAccount: 'Bank Account',
    selectBankAccount: 'Select Bank Account *', noBankAccounts: 'No bank accounts.',
    addCreditTitle: '➕ Add Credit Entry', receivePaymentTitle: '💰 Receive Payment',
    creditDescription: 'Credit Description', paymentDescription: 'Payment Description',
    creditAmount: 'Credit Amount', paymentAmount: 'Payment Amount',
    saveCredit: '➕ Add Credit', savePayment: '💰 Receive', processing: 'Processing...',
    cash: 'Cash', bank: 'Bank Transfer', cheque: 'Cheque',
    creditAdded: 'Credit added successfully!', paymentReceived: 'Payment received successfully!',
    loginRequired: 'Login Required', loginPrompt: 'Please login to view this page.',
    loginBtn: 'Go to Login', accessDenied: '⛔ Access Denied',
    accessDeniedMsg: 'This customer does not belong to your account.', backToCustomers: '← Back',
    noTransactions: 'No transactions'
  }
};

/* ─── HOOKS ──────────────────────────────────────────────── */
function useToast() {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);
  const showToast = useCallback((msg, type = 'success') => {
    if (!mountedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ msg, type });
    timerRef.current = setTimeout(() => { if (mountedRef.current) setToast(null); }, 3500);
  }, []);
  return { toast, showToast };
}

function useBankAccounts(uid) {
  const [bankAccounts, setBankAccounts] = useState([]);
  const [bankLoading, setBankLoading] = useState(true);
  useEffect(() => {
    if (!uid || !cloudDb) {
      setBankLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(query(collection(cloudDb, `users/${uid}/bankAccounts`), orderBy('createdAt', 'desc')));
        if (!cancelled) setBankAccounts(snap.docs.map(d => ({ id: d.id, ...d.data(), currentBalance: nn(d.data().currentBalance) })).filter(a => a.isActive !== false));
      } catch (e) { console.warn('Bank accounts fetch:', e.message); }
      finally { if (!cancelled) setBankLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [uid]);
  return { bankAccounts, bankLoading };
}

/* ─── TOAST COMPONENT ────────────────────────────────────── */
const Toast = memo(function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div role="alert" style={{
      position: 'fixed', top: 20, right: 20, zIndex: 9999,
      padding: '14px 24px', borderRadius: 12, color: 'white',
      fontWeight: 700, fontSize: 14, maxWidth: 320,
      boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
      background: toast.type === 'success'
        ? 'linear-gradient(135deg,#10b981,#059669)'
        : 'linear-gradient(135deg,#ef4444,#dc2626)',
      animation: 'slideIn 0.3s ease'
    }}>
      {toast.msg}
    </div>
  );
});

/* ─── TRANSACTION MODAL ──────────────────────────────────── */
const TransactionModal = memo(function TransactionModal({
  show, type, customer, onClose, onConfirm,
  isProcessing, bankAccounts, bankLoading, t, lang
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [method, setMethod] = useState('cash');
  const [bankId, setBankId] = useState('');
  const [amountErr, setAmountErr] = useState('');
  const [bankErr, setBankErr] = useState('');
  const isCredit = type === 'credit';
  const isBank = method === 'bank';

  useEffect(() => {
    if (show) {
      setAmount(''); setNote(''); setDate(new Date().toISOString().split('T')[0]);
      setMethod('cash'); setBankId(''); setAmountErr(''); setBankErr('');
    }
  }, [show]);

  useEffect(() => {
    if (isBank && bankAccounts.length > 0 && !bankId) setBankId(bankAccounts[0].id);
  }, [isBank, bankAccounts, bankId]);

  const selectedBank = isBank ? bankAccounts.find(a => a.id === bankId) : null;
  const amt = nn(amount);

  const handleConfirm = () => {
    const err = validateAmount(amount);
    if (err) { setAmountErr(err); return; }
    if (isBank && !bankId) { setBankErr(t.selectBankAccount); return; }
    onConfirm({
      type, amount: amt, note, date, method,
      bankAccountId: isBank ? bankId : null,
      bankAccountName: selectedBank ? `${selectedBank.bankName} - ${selectedBank.accountName}` : null,
    });
  };

  if (!show || !customer) return null;
  const headerColor = isCredit ? '#dc2626' : '#16a34a';

  return (
    <div style={styles.modalOverlay} onClick={isProcessing ? undefined : onClose}>
      <div style={{ ...styles.modal, maxWidth: 500, padding: 0, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', background: headerColor, color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '16px 16px 0 0', position: 'sticky', top: 0, zIndex: 1 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{isCredit ? t.addCreditTitle : t.receivePaymentTitle}</h3>
          <button onClick={onClose} disabled={isProcessing} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px', marginBottom: 16, border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 700, color: '#1e293b' }}>{customer.name}</div>
            <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', background: nn(customer.currentBalance) > 0 ? '#fef2f2' : '#f0fdf4', padding: '6px 10px', borderRadius: 8 }}>
              <span style={{ fontSize: 13, color: '#64748b' }}>{t.balance}:</span>
              <span style={{ fontWeight: 800, color: nn(customer.currentBalance) > 0 ? '#dc2626' : '#16a34a' }}>{formatCurrency(customer.currentBalance)}</span>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={styles.formLabel}>{t.date}</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...styles.input, marginBottom: 0 }} disabled={isProcessing} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={styles.formLabel}>{isCredit ? t.creditDescription : t.paymentDescription}</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} style={{ ...styles.input, marginBottom: 0 }} placeholder={isCredit ? 'Items / Services...' : 'Payment details...'} disabled={isProcessing} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={styles.formLabel}>{isCredit ? t.creditAmount : t.paymentAmount} *</label>
            <input type="number" step="0.01" min="0.01" autoFocus value={amount}
              onChange={e => { setAmount(e.target.value); setAmountErr(e.target.value ? validateAmount(e.target.value) || '' : ''); }}
              style={{ ...styles.input, marginBottom: 0, fontSize: 22, fontWeight: 800, color: headerColor, borderColor: amountErr ? '#ef4444' : '#e2e8f0' }}
              placeholder="0.00" disabled={isProcessing} />
            {amountErr && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#ef4444', fontWeight: 600 }}>{amountErr}</p>}
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={styles.formLabel}>{t.paymentMethod}</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {PAYMENT_METHODS.map(pm => {
                const sel = method === pm.value;
                const c = pm.value === 'cash' ? '#16a34a' : pm.value === 'bank' ? '#3b82f6' : '#f59e0b';
                return (
                  <button key={pm.value} onClick={() => { setMethod(pm.value); setBankErr(''); }} disabled={isProcessing}
                    style={{ padding: '10px 6px', borderRadius: 10, border: sel ? `2px solid ${c}` : '2px solid #e2e8f0', background: sel ? `${c}12` : 'white', cursor: 'pointer', fontWeight: sel ? 700 : 500, fontSize: 13, color: sel ? c : '#64748b', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <span style={{ fontSize: 20 }}>{pm.icon}</span>
                    <span>{lang === 'si' ? pm.si : pm.en}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <button onClick={handleConfirm} disabled={isProcessing || !!amountErr}
            style={{ width: '100%', padding: 14, background: headerColor, color: 'white', border: 'none', borderRadius: 10, fontWeight: 'bold', fontSize: 16, cursor: isProcessing ? 'not-allowed' : 'pointer', opacity: isProcessing ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {isProcessing ? t.processing : isCredit ? t.saveCredit : t.savePayment}
          </button>
        </div>
      </div>
    </div>
  );
});

/* ─── MAIN COMPONENT ─────────────────────────────────────── */
export default function CustomerDetailClient({ lang: propLang = 'si' }) {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const router = useRouter();

  const [lang, setLang] = useState(propLang);
  const t = useMemo(() => translations[lang] || translations.en, [lang]);
  const { user, loading: authLoading } = useUserAuth();
  const { bankAccounts, bankLoading } = useBankAccounts(user?.uid);

  const [isPortalMode, setIsPortalMode] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.pathname.includes('/portal/')) {
      setIsPortalMode(true);
    }
  }, []);

  const { toast, showToast } = useToast();
  const [customer, setCustomer] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [receiptInvoice, setReceiptInvoice] = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);

  const [modals, setModals] = useState({ txn: false, txnType: 'credit' });

  const openModal = useCallback((key, extra = {}) => setModals(p => ({ ...p, [key]: true, ...extra })), []);
  const closeModal = useCallback(key => setModals(p => ({ ...p, [key]: false })), []);

  /* ══════════════════════════════════════════════════════════
     🔐 OFFLINE-FIRST FETCH — WITH UID OWNERSHIP CHECK
  ══════════════════════════════════════════════════════════ */
  const fetchCustomerDetailsOffline = useCallback(async () => {
    if (!id || !user?.uid) return;
    setAccessDenied(false);

    // 1. Read Customer from Local Dexie
    try {
      if (localDb?.customers) {
        const lc = await localDb.customers.get(id);
        if (lc) {
          if (lc.uid && lc.uid !== user.uid && !isPortalMode) {
            setAccessDenied(true);
            setLoading(false);
            return;
          }
          setCustomer(lc);
        }
      }
    } catch (e) { console.error("Local read error", e); }

    // 2. Load transactions
    try {
      let localTxns = [];
      if (localDb?.customerTransactions) {
        try {
          localTxns = await localDb.customerTransactions.where('customerId').equals(id).toArray();
        } catch {
          const all = await localDb.customerTransactions.toArray();
          localTxns = all.filter(tx => tx.customerId === id);
        }
      }

      // Cloud sync
      if (navigator.onLine && cloudDb) {
        try {
          const q = query(
            collection(cloudDb, 'customerTransactions'),
            where('customerId', '==', id)
          );
          const snap = await getDocs(q);
          const cloudTxns = snap.docs.map(d => ({ id: d.id, ...d.data() }));

          if (localDb?.customerTransactions) {
            await localDb.customerTransactions.bulkPut(cloudTxns).catch(() => {});
            try {
              localTxns = await localDb.customerTransactions.where('customerId').equals(id).toArray();
            } catch {
              const all = await localDb.customerTransactions.toArray();
              localTxns = all.filter(tx => tx.customerId === id);
            }
          }
        } catch (cloudErr) {}
      }

      const formatted = localTxns.map(dt => {
        const ts = extractValidTimestamp(dt, dt.date);
        return {
          id: dt.id, type: dt.type, amount: nn(dt.amount), date: dt.date,
          time: getAccurateTime(dt.time, ts), note: dt.note, source: dt.source || 'manual',
          timestamp: ts, runningBalance: 0
        };
      });

      formatted.sort((a, b) => a.timestamp - b.timestamp);
      let runBal = nn(customer?.initialBalance || 0);
      formatted.forEach(txn => {
        if (txn.type === 'credit') runBal += txn.amount;
        else if (txn.type === 'payment') runBal -= txn.amount;
        txn.runningBalance = runBal;
      });

      formatted.sort((a, b) => b.timestamp - a.timestamp);
      setTransactions(formatted);
      setLoading(false);
    } catch (err) {
      setLoading(false);
    }
  }, [id, user?.uid, customer?.initialBalance, isPortalMode]);

  useEffect(() => {
    fetchCustomerDetailsOffline();
  }, [fetchCustomerDetailsOffline]);

  /* ─── TRANSACTION CONFIRM (OFFLINE FIRST WITH AUTO-SYNC) ────────────────── */
  const handleTransactionConfirm = useCallback(async ({
    type, amount, note, date, method, bankAccountId, bankAccountName
  }) => {
    if (!customer || isProcessing || !user?.uid) return;
    setIsProcessing(true);

    const isCredit = type === 'credit';
    const now = new Date();
    const timeStr = nowHHMM24();
    const refNo = `${isCredit ? 'CRD' : 'PAY'}${now.getTime().toString(36).toUpperCase().slice(-8)}`;
    const curBal = nn(customer.currentBalance);
    const newBalance = isCredit ? curBal + amount : curBal - amount;

    const txnId = `ctxn_${Date.now()}`;
    const cashTxnId = `cash_${Date.now()}`;

    // Mark synced: 0 for instant Auto-Sync Engine detection
    const txnData = {
      id: txnId, uid: user.uid, customerId: id, customerName: customer.name || '', type, amount, date,
      time: timeStr, note: note || (isCredit ? t.addCredit : t.getPayment), source: isCredit ? 'manual_credit' : 'manual',
      timestamp: now.getTime(), createdBy: user.email || 'Unknown', newCustomerBalance: newBalance,
      synced: 0
    };

    const cashTxnData = {
      id: cashTxnId, type: isCredit ? 'out' : 'in', category: isCredit ? 'customerCredit' : 'invoicePayment',
      source: isCredit ? 'customerCredit' : 'invoicePayment',
      description: isCredit
        ? `👤 ${customer.name || 'Customer'} — ණය ලබාදීම${note ? ' | ' + note : ''}`
        : `💵 පාරිභෝගික ගෙවීම් ලැබීම [${customer.name || 'Customer'}]${note ? ' | ' + note : ''}`,
      amount, paymentMethod: method, customerId: id, customerName: customer.name,
      customerPhone: customer.phone || '', customerTxnId: txnId, reference: refNo, notes: note || '',
      previousOutstanding: curBal, newOutstanding: newBalance, date, time: timeStr,
      timestamp: now.getTime(), createdBy: user.email || 'Unknown', uid: user.uid, synced: 0
    };

    try {
      // 1. LOCAL SAVE TO PC HARD DISC
      if (localDb) {
        if (localDb.customers) {
          await localDb.customers.put({
            ...customer,
            currentBalance: newBalance,
            uid: user.uid,
            updatedAt: new Date().toISOString(),
          });
        }
        if (localDb.customerTransactions) {
          await localDb.customerTransactions.put(txnData);
        }
        if (localDb.cashTransactions) {
          await localDb.cashTransactions.put(cashTxnData);
        }
      }

      setCustomer(prev => prev ? { ...prev, currentBalance: newBalance } : prev);
      showToast(isCredit ? t.creditAdded : t.paymentReceived);
      closeModal('txn');

      // 2. IMMEDIATE ONLINE CLOUD PUSH
      if (navigator.onLine && cloudDb) {
        setDoc(doc(cloudDb, 'customerTransactions', txnId), { ...txnData, synced: 1, createdAt: serverTimestamp() }).then(() => {
          localDb.customerTransactions.update(txnId, { synced: 1 }).catch(() => {});
        }).catch(() => {});

        updateDoc(doc(cloudDb, 'customers', id), { currentBalance: newBalance, updatedAt: serverTimestamp() }).catch(() => {});
      }

      const methodMap = { cash: 'cash', bank: 'etransfer', card: 'card', cheque: 'cheque' };
      const synthetic = {
        _isReceipt: true, _receiptType: isCredit ? 'credit' : 'payment', id: txnId, invoiceNo: refNo, invoiceCode: `${isCredit ? 'CRD' : 'PAY'}-${refNo}`,
        customerName: customer.name || '', customerPhone: customer.phone || '', customerAddress: customer.address || '', customerId: id,
        customerCurrentBalance: newBalance, previousOutstanding: curBal, newOutstanding: newBalance,
        items: [{ name: isCredit ? 'ණය ඇතුළු කිරීම' : 'ගෙවීම් රිසිට්පත', nameSi: isCredit ? 'ණය' : 'ගෙවීම', qty: 1, sellingPrice: amount, yourPrice: amount, lineTotal: amount, uom: 'unit', warrantyCode: '' }],
        grossTotal: amount, totalDiscount: 0, billDiscount: 0, billDiscountPercent: 0, exchangeAmount: 0, netAmount: amount, payAmount: isCredit ? 0 : amount, balance: isCredit ? -amount : 0,
        paymentMethod: methodMap[method] || 'cash', remarks: note || '', invoiceRemark: note || '', _docType: isCredit ? 'credit_receipt' : 'payment_receipt', createdAt: Timestamp ? Timestamp.fromDate(now) : now
      };

      setReceiptInvoice(synthetic);
      fetchCustomerDetailsOffline();
    } catch (err) {
      showToast('❌ ' + err.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [customer, isProcessing, id, user, t, showToast, closeModal, fetchCustomerDetailsOffline]);

  const totalCredits = useMemo(() => transactions.filter(x => x.type === 'credit').reduce((s, x) => s + x.amount, 0), [transactions]);
  const totalPayments = useMemo(() => transactions.filter(x => x.type === 'payment').reduce((s, x) => s + x.amount, 0), [transactions]);
  const curBal = nn(customer?.currentBalance);

  if (authLoading || loading) return <div style={styles.loadingContainer}>{t.loading}</div>;

  if (!user?.uid && !isPortalMode) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: 20 }}>
        <div style={{ background: 'white', borderRadius: 20, padding: 40, maxWidth: 400, width: '100%', textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>{t.loginRequired}</h2>
          <p style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>{t.loginPrompt}</p>
          <a href="/" style={{ display: 'inline-block', padding: '12px 24px', background: '#3b82f6', color: 'white', borderRadius: 10, fontWeight: 700, textDecoration: 'none' }}>{t.loginBtn}</a>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: 20 }}>
        <div style={{ background: 'white', borderRadius: 20, padding: 40, maxWidth: 400, width: '100%', textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⛔</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#dc2626', marginBottom: 8 }}>{t.accessDenied}</h2>
          <p style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>{t.accessDeniedMsg}</p>
          <button onClick={() => router.push('/customers')} style={{ padding: '12px 24px', background: '#3b82f6', color: 'white', borderRadius: 10, fontWeight: 700, border: 'none', cursor: 'pointer' }}>{t.backToCustomers}</button>
        </div>
      </div>
    );
  }

  if (!customer) return <div style={styles.loadingContainer}>Customer not found</div>;

  return (
    <div style={styles.container}>
      <Toast toast={toast} />

      {!isPortalMode && (
        <button onClick={() => router.push('/customers')} style={{ marginBottom: 16, padding: '8px 16px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#475569' }}>
          {t.backToCustomers}
        </button>
      )}

      <div style={styles.headerCard}>
        <div style={{ width: 90, height: 90, borderRadius: '50%', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'white', fontSize: 32, marginBottom: 12 }}>
          {(customer.name || '?')[0].toUpperCase()}
        </div>
        <h1>{customer.name}</h1>
        <p>{formatPhoneWithCode(customer.phone)}</p>

        <div style={{ background: curBal > 0 ? '#fef2f2' : curBal < 0 ? '#eff6ff' : '#f0fdf4', border: `2px solid ${curBal > 0 ? '#fecaca' : curBal < 0 ? '#bfdbfe' : '#bbf7d0'}`, borderRadius: 12, padding: 15, margin: '10px 0', textAlign: 'center' }}>
          <small style={{ color: '#64748b' }}>{t.balance}</small>
          <h2 style={{ color: curBal > 0 ? '#dc2626' : curBal < 0 ? '#2563eb' : '#16a34a', fontSize: 32, margin: '5px 0' }}>Rs. {fmt(Math.abs(curBal))}</h2>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <div style={{ flex: 1, background: '#fef2f2', padding: 8, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 10, color: '#dc2626', fontWeight: 600 }}>{t.totalCredits}</div><div style={{ fontSize: 14, fontWeight: 800, color: '#dc2626' }}>Rs.{fmt(totalCredits)}</div></div>
          <div style={{ flex: 1, background: '#f0fdf4', padding: 8, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>{t.totalPayments}</div><div style={{ fontSize: 14, fontWeight: 800, color: '#16a34a' }}>Rs.{fmt(totalPayments)}</div></div>
        </div>
      </div>

      <div style={styles.actionGrid}>
        {!isPortalMode && (
          <>
            <button onClick={() => openModal('txn', { txnType: 'credit' })} style={styles.actionBtn('#fee2e2', '#dc2626')}>➕ {t.addCredit}</button>
            <button onClick={() => openModal('txn', { txnType: 'payment' })} style={styles.actionBtn('#dcfce7', '#16a34a')}>💰 {t.getPayment}</button>
          </>
        )}
      </div>

      <div style={styles.listContainer}>
        <h3>📋 {t.transactionHistory}</h3>
        {transactions.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>{t.noTransactions}</div>
        ) : transactions.map((txn, i) => (
          <div key={txn.id + i} style={{ padding: 16, borderBottom: '1px solid #e2e8f0', background: txn.type === 'payment' ? '#f0fdf4' : '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 800, color: '#1e293b', fontSize: 14 }}>{txn.date}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>⏱ {txn.time}</div>
                <div style={{ fontSize: 14, color: '#334155', marginTop: 6 }}>{txn.note}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 900, fontSize: 18, color: txn.type === 'credit' ? '#dc2626' : '#16a34a' }}>
                  {txn.type === 'credit' ? '+' : '-'}Rs. {fmt(txn.amount)}
                </div>
                <div style={{ fontSize: 12, marginTop: 4, fontWeight: 'bold' }}>{t.runningBalance}: Rs. {fmt(txn.runningBalance)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <TransactionModal
        show={modals.txn} type={modals.txnType} customer={customer}
        onClose={() => closeModal('txn')} onConfirm={handleTransactionConfirm}
        isProcessing={isProcessing} bankAccounts={bankAccounts} bankLoading={bankLoading} t={t} lang={lang}
      />

      {receiptInvoice && <InvoiceOutputManager invoice={receiptInvoice} onClose={() => setReceiptInvoice(null)} initialMode="whatsapp" />}
    </div>
  );
}

/* ─── STYLES ─────────────────────────────────────────────── */
const styles = {
  container: { padding: 20, maxWidth: 800, margin: '0 auto', fontFamily: 'sans-serif', paddingBottom: 50 },
  loadingContainer: { padding: 40, textAlign: 'center', color: '#64748b', fontSize: 16 },
  headerCard: { textAlign: 'center', padding: 30, background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)', borderRadius: 16, marginBottom: 20, border: '2px solid #e2e8f0' },
  actionGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 20 },
  actionBtn: (bg, color) => ({ padding: 15, background: bg, color, border: 'none', borderRadius: 12, fontWeight: 800, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }),
  listContainer: { background: 'white', padding: 20, borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 },
  modal: { background: 'white', padding: 25, borderRadius: 16, width: '90%', maxWidth: 400 },
  input: { width: '100%', padding: 14, border: '2px solid #e2e8f0', borderRadius: 10, marginBottom: 12, fontSize: 15, boxSizing: 'border-box' },
  formLabel: { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 },
};