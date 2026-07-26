'use client';

// components/CustomerPortal.jsx
// ✅ Next.js — portalKey prop + useParams dual support
// ✅ Same-origin portal links

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/shared/firebase-config';
import {
  collection, query, where, getDocs, addDoc,
  serverTimestamp, onSnapshot, doc, getDoc,
} from 'firebase/firestore';

/* ════════════════════════════════════════
   HELPERS
════════════════════════════════════════ */
const nn = v => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v); return isNaN(n) ? 0 : n;
};

const fmtAmt = v => nn(v).toLocaleString('en-US', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

const defaultImg = 'https://placehold.co/200x200/e2e8f0/64748b?text=No+Image';

const getImg = item => {
  if (!item) return defaultImg;
  for (const f of ['imageUrl','picture','photoURL','image','itemImage','productImage']) {
    const val = item[f];
    if (typeof val === 'string' && val.length > 10 &&
      (val.startsWith('http') || val.startsWith('data:image'))) return val;
  }
  if (item.images?.length > 0 && typeof item.images[0] === 'string' &&
    item.images[0].length > 10) return item.images[0];
  return defaultImg;
};

const norm = v => (v || '').toString().trim().toLowerCase();

const normalizePhone = p => {
  if (!p) return '';
  let s = String(p).replace(/[\s\-\(\)]/g, '');
  if (s.startsWith('+94'))                       s = '0' + s.slice(3);
  else if (s.startsWith('94') && s.length >= 11) s = '0' + s.slice(2);
  else if (/^\d{9}$/.test(s))                    s = '0' + s;
  return s;
};

// ★ Same-origin portal link
const PORTAL_SHARE_BASE =
  process.env.NEXT_PUBLIC_APP_URL ||
  (typeof window !== 'undefined' ? window.location.origin : '');

const portalLinkFromKey = key =>
  key ? `${PORTAL_SHARE_BASE}/portal/${key}` : '';

const findCatalogMatch = (catalogItems, it) => {
  if (!it || !Array.isArray(catalogItems) || catalogItems.length === 0) return null;
  const itemKeys = [
    it.itemId, it.id, it.itemCode, it.code, it.barcode,
    it.modelKeyCode, norm(it.name), norm(it.sinhalaName),
    norm(it.goodsName), norm(it.itemName),
  ].filter(Boolean);
  return catalogItems.find(c => {
    const catKeys = [
      c.id, c.itemCode, c.code, c.barcode, c.modelKeyCode,
      norm(c.name), norm(c.sinhalaName), norm(c.goodsName), norm(c.itemName),
    ].filter(Boolean);
    return itemKeys.some(k => catKeys.includes(k));
  }) || null;
};

const enrichItem = (it, catalogItems) => {
  const cat = findCatalogMatch(catalogItems, it);
  if (!cat) return it;
  return {
    ...cat, ...it,
    photoURL:  it.photoURL  || getImg(cat),
    imageUrl:  it.imageUrl  || cat.imageUrl  || cat.image || cat.picture || '',
    image:     it.image     || cat.image     || cat.imageUrl || cat.picture || '',
  };
};

const getTransactionImage = tx => {
  if (!tx) return null;
  for (const f of [
    'receiptImage','receiptUrl','imageUrl','paymentReceipt',
    'image','photoURL','picture','attachment',
  ]) {
    const val = tx[f];
    if (typeof val === 'string' && val.length > 10 &&
      (val.startsWith('http') || val.startsWith('data:image'))) return val;
  }
  if (tx.images && Array.isArray(tx.images) && tx.images.length > 0 &&
    typeof tx.images[0] === 'string') return tx.images[0];
  return null;
};

const getAllItemNames = item => {
  if (!item) return { primary: '—', secondary: '', badges: [] };
  const nameFields = [item.sinhalaName, item.name, item.goodsName, item.itemName];
  const uniqueNames = [...new Set(nameFields.map(n => (n || '').trim()).filter(Boolean))];
  const primary   = uniqueNames.length > 0 ? uniqueNames[0] : '—';
  const secondary = uniqueNames.slice(1).join('  |  ');
  const badges    = [];
  const brand = (item.brandName || item.brand || '').trim();
  if (brand) badges.push({ label: brand, icon: '🏷️', color: '#7c3aed', bg: '#f3f0ff' });
  const codeFields = [item.itemCode, item.code, item.modelKeyCode, item.modelKey, item.barcode];
  [...new Set(codeFields.map(c => (c || '').trim()).filter(Boolean))].forEach(code => {
    badges.push({ label: code, icon: '🔢', color: '#0369a1', bg: '#e0f2fe' });
  });
  return { primary, secondary, badges };
};

const getDisplayUnit = i =>
  i.catalogUom || i.displayUnit || i.uomName || i.uom || i.unit || '';

const getPriceInfo = item => {
  const type = item.catalogPriceType || 'retail';
  let bp = 0, dp = 0;
  switch (type) {
    case 'wholesale':
      bp = nn(item.sellingPriceWholesale); dp = nn(item.wholesaleDiscount); break;
    case 'loose':
      bp = nn(item.sellingPriceLoose);     dp = nn(item.looseDiscount);     break;
    default:
      bp = nn(item.sellingPriceRetail || item.sellingPrice || item.price);
      dp = nn(item.retailDiscount || item.discountPercent);
  }
  let f = 1;
  if (item.catalogUom && item.catalogUom !== item.uomName && item.availableUnits?.length > 0) {
    const c = item.availableUnits.find(u => u.toUnitName === item.catalogUom);
    if (c && nn(c.factor) > 0) f = nn(c.factor);
  }
  const uo = bp / f, da = uo * (dp / 100), uf = uo - da;
  return {
    original: uo, final: uf, discPct: dp, discAmount: da,
    hasDisc: dp > 0 && da > 0.005,
    unit: item.catalogUom || item.uomName || '',
  };
};

const getHistoryItemPrices = it => {
  const qty = nn(it.qty || it.quantity || 1);
  let op    = nn(it.originalPrice) || nn(it.unitPrice) || nn(it.price);
  const dp  = nn(it.discPercent || it.discountPercent || it.discPct);
  const sda = nn(it.discAmount  || it.discAmout);
  let fp    = nn(it.yourPrice);
  if (fp === 0 && op > 0) {
    if (sda > 0)      fp = op - sda;
    else if (dp > 0)  fp = op - (op * dp / 100);
    else              fp = op;
  }
  if (op === 0 && fp > 0) op = dp > 0 ? fp / (1 - dp / 100) : fp;
  const adu = Math.max(0, op - fp), hd = adu > 0.005;
  const edp = hd ? (dp > 0 ? dp : (op > 0 ? (adu / op) * 100 : 0)) : 0;
  return {
    qty, originalPrice: op, finalPrice: fp, discPercent: edp,
    discAmountPerUnit: adu, hasDiscount: hd,
    lineOriginal: op * qty,
    lineTotal: nn(it.lineTotal) || nn(it.total) || (fp * qty),
    lineDiscount: hd ? adu * qty : 0,
  };
};

const getReturnItemPrices = it => {
  let qty = 0;
  for (const f of ['qty','quantity','count','returnQty']) {
    const v = nn(it[f]); if (v > 0) { qty = v; break; }
  }
  if (qty <= 0) qty = 1;
  let up = 0;
  for (const f of [
    'price','unitPrice','refundPrice','yourPrice',
    'sellingPrice','sellingRetail','sellingPriceRetail',
    'originalPrice','cost','rate',
  ]) { const v = nn(it[f]); if (v > 0) { up = v; break; } }
  let la = 0;
  for (const f of ['amount','total','lineTotal','lineAmount','refundAmount','subTotal']) {
    const v = nn(it[f]); if (v > 0) { la = v; break; }
  }
  if (up === 0 && la > 0 && qty > 0) up = la / qty;
  if (la === 0 && up > 0 && qty > 0) la = up * qty;
  return { qty, refundPrice: up, lineAmount: la };
};

const calculateReturnTotals = rd => {
  let itemsTotal = 0;
  if (Array.isArray(rd.items) && rd.items.length > 0) {
    for (const item of rd.items) itemsTotal += getReturnItemPrices(item).lineAmount;
  }
  const docTotal = nn(rd.refundAmount) || nn(rd.total) || nn(rd.amount) ||
    nn(rd.netAmount) || nn(rd.grandTotal);
  return { itemsTotal, docTotal, displayTotal: itemsTotal > 0 ? itemsTotal : docTotal };
};

const formatPhoneForCall = phone => {
  if (!phone) return '';
  let c = phone.replace(/[\s\-\(\)]/g, '');
  if (c.startsWith('0')) c = '+94' + c.substring(1);
  if (!c.startsWith('+')) c = '+94' + c;
  return c;
};

const formatPhoneForWhatsApp = phone => {
  if (!phone) return '';
  let c = phone.replace(/[\s\-\(\)\+]/g, '');
  if (c.startsWith('0')) c = '94' + c.substring(1);
  if (c.length === 9) c = '94' + c;
  return c;
};

const compressReceiptImage = (file, maxWidth = 600) =>
  new Promise((resolve, reject) => {
    if (file.size > 10 * 1024 * 1024) { reject(new Error('File too large')); return; }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = event => {
      const img    = new Image();
      img.src      = event.target.result;
      img.onload   = () => {
        const canvas  = document.createElement('canvas');
        const scale   = Math.min(maxWidth / img.width, 1);
        canvas.width  = img.width  * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });

/* ════════════════════════════════════════
   PRODUCTION HELPERS
════════════════════════════════════════ */
const PRODUCTION_BIZ_META = {
  quarry:        { icon: '🪨', color: '#d97706', bg: '#fffbeb' },
  cropFarm:      { icon: '🌿', color: '#16a34a', bg: '#f0fdf4' },
  vehicleRepair: { icon: '🔧', color: '#2563eb', bg: '#eff6ff' },
  tyreShop:      { icon: '⭕', color: '#7c3aed', bg: '#faf5ff' },
  vehicleWash:   { icon: '🚿', color: '#0891b2', bg: '#ecfeff' },
  custom:        { icon: '🏢', color: '#64748b', bg: '#f8fafc' },
};

const PRODUCTION_PAY_META = {
  cash: { icon: '💵', label: 'Cash' }, card: { icon: '💳', label: 'Card' },
  bank: { icon: '🏦', label: 'Bank' }, online: { icon: '📱', label: 'Online' },
  cheque: { icon: '📝', label: 'Cheque' }, credit: { icon: '📌', label: 'Credit' },
};

const QUARRY_OUTPUT_LABELS = {
  stone34: { si: '3/4 ගල්', en: '3/4 Stone' }, stone12: { si: '1/2 ගල්', en: '1/2 Stone' },
  stoneDust: { si: 'ගල් කුඩු', en: 'Stone Dust' }, chips: { si: 'චිප්ස්', en: 'Chips' },
  metal: { si: 'මෙටල්', en: 'Metal' }, sand: { si: 'වැලි', en: 'Sand' },
  boulder: { si: 'බොල්ඩර්', en: 'Boulder' }, baseRock: { si: 'Base Rock', en: 'Base Rock' },
  rubble: { si: 'රබල්', en: 'Rubble' },
};

const CROP_OUTPUT_LABELS = {
  tea: { si: 'තේ', en: 'Tea' }, coconut: { si: 'පොල්', en: 'Coconut' },
  rubber: { si: 'රබර්', en: 'Rubber' }, cinnamon: { si: 'කුරුඳු', en: 'Cinnamon' },
  pepper: { si: 'ගම්මිරිස්', en: 'Pepper' }, clove: { si: 'කරාබු නැටි', en: 'Clove' },
  paddy: { si: 'වී', en: 'Paddy' }, vegetable: { si: 'එළවළු', en: 'Vegetable' },
};

const getOutputLabel = (bizType, value, lang) => {
  if (!value) return '—';
  const map = bizType === 'quarry' ? QUARRY_OUTPUT_LABELS
            : bizType === 'cropFarm' ? CROP_OUTPUT_LABELS : {};
  return map[value] ? (lang === 'si' ? map[value].si : map[value].en) : value;
};

const getPayLabel = method => {
  const p = PRODUCTION_PAY_META[(method || '').toLowerCase()] ||
    { icon: '💰', label: method || 'Payment' };
  return `${p.icon} ${p.label}`;
};

const getProdPartGross  = p => nn(p.qty || 1) * nn(p.sellPrice || p.unitPrice || p.price || p.yourPrice);
const getProdPartNet    = p => { const g = getProdPartGross(p); const d = nn(p.discount || p.discountPercent || p.discPercent); return g - (g * d / 100); };
const getProdExpenseAmount = e => nn(e.amount) || (nn(e.qty) * nn(e.unitPrice));
const getPaymentsTotal  = arr => Array.isArray(arr) ? arr.reduce((s, p) => s + nn(p.amount), 0) : 0;

const getProdPayStatusMeta = (status, due, paid, total, lang) => {
  const s = (status || '').toLowerCase();
  if (s === 'paid' || (total > 0 && due <= 0))
    return { icon: '✅', label: lang === 'si' ? 'සම්පූර්ණ ගෙවා ඇත' : 'Fully Paid', color: '#16a34a', bg: '#dcfce7' };
  if (s === 'partial' || (paid > 0 && due > 0))
    return { icon: '⏳', label: lang === 'si' ? 'අර්ධ ගෙවීම' : 'Partial', color: '#d97706', bg: '#fef3c7' };
  return { icon: '📌', label: lang === 'si' ? 'නොගෙවූ' : 'Unpaid', color: '#dc2626', bg: '#fee2e2' };
};

const formatPortalDate = (src, lang) => {
  const loc = lang === 'si' ? 'si-LK' : 'en-GB';
  try {
    if (!src) return '';
    if (typeof src?.toDate === 'function')
      return src.toDate().toLocaleDateString(loc, { year: 'numeric', month: 'short', day: '2-digit' });
    if (src?.seconds)
      return new Date(src.seconds * 1000).toLocaleDateString(loc, { year: 'numeric', month: 'short', day: '2-digit' });
    if (typeof src === 'string') {
      const d = new Date(src);
      if (!isNaN(d.getTime()))
        return d.toLocaleDateString(loc, { year: 'numeric', month: 'short', day: '2-digit' });
      return src;
    }
    return '';
  } catch { return String(src || ''); }
};

const STATUS_STYLE = {
  pending:          { label: 'Pending',       labelSi: 'පොරොත්තුවේ',             color: '#f59e0b', bg: '#fefce8', icon: '⏳' },
  confirmed:        { label: 'Confirmed',      labelSi: 'තහවුරු',                 color: '#16a34a', bg: '#f0fdf4', icon: '✅' },
  processing:       { label: 'Processing',     labelSi: 'සැකසෙමින්',              color: '#2563eb', bg: '#eff6ff', icon: '⚙️' },
  shipped:          { label: 'Shipped',        labelSi: 'යවන ලදී',                color: '#7c3aed', bg: '#faf5ff', icon: '🚚' },
  delivered:        { label: 'Delivered',      labelSi: 'බාර දුන්නා',             color: '#059669', bg: '#ecfdf5', icon: '📦' },
  cancelled:        { label: 'Cancelled',      labelSi: 'අවලංගු',                 color: '#dc2626', bg: '#fef2f2', icon: '❌' },
  payment:          { label: 'Paid',           labelSi: 'ගෙවීම',                  color: '#16a34a', bg: '#dcfce7', icon: '💰' },
  invoice:          { label: 'Bill',           labelSi: 'බිල',                    color: '#1e40af', bg: '#dbeafe', icon: '🧾' },
  return_pending:   { label: 'Return Pending', labelSi: 'ආපසු බාරය පොරොත්තුවේ', color: '#ea580c', bg: '#fff7ed', icon: '⏳' },
  return_completed: { label: 'Return Done',    labelSi: 'ආපසු බාරය සම්පූර්ණයි',  color: '#16a34a', bg: '#f0fdf4', icon: '✅' },
  return:           { label: 'Returned',       labelSi: 'ආපසු භාරයි',             color: '#ea580c', bg: '#fff7ed', icon: '↩️' },
  completed:        { label: 'Completed',      labelSi: 'සම්පූර්ණයි',             color: '#059669', bg: '#ecfdf5', icon: '✅' },
  production:       { label: 'Service',        labelSi: 'සේවාව',                  color: '#0891b2', bg: '#ecfeff', icon: '🔧' },
  trip:             { label: 'Trip',           labelSi: 'ගමන',                    color: '#8b5cf6', bg: '#f5f3ff', icon: '🚛' },
  approved:         { label: 'Approved',       labelSi: 'අනුමත කළා',              color: '#16a34a', bg: '#dcfce7', icon: '✅' },
  rejected:         { label: 'Rejected',       labelSi: 'ප්‍රතික්ෂේප',            color: '#dc2626', bg: '#fef2f2', icon: '❌' },
};

/* ════════════════════════════════════════
   TRANSLATIONS
════════════════════════════════════════ */
const translations = {
  si: {
    balance: 'වත්මන් ශේෂය', orderTab: '🛒 ඇණවුම්', accountTab: '📊 ඉතිහාසය',
    shopsTab: '🏪 වෙළඳසැල්', search: 'භාණ්ඩ සොයන්න...', addToCart: 'කරත්තයට',
    checkout: 'ඇණවුම යොමු කරන්න', customerName: 'ඔබේ නම', customerPhone: 'දුරකථන අංකය',
    placeOrder: 'ඇණවුම තහවුරු කරන්න', orderSuccess: 'ඇණවුම සාර්ථකයි!',
    loading: 'පූරණය වෙමින්...', noOrders: 'ගනුදෙනු නොමැත.', itemsCount: 'භාණ්ඩ වර්ග',
    payment: 'මුදල් ගෙවීම', paid: 'ගෙවූ මුදල', due: 'හිඟ මුදල',
    download: 'රිසිට් පත', saving: 'ඉතිරි කිරීම', perUnit: 'එකකට',
    contactForPrice: 'මිල සඳහා අමතන්න', cartItems: 'භාණ්ඩ',
    cancelOrder: 'අවලංගු කරන්න', confirmOrder: 'ඇණවුම තහවුරු කරන්න', ok: 'හරි',
    grossTotal: 'මුළු මිල', grandTotal: 'ගෙවිය යුතු මුදල',
    youSaved: 'ඔබ ඉතිරි කළ මුදල', langSwitch: 'EN',
    detailsRequired: 'නම සහ දුරකථන අංකය අවශ්‍යයි', cartEmpty: 'කරත්තය හිස්ය',
    errorOccurred: 'දෝෂයක් ඇති විය', notFound: 'පාරිභෝගිකයා හමු නොවීය',
    viewReceipt: '🧾 රිසිට් පත බලන්න', makePayment: '💳 මුදල් ගෙවන්න',
    paymentAmount: 'ගෙවන මුදල', paymentNote: 'සටහන (විකල්ප)',
    uploadReceipt: '📷 බැංකු රිසිට් පත Upload කරන්න',
    receiptUploaded: '✅ රිසිට් පත Upload කළා',
    submitPayment: '💰 ගෙවීම යොමු කරන්න', submitting: 'යොමු කරමින්...',
    paymentSuccess: '✅ ගෙවීම සාර්ථකව යොමු කරන ලදී!',
    paymentSuccessDesc: 'ඔබේ ගෙවීම සාර්ථකව ලැබුණි. වෙළඳසැල විසින් තහවුරු කළ පසු ශේෂය යාවත්කාලීන වේ.',
    bankAccounts: '🏦 බැංකු ගිණුම් තොරතුරු',
    bankAccountsDesc: 'ගෙවීම් කිරීමට පහත බැංකු ගිණුම් වලින් එකකට මුදල් බැර කරන්න',
    noBankAccounts: 'බැංකු ගිණුම් තොරතුරු ලබා දී නැත',
    accNumber: 'ගිණුම් අංකය', accName: 'ගිණුම් හිමියා',
    copiedAccNo: '✅ ගිණුම් අංකය Copy කළා!', tapToCopy: '📋 Copy කරන්න',
    amountRequired: '⚠️ මුදල ඇතුළත් කරන්න',
    yourBalance: 'ඔබේ ශේෂය', payFull: 'සම්පූර්ණ මුදල ගෙවන්න',
    step1: '1️⃣ පහත බැංකු ගිණුමකට මුදල් බැර කරන්න',
    step2: '2️⃣ බැංකු රිසිට් පත Upload කරන්න',
    step3: '3️⃣ ගෙවීම යොමු කරන්න',
    paymentSteps: 'ගෙවීම් පියවර', closeModal: 'වසන්න',
    callNow: '📞 දැන්ම අමතන්න', whatsappNow: '💬 WhatsApp',
    noPhoneAvailable: 'දුරකථන අංකයක් ලබා දී නැත', priceInquiry: 'මිල විමසීම',
    selectInvoice: 'බිල්පතක් තෝරන්න',
    generalPayment: '📋 සාමාන්‍ය ගෙවීම (බිල්පතක් නොතෝරා)',
    invoiceDue: 'ගෙවිය යුතු',
    paymentApproved: '✅ ගෙවීම අනුමත විය',
    paymentPending: '⏳ අනුමත වීමට පොරොත්තුවේ',
    paymentRejected: '❌ ප්‍රතික්ෂේප විය', rejectReason: 'හේතුව',
    totalOutstanding: 'මුළු ණය එකතුව', unpaidBills: 'ගෙවිය යුතු බිල්පත්',
    billsTab: '🧾 බිල්පත්', settleBill: '💳 Settle කරන්න',
    billPaid: 'ගෙවූ මුදල', billDue: 'ඉතිරි ණය', billItems: 'භාණ්ඩ',
    noBills: 'ගෙවිය යුතු බිල්පත් නැත 🎉', allPaid: 'සියලුම බිල්පත් ගෙවා ඇත!',
    hideDetails: 'සඟවන්න', viewDetails: 'සම්පූර්ණ විස්තර බලන්න',
    tripInfo: '🚛 ගමන් විස්තර', tripTotalBill: 'මුළු ගාස්තුව',
    tripPaid: 'ගෙවූ මුදල', tripBalance: 'ඉතිරි ණය',
    selectAll: 'සියල්ල තෝරන්න', deselectAll: 'සියල්ල ඉවත් කරන්න',
    paySelected: 'තෝරාගත් බිල් ගෙවන්න',
    selectedTotal: 'තෝරාගත් මුළු එකතුව', billsSelected: 'බිල්පත් තෝරා ඇත',
    viewAccount: '👤 ගිණුම බලන්න', copyAccountLink: '🔗 ගිණුම් ලින්ක් Copy',
    accountLinkCopied: '✅ Copied!',
    productionEntry: '🏭 නිෂ්පාදන ඇතුළත්කිරීම',
    batchNo: 'Batch අංකය', invoiceNo: 'Invoice අංකය',
    paymentStatus: 'ගෙවීම් තත්ත්වය', paymentDetails: 'ගෙවීම් විස්තර',
    outputDetails: 'නිමැවුම් විස්තර', harvestDetails: 'අස්වැන්න විස්තර',
    expenseDetails: 'වියදම් විස්තර', services: 'සේවා', parts: 'කොටස්',
    amountReceived: 'ලැබුණු මුදල', totalCostLabel: 'මුළු වියදම',
    currentOutstanding: 'වත්මන් ශේෂය', income: 'ආදායම', profit: 'ලාභය',
    balanceDue: 'ශේෂය',
  },
  en: {
    balance: 'Balance', orderTab: '🛒 Order', accountTab: '📊 History',
    shopsTab: '🏪 Shops', search: 'Search...', addToCart: 'Add to Cart',
    checkout: 'Checkout', customerName: 'Your Name', customerPhone: 'Phone Number',
    placeOrder: 'Confirm Order', orderSuccess: 'Order Placed!', loading: 'Loading...',
    noOrders: 'No transactions found.', itemsCount: 'Products',
    payment: 'Payment', paid: 'Paid', due: 'Due',
    download: 'Receipt', saving: 'Saving', perUnit: 'per',
    contactForPrice: 'Contact for Price', cartItems: 'Items',
    cancelOrder: 'Cancel', confirmOrder: 'Confirm Order', ok: 'OK',
    grossTotal: 'Gross Total', grandTotal: 'Grand Total',
    youSaved: 'You Saved', langSwitch: 'සි',
    detailsRequired: 'Name and phone required', cartEmpty: 'Cart is empty',
    errorOccurred: 'An error occurred', notFound: 'Customer not found',
    viewReceipt: '🧾 View Receipt', makePayment: '💳 Make Payment',
    paymentAmount: 'Payment Amount', paymentNote: 'Note (Optional)',
    uploadReceipt: '📷 Upload Bank Receipt',
    receiptUploaded: '✅ Receipt Uploaded',
    submitPayment: '💰 Submit Payment', submitting: 'Submitting...',
    paymentSuccess: '✅ Payment Submitted Successfully!',
    paymentSuccessDesc: 'Your payment has been received. Balance will update once confirmed.',
    bankAccounts: '🏦 Bank Account Details',
    bankAccountsDesc: 'Transfer money to one of the following bank accounts',
    noBankAccounts: 'No bank account details available',
    accNumber: 'Account No', accName: 'Account Holder',
    copiedAccNo: '✅ Account number copied!', tapToCopy: '📋 Copy',
    amountRequired: '⚠️ Please enter amount',
    yourBalance: 'Your Balance', payFull: 'Pay Full Amount',
    step1: '1️⃣ Transfer money to a bank account below',
    step2: '2️⃣ Upload the bank receipt',
    step3: '3️⃣ Submit your payment',
    paymentSteps: 'Payment Steps', closeModal: 'Close',
    callNow: '📞 Call Now', whatsappNow: '💬 WhatsApp',
    noPhoneAvailable: 'No phone number available', priceInquiry: 'Price Inquiry',
    selectInvoice: 'Select an invoice',
    generalPayment: '📋 General Payment (no invoice)',
    invoiceDue: 'Due',
    paymentApproved: '✅ Payment Approved',
    paymentPending: '⏳ Pending Approval',
    paymentRejected: '❌ Payment Rejected', rejectReason: 'Reason',
    totalOutstanding: 'Total Outstanding', unpaidBills: 'Unpaid Bills',
    billsTab: '🧾 Bills', settleBill: '💳 Settle',
    billPaid: 'Paid', billDue: 'Due', billItems: 'Items',
    noBills: 'No unpaid bills 🎉', allPaid: 'All bills are settled!',
    hideDetails: 'Hide Details', viewDetails: 'View Full Details',
    tripInfo: '🚛 Trip Details', tripTotalBill: 'Total Bill',
    tripPaid: 'Amount Paid', tripBalance: 'Balance Due',
    selectAll: 'Select All', deselectAll: 'Deselect All',
    paySelected: 'Pay Selected Bills',
    selectedTotal: 'Selected Total', billsSelected: 'bills selected',
    viewAccount: '👤 View Account', copyAccountLink: '🔗 Copy Account Link',
    accountLinkCopied: '✅ Copied!',
    productionEntry: '🏭 Production Entry',
    batchNo: 'Batch No', invoiceNo: 'Invoice No',
    paymentStatus: 'Payment Status', paymentDetails: 'Payment Details',
    outputDetails: 'Output Details', harvestDetails: 'Harvest Details',
    expenseDetails: 'Expense Details', services: 'Services', parts: 'Parts',
    amountReceived: 'Amount Received', totalCostLabel: 'Total Cost',
    currentOutstanding: 'Current Outstanding', income: 'Income', profit: 'Profit',
    balanceDue: 'Balance Due',
  },
};

// ═══════════════════════════════════
// Part 1 END — Part 2 continues with Sub Components
// ═══════════════════════════════════// ═══════════════════════════════════
// Part 2 — Sub Components
// (continues from Part 1 — paste below Part 1 code)
// ═══════════════════════════════════

/* ════════════════════════════════════════
   SUB COMPONENTS
════════════════════════════════════════ */
const ItemImageBox = ({ item, size = 44, onZoom, isReturn = false }) => {
  const src     = getImg(item);
  const hasReal = src !== defaultImg;
  return (
    <div
      onClick={() => onZoom && hasReal && onZoom(src)}
      style={{
        width: size, height: size, borderRadius: 8, overflow: 'hidden',
        flexShrink: 0,
        background: isReturn ? '#fff7ed' : '#f8fafc',
        border: isReturn
          ? '2px solid #fed7aa'
          : hasReal ? '1.5px solid #cbd5e1' : '1.5px dashed #cbd5e1',
        cursor: hasReal ? 'zoom-in' : 'default',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}
    >
      <img
        src={src} alt=""
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        onError={e => { e.target.onerror = null; e.target.src = defaultImg; }}
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
  const n  = getAllItemNames(item);
  const ps = size === 'sm' ? 12 : 14;
  const ss = size === 'sm' ? 10 : 11;
  const bs = size === 'sm' ?  9 : 10;
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
        <div style={{ fontSize: ss, color: '#475569', marginTop: 3, fontStyle: 'italic', fontWeight: 600 }}>
          {n.secondary}
        </div>
      )}
      {n.badges.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
          {n.badges.map((b, i) => (
            <span key={i} style={{
              fontSize: bs, fontWeight: 700, color: b.color,
              background: b.bg, padding: '2px 6px', borderRadius: 6,
            }}>
              {b.icon} {b.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

/* ════════════════════════════════════════
   CONTACT PHONE MODAL
════════════════════════════════════════ */
const ContactPhoneModal = ({ item, shopInfo, onClose, t }) => {
  if (!item) return null;
  const n         = getAllItemNames(item);
  const img       = getImg(item);
  const shopPhone = shopInfo?.phone || shopInfo?.shopPhone || shopInfo?.contactPhone || shopInfo?.mobile || '';
  const callLink  = formatPhoneForCall(shopPhone);
  const waLink    = formatPhoneForWhatsApp(shopPhone);
  const waMessage = encodeURIComponent(
    `සුබ දවසක් 🙏\n\n"${n.primary}" භාණ්ඩයේ මිල දැනගැනීමට කැමැත්තෙමි.`
  );

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(4px)' }} />
      <div
        style={{ position: 'relative', width: '100%', maxWidth: 380, background: 'white', borderRadius: 22, overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, background: 'rgba(255,255,255,0.92)', width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer' }}>✕</button>
        <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: '28px 20px 20px', textAlign: 'center', color: 'white' }}>
          <div style={{ fontSize: 42, marginBottom: 8 }}>📞</div>
          <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{t.priceInquiry}</h3>
        </div>
        <div style={{ display: 'flex', gap: 12, padding: '14px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <img src={img} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', border: '2px solid #e2e8f0' }} onError={e => { e.target.src = defaultImg; }} />
          <ItemNamesBlock item={item} />
        </div>
        <div style={{ padding: '16px 20px' }}>
          {shopPhone ? (
            <>
              <div style={{ background: '#eff6ff', borderRadius: 14, padding: 16, textAlign: 'center', marginBottom: 14, border: '2px solid #93c5fd' }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#1e40af', fontFamily: 'monospace' }}>{shopPhone}</div>
              </div>
              <a href={`tel:${callLink}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '14px 0', background: '#16a34a', color: 'white', borderRadius: 14, fontWeight: 800, fontSize: 16, textDecoration: 'none', marginBottom: 10 }}>
                📞 {t.callNow}
              </a>
              {waLink && (
                <a href={`https://wa.me/${waLink}?text=${waMessage}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '14px 0', background: '#25d366', color: 'white', borderRadius: 14, fontWeight: 800, fontSize: 16, textDecoration: 'none' }}>
                  💬 {t.whatsappNow}
                </a>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 24, background: '#fef2f2', borderRadius: 14 }}>
              <div style={{ fontSize: 36 }}>😔</div>
              <div style={{ fontWeight: 700, color: '#991b1b' }}>{t.noPhoneAvailable}</div>
            </div>
          )}
        </div>
        <div style={{ padding: '0 20px 18px' }}>
          <button onClick={onClose} style={{ width: '100%', padding: 12, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>
            {t.closeModal}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════
   BANK ACCOUNT CARD
════════════════════════════════════════ */
const BankAccountCard = ({ bank, t, onCopy }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    const accNo = bank.accountNumber || '';
    if (!accNo) return;
    try { navigator.clipboard.writeText(accNo); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = accNo; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    }
    setCopied(true);
    if (onCopy) onCopy();
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', border: '2px solid #93c5fd', borderRadius: 16, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#1e40af,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🏦</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#1e40af' }}>{bank.bankName || 'Bank'}</div>
          {bank.bankBranch && <div style={{ fontSize: 11, color: '#64748b' }}>📍 {bank.bankBranch}</div>}
        </div>
      </div>
      <div
        onClick={handleCopy}
        style={{ background: 'white', borderRadius: 12, padding: '14px 16px', marginBottom: 10, border: copied ? '2px solid #16a34a' : '2px solid #bfdbfe', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>{t.accNumber}</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', letterSpacing: 2, fontFamily: 'monospace' }}>{bank.accountNumber || '—'}</div>
        </div>
        <div style={{ padding: '6px 12px', borderRadius: 8, background: copied ? '#dcfce7' : '#f1f5f9', color: copied ? '#16a34a' : '#3b82f6', fontSize: 11, fontWeight: 700 }}>
          {copied ? t.copiedAccNo : t.tapToCopy}
        </div>
      </div>
      {bank.accountName && (
        <div style={{ background: 'white', borderRadius: 10, padding: '10px 14px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginBottom: 2 }}>{t.accName}</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>👤 {bank.accountName}</div>
        </div>
      )}
    </div>
  );
};

/* ════════════════════════════════════════
   PAYMENT MODAL
════════════════════════════════════════ */
const PaymentModal = ({
  customer, selectedShop, bankAccounts, unpaidInvoices,
  preSelectedInvoices, onClose, onSuccess, t, lang,
}) => {
  const [amount,             setAmount            ] = useState('');
  const [note,               setNote              ] = useState('');
  const [receiptImage,       setReceiptImage      ] = useState(null);
  const [receiptPreview,     setReceiptPreview    ] = useState(null);
  const [submitting,         setSubmitting        ] = useState(false);
  const [success,            setSuccess           ] = useState(false);
  const [copiedMsg,          setCopiedMsg         ] = useState('');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([]);
  const fileRef = React.useRef(null);
  const balance = nn(customer?.currentBalance);

  useEffect(() => {
    if (preSelectedInvoices?.length > 0) {
      const ids    = preSelectedInvoices.map(inv => inv.id);
      const invNos = [];
      let totalDue = 0;
      preSelectedInvoices.forEach(inv => {
        const net  = nn(inv.netAmount || inv.grandTotal);
        const paid = nn(inv.payAmount || inv.paidAmount);
        totalDue  += Math.max(0, net - paid);
        invNos.push(inv.invoiceNo || inv.invoiceCode || `INV-${inv.id.slice(0, 8).toUpperCase()}`);
      });
      setSelectedInvoiceIds(ids);
      setAmount(totalDue > 0 ? totalDue.toString() : '');
      setNote(preSelectedInvoices.length === 1
        ? `${invNos[0]} payment`
        : `Payment for ${invNos.length} bills: ${invNos.join(', ')}`);
    }
  }, [preSelectedInvoices]);

  const selectedInvoicesData = useMemo(() =>
    (unpaidInvoices || []).filter(inv => selectedInvoiceIds.includes(inv.id)),
    [unpaidInvoices, selectedInvoiceIds]
  );

  const selectedTotalDue = useMemo(() =>
    selectedInvoicesData.reduce((sum, inv) => {
      const net  = nn(inv.netAmount || inv.grandTotal);
      const paid = nn(inv.payAmount || inv.paidAmount);
      return sum + Math.max(0, net - paid);
    }, 0),
    [selectedInvoicesData]
  );

  const handleToggleInvoice = useCallback(inv => {
    setSelectedInvoiceIds(prev => {
      const newIds  = prev.includes(inv.id) ? prev.filter(id => id !== inv.id) : [...prev, inv.id];
      const selInvs = (unpaidInvoices || []).filter(i => newIds.includes(i.id));
      let totalDue = 0;
      selInvs.forEach(i => {
        totalDue += Math.max(0, nn(i.netAmount || i.grandTotal) - nn(i.payAmount || i.paidAmount));
      });
      if (newIds.length > 0) setAmount(totalDue > 0 ? totalDue.toString() : '');
      else { setAmount(''); setNote(''); }
      return newIds;
    });
  }, [unpaidInvoices]);

  const handleSelectAll = useCallback(() => {
    if (!unpaidInvoices || unpaidInvoices.length === 0) return;
    const allIds = unpaidInvoices.map(inv => inv.id);
    let totalDue = 0;
    unpaidInvoices.forEach(inv => {
      totalDue += Math.max(0, nn(inv.netAmount || inv.grandTotal) - nn(inv.payAmount || inv.paidAmount));
    });
    setSelectedInvoiceIds(allIds);
    setAmount(totalDue > 0 ? totalDue.toString() : '');
  }, [unpaidInvoices]);

  const handleDeselectAll = useCallback(() => { setSelectedInvoiceIds([]); setAmount(''); setNote(''); }, []);
  const allSelected = unpaidInvoices && unpaidInvoices.length > 0 && selectedInvoiceIds.length === unpaidInvoices.length;

  const handleReceiptUpload = async e => {
    const file = e.target.files[0]; if (!file) return;
    try { const b64 = await compressReceiptImage(file, 600); setReceiptImage(b64); setReceiptPreview(b64); }
    catch { alert('Image error'); }
    e.target.value = '';
  };

  const handleSubmit = async () => {
    const payAmount = nn(amount);
    if (payAmount <= 0) { alert(t.amountRequired); return; }
    setSubmitting(true);
    try {
      const shopUid    = selectedShop?.uid || customer?.uid || '';
      const invoiceIds = selectedInvoiceIds;
      const invoiceNos = selectedInvoicesData.map(inv =>
        inv.invoiceNo || inv.invoiceCode || `INV-${inv.id.slice(0, 8).toUpperCase()}`
      );
      await addDoc(collection(db, 'customerTransactions'), {
        customerId: customer.id, customerName: customer.name || '', customerPhone: customer.phone || '',
        shopUid, uid: shopUid, amount: payAmount,
        type: 'payment', method: 'bank_transfer', paymentMethod: 'bank',
        invoiceId: invoiceIds[0] || '', invoiceNo: invoiceNos[0] || '',
        invoiceIds, invoiceNos, invoiceCount: invoiceIds.length,
        note: note.trim() || `Payment by ${customer.name}`,
        receiptImage: receiptImage || '', status: 'pending', source: 'customer_portal',
        createdAt: serverTimestamp(), date: new Date().toISOString(),
      });
      setSuccess(true);
      if (onSuccess) onSuccess();
    } catch (e) { console.error(e); alert(t.errorOccurred); }
    finally { setSubmitting(false); }
  };

  if (success) return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(4px)' }} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 380, background: 'white', borderRadius: 24, textAlign: 'center', padding: '40px 24px' }} onClick={e => e.stopPropagation()}>
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
      <div style={{ position: 'relative', width: '100%', maxWidth: 500, background: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92vh', overflowY: 'auto', boxSizing: 'border-box' }} onClick={e => e.stopPropagation()}>
        {copiedMsg && (
          <div style={{ position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)', background: '#16a34a', color: 'white', padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 10 }}>{copiedMsg}</div>
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
          <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 14, marginBottom: 16, border: '1px solid #bbf7d0' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 8 }}>📋 {t.paymentSteps}</div>
            <div style={{ fontSize: 12, color: '#15803d', lineHeight: 1.8 }}>{t.step1}<br />{t.step2}<br />{t.step3}</div>
          </div>

          {unpaidInvoices?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>🧾 {t.selectInvoice}</div>
                <button onClick={allSelected ? handleDeselectAll : handleSelectAll} style={{ padding: '6px 14px', borderRadius: 8, border: allSelected ? '1.5px solid #f87171' : '1.5px solid #3b82f6', background: allSelected ? '#fef2f2' : '#eff6ff', color: allSelected ? '#dc2626' : '#1d4ed8', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  {allSelected ? `✕ ${t.deselectAll}` : `☑️ ${t.selectAll}`}
                </button>
              </div>

              {selectedInvoiceIds.length > 0 && (
                <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', borderRadius: 12, padding: '10px 14px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white' }}>
                  <div>
                    <div style={{ fontSize: 11, opacity: 0.8 }}>✅ {selectedInvoiceIds.length} {t.billsSelected}</div>
                    <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{t.selectedTotal}</div>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 900 }}>Rs. {fmtAmt(selectedTotalDue)}</div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {unpaidInvoices.map(inv => {
                  const net  = nn(inv.netAmount || inv.grandTotal);
                  const paid = nn(inv.payAmount || inv.paidAmount);
                  const due  = Math.max(0, net - paid);
                  const invNo = inv.invoiceNo || inv.invoiceCode || `INV-${inv.id.slice(0, 8).toUpperCase()}`;
                  const isSelected = selectedInvoiceIds.includes(inv.id);
                  const paidPct = net > 0 ? Math.min(100, Math.round((paid / net) * 100)) : 0;
                  return (
                    <div key={inv.id} onClick={() => handleToggleInvoice(inv)} style={{ padding: '12px 14px', borderRadius: 12, border: isSelected ? '2.5px solid #3b82f6' : '1.5px solid #e2e8f0', background: isSelected ? '#eff6ff' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, border: isSelected ? '2px solid #3b82f6' : '2px solid #cbd5e1', background: isSelected ? '#3b82f6' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {isSelected && <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: isSelected ? '#1d4ed8' : '#1e293b' }}>🧾 {invNo}</div>
                        <div style={{ marginTop: 4 }}>
                          <div style={{ height: 4, borderRadius: 2, background: '#fee2e2', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${paidPct}%`, borderRadius: 2, background: paidPct >= 50 ? '#16a34a' : '#f59e0b' }} />
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 600 }}>{t.invoiceDue}</div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: isSelected ? '#1d4ed8' : '#dc2626' }}>Rs.{fmtAmt(due)}</div>
                      </div>
                    </div>
                  );
                })}
                <button onClick={handleDeselectAll} style={{ padding: '10px 14px', borderRadius: 10, border: selectedInvoiceIds.length === 0 ? '2px solid #f59e0b' : '1.5px solid #e2e8f0', background: selectedInvoiceIds.length === 0 ? '#fffbeb' : '#f8fafc', color: selectedInvoiceIds.length === 0 ? '#b45309' : '#64748b', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                  {t.generalPayment}
                </button>
              </div>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#1e40af', marginBottom: 6 }}>{t.bankAccounts}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>{t.bankAccountsDesc}</div>
            {bankAccounts.length > 0
              ? bankAccounts.map((bank, idx) => (
                  <BankAccountCard key={idx} bank={bank} t={t}
                    onCopy={() => { setCopiedMsg(t.copiedAccNo); setTimeout(() => setCopiedMsg(''), 2000); }}
                  />
                ))
              : (
                <div style={{ textAlign: 'center', padding: 24, background: '#fef2f2', borderRadius: 12 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🏦</div>
                  <div style={{ fontSize: 13, color: '#991b1b', fontWeight: 600 }}>{t.noBankAccounts}</div>
                </div>
              )
            }
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', display: 'block', marginBottom: 6 }}>{t.paymentAmount} *</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, fontWeight: 800, color: '#64748b' }}>Rs.</span>
              <input type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={{ width: '100%', padding: '14px 14px 14px 48px', fontSize: 22, fontWeight: 900, border: '2px solid #e2e8f0', borderRadius: 12, boxSizing: 'border-box', outline: 'none', color: '#059669', fontFamily: 'monospace' }} />
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {balance > 0 && selectedInvoiceIds.length === 0 && (
                <button onClick={() => setAmount(balance.toString())} style={{ padding: '6px 14px', background: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  💰 {t.payFull}: Rs. {fmtAmt(balance)}
                </button>
              )}
              {selectedInvoiceIds.length > 0 && nn(amount) !== selectedTotalDue && (
                <button onClick={() => setAmount(selectedTotalDue.toString())} style={{ padding: '6px 14px', background: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  🧾 {t.selectedTotal}: Rs. {fmtAmt(selectedTotalDue)}
                </button>
              )}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontWeight: 700, fontSize: 13, display: 'block', marginBottom: 6 }}>{t.paymentNote}</label>
            <input value={note} onChange={e => setNote(e.target.value)} style={{ width: '100%', padding: 12, fontSize: 14, border: '2px solid #e2e8f0', borderRadius: 10, boxSizing: 'border-box', outline: 'none' }} />
          </div>

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

/* ════════════════════════════════════════
   TRIP CARD
════════════════════════════════════════ */
const TripCard = ({ hi, t, lang, catalogItems, setViewImg, openReceipt, customer }) => {
  const [expanded,   setExpanded  ] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const s         = STATUS_STYLE.trip;
  const tripDate  = hi.tripDate?.seconds
    ? new Date(hi.tripDate.seconds * 1000).toLocaleDateString(lang === 'si' ? 'si-LK' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
    : (typeof hi.tripDate === 'string' ? hi.tripDate : '');
  const fare       = nn(hi.fare);
  const cargoTotal = (hi.cargoItems || []).reduce((sum, i) => sum + nn(i.total), 0);
  const meterTotal = nn(hi.meterTotal);
  const totalBill  = nn(hi.totalBillAmount) || (fare + cargoTotal + meterTotal);
  const paidAmount = nn(hi.paidAmount);
  const balanceDue = nn(hi.balanceDue) || Math.max(0, totalBill - paidAmount);
  const cargoItems = (hi.cargoItems || []).map(it => enrichItem(it, catalogItems));
  const accountUrl = portalLinkFromKey(hi.customerPortalKey || customer?.portalAccessKey || '');

  const copyLink = async () => {
    if (!accountUrl) return;
    try { await navigator.clipboard.writeText(accountUrl); }
    catch { const ta = document.createElement('textarea'); ta.value = accountUrl; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
    setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2500);
  };

  return (
    <div style={{ background: 'white', borderRadius: 18, marginBottom: 14, border: '1px solid #e2e8f0', borderLeft: '5px solid #8b5cf6', overflow: 'hidden' }}>
      <div style={{ background: '#f5f3ff', padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: 15, color: '#5b21b6' }}>🚛 {t.tripInfo}</div>
            {hi.vehicleName && <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 2 }}>🚗 {hi.vehicleName}</div>}
            {tripDate && <div style={{ fontSize: 12, fontWeight: 700, color: '#5b21b6', marginTop: 4 }}>📅 {tripDate}</div>}
            {(hi.startLocation || hi.endLocation) && (
              <div style={{ fontSize: 12, color: '#4c1d95', marginTop: 4, fontWeight: 600 }}>🗺️ {hi.startLocation || '—'} ➔ {hi.endLocation || '—'}</div>
            )}
            {hi.description && <div style={{ fontSize: 11, color: '#6d28d9', marginTop: 3, fontStyle: 'italic' }}>📝 {hi.description}</div>}
          </div>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: s.bg, color: s.color, height: 'fit-content' }}>{s.icon}</span>
        </div>
      </div>
      <div style={{ padding: '12px 16px' }}>
        <div style={{ background: 'linear-gradient(135deg,#1e1b4b,#3730a3)', borderRadius: 14, padding: '14px 16px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', color: 'white' }}>
          <div><div style={{ fontSize: 11, opacity: 0.7 }}>{t.tripTotalBill}</div><div style={{ fontSize: 26, fontWeight: 900 }}>Rs. {fmtAmt(totalBill)}</div></div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, opacity: 0.7 }}>{t.tripPaid}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#86efac' }}>Rs. {fmtAmt(paidAmount)}</div>
            {balanceDue > 0 && (<><div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>{t.tripBalance}</div><div style={{ fontSize: 16, fontWeight: 800, color: '#fca5a5' }}>Rs. {fmtAmt(balanceDue)}</div></>)}
          </div>
        </div>
        {accountUrl && (
          <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 12, background: '#eff6ff', border: '1.5px solid #bfdbfe', display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#1e40af', marginBottom: 2 }}>👤 {t.viewAccount}</div>
              <div style={{ fontSize: 10, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{accountUrl}</div>
            </div>
            <button onClick={copyLink} style={{ padding: '8px 14px', borderRadius: 10, border: linkCopied ? '1.5px solid #16a34a' : '1.5px solid #3b82f6', background: linkCopied ? '#dcfce7' : '#dbeafe', color: linkCopied ? '#16a34a' : '#1d4ed8', fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>
              {linkCopied ? t.accountLinkCopied : t.copyAccountLink}
            </button>
          </div>
        )}
        <button onClick={() => setExpanded(!expanded)} style={{ width: '100%', padding: '10px 0', background: '#faf5ff', border: '1.5px solid #ddd6fe', borderRadius: 10, color: '#7c3aed', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          {expanded ? `🔼 ${t.hideDetails}` : `🔽 ${t.viewDetails}`}
        </button>
      </div>
      {expanded && (
        <div style={{ borderTop: '2px solid #ede9fe', padding: '14px 16px' }}>
          {(nn(hi.meterKmTotal) > 0 || nn(hi.meterHoursTotal) > 0 || nn(hi.meterDaysTotal) > 0 || nn(hi.damageAmount) > 0 || fare > 0) && (
            <div style={{ background: '#f8fafc', borderRadius: 12, padding: 12, marginBottom: 12, border: '1px solid #e2e8f0' }}>
              {fare > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', color: '#1e3a8a', fontWeight: 800, borderBottom: '1px dashed #cbd5e1', marginBottom: 4 }}><span>💵 {lang === 'si' ? 'ප්‍රවාහන ගාස්තුව' : 'Transport Fare'}</span><span>Rs.{fmtAmt(fare)}</span></div>}
              {nn(hi.meterKmTotal) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: '#0369a1', fontWeight: 700 }}><span>🛣️ {hi.meterUnits || 0} KM</span><span>Rs.{fmtAmt(hi.meterKmTotal)}</span></div>}
              {nn(hi.meterHoursTotal) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: '#7c3aed', fontWeight: 700 }}><span>⏱️ {hi.meterHours || 0} Hrs</span><span>Rs.{fmtAmt(hi.meterHoursTotal)}</span></div>}
              {nn(hi.meterDaysTotal) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: '#d97706', fontWeight: 700 }}><span>📅 {hi.meterDays || 0} {lang === 'si' ? 'දින' : 'Days'}</span><span>Rs.{fmtAmt(hi.meterDaysTotal)}</span></div>}
              {nn(hi.damageAmount) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: '#b45309', fontWeight: 700 }}><span>⚠️ {lang === 'si' ? 'හානි' : 'Damage'}</span><span>Rs.{fmtAmt(hi.damageAmount)}</span></div>}
            </div>
          )}
          {cargoItems.length > 0 && (
            <div style={{ background: '#faf5ff', borderRadius: 12, padding: 12, marginBottom: 12 }}>
              {cargoItems.map((it, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: idx < cargoItems.length - 1 ? '1px solid #ede9fe' : 'none' }}>
                  <ItemImageBox item={it} size={44} onZoom={setViewImg} />
                  <div style={{ flex: 1 }}><ItemNamesBlock item={it} size="sm" /></div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#7c3aed' }}>Rs.{fmtAmt(nn(it.total))}</div>
                </div>
              ))}
            </div>
          )}
          {(() => {
            const prevDebt      = nn(hi.customerPreviousBalance);
            const totalDebtAfter = nn(hi.customerTotalDebtAfterTrip);
            if (prevDebt <= 0 && totalDebtAfter <= 0) return null;
            return (
              <div style={{ background: '#fff1f2', borderRadius: 10, padding: 12, marginBottom: 12, border: '1px solid #fecaca' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#991b1b', marginBottom: 6 }}>📊 {lang === 'si' ? 'ණය සාරාංශය' : 'Debt Summary'}</div>
                {prevDebt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9a3412', marginBottom: 2 }}><span>{lang === 'si' ? 'පෙර ණය' : 'Prev Debt'}:</span><span>Rs.{fmtAmt(prevDebt)}</span></div>}
                {balanceDue > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9a3412', marginBottom: 4 }}><span>{lang === 'si' ? 'මෙම ගමන' : 'This Trip'}:</span><span>Rs.{fmtAmt(balanceDue)}</span></div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#b91c1c', fontWeight: 800, borderTop: '1px dashed #fca5a5', paddingTop: 4 }}><span>{t.totalOutstanding}:</span><span>Rs.{fmtAmt(totalDebtAfter)}</span></div>
              </div>
            );
          })()}
          <button onClick={() => openReceipt(hi)} style={{ width: '100%', background: '#5b21b6', color: 'white', border: 'none', padding: '12px 0', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>🧾 {t.download}</button>
        </div>
      )}
    </div>
  );
};

/* ════════════════════════════════════════
   PRODUCTION ENTRY CARD
════════════════════════════════════════ */
const ProductionEntryCard = ({ hi, t, lang, catalogItems, setViewImg, openReceipt, customer }) => {
  const [expanded,   setExpanded  ] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const bizType  = hi.businessType || 'custom';
  const bizMeta  = PRODUCTION_BIZ_META[bizType] || PRODUCTION_BIZ_META.custom;
  const bizName  = hi.businessName || (lang === 'si' ? 'ව්‍යාපාරය' : 'Business');
  const dateStr  = formatPortalDate(hi.date || hi.createdAt, lang);
  const serviceItems = hi.serviceItems || [];
  const partsUsed    = (hi.partsUsed || []).map(it => enrichItem(it, catalogItems));
  const outputs      = hi.outputs     || [];
  const harvests     = hi.harvests    || [];
  const expenseItems = hi.expenseItems || [];
  const payments     = hi.payments    || [];
  const grandTotal   = nn(hi.grandTotal   || 0);
  const totalIncome  = nn(hi.totalIncome  || grandTotal);
  const totalCost    = nn(hi.totalCost    || 0);
  const totalPaid    = nn(hi.totalPaid    || getPaymentsTotal(payments));
  const balanceDue   = nn(hi.balanceDue   || Math.max(0, grandTotal - totalPaid));
  const profit       = totalIncome - totalCost;
  const hasBilling   = grandTotal > 0 || payments.length > 0 || hi.invoiceNumber || hi.paymentStatus;
  const statusMeta   = getProdPayStatusMeta(hi.paymentStatus, balanceDue, totalPaid, grandTotal, lang);
  const currentOutstanding = nn(customer?.currentBalance);
  const accountUrl   = portalLinkFromKey(hi.customerPortalKey || customer?.portalAccessKey || '');

  const copyLink = async () => {
    if (!accountUrl) return;
    try { await navigator.clipboard.writeText(accountUrl); }
    catch { const ta = document.createElement('textarea'); ta.value = accountUrl; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
    setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2500);
  };

  return (
    <div style={{ background: 'white', borderRadius: 18, marginBottom: 14, border: `1px solid ${bizMeta.color}22`, borderLeft: `5px solid ${bizMeta.color}`, overflow: 'hidden' }}>
      <div style={{ background: bizMeta.bg, padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 15, color: bizMeta.color }}>{bizMeta.icon} {bizName}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>📅 {dateStr}</div>
            {hi.customerName  && <div style={{ fontSize: 12, color: '#1e293b', marginTop: 3, fontWeight: 700 }}>👤 {hi.customerName}</div>}
            {hi.vehicleNumber && <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>🚗 {hi.vehicleNumber}</div>}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {hi.invoiceNumber && <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: '#dbeafe', color: '#1d4ed8' }}>🧾 {hi.invoiceNumber}</span>}
              {hi.batchNumber   && <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: '#f1f5f9', color: '#475569' }}>📦 {hi.batchNumber}</span>}
              {hasBilling && <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800, background: statusMeta.bg, color: statusMeta.color }}>{statusMeta.icon} {statusMeta.label}</span>}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            {hasBilling ? (
              <><div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>{t.grandTotal}</div><div style={{ fontSize: 22, fontWeight: 900, color: '#1e3a8a' }}>Rs.{fmtAmt(grandTotal)}</div>{balanceDue > 0 && <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 800, marginTop: 2 }}>{t.balanceDue}: Rs.{fmtAmt(balanceDue)}</div>}</>
            ) : (
              <><div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>{t.profit}</div><div style={{ fontSize: 22, fontWeight: 900, color: profit >= 0 ? '#16a34a' : '#dc2626' }}>Rs.{fmtAmt(profit)}</div></>
            )}
          </div>
        </div>
      </div>
      <div style={{ padding: '12px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
          {hasBilling ? (
            <>
              <div style={{ background: '#eff6ff', borderRadius: 10, padding: 10, textAlign: 'center' }}><div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>{t.grandTotal}</div><div style={{ fontSize: 15, fontWeight: 900, color: '#1d4ed8' }}>Rs.{fmtAmt(grandTotal)}</div></div>
              <div style={{ background: '#f0fdf4', borderRadius: 10, padding: 10, textAlign: 'center' }}><div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>{t.amountReceived}</div><div style={{ fontSize: 15, fontWeight: 900, color: '#16a34a' }}>Rs.{fmtAmt(totalPaid)}</div></div>
              <div style={{ background: balanceDue > 0 ? '#fef2f2' : '#ecfdf5', borderRadius: 10, padding: 10, textAlign: 'center' }}><div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>{t.balanceDue}</div><div style={{ fontSize: 15, fontWeight: 900, color: balanceDue > 0 ? '#dc2626' : '#16a34a' }}>Rs.{fmtAmt(balanceDue)}</div></div>
            </>
          ) : (
            <>
              <div style={{ background: '#eff6ff', borderRadius: 10, padding: 10, textAlign: 'center' }}><div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>{t.income}</div><div style={{ fontSize: 15, fontWeight: 900, color: '#1d4ed8' }}>Rs.{fmtAmt(totalIncome)}</div></div>
              <div style={{ background: '#fff1f2', borderRadius: 10, padding: 10, textAlign: 'center' }}><div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>{t.totalCostLabel}</div><div style={{ fontSize: 15, fontWeight: 900, color: '#dc2626' }}>Rs.{fmtAmt(totalCost)}</div></div>
              <div style={{ background: '#f0fdf4', borderRadius: 10, padding: 10, textAlign: 'center' }}><div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>{t.profit}</div><div style={{ fontSize: 15, fontWeight: 900, color: profit >= 0 ? '#16a34a' : '#dc2626' }}>Rs.{fmtAmt(profit)}</div></div>
            </>
          )}
        </div>
        {accountUrl && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <a href={accountUrl} target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: '10px 12px', borderRadius: 10, textAlign: 'center', textDecoration: 'none', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, border: '2px solid #bfdbfe', fontSize: 12 }}>{t.viewAccount}</a>
            <button onClick={copyLink} style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '2px solid #e2e8f0', background: linkCopied ? '#dcfce7' : '#f8fafc', color: linkCopied ? '#16a34a' : '#475569', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>{linkCopied ? t.accountLinkCopied : t.copyAccountLink}</button>
          </div>
        )}
        <button onClick={() => setExpanded(!expanded)} style={{ width: '100%', padding: '10px 0', background: '#f8fafc', border: `1.5px solid ${bizMeta.color}30`, borderRadius: 10, color: bizMeta.color, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          {expanded ? `🔼 ${t.hideDetails}` : `🔽 ${t.viewDetails}`}
        </button>
      </div>
      {expanded && (
        <div style={{ borderTop: '1px solid #e2e8f0', padding: '14px 16px', background: '#fcfcfd' }}>
          {serviceItems.length > 0 && (
            <div style={{ background: '#eff6ff', borderRadius: 12, padding: 10, marginBottom: 12, border: '1px solid #bfdbfe' }}>
              <div style={{ fontWeight: 800, fontSize: 12, color: '#1d4ed8', marginBottom: 8 }}>🔧 {t.services}</div>
              {serviceItems.map((si, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: i < serviceItems.length - 1 ? '1px dashed #bfdbfe' : 'none', fontSize: 13 }}>
                  <span>🔧 {si.name || 'Service'} {nn(si.qty || 1) > 1 ? `× ${nn(si.qty || 1)}` : ''}</span>
                  <span style={{ fontWeight: 800, color: '#1d4ed8' }}>Rs.{fmtAmt(nn(si.qty || 1) * nn(si.rate))}</span>
                </div>
              ))}
            </div>
          )}
          {partsUsed.length > 0 && (
            <div style={{ background: '#faf5ff', borderRadius: 12, padding: 10, marginBottom: 12, border: '1px solid #ddd6fe' }}>
              <div style={{ fontWeight: 800, fontSize: 12, color: '#7c3aed', marginBottom: 8 }}>🔩 {t.parts}</div>
              {partsUsed.map((it, i) => {
                const gross = getProdPartGross(it); const net = getProdPartNet(it); const disc = Math.max(0, gross - net);
                return (
                  <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: i < partsUsed.length - 1 ? '1px dashed #ede9fe' : 'none' }}>
                    <ItemImageBox item={it} size={48} onZoom={setViewImg} />
                    <div style={{ flex: 1 }}>
                      <ItemNamesBlock item={it} size="sm" />
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{nn(it.qty || 1)} × Rs.{fmtAmt(it.sellPrice || it.unitPrice || it.price || 0)}</div>
                      {disc > 0 && <div style={{ fontSize: 10, color: '#dc2626', marginTop: 1 }}>Discount: Rs.{fmtAmt(disc)}</div>}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 900, color: '#16a34a' }}>Rs.{fmtAmt(net)}</div>
                  </div>
                );
              })}
            </div>
          )}
          {outputs.length > 0 && (
            <div style={{ background: '#fffbeb', borderRadius: 12, padding: 10, marginBottom: 12, border: '1px solid #fde68a' }}>
              <div style={{ fontWeight: 800, fontSize: 12, color: '#92400e', marginBottom: 8 }}>🪨 {t.outputDetails}</div>
              {outputs.map((o, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, borderBottom: i < outputs.length - 1 ? '1px dashed #fcd34d' : 'none' }}>
                  <span>{getOutputLabel(bizType, o.product, lang)}</span><span style={{ fontWeight: 800 }}>{nn(o.qty)} {o.unit || ''}</span>
                </div>
              ))}
            </div>
          )}
          {harvests.length > 0 && (
            <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 10, marginBottom: 12, border: '1px solid #bbf7d0' }}>
              <div style={{ fontWeight: 800, fontSize: 12, color: '#166534', marginBottom: 8 }}>🌿 {t.harvestDetails}</div>
              {harvests.map((h, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '4px 0', fontSize: 13, borderBottom: i < harvests.length - 1 ? '1px dashed #bbf7d0' : 'none' }}>
                  <div>{getOutputLabel('cropFarm', h.crop, lang)} — {nn(h.qty)} {h.unit || 'kg'} × Rs.{fmtAmt(h.pricePerUnit)}</div>
                  <div style={{ fontWeight: 800, color: '#16a34a' }}>Rs.{fmtAmt(nn(h.qty) * nn(h.pricePerUnit))}</div>
                </div>
              ))}
            </div>
          )}
          {expenseItems.length > 0 && (
            <div style={{ background: '#fff1f2', borderRadius: 12, padding: 10, marginBottom: 12, border: '1px solid #fecdd3' }}>
              <div style={{ fontWeight: 800, fontSize: 12, color: '#be123c', marginBottom: 8 }}>💸 {t.expenseDetails}</div>
              {expenseItems.map((ex, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '4px 0', fontSize: 13, borderBottom: i < expenseItems.length - 1 ? '1px dashed #fda4af' : 'none' }}>
                  <div><div>{ex.description || ex.itemName || ex.category || 'Expense'}</div>{nn(ex.qty) > 0 && nn(ex.unitPrice) > 0 && <div style={{ fontSize: 10, color: '#64748b' }}>{nn(ex.qty)} × Rs.{fmtAmt(ex.unitPrice)}</div>}</div>
                  <div style={{ fontWeight: 800, color: '#dc2626' }}>Rs.{fmtAmt(getProdExpenseAmount(ex))}</div>
                </div>
              ))}
            </div>
          )}
          {payments.length > 0 && (
            <div style={{ background: '#eff6ff', borderRadius: 12, padding: 10, marginBottom: 12, border: '1px solid #bfdbfe' }}>
              <div style={{ fontWeight: 800, fontSize: 12, color: '#1d4ed8', marginBottom: 8 }}>💳 {t.paymentDetails}</div>
              {payments.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, borderBottom: i < payments.length - 1 ? '1px dashed #bfdbfe' : 'none' }}>
                  <span>{getPayLabel(p.method)}</span><span style={{ fontWeight: 800, color: '#16a34a' }}>Rs.{fmtAmt(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
          {hasBilling && (
            <div style={{ background: 'linear-gradient(135deg,#fff7ed,#fff1f2)', borderRadius: 12, padding: 12, marginBottom: 12, border: '1px solid #fed7aa' }}>
              <div style={{ fontWeight: 800, fontSize: 12, color: '#9a3412', marginBottom: 8 }}>📊 {t.paymentStatus}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}><span>{t.grandTotal}</span><span style={{ fontWeight: 800 }}>Rs.{fmtAmt(grandTotal)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}><span>{t.amountReceived}</span><span style={{ fontWeight: 800, color: '#16a34a' }}>Rs.{fmtAmt(totalPaid)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}><span>{t.balanceDue}</span><span style={{ fontWeight: 800, color: balanceDue > 0 ? '#dc2626' : '#16a34a' }}>Rs.{fmtAmt(balanceDue)}</span></div>
              <div style={{ borderTop: '1px dashed #fdba74', paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span>{t.currentOutstanding}</span><span style={{ fontWeight: 900, color: currentOutstanding > 0 ? '#b91c1c' : '#16a34a' }}>Rs.{fmtAmt(currentOutstanding)}</span>
              </div>
            </div>
          )}
          <button onClick={() => openReceipt(hi)} style={{ width: '100%', background: '#1e3a8a', color: 'white', border: 'none', padding: '11px 0', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>📄 {t.download}</button>
        </div>
      )}
    </div>
  );
};

/* ════════════════════════════════════════
   UNPAID BILL CARD
════════════════════════════════════════ */
const UnpaidBillCard = ({ inv, catalogItems, isSelected, onToggleSelect, onSettle, onReceipt, setViewImg, t, lang }) => {
  const [expanded, setExpanded] = useState(false);
  const net     = nn(inv.netAmount || inv.grandTotal);
  const paid    = nn(inv.payAmount || inv.paidAmount);
  const due     = Math.max(0, net - paid);
  const paidPct = net > 0 ? Math.min(100, Math.round((paid / net) * 100)) : 0;
  const invNo   = inv.invoiceNo || inv.invoiceCode || `INV-${inv.id.slice(0, 8).toUpperCase()}`;
  const dateStr = inv.createdAt?.toDate
    ? inv.createdAt.toDate().toLocaleDateString(lang === 'si' ? 'si-LK' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';
  const items = (inv.items || []).map(it => enrichItem(it, catalogItems));

  return (
    <div style={{ background: 'white', borderRadius: 18, marginBottom: 14, border: isSelected ? '2.5px solid #3b82f6' : '1.5px solid #fecaca', borderLeft: isSelected ? '5px solid #3b82f6' : '5px solid #dc2626', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', background: isSelected ? 'linear-gradient(135deg,#eff6ff,#dbeafe)' : 'linear-gradient(135deg,#fef2f2,#fff1f2)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
          <div onClick={e => { e.stopPropagation(); onToggleSelect(inv); }} style={{ width: 30, height: 30, borderRadius: 8, border: isSelected ? '2.5px solid #3b82f6' : '2.5px solid #cbd5e1', background: isSelected ? '#3b82f6' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', marginTop: 2, boxShadow: isSelected ? '0 2px 8px rgba(59,130,246,0.3)' : 'none' }}>
            {isSelected && <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16, color: isSelected ? '#1d4ed8' : '#991b1b' }}>🧾 {invNo}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>📅 {dateStr} • {items.length} {t.billItems}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 700 }}>{t.billDue}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: isSelected ? '#1d4ed8' : '#dc2626' }}>Rs.{fmtAmt(due)}</div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ marginBottom: 10, marginLeft: 42 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
            <span style={{ color: '#16a34a' }}>✅ {t.billPaid}: Rs.{fmtAmt(paid)}</span>
            <span style={{ color: '#64748b' }}>{paidPct}%</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: '#fee2e2', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${paidPct}%`, borderRadius: 4, background: paidPct >= 50 ? '#16a34a' : '#f59e0b' }} />
          </div>
        </div>
        <div style={{ marginLeft: 42 }}>
          <button onClick={e => { e.stopPropagation(); onSettle(inv); }} style={{ width: '100%', padding: '12px 0', background: 'linear-gradient(135deg,#16a34a,#15803d)', color: 'white', border: 'none', borderRadius: 12, fontWeight: 800, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            💳 {t.settleBill} <span style={{ background: 'rgba(255,255,255,0.2)', padding: '3px 10px', borderRadius: 8, fontSize: 13 }}>Rs.{fmtAmt(due)}</span>
          </button>
        </div>
      </div>
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
            <button onClick={() => onReceipt(inv)} style={{ width: '100%', background: '#1e3a8a', color: 'white', border: 'none', padding: 10, borderRadius: 8, marginTop: 8, fontWeight: 'bold', cursor: 'pointer' }}>📄 {t.download}</button>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════
// Part 2 END — Part 3 continues with Main Component
// ═══════════════════════════════════// ═══════════════════════════════════
// Part 3 — Main Component
// (continues from Part 2 — paste below Part 2 code)
// ═══════════════════════════════════

/* ════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════ */
export default function CustomerPortal({ portalKey: portalKeyProp }) {
  // ★ Support both: prop (from PortalClient) OR useParams
  const params    = useParams();
  const portalKey = portalKeyProp || params?.portalKey || params?.key || '';
  const router    = useRouter();

  const [lang, setLang] = useState('si');
  const t = translations[lang];

  const [customer,      setCustomer     ] = useState(null);
  const [customerId,    setCustomerId   ] = useState(null);
  const [catalogItems,  setCatalogItems ] = useState([]);
  const [shopsList,     setShopsList    ] = useState([]);
  const [selectedShop,  setSelectedShop ] = useState(null);
  const [shopSettings,  setShopSettings ] = useState({});
  const [activeTab,     setActiveTab    ] = useState('shop');
  const [loading,       setLoading      ] = useState(true);
  const [error,         setError        ] = useState(null);
  const [search,        setSearch       ] = useState('');
  const [cart,          setCart         ] = useState([]);
  const [history,       setHistory      ] = useState([]);
  const [showCheckout,  setShowCheckout ] = useState(false);
  const [orderSuccess,  setOrderSuccess ] = useState(false);
  const [placing,       setPlacing      ] = useState(false);
  const [custName,      setCustName     ] = useState('');
  const [custPhone,     setCustPhone    ] = useState('');
  const [viewImg,       setViewImg      ] = useState(null);
  const [contactItem,   setContactItem  ] = useState(null);
  const [currentShopInfo, setCurrentShopInfo] = useState(null);
  const [showPayment,   setShowPayment  ] = useState(false);
  const [bankAccounts,  setBankAccounts ] = useState([]);
  const [unpaidInvoices,setUnpaidInvoices] = useState([]);
  const [settleInvoices,setSettleInvoices] = useState([]);
  const [selectedBillIds,setSelectedBillIds] = useState([]);

  /* ════════════════════════════════════════
     INITIAL LOAD
  ════════════════════════════════════════ */
  useEffect(() => {
    if (!portalKey) { setError(t.notFound); setLoading(false); return; }

    (async () => {
      try {
        const cs = await getDocs(
          query(collection(db, 'customers'), where('portalAccessKey', '==', portalKey))
        );
        if (cs.empty) { setError(t.notFound); setLoading(false); return; }

        const c = { id: cs.docs[0].id, ...cs.docs[0].data() };
        setCustomer(c); setCustomerId(c.id);
        setCustName(c.name || ''); setCustPhone(c.phone || '');

        const [ir, ivr, dr] = await Promise.all([
          getDocs(collection(db, 'items')),
          getDocs(collection(db, 'invoice_settings')),
          getDocs(collection(db, 'shopDirectory')),
        ]);

        const sc = {};
        ir.forEach(d => { const u = d.data().uid; if (u) sc[u] = (sc[u] || 0) + 1; });

        const sm = {};
        ivr.forEach(d => { sm[d.data().uid || d.id] = d.data(); });
        dr.forEach(d => { const u = d.data().uid || d.id; sm[u] = { ...sm[u], ...d.data() }; });
        setShopSettings(sm);

        const shops = Object.keys(sc).map(u => ({
          id: u, uid: u,
          name: sm[u]?.name || sm[u]?.businessName || `Shop #${u.slice(0, 4)}`,
          logo: sm[u]?.logo || null,
          productCount: sc[u] || 0,
        }));
        setShopsList(shops);
        setSelectedShop(shops.find(s => s.uid === c.uid) || shops[0]);
        setLoading(false);
      } catch (e) {
        console.error(e); setError(t.errorOccurred); setLoading(false);
      }
    })();
  }, [portalKey]);

  /* ── Real-time customer balance ── */
  useEffect(() => {
    if (!customerId) return;
    const unsub = onSnapshot(
      doc(db, 'customers', customerId),
      snap => { if (snap.exists()) setCustomer(prev => ({ ...prev, ...snap.data(), id: customerId })); },
      () => {}
    );
    return () => unsub();
  }, [customerId]);

  /* ── Shop info + bank accounts ── */
  useEffect(() => {
    if (!selectedShop?.uid) return;
    (async () => {
      const uid = selectedShop.uid;
      let info = {}, banks = [];
      const cached = shopSettings[uid];
      if (cached) {
        info = { shopName: cached.businessName || cached.shopName || cached.name || '', phone: cached.phone || '' };
        if (cached.bankAccounts) banks = cached.bankAccounts;
      }
      const [isSnap, userSnap, generalSnap] = await Promise.allSettled([
        getDocs(query(collection(db, 'invoice_settings'), where('uid', '==', uid))),
        getDoc(doc(db, 'users', uid)),
        getDoc(doc(db, 'generalSettings', uid)),
      ]);
      if (isSnap.status === 'fulfilled' && !isSnap.value.empty) {
        const d = isSnap.value.docs[0].data();
        if (d.bankAccounts?.length > 0) banks = d.bankAccounts;
        info.shopName = info.shopName || d.businessName || '';
        info.phone    = info.phone    || d.phone || '';
      }
      if (userSnap.status === 'fulfilled' && userSnap.value.exists()) {
        const ud = userSnap.value.data();
        info.shopName = info.shopName || ud.shopName || '';
        info.phone    = info.phone    || ud.phone || ud.mobile || '';
      }
      if (generalSnap.status === 'fulfilled' && generalSnap.value.exists()) {
        const gd = generalSnap.value.data();
        info.shopName = info.shopName || gd.businessName || '';
        info.phone    = info.phone    || gd.phone || '';
        if (gd.bankAccounts?.length > 0 && banks.length === 0) banks = gd.bankAccounts;
      }
      setCurrentShopInfo(info);
      setBankAccounts(banks.filter(b => b.bankName || b.accountNumber));
    })();
  }, [selectedShop?.uid, shopSettings]);

  /* ── Catalog ── */
  useEffect(() => {
    if (!selectedShop) return;
    getDocs(query(collection(db, 'items'), where('uid', '==', selectedShop.uid)))
      .then(s => setCatalogItems(
        s.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => !i.isHidden)
      ));
  }, [selectedShop]);

  /* ── Unpaid invoices ── */
  useEffect(() => {
    if (!customer?.id) return;
    const unsub = onSnapshot(
      query(collection(db, 'invoices'), where('customerId', '==', customer.id)),
      snap => {
        const invoices = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(inv => {
            const net  = nn(inv.netAmount || inv.grandTotal);
            const paid = nn(inv.payAmount || inv.paidAmount);
            return (net - paid) > 0.01 && inv.status !== 'draft';
          })
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setUnpaidInvoices(invoices);
      },
      () => setUnpaidInvoices([])
    );
    return () => unsub();
  }, [customer?.id]);

  /* ── History ── */
  useEffect(() => {
    if (activeTab !== 'history' || !selectedShop?.uid || !customer?.id) return;
    const cleanups = [];
    const ds = { orders: [], payments: [], invoices: [], returns: [], productions: [], trips: [] };

    const updateAll = () => {
      const all = Object.values(ds).flat();
      all.sort((a, b) => {
        const getMs = x => {
          if (x.timestamp && typeof x.timestamp === 'number') return x.timestamp;
          if (x.createdAt?.seconds) return x.createdAt.seconds * 1000;
          if (x.createdAt?.toDate)  return x.createdAt.toDate().getTime();
          if (typeof x.date === 'string') { const d = new Date(x.date); if (!isNaN(d.getTime())) return d.getTime(); }
          return 0;
        };
        return getMs(b) - getMs(a);
      });
      setHistory(all);
    };

    if (customer.phone) {
      cleanups.push(onSnapshot(
        query(collection(db, `shops/${selectedShop.uid}/pfis`), where('customerPhone', '==', customer.phone)),
        snap => { ds.orders = snap.docs.map(d => ({ id: d.id, ...d.data(), type: 'order' })); updateAll(); },
        () => {}
      ));
    }

    cleanups.push(onSnapshot(
      query(collection(db, 'customerTransactions'), where('customerId', '==', customer.id)),
      snap => { ds.payments = snap.docs.map(d => ({ id: d.id, ...d.data(), type: 'payment' })); updateAll(); },
      () => {}
    ));

    cleanups.push(onSnapshot(
      query(collection(db, 'invoices'), where('customerId', '==', customer.id)),
      snap => { ds.invoices = snap.docs.map(d => ({ id: d.id, ...d.data(), type: 'invoice' })); updateAll(); },
      () => {}
    ));

    cleanups.push(onSnapshot(
      query(collection(db, 'returns'), where('customerId', '==', customer.id)),
      snap => { ds.returns = snap.docs.map(d => ({ id: d.id, ...d.data(), type: 'return' })); updateAll(); },
      () => {}
    ));

    cleanups.push(onSnapshot(
      query(collection(db, `users/${selectedShop.uid}/vehicleTrips`), where('customerId', '==', customer.id)),
      snap => { ds.trips = snap.docs.map(d => ({ id: d.id, ...d.data(), type: 'trip' })); updateAll(); },
      () => {}
    ));

    // ★ Production Entries
    cleanups.push(onSnapshot(
      query(collection(db, 'productionEntries'), where('uid', '==', selectedShop.uid)),
      snap => {
        const cName  = norm(customer.name  || '');
        const cPhone = normalizePhone(customer.phone || '');
        const cId    = customer.id || '';
        ds.productions = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(p => {
            if (p.isStandaloneExpense) return false;
            return (
              (portalKey && p.customerPortalKey === portalKey) ||
              (cId    && p.customerId    === cId) ||
              (cName  && norm(p.customerName)   === cName) ||
              (cPhone && normalizePhone(p.customerPhone) === cPhone)
            );
          })
          .map(p => ({ ...p, type: 'production' }));
        updateAll();
      },
      () => { ds.productions = []; updateAll(); }
    ));

    return () => cleanups.forEach(fn => fn && fn());
  }, [activeTab, selectedShop?.uid, customer?.id, customer?.name, customer?.phone, portalKey]);

  /* ── Derived ── */
  const totalOutstanding = useMemo(() =>
    unpaidInvoices.reduce((sum, inv) => {
      const net  = nn(inv.netAmount || inv.grandTotal);
      const paid = nn(inv.payAmount || inv.paidAmount);
      return sum + Math.max(0, net - paid);
    }, 0),
    [unpaidInvoices]
  );

  const selectedBillsTotal = useMemo(() =>
    unpaidInvoices
      .filter(inv => selectedBillIds.includes(inv.id))
      .reduce((sum, inv) => {
        const net  = nn(inv.netAmount || inv.grandTotal);
        const paid = nn(inv.payAmount || inv.paidAmount);
        return sum + Math.max(0, net - paid);
      }, 0),
    [unpaidInvoices, selectedBillIds]
  );

  const selectedBillObjects = useMemo(() =>
    unpaidInvoices.filter(inv => selectedBillIds.includes(inv.id)),
    [unpaidInvoices, selectedBillIds]
  );

  const filtered = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/);
    return catalogItems.filter(i => {
      const tx = [i.name, i.sinhalaName, i.goodsName, i.brandName, i.itemCode, i.barcode]
        .filter(Boolean).join(' ').toLowerCase();
      return terms.every(t => tx.includes(t));
    });
  }, [catalogItems, search]);

  /* ── Cart ── */
  const addToCart    = useCallback(i => setCart(p => {
    const e = p.find(x => x.id === i.id);
    if (e) return p.map(x => x.id === i.id ? { ...x, qty: x.qty + 1 } : x);
    return [...p, { ...i, qty: 1 }];
  }), []);
  const updateCartQty = useCallback((id, q) => {
    if (q <= 0) setCart(p => p.filter(x => x.id !== id));
    else        setCart(p => p.map(x => x.id === id ? { ...x, qty: q } : x));
  }, []);
  const clearCart    = useCallback(() => setCart([]), []);
  const cartTotal    = useMemo(() => cart.reduce((s, i) => s + (nn(i.stock) <= 0 ? 0 : getPriceInfo(i).final * i.qty), 0), [cart]);
  const cartGrossTotal = useMemo(() => cart.reduce((s, i) => s + (nn(i.stock) <= 0 ? 0 : getPriceInfo(i).original * i.qty), 0), [cart]);
  const cartDiscount = cartGrossTotal - cartTotal;

  /* ── Bill actions ── */
  const handleSettleBill       = useCallback(inv => { setSettleInvoices([inv]); setShowPayment(true); }, []);
  const handlePaySelectedBills = useCallback(() => {
    if (selectedBillObjects.length === 0) return;
    setSettleInvoices(selectedBillObjects); setShowPayment(true);
  }, [selectedBillObjects]);
  const handleToggleBillSelect = useCallback(inv => {
    setSelectedBillIds(prev => prev.includes(inv.id) ? prev.filter(id => id !== inv.id) : [...prev, inv.id]);
  }, []);
  const handleSelectAllBills   = useCallback(() => {
    if (selectedBillIds.length === unpaidInvoices.length) setSelectedBillIds([]);
    else setSelectedBillIds(unpaidInvoices.map(inv => inv.id));
  }, [unpaidInvoices, selectedBillIds]);
  const allBillsSelected = unpaidInvoices.length > 0 && selectedBillIds.length === unpaidInvoices.length;

  /* ── Place Order ── */
  const handlePlaceOrder = useCallback(async () => {
    if (!custName.trim() || !custPhone.trim()) { alert(t.detailsRequired); return; }
    if (cart.length === 0) { alert(t.cartEmpty); return; }
    setPlacing(true);
    const oi = cart.map(i => {
      const s = nn(i.stock), p = getPriceInfo(i), o = s <= 0;
      return {
        id: i.id, itemId: i.id, name: i.name || '',
        sinhalaName: i.sinhalaName || '', photoURL: getImg(i),
        uom: getDisplayUnit(i), qty: i.qty,
        originalPrice: o ? 0 : p.original, yourPrice: o ? 0 : p.final,
        lineTotal: o ? 0 : p.final * i.qty, lineDiscount: o ? 0 : p.discAmount * i.qty,
        outOfStock: o,
      };
    });
    const gr = oi.reduce((s, i) => s + nn(i.lineTotal), 0);
    try {
      await addDoc(collection(db, `shops/${selectedShop.uid}/pfis`), {
        customerName: custName.trim(), customerPhone: custPhone.trim(),
        status: 'pending', grandTotal: gr, total: gr,
        createdAt: serverTimestamp(), date: new Date().toISOString(), items: oi,
      });
      setOrderSuccess(true); setCart([]); setShowCheckout(false); setActiveTab('history');
    } catch { alert(t.errorOccurred); }
    finally { setPlacing(false); }
  }, [custName, custPhone, cart, selectedShop, t]);

  /* ── Status key ── */
  const getReturnStatusKey = useCallback(i => {
    if (i.type !== 'return') return i.status || i.type;
    const s = (i.status || '').toLowerCase();
    if (s === 'completed') return 'return_completed';
    if (s === 'pending')   return 'return_pending';
    return 'return';
  }, []);

  /* ── Open Receipt ── */
  const openReceipt = useCallback(inv => {
    const settings   = shopSettings[selectedShop?.uid] || {};
    const isReturn   = inv.type === 'return';
    const isTrip     = inv.type === 'trip';
    const isProduction = inv.type === 'production';
    const enrich = arr => (arr || []).map(it => {
      const cat = findCatalogMatch(catalogItems, it);
      return cat ? { ...cat, ...it } : it;
    });
    const ei = { ...inv, items: enrich(inv.items), partsUsed: enrich(inv.partsUsed), cargoItems: enrich(inv.cargoItems) };

    let totalVal = 0, paidVal = 0, dueVal = 0;
    if (isReturn)      { const rt = calculateReturnTotals(ei); totalVal = rt.displayTotal; paidVal = totalVal; dueVal = 0; }
    else if (isTrip)   { totalVal = nn(ei.totalBillAmount); paidVal = nn(ei.paidAmount); dueVal = Math.max(0, totalVal - paidVal); }
    else if (isProduction) { totalVal = nn(ei.grandTotal || ei.totalIncome); paidVal = nn(ei.totalPaid || getPaymentsTotal(ei.payments)); dueVal = nn(ei.balanceDue || Math.max(0, totalVal - paidVal)); }
    else               { totalVal = nn(ei.netAmount || ei.grandTotal); paidVal = nn(ei.paidAmount || ei.payAmount); dueVal = totalVal - paidVal; }

    const shopName = selectedShop?.name || '';
    const buildRows = items => items.map(it => {
      const pi = getHistoryItemPrices(it); const n = getAllItemNames(it);
      return `<div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid #f1f5f9"><div style="flex:1"><div style="font-weight:700;font-size:13px">${n.primary}</div><div style="font-size:11px;color:#64748b">${pi.qty} × Rs.${fmtAmt(pi.finalPrice)}</div></div><div style="font-weight:800;font-size:14px">Rs.${fmtAmt(pi.lineTotal)}</div></div>`;
    }).join('');

    const serviceRows = (ei.serviceItems || []).map(si =>
      `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9"><span>🔧 ${si.name || ''}</span><span style="font-weight:800">Rs.${fmtAmt(nn(si.qty || 1) * nn(si.rate))}</span></div>`
    ).join('');

    const partRows = (ei.partsUsed || []).map(it => {
      const n = getAllItemNames(it); const net = getProdPartNet(it);
      return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9"><span>🔩 ${n.primary}</span><span style="font-weight:800;color:#16a34a">Rs.${fmtAmt(net)}</span></div>`;
    }).join('');

    const itemRows = buildRows(ei.items || []);
    const refNo    = (ei.invoiceNo || ei.invoiceNumber || ei.returnNo || ei.id?.slice(-6) || '').toString().toUpperCase();
    const dateStr  = formatPortalDate(ei.date || ei.createdAt, lang);

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;background:#f1f5f9}.r{max-width:420px;margin:0 auto;background:white;min-height:100vh;padding:16px}</style></head><body><div class="r"><div style="text-align:center;padding:16px;background:#1e3a8a;color:white;border-radius:12px;margin-bottom:16px"><h2>${settings.businessName || shopName}</h2><div style="font-size:12px;margin-top:4px">#${refNo} • ${dateStr}</div></div>${ei.customerName ? `<div style="padding:10px;background:#f8fafc;border-radius:8px;margin-bottom:12px"><strong>👤 ${ei.customerName}</strong>${ei.vehicleNumber ? `<div style="font-size:12px;margin-top:3px">🚗 ${ei.vehicleNumber}</div>` : ''}</div>` : ''}${serviceRows}${partRows}${itemRows}<div style="margin-top:16px;padding-top:12px;border-top:2px solid #0f172a"><div style="display:flex;justify-content:space-between;font-size:18px;font-weight:900;color:#059669"><span>${t.grandTotal}</span><span>Rs.${fmtAmt(totalVal)}</span></div></div><div style="display:flex;gap:8px;margin-top:12px"><div style="flex:1;background:#f0fdf4;padding:10px;border-radius:10px;text-align:center"><div style="font-size:11px;color:#64748b">✅ ${t.paid}</div><div style="font-size:16px;font-weight:900;color:#16a34a">Rs.${fmtAmt(paidVal)}</div></div><div style="flex:1;background:#fef2f2;padding:10px;border-radius:10px;text-align:center"><div style="font-size:11px;color:#64748b">⚠️ ${t.due}</div><div style="font-size:16px;font-weight:900;color:#dc2626">Rs.${fmtAmt(dueVal)}</div></div></div></div></body></html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  }, [shopSettings, selectedShop, t, lang, catalogItems]);

  const balance = nn(customer?.currentBalance);

  /* ════════════════════════════════════════
     LOADING / ERROR
  ════════════════════════════════════════ */
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: 'Arial, sans-serif' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 40, height: 40, border: '4px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
      <p style={{ color: '#64748b', marginTop: 16 }}>{t.loading}</p>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: 'Arial, sans-serif', padding: 20, textAlign: 'center' }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>❌</div>
      <h2 style={{ color: '#dc2626', margin: '0 0 10px' }}>{error}</h2>
    </div>
  );

  /* ════════════════════════════════════════
     RENDER
  ════════════════════════════════════════ */
  return (
    <div style={{ maxWidth: 500, margin: '0 auto', background: '#f8fafc', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', overflowX: 'hidden', boxSizing: 'border-box' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

      {/* Modals */}
      {contactItem && <ContactPhoneModal item={contactItem} shopInfo={currentShopInfo} onClose={() => setContactItem(null)} t={t} />}

      {showPayment && (
        <PaymentModal
          customer={customer} selectedShop={selectedShop}
          bankAccounts={bankAccounts} unpaidInvoices={unpaidInvoices}
          preSelectedInvoices={settleInvoices}
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

      {/* ══ HEADER ══ */}
      <div style={{ background: '#1e3a8a', color: 'white', padding: '25px 20px 20px', textAlign: 'center', borderBottomLeftRadius: 25, borderBottomRightRadius: 25, position: 'relative' }}>
        <button onClick={() => setLang(lang === 'si' ? 'en' : 'si')} style={{ position: 'absolute', top: 15, right: 15, background: 'rgba(255,255,255,.2)', border: 'none', color: 'white', padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          {t.langSwitch}
        </button>
        <h2 style={{ margin: 0, fontSize: 18 }}>{customer?.name}</h2>
        <div style={{ marginTop: 10, fontSize: 26, fontWeight: 900, color: balance > 0 ? '#fca5a5' : '#86efac' }}>
          Rs. {fmtAmt(balance)}
        </div>
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
            <button onClick={() => { setSettleInvoices([]); setShowPayment(true); }} style={{ width: '100%', marginTop: 10, padding: '10px 0', background: 'linear-gradient(135deg,#16a34a,#15803d)', color: 'white', border: '2px solid rgba(255,255,255,0.3)', borderRadius: 12, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
              💳 {t.makePayment}
            </button>
          </div>
        )}

        {unpaidInvoices.length === 0 && balance > 0 && (
          <button onClick={() => { setSettleInvoices([]); setShowPayment(true); }} style={{ marginTop: 12, padding: '10px 28px', background: 'linear-gradient(135deg,#16a34a,#15803d)', color: 'white', border: '2px solid rgba(255,255,255,0.3)', borderRadius: 14, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
            💳 {t.makePayment}
          </button>
        )}
      </div>

      {/* ══ TABS ══ */}
      <div style={{ display: 'flex', background: 'white', marginTop: -15, borderRadius: 15, boxShadow: '0 5px 15px rgba(0,0,0,.1)', overflow: 'hidden', position: 'relative', zIndex: 10 }}>
        {[
          { id: 'shop',      label: t.orderTab },
          { id: 'bills',     label: `${t.billsTab}${unpaidInvoices.length > 0 ? ` (${unpaidInvoices.length})` : ''}` },
          { id: 'history',   label: t.accountTab },
          { id: 'directory', label: t.shopsTab },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flex: 1, padding: '13px 4px', border: 'none', background: activeTab === tab.id ? (tab.id === 'bills' && unpaidInvoices.length > 0 ? '#dc2626' : '#3b82f6') : 'white', color: activeTab === tab.id ? 'white' : tab.id === 'bills' && unpaidInvoices.length > 0 ? '#dc2626' : '#64748b', fontWeight: 'bold', fontSize: 11, cursor: 'pointer' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══ TAB CONTENT ══ */}
      <div style={{ padding: 15, paddingBottom: selectedBillIds.length > 0 && activeTab === 'bills' ? 160 : 120 }}>

        {/* ─── BILLS TAB ─── */}
        {activeTab === 'bills' && (
          <div>
            {unpaidInvoices.length > 0 && (
              <>
                <div style={{ background: 'linear-gradient(135deg,#991b1b,#dc2626)', borderRadius: 18, padding: '18px 20px', marginBottom: 16, color: 'white', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>🧾 {t.totalOutstanding}</div>
                  <div style={{ fontSize: 34, fontWeight: 900, marginTop: 4, fontFamily: 'monospace' }}>Rs. {fmtAmt(totalOutstanding)}</div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{unpaidInvoices.length} {t.unpaidBills}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '10px 14px', background: 'white', borderRadius: 14, border: '1.5px solid #e2e8f0' }}>
                  <button onClick={handleSelectAllBills} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 10, border: allBillsSelected ? '2px solid #f87171' : '2px solid #3b82f6', background: allBillsSelected ? '#fef2f2' : '#eff6ff', color: allBillsSelected ? '#dc2626' : '#1d4ed8', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                    <div style={{ width: 22, height: 22, borderRadius: 6, border: allBillsSelected ? '2px solid #dc2626' : '2px solid #3b82f6', background: allBillsSelected ? '#dc2626' : selectedBillIds.length > 0 ? '#3b82f6' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {allBillsSelected
                        ? <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        : selectedBillIds.length > 0 ? <div style={{ width: 8, height: 2, background: 'white', borderRadius: 1 }} /> : null}
                    </div>
                    {allBillsSelected ? t.deselectAll : t.selectAll}
                  </button>
                  {selectedBillIds.length > 0 && (
                    <div style={{ padding: '6px 12px', borderRadius: 8, background: '#3b82f6', color: 'white', fontSize: 12, fontWeight: 800 }}>
                      {selectedBillIds.length} / {unpaidInvoices.length}
                    </div>
                  )}
                </div>
              </>
            )}

            {unpaidInvoices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#16a34a', marginBottom: 8 }}>{t.allPaid}</div>
                <div style={{ fontSize: 14, color: '#64748b' }}>{t.noBills}</div>
              </div>
            ) : unpaidInvoices.map(inv => (
              <UnpaidBillCard
                key={inv.id} inv={inv} catalogItems={catalogItems}
                isSelected={selectedBillIds.includes(inv.id)}
                onToggleSelect={handleToggleBillSelect}
                onSettle={handleSettleBill} onReceipt={openReceipt}
                setViewImg={setViewImg} t={t} lang={lang}
              />
            ))}
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

        {/* ─── SHOP TAB ─── */}
        {activeTab === 'shop' && (
          <>
            <input type="text" placeholder={t.search} value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0', boxSizing: 'border-box', outline: 'none', fontSize: 15, marginBottom: 20, background: 'white' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {filtered.map(item => {
                const p   = getPriceInfo(item);
                const du  = getDisplayUnit(item);
                const oos = nn(item.stock) <= 0;
                const ic  = cart.find(x => x.id === item.id);
                return (
                  <div key={item.id} style={{ background: 'white', borderRadius: 15, overflow: 'hidden', border: ic ? '2px solid #3b82f6' : '1px solid #e2e8f0' }}>
                    <div style={{ height: 130, padding: 10, background: '#fafbfc', position: 'relative', cursor: 'zoom-in', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setViewImg(getImg(item))}>
                      <img src={getImg(item)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={e => { e.target.src = defaultImg; }} />
                      {!oos && p.hasDisc && <div style={{ position: 'absolute', top: 6, right: 6, background: '#dc2626', color: 'white', padding: '3px 8px', borderRadius: 8, fontSize: 10, fontWeight: 800 }}>-{p.discPct}%</div>}
                      {ic && <div style={{ position: 'absolute', top: 6, left: 6, background: '#3b82f6', color: 'white', padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 800 }}>🛒 {ic.qty}</div>}
                    </div>
                    <div style={{ padding: '10px 12px 12px' }}>
                      <ItemNamesBlock item={item} />
                      <div style={{ marginTop: 8 }}>
                        {!oos ? (
                          <>
                            {p.hasDisc && <div style={{ marginBottom: 2 }}><span style={{ fontSize: 10, color: '#94a3b8', textDecoration: 'line-through' }}>Rs. {fmtAmt(p.original)}</span><span style={{ fontSize: 9, fontWeight: 800, color: '#dc2626', background: '#fef2f2', padding: '1px 4px', borderRadius: 3, marginLeft: 4 }}>-{p.discPct}%</span></div>}
                            <div style={{ fontSize: 16, fontWeight: 900, color: '#059669' }}>Rs. {fmtAmt(p.final)}</div>
                            {p.hasDisc && <div style={{ fontSize: 9, color: '#16a34a', fontWeight: 600 }}>💰 {t.saving} Rs. {fmtAmt(p.discAmount)}</div>}
                            {du && <div style={{ fontSize: 9, color: '#94a3b8' }}>{t.perUnit} {du}</div>}
                          </>
                        ) : (
                          <button onClick={e => { e.stopPropagation(); setContactItem(item); }} style={{ width: '100%', background: '#3b82f6', border: 'none', borderRadius: 8, padding: '8px 7px', cursor: 'pointer' }}>
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
                      ) : (!oos && (
                        <button onClick={() => addToCart(item)} style={{ width: '100%', marginTop: 8, background: '#3b82f6', color: 'white', border: 'none', padding: 9, borderRadius: 10, fontWeight: 'bold', fontSize: 11, cursor: 'pointer' }}>🛒 {t.addToCart}</button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ─── HISTORY TAB ─── */}
        {activeTab === 'history' && (
          <div>
            {history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 50, color: '#94a3b8' }}>{t.noOrders}</div>
            ) : history.map(hi => {
              const isPay  = hi.type === 'payment';
              const isTrip = hi.type === 'trip';
              const isRet  = hi.type === 'return';
              const isProd = hi.type === 'production';

              if (isTrip) return <TripCard key={hi.id} hi={hi} t={t} lang={lang} catalogItems={catalogItems} setViewImg={setViewImg} openReceipt={openReceipt} customer={customer} />;
              if (isProd) return <ProductionEntryCard key={hi.id} hi={hi} t={t} lang={lang} catalogItems={catalogItems} setViewImg={setViewImg} openReceipt={openReceipt} customer={customer} />;

              const sk = getReturnStatusKey(hi);
              const s  = STATUS_STYLE[sk] || STATUS_STYLE[hi.status] || STATUS_STYLE[hi.type] || STATUS_STYLE.pending;
              const rawItems = isRet ? (hi.items || []) : (hi.items || hi.partsUsed || []);
              const allItems = rawItems.map(it => enrichItem(it, catalogItems));
              const txImage  = getTransactionImage(hi);

              let totalVal, paidVal;
              if (isRet) { const rt = calculateReturnTotals(hi); totalVal = rt.displayTotal; paidVal = 0; }
              else { totalVal = nn(hi.netAmount || hi.grandTotal); paidVal = nn(hi.paidAmount || hi.payAmount || hi.totalPaid); }

              let calcDisc = 0;
              if (!isRet) allItems.forEach(it => { calcDisc += getHistoryItemPrices(it).lineDiscount; });
              const discVal = isRet ? 0 : (calcDisc > 0 ? calcDisc : nn(hi.totalDiscount));
              const dueVal  = totalVal - paidVal;
              const hasDue  = !isPay && !isRet && dueVal > 0.01;

              return (
                <div key={hi.id} style={{ background: 'white', borderRadius: 16, padding: 14, marginBottom: 12, border: '1px solid #e2e8f0', borderLeft: `5px solid ${s.color}`, boxSizing: 'border-box', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 'bold' }}>
                      {hi.createdAt?.toDate ? hi.createdAt.toDate().toLocaleString() : (hi.date || '')}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 'bold', padding: '3px 8px', borderRadius: 6, background: s.bg, color: s.color }}>
                      {s.icon} {lang === 'si' ? (s.labelSi || s.label) : s.label}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {allItems.filter(it => it.goodsName || it.name || it.sinhalaName).map((it, idx) => {
                      const pi = getHistoryItemPrices(it);
                      return (
                        <div key={idx} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
                          <ItemImageBox item={it} size={52} onZoom={setViewImg} isReturn={isRet} />
                          <div style={{ flex: 1 }}>
                            <ItemNamesBlock item={it} size="sm" isReturn={isRet} />
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                              {pi.qty} × {pi.hasDiscount
                                ? (<><span style={{ textDecoration: 'line-through', color: '#94a3b8' }}>Rs.{fmtAmt(pi.originalPrice)}</span> <span style={{ color: '#059669', fontWeight: 700 }}>Rs.{fmtAmt(pi.finalPrice)}</span></>)
                                : `Rs.${fmtAmt(pi.originalPrice)}`}
                            </div>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 'bold' }}>Rs.{fmtAmt(pi.lineTotal)}</div>
                        </div>
                      );
                    })}

                    {!isPay && discVal > 0 && (
                      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#16a34a', fontWeight: 700, background: '#dcfce7', padding: '4px 8px', borderRadius: 6 }}>
                          <span>💰 {t.youSaved}:</span><span>Rs.{fmtAmt(discVal)}</span>
                        </div>
                      </div>
                    )}

                    {!isPay && (
                      <div style={{ background: '#f8fafc', padding: 8, borderRadius: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#059669', fontWeight: 'bold' }}><span>{t.paid}:</span><span>Rs.{fmtAmt(paidVal)}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#dc2626', fontWeight: 'bold', marginTop: 2 }}><span>{t.due}:</span><span>Rs.{fmtAmt(dueVal)}</span></div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button onClick={() => openReceipt(hi)} style={{ flex: 1, background: '#1e3a8a', color: 'white', border: 'none', padding: 10, borderRadius: 8, fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>📄 {t.download}</button>
                          {hasDue && <button onClick={() => handleSettleBill(hi)} style={{ flex: 1, background: 'linear-gradient(135deg,#16a34a,#15803d)', color: 'white', border: 'none', padding: 10, borderRadius: 8, fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>💳 {t.settleBill}</button>}
                        </div>
                      </div>
                    )}
                  </div>

                  {isPay && (
                    <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontSize: 13, color: '#16a34a', fontWeight: 'bold' }}>💰 {hi.note || t.payment}</div>
                      {hi.invoiceNo && (
                        <div style={{ display: 'inline-flex', padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd', width: 'fit-content' }}>🧾 {hi.invoiceNo}</div>
                      )}
                      {hi.invoiceNos && hi.invoiceNos.length > 1 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {hi.invoiceNos.map((invNo, idx) => (
                            <span key={idx} style={{ padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>🧾 {invNo}</span>
                          ))}
                        </div>
                      )}
                      <div style={{ display: 'inline-flex', padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: hi.status === 'approved' ? '#dcfce7' : hi.status === 'rejected' ? '#fef2f2' : '#fefce8', color: hi.status === 'approved' ? '#16a34a' : hi.status === 'rejected' ? '#dc2626' : '#a16207', border: `1.5px solid ${hi.status === 'approved' ? '#86efac' : hi.status === 'rejected' ? '#fca5a5' : '#fde68a'}`, width: 'fit-content' }}>
                        {hi.status === 'approved' ? t.paymentApproved : hi.status === 'rejected' ? t.paymentRejected : t.paymentPending}
                      </div>
                      {hi.status === 'rejected' && hi.rejectReason && (
                        <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#991b1b' }}>
                          <strong>{t.rejectReason}:</strong> {hi.rejectReason}
                        </div>
                      )}
                      {txImage && (
                        <div onClick={() => setViewImg(txImage)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, cursor: 'pointer', width: 'fit-content' }}>
                          <div style={{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden', border: '1px solid #86efac' }}>
                            <img src={txImage} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#166534' }}>{t.viewReceipt}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>#{hi.id.slice(-6).toUpperCase()}</span>
                    <span style={{ fontSize: 16, fontWeight: 900, color: isPay ? '#16a34a' : '#1e3a8a' }}>
                      {isPay ? '-' : '+'} Rs.{fmtAmt(hi.netAmount || hi.grandTotal || nn(hi.totalBillAmount) || hi.amount)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── DIRECTORY TAB ─── */}
        {activeTab === 'directory' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {shopsList.map(s => (
              <div key={s.id} onClick={() => { setSelectedShop(s); setActiveTab('shop'); }} style={{ background: 'white', padding: 15, borderRadius: 16, display: 'flex', alignItems: 'center', gap: 15, border: selectedShop?.uid === s.uid ? '2px solid #3b82f6' : '1px solid #e2e8f0', cursor: 'pointer' }}>
                <div style={{ width: 50, height: 50, background: '#f1f5f9', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {s.logo ? <img src={s.logo} style={{ width: '100%' }} alt="" /> : <span style={{ fontSize: 24 }}>🏪</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'bold', fontSize: 15 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: '#3b82f6', fontWeight: 'bold' }}>{s.productCount} {t.itemsCount}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══ CART BAR ══ */}
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

      {/* ══ CHECKOUT MODAL ══ */}
      {showCheckout && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: 'white', width: '100%', maxWidth: 500, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '24px 20px', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <h3 style={{ marginTop: 0 }}>{t.confirmOrder}</h3>
            <div style={{ background: '#f8fafc', borderRadius: 12, padding: 12, marginBottom: 16, border: '1px solid #e2e8f0' }}>
              {cart.map((ci, idx) => {
                const p = getPriceInfo(ci); const o = nn(ci.stock) <= 0;
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
            <input placeholder={t.customerName} value={custName} onChange={e => setCustName(e.target.value)} style={{ width: '100%', padding: 14, marginBottom: 10, borderRadius: 12, border: '1px solid #ddd', boxSizing: 'border-box', fontSize: 14 }} />
            <input placeholder={t.customerPhone} value={custPhone} onChange={e => setCustPhone(e.target.value)} style={{ width: '100%', padding: 14, marginBottom: 20, borderRadius: 12, border: '1px solid #ddd', boxSizing: 'border-box', fontSize: 14 }} />
            <button onClick={handlePlaceOrder} disabled={placing} style={{ width: '100%', background: '#059669', color: 'white', padding: 16, borderRadius: 14, fontWeight: 'bold', border: 'none', fontSize: 15, opacity: placing ? 0.6 : 1, cursor: placing ? 'wait' : 'pointer' }}>
              {placing ? '⏳...' : t.placeOrder}
            </button>
            <button onClick={() => setShowCheckout(false)} style={{ width: '100%', background: 'none', border: 'none', marginTop: 12, color: '#ef4444', fontWeight: 'bold', fontSize: 14, cursor: 'pointer' }}>{t.cancelOrder}</button>
          </div>
        </div>
      )}

      {/* ══ ORDER SUCCESS ══ */}
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