'use client';

// app/(dashboard)/customers/[id]/page.jsx
// ✅ Next.js 14+ App Router Compatible (next/navigation)
// ✅ Real InvoiceOutputManager integrated for receipts & WhatsApp/SMS sharing
// ✅ Real-time Firestore sync with index-free safety
// 🚀 FIXED: Profile Picture upload and update support added during Customer Edit modal
// 🚀 FIXED: Cash & Bank Register (Cash sync) integration matching Customers.jsx

import React, {
  useState, useEffect, useRef, useCallback, useMemo, memo
} from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/firebaseConfig';
import { useUserAuth } from '@/context/UserContext';
import InvoiceOutputManager from '@/components/InvoiceOutputManager';
import {
  doc, getDoc, collection, query, where, orderBy,
  getDocs, addDoc, serverTimestamp, updateDoc, increment,
  deleteDoc, runTransaction, writeBatch, Timestamp, onSnapshot
} from 'firebase/firestore';

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

// ★ Local Date & Time generators to sync with Customers.jsx
const nowHHMM24 = () => {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

const localDateStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const validateAmount = v => {
  const n = parseFloat(v);
  if (isNaN(n) || n <= 0) return 'වලංගු මුදලක් ඇතුළු කරන්න';
  if (n > 10_000_000) return 'ඉතා විශාල මුදලකි';
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
  if (fallbackDate) {
    const p = new Date(fallbackDate + 'T00:00:00').getTime();
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

function removeDuplicatePayments(txns) {
  const src = txns.filter(t =>
    t.type === 'payment' &&
    ['invoicePayment', 'vehicleTrip', 'production'].includes(t.source)
  );
  const manual = txns.filter(t => t.type === 'payment' && t.source === 'manual');
  const other = txns.filter(t =>
    t.type !== 'payment' ||
    !['invoicePayment', 'vehicleTrip', 'production', 'manual'].includes(t.source)
  );
  const used = new Set();
  const filtered = manual.filter(mp => {
    const idx = src.findIndex((sp, i) => {
      if (used.has(i)) return false;
      return Math.abs(sp.amount - mp.amount) < 0.01 && Math.abs(sp.timestamp - mp.timestamp) < 120_000;
    });
    if (idx >= 0) { used.add(idx); return false; }
    return true;
  });
  return [...other, ...src, ...filtered];
}

// ─── Translations ─────────────────────────────────────────
const translations = {
  si: {
    title: 'පාරිභෝගික විස්තර', balance: 'වත්මන් ශේෂය', addCredit: 'ණය එකතු කරන්න',
    getPayment: 'මුදල් ලබාගන්න', transactionHistory: 'ගනුදෙනු ඉතිහාසය',
    date: 'දිනය / වේලාව', description: 'විස්තරය', credit: 'ණය (Credit)',
    payment: 'ගෙවීම (Payment)', runningBalance: 'ශේෂය', save: 'සුරකින්න',
    cancel: 'අවලංගු', amount: 'මුදල', note: 'සටහන', loading: 'පූරණය වෙමින්...',
    uploadReceipt: 'රිසිට් (Optional)', viewReport: 'වාර්තාව', remind: 'මතක් කරන්න',
    setDueDate: 'ගෙවිය යුතු දිනය', whatsapp: 'WhatsApp', sms: 'SMS',
    dueDateSet: 'දිනය යාවත්කාලීන විය!', approvals: 'අනුමැතිය',
    noApprovals: 'අනුමත කිරීමට කිසිවක් නැත', sendLink: 'Link යවන්න',
    editCustomer: 'සංශෝධනය', deleteCustomer: 'මකන්න', editTitle: 'සංශෝධනය',
    customerName: 'නම', phone: 'දුරකථනය', address: 'ලිපිනය',
    updateSuccess: 'යාවත්කාලීන විය!', deleteConfirm: 'මකා දමන්නද?',
    deleteWarning: '⚠️ ආපසු හැරවිය නොහැක!', deleteSuccess: 'මකා දමන ලදී!',
    updating: 'යාවත්කාලීන...', generatingLink: 'Link සකසමින්...',
    copyLink: '📋 Copy', copied: '✅ Copied!', close: 'වසන්න',
    editTxn: 'ගනුදෙනුව සංස්කරණය', deleteTxn: 'මකන්න',
    confirmDeleteTxn: 'ගනුදෙනුව මකා දැමීමට?', updateTxn: 'යාවත්කාලීන',
    selectImage: '🖼️ ගැලරිය', openCamera: '📷 කැමරාව', reminderTitle: 'සිහිකැඳවීම',
    capture: 'ගන්න', reminderMsg: 'ගෙවීමට Rs.{amount} ඇත.\n\nවිස්තර: {link}',
    vehicleTrip: 'වාහන ගමන', tripFare: 'ගාස්තුව', tripPaid: 'ගෙවූ',
    filterAll: 'සියල්ල', filterShop: 'සාප්පු', filterVehicle: 'වාහන',
    filterPayments: 'ගෙවීම්', filterServices: 'සේවා',
    noVehicleTrips: 'වාහන ගමන් නොමැත', noTransactions: 'ගනුදෙනු නොමැත',
    noServices: 'සේවා නොමැත', transportFare: 'ප්‍රවාහන ගාස්තු',
    transportPayment: 'ප්‍රවාහන ගෙවීම', serviceEntry: 'සේවා ඇතුළත් කිරීම',
    serviceItems: 'සේවා', partsUsed: 'කොටස්', labourCost: 'ශ්‍රම', totalPaid: 'ගෙවූ',
    balanceDue: 'ගෙවිය යුතු', grandTotal: 'එකතුව', discount: 'වට්ටම්',
    servicePayment: 'සේවා ගෙවීම', fullPaid: 'සම්පූර්ණ', partialPaid: 'අර්ධ',
    unpaid: 'නොගෙවූ', warranty: 'වගකීම', days: 'දින', viewBill: 'බිල්පත',
    invoicePayment: 'Invoice ගෙවීම', adjustment: 'ශේෂ සැකසුම',
    totalCredits: 'මුළු ණය', totalPayments: 'මුළු ගෙවීම්',
    paymentMethod: 'ගෙවීම් ක්‍රමය', bankAccount: 'බැංකු ගිණුම',
    selectBankAccount: 'බැංකු ගිණුම තෝරන්න *', noBankAccounts: 'බැංකු ගිණුම් නොමැත.',
    bankBalanceBefore: 'වත්මන් බැංකු ශේෂය', bankBalanceAfter: 'ගනුදෙනුවෙන් පසු ශේෂය',
    customerBalanceAfter: 'නව ශේෂය', addCreditTitle: '➕ ණය එකතු කිරීම',
    receivePaymentTitle: '💰 මුදල් ලබාගැනීම', creditDescription: 'ණය විස්තරය',
    paymentDescription: 'ගෙවීම් විස්තරය', creditAmount: 'ණය මුදල',
    paymentAmount: 'ලැබෙන මුදල', saveCredit: '➕ ණය එකතු කරන්න',
    savePayment: '💰 ලබාගන්න', processing: 'සකසමින්...',
    cash: '💵 මුදල්', bank: '🏦 බැංකු', cheque: '📝 චෙක්',
    creditAdded: '✅ ණය සාර්ථකව එකතු විය!',
    paymentReceived: '✅ මුදල් ලැබීම සාර්ථකයි!', autoRemind: '🔔 Auto Remind',
  },
  en: {
    title: 'Customer Details', balance: 'Current Balance', addCredit: 'Add Credit',
    getPayment: 'Get Payment', transactionHistory: 'Transaction History',
    date: 'Date / Time', description: 'Description', credit: 'Credit',
    payment: 'Payment', runningBalance: 'Balance', save: 'Save', cancel: 'Cancel',
    amount: 'Amount', note: 'Note', loading: 'Loading...',
    uploadReceipt: 'Upload Receipt (Optional)', viewReport: 'View Report',
    remind: 'Remind', setDueDate: 'Set Due Date', whatsapp: 'WhatsApp', sms: 'SMS',
    dueDateSet: 'Due date updated!', approvals: 'Approvals',
    noApprovals: 'No pending approvals', sendLink: 'Send Link', editCustomer: 'Edit',
    deleteCustomer: 'Delete', editTitle: 'Edit Customer', customerName: 'Name',
    phone: 'Phone', address: 'Address', updateSuccess: 'Updated!',
    deleteConfirm: 'Delete this customer?', deleteWarning: '⚠️ Cannot be undone!',
    deleteSuccess: 'Deleted!', updating: 'Updating...', generatingLink: 'Generating...',
    copyLink: '📋 Copy Link', copied: '✅ Copied!', close: 'Close',
    editTxn: 'Edit Transaction', deleteTxn: 'Delete',
    confirmDeleteTxn: 'Delete this transaction?', updateTxn: 'Update',
    selectImage: '🖼️ Gallery', openCamera: '📷 Camera', reminderTitle: 'Send Reminder',
    capture: 'Capture',
    reminderMsg: 'You owe Rs.{amount}. Please settle soon.\n\nDetails: {link}',
    vehicleTrip: 'Vehicle Trip', tripFare: 'Fare', tripPaid: 'Paid',
    filterAll: 'All', filterShop: 'Shop', filterVehicle: 'Vehicle',
    filterPayments: 'Payments', filterServices: 'Services',
    noVehicleTrips: 'No vehicle trips', noTransactions: 'No transactions',
    noServices: 'No service entries', transportFare: 'Transport Fare',
    transportPayment: 'Transport Payment', serviceEntry: 'Service Entry',
    serviceItems: 'Services', partsUsed: 'Parts', labourCost: 'Labour', totalPaid: 'Paid',
    balanceDue: 'Balance Due', grandTotal: 'Grand Total', discount: 'Discount',
    servicePayment: 'Service Payment', fullPaid: 'Fully Paid', partialPaid: 'Partial',
    unpaid: 'Unpaid', warranty: 'Warranty', days: 'days', viewBill: 'View Bill',
    invoicePayment: 'Invoice Payment', adjustment: 'Adjustment',
    totalCredits: 'Total Credits', totalPayments: 'Total Payments',
    paymentMethod: 'Payment Method', bankAccount: 'Bank Account',
    selectBankAccount: 'Select Bank Account *', noBankAccounts: 'No bank accounts.',
    bankBalanceBefore: 'Current Bank Balance', bankBalanceAfter: 'Bank Balance After',
    customerBalanceAfter: 'New Customer Balance', addCreditTitle: '➕ Add Credit Entry',
    receivePaymentTitle: '💰 Receive Payment', creditDescription: 'Credit Description',
    paymentDescription: 'Payment Description', creditAmount: 'Credit Amount',
    paymentAmount: 'Payment Amount', saveCredit: '➕ Add Credit',
    savePayment: '💰 Receive', processing: 'Processing...',
    cash: 'Cash', bank: 'Bank Transfer', cheque: 'Cheque',
    creditAdded: 'Credit added successfully!',
    paymentReceived: 'Payment received successfully!', autoRemind: 'Auto Remind',
  }
};

// ─── Hooks ────────────────────────────────────────────────
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
    if (!uid) { setBankLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, `users/${uid}/bankAccounts`), orderBy('createdAt', 'desc')));
        if (!cancelled) setBankAccounts(snap.docs.map(d => ({ id: d.id, ...d.data(), currentBalance: nn(d.data().currentBalance) })).filter(a => a.isActive !== false));
      } catch (e) { console.warn('Bank accounts:', e); }
      finally { if (!cancelled) setBankLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [uid]);
  return { bankAccounts, bankLoading };
}

