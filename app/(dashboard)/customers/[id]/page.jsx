'use client';

// app/(dashboard)/customers/[id]/page.jsx
// ✅ Next.js App Router compatible
// ✅ React Router removed — useRouter + useParams from next/navigation
// ✅ firebase-config from @/shared/firebase-config
// ✅ UserContext from @/context/UserContext

import React, {
  useState, useEffect, useRef, useCallback, useMemo, memo
} from 'react';
import { useRouter, useParams } from 'next/navigation';
import { db } from '@/shared/firebase-config';
import { useUserAuth } from '@/context/UserContext';
import {
  doc, getDoc, collection, query, where, orderBy,
  getDocs, addDoc, serverTimestamp, updateDoc, increment,
  deleteDoc, runTransaction, writeBatch, Timestamp
} from 'firebase/firestore';

/* ══════════════════════════════════════════════════════════════
   UTILITIES
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
    remind: 'මතක් කරන්න', setDueDate: 'ගෙවිය යුතු දිනය',
    whatsapp: 'WhatsApp', sms: 'SMS', dueDateSet: 'දිනය යාවත්කාලීන විය!',
    approvals: 'අනුමැතිය', noApprovals: 'අනුමත කිරීමට කිසිවක් නැත',
    sendLink: 'Link යවන්න', editCustomer: 'සංශෝධනය',
    deleteCustomer: 'මකන්න', editTitle: 'සංශෝධනය',
    customerName: 'නම', phone: 'දුරකථනය', address: 'ලිපිනය',
    updateSuccess: 'යාවත්කාලීන විය!', deleteConfirm: 'මකා දමන්නද?',
    deleteWarning: '⚠️ ආපසු හැරවිය නොහැක!', deleteSuccess: 'මකා දමන ලදී!',
    updating: 'යාවත්කාලීන...', generatingLink: 'Link සකසමින්...',
    copyLink: '📋 Copy', copied: '✅ Copied!', close: 'වසන්න',
    editTxn: 'ගනුදෙනුව සංස්කරණය', deleteTxn: 'මකන්න',
    confirmDeleteTxn: 'ගනුදෙනුව මකා දැමීමට?', updateTxn: 'යාවත්කාලීන',
    selectImage: '🖼️ ගැලරිය', openCamera: '📷 කැමරාව',
    reminderTitle: 'සිහිකැඳවීම', capture: 'ගන්න',
    reminderMsg: 'ගෙවීමට Rs.{amount} ඇත.\n\nවිස්තර: {link}',
    vehicleTrip: 'වාහන ගමන', tripFare: 'ගාස්තුව', tripPaid: 'ගෙවූ',
    filterAll: 'සියල්ල', filterShop: 'සාප්පු', filterVehicle: 'වාහන',
    filterPayments: 'ගෙවීම්', filterServices: 'සේවා',
    noVehicleTrips: 'වාහන ගමන් නොමැත', noTransactions: 'ගනුදෙනු නොමැත',
    noServices: 'සේවා නොමැත', transportFare: 'ප්‍රවාහන ගාස්තු',
    transportPayment: 'ප්‍රවාහන ගෙවීම', serviceEntry: 'සේවා ඇතුළත් කිරීම',
    serviceItems: 'සේවා', partsUsed: 'කොටස්', labourCost: 'ශ්‍රම',
    totalPaid: 'ගෙවූ', balanceDue: 'ගෙවිය යුතු', grandTotal: 'එකතුව',
    discount: 'වට්ටම්', servicePayment: 'සේවා ගෙවීම',
    fullPaid: 'සම්පූර්ණ', partialPaid: 'අර්ධ', unpaid: 'නොගෙවූ',
    warranty: 'වගකීම', days: 'දින', viewBill: 'බිල්පත',
    invoicePayment: 'Invoice ගෙවීම', adjustment: 'ශේෂ සැකසුම',
    totalCredits: 'මුළු ණය', totalPayments: 'මුළු ගෙවීම්',
    paymentMethod: 'ගෙවීම් ක්‍රමය', bankAccount: 'බැංකු ගිණුම',
    selectBankAccount: 'බැංකු ගිණුම තෝරන්න *',
    noBankAccounts: 'බැංකු ගිණුම් නොමැත.',
    bankBalanceBefore: 'වත්මන් බැංකු ශේෂය',
    bankBalanceAfter: 'ගනුදෙනුවෙන් පසු ශේෂය',
    customerBalanceAfter: 'නව ශේෂය',
    addCreditTitle: '➕ ණය එකතු කිරීම',
    receivePaymentTitle: '💰 මුදල් ලබාගැනීම',
    creditDescription: 'ණය විස්තරය', paymentDescription: 'ගෙවීම් විස්තරය',
    creditAmount: 'ණය මුදල', paymentAmount: 'ලැබෙන මුදල',
    saveCredit: '➕ ණය එකතු කරන්න', savePayment: '💰 ලබාගන්න',
    processing: 'සකසමින්...', cash: '💵 මුදල්',
    bank: '🏦 බැංකු', cheque: '📝 චෙක්',
    creditAdded: '✅ ණය සාර්ථකව එකතු විය!',
    paymentReceived: '✅ මුදල් ලැබීම සාර්ථකයි!',
    autoRemind: '🔔 Auto Remind', back: '← ආපසු',
    shareReceipt: 'බිල්පත යවන්න',
    shareViaWhatsApp: '💬 WhatsApp මගින් යවන්න',
    shareViaSMS: '📩 SMS මගින් යවන්න',
    copyReceipt: '📋 පිටපත් කරන්න', printReceipt: '🖨️ මුද්‍රණය',
    skipShare: 'මේ වතාවේ නැත', receiptTitle: '🧾 ගනුදෙනු රිසිට්පත',
    creditReceiptMsg: '🧾 *ණය රිසිට්පත*\n\n👤 පාරිබෝගිකයා: {name}\n📅 දිනය: {date}\n💰 මුදල: Rs.{amount}\n📝 විස්තරය: {note}\n🔖 ක්‍රමය: {method}\n\n💳 *නව ශේෂය: Rs.{newBalance}*\n\n📋 Ref: #{ref}\n{footer}',
    paymentReceiptMsg: '🧾 *ගෙවීම් රිසිට්පත*\n\n👤 පාරිබෝගිකයා: {name}\n📅 දිනය: {date}\n💰 ගෙවූ මුදල: Rs.{amount}\n📝 විස්තරය: {note}\n🔖 ක්‍රමය: {method}\n\n💳 *නව ශේෂය: Rs.{newBalance}*\n\n📋 Ref: #{ref}\n{footer}',
    billSentSuccess: '✅ බිල්පත සාර්ථකව යැවීය!',
    receiptCopied: '📋 රිසිට්පත පිටපත් විය!',
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
    remind: 'Remind', setDueDate: 'Set Due Date',
    whatsapp: 'WhatsApp', sms: 'SMS', dueDateSet: 'Due date updated!',
    approvals: 'Approvals', noApprovals: 'No pending approvals',
    sendLink: 'Send Link', editCustomer: 'Edit',
    deleteCustomer: 'Delete', editTitle: 'Edit Customer',
    customerName: 'Name', phone: 'Phone', address: 'Address',
    updateSuccess: 'Updated!', deleteConfirm: 'Delete this customer?',
    deleteWarning: '⚠️ Cannot be undone!', deleteSuccess: 'Deleted!',
    updating: 'Updating...', generatingLink: 'Generating...',
    copyLink: '📋 Copy Link', copied: '✅ Copied!', close: 'Close',
    editTxn: 'Edit Transaction', deleteTxn: 'Delete',
    confirmDeleteTxn: 'Delete this transaction?', updateTxn: 'Update',
    selectImage: '🖼️ Gallery', openCamera: '📷 Camera',
    reminderTitle: 'Send Reminder', capture: 'Capture',
    reminderMsg: 'You owe Rs.{amount}. Please settle soon.\n\nDetails: {link}',
    vehicleTrip: 'Vehicle Trip', tripFare: 'Fare', tripPaid: 'Paid',
    filterAll: 'All', filterShop: 'Shop', filterVehicle: 'Vehicle',
    filterPayments: 'Payments', filterServices: 'Services',
    noVehicleTrips: 'No vehicle trips', noTransactions: 'No transactions',
    noServices: 'No service entries', transportFare: 'Transport Fare',
    transportPayment: 'Transport Payment', serviceEntry: 'Service Entry',
    serviceItems: 'Services', partsUsed: 'Parts', labourCost: 'Labour',
    totalPaid: 'Paid', balanceDue: 'Balance Due', grandTotal: 'Grand Total',
    discount: 'Discount', servicePayment: 'Service Payment',
    fullPaid: 'Fully Paid', partialPaid: 'Partial', unpaid: 'Unpaid',
    warranty: 'Warranty', days: 'days', viewBill: 'View Bill',
    invoicePayment: 'Invoice Payment', adjustment: 'Adjustment',
    totalCredits: 'Total Credits', totalPayments: 'Total Payments',
    paymentMethod: 'Payment Method', bankAccount: 'Bank Account',
    selectBankAccount: 'Select Bank Account *',
    noBankAccounts: 'No bank accounts.',
    bankBalanceBefore: 'Current Bank Balance',
    bankBalanceAfter: 'Bank Balance After',
    customerBalanceAfter: 'New Customer Balance',
    addCreditTitle: '➕ Add Credit Entry',
    receivePaymentTitle: '💰 Receive Payment',
    creditDescription: 'Credit Description',
    paymentDescription: 'Payment Description',
    creditAmount: 'Credit Amount', paymentAmount: 'Payment Amount',
    saveCredit: '➕ Add Credit', savePayment: '💰 Receive',
    processing: 'Processing...', cash: '💵 Cash',
    bank: '🏦 Bank Transfer', cheque: '📝 Cheque',
    creditAdded: '✅ Credit added successfully!',
    paymentReceived: '✅ Payment received successfully!',
    autoRemind: '🔔 Auto Remind', back: '← Back',
    shareReceipt: 'Share Receipt',
    shareViaWhatsApp: '💬 Share via WhatsApp',
    shareViaSMS: '📩 Share via SMS',
    copyReceipt: '📋 Copy Receipt', printReceipt: '🖨️ Print',
    skipShare: 'Skip for now', receiptTitle: '🧾 Transaction Receipt',
    creditReceiptMsg: '🧾 *Credit Receipt*\n\n👤 Customer: {name}\n📅 Date: {date}\n💰 Amount: Rs.{amount}\n📝 Details: {note}\n🔖 Method: {method}\n\n💳 *New Balance: Rs.{newBalance}*\n\n📋 Ref: #{ref}\n{footer}',
    paymentReceiptMsg: '🧾 *Payment Receipt*\n\n👤 Customer: {name}\n📅 Date: {date}\n💰 Paid: Rs.{amount}\n📝 Details: {note}\n🔖 Method: {method}\n\n💳 *New Balance: Rs.{newBalance}*\n\n📋 Ref: #{ref}\n{footer}',
    billSentSuccess: '✅ Receipt shared successfully!',
    receiptCopied: '📋 Receipt copied to clipboard!',
  },
};

/* ══════════════════════════════════════════════════════════════
   PRINT RECEIPT
   ══════════════════════════════════════════════════════════════ */
