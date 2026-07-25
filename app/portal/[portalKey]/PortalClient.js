// catalog/app/portal/[portalKey]/PortalClient.js
'use client';

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  onSnapshot,
  doc,
  getDoc,
} from 'firebase/firestore';

// ══════════════════════════════════════
// FIREBASE
// ══════════════════════════════════════
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

// ══════════════════════════════════════
// HELPERS
// ══════════════════════════════════════
const nn = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

const fmtAmt = (v) =>
  nn(v).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const defaultImg = 'https://placehold.co/200x200/e2e8f0/64748b?text=No+Image';

const getImg = (item) => {
  if (!item) return defaultImg;
  for (const f of ['imageUrl', 'picture', 'photoURL', 'image', 'itemImage']) {
    const val = item[f];
    if (typeof val === 'string' && val.length > 10 && (val.startsWith('http') || val.startsWith('data:image'))) return val;
  }
  if (item.images?.length > 0 && typeof item.images[0] === 'string') return item.images[0];
  return defaultImg;
};

const norm = (v) => (v || '').toString().trim().toLowerCase();

const normalizePhone = (p) => {
  if (!p) return '';
  let s = String(p).replace(/[\s\-\(\)]/g, '');
  if (s.startsWith('+94')) s = '0' + s.slice(3);
  else if (s.startsWith('94') && s.length >= 11) s = '0' + s.slice(2);
  else if (/^\d{9}$/.test(s)) s = '0' + s;
  return s;
};

const formatPhoneForCall = (phone) => {
  if (!phone) return '';
  let c = phone.replace(/[\s\-\(\)]/g, '');
  if (c.startsWith('0')) c = '+94' + c.substring(1);
  if (!c.startsWith('+')) c = '+94' + c;
  return c;
};

const formatPhoneForWhatsApp = (phone) => {
  if (!phone) return '';
  let c = phone.replace(/[\s\-\(\)\+]/g, '');
  if (c.startsWith('0')) c = '94' + c.substring(1);
  if (c.length === 9) c = '94' + c;
  return c;
};

const getAllItemNames = (item) => {
  if (!item) return { primary: '—', secondary: '', badges: [] };
  const nameFields = [item.sinhalaName, item.name, item.goodsName, item.itemName];
  const uniqueNames = [...new Set(nameFields.map((n) => (n || '').trim()).filter(Boolean))];
  const primary = uniqueNames.length > 0 ? uniqueNames[0] : '—';
  const secondary = uniqueNames.slice(1).join('  |  ');
  const badges = [];
  const brand = (item.brandName || item.brand || '').trim();
  if (brand) badges.push({ label: brand, icon: '🏷️', color: '#7c3aed', bg: '#f3f0ff' });
  const codeFields = [item.itemCode, item.code, item.modelKeyCode, item.barcode];
  [...new Set(codeFields.map((c) => (c || '').trim()).filter(Boolean))].forEach((code) => {
    badges.push({ label: code, icon: '🔢', color: '#0369a1', bg: '#e0f2fe' });
  });
  return { primary, secondary, badges };
};

const getDisplayUnit = (i) => i.catalogUom || i.displayUnit || i.uomName || i.uom || i.unit || '';

const getPriceInfo = (item) => {
  const type = item.catalogPriceType || 'retail';
  let bp = 0, dp = 0;
  switch (type) {
    case 'wholesale': bp = nn(item.sellingPriceWholesale); dp = nn(item.wholesaleDiscount); break;
    case 'loose': bp = nn(item.sellingPriceLoose); dp = nn(item.looseDiscount); break;
    default: bp = nn(item.sellingPriceRetail || item.sellingPrice || item.price); dp = nn(item.retailDiscount || item.discountPercent); break;
  }
  let f = 1;
  if (item.catalogUom && item.catalogUom !== item.uomName && item.availableUnits?.length > 0) {
    const c = item.availableUnits.find((u) => u.toUnitName === item.catalogUom);
    if (c && nn(c.factor) > 0) f = nn(c.factor);
  }
  const uo = bp / f, da = uo * (dp / 100), uf = uo - da;
  return { original: uo, final: uf, discPct: dp, discAmount: da, hasDisc: dp > 0 && da > 0.005, unit: item.catalogUom || item.uomName || '' };
};

const getHistoryItemPrices = (it) => {
  const qty = nn(it.qty || it.quantity || 1);
  let op = nn(it.originalPrice) || nn(it.unitPrice) || nn(it.price);
  const dp = nn(it.discPercent || it.discountPercent || it.discPct);
  const sda = nn(it.discAmount || it.discAmout);
  let fp = nn(it.yourPrice);
  if (fp === 0 && op > 0) {
    if (sda > 0) fp = op - sda;
    else if (dp > 0) fp = op - (op * dp / 100);
    else fp = op;
  }
  if (op === 0 && fp > 0) op = dp > 0 ? fp / (1 - dp / 100) : fp;
  const adu = Math.max(0, op - fp), hd = adu > 0.005;
  const edp = hd ? (dp > 0 ? dp : (op > 0 ? (adu / op) * 100 : 0)) : 0;
  return { qty, originalPrice: op, finalPrice: fp, discPercent: edp, discAmountPerUnit: adu, hasDiscount: hd, lineOriginal: op * qty, lineTotal: nn(it.lineTotal) || nn(it.total) || (fp * qty), lineDiscount: hd ? adu * qty : 0 };
};

const getTransactionImage = (tx) => {
  if (!tx) return null;
  for (const f of ['receiptImage', 'receiptUrl', 'imageUrl', 'paymentReceipt', 'image', 'photoURL', 'picture']) {
    const val = tx[f];
    if (typeof val === 'string' && val.length > 10 && (val.startsWith('http') || val.startsWith('data:image'))) return val;
  }
  return null;
};

const findCatalogMatch = (catalogItems, it) => {
  if (!it || !Array.isArray(catalogItems) || catalogItems.length === 0) return null;
  const itemKeys = [it.itemId, it.id, it.itemCode, it.barcode, norm(it.name), norm(it.sinhalaName)].filter(Boolean);
  return catalogItems.find((c) => {
    const catKeys = [c.id, c.itemCode, c.barcode, norm(c.name), norm(c.sinhalaName)].filter(Boolean);
    return itemKeys.some((k) => catKeys.includes(k));
  }) || null;
};

const enrichItem = (it, catalogItems) => {
  const cat = findCatalogMatch(catalogItems, it);
  if (!cat) return it;
  return { ...cat, ...it, photoURL: it.photoURL || getImg(cat) };
};