// ─── Toast ────────────────────────────────────────────────
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

// ─── Transaction Modal ────────────────────────────────────
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
  const [receiptImage, setReceiptImage] = useState(null);
  const fileRef = useRef(null);
  const isCredit = type === 'credit';
  const isBank = method === 'bank';

  useEffect(() => {
    if (show) {
      setAmount(''); setNote(''); setDate(new Date().toISOString().split('T')[0]);
      setMethod('cash'); setBankId(''); setAmountErr(''); setBankErr(''); setReceiptImage(null);
    }
  }, [show]);

  useEffect(() => {
    if (isBank && bankAccounts.length > 0 && !bankId) setBankId(bankAccounts[0].id);
  }, [isBank, bankAccounts, bankId]);

  useEffect(() => {
    if (!show) return;
    const h = e => { if (e.key === 'Escape' && !isProcessing) onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [show, isProcessing, onClose]);

  const selectedBank = isBank ? bankAccounts.find(a => a.id === bankId) : null;
  const amt = nn(amount);
  const bankBalAfter = useMemo(() => selectedBank && amt ? selectedBank.currentBalance + amt : null, [selectedBank, amt]);
  const custBalAfter = useMemo(() => { if (!customer || !amt) return null; const cur = nn(customer.currentBalance); return isCredit ? cur + amt : cur - amt; }, [customer, amt, isCredit]);

  const handleImageSelect = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setReceiptImage(reader.result);
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleConfirm = () => {
    const err = validateAmount(amount);
    if (err) { setAmountErr(err); return; }
    if (isBank && !bankId) { setBankErr(t.selectBankAccount); return; }
    onConfirm({
      type, amount: amt, note, date, method, receiptImage,
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
          {/* Customer info */}
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px', marginBottom: 16, border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 700, color: '#1e293b' }}>{customer.name}</div>
            <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', background: nn(customer.currentBalance) > 0 ? '#fef2f2' : '#f0fdf4', padding: '6px 10px', borderRadius: 8 }}>
              <span style={{ fontSize: 13, color: '#64748b' }}>{t.balance}:</span>
              <span style={{ fontWeight: 800, color: nn(customer.currentBalance) > 0 ? '#dc2626' : '#16a34a' }}>{formatCurrency(customer.currentBalance)}</span>
            </div>
          </div>

          {/* Date */}
          <div style={{ marginBottom: 12 }}>
            <label style={styles.formLabel}>{t.date}</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...styles.input, marginBottom: 0 }} disabled={isProcessing} />
          </div>

          {/* Note */}
          <div style={{ marginBottom: 12 }}>
            <label style={styles.formLabel}>{isCredit ? t.creditDescription : t.paymentDescription}</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} style={{ ...styles.input, marginBottom: 0 }} placeholder={isCredit ? 'Items / Services...' : 'Payment details...'} disabled={isProcessing} />
          </div>

          {/* Amount */}
          <div style={{ marginBottom: 12 }}>
            <label style={styles.formLabel}>{isCredit ? t.creditAmount : t.paymentAmount} *</label>
            <input type="number" step="0.01" min="0.01" autoFocus value={amount}
              onChange={e => { setAmount(e.target.value); setAmountErr(e.target.value ? validateAmount(e.target.value) || '' : ''); }}
              style={{ ...styles.input, marginBottom: 0, fontSize: 22, fontWeight: 800, color: headerColor, borderColor: amountErr ? '#ef4444' : '#e2e8f0' }}
              placeholder="0.00" disabled={isProcessing} />
            {amountErr && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#ef4444', fontWeight: 600 }}>{amountErr}</p>}
            {amt > 0 && custBalAfter !== null && (
              <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>{t.customerBalanceAfter}:</span>
                <span style={{ fontWeight: 700, color: custBalAfter > 0 ? '#dc2626' : '#16a34a' }}>{formatCurrency(custBalAfter)}</span>
              </div>
            )}
          </div>

          {/* Payment method */}
          <div style={{ marginBottom: 16 }}>
            <label style={styles.formLabel}>{t.paymentMethod}</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {PAYMENT_METHODS.map(pm => {
                const sel = method === pm.value;
                const c = pm.value === 'cash' ? '#16a34a' : pm.value === 'bank' ? '#3b82f6' : '#f59e0b';
                return (
                  <button key={pm.value} onClick={() => { setMethod(pm.value); setBankErr(''); }} disabled={isProcessing}
                    style={{ padding: '10px 6px', borderRadius: 10, border: sel ? `2px solid ${c}` : '2px solid #e2e8f0', background: sel ? `${c}12` : 'white', cursor: 'pointer', fontWeight: sel ? 700 : 500, fontSize: 13, color: sel ? c : '#64748b', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 20 }}>{pm.icon}</span>
                    <span>{lang === 'si' ? pm.si : pm.en}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bank selector */}
          {isBank && (
            <div style={{ marginBottom: 16, padding: 16, background: '#eff6ff', borderRadius: 12, border: '1px solid #bfdbfe' }}>
              <label style={{ ...styles.formLabel, color: '#1d4ed8', marginBottom: 10, display: 'block' }}>🏦 {t.bankAccount}</label>
              {bankLoading ? (
                <div style={{ textAlign: 'center', padding: 16, color: '#64748b' }}>{t.loading}</div>
              ) : bankAccounts.length === 0 ? (
                <div style={{ padding: 14, background: '#fef3c7', borderRadius: 8, fontSize: 13, color: '#92400e', textAlign: 'center' }}>⚠️ {t.noBankAccounts}</div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                    {bankAccounts.map(bank => {
                      const sel = bankId === bank.id;
                      const bal = nn(bank.currentBalance);
                      return (
                        <div key={bank.id} onClick={() => { setBankId(bank.id); setBankErr(''); }}
                          style={{ padding: '12px 14px', borderRadius: 10, border: sel ? '2px solid #3b82f6' : '2px solid #e2e8f0', background: sel ? '#dbeafe' : 'white', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14, color: sel ? '#1d4ed8' : '#1e293b' }}>{sel && '✓ '}{bank.bankName}</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>{bank.accountName}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', marginTop: 2 }}>{bank.accountNumber}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: bal >= 0 ? '#16a34a' : '#ef4444' }}>{formatCurrency(bal)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {selectedBank && amt > 0 && bankBalAfter !== null && (
                    <div style={{ marginTop: 10, padding: '10px 14px', background: 'white', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: '#64748b' }}>{t.bankBalanceBefore}:</span>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{formatCurrency(selectedBank.currentBalance)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4, borderTop: '1px dashed #e2e8f0' }}>
                        <span style={{ fontSize: 12, color: '#64748b' }}>{t.bankBalanceAfter}:</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: bankBalAfter >= 0 ? '#16a34a' : '#ef4444' }}>{formatCurrency(bankBalAfter)}</span>
                      </div>
                    </div>
                  )}
                </>
              )}
              {bankErr && <p style={{ margin: '8px 0 0', fontSize: 11, color: '#ef4444', fontWeight: 600 }}>{bankErr}</p>}
            </div>
          )}

          {/* Receipt upload */}
          <div style={{ marginBottom: 16 }}>
            <label style={styles.formLabel}>{t.uploadReceipt}</label>
            <label style={{ display: 'block', padding: '10px 14px', border: '2px dashed #cbd5e1', borderRadius: 10, textAlign: 'center', cursor: 'pointer', background: '#f8fafc', fontSize: 13, color: '#64748b' }}>
              {receiptImage ? '✅ Image selected' : t.selectImage}
              <input ref={fileRef} type="file" accept="image/*" onChange={handleImageSelect} style={{ display: 'none' }} />
            </label>
            {receiptImage && (
              <div style={{ position: 'relative', marginTop: 8 }}>
                <img src={receiptImage} alt="preview" style={{ width: '100%', maxHeight: 150, objectFit: 'contain', borderRadius: 8 }} />
                <button onClick={() => { setReceiptImage(null); if (fileRef.current) fileRef.current.value = ''; }} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 11 }}>✕</button>
              </div>
            )}
          </div>

          {/* Confirm */}
          <button onClick={handleConfirm} disabled={isProcessing || !!amountErr || (isBank && (!bankId || bankAccounts.length === 0))}
            style={{ width: '100%', padding: 14, background: headerColor, color: 'white', border: 'none', borderRadius: 10, fontWeight: 'bold', fontSize: 16, cursor: isProcessing ? 'not-allowed' : 'pointer', opacity: isProcessing ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {isProcessing ? <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> {t.processing}</> : isCredit ? t.saveCredit : t.savePayment}
          </button>
        </div>
      </div>
    </div>
  );
});

// ─── Other Modals ─────────────────────────────────────────
const ReminderModal = memo(function ReminderModal({ isOpen, onClose, customer, lang, onUpdateCustomer }) {
  const t = translations[lang];
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState('');
  useEffect(() => {
    if (!isOpen || !customer) return;
    if (customer.portalAccessKey) { setLink(`${window.location.origin}/portal/${customer.portalAccessKey}`); return; }
    setLoading(true);
    const k = Math.random().toString(36).substring(2, 10) + Date.now().toString(36).substring(4, 8);
    updateDoc(doc(db, 'customers', customer.id), { portalAccessKey: k }).then(() => { setLink(`${window.location.origin}/portal/${k}`); onUpdateCustomer({ ...customer, portalAccessKey: k }); setLoading(false); });
  }, [isOpen, customer]);
  if (!isOpen || !customer) return null;
  const msg = t.reminderMsg.replace('{amount}', customer.currentBalance?.toLocaleString() || '0').replace('{link}', link);
  const phone = customer.phone?.replace(/[^0-9]/g, '');
  return (
    <div style={styles.modalOverlay} onClick={onClose}><div style={styles.modal} onClick={e => e.stopPropagation()}>
      <h3>🔔 {t.reminderTitle}</h3>
      {loading ? <p>{t.generatingLink}</p> : <p style={{ background: '#f3f4f6', padding: 10, borderRadius: 8, fontSize: 13, whiteSpace: 'pre-wrap' }}>{msg}</p>}
      <button onClick={() => window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')} disabled={loading} style={{ ...styles.btnFull, background: '#25D366', marginBottom: 10 }}>💬 WhatsApp</button>
      <button onClick={() => window.open(`sms:${customer.phone}?body=${encodeURIComponent(msg)}`, '_self')} disabled={loading} style={{ ...styles.btnFull, background: '#3b82f6' }}>📩 SMS</button>
      <button onClick={onClose} style={{ ...styles.btnFull, background: '#ef4444', marginTop: 10 }}>{t.close}</button>
    </div></div>
  );
});

const EditTransactionModal = memo(function EditTransactionModal({ isOpen, onClose, txn, onSave, lang }) {
  const t = translations[lang];
  const [amount, setAmount] = useState(''); const [note, setNote] = useState(''); const [date, setDate] = useState('');
  useEffect(() => { if (isOpen && txn) { setAmount(txn.amount); setNote(txn.note || ''); setDate(txn.date || new Date().toISOString().split('T')[0]); } }, [isOpen, txn]);
  if (!isOpen) return null;
  return (
    <div style={styles.modalOverlay}><div style={styles.modal}>
      <h3>{t.editTxn}</h3>
      <input type="date" value={date} onChange={e => setDate(e.target.value)} style={styles.input} />
      <input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={styles.input} />
      <textarea value={note} onChange={e => setNote(e.target.value)} style={styles.textarea} />
      <div style={styles.modalActions}>
        <button onClick={onClose} style={styles.btnCancel}>{t.cancel}</button>
        <button onClick={() => { if (!amount) return; onSave({ ...txn, amount: parseFloat(amount), note, date }); onClose(); }} style={styles.btnSave}>{t.updateTxn}</button>
      </div>
    </div></div>
  );
});

const SendLinkModal = memo(function SendLinkModal({ isOpen, onClose, customer, onUpdateCustomer, lang }) {
  const [copied, setCopied] = useState(false);
  const [loadingKey, setLoadingKey] = useState(false);
  const [portalKey, setPortalKey] = useState(customer?.portalAccessKey);
  const t = translations[lang];
  useEffect(() => {
    if (!isOpen || !customer) return;
    if (customer.portalAccessKey) { setPortalKey(customer.portalAccessKey); return; }
    setLoadingKey(true);
    const k = Math.random().toString(36).substring(2, 10) + Date.now().toString(36).substring(4, 8);
    updateDoc(doc(db, 'customers', customer.id), { portalAccessKey: k }).then(() => { setPortalKey(k); onUpdateCustomer({ ...customer, portalAccessKey: k }); setLoadingKey(false); });
  }, [isOpen, customer]);
  if (!isOpen || !customer) return null;
  const link = portalKey ? `${window.location.origin}/portal/${portalKey}` : '';
  return (
    <div style={styles.modalOverlay} onClick={onClose}><div style={styles.modal} onClick={e => e.stopPropagation()}>
      <h3>🔗 {t.sendLink}</h3>
      {loadingKey ? <div style={{ padding: 20, textAlign: 'center' }}>{t.generatingLink}</div> : (<>
        <div style={{ background: '#f3f4f6', padding: 10, borderRadius: 8, wordBreak: 'break-all', fontSize: 12, marginBottom: 10 }}>{link}</div>
        <button onClick={() => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={styles.btnFull}>{copied ? t.copied : t.copyLink}</button>
        <button onClick={() => window.open(`https://wa.me/${customer.phone?.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(link)}`, '_blank')} style={{ ...styles.btnFull, background: '#25D366', marginTop: 10 }}>💬 WhatsApp</button>
      </>)}
      <button onClick={onClose} style={{ ...styles.btnFull, background: '#ef4444', marginTop: 10 }}>{t.close}</button>
    </div></div>
  );
});

// ★ Smart Image Compressor & Automatic Cloud Upload Engine for Avatar Uploads
const handleAvatarUpload = (e, setForm, showToast) => {
  const file = e.target.files?.[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    showToast('❌ Image එක විශාල වැඩියි. (Max: 5MB)', 'error');
    return;
  }

  showToast('⏳ Image එක සකසමින් පවතී...');

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
        if (!blob) {
          showToast('❌ Processing failed', 'error');
          return;
        }

        try {
          showToast('☁️ Cloud එකට Upload කරමින්...');
          const formData = new FormData();
          formData.append('file', blob, 'avatar.jpg');
          
          const res = await fetch('https://telegra.ph/upload', {
            method: 'POST',
            body: formData,
          });
          
          if (!res.ok) throw new Error('Cloud storage failed');
          const data = await res.json();
          
          if (Array.isArray(data) && data[0]?.src) {
            const cloudUrl = `https://telegra.ph${data[0].src}`;
            setForm(prev => ({ ...prev, profilePicture: cloudUrl }));
            showToast('✅ Profile Picture එක සාර්ථකව වෙනස් කළා!');
          } else {
            throw new Error('Invalid format');
          }
        } catch (cloudErr) {
          console.warn('Cloud upload failed, falling back to local Base64 string', cloudErr);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
          setForm(prev => ({ ...prev, profilePicture: compressedBase64 }));
          showToast('⚠️ Cloud upload අසාර්ථකයි. Base64 ලෙස සුරැකුණා.');
        }
      }, 'image/jpeg', 0.8);
    };
    img.onerror = () => {
      showToast('❌ වලංගු Image එකක් තෝරන්න.', 'error');
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
};

const EditCustomerModal = memo(function EditCustomerModal({ isOpen, onClose, customer, onSave, lang, showToast }) {
  const t = translations[lang];
  const [form, setForm] = useState({ name: '', phone: '', address: '', profilePicture: '' });
  
  useEffect(() => { 
    if (isOpen && customer) {
      setForm({ 
        name: customer.name || '', 
        phone: formatPhoneWithCode(customer.phone), 
        address: customer.address || '',
        profilePicture: customer.profilePicture || ''
      }); 
    }
  }, [isOpen, customer]);
  
  if (!isOpen) return null;
  
  return (
    <div style={styles.modalOverlay}><div style={styles.modal}>
      <h3>✏️ {t.editTitle}</h3>
      
      {/* profilePicture drag/select upload field */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ position: 'relative', width: 90, height: 90 }}>
          {form.profilePicture ? (
            <img src={form.profilePicture} style={{ width: 90, height: 90, borderRadius: '50%', objectFit: 'cover', border: '3px solid #3b82f6' }} alt="" />
          ) : (
            <div style={{ width: 90, height: 90, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: '#94a3b8' }}>👤</div>
          )}
          {form.profilePicture && (
            <button 
              type="button" 
              onClick={() => setForm(p => ({ ...p, profilePicture: '' }))} 
              style={{ position: 'absolute', top: 0, right: 0, background: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 11, fontWeight: 'bold' }}
            >
              ✕
            </button>
          )}
        </div>
        <input 
          type="file" 
          accept="image/*" 
          id="profile-pic-input" 
          style={{ display: 'none' }} 
          onChange={(e) => handleAvatarUpload(e, setForm, showToast)} 
        />
        <button 
          type="button" 
          onClick={() => document.getElementById('profile-pic-input').click()} 
          style={{ padding: '6px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#475569' }}
        >
          📷 ඡායාරූපයක් තෝරන්න (Select Photo)
        </button>
      </div>

      <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={styles.input} placeholder={t.customerName} />
      <input value={form.phone} onChange={e => setForm({ ...form, phone: handlePhoneInput(e.target.value) })} style={styles.input} />
      <textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} style={styles.textarea} placeholder={t.address} />
      <div style={styles.modalActions}>
        <button onClick={onClose} style={styles.btnCancel}>{t.cancel}</button>
        <button onClick={async () => { if (!form.name.trim()) return; try { await updateDoc(doc(db, 'customers', customer.id), form); onSave({ ...customer, ...form }); onClose(); } catch (e) { alert(e.message); } }} style={styles.btnSave}>{t.save}</button>
      </div>
    </div></div>
  );
});