const printTransactionReceipt = ({
  customer, type, amount, note, date,
  method, bankAccountName, t, lang, invoiceSettings
}) => {
  if (typeof window === 'undefined') return;
  const win = window.open('', '_blank');
  if (!win) return;
  const isCredit = type === 'credit';
  const hg = isCredit ? '#dc2626' : '#16a34a';
  const icon = isCredit ? '➕' : '💰';
  const refNo = Date.now().toString(36).toUpperCase().slice(-8);
  const dateStr = new Date().toLocaleString('en-LK', {
    year:'numeric', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit'
  });
  const methodLabel =
    method === 'bank' ? (lang === 'si' ? 'බැංකු මාරු' : 'Bank Transfer') :
    method === 'cheque' ? (lang === 'si' ? 'චෙක්පත' : 'Cheque') :
    (lang === 'si' ? 'මුදල්' : 'Cash');

  win.document.write(`<!DOCTYPE html><html><head><title>Receipt</title>
<style>@page{margin:2mm}*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Courier New',monospace;background:#f1f5f9;min-height:100vh;
-webkit-print-color-adjust:exact;print-color-adjust:exact}
.r{max-width:360px;margin:0 auto;background:white;min-height:100vh}
.h{background:${hg};color:white;padding:20px 16px;text-align:center}
.h h1{font-size:17px;font-weight:900}
.m{padding:10px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;
display:flex;justify-content:space-between;font-size:12px;color:#475569}
.b{padding:16px}.cb{background:#f8fafc;border:1px solid #e2e8f0;
border-radius:10px;padding:12px;margin-bottom:14px}
.ab{background:${isCredit?'#fef2f2':'#f0fdf4'};
border:2px solid ${isCredit?'#fecaca':'#bbf7d0'};
border-radius:12px;padding:16px;text-align:center;margin-bottom:14px}
.av{font-size:36px;font-weight:900;color:${hg};font-family:monospace}
.dr{display:flex;justify-content:space-between;padding:8px 0;
font-size:14px;font-weight:bold;border-bottom:1px dotted #e2e8f0}
.ft{text-align:center;padding:12px 16px;font-size:12px;color:#94a3b8;
border-top:1px solid #e2e8f0}
.ac{display:flex;gap:8px;padding:12px 16px}
.ac button{flex:1;padding:12px;border:none;border-radius:10px;
font-weight:700;font-size:14px;cursor:pointer}
@media print{.ac{display:none!important}body{background:white}}</style></head>
<body><div class="r"><div class="h">
<div style="font-size:32px;margin-bottom:6px">${icon}</div>
<h1>${invoiceSettings?.businessName || ''}</h1>
${invoiceSettings?.address ? `<div style="font-size:11px;opacity:.85;margin-top:4px">📍 ${invoiceSettings.address}</div>` : ''}
</div><div class="m"><span><b>Ref:</b> #${refNo}</span><span><b>Date:</b> ${dateStr}</span></div>
<div class="b"><div class="cb"><div style="font-size:16px;font-weight:900">👤 ${customer.name}</div>
${customer.phone ? `<div style="font-size:12px;color:#64748b;margin-top:2px">📞 ${customer.phone}</div>` : ''}
</div><div class="ab"><div style="font-size:12px;color:#64748b;margin-bottom:6px">
${isCredit ? (lang==='si'?'ණය මුදල':'Credit Amount') : (lang==='si'?'ගෙවූ මුදල':'Payment Amount')}
</div><div class="av">Rs. ${nn(amount).toFixed(2)}</div></div>
<div style="border-top:2px dashed #000;margin:10px 0"></div>
${date ? `<div class="dr"><span style="color:#64748b">${lang==='si'?'දිනය':'Date'}</span><span>${date}</span></div>` : ''}
${note ? `<div class="dr"><span style="color:#64748b">${lang==='si'?'සටහන':'Note'}</span><span>${note}</span></div>` : ''}
<div class="dr" style="border-bottom:none"><span style="color:#64748b">${lang==='si'?'ක්‍රමය':'Method'}</span>
<span>${method==='bank'?'🏦':method==='cheque'?'📝':'💵'} ${methodLabel}</span></div>
${bankAccountName ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 12px;margin-top:10px;font-size:12px;color:#1e40af;font-weight:700">🏦 ${bankAccountName}</div>` : ''}
</div><div class="ac"><button style="background:${hg};color:white" onclick="window.print()">🖨️ Print</button>
<button style="background:#f1f5f9;color:#475569" onclick="window.close()">✕ Close</button></div>
<div class="ft">${invoiceSettings?.footerMessage || 'Thank You! 🙏'}</div></div></body></html>`);
  win.document.close();
};

/* ══════════════════════════════════════════════════════════════
   HOOKS
   ══════════════════════════════════════════════════════════════ */
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
        if (!cancelled) setBankAccounts(
          snap.docs.map(d => ({ id:d.id, ...d.data(), currentBalance:nn(d.data().currentBalance) }))
            .filter(a => a.isActive !== false)
        );
      } catch (e) { console.warn('Bank accounts:', e); }
      finally { if (!cancelled) setBankLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [uid]);
  return { bankAccounts, bankLoading };
}

/* ══════════════════════════════════════════════════════════════
   TOAST
   ══════════════════════════════════════════════════════════════ */
const Toast = memo(function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div role="alert" style={{
      position:'fixed', top:20, right:20, zIndex:9999,
      padding:'14px 24px', borderRadius:12, color:'white',
      fontWeight:700, fontSize:14, maxWidth:320,
      boxShadow:'0 8px 24px rgba(0,0,0,0.15)',
      background: toast.type === 'success'
        ? 'linear-gradient(135deg,#10b981,#059669)'
        : 'linear-gradient(135deg,#ef4444,#dc2626)',
      animation:'slideIn 0.3s ease',
    }}>
      {toast.msg}
    </div>
  );
});// ═══════════════════════════════════════════════════════
// RECEIPT SHARE MODAL
// ═══════════════════════════════════════════════════════
const ReceiptShareModal = memo(function ReceiptShareModal({
  isOpen, onClose, receiptData, customer, t, lang, invoiceSettings, showToast
}) {
  if (!isOpen || !receiptData || !customer) return null;

  const { type, amount, note, date, method, bankAccountName, newBalance, refNo } = receiptData;
  const isCredit = type === 'credit';
  const headerColor = isCredit ? '#dc2626' : '#16a34a';

  const methodLabel =
    method === 'bank'   ? (lang === 'si' ? '🏦 බැංකු මාරු' : '🏦 Bank Transfer') :
    method === 'cheque' ? (lang === 'si' ? '📝 චෙක්පත' : '📝 Cheque') :
                          (lang === 'si' ? '💵 මුදල්' : '💵 Cash');

  const businessName  = invoiceSettings?.businessName || '';
  const footerMsg     = invoiceSettings?.footerMessage || (lang === 'si' ? 'ස්තූතියි! 🙏' : 'Thank You! 🙏');
  const businessPhone = invoiceSettings?.phone || '';

  const generateReceiptText = () => {
    const template = isCredit ? t.creditReceiptMsg : t.paymentReceiptMsg;
    let msg = template
      .replace('{name}', customer.name)
      .replace('{date}', date)
      .replace('{amount}', fmt(amount))
      .replace('{note}', note || '-')
      .replace('{method}', methodLabel)
      .replace('{newBalance}', fmt(newBalance))
      .replace('{ref}', refNo)
      .replace('{footer}', footerMsg);

    if (businessName) msg = `🏪 *${businessName}*\n${'─'.repeat(20)}\n\n` + msg;
    if (bankAccountName) msg += `\n🏦 ${lang === 'si' ? 'බැංකු ගිණුම' : 'Bank'}: ${bankAccountName}`;
    if (businessPhone) msg += `\n📞 ${businessPhone}`;
    return msg;
  };

  const receiptText = generateReceiptText();
  const phone = customer.phone?.replace(/[^0-9]/g, '');

  const handleWhatsApp = () => {
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(receiptText)}`;
    window.open(url, '_blank');
    showToast(t.billSentSuccess);
  };

  const handleSMS = () => {
    const shortMsg = isCredit
      ? `${businessName ? businessName + ' - ' : ''}Receipt: Rs.${fmt(amount)} credit. Balance: Rs.${fmt(newBalance)}. Ref:#${refNo}`
      : `${businessName ? businessName + ' - ' : ''}Receipt: Rs.${fmt(amount)} payment received. Balance: Rs.${fmt(newBalance)}. Ref:#${refNo}`;
    window.open(`sms:${customer.phone}?body=${encodeURIComponent(shortMsg)}`, '_self');
    showToast(t.billSentSuccess);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(receiptText);
      showToast(t.receiptCopied);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = receiptText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(t.receiptCopied);
    }
  };

  const handlePrint = () => {
    printTransactionReceipt({
      customer, type, amount, note, date, method,
      bankAccountName, t, lang, invoiceSettings
    });
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div
        style={{ ...styles.modal, maxWidth: 440, padding: 0, overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          background: `linear-gradient(135deg, ${headerColor}, ${isCredit ? '#b91c1c' : '#15803d'})`,
          padding: '20px 24px',
          textAlign: 'center',
          color: 'white'
        }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>{isCredit ? '📄' : '✅'}</div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{t.shareReceipt}</h3>
          <p style={{ margin: '6px 0 0', fontSize: 13, opacity: 0.9 }}>
            {isCredit
              ? (lang === 'si' ? 'ණය රිසිට්පත පාරිබෝගිකයාට යවන්න' : 'Send credit receipt to customer')
              : (lang === 'si' ? 'ගෙවීම් රිසිට්පත පාරිබෝගිකයාට යවන්න' : 'Send payment receipt to customer')}
          </p>
        </div>

        <div style={{ padding: '16px 20px' }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>👤 {customer.name}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>📅 {date} • #{refNo}</div>
              </div>
              <div style={{ background: isCredit ? '#fef2f2' : '#f0fdf4', border: `2px solid ${isCredit ? '#fecaca' : '#bbf7d0'}`, borderRadius: 10, padding: '8px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>
                  {isCredit ? (lang === 'si' ? 'ණය' : 'Credit') : (lang === 'si' ? 'ගෙවීම' : 'Payment')}
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: headerColor }}>Rs.{fmt(amount)}</div>
              </div>
            </div>

            {note && <div style={{ fontSize: 12, color: '#475569', marginBottom: 6 }}>📝 {note}</div>}
            <div style={{ fontSize: 12, color: '#475569', marginBottom: 6 }}>🔖 {methodLabel}</div>
            {bankAccountName && <div style={{ fontSize: 12, color: '#1d4ed8', marginBottom: 6 }}>🏦 {bankAccountName}</div>}

            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '2px dashed #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>{t.customerBalanceAfter}:</span>
              <span style={{ fontSize: 16, fontWeight: 900, color: newBalance > 0.01 ? '#dc2626' : newBalance < -0.01 ? '#2563eb' : '#16a34a' }}>
                Rs.{fmt(newBalance)}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {phone && (
              <button onClick={handleWhatsApp} style={{
                width: '100%', padding: 14, border: 'none', borderRadius: 12,
                background: 'linear-gradient(135deg, #25D366, #128C7E)',
                color: 'white', fontWeight: 800, fontSize: 15,
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 10
              }}>
                <span style={{ fontSize: 22 }}>💬</span>{t.shareViaWhatsApp}
              </button>
            )}

            {customer.phone && (
              <button onClick={handleSMS} style={{
                width: '100%', padding: 14, border: 'none', borderRadius: 12,
                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                color: 'white', fontWeight: 800, fontSize: 15,
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 10
              }}>
                <span style={{ fontSize: 22 }}>📩</span>{t.shareViaSMS}
              </button>
            )}

            {!customer.phone && (
              <div style={{
                padding: 12, background: '#fef3c7', borderRadius: 10,
                border: '1px solid #fcd34d', textAlign: 'center',
                fontSize: 13, color: '#92400e', fontWeight: 600
              }}>
                ⚠️ {lang === 'si' ? 'පාරිබෝගිකයාගේ දුරකථන අංකය නොමැත' : 'Customer phone number not available'}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleCopy} style={{ flex: 1, padding: 12, border: '2px solid #e2e8f0', borderRadius: 10, background: 'white', color: '#475569', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                📋 {t.copyReceipt}
              </button>
              <button onClick={handlePrint} style={{ flex: 1, padding: 12, border: '2px solid #e2e8f0', borderRadius: 10, background: 'white', color: '#475569', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                🖨️ {t.printReceipt}
              </button>
            </div>

            <button onClick={onClose} style={{
              width: '100%', padding: 12, border: 'none', borderRadius: 10,
              background: '#f1f5f9', color: '#94a3b8', fontWeight: 600,
              fontSize: 13, cursor: 'pointer', marginTop: 4
            }}>
              {t.skipShare}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════
// TRANSACTION MODAL
// ═══════════════════════════════════════════════════════
const TransactionModal = memo(function TransactionModal({
  show, type, customer, onClose, onConfirm,
  isProcessing, bankAccounts, bankLoading, t, lang
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
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
      setAmount('');
      setNote('');
      setDate(new Date().toISOString().split('T')[0]);
      setMethod('cash');
      setBankId('');
      setAmountErr('');
      setBankErr('');
      setReceiptImage(null);
    }
  }, [show]);

  useEffect(() => {
    if (isBank && bankAccounts.length > 0 && !bankId) {
      setBankId(bankAccounts[0].id);
    }
  }, [isBank, bankAccounts, bankId]);

  useEffect(() => {
    if (!show) return;
    const h = e => {
      if (e.key === 'Escape' && !isProcessing) onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [show, isProcessing, onClose]);

  const selectedBank = isBank ? bankAccounts.find(a => a.id === bankId) : null;
  const amt = nn(amount);
  const bankBalAfter = useMemo(() => selectedBank && amt ? selectedBank.currentBalance + amt : null, [selectedBank, amt]);
  const custBalAfter = useMemo(() => {
    if (!customer || !amt) return null;
    const cur = nn(customer.currentBalance);
    return isCredit ? cur + amt : cur - amt;
  }, [customer, amt, isCredit]);

  const handleImageSelect = e => {
    const file = e.target.files[0];
    if (!file) return;
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
      type,
      amount: amt,
      note,
      date,
      method,
      receiptImage,
      bankAccountId: isBank ? bankId : null,
      bankAccountName: selectedBank ? `${selectedBank.bankName} - ${selectedBank.accountName}` : null,
    });
  };

  if (!show || !customer) return null;

  const headerColor = isCredit ? '#dc2626' : '#16a34a';

  return (
    <div style={styles.modalOverlay} onClick={isProcessing ? undefined : onClose}>
      <div style={{ ...styles.modal, maxWidth: 500, padding: 0, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{
          padding: '16px 20px',
          background: headerColor,
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderRadius: '16px 16px 0 0',
          position: 'sticky',
          top: 0,
          zIndex: 1,
        }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>
            {isCredit ? t.addCreditTitle : t.receivePaymentTitle}
          </h3>
          <button
            onClick={onClose}
            disabled={isProcessing}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: 'white',
              borderRadius: '50%',
              width: 28,
              height: 28,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 20 }}>
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px', marginBottom: 16, border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 700, color: '#1e293b' }}>{customer.name}</div>
            <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', background: nn(customer.currentBalance) > 0 ? '#fef2f2' : '#f0fdf4', padding: '6px 10px', borderRadius: 8 }}>
              <span style={{ fontSize: 13, color: '#64748b' }}>{t.balance}:</span>
              <span style={{ fontWeight: 800, color: nn(customer.currentBalance) > 0 ? '#dc2626' : '#16a34a' }}>
                {formatCurrency(customer.currentBalance)}
              </span>
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
            <input
              type="number"
              step="0.01"
              min="0.01"
              autoFocus
              value={amount}
              onChange={e => {
                setAmount(e.target.value);
                setAmountErr(e.target.value ? validateAmount(e.target.value) || '' : '');
              }}
              style={{ ...styles.input, marginBottom: 0, fontSize: 22, fontWeight: 800, color: headerColor, borderColor: amountErr ? '#ef4444' : '#e2e8f0' }}
              placeholder="0.00"
              disabled={isProcessing}
            />
            {amountErr && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#ef4444', fontWeight: 600 }}>{amountErr}</p>}
            {amt > 0 && custBalAfter !== null && (
              <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>{t.customerBalanceAfter}:</span>
                <span style={{ fontWeight: 700, color: custBalAfter > 0 ? '#dc2626' : '#16a34a' }}>
                  {formatCurrency(custBalAfter)}
                </span>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={styles.formLabel}>{t.paymentMethod}</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {PAYMENT_METHODS.map(pm => {
                const sel = method === pm.value;
                const c = pm.value === 'cash' ? '#16a34a' : pm.value === 'bank' ? '#3b82f6' : '#f59e0b';
                return (
                  <button
                    key={pm.value}
                    onClick={() => { setMethod(pm.value); setBankErr(''); }}
                    disabled={isProcessing}
                    style={{
                      padding: '10px 6px',
                      borderRadius: 10,
                      border: sel ? `2px solid ${c}` : '2px solid #e2e8f0',
                      background: sel ? `${c}12` : 'white',
                      cursor: 'pointer',
                      fontWeight: sel ? 700 : 500,
                      fontSize: 13,
                      color: sel ? c : '#64748b',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{pm.icon}</span>
                    <span>{lang === 'si' ? pm.si : pm.en}</span>
                  </button>
                );
              })}
            </div>
          </div>

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

          <div style={{ marginBottom: 16 }}>
            <label style={styles.formLabel}>{t.uploadReceipt}</label>
            <label style={{ display: 'block', padding: '10px 14px', border: '2px dashed #cbd5e1', borderRadius: 10, textAlign: 'center', cursor: 'pointer', background: '#f8fafc', fontSize: 13, color: '#64748b' }}>
              {receiptImage ? '✅ Image selected' : t.selectImage}
              <input ref={fileRef} type="file" accept="image/*" onChange={handleImageSelect} style={{ display: 'none' }} />
            </label>
            {receiptImage && (
              <div style={{ position: 'relative', marginTop: 8 }}>
                <img src={receiptImage} alt="preview" style={{ width: '100%', maxHeight: 150, objectFit: 'contain', borderRadius: 8 }} />
                <button onClick={() => { setReceiptImage(null); if (fileRef.current) fileRef.current.value = ''; }}
                  style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 11 }}>✕</button>
              </div>
            )}
          </div>

          <button onClick={handleConfirm} disabled={isProcessing || !!amountErr || (isBank && (!bankId || bankAccounts.length === 0))}
            style={{ width: '100%', padding: 14, background: headerColor, color: 'white', border: 'none', borderRadius: 10, fontWeight: 'bold', fontSize: 16, cursor: isProcessing ? 'not-allowed' : 'pointer', opacity: isProcessing ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {isProcessing ? <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> {t.processing}</> : isCredit ? t.saveCredit : t.savePayment}
          </button>
        </div>
      </div>
    </div>
  );
});

const ReminderModal = memo(function ReminderModal({ isOpen, onClose, customer, lang, onUpdateCustomer }) {
  const t = translations[lang];
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState('');

  useEffect(() => {
    if (!isOpen || !customer) return;
    if (customer.portalAccessKey) {
      setLink(`${window.location.origin}/portal/${customer.portalAccessKey}`);
      return;
    }
    setLoading(true);
    const k = Math.random().toString(36).substring(2, 10) + Date.now().toString(36).substring(4, 8);
    updateDoc(doc(db, 'customers', customer.id), { portalAccessKey: k }).then(() => {
      setLink(`${window.location.origin}/portal/${k}`);
      onUpdateCustomer({ ...customer, portalAccessKey: k });
      setLoading(false);
    });
  }, [isOpen, customer, onUpdateCustomer]);

  if (!isOpen || !customer) return null;

  const msg = t.reminderMsg
    .replace('{amount}', customer.currentBalance?.toLocaleString() || '0')
    .replace('{link}', link);
  const phone = customer.phone?.replace(/[^0-9]/g, '');

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <h3>🔔 {t.reminderTitle}</h3>
        {loading ? <p>{t.generatingLink}</p> : <p style={{ background:'#f3f4f6', padding:10, borderRadius:8, fontSize:13, whiteSpace:'pre-wrap' }}>{msg}</p>}
        <button onClick={() => window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')} disabled={loading} style={{ ...styles.btnFull, background:'#25D366', marginBottom:10 }}>💬 WhatsApp</button>
        <button onClick={() => window.open(`sms:${customer.phone}?body=${encodeURIComponent(msg)}`, '_self')} disabled={loading} style={{ ...styles.btnFull, background:'#3b82f6' }}>📩 SMS</button>
        <button onClick={onClose} style={{ ...styles.btnFull, background:'#ef4444', marginTop:10 }}>{t.close}</button>
      </div>
    </div>
  );
});

const EditTransactionModal = memo(function EditTransactionModal({ isOpen, onClose, txn, onSave, lang }) {
  const t = translations[lang];
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    if (isOpen && txn) {
      setAmount(txn.amount);
      setNote(txn.note || '');
      setDate(txn.date || new Date().toISOString().split('T')[0]);
    }
  }, [isOpen, txn]);

  if (!isOpen) return null;

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <h3>{t.editTxn}</h3>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={styles.input} />
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={styles.input} />
        <textarea value={note} onChange={e => setNote(e.target.value)} style={styles.textarea} />
        <div style={styles.modalActions}>
          <button onClick={onClose} style={styles.btnCancel}>{t.cancel}</button>
          <button onClick={() => {
            if (!amount) return;
            onSave({ ...txn, amount: parseFloat(amount), note, date });
            onClose();
          }} style={styles.btnSave}>{t.updateTxn}</button>
        </div>
      </div>
    </div>
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
    updateDoc(doc(db, 'customers', customer.id), { portalAccessKey: k }).then(() => {
      setPortalKey(k);
      onUpdateCustomer({ ...customer, portalAccessKey: k });
      setLoadingKey(false);
    });
  }, [isOpen, customer, onUpdateCustomer]);

  if (!isOpen || !customer) return null;
  const link = portalKey ? `${window.location.origin}/portal/${portalKey}` : '';

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <h3>🔗 {t.sendLink}</h3>
        {loadingKey ? (
          <div style={{ padding:20, textAlign:'center' }}>{t.generatingLink}</div>
        ) : (
          <>
            <div style={{ background:'#f3f4f6', padding:10, borderRadius:8, wordBreak:'break-all', fontSize:12, marginBottom:10 }}>{link}</div>
            <button onClick={() => {
              navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }} style={styles.btnFull}>{copied ? t.copied : t.copyLink}</button>
            <button onClick={() => window.open(`https://wa.me/${customer.phone?.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(link)}`, '_blank')} style={{ ...styles.btnFull, background:'#25D366', marginTop:10 }}>💬 WhatsApp</button>
          </>
        )}
        <button onClick={onClose} style={{ ...styles.btnFull, background:'#ef4444', marginTop:10 }}>{t.close}</button>
      </div>
    </div>
  );
});

const EditCustomerModal = memo(function EditCustomerModal({ isOpen, onClose, customer, onSave, lang }) {
  const t = translations[lang];
  const [form, setForm] = useState({ name: '', phone: '', address: '', profilePicture: '' });
  const [uploading, setUploading] = useState(false);
  const photoRef = useRef(null);

  useEffect(() => {
    if (isOpen && customer) {
      setForm({
        name: customer.name || '',
        phone: formatPhoneWithCode(customer.phone),
        address: customer.address || '',
        profilePicture: customer.profilePicture || customer.photoURL || '',
      });
    }
  }, [isOpen, customer]);

  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxW = 400;
          const scale = Math.min(maxW / img.width, 1);
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          const compressed = canvas.toDataURL('image/jpeg', 0.7);
          setForm(prev => ({ ...prev, profilePicture: compressed }));
          setUploading(false);
        };
        img.onerror = () => setUploading(false);
        img.src = ev.target.result;
      };
      reader.onerror = () => setUploading(false);
      reader.readAsDataURL(file);
    } catch {
      setUploading(false);
    }
    if (photoRef.current) photoRef.current.value = '';
  };

  if (!isOpen) return null;

  const avatarSrc = form.profilePicture ||
    (typeof window !== 'undefined'
      ? "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23dbeafe'/%3E%3Ccircle cx='50' cy='35' r='15' fill='%233b82f6'/%3E%3Cpath d='M20 80a30 30 0 0 1 60 0' stroke='%233b82f6' stroke-width='8' fill='none'/%3E%3C/svg%3E"
      : '');

  return (
    <div style={styles.modalOverlay}>
      <div style={{ ...styles.modal, maxWidth: 440 }}>
        <h3 style={{ margin: '0 0 16px' }}>✏️ {t.editTitle}</h3>

        {/* Photo upload */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <img
              src={avatarSrc}
              alt=""
              style={{
                width: 100,
                height: 100,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '3px solid #3b82f6',
              }}
            />
            <button
              onClick={() => photoRef.current?.click()}
              disabled={uploading}
              style={{
                position: 'absolute',
                bottom: -2,
                right: -2,
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: '#3b82f6',
                color: 'white',
                border: '3px solid white',
                fontSize: 16,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {uploading ? '⏳' : '📷'}
            </button>
          </div>

          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoSelect}
            style={{ display: 'none' }}
          />

          {form.profilePicture && (
            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => setForm(prev => ({ ...prev, profilePicture: '' }))}
                style={{
                  fontSize: 11,
                  color: '#dc2626',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 6,
                  padding: '3px 10px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                ✕ {lang === 'si' ? 'පින්තූරය ඉවත් කරන්න' : 'Remove Photo'}
              </button>
            </div>
          )}
        </div>

        {/* Name */}
        <input
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
          style={styles.input}
          placeholder={t.customerName}
        />

        {/* Phone */}
        <input
          value={form.phone}
          onChange={e => setForm({ ...form, phone: handlePhoneInput(e.target.value) })}
          style={styles.input}
          placeholder={t.phone}
        />

        {/* Address */}
        <textarea
          value={form.address}
          onChange={e => setForm({ ...form, address: e.target.value })}
          style={styles.textarea}
          placeholder={t.address}
        />

        {/* Actions */}
        <div style={styles.modalActions}>
          <button onClick={onClose} style={styles.btnCancel}>
            {t.cancel}
          </button>
          <button
            onClick={async () => {
              if (!form.name.trim()) return;
              try {
                const updateData = {
                  name: form.name,
                  phone: form.phone,
                  address: form.address,
                  profilePicture: form.profilePicture || '',
                  photoURL: form.profilePicture || '',
                  updatedAt: serverTimestamp(),
                };
                await updateDoc(doc(db, 'customers', customer.id), updateData);
                onSave({ ...customer, ...updateData });
                onClose();
              } catch (e) {
                alert(e.message);
              }
            }}
            disabled={uploading}
            style={{
              ...styles.btnSave,
              opacity: uploading ? 0.6 : 1,
            }}
          >
            {uploading
              ? '⏳...'
              : `💾 ${t.save}`}
          </button>
        </div>
      </div>
    </div>
  );
});

const DeleteCustomerModal = memo(function DeleteCustomerModal({ isOpen, onClose, customer, onDelete, lang }) {
  const t = translations[lang];
  const [confirm, setConfirm] = useState('');

  if (!isOpen) return null;

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <h3>🗑️ {t.deleteCustomer}</h3>
        <p style={{ color:'red' }}>{t.deleteWarning}</p>
        <input value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Type DELETE" style={styles.input} />
        <div style={styles.modalActions}>
          <button onClick={onClose} style={styles.btnCancel}>{t.cancel}</button>
          <button
            onClick={async () => {
              if (confirm !== 'DELETE') return;
              try {
                await deleteDoc(doc(db, 'customers', customer.id));
                onDelete();
              } catch (e) { alert(e.message); }
            }}
            disabled={confirm !== 'DELETE'}
            style={{ ...styles.btnSave, background:'red' }}
          >
            {t.deleteCustomer}
          </button>
        </div>
      </div>
    </div>
  );
});

const ServiceBillModal = memo(function ServiceBillModal({ isOpen, onClose, productionData, lang }) {
  const t = translations[lang];
  if (!isOpen || !productionData) return null;
  const pe = productionData;
  const grand = nn(pe.grandTotal || pe.totalIncome);
  const paid  = nn(pe.totalPaid);
  const bal   = nn(pe.balanceDue || Math.max(0, grand - paid));

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={{ ...styles.modal, maxWidth:500, maxHeight:'90vh', overflowY:'auto' }} onClick={e => e.stopPropagation()}>
        <h3>🧾 {pe.invoiceNumber || t.serviceEntry}</h3>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:20, fontWeight:900, padding:'8px 0', borderTop:'2px solid #334155', borderBottom:'2px solid #334155', margin:'6px 0' }}>
          <span>💰 {t.grandTotal}</span><span>Rs.{fmt(grand)}</span>
        </div>
        {paid > 0 && <div style={{ display:'flex', justifyContent:'space-between', fontSize:14, fontWeight:600, color:'#16a34a' }}><span>✅ {t.totalPaid}</span><span>Rs.{fmt(paid)}</span></div>}
        {bal > 0.01 && <div style={{ display:'flex', justifyContent:'space-between', fontSize:14, fontWeight:700, color:'#dc2626' }}><span>🔴 {t.balanceDue}</span><span>Rs.{fmt(bal)}</span></div>}
        <button onClick={onClose} style={{ ...styles.btnFull, background:'#ef4444', marginTop:16 }}>{t.close}</button>
      </div>
    </div>
  );
});// ═══════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════
export default function CustomerDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useUserAuth();

  const [lang, setLang] = useState('si');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem('language');
      if (saved) setLang(saved);
    } catch {}

    const onLangChange = (e) => setLang(e.detail || 'si');
    window.addEventListener('app-language-change', onLangChange);
    window.addEventListener('storage', () => {
      try { const s = localStorage.getItem('language'); if (s) setLang(s); } catch {}
    });
    return () => {
      window.removeEventListener('app-language-change', onLangChange);
    };
  }, []);

  const t = useMemo(() => translations[mounted ? lang : 'si'] || translations.si, [lang, mounted]);

  const isPortalMode = typeof window !== 'undefined' && window.location.pathname.includes('/portal/');
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
  const [receiptShareData, setReceiptShareData] = useState(null);

  const [modals, setModals] = useState({
    txn: false, txnType: 'credit', editTxn: false, sendLink: false,
    edit: false, delete: false, approval: false, reminder: false,
    serviceBill: false, date: false, receiptShare: false,
  });

  const openModal = useCallback((key, extra = {}) =>
    setModals(p => ({ ...p, [key]: true, ...extra })),
  []);

  const closeModal = useCallback(key =>
    setModals(p => ({ ...p, [key]: false })),
  []);

  const { bankAccounts, bankLoading } = useBankAccounts(user?.uid);

  useEffect(() => {
    if (!user?.uid) return;
    let c = false;
    getDocs(query(collection(db, 'invoice_settings'), where('uid', '==', user.uid)))
      .then(s => { if (!c && !s.empty) setInvoiceSettings(s.docs[0].data()); })
      .catch(() => {});
    return () => { c = true; };
  }, [user?.uid]);

  const langRef = useRef(lang);
  useEffect(() => { langRef.current = lang; }, [lang]);

  /* ══════════════════════════════════════════════════════
     FETCH DATA
     ══════════════════════════════════════════════════════ */
  const fetchData = useCallback(async () => {
    if (!id || !user?.uid) return;

    try {
      const snap = await getDoc(doc(db, 'customers', id));
      if (!snap.exists()) { setLoading(false); return; }

      const data = snap.data();
      if (data.uid && data.uid !== user.uid) {
        window.location.href = '/customers';
        return;
      }

      if (mountedRef.current) {
        setCustomer({ id: snap.id, ...data });
        if (data.dueDate) setDueDate(data.dueDate);
        if (data.dueTime) setDueTime(data.dueTime);
      }

      const L = translations[langRef.current] || translations.si;
      const allTxns = [];

      // Customer transactions
      const snapTxn = await getDocs(query(
        collection(db, 'customerTransactions'),
        where('customerId', '==', id),
        where('uid', '==', user.uid)
      ));

      snapTxn.docs.forEach(d => {
        const dt = d.data();
        const ts = extractValidTimestamp(dt, dt.date);
        allTxns.push({
          id: d.id, type: dt.type, amount: nn(dt.amount),
          date: dt.date, time: getAccurateTime(dt.time, ts),
          note: dt.note, source: dt.source || 'manual',
          receiptImage: dt.receiptImage, timestamp: ts,
          bankAccountName: dt.bankAccountName || null,
          bankAccountId: dt.bankAccountId || null,
        });
      });

      // Sales invoices
      try {
        const snapInv = await getDocs(query(
          collection(db, 'salesInvoices'),
          where('customerId', '==', id),
          where('uid', '==', user.uid)
        ));

        snapInv.docs.forEach(d => {
          const di = d.data();
          const ts = extractValidTimestamp(di, di.date);
          const gt = nn(di.grandTotal);
          const pa = nn(di.paidAmount);

          allTxns.push({
            id: d.id, type: 'credit', amount: gt,
            date: di.date, time: getAccurateTime(di.time, ts),
            note: `🧾 Invoice #${di.invoiceNo || ''}`,
            source: 'invoice', timestamp: ts,
          });

          if (pa > 0) {
            allTxns.push({
              id: d.id + '_ip', type: 'payment', amount: pa,
              date: di.date, time: getAccurateTime(di.time, ts),
              note: `💵 ${L.invoicePayment} #${di.invoiceNo || ''}`,
              source: 'invoicePayment', timestamp: ts + 100,
            });
          }
        });
      } catch {}

      // Vehicle trips
      try {
        const vtSnap = await getDocs(query(
          collection(db, `users/${user.uid}/vehicleTrips`),
          where('customerId', '==', id)
        ));

        vtSnap.docs.forEach(d => {
          const dt = d.data();
          const ts = dt.createdAt?.toDate ? dt.createdAt.toDate().getTime() : Date.now();
          const fare = nn(dt.fare);
          const paid = nn(dt.paidAmount);
          const tripDate = dt.tripDate?.toDate
            ? dt.tripDate.toDate().toISOString().split('T')[0]
            : new Date(ts).toISOString().split('T')[0];
          const tm = new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

          if (fare > 0) {
            allTxns.push({
              id: d.id + '_f', type: 'credit', amount: fare,
              date: tripDate, time: tm,
              note: `🚛 ${L.transportFare} (${dt.vehicleNo || ''})`,
              source: 'vehicleTrip', timestamp: ts,
              tripData: { ...dt, fare, paidAmount: paid },
            });
          }

          if (paid > 0) {
            allTxns.push({
              id: d.id + '_p', type: 'payment', amount: paid,
              date: tripDate,
              time: new Date(ts + 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
              note: `🚛 ${L.transportPayment} (${dt.vehicleNo || ''})`,
              source: 'vehicleTrip', timestamp: ts + 1000,
            });
          }
        });
      } catch {}

      // Production entries
      if (data.name) {
        try {
          const seen = new Set();
          const peList = [];

          try {
            const s1 = await getDocs(query(
              collection(db, 'productionEntries'),
              where('customerId', '==', id),
              where('uid', '==', user.uid)
            ));
            s1.docs.forEach(d => { if (!seen.has(d.id)) { seen.add(d.id); peList.push({ docId: d.id, ...d.data() }); } });
          } catch {}

          if (!peList.length) {
            try {
              const s2 = await getDocs(query(
                collection(db, 'productionEntries'),
                where('customerName', '==', data.name),
                where('uid', '==', user.uid)
              ));
              s2.docs.forEach(d => { if (!seen.has(d.id)) { seen.add(d.id); peList.push({ docId: d.id, ...d.data() }); } });
            } catch {}
          }

          peList.forEach(pe => {
            if (pe.isStandaloneExpense) return;
            const ts = pe.createdAt?.toDate ? pe.createdAt.toDate().getTime() : Date.now();
            const peDate = pe.date || new Date(ts).toISOString().split('T')[0];
            const gt = nn(pe.grandTotal || pe.totalIncome);
            const tp = nn(pe.totalPaid);

            if (gt > 0) {
              allTxns.push({
                id: pe.docId + '_s', type: 'credit', amount: gt,
                date: peDate,
                time: new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
                note: `🔧 ${pe.invoiceNumber || L.serviceEntry}`,
                source: 'production', timestamp: ts, productionData: pe,
              });
            }

            if (tp > 0) {
              allTxns.push({
                id: pe.docId + '_p', type: 'payment', amount: tp,
                date: peDate,
                time: new Date(ts + 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
                note: `💳 ${L.servicePayment} ${pe.invoiceNumber || ''}`.trim(),
                source: 'production', timestamp: ts + 1000, productionData: pe,
              });
            }
          });
        } catch {}
      }

      // Pending approvals
      try {
        const aSnap = await getDocs(query(
          collection(db, 'transactionApprovals'),
          where('customerId', '==', id),
          where('status', '==', 'pending')
        ));
        if (mountedRef.current) {
          setPendingApprovals(aSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      } catch {}

      // Deduplicate + running balance
      const deduped = removeDuplicatePayments(allTxns);
      deduped.sort((a, b) => a.timestamp - b.timestamp);

      let runBal = nn(data.initialBalance || 0);
      deduped.forEach(txn => {
        if (txn.type === 'credit') runBal += txn.amount;
        else if (txn.type === 'payment') runBal -= txn.amount;
        txn.runningBalance = runBal;
      });

      const actualBal = nn(data.currentBalance);
      const diff = actualBal - runBal;

      if (Math.abs(diff) > 0.5) {
        deduped.push({
          id: '_adj', type: diff > 0 ? 'credit' : 'payment',
          amount: Math.abs(diff),
          date: new Date().toISOString().split('T')[0], time: '',
          timestamp: Date.now(),
          note: `⚙️ ${L.adjustment}`,
          source: 'adjustment', runningBalance: actualBal,
          isAdjustment: true,
        });
      }

      if (mountedRef.current) {
        setTransactions(deduped.reverse());
        setLoading(false);
      }
    } catch (err) {
      console.error('fetchData error:', err);
      if (mountedRef.current) setLoading(false);
    }
  }, [id, user?.uid]);

  useEffect(() => {
    if (!authLoading && user?.uid && id) fetchData();
  }, [id, user?.uid, authLoading, fetchData]);

  /* ══════════════════════════════════════════════════════
     HANDLE TRANSACTION CONFIRM
     ══════════════════════════════════════════════════════ */
  const handleTransactionConfirm = useCallback(async ({
    type, amount, note, date, method,
    receiptImage, bankAccountId, bankAccountName
  }) => {
    if (!customer || isProcessing) return;
    setIsProcessing(true);

    const isCredit = type === 'credit';
    const isBank = method === 'bank' && !!bankAccountId;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const refNo = now.getTime().toString(36).toUpperCase().slice(-8);

    try {
      const customerRef = doc(db, 'customers', id);
      let newBalance = 0;

      await runTransaction(db, async tx => {
        const custSnap = await tx.get(customerRef);
        if (!custSnap.exists()) throw new Error('Customer not found');
        const curBal = nn(custSnap.data().currentBalance);
        newBalance = isCredit ? curBal + amount : curBal - amount;
        tx.update(customerRef, { currentBalance: newBalance, updatedAt: serverTimestamp() });
      });

      const txnData = {
        uid: user.uid, customerId: id, type, amount, date,
        time: timeStr,
        note: note || (isCredit ? t.addCredit : t.getPayment),
        receiptImage: receiptImage || null, paymentMethod: method,
        source: isCredit ? 'manual_credit' : 'manual',
        createdAt: serverTimestamp(), timestamp: now.getTime(),
        createdBy: user.email || 'Unknown',
      };
      if (isBank) {
        txnData.bankAccountId = bankAccountId;
        txnData.bankAccountName = bankAccountName;
      }
      const txnRef = await addDoc(collection(db, 'customerTransactions'), txnData);

      const cashData = {
        type: isCredit ? 'out' : 'in',
        category: isCredit ? 'customerCredit' : 'invoicePayment',
        source: isCredit ? 'customerCredit' : 'invoicePayment',
        description: `${customer.name} — ${note || (isCredit ? t.addCredit : t.getPayment)}`,
        amount, paymentMethod: method,
        customerId: id, customerName: customer.name,
        customerPhone: customer.phone || '', customerTxnId: txnRef.id,
        invoiceNo: note || '', reference: note || '', notes: note || '',
        date, time: timeStr,
        timestamp: Timestamp.fromDate(new Date(`${date}T12:00:00`)),
        createdAt: serverTimestamp(), createdBy: user.email || 'Unknown',
        uid: user.uid, isAutomatic: true,
      };
      if (isBank) {
        cashData.bankAccountId = bankAccountId;
        cashData.bankAccountName = bankAccountName;
      }
      await addDoc(collection(db, `users/${user.uid}/cashTransactions`), cashData);

      showToast(isCredit ? t.creditAdded : t.paymentReceived);
      closeModal('txn');

      setReceiptShareData({
        type, amount,
        note: note || (isCredit ? t.addCredit : t.getPayment),
        date, method, bankAccountName, newBalance, refNo,
      });

      setCustomer(prev => prev ? { ...prev, currentBalance: newBalance } : prev);
      openModal('receiptShare');
      fetchData();

    } catch (err) {
      console.error(err);
      showToast('❌ ' + err.message, 'error');
    } finally {
      if (mountedRef.current) setIsProcessing(false);
    }
  }, [customer, isProcessing, id, user, t, showToast, closeModal, openModal, fetchData]);

  /* ══════════════════════════════════════════════════════
     OTHER HANDLERS
     ══════════════════════════════════════════════════════ */
  const handleEditTxn = useCallback(async updated => {
    try {
      const diff = updated.amount - selectedTxn.amount;
      const balChange = updated.type === 'credit' ? diff : -diff;
      await updateDoc(doc(db, 'customerTransactions', updated.id), { amount: updated.amount, note: updated.note, date: updated.date });
      await updateDoc(doc(db, 'customers', id), { currentBalance: increment(balChange) });
      showToast('✅ Updated!');
      closeModal('editTxn');
      fetchData();
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
  }, [selectedTxn, id, showToast, closeModal, fetchData]);

  const handleDeleteTxn = useCallback(async txn => {
    if (!window.confirm(t.confirmDeleteTxn)) return;
    try {
      await deleteDoc(doc(db, 'customerTransactions', txn.id));
      await updateDoc(doc(db, 'customers', id), {
        currentBalance: increment(txn.type === 'credit' ? -txn.amount : txn.amount)
      });
      const cs = await getDocs(query(
        collection(db, `users/${user.uid}/cashTransactions`),
        where('customerTxnId', '==', txn.id)
      ));
      await Promise.all(cs.docs.map(d =>
        deleteDoc(doc(db, `users/${user.uid}/cashTransactions`, d.id))
      ));
      showToast('🗑️ Deleted!');
      fetchData();
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
  }, [id, user, t, showToast, fetchData]);

  const handleApprove = useCallback(async txn => {
    if (!window.confirm('Approve?')) return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'customers', id), { currentBalance: increment(-nn(txn.amount)) });
      const newRef = doc(collection(db, 'customerTransactions'));
      batch.set(newRef, {
        customerId: id, uid: user.uid, type: 'payment',
        amount: nn(txn.amount), date: txn.date, note: txn.note,
        receiptImage: txn.receiptImage,
        createdAt: serverTimestamp(), source: 'manual', timestamp: Date.now(),
      });
      batch.update(doc(db, 'transactionApprovals', txn.id), {
        status: 'approved', approvedAt: serverTimestamp(),
      });
      await batch.commit();
      showToast('✅ Approved!');
      fetchData();
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
  }, [id, user, showToast, fetchData]);

  const handleSetDueDate = useCallback(async () => {
    try {
      await updateDoc(doc(db, 'customers', id), { dueDate, dueTime });
      showToast(t.dueDateSet);
      closeModal('date');
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
  }, [dueDate, dueTime, id, t, showToast, closeModal]);

  /* ══════════════════════════════════════════════════════
     DERIVED DATA
     ══════════════════════════════════════════════════════ */
  const hasVehicle  = useMemo(() => transactions.some(x => x.source === 'vehicleTrip'), [transactions]);
  const hasServices = useMemo(() => transactions.some(x => x.source === 'production'), [transactions]);

  const filterTabs = useMemo(() => {
    const tabs = [
      { key: 'all',      label: t.filterAll,      icon: '📋' },
      { key: 'shop',     label: t.filterShop,     icon: '🛍️' },
    ];
    if (hasVehicle)  tabs.push({ key: 'vehicle',  label: t.filterVehicle,  icon: '🚛' });
    if (hasServices) tabs.push({ key: 'services', label: t.filterServices, icon: '🔧' });
    tabs.push({ key: 'payments', label: t.filterPayments, icon: '💰' });
    return tabs;
  }, [t, hasVehicle, hasServices]);

  const filteredTxns = useMemo(() => transactions.filter(tx => {
    if (txnFilter === 'all')      return true;
    if (txnFilter === 'vehicle')  return tx.source === 'vehicleTrip';
    if (txnFilter === 'shop')     return ['manual', 'manual_credit', 'invoice', 'invoicePayment'].includes(tx.source);
    if (txnFilter === 'services') return tx.source === 'production';
    if (txnFilter === 'payments') return tx.type === 'payment';
    return true;
  }), [transactions, txnFilter]);

  const getSourceBadge = useCallback(txn => {
    const map = {
      vehicleTrip:    { bg: '#bae6fd', color: '#0369a1', label: `🚛 ${t.vehicleTrip}` },
      production:     { bg: '#ddd6fe', color: '#7c3aed', label: `🔧 ${t.serviceEntry}` },
      invoice:        { bg: '#fef3c7', color: '#b45309', label: '🧾 Invoice' },
      invoicePayment: { bg: '#dcfce7', color: '#16a34a', label: `💵 ${t.invoicePayment}` },
      adjustment:     { bg: '#fef2f2', color: '#dc2626', label: `⚙️ ${t.adjustment}` },
      manual_credit:  { bg: '#fce7f3', color: '#be185d', label: `➕ ${t.addCredit}` },
    };
    return map[txn.source] || { bg: '#e2e8f0', color: '#475569', label: '💳 Manual' };
  }, [t]);

  const totalCredits  = useMemo(() => transactions.filter(x => x.type === 'credit' && !x.isAdjustment).reduce((s, x) => s + x.amount, 0), [transactions]);
  const totalPayments = useMemo(() => transactions.filter(x => x.type === 'payment' && !x.isAdjustment).reduce((s, x) => s + x.amount, 0), [transactions]);
  const curBal = nn(customer?.currentBalance);  /* ══════════════════════════════════════════════════════
     LOADING / AUTH GUARD
     ══════════════════════════════════════════════════════ */
  if (authLoading || loading) return (
    <div style={{ padding:40, textAlign:'center', color:'#64748b' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}.spinner{border:3px solid rgba(0,0,0,0.1);border-left-color:#3b82f6;border-radius:50%;width:20px;height:20px;animation:spin 1s linear infinite;display:inline-block;vertical-align:middle;margin-right:6px}`}</style>
      <div style={{ fontSize:40, marginBottom:10 }}>⏳</div>
      <div style={{ fontWeight:600 }}>{t.loading}</div>
    </div>
  );

  if (!user?.uid) return (
    <div style={{ textAlign:'center', padding:60, color:'#64748b' }}>🔐 Login required</div>
  );

  if (!customer) return (
    <div style={{ textAlign:'center', padding:60, color:'#64748b' }}>
      <div style={{ fontSize:50, marginBottom:10 }}>📭</div>
      <div>Customer not found</div>
      <button onClick={() => { window.location.href = '/customers'; }} style={{ marginTop:16, padding:'10px 24px', background:'#3b82f6', color:'white', border:'none', borderRadius:8, cursor:'pointer', fontWeight:700 }}>
        {t.back || '← Back'}
      </button>
    </div>
  );

  /* ══════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════ */
  return (
    <div style={ST.container}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}.spinner{border:3px solid rgba(0,0,0,0.1);border-left-color:#3b82f6;border-radius:50%;width:20px;height:20px;animation:spin 1s linear infinite;display:inline-block;vertical-align:middle;margin-right:6px}`}</style>
      <Toast toast={toast} />

      {/* ── Modals ── */}
      <TransactionModal show={modals.txn} type={modals.txnType} customer={customer}
        onClose={() => closeModal('txn')} onConfirm={handleTransactionConfirm}
        isProcessing={isProcessing} bankAccounts={bankAccounts}
        bankLoading={bankLoading} t={t} lang={lang} />

      <EditTransactionModal isOpen={modals.editTxn} onClose={() => closeModal('editTxn')}
        txn={selectedTxn} onSave={handleEditTxn} lang={lang} />

      <SendLinkModal isOpen={modals.sendLink} onClose={() => closeModal('sendLink')}
        customer={customer} onUpdateCustomer={setCustomer} lang={lang} />

      <EditCustomerModal isOpen={modals.edit} onClose={() => closeModal('edit')}
        customer={customer} onSave={setCustomer} lang={lang} />

      <DeleteCustomerModal isOpen={modals.delete} onClose={() => closeModal('delete')}
        customer={customer} onDelete={() => { window.location.href = '/customers'; }} lang={lang} />

      <ReminderModal isOpen={modals.reminder} onClose={() => closeModal('reminder')}
        customer={customer} lang={lang} onUpdateCustomer={setCustomer} />

      <ServiceBillModal isOpen={modals.serviceBill} onClose={() => closeModal('serviceBill')}
        productionData={selectedProductionData} lang={lang} />

      <ReceiptShareModal isOpen={modals.receiptShare}
        onClose={() => { closeModal('receiptShare'); setReceiptShareData(null); }}
        receiptData={receiptShareData} customer={customer}
        t={t} lang={lang} invoiceSettings={invoiceSettings} showToast={showToast} />

      {modals.date && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3>📅 {t.setDueDate}</h3>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={styles.input} />
            <input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} style={styles.input} />
            <div style={styles.modalActions}>
              <button onClick={() => closeModal('date')} style={styles.btnCancel}>{t.cancel}</button>
              <button onClick={handleSetDueDate} style={styles.btnSave}>{t.save}</button>
            </div>
          </div>
        </div>
      )}

      {modals.approval && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3>✅ {t.approvals}</h3>
            {pendingApprovals.length === 0
              ? <p style={{ textAlign:'center', color:'#888' }}>{t.noApprovals}</p>
              : pendingApprovals.map(p => (
                <div key={p.id} style={{ borderBottom:'1px solid #eee', padding:10 }}>
                  <p>Rs. {p.amount} - {p.note}</p>
                  {p.receiptImage && <img src={p.receiptImage} style={{ width:50, height:50, objectFit:'cover', borderRadius:5 }} alt="" />}
                  <button onClick={() => handleApprove(p)} style={{ ...styles.btnSave, marginTop:5 }}>Approve</button>
                </div>
              ))}
            <button onClick={() => closeModal('approval')} style={{ marginTop:10, width:'100%', padding:10 }}>{t.close}</button>
          </div>
        </div>
      )}

      {/* ── Back button ── */}
      <button onClick={() => { window.location.href = '/customers'; }}
        style={{ background:'#f1f5f9', border:'none', padding:'8px 16px', borderRadius:8, fontSize:15, cursor:'pointer', fontWeight:'bold', marginBottom:16, color:'#475569' }}>
        {t.back || '← ආපසු'}
      </button>

      {/* ── Header Card ── */}
      <div style={ST.headerCard}>
        <h1 style={{ margin:0, fontSize:24 }}>{customer.name}</h1>
        <p style={{ margin:'4px 0', color:'#64748b' }}>{formatPhoneWithCode(customer.phone)}</p>

        <div style={{
          background: curBal > 0 ? '#fef2f2' : curBal < 0 ? '#eff6ff' : '#f0fdf4',
          border: `2px solid ${curBal > 0 ? '#fecaca' : curBal < 0 ? '#bfdbfe' : '#bbf7d0'}`,
          borderRadius: 12, padding: 15, margin: '10px 0', textAlign: 'center',
        }}>
          <small style={{ color:'#64748b' }}>{t.balance}</small>
          <h2 style={{
            color: curBal > 0 ? '#dc2626' : curBal < 0 ? '#2563eb' : '#16a34a',
            fontSize: 32, margin: '5px 0',
          }}>
            Rs. {fmt(Math.abs(curBal))}
          </h2>
          {curBal > 0.01 && <span style={{ fontSize:12, color:'#dc2626', fontWeight:700 }}>⚠️ ගෙවීමට ඇත</span>}
          {curBal < -0.01 && <span style={{ fontSize:12, color:'#2563eb', fontWeight:700 }}>💰 ඔබට ලැබිය යුතුයි</span>}
          {Math.abs(curBal) <= 0.01 && <span style={{ fontSize:12, color:'#16a34a', fontWeight:700 }}>✅ සියල්ල ගෙවා ඇත</span>}
        </div>

        <div style={{ display:'flex', gap:8, marginTop:8 }}>
          <div style={{ flex:1, background:'#fef2f2', padding:8, borderRadius:8, textAlign:'center' }}>
            <div style={{ fontSize:10, color:'#dc2626', fontWeight:600 }}>{t.totalCredits}</div>
            <div style={{ fontSize:14, fontWeight:800, color:'#dc2626' }}>Rs.{fmt(totalCredits)}</div>
          </div>
          <div style={{ flex:1, background:'#f0fdf4', padding:8, borderRadius:8, textAlign:'center' }}>
            <div style={{ fontSize:10, color:'#16a34a', fontWeight:600 }}>{t.totalPayments}</div>
            <div style={{ fontSize:14, fontWeight:800, color:'#16a34a' }}>Rs.{fmt(totalPayments)}</div>
          </div>
        </div>

        {customer.dueDate && (
          <div style={{ background:'#fee2e2', color:'#991b1b', padding:'6px 12px', borderRadius:20, fontSize:12, marginTop:10, display:'inline-block', fontWeight:'bold' }}>
            📅 Due: {customer.dueDate} {customer.dueTime}
          </div>
        )}
      </div>

      {/* ── Language toggle ── */}
      <div style={{ display:'flex', justifyContent:'center', gap:10, marginBottom:20 }}>
        <button onClick={() => setLang('si')} style={{ padding:'8px 20px', border: lang === 'si' ? '2px solid #3b82f6' : '2px solid #e2e8f0', background: lang === 'si' ? '#3b82f6' : 'white', color: lang === 'si' ? 'white' : '#64748b', borderRadius:25, cursor:'pointer', fontWeight:700, fontSize:13 }}>🇱🇰 සිංහල</button>
        <button onClick={() => setLang('en')} style={{ padding:'8px 20px', border: lang === 'en' ? '2px solid #3b82f6' : '2px solid #e2e8f0', background: lang === 'en' ? '#3b82f6' : 'white', color: lang === 'en' ? 'white' : '#64748b', borderRadius:25, cursor:'pointer', fontWeight:700, fontSize:13 }}>🇬🇧 English</button>
      </div>

      {/* ── Action Buttons ── */}
      <div style={ST.actionGrid}>
        {!isPortalMode && (<>
          <button onClick={() => openModal('txn', { txnType:'credit' })} style={ST.actionBtn('#fee2e2','#dc2626')}><span style={{ fontSize:24 }}>➕</span> {t.addCredit}</button>
          <button onClick={() => openModal('txn', { txnType:'payment' })} style={ST.actionBtn('#dcfce7','#16a34a')}><span style={{ fontSize:24 }}>💰</span> {t.getPayment}</button>
          <button onClick={() => openModal('reminder')} style={ST.actionBtn('#fef3c7','#d97706')}><span style={{ fontSize:24 }}>🔔</span> {t.remind}</button>
          <button onClick={() => openModal('date')} style={ST.actionBtn('#e0e7ff','#4338ca')}><span style={{ fontSize:24 }}>📅</span> {t.setDueDate}</button>
          <button onClick={() => openModal('approval')} style={{ ...ST.actionBtn('#ffedd5','#ea580c'), position:'relative' }}>
            <span style={{ fontSize:24 }}>✅</span> {t.approvals}
            {pendingApprovals.length > 0 && <span style={ST.badge}>{pendingApprovals.length}</span>}
          </button>
          <button onClick={() => openModal('sendLink')} style={ST.actionBtn('#f0fdf4','#166534')}><span style={{ fontSize:24 }}>📎</span> {t.sendLink}</button>
          <button onClick={() => openModal('edit')} style={ST.actionBtn('#fef3c7','#b45309')}><span style={{ fontSize:24 }}>✏️</span> {t.editCustomer}</button>
          <button onClick={() => openModal('delete')} style={ST.actionBtn('#fee2e2','#dc2626')}><span style={{ fontSize:24 }}>🗑️</span> {t.deleteCustomer}</button>
        </>)}
        <button onClick={() => {
          if (customer.portalAccessKey) window.open(`/portal/${customer.portalAccessKey}`, '_blank');
          else alert("Click 'Send Link' first.");
        }} style={ST.actionBtn('#f3f4f6','#334155')}><span style={{ fontSize:24 }}>📄</span> {t.viewReport}</button>
      </div>

      {/* ── Transaction History ── */}
      <div style={ST.listContainer}>
        <h3>📋 {t.transactionHistory}</h3>

        {filterTabs.length > 2 && (
          <div style={{ display:'flex', gap:6, marginBottom:16, overflowX:'auto', paddingBottom:4 }}>
            {filterTabs.map(tab => (
              <button key={tab.key} onClick={() => setTxnFilter(tab.key)}
                style={{
                  padding:'8px 16px', borderRadius:20, border:'none', cursor:'pointer',
                  fontSize:13, fontWeight: txnFilter === tab.key ? 700 : 500,
                  background: txnFilter === tab.key ? '#3b82f6' : '#f1f5f9',
                  color: txnFilter === tab.key ? 'white' : '#64748b',
                  display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap',
                }}>
                <span>{tab.icon}</span><span>{tab.label}</span>
              </button>
            ))}
          </div>
        )}

        {filteredTxns.length === 0 ? (
          <div style={{ padding:30, textAlign:'center', color:'#94a3b8' }}>
            {txnFilter === 'vehicle' ? `🚛 ${t.noVehicleTrips}` : txnFilter === 'services' ? `🔧 ${t.noServices}` : t.noTransactions}
          </div>
        ) : filteredTxns.map((txn, i) => {
          const badgeInfo = getSourceBadge(txn);
          const isVeh = txn.source === 'vehicleTrip';
          const isProd = txn.source === 'production';
          const isAdj = txn.source === 'adjustment';

          let rowBg = txn.type === 'payment' ? '#f0fdf4' : '#fff';
          if (isVeh) rowBg = txn.type === 'credit' ? '#f0f9ff' : '#f0fdf4';
          if (isProd) rowBg = txn.type === 'credit' ? '#faf5ff' : '#f0fdf4';
          if (txn.source === 'invoicePayment') rowBg = '#f0fdf4';
          if (isAdj) rowBg = '#fef2f2';

          return (
            <div key={txn.id + i} style={{ padding:16, borderBottom:'1px solid #e2e8f0', background:rowBg }}>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:800, color:'#1e293b', fontSize:14 }}>{txn.date}</div>
                  <div style={{ fontSize:12, color:'#64748b' }}>⏱️ {txn.time}</div>
                  <div style={{ fontSize:14, color:'#334155', marginTop:6 }}>{txn.note}</div>
                  {txn.bankAccountName && (
                    <div style={{ marginTop:4 }}>
                      <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'#eff6ff', color:'#1d4ed8', display:'inline-block' }}>
                        🏦 {txn.bankAccountName}
                      </span>
                    </div>
                  )}
                  {isVeh && txn.type === 'credit' && txn.tripData && (
                    <div style={{ marginTop:8, padding:'6px 12px', background:'#e0f2fe', borderRadius:8, border:'1px solid #bae6fd', fontSize:12, display:'inline-block' }}>
                      <span style={{ color:'#0369a1', fontWeight:600 }}>{t.tripFare}: Rs.{txn.tripData.fare?.toLocaleString()} | {t.tripPaid}: Rs.{txn.tripData.paidAmount?.toLocaleString()}</span>
                    </div>
                  )}
                  {isProd && txn.type === 'credit' && txn.productionData && (
                    <div style={{ marginTop:8 }}>
                      <button onClick={() => { setSelectedProductionData(txn.productionData); openModal('serviceBill'); }}
                        style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:8, border:'1px solid #8b5cf6', background:'#f5f3ff', color:'#7c3aed', cursor:'pointer' }}>
                        🧾 {t.viewBill}
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ textAlign:'right', flexShrink:0, marginLeft:15 }}>
                  <div style={{ fontWeight:900, fontSize:18, color: txn.type === 'credit' ? '#dc2626' : '#16a34a' }}>
                    {txn.type === 'credit' ? '+' : '-'}Rs. {fmt(txn.amount)}
                  </div>
                  <div style={{
                    fontSize:13, marginTop:6, fontWeight:700, background:'#f8fafc',
                    padding:'4px 8px', border:'1px solid #e2e8f0', borderRadius:6,
                    display:'inline-block',
                    color: (txn.runningBalance || 0) > 0.01 ? '#dc2626' : (txn.runningBalance || 0) < -0.01 ? '#2563eb' : '#16a34a',
                  }}>
                    {t.runningBalance}: Rs. {fmt(txn.runningBalance || 0)}
                  </div>
                  <div style={{
                    marginTop:4, fontSize:11, fontWeight:700, padding:'2px 8px',
                    borderRadius:12, display:'inline-block',
                    background:badgeInfo.bg, color:badgeInfo.color,
                  }}>
                    {badgeInfo.label}
                  </div>
                  {(txn.source === 'manual' || txn.source === 'manual_credit') && (
                    <div style={{ marginTop:8 }}>
                      <button onClick={() => { setSelectedTxn(txn); openModal('editTxn'); }} style={ST.iconBtn}>✏️</button>
                      <button onClick={() => handleDeleteTxn(txn)} style={ST.iconBtn}>🗑️</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   STYLES
   ══════════════════════════════════════════════════════════════ */
const styles = {
  modalOverlay: { position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:2000 },
  modal: { background:'white', padding:25, borderRadius:16, width:'90%', maxWidth:400, boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)', maxHeight:'90vh', overflowY:'auto' },
  input: { width:'100%', padding:14, border:'2px solid #e2e8f0', borderRadius:10, marginBottom:12, fontSize:15, boxSizing:'border-box', outline:'none' },
  textarea: { width:'100%', padding:14, border:'2px solid #e2e8f0', borderRadius:10, marginBottom:12, height:80, fontSize:15, boxSizing:'border-box', outline:'none' },
  modalActions: { display:'flex', gap:10, marginTop:15 },
  btnCancel: { flex:1, padding:14, background:'#f1f5f9', color:'#475569', border:'none', borderRadius:10, fontWeight:'bold', cursor:'pointer' },
  btnSave: { flex:1, padding:14, background:'linear-gradient(135deg,#3b82f6,#2563eb)', color:'white', border:'none', borderRadius:10, fontWeight:'bold', cursor:'pointer' },
  btnFull: { width:'100%', padding:14, border:'none', borderRadius:10, fontWeight:'bold', cursor:'pointer', fontSize:15, color:'white', background:'#3b82f6' },
  formLabel: { display:'block', fontSize:12, fontWeight:600, marginBottom:5, color:'#374151' },
};

const ST = {
  container: { padding:20, maxWidth:800, margin:'0 auto', fontFamily:'sans-serif', paddingBottom:50 },
  headerCard: { textAlign:'center', padding:30, background:'linear-gradient(135deg,#f8fafc,#f1f5f9)', borderRadius:16, marginBottom:20, border:'2px solid #e2e8f0' },
  actionGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:12, marginBottom:20 },
  actionBtn: (bg, color) => ({ padding:15, background:bg, color, border:'none', borderRadius:12, fontWeight:800, cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', gap:8, justifyContent:'center', position:'relative' }),
  listContainer: { background:'white', padding:20, borderRadius:16, boxShadow:'0 4px 15px rgba(0,0,0,0.05)', border:'1px solid #e2e8f0' },
  iconBtn: { background:'#fee2e2', color:'#dc2626', border:'none', borderRadius:6, cursor:'pointer', fontSize:14, padding:'6px 10px', marginLeft:6 },
  badge: { position:'absolute', top:-5, right:-5, background:'#ef4444', color:'white', borderRadius:'50%', width:22, height:22, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:'bold', border:'2px solid white' },
};