const compressReceiptImage = (file, maxWidth = 600) => {
  return new Promise((resolve, reject) => {
    if (file.size > 10 * 1024 * 1024) { reject(new Error('File too large')); return; }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(maxWidth / img.width, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

const calculateReturnTotals = (rd) => {
  let itemsTotal = 0;
  if (Array.isArray(rd.items) && rd.items.length > 0) {
    for (const item of rd.items) {
      let qty = nn(item.qty || item.quantity || 1);
      let up = nn(item.price || item.unitPrice || item.yourPrice || item.refundPrice);
      let la = nn(item.amount || item.total || item.lineTotal);
      if (up === 0 && la > 0 && qty > 0) up = la / qty;
      if (la === 0 && up > 0 && qty > 0) la = up * qty;
      itemsTotal += la;
    }
  }
  const docTotal = nn(rd.refundAmount) || nn(rd.total) || nn(rd.amount) || nn(rd.netAmount);
  return { itemsTotal, docTotal, displayTotal: itemsTotal > 0 ? itemsTotal : docTotal };
};

const formatPortalDate = (src, lang) => {
  const loc = lang === 'si' ? 'si-LK' : 'en-GB';
  try {
    if (!src) return '';
    if (typeof src?.toDate === 'function') return src.toDate().toLocaleDateString(loc, { year: 'numeric', month: 'short', day: '2-digit' });
    if (src?.seconds) return new Date(src.seconds * 1000).toLocaleDateString(loc, { year: 'numeric', month: 'short', day: '2-digit' });
    if (typeof src === 'string') { const d = new Date(src); if (!isNaN(d.getTime())) return d.toLocaleDateString(loc, { year: 'numeric', month: 'short', day: '2-digit' }); }
    return '';
  } catch { return ''; }
};

const PORTAL_SHARE_BASE = process.env.NEXT_PUBLIC_CATALOG_URL || 'https://pos-catalog-gold.vercel.app';

const getShareUrl = (shopId, itemId) => `${PORTAL_SHARE_BASE}/pfi/${shopId}/item/${itemId}`;

const getPortalShareUrl = (portalKey) => `${PORTAL_SHARE_BASE}/portal/${portalKey}`;

// ══════════════════════════════════════
// STATUS CONFIG
// ══════════════════════════════════════
const STATUS_STYLE = {
  pending:          { label: 'Pending',   labelSi: 'පොරොත්තුවේ',   color: '#f59e0b', bg: '#fefce8', icon: '⏳' },
  confirmed:        { label: 'Confirmed', labelSi: 'තහවුරු',        color: '#16a34a', bg: '#f0fdf4', icon: '✅' },
  processing:       { label: 'Processing',labelSi: 'සැකසෙමින්',    color: '#2563eb', bg: '#eff6ff', icon: '⚙️' },
  shipped:          { label: 'Shipped',   labelSi: 'යවන ලදී',      color: '#7c3aed', bg: '#faf5ff', icon: '🚚' },
  delivered:        { label: 'Delivered', labelSi: 'බාර දුන්නා',   color: '#059669', bg: '#ecfdf5', icon: '📦' },
  cancelled:        { label: 'Cancelled', labelSi: 'අවලංගු',       color: '#dc2626', bg: '#fef2f2', icon: '❌' },
  payment:          { label: 'Paid',      labelSi: 'ගෙවීම',        color: '#16a34a', bg: '#dcfce7', icon: '💰' },
  invoice:          { label: 'Bill',      labelSi: 'බිල',          color: '#1e40af', bg: '#dbeafe', icon: '🧾' },
  return:           { label: 'Returned',  labelSi: 'ආපසු',         color: '#ea580c', bg: '#fff7ed', icon: '↩️' },
  return_pending:   { label: 'Return Pending', labelSi: 'ආපසු පොරොත්තුවේ', color: '#ea580c', bg: '#fff7ed', icon: '⏳' },
  return_completed: { label: 'Return Done',    labelSi: 'ආපසු සම්පූර්ණයි', color: '#16a34a', bg: '#f0fdf4', icon: '✅' },
  completed:        { label: 'Completed', labelSi: 'සම්පූර්ණයි',  color: '#059669', bg: '#ecfdf5', icon: '✅' },
  production:       { label: 'Service',   labelSi: 'සේවාව',        color: '#0891b2', bg: '#ecfeff', icon: '🔧' },
  trip:             { label: 'Trip',      labelSi: 'ගමන',          color: '#8b5cf6', bg: '#f5f3ff', icon: '🚛' },
  approved:         { label: 'Approved',  labelSi: 'අනුමත',        color: '#16a34a', bg: '#dcfce7', icon: '✅' },
  rejected:         { label: 'Rejected',  labelSi: 'ප්‍රතික්ෂේප', color: '#dc2626', bg: '#fef2f2', icon: '❌' },
};

// ══════════════════════════════════════
// TRANSLATIONS
// ══════════════════════════════════════
const translations = {
  si: {
    balance: 'වත්මන් ශේෂය', orderTab: '🛒 ඇණවුම්', accountTab: '📊 ඉතිහාසය',
    billsTab: '🧾 බිල්පත්', search: 'භාණ්ඩ සොයන්න...', addToCart: 'කරත්තයට',
    checkout: 'ඇණවුම යොමු කරන්න', customerName: 'ඔබේ නම', customerPhone: 'දුරකථන අංකය',
    placeOrder: 'ඇණවුම තහවුරු කරන්න', orderSuccess: 'ඇණවුම සාර්ථකයි!',
    loading: 'පූරණය වෙමින්...', noOrders: 'ගනුදෙනු නොමැත.',
    paid: 'ගෙවූ මුදල', due: 'හිඟ මුදල', download: 'රිසිට් පත',
    saving: 'ඉතිරි කිරීම', perUnit: 'එකකට', contactForPrice: 'මිල සඳහා අමතන්න',
    cartItems: 'භාණ්ඩ', cancelOrder: 'අවලංගු කරන්න',
    confirmOrder: 'ඇණවුම තහවුරු කරන්න', ok: 'හරි',
    grossTotal: 'මුළු මිල', grandTotal: 'ගෙවිය යුතු මුදල',
    youSaved: 'ඔබ ඉතිරි කළ මුදල', langSwitch: 'EN',
    detailsRequired: 'නම සහ දුරකථන අංකය අවශ්‍යයි', cartEmpty: 'කරත්තය හිස්ය',
    errorOccurred: 'දෝෂයක් ඇති විය', notFound: 'පාරිභෝගිකයා හමු නොවීය',
    makePayment: '💳 මුදල් ගෙවන්න', paymentAmount: 'ගෙවන මුදල',
    paymentNote: 'සටහන', uploadReceipt: '📷 බැංකු රිසිට් පත Upload කරන්න',
    receiptUploaded: '✅ Upload කළා', submitPayment: '💰 ගෙවීම යොමු කරන්න',
    submitting: 'යොමු කරමින්...', paymentSuccess: '✅ ගෙවීම සාර්ථකයි!',
    paymentSuccessDesc: 'ඔබේ ගෙවීම ලැබුණි. වෙළඳසැල විසින් තහවුරු කළ පසු ශේෂය යාවත්කාලීන වේ.',
    bankAccounts: '🏦 බැංකු ගිණුම්', noBankAccounts: 'බැංකු ගිණුම් නොමැත',
    accNumber: 'ගිණුම් අංකය', accName: 'ගිණුම් හිමියා',
    copiedAccNo: '✅ Copy කළා!', tapToCopy: '📋 Copy',
    amountRequired: '⚠️ මුදල ඇතුළත් කරන්න',
    totalOutstanding: 'මුළු ණය', unpaidBills: 'ගෙවිය යුතු බිල්පත්',
    settleBill: '💳 Settle', billPaid: 'ගෙවූ', billDue: 'ඉතිරි ණය',
    noBills: 'ගෙවිය යුතු බිල්පත් නැත 🎉', allPaid: 'සියල්ල ගෙවා ඇත!',
    hideDetails: 'සඟවන්න', viewDetails: 'විස්තර බලන්න',
    closeModal: 'වසන්න', paymentApproved: '✅ අනුමත', paymentPending: '⏳ පොරොත්තුවේ',
    paymentRejected: '❌ ප්‍රතික්ෂේප', rejectReason: 'හේතුව',
    selectAll: 'සියල්ල තෝරන්න', deselectAll: 'ඉවත් කරන්න',
    paySelected: 'තෝරාගත් ගෙවන්න', selectedTotal: 'තෝරාගත් මුළු',
    billsSelected: 'තෝරා ඇත', payFull: 'සම්පූර්ණ මුදල ගෙවන්න',
    yourBalance: 'ඔබේ ශේෂය', generalPayment: '📋 සාමාන්‍ය ගෙවීම',
    invoiceDue: 'ගෙවිය යුතු', selectInvoice: 'බිල්පතක් තෝරන්න',
    step1: '1️⃣ බැංකු ගිණුමකට මුදල් බැර කරන්න',
    step2: '2️⃣ රිසිට් පත Upload කරන්න',
    step3: '3️⃣ ගෙවීම යොමු කරන්න',
    paymentSteps: 'ගෙවීම් පියවර',
    viewReceipt: '🧾 රිසිට් බලන්න',
    tripInfo: '🚛 ගමන් විස්තර', tripTotalBill: 'මුළු ගාස්තුව',
    tripPaid: 'ගෙවූ', tripBalance: 'ඉතිරි ණය',
  },
  en: {
    balance: 'Balance', orderTab: '🛒 Orders', accountTab: '📊 History',
    billsTab: '🧾 Bills', search: 'Search...', addToCart: 'Add to Cart',
    checkout: 'Checkout', customerName: 'Your Name', customerPhone: 'Phone',
    placeOrder: 'Confirm Order', orderSuccess: 'Order Placed!',
    loading: 'Loading...', noOrders: 'No transactions.',
    paid: 'Paid', due: 'Due', download: 'Receipt',
    saving: 'Saving', perUnit: 'per', contactForPrice: 'Contact for Price',
    cartItems: 'Items', cancelOrder: 'Cancel',
    confirmOrder: 'Confirm', ok: 'OK',
    grossTotal: 'Gross', grandTotal: 'Grand Total',
    youSaved: 'You Saved', langSwitch: 'සි',
    detailsRequired: 'Name and phone required', cartEmpty: 'Cart empty',
    errorOccurred: 'Error occurred', notFound: 'Customer not found',
    makePayment: '💳 Make Payment', paymentAmount: 'Amount',
    paymentNote: 'Note', uploadReceipt: '📷 Upload Receipt',
    receiptUploaded: '✅ Uploaded', submitPayment: '💰 Submit',
    submitting: 'Submitting...', paymentSuccess: '✅ Payment Submitted!',
    paymentSuccessDesc: 'Your payment received. Balance will update after confirmation.',
    bankAccounts: '🏦 Bank Accounts', noBankAccounts: 'No bank accounts',
    accNumber: 'Acc No', accName: 'Holder',
    copiedAccNo: '✅ Copied!', tapToCopy: '📋 Copy',
    amountRequired: '⚠️ Enter amount',
    totalOutstanding: 'Outstanding', unpaidBills: 'Unpaid Bills',
    settleBill: '💳 Settle', billPaid: 'Paid', billDue: 'Due',
    noBills: 'No unpaid bills 🎉', allPaid: 'All settled!',
    hideDetails: 'Hide', viewDetails: 'View Details',
    closeModal: 'Close', paymentApproved: '✅ Approved', paymentPending: '⏳ Pending',
    paymentRejected: '❌ Rejected', rejectReason: 'Reason',
    selectAll: 'Select All', deselectAll: 'Deselect',
    paySelected: 'Pay Selected', selectedTotal: 'Selected Total',
    billsSelected: 'selected', payFull: 'Pay Full',
    yourBalance: 'Your Balance', generalPayment: '📋 General Payment',
    invoiceDue: 'Due', selectInvoice: 'Select Invoice',
    step1: '1️⃣ Transfer to bank account',
    step2: '2️⃣ Upload receipt',
    step3: '3️⃣ Submit payment',
    paymentSteps: 'Steps',
    viewReceipt: '🧾 View Receipt',
    tripInfo: '🚛 Trip Details', tripTotalBill: 'Total Bill',
    tripPaid: 'Paid', tripBalance: 'Balance',
  },
};// ══════════════════════════════════════
// SUB COMPONENTS
// ══════════════════════════════════════

const ItemImageBox = ({ item, size = 44, onZoom, isReturn = false }) => {
  const src = getImg(item);
  const hasReal = src !== defaultImg;
  return (
    <div
      onClick={() => onZoom && hasReal && onZoom(src)}
      style={{
        width: size, height: size, borderRadius: 8,
        overflow: 'hidden', flexShrink: 0,
        background: isReturn ? '#fff7ed' : '#f8fafc',
        border: isReturn ? '2px solid #fed7aa' : hasReal ? '1.5px solid #cbd5e1' : '1.5px dashed #cbd5e1',
        cursor: hasReal ? 'zoom-in' : 'default',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}
    >
      <img
        src={src} alt=""
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        onError={(e) => { e.target.onerror = null; e.target.src = defaultImg; }}
      />
      {hasReal && (
        <div style={{
          position: 'absolute', bottom: 2, right: 2,
          background: 'rgba(0,0,0,0.35)', borderRadius: 4,
          padding: '1px 3px', fontSize: 8, color: 'white',
        }}>🔍</div>
      )}
    </div>
  );
};

const ItemNamesBlock = ({ item, size = 'md', isReturn = false }) => {
  const n = getAllItemNames(item);
  const ps = size === 'sm' ? 12 : 14;
  const ss = size === 'sm' ? 10 : 11;
  const bs = size === 'sm' ? 9 : 10;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontWeight: 800, fontSize: ps,
        color: isReturn ? '#9a3412' : '#1e293b',
        lineHeight: 1.35, wordBreak: 'break-word',
      }}>
        {isReturn && '↩️ '}{n.primary}
      </div>
      {n.secondary && (
        <div style={{
          fontSize: ss, color: '#475569', marginTop: 3,
          fontStyle: 'italic', fontWeight: 600,
        }}>{n.secondary}</div>
      )}
      {n.badges.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
          {n.badges.map((b, i) => (
            <span key={i} style={{
              fontSize: bs, fontWeight: 700, color: b.color,
              background: b.bg, padding: '2px 6px', borderRadius: 6,
            }}>{b.icon} {b.label}</span>
          ))}
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════
// BANK ACCOUNT CARD
// ══════════════════════════════════════
const BankAccountCard = ({ bank, t, onCopy }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    const accNo = bank.accountNumber || '';
    if (!accNo) return;
    try { navigator.clipboard.writeText(accNo); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = accNo;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    if (onCopy) onCopy();
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg,#eff6ff,#dbeafe)',
      border: '2px solid #93c5fd', borderRadius: 16,
      padding: 16, marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'linear-gradient(135deg,#1e40af,#3b82f6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
        }}>🏦</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#1e40af' }}>{bank.bankName || 'Bank'}</div>
          {bank.bankBranch && <div style={{ fontSize: 11, color: '#64748b' }}>📍 {bank.bankBranch}</div>}
        </div>
      </div>

      <div
        onClick={handleCopy}
        style={{
          background: 'white', borderRadius: 12, padding: '14px 16px',
          marginBottom: 10,
          border: copied ? '2px solid #16a34a' : '2px solid #bfdbfe',
          cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>{t.accNumber}</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', letterSpacing: 2, fontFamily: 'monospace' }}>
            {bank.accountNumber || '—'}
          </div>
        </div>
        <div style={{
          padding: '6px 12px', borderRadius: 8,
          background: copied ? '#dcfce7' : '#f1f5f9',
          color: copied ? '#16a34a' : '#3b82f6',
          fontSize: 11, fontWeight: 700,
        }}>
          {copied ? t.copiedAccNo : t.tapToCopy}
        </div>
      </div>

      {bank.accountName && (
        <div style={{
          background: 'white', borderRadius: 10, padding: '10px 14px',
          border: '1px solid #e2e8f0',
        }}>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginBottom: 2 }}>{t.accName}</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>👤 {bank.accountName}</div>
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════
// PAYMENT MODAL
// ══════════════════════════════════════
const PaymentModal = ({ customer, selectedShop, bankAccounts, unpaidInvoices, preSelectedInvoices, onClose, onSuccess, t, lang }) => {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [receiptImage, setReceiptImage] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState('');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([]);
  const fileRef = useRef(null);
  const balance = nn(customer?.currentBalance);

  useEffect(() => {
    if (preSelectedInvoices?.length > 0) {
      const ids = preSelectedInvoices.map((inv) => inv.id);
      setSelectedInvoiceIds(ids);
      let totalDue = 0;
      const invNos = [];
      preSelectedInvoices.forEach((inv) => {
        const net = nn(inv.netAmount || inv.grandTotal);
        const paid = nn(inv.payAmount || inv.paidAmount);
        totalDue += Math.max(0, net - paid);
        invNos.push(inv.invoiceNo || inv.invoiceCode || `INV-${inv.id.slice(0, 8).toUpperCase()}`);
      });
      setAmount(totalDue > 0 ? totalDue.toString() : '');
      setNote(preSelectedInvoices.length === 1 ? `${invNos[0]} payment` : `Payment for ${invNos.length} bills`);
    }
  }, [preSelectedInvoices]);

  const selectedInvoicesData = useMemo(
    () => (unpaidInvoices || []).filter((inv) => selectedInvoiceIds.includes(inv.id)),
    [unpaidInvoices, selectedInvoiceIds]
  );

  const selectedTotalDue = useMemo(
    () => selectedInvoicesData.reduce((sum, inv) => {
      const net = nn(inv.netAmount || inv.grandTotal);
      const paid = nn(inv.payAmount || inv.paidAmount);
      return sum + Math.max(0, net - paid);
    }, 0),
    [selectedInvoicesData]
  );

  const handleToggleInvoice = useCallback((inv) => {
    setSelectedInvoiceIds((prev) => {
      const newIds = prev.includes(inv.id)
        ? prev.filter((id) => id !== inv.id)
        : [...prev, inv.id];

      const selInvs = (unpaidInvoices || []).filter((i) => newIds.includes(i.id));
      let totalDue = 0;
      selInvs.forEach((i) => {
        totalDue += Math.max(0, nn(i.netAmount || i.grandTotal) - nn(i.payAmount || i.paidAmount));
      });

      if (newIds.length > 0) setAmount(totalDue > 0 ? totalDue.toString() : '');
      else { setAmount(''); setNote(''); }

      return newIds;
    });
  }, [unpaidInvoices]);

  const handleReceiptUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const b64 = await compressReceiptImage(file, 600);
      setReceiptImage(b64);
      setReceiptPreview(b64);
    } catch { alert('Image error'); }
    e.target.value = '';
  };

  const handleSubmit = async () => {
    const payAmount = nn(amount);
    if (payAmount <= 0) { alert(t.amountRequired); return; }
    setSubmitting(true);
    try {
      const db = getDb();
      const shopUid = selectedShop?.uid || customer?.uid || '';
      const invoiceIds = selectedInvoiceIds;
      const invoiceNos = selectedInvoicesData.map(
        (inv) => inv.invoiceNo || inv.invoiceCode || `INV-${inv.id.slice(0, 8).toUpperCase()}`
      );

      await addDoc(collection(db, 'customerTransactions'), {
        customerId: customer.id,
        customerName: customer.name || '',
        customerPhone: customer.phone || '',
        shopUid,
        uid: shopUid,
        amount: payAmount,
        type: 'payment',
        method: 'bank_transfer',
        paymentMethod: 'bank',
        invoiceId: invoiceIds[0] || '',
        invoiceNo: invoiceNos[0] || '',
        invoiceIds,
        invoiceNos,
        invoiceCount: invoiceIds.length,
        note: note.trim() || `Payment by ${customer.name}`,
        receiptImage: receiptImage || '',
        status: 'pending',
        source: 'customer_portal',
        createdAt: serverTimestamp(),
        date: new Date().toISOString(),
      });

      setSuccess(true);
      if (onSuccess) onSuccess();
    } catch (e) {
      console.error(e);
      alert(t.errorOccurred);
    } finally {
      setSubmitting(false);
    }
  };

  if (success) return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(4px)' }} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 380, background: 'white', borderRadius: 24, textAlign: 'center', padding: '40px 24px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 64, marginBottom: 12 }}>✅</div>
        <h3 style={{ fontSize: 20, fontWeight: 800, color: '#16a34a', margin: '0 0 10px' }}>{t.paymentSuccess}</h3>
        <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5, margin: '0 0 20px' }}>{t.paymentSuccessDesc}</p>
        <button onClick={onClose} style={{ width: '100%', padding: 14, background: '#16a34a', color: 'white', border: 'none', borderRadius: 12, fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>{t.ok}</button>
      </div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(4px)' }} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 500, background: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92vh', overflowY: 'auto', boxSizing: 'border-box' }} onClick={(e) => e.stopPropagation()}>

        {copiedMsg && (
          <div style={{ position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)', background: '#16a34a', color: 'white', padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 10 }}>
            {copiedMsg}
          </div>
        )}

        <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: '24px 20px 18px', color: 'white', textAlign: 'center', borderTopLeftRadius: 24, borderTopRightRadius: 24, position: 'relative' }}>
          <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,0.2)', color: 'white', width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer' }}>✕</button>
          <div style={{ fontSize: 36, marginBottom: 6 }}>💳</div>
          <h3 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 6px' }}>{t.makePayment}</h3>
          {balance > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '10px 16px', marginTop: 10, display: 'inline-block' }}>
              <div style={{ fontSize: 11, opacity: 0.8 }}>{t.yourBalance}</div>
              <div style={{ fontSize: 24, fontWeight: 900 }}>Rs. {fmtAmt(balance)}</div>
            </div>
          )}
        </div>

        <div style={{ padding: '16px 20px 24px' }}>
          {/* Payment steps */}
          <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 14, marginBottom: 16, border: '1px solid #bbf7d0' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 8 }}>📋 {t.paymentSteps}</div>
            <div style={{ fontSize: 12, color: '#15803d', lineHeight: 1.8 }}>{t.step1}<br />{t.step2}<br />{t.step3}</div>
          </div>

          {/* Invoice selection */}
          {unpaidInvoices?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 10 }}>🧾 {t.selectInvoice}</div>
              {selectedInvoiceIds.length > 0 && (
                <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', borderRadius: 12, padding: '10px 14px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white' }}>
                  <div>
                    <div style={{ fontSize: 11, opacity: 0.8 }}>✅ {selectedInvoiceIds.length} {t.billsSelected}</div>
                    <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{t.selectedTotal}</div>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 900 }}>Rs. {fmtAmt(selectedTotalDue)}</div>
                </div>
              )}
              {unpaidInvoices.map((inv) => {
                const net = nn(inv.netAmount || inv.grandTotal);
                const paid = nn(inv.payAmount || inv.paidAmount);
                const due = Math.max(0, net - paid);
                const invNo = inv.invoiceNo || inv.invoiceCode || `INV-${inv.id.slice(0, 8).toUpperCase()}`;
                const isSelected = selectedInvoiceIds.includes(inv.id);
                return (
                  <div key={inv.id} onClick={() => handleToggleInvoice(inv)} style={{ padding: '12px 14px', borderRadius: 12, border: isSelected ? '2.5px solid #3b82f6' : '1.5px solid #e2e8f0', background: isSelected ? '#eff6ff' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, border: isSelected ? '2px solid #3b82f6' : '2px solid #cbd5e1', background: isSelected ? '#3b82f6' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {isSelected && <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: isSelected ? '#1d4ed8' : '#1e293b' }}>🧾 {invNo}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 600 }}>{t.invoiceDue}</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: isSelected ? '#1d4ed8' : '#dc2626' }}>Rs.{fmtAmt(due)}</div>
                    </div>
                  </div>
                );
              })}
              <button onClick={() => { setSelectedInvoiceIds([]); setAmount(''); setNote(''); }} style={{ padding: '10px 14px', borderRadius: 10, border: selectedInvoiceIds.length === 0 ? '2px solid #f59e0b' : '1.5px solid #e2e8f0', background: selectedInvoiceIds.length === 0 ? '#fffbeb' : '#f8fafc', color: selectedInvoiceIds.length === 0 ? '#b45309' : '#64748b', fontWeight: 700, fontSize: 12, cursor: 'pointer', width: '100%' }}>
                {t.generalPayment}
              </button>
            </div>
          )}

          {/* Bank accounts */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#1e40af', marginBottom: 6 }}>{t.bankAccounts}</div>
            {bankAccounts.length > 0
              ? bankAccounts.map((bank, idx) => (
                  <BankAccountCard key={idx} bank={bank} t={t} onCopy={() => { setCopiedMsg(t.copiedAccNo); setTimeout(() => setCopiedMsg(''), 2000); }} />
                ))
              : (
                <div style={{ textAlign: 'center', padding: 24, background: '#fef2f2', borderRadius: 12 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🏦</div>
                  <div style={{ fontSize: 13, color: '#991b1b', fontWeight: 600 }}>{t.noBankAccounts}</div>
                </div>
              )
            }
          </div>

          {/* Amount */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontWeight: 700, fontSize: 14, display: 'block', marginBottom: 6 }}>{t.paymentAmount} *</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, fontWeight: 800, color: '#64748b' }}>Rs.</span>
              <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" style={{ width: '100%', padding: '14px 14px 14px 48px', fontSize: 22, fontWeight: 900, border: '2px solid #e2e8f0', borderRadius: 12, boxSizing: 'border-box', outline: 'none', color: '#059669', fontFamily: 'monospace' }} />
            </div>
            {balance > 0 && selectedInvoiceIds.length === 0 && (
              <button onClick={() => setAmount(balance.toString())} style={{ marginTop: 6, padding: '6px 14px', background: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                💰 {t.payFull}: Rs. {fmtAmt(balance)}
              </button>
            )}
          </div>

          {/* Note */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontWeight: 700, fontSize: 13, display: 'block', marginBottom: 6 }}>{t.paymentNote}</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} style={{ width: '100%', padding: 12, fontSize: 14, border: '2px solid #e2e8f0', borderRadius: 10, boxSizing: 'border-box', outline: 'none' }} />
          </div>

          {/* Receipt upload */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontWeight: 700, fontSize: 13, display: 'block', marginBottom: 6 }}>{t.uploadReceipt}</label>
            {receiptPreview ? (
              <div style={{ borderRadius: 12, overflow: 'hidden', border: '2px solid #16a34a', position: 'relative', marginBottom: 8 }}>
                <img src={receiptPreview} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', background: '#f8fafc' }} />
                <div style={{ position: 'absolute', top: 8, right: 8 }}>
                  <button onClick={() => { setReceiptImage(null); setReceiptPreview(null); }} style={{ padding: '6px 12px', background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>✕</button>
                </div>
                <div style={{ background: '#dcfce7', padding: '6px 12px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#166534' }}>{t.receiptUploaded}</div>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} style={{ width: '100%', padding: 24, border: '2px dashed #93c5fd', borderRadius: 12, background: '#eff6ff', cursor: 'pointer', textAlign: 'center', color: '#1e40af', fontSize: 14, fontWeight: 700 }}>
                <div style={{ fontSize: 32, marginBottom: 6 }}>📷</div>{t.uploadReceipt}
              </button>
            )}
            <input type="file" ref={fileRef} onChange={handleReceiptUpload} style={{ display: 'none' }} accept="image/*" />
          </div>

          {/* Submit */}
          <button onClick={handleSubmit} disabled={submitting || nn(amount) <= 0} style={{ width: '100%', padding: 16, background: submitting || nn(amount) <= 0 ? '#9ca3af' : 'linear-gradient(135deg,#16a34a,#15803d)', color: 'white', border: 'none', borderRadius: 14, fontWeight: 800, fontSize: 17, cursor: submitting ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            {submitting ? `⏳ ${t.submitting}` : t.submitPayment}
            {!submitting && nn(amount) > 0 && <span style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: 8, fontSize: 14 }}>Rs. {fmtAmt(amount)}</span>}
          </button>

          <button onClick={onClose} style={{ width: '100%', marginTop: 10, padding: 12, background: 'none', border: 'none', color: '#64748b', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>{t.closeModal}</button>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════
// UNPAID BILL CARD
// ══════════════════════════════════════
const UnpaidBillCard = ({ inv, catalogItems, isSelected, onToggleSelect, onSettle, onReceipt, setViewImg, t, lang }) => {
  const [expanded, setExpanded] = useState(false);
  const net = nn(inv.netAmount || inv.grandTotal);
  const paid = nn(inv.payAmount || inv.paidAmount);
  const due = Math.max(0, net - paid);
  const paidPct = net > 0 ? Math.min(100, Math.round((paid / net) * 100)) : 0;
  const invNo = inv.invoiceNo || inv.invoiceCode || `INV-${inv.id.slice(0, 8).toUpperCase()}`;
  const dateStr = inv.createdAt?.toDate
    ? inv.createdAt.toDate().toLocaleDateString(lang === 'si' ? 'si-LK' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';
  const items = (inv.items || []).map((it) => enrichItem(it, catalogItems));

  return (
    <div style={{
      background: 'white', borderRadius: 18, marginBottom: 14,
      border: isSelected ? '2.5px solid #3b82f6' : '1.5px solid #fecaca',
      borderLeft: isSelected ? '5px solid #3b82f6' : '5px solid #dc2626',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 16px',
        background: isSelected ? 'linear-gradient(135deg,#eff6ff,#dbeafe)' : 'linear-gradient(135deg,#fef2f2,#fff1f2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
          <div
            onClick={(e) => { e.stopPropagation(); onToggleSelect(inv); }}
            style={{
              width: 30, height: 30, borderRadius: 8,
              border: isSelected ? '2.5px solid #3b82f6' : '2.5px solid #cbd5e1',
              background: isSelected ? '#3b82f6' : 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, cursor: 'pointer', marginTop: 2,
            }}
          >
            {isSelected && <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16, color: isSelected ? '#1d4ed8' : '#991b1b' }}>🧾 {invNo}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>📅 {dateStr} • {items.length} {t.cartItems}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 700 }}>{t.billDue}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: isSelected ? '#1d4ed8' : '#dc2626' }}>Rs.{fmtAmt(due)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 10, marginLeft: 42 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
            <span style={{ color: '#16a34a' }}>✅ {t.billPaid}: Rs.{fmtAmt(paid)}</span>
            <span style={{ color: '#64748b' }}>{paidPct}%</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: '#fee2e2', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${paidPct}%`, borderRadius: 4, background: paidPct >= 50 ? '#16a34a' : '#f59e0b' }} />
          </div>
        </div>

        {/* Settle button */}
        <div style={{ marginLeft: 42 }}>
          <button onClick={(e) => { e.stopPropagation(); onSettle(inv); }} style={{ width: '100%', padding: '12px 0', background: 'linear-gradient(135deg,#16a34a,#15803d)', color: 'white', border: 'none', borderRadius: 12, fontWeight: 800, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            💳 {t.settleBill} <span style={{ background: 'rgba(255,255,255,0.2)', padding: '3px 10px', borderRadius: 8, fontSize: 13 }}>Rs.{fmtAmt(due)}</span>
          </button>
        </div>
      </div>

      {/* Expand/collapse */}
      <div style={{ padding: '0 16px 12px' }}>
        <button onClick={() => setExpanded(!expanded)} style={{ width: '100%', padding: '8px 0', marginTop: 8, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, color: '#64748b', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
          {expanded ? `🔼 ${t.hideDetails}` : `🔽 ${t.viewDetails} (${items.length})`}
        </button>

        {expanded && (
          <div style={{ marginTop: 10 }}>
            {items.map((it, idx) => {
              const pi = getHistoryItemPrices(it);
              return (
                <div key={idx} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
                  <ItemImageBox item={it} size={48} onZoom={setViewImg} />
                  <div style={{ flex: 1 }}>
                    <ItemNamesBlock item={it} size="sm" />
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{pi.qty} × Rs.{fmtAmt(pi.finalPrice)}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>Rs.{fmtAmt(pi.lineTotal)}</div>
                </div>
              );
            })}
            <button onClick={() => onReceipt(inv)} style={{ width: '100%', background: '#1e3a8a', color: 'white', border: 'none', padding: 10, borderRadius: 8, marginTop: 8, fontWeight: 'bold', cursor: 'pointer' }}>
              📄 {t.download}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════
// CONTACT PHONE MODAL
// ══════════════════════════════════════
const ContactPhoneModal = ({ item, shopInfo, onClose, t }) => {
  if (!item) return null;
  const n = getAllItemNames(item);
  const img = getImg(item);
  const shopPhone = shopInfo?.phone || '';
  const callLink = formatPhoneForCall(shopPhone);
  const waLink = formatPhoneForWhatsApp(shopPhone);
  const waMessage = encodeURIComponent(`සුබ දවසක් 🙏\n\n"${n.primary}" භාණ්ඩයේ මිල දැනගැනීමට කැමැත්තෙමි.`);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(4px)' }} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 380, background: 'white', borderRadius: 22, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, background: 'rgba(255,255,255,0.92)', width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer' }}>✕</button>
        <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: '28px 20px 20px', textAlign: 'center', color: 'white' }}>
          <div style={{ fontSize: 42, marginBottom: 8 }}>📞</div>
          <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{t.contactForPrice}</h3>
        </div>
        <div style={{ display: 'flex', gap: 12, padding: '14px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <img src={img} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', border: '2px solid #e2e8f0' }} onError={(e) => { e.target.src = defaultImg; }} />
          <ItemNamesBlock item={item} />
        </div>
        <div style={{ padding: '16px 20px' }}>
          {shopPhone ? (
            <>
              <div style={{ background: '#eff6ff', borderRadius: 14, padding: 16, textAlign: 'center', marginBottom: 14, border: '2px solid #93c5fd' }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#1e40af', fontFamily: 'monospace' }}>{shopPhone}</div>
              </div>
              <a href={`tel:${callLink}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '14px 0', background: '#16a34a', color: 'white', borderRadius: 14, fontWeight: 800, fontSize: 16, textDecoration: 'none', marginBottom: 10 }}>📞 Call</a>
              {waLink && <a href={`https://wa.me/${waLink}?text=${waMessage}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '14px 0', background: '#25d366', color: 'white', borderRadius: 14, fontWeight: 800, fontSize: 16, textDecoration: 'none' }}>💬 WhatsApp</a>}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 24, background: '#fef2f2', borderRadius: 14 }}>
              <div style={{ fontSize: 36 }}>😔</div>
              <div style={{ fontWeight: 700, color: '#991b1b' }}>No phone available</div>
            </div>
          )}
        </div>
        <div style={{ padding: '0 20px 18px' }}>
          <button onClick={onClose} style={{ width: '100%', padding: 12, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>{t.closeModal}</button>
        </div>
      </div>
    </div>
  );
};// ══════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════
export default function PortalClient({ portalKey }) {
  const [lang, setLang] = useState('si');
  const t = translations[lang];

  const [customer, setCustomer] = useState(null);
  const [customerId, setCustomerId] = useState(null);
  const [catalogItems, setCatalogItems] = useState([]);
  const [selectedShop, setSelectedShop] = useState(null);
  const [activeTab, setActiveTab] = useState('shop');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [history, setHistory] = useState([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [viewImg, setViewImg] = useState(null);
  const [contactItem, setContactItem] = useState(null);
  const [currentShopInfo, setCurrentShopInfo] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [unpaidInvoices, setUnpaidInvoices] = useState([]);
  const [settleInvoices, setSettleInvoices] = useState([]);
  const [selectedBillIds, setSelectedBillIds] = useState([]);

  // ── Initial load ──
  useEffect(() => {
    if (!portalKey) {
      setError(t.notFound);
      setLoading(false);
      return;
    }

    const db = getDb();

    (async () => {
      try {
        const cs = await getDocs(
          query(collection(db, 'customers'), where('portalAccessKey', '==', portalKey))
        );

        if (cs.empty) {
          setError(t.notFound);
          setLoading(false);
          return;
        }

        const c = { id: cs.docs[0].id, ...cs.docs[0].data() };
        setCustomer(c);
        setCustomerId(c.id);
        setCustName(c.name || '');
        setCustPhone(c.phone || '');

        // Set shop
        if (c.uid) {
          setSelectedShop({ uid: c.uid, id: c.uid });

          // Load shop info
          try {
            const shopSnap = await getDoc(doc(db, 'users', c.uid));
            if (shopSnap.exists()) {
              const s = shopSnap.data();
              const info = {
                shopName: s.shopName || s.businessName || s.companyName || '',
                phone: s.phone || s.mobile || '',
              };
              setCurrentShopInfo(info);
            }
          } catch {}

          // Load bank accounts
          try {
            const isSnap = await getDocs(
              query(collection(db, 'invoice_settings'), where('uid', '==', c.uid))
            );
            if (!isSnap.empty) {
              const d = isSnap.docs[0].data();
              if (d.bankAccounts?.length > 0) {
                setBankAccounts(d.bankAccounts.filter((b) => b.bankName || b.accountNumber));
              }
            }
          } catch {}

          // Load catalog items
          try {
            const itemsSnap = await getDocs(
              query(collection(db, 'items'), where('uid', '==', c.uid))
            );
            setCatalogItems(
              itemsSnap.docs
                .map((d) => ({ id: d.id, ...d.data() }))
                .filter((i) => !i.isHidden && !i.isPurchaseOnly)
            );
          } catch {}
        }

        setLoading(false);
      } catch (e) {
        console.error(e);
        setError(t.errorOccurred);
        setLoading(false);
      }
    })();
  }, [portalKey]);

  // ── Realtime customer balance ──
  useEffect(() => {
    if (!customerId) return;
    const db = getDb();
    const unsub = onSnapshot(
      doc(db, 'customers', customerId),
      (snap) => {
        if (snap.exists()) setCustomer((prev) => ({ ...prev, ...snap.data(), id: customerId }));
      },
      () => {}
    );
    return () => unsub();
  }, [customerId]);

  // ── Unpaid invoices ──
  useEffect(() => {
    if (!customerId) return;
    const db = getDb();
    const unsub = onSnapshot(
      query(collection(db, 'invoices'), where('customerId', '==', customerId)),
      (snap) => {
        const invoices = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((inv) => {
            const net = nn(inv.netAmount || inv.grandTotal);
            const paid = nn(inv.payAmount || inv.paidAmount);
            return net - paid > 0.01 && inv.status !== 'draft';
          })
          .sort((a, b) => {
            const gt = (x) => x.createdAt?.seconds || 0;
            return gt(b) - gt(a);
          });
        setUnpaidInvoices(invoices);
      },
      () => setUnpaidInvoices([])
    );
    return () => unsub();
  }, [customerId]);

  // ── History ──
  useEffect(() => {
    if (activeTab !== 'history' || !selectedShop?.uid || !customerId) return;

    const db = getDb();
    const cleanups = [];
    const ds = { orders: [], payments: [], invoices: [], returns: [], productions: [], trips: [] };

    const updateAll = () => {
      const all = Object.values(ds).flat();
      all.sort((a, b) => {
        const getMs = (x) => {
          if (x.createdAt?.seconds) return x.createdAt.seconds * 1000;
          if (x.createdAt?.toDate) return x.createdAt.toDate().getTime();
          if (typeof x.date === 'string') {
            const d = new Date(x.date);
            if (!isNaN(d.getTime())) return d.getTime();
          }
          return 0;
        };
        return getMs(b) - getMs(a);
      });
      setHistory(all);
    };

    // Orders
    if (customer?.phone) {
      cleanups.push(
        onSnapshot(
          query(collection(db, `shops/${selectedShop.uid}/pfis`), where('customerPhone', '==', customer.phone)),
          (snap) => { ds.orders = snap.docs.map((d) => ({ id: d.id, ...d.data(), type: 'order' })); updateAll(); },
          () => {}
        )
      );
    }

    // Payments
    cleanups.push(
      onSnapshot(
        query(collection(db, 'customerTransactions'), where('customerId', '==', customerId)),
        (snap) => { ds.payments = snap.docs.map((d) => ({ id: d.id, ...d.data(), type: 'payment' })); updateAll(); },
        () => {}
      )
    );

    // Invoices
    cleanups.push(
      onSnapshot(
        query(collection(db, 'invoices'), where('customerId', '==', customerId)),
        (snap) => { ds.invoices = snap.docs.map((d) => ({ id: d.id, ...d.data(), type: 'invoice' })); updateAll(); },
        () => {}
      )
    );

    // Returns
    cleanups.push(
      onSnapshot(
        query(collection(db, 'returns'), where('customerId', '==', customerId)),
        (snap) => { ds.returns = snap.docs.map((d) => ({ id: d.id, ...d.data(), type: 'return' })); updateAll(); },
        () => {}
      )
    );

    // Trips
    cleanups.push(
      onSnapshot(
        query(collection(db, `users/${selectedShop.uid}/vehicleTrips`), where('customerId', '==', customerId)),
        (snap) => { ds.trips = snap.docs.map((d) => ({ id: d.id, ...d.data(), type: 'trip' })); updateAll(); },
        () => {}
      )
    );

    // Production
    cleanups.push(
      onSnapshot(
        query(collection(db, 'productionEntries'), where('uid', '==', selectedShop.uid)),
        (snap) => {
          const cName = norm(customer?.name || '');
          const cPhone = normalizePhone(customer?.phone || '');
          ds.productions = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((p) => {
              if (p.isStandaloneExpense) return false;
              return (
                (portalKey && p.customerPortalKey === portalKey) ||
                (customerId && p.customerId === customerId) ||
                (cName && norm(p.customerName) === cName) ||
                (cPhone && normalizePhone(p.customerPhone) === cPhone)
              );
            })
            .map((p) => ({ ...p, type: 'production' }));
          updateAll();
        },
        () => { ds.productions = []; updateAll(); }
      )
    );

    return () => cleanups.forEach((fn) => fn && fn());
  }, [activeTab, selectedShop?.uid, customerId, customer?.name, customer?.phone, portalKey]);

  // ── Derived ──
  const totalOutstanding = useMemo(
    () =>
      unpaidInvoices.reduce((sum, inv) => {
        const net = nn(inv.netAmount || inv.grandTotal);
        const paid = nn(inv.payAmount || inv.paidAmount);
        return sum + Math.max(0, net - paid);
      }, 0),
    [unpaidInvoices]
  );

  const selectedBillsTotal = useMemo(
    () =>
      unpaidInvoices
        .filter((inv) => selectedBillIds.includes(inv.id))
        .reduce((sum, inv) => {
          const net = nn(inv.netAmount || inv.grandTotal);
          const paid = nn(inv.payAmount || inv.paidAmount);
          return sum + Math.max(0, net - paid);
        }, 0),
    [unpaidInvoices, selectedBillIds]
  );

  const selectedBillObjects = useMemo(
    () => unpaidInvoices.filter((inv) => selectedBillIds.includes(inv.id)),
    [unpaidInvoices, selectedBillIds]
  );

  const filtered = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/);
    return catalogItems.filter((i) => {
      const tx = [i.name, i.sinhalaName, i.goodsName, i.brandName, i.itemCode, i.barcode]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return terms.every((t) => tx.includes(t));
    });
  }, [catalogItems, search]);

  // ── Cart actions ──
  const addToCart = useCallback(
    (i) =>
      setCart((p) => {
        const e = p.find((x) => x.id === i.id);
        if (e) return p.map((x) => (x.id === i.id ? { ...x, qty: x.qty + 1 } : x));
        return [...p, { ...i, qty: 1 }];
      }),
    []
  );

  const updateCartQty = useCallback((id, q) => {
    if (q <= 0) setCart((p) => p.filter((x) => x.id !== id));
    else setCart((p) => p.map((x) => (x.id === id ? { ...x, qty: q } : x)));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const cartTotal = useMemo(
    () => cart.reduce((s, i) => s + (nn(i.stock) <= 0 ? 0 : getPriceInfo(i).final * i.qty), 0),
    [cart]
  );

  const cartGrossTotal = useMemo(
    () => cart.reduce((s, i) => s + (nn(i.stock) <= 0 ? 0 : getPriceInfo(i).original * i.qty), 0),
    [cart]
  );

  const cartDiscount = cartGrossTotal - cartTotal;

  // ── Bill actions ──
  const handleSettleBill = useCallback((inv) => {
    setSettleInvoices([inv]);
    setShowPayment(true);
  }, []);

  const handlePaySelectedBills = useCallback(() => {
    if (selectedBillObjects.length === 0) return;
    setSettleInvoices(selectedBillObjects);
    setShowPayment(true);
  }, [selectedBillObjects]);

  const handleToggleBillSelect = useCallback((inv) => {
    setSelectedBillIds((prev) =>
      prev.includes(inv.id) ? prev.filter((id) => id !== inv.id) : [...prev, inv.id]
    );
  }, []);

  const allBillsSelected = unpaidInvoices.length > 0 && selectedBillIds.length === unpaidInvoices.length;

  // ── Place order ──
  const handlePlaceOrder = useCallback(async () => {
    if (!custName.trim() || !custPhone.trim()) {
      alert(t.detailsRequired);
      return;
    }
    if (cart.length === 0) {
      alert(t.cartEmpty);
      return;
    }

    setPlacing(true);
    const db = getDb();

    const oi = cart.map((i) => {
      const s = nn(i.stock);
      const p = getPriceInfo(i);
      const o = s <= 0;
      return {
        id: i.id, name: i.name || '', sinhalaName: i.sinhalaName || '',
        photoURL: getImg(i), uom: getDisplayUnit(i), qty: i.qty,
        originalPrice: o ? 0 : p.original, yourPrice: o ? 0 : p.final,
        lineTotal: o ? 0 : p.final * i.qty, outOfStock: o,
      };
    });

    const gr = oi.reduce((s, i) => s + nn(i.lineTotal), 0);

    try {
      await addDoc(collection(db, `shops/${selectedShop.uid}/pfis`), {
        customerName: custName.trim(),
        customerPhone: custPhone.trim(),
        status: 'pending',
        grandTotal: gr,
        total: gr,
        createdAt: serverTimestamp(),
        date: new Date().toISOString(),
        items: oi,
        source: 'next-portal',
      });
      setOrderSuccess(true);
      setCart([]);
      setShowCheckout(false);
      setActiveTab('history');
    } catch {
      alert(t.errorOccurred);
    } finally {
      setPlacing(false);
    }
  }, [custName, custPhone, cart, selectedShop, t]);

  // ── Receipt ──
  const openReceipt = useCallback(
    (inv) => {
      const isRet = inv.type === 'return';
      const isProd = inv.type === 'production';
      const isTrip = inv.type === 'trip';
      const enrich = (arr) => (arr || []).map((it) => enrichItem(it, catalogItems));
      const ei = { ...inv, items: enrich(inv.items) };

      let totalVal = 0, paidVal = 0;
      if (isRet) {
        const rt = calculateReturnTotals(ei);
        totalVal = rt.displayTotal;
        paidVal = totalVal;
      } else if (isTrip) {
        totalVal = nn(ei.totalBillAmount);
        paidVal = nn(ei.paidAmount);
      } else if (isProd) {
        totalVal = nn(ei.grandTotal || ei.totalIncome);
        paidVal = nn(ei.totalPaid);
      } else {
        totalVal = nn(ei.netAmount || ei.grandTotal);
        paidVal = nn(ei.paidAmount || ei.payAmount);
      }

      const dueVal = Math.max(0, totalVal - paidVal);
      const shopName = currentShopInfo?.shopName || '';
      const refNo = (ei.invoiceNo || ei.invoiceNumber || ei.id?.slice(-6) || '').toUpperCase();
      const dateStr = formatPortalDate(ei.date || ei.createdAt, lang);

      const buildRows = (items) =>
        items
          .map((it) => {
            const pi = getHistoryItemPrices(it);
            const n = getAllItemNames(it);
            return `<div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid #f1f5f9"><div style="flex:1"><div style="font-weight:700;font-size:13px">${n.primary}</div><div style="font-size:11px;color:#64748b">${pi.qty} × Rs.${fmtAmt(pi.finalPrice)}</div></div><div style="font-weight:800;font-size:14px">Rs.${fmtAmt(pi.lineTotal)}</div></div>`;
          })
          .join('');

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;background:#f1f5f9}.r{max-width:420px;margin:0 auto;background:white;min-height:100vh;padding:16px}</style></head><body><div class="r"><div style="text-align:center;padding:16px;background:#1e3a8a;color:white;border-radius:12px;margin-bottom:16px"><h2>${shopName}</h2><div style="font-size:12px;margin-top:4px">#${refNo} • ${dateStr}</div></div>${buildRows(ei.items || [])}<div style="margin-top:16px;padding-top:12px;border-top:2px solid #0f172a"><div style="display:flex;justify-content:space-between;font-size:18px;font-weight:900;color:#059669"><span>${t.grandTotal}</span><span>Rs.${fmtAmt(totalVal)}</span></div></div><div style="display:flex;gap:8px;margin-top:12px"><div style="flex:1;background:#f0fdf4;padding:10px;border-radius:10px;text-align:center"><div style="font-size:11px;color:#64748b">✅ ${t.paid}</div><div style="font-size:16px;font-weight:900;color:#16a34a">Rs.${fmtAmt(paidVal)}</div></div><div style="flex:1;background:#fef2f2;padding:10px;border-radius:10px;text-align:center"><div style="font-size:11px;color:#64748b">⚠️ ${t.due}</div><div style="font-size:16px;font-weight:900;color:#dc2626">Rs.${fmtAmt(dueVal)}</div></div></div></div></body></html>`;

      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
      }
    },
    [catalogItems, currentShopInfo, t, lang]
  );

  const getReturnStatusKey = useCallback((i) => {
    if (i.type !== 'return') return i.status || i.type;
    const s = (i.status || '').toLowerCase();
    if (s === 'completed') return 'return_completed';
    if (s === 'pending') return 'return_pending';
    return 'return';
  }, []);

  const balance = nn(customer?.currentBalance);

  // ── RENDER ──
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ width: 40, height: 40, border: '4px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
      <p style={{ color: '#64748b', marginTop: 16 }}>{t.loading}</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: 'Arial, sans-serif', padding: 20, textAlign: 'center' }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>❌</div>
      <h2 style={{ color: '#dc2626', margin: '0 0 10px' }}>{error}</h2>
    </div>
  );

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', background: '#f8fafc', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', overflowX: 'hidden', boxSizing: 'border-box' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

      {/* Modals */}
      {contactItem && <ContactPhoneModal item={contactItem} shopInfo={currentShopInfo} onClose={() => setContactItem(null)} t={t} />}

      {showPayment && (
        <PaymentModal
          customer={customer} selectedShop={selectedShop} bankAccounts={bankAccounts}
          unpaidInvoices={unpaidInvoices} preSelectedInvoices={settleInvoices}
          onClose={() => { setShowPayment(false); setSettleInvoices([]); setSelectedBillIds([]); }}
          onSuccess={() => setSelectedBillIds([])}
          t={t} lang={lang}
        />
      )}

      {viewImg && (
        <div onClick={() => setViewImg(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.95)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <img src={viewImg} style={{ maxWidth: '100%', maxHeight: '85%', borderRadius: 12, objectFit: 'contain' }} alt="" />
          <div onClick={() => setViewImg(null)} style={{ position: 'absolute', top: 16, right: 16, color: 'white', fontSize: 18, cursor: 'pointer', background: 'rgba(255,255,255,0.18)', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</div>
        </div>
      )}

      {/* HEADER */}
      <div style={{ background: '#1e3a8a', color: 'white', padding: '25px 20px 20px', textAlign: 'center', borderBottomLeftRadius: 25, borderBottomRightRadius: 25, position: 'relative' }}>
        <button onClick={() => setLang(lang === 'si' ? 'en' : 'si')} style={{ position: 'absolute', top: 15, right: 15, background: 'rgba(255,255,255,.2)', border: 'none', color: 'white', padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{t.langSwitch}</button>
        <h2 style={{ margin: 0, fontSize: 18 }}>{customer?.name}</h2>
        <div style={{ marginTop: 10, fontSize: 26, fontWeight: 900, color: balance > 0 ? '#fca5a5' : '#86efac' }}>Rs. {fmtAmt(balance)}</div>
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>{t.balance}</div>

        {unpaidInvoices.length > 0 && (
          <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: '12px 16px', border: '1px solid rgba(255,255,255,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>🧾 {t.totalOutstanding}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#fca5a5', marginTop: 2 }}>Rs. {fmtAmt(totalOutstanding)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>{t.unpaidBills}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#fde68a' }}>{unpaidInvoices.length}</div>
              </div>
            </div>
            <button onClick={() => { setSettleInvoices([]); setShowPayment(true); }} style={{ width: '100%', marginTop: 10, padding: '10px 0', background: 'linear-gradient(135deg,#16a34a,#15803d)', color: 'white', border: '2px solid rgba(255,255,255,0.3)', borderRadius: 12, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>💳 {t.makePayment}</button>
          </div>
        )}

        {unpaidInvoices.length === 0 && balance > 0 && (
          <button onClick={() => { setSettleInvoices([]); setShowPayment(true); }} style={{ marginTop: 12, padding: '10px 28px', background: 'linear-gradient(135deg,#16a34a,#15803d)', color: 'white', border: '2px solid rgba(255,255,255,0.3)', borderRadius: 14, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>💳 {t.makePayment}</button>
        )}
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', background: 'white', marginTop: -15, borderRadius: 15, boxShadow: '0 5px 15px rgba(0,0,0,.1)', overflow: 'hidden', position: 'relative', zIndex: 10 }}>
        {[
          { id: 'shop', label: t.orderTab },
          { id: 'bills', label: `${t.billsTab}${unpaidInvoices.length > 0 ? ` (${unpaidInvoices.length})` : ''}` },
          { id: 'history', label: t.accountTab },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flex: 1, padding: '13px 4px', border: 'none', background: activeTab === tab.id ? (tab.id === 'bills' && unpaidInvoices.length > 0 ? '#dc2626' : '#3b82f6') : 'white', color: activeTab === tab.id ? 'white' : tab.id === 'bills' && unpaidInvoices.length > 0 ? '#dc2626' : '#64748b', fontWeight: 'bold', fontSize: 11, cursor: 'pointer' }}>{tab.label}</button>
        ))}
      </div>

      <div style={{ padding: 15, paddingBottom: selectedBillIds.length > 0 && activeTab === 'bills' ? 160 : 120 }}>

        {/* ── BILLS TAB ── */}
        {activeTab === 'bills' && (
          <div>
            {unpaidInvoices.length > 0 && (
              <div style={{ background: 'linear-gradient(135deg,#991b1b,#dc2626)', borderRadius: 18, padding: '18px 20px', marginBottom: 16, color: 'white', textAlign: 'center' }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>🧾 {t.totalOutstanding}</div>
                <div style={{ fontSize: 34, fontWeight: 900, marginTop: 4, fontFamily: 'monospace' }}>Rs. {fmtAmt(totalOutstanding)}</div>
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{unpaidInvoices.length} {t.unpaidBills}</div>
              </div>
            )}

            {unpaidInvoices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#16a34a', marginBottom: 8 }}>{t.allPaid}</div>
                <div style={{ fontSize: 14, color: '#64748b' }}>{t.noBills}</div>
              </div>
            ) : (
              unpaidInvoices.map((inv) => (
                <UnpaidBillCard key={inv.id} inv={inv} catalogItems={catalogItems} isSelected={selectedBillIds.includes(inv.id)} onToggleSelect={handleToggleBillSelect} onSettle={handleSettleBill} onReceipt={openReceipt} setViewImg={setViewImg} t={t} lang={lang} />
              ))
            )}
          </div>
        )}

        {/* Bills floating bar */}
        {selectedBillIds.length > 0 && activeTab === 'bills' && (
          <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', width: '92%', maxWidth: 460, background: 'linear-gradient(135deg,#1e293b,#0f172a)', padding: '14px 18px', borderRadius: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 10px 40px rgba(0,0,0,.5)', zIndex: 100, animation: 'slideUp 0.25s ease-out', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ color: 'white' }}>
              <div style={{ fontWeight: 800, fontSize: 13 }}>☑️ {selectedBillIds.length} {t.billsSelected}</div>
              <div style={{ color: '#fbbf24', fontWeight: 900, fontSize: 16, marginTop: 2 }}>Rs. {fmtAmt(selectedBillsTotal)}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setSelectedBillIds([])} style={{ background: 'rgba(239,68,68,.2)', color: '#fca5a5', border: 'none', padding: '10px 12px', borderRadius: 10, fontWeight: 'bold', fontSize: 11, cursor: 'pointer' }}>✕</button>
              <button onClick={handlePaySelectedBills} style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', color: 'white', border: 'none', padding: '12px 20px', borderRadius: 12, fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                💳 {t.paySelected}
              </button>
            </div>
          </div>
        )}

        {/* ── SHOP TAB ── */}
        {activeTab === 'shop' && (
          <>
            <input type="text" placeholder={t.search} value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: '100%', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0', boxSizing: 'border-box', outline: 'none', fontSize: 15, marginBottom: 20, background: 'white' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {filtered.map((item) => {
                const p = getPriceInfo(item);
                const du = getDisplayUnit(item);
                const oos = nn(item.stock) <= 0;
                const ic = cart.find((x) => x.id === item.id);
                return (
                  <div key={item.id} style={{ background: 'white', borderRadius: 15, overflow: 'hidden', border: ic ? '2px solid #3b82f6' : '1px solid #e2e8f0' }}>
                    <div style={{ height: 130, padding: 10, background: '#fafbfc', position: 'relative', cursor: 'zoom-in', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setViewImg(getImg(item))}>
                      <img src={getImg(item)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { e.target.src = defaultImg; }} />
                      {!oos && p.hasDisc && <div style={{ position: 'absolute', top: 6, right: 6, background: '#dc2626', color: 'white', padding: '3px 8px', borderRadius: 8, fontSize: 10, fontWeight: 800 }}>-{p.discPct}%</div>}
                      {ic && <div style={{ position: 'absolute', top: 6, left: 6, background: '#3b82f6', color: 'white', padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 800 }}>🛒 {ic.qty}</div>}
                    </div>
                    <div style={{ padding: '10px 12px 12px' }}>
                      <ItemNamesBlock item={item} />
                      <div style={{ marginTop: 8 }}>
                        {!oos ? (
                          <>
                            {p.hasDisc && (
                              <div style={{ marginBottom: 2 }}>
                                <span style={{ fontSize: 10, color: '#94a3b8', textDecoration: 'line-through' }}>Rs. {fmtAmt(p.original)}</span>
                                <span style={{ fontSize: 9, fontWeight: 800, color: '#dc2626', background: '#fef2f2', padding: '1px 4px', borderRadius: 3, marginLeft: 4 }}>-{p.discPct}%</span>
                              </div>
                            )}
                            <div style={{ fontSize: 16, fontWeight: 900, color: '#059669' }}>Rs. {fmtAmt(p.final)}</div>
                            {p.hasDisc && <div style={{ fontSize: 9, color: '#16a34a', fontWeight: 600 }}>💰 {t.saving} Rs. {fmtAmt(p.discAmount)}</div>}
                            {du && <div style={{ fontSize: 9, color: '#94a3b8' }}>{t.perUnit} {du}</div>}
                          </>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); setContactItem(item); }} style={{ width: '100%', background: '#3b82f6', border: 'none', borderRadius: 8, padding: '8px 7px', cursor: 'pointer' }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: 'white' }}>📞 {t.contactForPrice}</div>
                          </button>
                        )}
                      </div>
                      {ic ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
                          <button onClick={() => updateCartQty(item.id, ic.qty - 1)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#fee2e2', color: '#dc2626', fontWeight: 900, fontSize: 16, cursor: 'pointer' }}>−</button>
                          <div style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: 800, color: '#1e40af' }}>{ic.qty}</div>
                          <button onClick={() => updateCartQty(item.id, ic.qty + 1)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#dbeafe', color: '#1e40af', fontWeight: 900, fontSize: 16, cursor: 'pointer' }}>+</button>
                        </div>
                      ) : (
                        !oos && <button onClick={() => addToCart(item)} style={{ width: '100%', marginTop: 8, background: '#3b82f6', color: 'white', border: 'none', padding: 9, borderRadius: 10, fontWeight: 'bold', fontSize: 11, cursor: 'pointer' }}>🛒 {t.addToCart}</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── HISTORY TAB ── */}
        {activeTab === 'history' && (
          <div>
            {history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 50, color: '#94a3b8' }}>{t.noOrders}</div>
            ) : (
              history.map((hi) => {
                const isPay = hi.type === 'payment';
                const isRet = hi.type === 'return';
                const isTrip = hi.type === 'trip';
                const isProd = hi.type === 'production';

                // Trip / Production — simplified cards
                if (isTrip) {
                  const totalBill = nn(hi.totalBillAmount) || (nn(hi.fare) + (hi.cargoItems || []).reduce((s, i) => s + nn(i.total), 0));
                  const paidAmt = nn(hi.paidAmount);
                  const tripDate = formatPortalDate(hi.tripDate || hi.date || hi.createdAt, lang);
                  return (
                    <div key={hi.id} style={{ background: 'white', borderRadius: 16, padding: 14, marginBottom: 12, border: '1px solid #e2e8f0', borderLeft: '5px solid #8b5cf6' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div>
                          <div style={{ fontWeight: 900, fontSize: 14, color: '#5b21b6' }}>🚛 {t.tripInfo}</div>
                          {hi.vehicleName && <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 2 }}>🚗 {hi.vehicleName}</div>}
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>📅 {tripDate}</div>
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#f5f3ff', color: '#8b5cf6', height: 'fit-content' }}>🚛</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', background: '#f5f3ff', padding: 10, borderRadius: 10 }}>
                        <div><div style={{ fontSize: 10, color: '#64748b' }}>{t.tripTotalBill}</div><div style={{ fontSize: 18, fontWeight: 900, color: '#5b21b6' }}>Rs.{fmtAmt(totalBill)}</div></div>
                        <div style={{ textAlign: 'right' }}><div style={{ fontSize: 10, color: '#64748b' }}>{t.tripPaid}</div><div style={{ fontSize: 14, fontWeight: 800, color: '#16a34a' }}>Rs.{fmtAmt(paidAmt)}</div></div>
                      </div>
                      <button onClick={() => openReceipt(hi)} style={{ width: '100%', marginTop: 10, background: '#5b21b6', color: 'white', border: 'none', padding: 10, borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>📄 {t.download}</button>
                    </div>
                  );
                }

                if (isProd) {
                  const grandTotal = nn(hi.grandTotal);
                  const totalPaid = nn(hi.totalPaid);
                  const balDue = nn(hi.balanceDue || Math.max(0, grandTotal - totalPaid));
                  const prodDate = formatPortalDate(hi.date || hi.createdAt, lang);
                  return (
                    <div key={hi.id} style={{ background: 'white', borderRadius: 16, padding: 14, marginBottom: 12, border: '1px solid #e2e8f0', borderLeft: '5px solid #0891b2' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div>
                          <div style={{ fontWeight: 900, fontSize: 14, color: '#0891b2' }}>🔧 {hi.businessName || 'Service'}</div>
                          {hi.customerName && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>👤 {hi.customerName}</div>}
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>📅 {prodDate}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 20, fontWeight: 900, color: '#1e3a8a' }}>Rs.{fmtAmt(grandTotal)}</div>
                          {balDue > 0 && <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 800 }}>Due: Rs.{fmtAmt(balDue)}</div>}
                        </div>
                      </div>
                      <button onClick={() => openReceipt(hi)} style={{ width: '100%', background: '#0e7490', color: 'white', border: 'none', padding: 10, borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>📄 {t.download}</button>
                    </div>
                  );
                }

                // Standard history card
                const sk = getReturnStatusKey(hi);
                const s = STATUS_STYLE[sk] || STATUS_STYLE[hi.status] || STATUS_STYLE[hi.type] || STATUS_STYLE.pending;
                const rawItems = isRet ? (hi.items || []) : (hi.items || []);
                const allItems = rawItems.map((it) => enrichItem(it, catalogItems));
                const txImage = getTransactionImage(hi);

                let totalVal, paidVal;
                if (isRet) { const rt = calculateReturnTotals(hi); totalVal = rt.displayTotal; paidVal = 0; }
                else { totalVal = nn(hi.netAmount || hi.grandTotal); paidVal = nn(hi.paidAmount || hi.payAmount || hi.totalPaid); }

                let calcDisc = 0;
                if (!isRet) allItems.forEach((it) => { calcDisc += getHistoryItemPrices(it).lineDiscount; });
                const discVal = isRet ? 0 : calcDisc > 0 ? calcDisc : nn(hi.totalDiscount);
                const dueVal = totalVal - paidVal;
                const hasDue = !isPay && !isRet && dueVal > 0.01;

                return (
                  <div key={hi.id} style={{ background: 'white', borderRadius: 16, padding: 14, marginBottom: 12, border: '1px solid #e2e8f0', borderLeft: `5px solid ${s.color}`, boxSizing: 'border-box', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 'bold' }}>
                        {hi.createdAt?.toDate ? hi.createdAt.toDate().toLocaleString() : hi.date || ''}
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 'bold', padding: '3px 8px', borderRadius: 6, background: s.bg, color: s.color }}>
                        {s.icon} {lang === 'si' ? (s.labelSi || s.label) : s.label}
                      </span>
                    </div>

                    {/* Items */}
                    {allItems.filter((it) => it.goodsName || it.name || it.sinhalaName).map((it, idx) => {
                      const pi = getHistoryItemPrices(it);
                      return (
                        <div key={idx} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
                          <ItemImageBox item={it} size={52} onZoom={setViewImg} isReturn={isRet} />
                          <div style={{ flex: 1 }}>
                            <ItemNamesBlock item={it} size="sm" isReturn={isRet} />
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                              {pi.qty} × {pi.hasDiscount
                                ? <><span style={{ textDecoration: 'line-through', color: '#94a3b8' }}>Rs.{fmtAmt(pi.originalPrice)}</span> <span style={{ color: '#059669', fontWeight: 700 }}>Rs.{fmtAmt(pi.finalPrice)}</span></>
                                : `Rs.${fmtAmt(pi.originalPrice)}`}
                            </div>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 'bold' }}>Rs.{fmtAmt(pi.lineTotal)}</div>
                        </div>
                      );
                    })}

                    {/* Discount */}
                    {!isPay && discVal > 0 && (
                      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 8, marginTop: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#16a34a', fontWeight: 700 }}>
                          <span>💰 {t.youSaved}:</span><span>Rs.{fmtAmt(discVal)}</span>
                        </div>
                      </div>
                    )}

                    {/* Paid/Due */}
                    {!isPay && (
                      <div style={{ background: '#f8fafc', padding: 8, borderRadius: 8, marginTop: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#059669', fontWeight: 'bold' }}><span>{t.paid}:</span><span>Rs.{fmtAmt(paidVal)}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#dc2626', fontWeight: 'bold', marginTop: 2 }}><span>{t.due}:</span><span>Rs.{fmtAmt(dueVal)}</span></div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button onClick={() => openReceipt(hi)} style={{ flex: 1, background: '#1e3a8a', color: 'white', border: 'none', padding: 10, borderRadius: 8, fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>📄 {t.download}</button>
                          {hasDue && <button onClick={() => handleSettleBill(hi)} style={{ flex: 1, background: 'linear-gradient(135deg,#16a34a,#15803d)', color: 'white', border: 'none', padding: 10, borderRadius: 8, fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>💳 {t.settleBill}</button>}
                        </div>
                      </div>
                    )}

                    {/* Payment card */}
                    {isPay && (
                      <div style={{ padding: '8px 0' }}>
                        <div style={{ fontSize: 13, color: '#16a34a', fontWeight: 'bold' }}>💰 {hi.note || t.paid}</div>
                        {hi.invoiceNo && <div style={{ display: 'inline-flex', padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd', marginTop: 6 }}>🧾 {hi.invoiceNo}</div>}
                        <div style={{ display: 'inline-flex', padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700, marginTop: 6, background: hi.status === 'approved' ? '#dcfce7' : hi.status === 'rejected' ? '#fef2f2' : '#fefce8', color: hi.status === 'approved' ? '#16a34a' : hi.status === 'rejected' ? '#dc2626' : '#a16207' }}>
                          {hi.status === 'approved' ? t.paymentApproved : hi.status === 'rejected' ? t.paymentRejected : t.paymentPending}
                        </div>
                        {hi.status === 'rejected' && hi.rejectReason && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#991b1b', marginTop: 6 }}><strong>{t.rejectReason}:</strong> {hi.rejectReason}</div>}
                        {txImage && (
                          <div onClick={() => setViewImg(txImage)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, cursor: 'pointer', marginTop: 6 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden', border: '1px solid #86efac' }}><img src={txImage} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /></div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#166534' }}>{t.viewReceipt}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Footer */}
                    <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: '#94a3b8' }}>#{hi.id.slice(-6).toUpperCase()}</span>
                      <span style={{ fontSize: 16, fontWeight: 900, color: isPay ? '#16a34a' : '#1e3a8a' }}>
                        {isPay ? '-' : '+'} Rs.{fmtAmt(hi.netAmount || hi.grandTotal || nn(hi.totalBillAmount) || hi.amount)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* CART BAR */}
      {cart.length > 0 && activeTab === 'shop' && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: 440, background: '#1e293b', padding: '12px 16px', borderRadius: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 10px 25px rgba(0,0,0,.4)', zIndex: 100 }}>
          <div style={{ color: 'white' }}>
            <div style={{ fontWeight: 'bold', fontSize: 14 }}>{cart.reduce((s, c) => s + c.qty, 0)} {t.cartItems}</div>
            <div style={{ color: '#10b981', fontWeight: 'bold', fontSize: 13 }}>Rs.{fmtAmt(cartTotal)}</div>
            {cartDiscount > 0 && <div style={{ fontSize: 10, color: '#fbbf24' }}>💰 {t.saving} Rs.{fmtAmt(cartDiscount)}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={clearCart} style={{ background: 'rgba(239,68,68,.2)', color: '#fca5a5', border: 'none', padding: '10px 12px', borderRadius: 10, fontWeight: 'bold', fontSize: 11, cursor: 'pointer' }}>🗑️</button>
            <button onClick={() => setShowCheckout(true)} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '10px 18px', borderRadius: 12, fontWeight: 'bold', fontSize: 13, cursor: 'pointer' }}>{t.checkout}</button>
          </div>
        </div>
      )}

      {/* CHECKOUT MODAL */}
      {showCheckout && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: 'white', width: '100%', maxWidth: 500, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '24px 20px', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <h3 style={{ marginTop: 0 }}>{t.confirmOrder}</h3>
            <div style={{ background: '#f8fafc', borderRadius: 12, padding: 12, marginBottom: 16, border: '1px solid #e2e8f0' }}>
              {cart.map((ci, idx) => {
                const p = getPriceInfo(ci);
                const o = nn(ci.stock) <= 0;
                return (
                  <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: idx < cart.length - 1 ? '1px dashed #e2e8f0' : 'none' }}>
                    <ItemImageBox item={ci} size={44} onZoom={setViewImg} />
                    <div style={{ flex: 1 }}><ItemNamesBlock item={ci} size="sm" /></div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{o ? '📞' : `Rs.${fmtAmt(p.final * ci.qty)}`}</div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>×{ci.qty}</div>
                    </div>
                  </div>
                );
              })}
              <div style={{ borderTop: '2px solid #0f172a', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 900, color: '#059669' }}>
                <span>{t.grandTotal}</span><span>Rs.{fmtAmt(cartTotal)}</span>
              </div>
            </div>
            <input placeholder={t.customerName} value={custName} onChange={(e) => setCustName(e.target.value)} style={{ width: '100%', padding: 14, marginBottom: 10, borderRadius: 12, border: '1px solid #ddd', boxSizing: 'border-box', fontSize: 14 }} />
            <input placeholder={t.customerPhone} value={custPhone} onChange={(e) => setCustPhone(e.target.value)} style={{ width: '100%', padding: 14, marginBottom: 20, borderRadius: 12, border: '1px solid #ddd', boxSizing: 'border-box', fontSize: 14 }} />
            <button onClick={handlePlaceOrder} disabled={placing} style={{ width: '100%', background: '#059669', color: 'white', padding: 16, borderRadius: 14, fontWeight: 'bold', border: 'none', fontSize: 15, opacity: placing ? 0.6 : 1, cursor: placing ? 'wait' : 'pointer' }}>{placing ? '⏳...' : t.placeOrder}</button>
            <button onClick={() => setShowCheckout(false)} style={{ width: '100%', background: 'none', border: 'none', marginTop: 12, color: '#ef4444', fontWeight: 'bold', fontSize: 14, cursor: 'pointer' }}>{t.cancelOrder}</button>
          </div>
        </div>
      )}

      {/* ORDER SUCCESS */}
      {orderSuccess && (
        <div style={{ position: 'fixed', inset: 0, background: 'white', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 60 }}>✅</div>
          <h2>{t.orderSuccess}</h2>
          <button onClick={() => setOrderSuccess(false)} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '15px 40px', borderRadius: 15, fontWeight: 'bold', marginTop: 20, fontSize: 15, cursor: 'pointer' }}>{t.ok}</button>
        </div>
      )}
    </div>
  );
}