const DeleteCustomerModal = memo(function DeleteCustomerModal({ isOpen, onClose, customer, onDelete, lang }) {
  const t = translations[lang]; const [confirm, setConfirm] = useState('');
  if (!isOpen) return null;
  return (
    <div style={styles.modalOverlay}><div style={styles.modal}>
      <h3>🗑️ {t.deleteCustomer}</h3>
      <p style={{ color: 'red' }}>{t.deleteWarning}</p>
      <input value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Type DELETE" style={styles.input} />
      <div style={styles.modalActions}>
        <button onClick={onClose} style={styles.btnCancel}>{t.cancel}</button>
        <button onClick={async () => { if (confirm !== 'DELETE') return; try { await deleteDoc(doc(db, 'customers', customer.id)); onDelete(); } catch (e) { alert(e.message); } }} disabled={confirm !== 'DELETE'} style={{ ...styles.btnSave, background: 'red' }}>{t.deleteCustomer}</button>
      </div>
    </div></div>
  );
});

const ServiceBillModal = memo(function ServiceBillModal({ isOpen, onClose, productionData, lang }) {
  const t = translations[lang]; if (!isOpen || !productionData) return null;
  const pe = productionData; const grand = nn(pe.grandTotal || pe.totalIncome); const paid = nn(pe.totalPaid); const bal = nn(pe.balanceDue || Math.max(0, grand - paid));
  return (
    <div style={styles.modalOverlay} onClick={onClose}><div style={{ ...styles.modal, maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
      <h3>🧾 {pe.invoiceNumber || t.serviceEntry}</h3>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 900, padding: '8px 0', borderTop: '2px solid #334155', borderBottom: '2px solid #334155', margin: '6px 0' }}><span>💰 {t.grandTotal}</span><span>Rs.{fmt(grand)}</span></div>
      {paid > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600, color: '#16a34a' }}><span>✅ {t.totalPaid}</span><span>Rs.{fmt(paid)}</span></div>}
      {bal > 0.01 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, color: '#dc2626' }}><span>🔴 {t.balanceDue}</span><span>Rs.{fmt(bal)}</span></div>}
      <button onClick={onClose} style={{ ...styles.btnFull, background: '#ef4444', marginTop: 16 }}>{t.close}</button>
    </div></div>
  );
});

// ═══════════════════════════════════════════════════════════
// ★★★ MAIN COMPONENT ★★★
// ═══════════════════════════════════════════════════════════
export default function CustomerDetail({ lang: propLang = 'si' }) {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const router = useRouter();

  const [lang, setLang] = useState(propLang);
  const t = useMemo(() => translations[lang] || translations.en, [lang]);
  const { user } = useUserAuth();
  
  const [isPortalMode, setIsPortalMode] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.pathname.includes('/portal/')) {
      setIsPortalMode(true);
    }
  }, []);

  const { toast, showToast } = useToast();
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const [customer, setCustomer] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [txnFilter, setTxnFilter] = useState('all');
  const [selectedProductionData, setSelectedProductionData] = useState(null);
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [invoiceSettings, setInvoiceSettings] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // ★ Receipt share states
  const [receiptInvoice, setReceiptInvoice] = useState(null);

  const [modals, setModals] = useState({
    txn: false, txnType: 'credit', editTxn: false, sendLink: false,
    edit: false, delete: false, approval: false, reminder: false,
    serviceBill: false, date: false,
  });

  const openModal = useCallback((key, extra = {}) => setModals(p => ({ ...p, [key]: true, ...extra })), []);
  const closeModal = useCallback(key => setModals(p => ({ ...p, [key]: false })), []);

  const { bankAccounts, bankLoading } = useBankAccounts(user?.uid);

  useEffect(() => {
    if (!user) return; let c = false;
    getDocs(query(collection(db, 'invoice_settings'), where('uid', '==', user.uid)))
      .then(s => { if (!c && !s.empty) setInvoiceSettings(s.docs[0].data()); }).catch(() => { });
    return () => { c = true; };
  }, [user]);

  const langRef = useRef(lang);
  useEffect(() => { langRef.current = lang; }, [lang]);

  // ── fetchData ──────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!id || !user) return;
    let cancelled = false;
    try {
      const snap = await getDoc(doc(db, 'customers', id));
      if (!snap.exists()) { setLoading(false); return; }
      const data = snap.data();
      if (data.uid && data.uid !== user.uid) { router.push('/customers'); return; }
      if (!cancelled && mountedRef.current) { setCustomer({ id: snap.id, ...data }); if (data.dueDate) setDueDate(data.dueDate); if (data.dueTime) setDueTime(data.dueTime); }

      const L = translations[langRef.current] || translations.en;
      const allTxns = [];

      const snapTxn = await getDocs(query(collection(db, 'customerTransactions'), where('customerId', '==', id), where('uid', '==', user.uid)));
      if (cancelled) return;
      snapTxn.docs.forEach(d => { const dt = d.data(); const ts = extractValidTimestamp(dt, dt.date); allTxns.push({ id: d.id, type: dt.type, amount: nn(dt.amount), date: dt.date, time: getAccurateTime(dt.time, ts), note: dt.note, source: dt.source || 'manual', receiptImage: dt.receiptImage, timestamp: ts, bankAccountName: dt.bankAccountName || null, bankAccountId: dt.bankAccountId || null }); });

      const snapInv = await getDocs(query(collection(db, 'salesInvoices'), where('customerId', '==', id), where('uid', '==', user.uid)));
      if (cancelled) return;
      snapInv.docs.forEach(d => { const di = d.data(); const ts = extractValidTimestamp(di, di.date); const gt = nn(di.grandTotal); const pa = nn(di.paidAmount); allTxns.push({ id: d.id, type: 'credit', amount: gt, date: di.date, time: getAccurateTime(di.time, ts), note: `🧾 Invoice #${di.invoiceNo || ''}`, source: 'invoice', timestamp: ts }); if (pa > 0) allTxns.push({ id: d.id + '_ip', type: 'payment', amount: pa, date: di.date, time: getAccurateTime(di.time, ts), note: `💵 ${L.invoicePayment} #${di.invoiceNo || ''}`, source: 'invoicePayment', timestamp: ts + 100 }); });

      try {
        const vtSnap = await getDocs(query(collection(db, `users/${user.uid}/vehicleTrips`), where('customerId', '==', id)));
        if (cancelled) return;
        vtSnap.docs.forEach(d => { const dt = d.data(); const ts = dt.createdAt?.toDate ? dt.createdAt.toDate().getTime() : Date.now(); const fare = nn(dt.fare); const paid = nn(dt.paidAmount); const tripDate = dt.tripDate?.toDate ? dt.tripDate.toDate().toISOString().split('T')[0] : new Date(ts).toISOString().split('T')[0]; const tm = new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }); if (fare > 0) allTxns.push({ id: d.id + '_f', type: 'credit', amount: fare, date: tripDate, time: tm, note: `🚛 ${L.transportFare} (${dt.vehicleNo || ''})`, source: 'vehicleTrip', timestamp: ts, tripData: { ...dt, fare, paidAmount: paid } }); if (paid > 0) allTxns.push({ id: d.id + '_p', type: 'payment', amount: paid, date: tripDate, time: new Date(ts + 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }), note: `🚛 ${L.transportPayment} (${dt.vehicleNo || ''})`, source: 'vehicleTrip', timestamp: ts + 1000 }); });
      } catch { }

      if (!cancelled && data.name) {
        try {
          const seen = new Set(); const peList = [];
          try { const s1 = await getDocs(query(collection(db, 'productionEntries'), where('customerId', '==', id), where('uid', '==', user.uid))); s1.docs.forEach(d => { if (!seen.has(d.id)) { seen.add(d.id); peList.push({ docId: d.id, ...d.data() }); } }); } catch { }
          if (!peList.length) { try { const s2 = await getDocs(query(collection(db, 'productionEntries'), where('customerName', '==', data.name), where('uid', '==', user.uid))); s2.docs.forEach(d => { if (!seen.has(d.id)) { seen.add(d.id); peList.push({ docId: d.id, ...d.data() }); } }); } catch { } }
          if (!cancelled) {
            peList.forEach(pe => { if (pe.isStandaloneExpense) return; const ts = pe.createdAt?.toDate ? pe.createdAt.toDate().getTime() : Date.now(); const peDate = pe.date || new Date(ts).toISOString().split('T')[0]; const gt = nn(pe.grandTotal || pe.totalIncome); const tp = nn(pe.totalPaid); if (gt > 0) allTxns.push({ id: pe.docId + '_s', type: 'credit', amount: gt, date: peDate, time: new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }), note: `🔧 ${pe.invoiceNumber || L.serviceEntry}`, source: 'production', timestamp: ts, productionData: pe }); if (tp > 0) allTxns.push({ id: pe.docId + '_p', type: 'payment', amount: tp, date: peDate, time: new Date(ts + 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }), note: `💳 ${L.servicePayment} ${pe.invoiceNumber || ''}`.trim(), source: 'production', timestamp: ts + 1000, productionData: pe }); });
          }
        } catch { }
      }

      const aSnap = await getDocs(query(collection(db, 'transactionApprovals'), where('customerId', '==', id), where('status', '==', 'pending')));
      if (cancelled) return;
      if (mountedRef.current) setPendingApprovals(aSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const deduped = removeDuplicatePayments(allTxns);
      deduped.sort((a, b) => a.timestamp - b.timestamp);
      let runBal = nn(data.initialBalance || 0);
      deduped.forEach(txn => { if (txn.type === 'credit') runBal += txn.amount; else if (txn.type === 'payment') runBal -= txn.amount; txn.runningBalance = runBal; });
      const actualBal = nn(data.currentBalance); const diff = actualBal - runBal;
      if (Math.abs(diff) > 0.5) deduped.push({ id: '_adj', type: diff > 0 ? 'credit' : 'payment', amount: Math.abs(diff), date: new Date().toISOString().split('T')[0], time: '', timestamp: Date.now(), note: `⚙️ ${L.adjustment}`, source: 'adjustment', runningBalance: actualBal, isAdjustment: true });
      if (!cancelled && mountedRef.current) { setTransactions(deduped.reverse()); setLoading(false); }
    } catch (err) { console.error(err); if (mountedRef.current) setLoading(false); }
  }, [id, user, router]);

  useEffect(() => { if (user && id) fetchData(); }, [id, user, fetchData]);

  // ─── handleTransactionConfirm ──────────────────────────
  const handleTransactionConfirm = useCallback(async ({
    type, amount, note, date, method,
    receiptImage, bankAccountId, bankAccountName
  }) => {
    if (!customer || isProcessing) return;
    setIsProcessing(true);

    const isCredit = type === 'credit';
    const isBank = method === 'bank' && !!bankAccountId;
    const now = new Date();
    const timeStr = nowHHMM24();
    const dateStr = localDateStr();
    const nowTs = Timestamp.now();
    const refNo = `${isCredit ? 'CRD' : 'PAY'}${now.getTime().toString(36).toUpperCase().slice(-8)}`;

    try {
      const customerRef = doc(db, 'customers', id);
      let newBalance = 0;

      // ① Atomic customer balance update
      await runTransaction(db, async tx => {
        const custSnap = await tx.get(customerRef);
        if (!custSnap.exists()) throw new Error('Customer not found');
        const curBal = nn(custSnap.data().currentBalance);
        newBalance = isCredit ? curBal + amount : curBal - amount;
        tx.update(customerRef, { currentBalance: newBalance, updatedAt: serverTimestamp() });
      });

      // ② customerTransactions record
      const txnData = {
        uid: user.uid, customerId: id, type, amount, date,
        time: timeStr, note: note || (isCredit ? t.addCredit : t.getPayment),
        receiptImage: receiptImage || null, paymentMethod: method,
        source: isCredit ? 'manual_credit' : 'manual',
        createdAt: serverTimestamp(), timestamp: now.getTime(),
        createdBy: user.email || 'Unknown',
      };
      if (isBank) { txnData.bankAccountId = bankAccountId; txnData.bankAccountName = bankAccountName; }
      const txnRef = await addDoc(collection(db, 'customerTransactions'), txnData);

      // ③ cashTransactions record
      const cashData = {
        type: isCredit ? 'out' : 'in',
        category: isCredit ? 'customerCredit' : 'invoicePayment',
        source: isCredit ? 'customerCredit' : 'invoicePayment',
        description: isCredit 
          ? `👤 ${customer.name || 'Customer'} — ණය ලබාදීම${note ? ' | ' + note : ''}`
          : `💵 පාරිභෝගික ගෙවීම් ලැබීම [${customer.name || 'Customer'}]${note ? ' | ' + note : ''}`,
        amount, paymentMethod: method,
        customerId: id, customerName: customer.name,
        customerPhone: customer.phone || '', customerTxnId: txnRef.id,
        invoiceNo: note || '', reference: note || '', notes: note || '',
        date, time: timeStr,
        timestamp: nowTs,
        createdAt: serverTimestamp(), createdBy: user.email || 'Unknown',
        uid: user.uid, isAutomatic: true,
      };
      if (isBank) { cashData.bankAccountId = bankAccountId; cashData.bankAccountName = bankAccountName; }
      await addDoc(collection(db, `users/${user.uid}/cashTransactions`), cashData);

      showToast(isCredit ? t.creditAdded : t.paymentReceived);
      closeModal('txn');

      // ★ Construct synthetic invoice payload for InvoiceOutputManager
      const methodMap = { cash: 'cash', bank: 'etransfer', card: 'card', cheque: 'cheque' };
      const synthetic = {
        _isReceipt: true,
        _receiptType: isCredit ? 'credit' : 'payment',
        id: txnRef.id,
        invoiceNo: refNo,
        invoiceCode: `${isCredit ? 'CRD' : 'PAY'}-${refNo}`,
        createdAt: nowTs,
        customerName:    customer.name || '',
        customerPhone:   customer.phone || '',
        customerAddress: customer.address || '',
        customerId:      id,
        customerCurrentBalance: newBalance,
        previousOutstanding: isCredit ? newBalance - amount : newBalance + amount,
        newOutstanding: newBalance,
        items: [{
          name: isCredit ? 'ණය ඇතුළු කිරීම' : 'ගෙවීම් රිසිට්පත',
          nameSi: isCredit ? 'ණය' : 'ගෙවීම',
          qty: 1, sellingPrice: amount, yourPrice: amount, lineTotal: amount,
          uom: 'unit', warrantyCode: '',
        }],
        grossTotal: amount, totalDiscount: 0, billDiscount: 0,
        billDiscountPercent: 0, exchangeAmount: 0,
        netAmount: amount, payAmount: isCredit ? 0 : amount, balance: isCredit ? -amount : 0,
        paymentMethod: methodMap[method] || 'cash',
        remarks: note || '',
        invoiceRemark: note || '',
        _docType: isCredit ? 'credit_receipt' : 'payment_receipt',
      };

      setReceiptInvoice(synthetic);
      setCustomer(prev => prev ? { ...prev, currentBalance: newBalance } : prev);
      fetchData();

    } catch (err) {
      console.error(err);
      showToast('❌ ' + err.message, 'error');
    } finally {
      if (mountedRef.current) setIsProcessing(false);
    }
  }, [customer, isProcessing, id, user, t, showToast, closeModal, fetchData]);

  // ── Other handlers ─────────────────────────────────────
  const handleEditTxn = useCallback(async updated => {
    try {
      const diff = updated.amount - selectedTxn.amount;
      const balChange = updated.type === 'credit' ? diff : -diff;
      await updateDoc(doc(db, 'customerTransactions', updated.id), { amount: updated.amount, note: updated.note, date: updated.date });
      await updateDoc(doc(db, 'customers', id), { currentBalance: increment(balChange) });
      showToast('✅ Updated!'); closeModal('editTxn'); fetchData();
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
  }, [selectedTxn, id, showToast, closeModal, fetchData]);

  const handleDeleteTxn = useCallback(async txn => {
    if (!window.confirm(t.confirmDeleteTxn)) return;
    try {
      await deleteDoc(doc(db, 'customerTransactions', txn.id));
      await updateDoc(doc(db, 'customers', id), { currentBalance: increment(txn.type === 'credit' ? -txn.amount : txn.amount) });
      const cs = await getDocs(query(collection(db, `users/${user.uid}/cashTransactions`), where('customerTxnId', '==', txn.id)));
      await Promise.all(cs.docs.map(d => deleteDoc(doc(db, `users/${user.uid}/cashTransactions`, d.id))));
      showToast('🗑️ Deleted!'); fetchData();
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
  }, [id, user, t, showToast, fetchData]);

  const handleApprove = useCallback(async txn => {
    if (!window.confirm('Approve?')) return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'customers', id), { currentBalance: increment(-nn(txn.amount)) });
      const newRef = doc(collection(db, 'customerTransactions'));
      batch.set(newRef, { customerId: id, uid: user.uid, type: 'payment', amount: nn(txn.amount), date: txn.date, note: txn.note, receiptImage: txn.receiptImage, createdAt: serverTimestamp(), source: 'manual', timestamp: Date.now() });
      batch.update(doc(db, 'transactionApprovals', txn.id), { status: 'approved', approvedAt: serverTimestamp() });
      await batch.commit();
      showToast('✅ Approved!'); fetchData();
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
  }, [id, user, showToast, fetchData]);

  const handleSetDueDate = useCallback(async () => {
    try { await updateDoc(doc(db, 'customers', id), { dueDate, dueTime }); showToast(t.dueDateSet); closeModal('date'); }
    catch (e) { showToast('❌ ' + e.message, 'error'); }
  }, [dueDate, dueTime, id, t, showToast, closeModal]);

  // ── Derived ────────────────────────────────────────────
  const hasVehicle = useMemo(() => transactions.some(x => x.source === 'vehicleTrip'), [transactions]);
  const hasServices = useMemo(() => transactions.some(x => x.source === 'production'), [transactions]);
  const filterTabs = useMemo(() => {
    const tabs = [{ key: 'all', label: t.filterAll, icon: '📋' }, { key: 'shop', label: t.filterShop, icon: '🛍️' }];
    if (hasVehicle) tabs.push({ key: 'vehicle', label: t.filterVehicle, icon: '🚛' });
    if (hasServices) tabs.push({ key: 'services', label: t.filterServices, icon: '🔧' });
    tabs.push({ key: 'payments', label: t.filterPayments, icon: '💰' });
    return tabs;
  }, [t, hasVehicle, hasServices]);

  const filteredTxns = useMemo(() => transactions.filter(tx => {
    if (txnFilter === 'all') return true;
    if (txnFilter === 'vehicle') return tx.source === 'vehicleTrip';
    if (txnFilter === 'shop') return ['manual', 'manual_credit', 'invoice', 'invoicePayment'].includes(tx.source);
    if (txnFilter === 'services') return tx.source === 'production';
    if (txnFilter === 'payments') return tx.type === 'payment';
    return true;
  }), [transactions, txnFilter]);

  const getSourceBadge = useCallback(txn => {
    const map = {
      vehicleTrip: { bg: '#bae6fd', color: '#0369a1', label: `🚛 ${t.vehicleTrip}` },
      production: { bg: '#ddd6fe', color: '#7c3aed', label: `🔧 ${t.serviceEntry}` },
      invoice: { bg: '#fef3c7', color: '#b45309', label: '🧾 Invoice' },
      invoicePayment: { bg: '#dcfce7', color: '#16a34a', label: `💵 ${t.invoicePayment}` },
      adjustment: { bg: '#fef2f2', color: '#dc2626', label: `⚙️ ${t.adjustment}` },
      manual_credit: { bg: '#fce7f3', color: '#be185d', label: `➕ ${t.addCredit}` },
    };
    return map[txn.source] || { bg: '#e2e8f0', color: '#475569', label: '💳 Manual' };
  }, [t]);

  const totalCredits = useMemo(() => transactions.filter(x => x.type === 'credit' && !x.isAdjustment).reduce((s, x) => s + x.amount, 0), [transactions]);
  const totalPayments = useMemo(() => transactions.filter(x => x.type === 'payment' && !x.isAdjustment).reduce((s, x) => s + x.amount, 0), [transactions]);
  const curBal = nn(customer?.currentBalance);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>{t.loading}</div>;
  if (!customer) return <div>Customer not found</div>;

  return (
    <div style={styles.container}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}.spinner{border:3px solid rgba(0,0,0,0.1);border-left-color:#3b82f6;border-radius:50%;width:20px;height:20px;animation:spin 1s linear infinite;display:inline-block;vertical-align:middle;margin-right:6px}`}</style>
      <Toast toast={toast} />

      {/* Modals */}
      <TransactionModal show={modals.txn} type={modals.txnType} customer={customer} onClose={() => closeModal('txn')} onConfirm={handleTransactionConfirm} isProcessing={isProcessing} bankAccounts={bankAccounts} bankLoading={bankLoading} t={t} lang={lang} />
      <EditTransactionModal isOpen={modals.editTxn} onClose={() => closeModal('editTxn')} txn={selectedTxn} onSave={handleEditTxn} lang={lang} />
      <SendLinkModal isOpen={modals.sendLink} onClose={() => closeModal('sendLink')} customer={customer} onUpdateCustomer={setCustomer} lang={lang} />
      <EditCustomerModal isOpen={modals.edit} onClose={() => closeModal('edit')} customer={customer} onSave={setCustomer} lang={lang} showToast={showToast} />
      <DeleteCustomerModal isOpen={modals.delete} onClose={() => closeModal('delete')} customer={customer} onDelete={() => router.push('/customers')} lang={lang} />
      <ReminderModal isOpen={modals.reminder} onClose={() => closeModal('reminder')} customer={customer} lang={lang} onUpdateCustomer={setCustomer} />
      <ServiceBillModal isOpen={modals.serviceBill} onClose={() => closeModal('serviceBill')} productionData={selectedProductionData} lang={lang} />

      {modals.date && (
        <div style={styles.modalOverlay}><div style={styles.modal}>
          <h3>📅 {t.setDueDate}</h3>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={styles.input} />
          <input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} style={styles.input} />
          <div style={styles.modalActions}>
            <button onClick={() => closeModal('date')} style={styles.btnCancel}>{t.cancel}</button>
            <button onClick={handleSetDueDate} style={styles.btnSave}>{t.save}</button>
          </div>
        </div></div>
      )}

      {modals.approval && (
        <div style={styles.modalOverlay}><div style={styles.modal}>
          <h3>✅ {t.approvals}</h3>
          {pendingApprovals.length === 0 ? <p style={{ textAlign: 'center', color: '#888' }}>{t.noApprovals}</p>
            : pendingApprovals.map(p => (
              <div key={p.id} style={{ borderBottom: '1px solid #eee', padding: 10 }}>
                <p>Rs. {p.amount} - {p.note}</p>
                {p.receiptImage && <img src={p.receiptImage} style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 5 }} alt="" />}
                <button onClick={() => handleApprove(p)} style={{ ...styles.btnSave, marginTop: 5 }}>Approve</button>
              </div>
            ))}
          <button onClick={() => closeModal('approval')} style={{ marginTop: 10, width: '100%', padding: 10 }}>{t.close}</button>
        </div></div>
      )}

      {/* Header */}
      <div style={styles.headerCard}>
        {customer.profilePicture ? (
          <img src={customer.profilePicture} style={{ width: 90, height: 90, borderRadius: '50%', objectFit: 'cover', border: '3px solid #e2e8f0', marginBottom: 12, display: 'inline-block' }} alt="" />
        ) : (
          <div style={{ width: 90, height: 90, borderRadius: '50%', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'white', fontSize: 32, marginBottom: 12 }}>
            {(customer.name || '?')[0].toUpperCase()}
          </div>
        )}
        <h1>{customer.name}</h1>
        <p>{formatPhoneWithCode(customer.phone)}</p>
        <div style={{ background: curBal > 0 ? '#fef2f2' : curBal < 0 ? '#eff6ff' : '#f0fdf4', border: `2px solid ${curBal > 0 ? '#fecaca' : curBal < 0 ? '#bfdbfe' : '#bbf7d0'}`, borderRadius: 12, padding: 15, margin: '10px 0', textAlign: 'center' }}>
          <small style={{ color: '#64748b' }}>{t.balance}</small>
          <h2 style={{ color: curBal > 0 ? '#dc2626' : curBal < 0 ? '#2563eb' : '#16a34a', fontSize: 32, margin: '5px 0' }}>Rs. {fmt(Math.abs(curBal))}</h2>
          {curBal > 0.01 && <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 700 }}>⚠️ ගෙවීමට ඇත</span>}
          {curBal < -0.01 && <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 700 }}>💰 ඔබට ලැබිය යුතුයි</span>}
          {Math.abs(curBal) <= 0.01 && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 700 }}>✅ සියල්ල ගෙවා ඇත</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <div style={{ flex: 1, background: '#fef2f2', padding: 8, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 10, color: '#dc2626', fontWeight: 600 }}>{t.totalCredits}</div><div style={{ fontSize: 14, fontWeight: 800, color: '#dc2626' }}>Rs.{fmt(totalCredits)}</div></div>
          <div style={{ flex: 1, background: '#f0fdf4', padding: 8, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>{t.totalPayments}</div><div style={{ fontSize: 14, fontWeight: 800, color: '#16a34a' }}>Rs.{fmt(totalPayments)}</div></div>
        </div>
        {customer.dueDate && <div style={styles.dueDateBadge}>📅 Due: {customer.dueDate} {customer.dueTime}</div>}
      </div>

      {/* Language toggle */}
      <div style={styles.langToggleContainer}>
        <button onClick={() => setLang('si')} style={{ ...styles.langBtn, ...(lang === 'si' ? styles.langBtnActive : {}) }}>🇱🇰 සිංහල</button>
        <button onClick={() => setLang('en')} style={{ ...styles.langBtn, ...(lang === 'en' ? styles.langBtnActive : {}) }}>🇬🇧 English</button>
      </div>

      {/* Action buttons */}
      <div style={styles.actionGrid}>
        {!isPortalMode && (<>
          <button onClick={() => openModal('txn', { txnType: 'credit' })} style={styles.actionBtn('#fee2e2', '#dc2626')}><span style={{ fontSize: 24 }}>➕</span> {t.addCredit}</button>
          <button onClick={() => openModal('txn', { txnType: 'payment' })} style={styles.actionBtn('#dcfce7', '#16a34a')}><span style={{ fontSize: 24 }}>💰</span> {t.getPayment}</button>
          <button onClick={() => openModal('reminder')} style={styles.actionBtn('#fef3c7', '#d97706')}><span style={{ fontSize: 24 }}>🔔</span> {t.remind}</button>
          <button onClick={() => openModal('date')} style={styles.actionBtn('#e0e7ff', '#4338ca')}><span style={{ fontSize: 24 }}>📅</span> {t.setDueDate}</button>
          <button onClick={() => openModal('approval')} style={{ ...styles.actionBtn('#ffedd5', '#ea580c'), position: 'relative' }}>
            <span style={{ fontSize: 24 }}>✅</span> {t.approvals}
            {pendingApprovals.length > 0 && <span style={styles.badge}>{pendingApprovals.length}</span>}
          </button>
          <button onClick={() => openModal('sendLink')} style={styles.actionBtn('#f0fdf4', '#166534')}><span style={{ fontSize: 24 }}>📎</span> {t.sendLink}</button>
          <button onClick={() => openModal('edit')} style={styles.actionBtn('#fef3c7', '#b45309')}><span style={{ fontSize: 24 }}>✏️</span> {t.editCustomer}</button>
          <button onClick={() => openModal('delete')} style={styles.actionBtn('#fee2e2', '#dc2626')}><span style={{ fontSize: 24 }}>🗑️</span> {t.deleteCustomer}</button>
          <button onClick={() => router.push('/reminders')} style={styles.actionBtn('#dbeafe', '#1e40af')}><span style={{ fontSize: 24 }}>🔔</span> {t.autoRemind}</button>
        </>)}
        <button onClick={() => customer.portalAccessKey ? window.open(`/portal/${customer.portalAccessKey}`, '_blank') : alert("Click 'Send Link' first.")} style={styles.actionBtn('#f3f4f6', '#334155')}><span style={{ fontSize: 24 }}>📄</span> {t.viewReport}</button>
      </div>

      {/* Transaction list */}
      <div style={styles.listContainer}>
        <h3>📋 {t.transactionHistory}</h3>
        {filterTabs.length > 2 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
            {filterTabs.map(tab => (
              <button key={tab.key} onClick={() => setTxnFilter(tab.key)}
                style={{ padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: txnFilter === tab.key ? 700 : 500, background: txnFilter === tab.key ? '#3b82f6' : '#f1f5f9', color: txnFilter === tab.key ? 'white' : '#64748b', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                <span>{tab.icon}</span><span>{tab.label}</span>
              </button>
            ))}
          </div>
        )}

        {filteredTxns.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>
            {txnFilter === 'vehicle' ? `🚛 ${t.noVehicleTrips}` : txnFilter === 'services' ? `🔧 ${t.noServices}` : t.noTransactions}
          </div>
        ) : filteredTxns.map((txn, i) => {
          const badge = getSourceBadge(txn);
          const isVeh = txn.source === 'vehicleTrip';
          const isProd = txn.source === 'production';
          const isAdj = txn.source === 'adjustment';

          let rowBg = txn.type === 'payment' ? '#f0fdf4' : '#fff';
          if (isVeh) rowBg = txn.type === 'credit' ? '#f0f9ff' : '#f0fdf4';
          if (isProd) rowBg = txn.type === 'credit' ? '#faf5ff' : '#f0fdf4';
          if (txn.source === 'invoicePayment') rowBg = '#f0fdf4';
          if (isAdj) rowBg = '#fef2f2';

          return (
            <div key={txn.id + i} style={{ padding: 16, borderBottom: '1px solid #e2e8f0', background: rowBg }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, color: '#1e293b', fontSize: 14 }}>{txn.date}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>⏱️ {txn.time}</div>
                  <div style={{ fontSize: 14, color: '#334155', marginTop: 6 }}>{txn.note}</div>
                  {txn.bankAccountName && (
                    <div style={{ marginTop: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#eff6ff', color: '#1d4ed8', display: 'inline-block' }}>🏦 {txn.bankAccountName}</span>
                    </div>
                  )}
                  {isVeh && txn.type === 'credit' && txn.tripData && (
                    <div style={{ marginTop: 8, padding: '6px 12px', background: '#e0f2fe', borderRadius: 8, border: '1px solid #bae6fd', fontSize: 12, display: 'inline-block' }}>
                      <span style={{ color: '#0369a1', fontWeight: 600 }}>{t.tripFare}: Rs.{txn.tripData.fare?.toLocaleString()} | {t.tripPaid}: Rs.{txn.tripData.paidAmount?.toLocaleString()}</span>
                    </div>
                  )}
                  {isProd && txn.type === 'credit' && txn.productionData && (
                    <div style={{ marginTop: 8 }}>
                      <button onClick={() => { setSelectedProductionData(txn.productionData); openModal('serviceBill'); }}
                        style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, border: '1px solid #8b5cf6', background: '#f5f3ff', color: '#7c3aed', cursor: 'pointer' }}>
                        🧾 {t.viewBill}
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 15 }}>
                  <div style={{ fontWeight: 900, fontSize: 18, color: txn.type === 'credit' ? '#dc2626' : '#16a34a' }}>
                    {txn.type === 'credit' ? '+' : '-'}Rs. {fmt(txn.amount)}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 6, fontWeight: 700, background: '#f8fafc', padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, display: 'inline-block', color: (txn.runningBalance || 0) > 0.01 ? '#dc2626' : (txn.runningBalance || 0) < -0.01 ? '#2563eb' : '#16a34a' }}>
                    {t.runningBalance}: Rs. {fmt(txn.runningBalance || 0)}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12, display: 'inline-block', background: badge.bg, color: badge.color }}>
                    {badge.label}
                  </div>
                  {(txn.source === 'manual' || txn.source === 'manual_credit') && (
                    <div style={{ marginTop: 8 }}>
                      <button onClick={() => { setSelectedTxn(txn); openModal('editTxn'); }} style={styles.iconBtn}>✏️</button>
                      <button onClick={() => handleDeleteTxn(txn)} style={styles.iconBtn}>🗑️</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Invoice Output Manager (PDF/Receipt Sharing Integration) */}
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

// ─── Styles ───────────────────────────────────────────────
const styles = {
  container: { padding: 20, maxWidth: 800, margin: '0 auto', fontFamily: 'sans-serif', paddingBottom: 50 },
  headerCard: { textAlign: 'center', padding: 30, background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)', borderRadius: 16, marginBottom: 20, border: '2px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' },
  actionGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 20 },
  actionBtn: (bg, color) => ({ padding: 15, background: bg, color, border: 'none', borderRadius: 12, fontWeight: 800, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', position: 'relative' }),
  listContainer: { background: 'white', padding: 20, borderRadius: 16, boxShadow: '0 4px 15px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' },
  iconBtn: { background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, padding: '6px 10px', marginLeft: 6 },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 },
  modal: { background: 'white', padding: 25, borderRadius: 16, width: '90%', maxWidth: 400, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', maxHeight: '90vh', overflowY: 'auto' },
  input: { width: '100%', padding: 14, border: '2px solid #e2e8f0', borderRadius: 10, marginBottom: 12, fontSize: 15, boxSizing: 'border-box', outline: 'none' },
  textarea: { width: '100%', padding: 14, border: '2px solid #e2e8f0', borderRadius: 10, marginBottom: 12, height: 80, fontSize: 15, boxSizing: 'border-box', outline: 'none' },
  modalActions: { display: 'flex', gap: 10, marginTop: 15 },
  btnCancel: { flex: 1, padding: 14, background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 10, fontWeight: 'bold', cursor: 'pointer' },
  btnSave: { flex: 1, padding: 14, background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: 'white', border: 'none', borderRadius: 10, fontWeight: 'bold', cursor: 'pointer' },
  btnFull: { width: '100%', padding: 14, border: 'none', borderRadius: 10, fontWeight: 'bold', cursor: 'pointer', fontSize: 15, color: 'white', background: '#3b82f6' },
  langToggleContainer: { display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 20 },
  langBtn: { padding: '8px 20px', border: '2px solid #e2e8f0', background: 'white', color: '#64748b', borderRadius: 25, cursor: 'pointer', fontWeight: 700, fontSize: 13 },
  langBtnActive: { background: '#3b82f6', color: 'white', border: '2px solid #3b82f6' },
  badge: { position: 'absolute', top: -5, right: -5, background: '#ef4444', color: 'white', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 'bold', border: '2px solid white' },
  dueDateBadge: { background: '#fee2e2', color: '#991b1b', padding: '6px 12px', borderRadius: 20, fontSize: 12, marginTop: 10, display: 'inline-block', fontWeight: 'bold' },
  formLabel: { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5, color: '#374151' },
};