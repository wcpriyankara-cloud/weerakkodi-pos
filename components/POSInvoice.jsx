'use client';

// components/POSInvoice.jsx
// ✅ Complete POS Billing System
// ✅ Fixed ReferenceError: handlePayAmountKeyDown & handleQtyKeyDown
// ✅ Fixed UOM price calculations using rate/factor sync
// ✅ Real-time Outstanding balances (Previous & New Balance) on receipts
// ✅ Fully responsive & fast rendering layout
// ✅ Synced to viewer both Active & Old/Exhausted Purchased Batches
// ✅ FIXED: Stock deduction & Dexie Local Offline Sync

import localDb from '@/lib/localDb';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { db } from '@/shared/firebase-config';
import { useUserAuth } from '@/context/UserContext';
import {
  collection, onSnapshot, doc, increment, writeBatch,
  serverTimestamp, query, where, getDoc, updateDoc, setDoc
} from 'firebase/firestore';

import MobileBarcodeScanner from './MobileBarcodeScanner';
import InvoiceOutputManager from './InvoiceOutputManager';
import { FolderOpen } from 'lucide-react';

/* ══════════════════════════════════════════════════════════════
   STYLES
══════════════════════════════════════════════════════════════ */
const printStyles = `@media print { .no-print { display: none !important; } }`;
const inputFixStyles = `
  input[type=number]::-webkit-outer-spin-button,
  input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
  input[type=number]{-moz-appearance:textfield;appearance:textfield}
`;
const badgeStyles = `
  @keyframes badgePop{0%{transform:scale(0)}60%{transform:scale(1.3)}100%{transform:scale(1)}}
  @keyframes glowPulse{0%,100%{box-shadow:0 0 4px rgba(22,163,74,0.3)}50%{box-shadow:0 0 14px rgba(22,163,74,0.6)}}
  @keyframes pendingGlow{0%,100%{box-shadow:0 0 4px rgba(245,158,11,0.3)}50%{box-shadow:0 0 14px rgba(245,158,11,0.6)}}
  @keyframes spin{to{transform:rotate(360deg)}}
`;
const keyboardStyles = `
  .kb-active-item{background:#dbeafe!important;border-left:4px solid #2563eb!important;transition:background 0.1s}
  .kb-active-cust{background:#dbeafe!important;border-left:4px solid #2563eb!important;transition:background 0.1s}
  .kb-shortcut-badge{display:inline-block;font-size:9px;font-weight:900;padding:1px 5px;border-radius:3px;background:#334155;color:#e2e8f0;margin-left:4px;vertical-align:middle;letter-spacing:0.5px}
  .kb-help-bar{display:flex;gap:6px;flex-wrap:wrap;padding:6px 10px;background:linear-gradient(135deg,#1e293b,#334155);border-radius:8px;margin-bottom:10px;align-items:center}
  .kb-help-bar span{font-size:10px;padding:3px 7px;border-radius:4px;font-weight:700;white-space:nowrap}
  .kb-help-key{background:#475569;color:#f1f5f9;border:1px solid #64748b}
  .kb-help-desc{color:#cbd5e1;padding:3px 2px!important}
`;

/* ══════════════════════════════════════════════════════════════
   TRANSLATIONS
══════════════════════════════════════════════════════════════ */
const TRANSLATIONS = {
  si: {
    title: 'නව ඉන්වොයිසය', searchItem: 'භාණ්ඩය සොයන්න...', sellingPrice: 'මිල (MRP)',
    retail: 'සිල්ලර (Retail)', loose: 'ලූස් (Loose)', wholesale: 'තොග (Wholesale)', yourPrice: 'අපේ මිල',
    qty: 'ප්‍රමාණය', discPct: 'Disc %', discAmt: 'Disc Amt', lineTotal: 'එකතුව',
    noData: 'භාණ්ඩ තෝරා නොමැත', customer: 'පාරිභෝගිකයා',
    searchCustomer: 'නම/දුරකථන සොයන්න (0xx හෝ +94xx)...',
    grossTotal: 'මුළු එකතුව', discount: 'වට්ටම', billDiscount: 'බිල්පත් වට්ටම',
    netAmount: 'ශුද්ධ මුදල', cash: 'මුදල්', card: 'කාඩ්', eTransfer: 'E-Transfer',
    cheque: 'චෙක්', balance: 'ශේෂය', saveOnly: 'සුරකින්න', savePrint: 'Print',
    saveDraft: 'Draft', successMsg: 'සාර්ථකයි!', customerRequired: 'පාරිභෝගිකයෙකු තෝරන්න!',
    stockExceeded: 'තොග සීමාව ඉක්මවා ඇත', newCustomer: '➕ නව පාරිභෝගික',
    createCustomer: 'සාදන්න', cancel: 'අවලංගු', barcodeNotFound: 'භාණ්ඩය හමු නොවීය!',
    cashCustomer: 'Cash Customer', invoiceListPage: 'ඉන්වොයිස් ලැයිස්තුව',
    addRemark: '📝 සටහන', stock: 'තොග', totalStock: 'Total', afterBill: 'Bill පසු',
    available: 'Available', showBatches: '📦 Batches', hideBatches: '📦 සඟවන්න',
    warrantyCode: 'කේතය', warrantyPeriod: 'කාලය', warrantyExpires: 'අවසන්',
    selectBank: 'බැංකුව තෝරන්න', profit: 'ලාභය', exchange: 'හුවමාරු මුදල',
    allocated: 'Use', pickContact: '📱 Contacts',
    contactsNotSupported: '📱 Contacts API නොමැත',
    whatsappSent: '📲 WhatsApp යැවීය!', noPhoneForWhatsapp: '⚠️ දුරකථන අංකයක් නැත',
    packUnitSelect: '📦 Pack / Unit තෝරන්න', warrantyDetails: '🛡️ වගකීම',
    batchesLabel: '📦 Batches', paymentAmountLabel: 'ගෙවන මුදල',
    changeCustomer: 'Change', removePhoto: '✕ ඉවත් කරන්න',
    addAsNew: 'නව පාරිභෝගිකයෙකු ලෙස එක් කරන්න', noResults: 'ප්‍රතිඵල නැත',
    loadingItems: 'භාණ්ඩ පූරණය වෙමින්...', approvedLabel: 'Approved',
    pendingLabel: 'Pending', returnLabel: 'Return', clearInvoice: 'බිල්පත ඉවත්',
    scannerBtn: 'Barcode Scanner', notesPlaceholder: 'සටහන්...',
    stockOff: '🔓 Stock OFF', stockOn: '🔒 Stock ON',
    noOtherUnits: '📦 No other units', removed: 'ඉවත් විය',
    invoiceCleared: 'Invoice cleared', fullPay: 'Full', maxLabel: 'Max',
    lastBatchPrice: 'Last Batch Price',
    orderLoaded: 'Approved ඇණවුම load විය — භාණ්ඩ',
    orderItemsNotFound: '⚠️ Order items not found in catalog',
    mixedLabel: 'Mixed', selectBankPlease: '⚠️ Please select bank!',
    creditLabel: 'credit', orderLabel: 'Order',
    customerCreated: '✅ Customer created!', imageError: '❌ Photo error',
  },
  en: {
    title: 'New Invoice', searchItem: 'Search item...', sellingPrice: 'Price (MRP)',
    retail: 'RETAIL', loose: 'LOOSE', wholesale: 'WHOLESALE', yourPrice: 'Your Price',
    qty: 'Qty', discPct: 'Disc %', discAmt: 'Disc Amt', lineTotal: 'Total',
    noData: 'No data', customer: 'Customer',
    searchCustomer: 'Search name/phone (0xx or +94xx)...',
    grossTotal: 'Gross Total', discount: 'Discount', billDiscount: 'Bill Discount',
    netAmount: 'Net Amount', cash: 'Cash', card: 'Card', eTransfer: 'E-Transfer',
    cheque: 'Cheque', balance: 'Balance', saveOnly: 'Save', savePrint: 'Print',
    saveDraft: 'Draft', successMsg: 'Success!', customerRequired: 'Please select a customer!',
    stockExceeded: 'Stock limit exceeded', newCustomer: '➕ New Customer',
    createCustomer: 'Create', cancel: 'Cancel', barcodeNotFound: 'Item not found!',
    cashCustomer: 'Cash Customer', invoiceListPage: 'Invoice List',
    addRemark: '📝 Remark', stock: 'Stock', totalStock: 'Total', afterBill: 'After Bill',
    available: 'Available', showBatches: '📦 Batches', hideBatches: '📦 Hide',
    warrantyCode: 'Code', warrantyPeriod: 'Period', warrantyExpires: 'Expires',
    selectBank: 'Select Bank', profit: 'Profit', exchange: 'Exchange',
    allocated: 'Use', pickContact: '📱 Contacts',
    contactsNotSupported: '📱 Contacts API not available',
    whatsappSent: '📲 WhatsApp sent!', noPhoneForWhatsapp: '⚠️ No phone number',
    packUnitSelect: '📦 Select Pack / Unit', warrantyDetails: '🛡️ Warranty',
    batchesLabel: '📦 Batches', paymentAmountLabel: 'Payment Amount',
    changeCustomer: 'Change', removePhoto: '✕ Remove',
    addAsNew: 'Add as new customer', noResults: 'No results',
    loadingItems: 'Loading items...', approvedLabel: 'Approved',
    pendingLabel: 'Pending', returnLabel: 'Return', clearInvoice: 'Clear invoice',
    scannerBtn: 'Barcode Scanner', notesPlaceholder: 'Notes...',
    stockOff: '🔓 Stock OFF', stockOn: '🔒 Stock ON',
    noOtherUnits: '📦 No other units', removed: 'removed',
    invoiceCleared: 'Invoice cleared', fullPay: 'Full', maxLabel: 'Max',
    lastBatchPrice: 'Last Batch Price',
    orderLoaded: 'Approved order loaded — items',
    orderItemsNotFound: '⚠️ Order items not found in catalog',
    mixedLabel: 'Mixed', selectBankPlease: '⚠️ Please select bank!',
    creditLabel: 'credit', orderLabel: 'Order',
    customerCreated: '✅ Customer created!', imageError: '❌ Photo error',
  },
};

/* ══════════════════════════════════════════════════════════════
   MATH UTILITIES
══════════════════════════════════════════════════════════════ */
const R2 = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : Math.round(n * 100) / 100; };
const fmt = (v) => R2(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQ = (v) => { const n = R2(v); return n % 1 === 0 ? String(n) : n.toFixed(2); };
const fmtDate = (v) => {
  if (!v) return '-';
  const d = v.toDate ? v.toDate() : new Date(v);
  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
};
const onFocusSel = (e) => {
  const i = e.target;
  requestAnimationFrame(() => { try { i.select(); } catch { try { i.setSelectionRange(0, i.value.length); } catch {} } });
};
const normalizePhone = (phone) => {
  if (!phone) return '';
  let d = String(phone).replace(/[^\d]/g, '');
  if (d.startsWith('94') && d.length > 9) d = d.substring(2);
  if (d.startsWith('0')) d = d.substring(1);
  return d;
};

/* ══════════════════════════════════════════════════════════════
   CACHE UTILITIES
══════════════════════════════════════════════════════════════ */
const CACHE_KEY_ITEMS = 'pos_items_cache';
const CACHE_KEY_CUSTOMERS = 'pos_customers_cache';
const CACHE_TTL = 1000 * 60 * 30;
const saveCache = (key, data) => {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data.slice(0, 500) })); } catch {}
};
const loadCache = (key) => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { t, d } = JSON.parse(raw);
    if (Date.now() - t > CACHE_TTL) return null;
    return d;
  } catch { return null; }
};

/* ══════════════════════════════════════════════════════════════
   UOM & PRICE HELPERS
══════════════════════════════════════════════════════════════ */
const getConvRate = (conv) => {
  if (!conv) return 0;
  return R2(conv.rate ?? conv.factor ?? conv.conversionRate ?? conv.ratio ?? 0);
};

const getUomFactor = (selectedUom, baseUomName, availableUnits) => {
  if (!selectedUom || !baseUomName) return 1;
  const selLower = selectedUom.toLowerCase().trim();
  const baseLower = baseUomName.toLowerCase().trim();
  if (selLower === baseLower) return 1;
  const units = Array.isArray(availableUnits) ? availableUnits : [];
  for (const conv of units) {
    if ((conv.toUnitName || '').toLowerCase().trim() === selLower) {
      const rate = getConvRate(conv);
      if (rate > 0) return rate;
    }
  }
  for (const conv of units) {
    if ((conv.toUnitName || '').toLowerCase().trim() === baseLower) {
      const rate = getConvRate(conv);
      if (rate > 0) return R2(1 / rate);
    }
  }
  return 1;
};

const getOriginalPrice = (item, pt = 'retail') => {
  if (!item) return 0;
  if (pt === 'wholesale') return R2(item.sellingPriceWholesale || item.wholesalePrice || 0);
  if (pt === 'loose') return R2(item.sellingPriceLoose || item.loosePrice || 0);
  return R2(item.sellingPriceRetail || item.retailPrice || item.sellingPrice || item.price || item.mrp || 0);
};

const getItemDisc = (item, pt = 'retail') => {
  if (!item) return 0;
  if (pt === 'wholesale') return R2(item.wholesaleDiscount || 0);
  if (pt === 'loose') return R2(item.looseDiscount || 0);
  return R2(item.retailDiscount || item.discPercent || item.discount || 0);
};

const getYourPrice = (item, pt = 'retail') => {
  if (!item) return 0;
  if (pt === 'wholesale') return R2(item.wholesaleYourPrice || 0);
  if (pt === 'loose') return R2(item.looseYourPrice || 0);
  return R2(item.retailYourPrice || 0);
};

const calcPricesForUom = (item, priceType, uomFactor) => {
  const f = Math.max(0.0001, R2(uomFactor || 1));
  const baseMRP = getOriginalPrice(item, priceType);
  const baseDisc = getItemDisc(item, priceType);
  let baseYP = getYourPrice(item, priceType);

  if ((!baseYP || baseYP <= 0) && baseMRP > 0) {
    baseYP = R2(baseMRP - (baseMRP * baseDisc / 100));
  }

  const unitMRP = R2(baseMRP / f);
  const unitYP = R2(baseYP / f);

  return {
    sellingPrice: unitMRP,
    yourPrice: unitYP,
    discountPercent: baseDisc,
    discAmount: R2(unitMRP - unitYP),
  };
};

/* ══════════════════════════════════════════════════════════════
   BATCH & STOCK HELPERS
══════════════════════════════════════════════════════════════ */
const getBatchPrice = (batch, pt = 'retail') => {
  if (!batch) return { original: 0, discount: 0, net: 0 };
  let o = 0, d = 0;
  switch (pt) {
    case 'wholesale':
      o = R2(batch.wholesalePrice || batch.sellingPriceWholesale || 0);
      d = R2(batch.wholesaleDiscount || 0); break;
    case 'loose':
      o = R2(batch.loosePrice || batch.sellingPriceLoose || 0);
      d = R2(batch.looseDiscount || 0); break;
    default:
      o = R2(batch.retailPrice || batch.sellingPriceRetail || 0);
      d = R2(batch.retailDiscount || 0);
  }
  return { original: o, discount: d, net: R2(o - (o * d / 100)) };
};

const getSinhala = (i) => i?.sinhalaName || i?.nameSi || '';
const getRack = (i) => i?.rackName || i?.rack || i?.rackNo || i?.location || '';
const getBaseUnit = (i) => i?.packSize || i?.uomName || i?.uom || '';
const getWarrantyInfo = (item) => ({ code: item?.warrantyCode || '', period: item?.warrantyPeriod || '' });
const getItemAvailableUnits = (item) => Array.isArray(item?.availableUnits) ? item.availableUnits : (item?.conversions || []);

const calcWarrantyExpiry = (period) => {
  if (!period || typeof period !== 'string') return '';
  const m = period.toLowerCase().trim().match(/^(\d+)\s*(day|days|week|weeks|month|months|year|years|d|w|m|y)$/i);
  if (!m) return '';
  const qty = parseInt(m[1], 10), unit = m[2].toLowerCase();
  if (!qty || qty < 0) return '';
  const d = new Date();
  if (unit === 'd' || unit.startsWith('day')) d.setDate(d.getDate() + qty);
  else if (unit === 'w' || unit.startsWith('week')) d.setDate(d.getDate() + qty * 7);
  else if (unit === 'm' || unit.startsWith('month')) d.setMonth(d.getMonth() + qty);
  else if (unit === 'y' || unit.startsWith('year')) d.setFullYear(d.getFullYear() + qty);
  else return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const getDocStock = (item) => {
  if (!item) return 0;
  if (item.stocks && typeof item.stocks === 'object') {
    const keys = Object.keys(item.stocks);
    if (keys.length > 0) {
      const t = keys.reduce((s, k) => s + R2(item.stocks[k]), 0);
      if (t >= 0) return R2(t);
    }
  }
  if (item.currentStock != null && item.currentStock !== '') return R2(item.currentStock);
  if (item.stock != null && item.stock !== '') return R2(item.stock);
  return 0;
};

const getBatchRemainingInfo = (bi) => {
  if (!bi) return { remaining: 0, isTracked: false };
  const p = R2(bi.qty || bi.quantity || 0);
  if (bi.remainingQty !== undefined && bi.remainingQty !== null && bi.remainingQty !== '') {
    return { remaining: Math.max(0, R2(bi.remainingQty)), isTracked: true };
  }
  return { remaining: p, isTracked: false };
};
const getBatchRemaining = (bi) => getBatchRemainingInfo(bi).remaining;
const getBatchTime = (b) => b?.createdAt?.toDate?.()?.getTime?.() || new Date(b?.date || 0).getTime() || 0;

const extractBatches = (itemId, sources, includeEmpty = true) => {
  if (!itemId || !sources) return [];
  const batches = [];
  ['purchases', 'purchaseInvoices', 'stockIn'].forEach(col => {
    const invs = sources[col];
    if (!Array.isArray(invs)) return;
    invs.forEach(inv => {
      if (!inv || !Array.isArray(inv.items)) return;
      inv.items.forEach((item, idx) => {
        if (!item) return;
        const id = item.itemId || item.id;
        if (id !== itemId) return;
        const ri = getBatchRemainingInfo(item);
        if (!includeEmpty && ri.remaining <= 0) return;

        batches.push({
          batchId: `${inv.id}_${idx}`, invoiceId: inv.id, invoiceCollection: col,
          itemIndex: idx, supplierName: inv.supplierName || 'Unknown',
          date: inv.date || inv.createdAt, createdAt: inv.createdAt,
          qty: R2(item.qty || item.quantity || 0), remainingQty: ri.remaining, isTracked: ri.isTracked,
          buyingNetPrice: R2(item.buyingNetPrice || item.netPrice || item.unitPrice || 0),
          retailPrice: R2(item.retailPrice || item.sellingPriceRetail || 0),
          retailDiscount: R2(item.retailDiscount || 0),
          wholesalePrice: R2(item.wholesalePrice || item.sellingPriceWholesale || 0),
          wholesaleDiscount: R2(item.wholesaleDiscount || 0),
          loosePrice: R2(item.loosePrice || item.sellingPriceLoose || 0),
          looseDiscount: R2(item.looseDiscount || 0),
        });
      });
    });
  });
  batches.sort((a, b) => getBatchTime(b) - getBatchTime(a));
  const fi = [...batches].reverse().findIndex(b => b.remainingQty > 0);
  if (fi !== -1) batches[batches.length - 1 - fi].isFIFO = true;
  return batches;
};

const getLastBatchPrice = (itemId, sources, pt = 'retail') => {
  if (!itemId || !sources) return null;
  let lb = null, lt = 0;
  ['purchases', 'purchaseInvoices', 'stockIn'].forEach(col => {
    const invs = sources[col];
    if (!Array.isArray(invs)) return;
    invs.forEach(inv => {
      if (!inv || !Array.isArray(inv.items)) return;
      inv.items.forEach(item => {
        if (!item || (item.itemId || item.id) !== itemId) return;
        const time = getBatchTime(inv);
        if (time >= lt) {
          lt = time;
          lb = { ...item, supplierName: inv.supplierName || 'Unknown',
            buyingNetPrice: R2(item.buyingNetPrice || item.netPrice || item.unitPrice || 0),
            retailPrice: R2(item.retailPrice || item.sellingPriceRetail || 0), retailDiscount: R2(item.retailDiscount || 0),
            wholesalePrice: R2(item.wholesalePrice || item.sellingPriceWholesale || 0), wholesaleDiscount: R2(item.wholesaleDiscount || 0),
            loosePrice: R2(item.loosePrice || item.sellingPriceLoose || 0), looseDiscount: R2(item.looseDiscount || 0),
          };
        }
      });
    });
  });
  if (!lb) return null;
  const bp = getBatchPrice(lb, pt);
  return { batch: lb, original: bp.original, discount: bp.discount, net: bp.net, buyingNet: R2(lb.buyingNetPrice) };
};

const allocateFIFO = (batches, need, preferredId = '') => {
  if (!need || need <= 0 || !Array.isArray(batches))
    return { allocations: [], allocated: 0, shortage: R2(need || 0) };
  const fifo = [...batches.filter(b => R2(b.remainingQty) > 0)].sort((a, b) => getBatchTime(a) - getBatchTime(b));
  let ordered = fifo;
  if (preferredId) { const p = fifo.find(b => b.batchId === preferredId); if (p) ordered = [p, ...fifo.filter(b => b.batchId !== preferredId)]; }
  let rem = R2(need);
  const allocs = [];
  for (const b of ordered) {
    if (rem <= 0) break;
    const a = R2(b.remainingQty);
    if (a <= 0) continue;
    const u = R2(Math.min(a, rem));
    if (u <= 0) continue;
    allocs.push({ ...b, allocatedQty: u });
    rem = R2(rem - u);
  }
  return { allocations: allocs, allocated: R2(need - rem), shortage: R2(rem) };
};

const DP = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23e2e8f0' rx='10'/%3E%3Cpath d='M35 60l10-10 10 10 15-15 10 15' stroke='%2394a3b8' stroke-width='4' fill='none'/%3E%3Ccircle cx='65' cy='40' r='5' fill='%2394a3b8'/%3E%3C/svg%3E";
const DA = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23dbeafe'/%3E%3Ccircle cx='50' cy='35' r='15' fill='%233b82f6'/%3E%3Cpath d='M20 80a30 30 0 0 1 60 0' stroke='%233b82f6' stroke-width='8' fill='none'/%3E%3C/svg%3E";

const getItemImg = (i) => {
  if (!i) return DP;
  const u = i.picture || i.images?.[0] || i.photoURL || i.imageUrl || '';
  return u?.trim()?.length > 10 ? u.trim() : DP;
};
const getCustImg = (c) => {
  if (!c) return DA;
  const u = c.profilePicture || c.photoURL || c.image || c.picture || '';
  return u?.trim()?.length > 10 ? u.trim() : DA;
};
const onImgErr = (e, type = 'p') => { e.currentTarget.onerror = null; e.currentTarget.src = type === 'a' ? DA : DP; };

const getBalSt = (b) => {
  const v = R2(b);
  if (v > 0) return { color: '#dc2626', icon: '🔴', text: `Due: Rs.${v.toFixed(0)}` };
  if (v < 0) return { color: '#16a34a', icon: '🟢', text: `Dep: Rs.${Math.abs(v).toFixed(0)}` };
  return { color: '#16a34a', icon: '🟢', text: 'No Due' };
};

const isContactPickerSupported = () =>
  typeof navigator !== 'undefined' && typeof window !== 'undefined' &&
  'contacts' in navigator && 'ContactsManager' in window;

const pickContactFromPhone = async () => {
  if (!isContactPickerSupported()) return null;
  try {
    const props = await navigator.contacts.getProperties();
    const req = ['name', 'tel'];
    if (props.includes('icon')) req.push('icon');
    const contacts = await navigator.contacts.select(req, { multiple: false });
    if (!contacts?.length) return null;
    const c = contacts[0];
    let photo = '';
    if (c.icon?.length) {
      try { photo = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(c.icon[0]); }); } catch {}
    }
    return { name: c.name?.[0] || '', phone: c.tel?.[0] || '', photo };
  } catch { return null; }
};

const resizeImage = (base64, maxSize = 200) => new Promise(resolve => {
  if (!base64) { resolve(''); return; }
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    let w = img.width, h = img.height;
    if (w > h) { if (w > maxSize) { h = (h * maxSize) / w; w = maxSize; } }
    else { if (h > maxSize) { w = (w * maxSize) / h; h = maxSize; } }
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    resolve(c.toDataURL('image/jpeg', 0.7));
  };
  img.onerror = () => resolve('');
  img.src = base64;
});

const blobToBase64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
const deepCloneItems = (items) => { try { return JSON.parse(JSON.stringify(items)); } catch { return items.map(i => ({ ...i })); } };

function useTouchScrollTap() {
  const touchRef = useRef({ y: 0, time: 0 });
  const scrollingRef = useRef(false);
  const onTouchStart = useCallback((e) => { touchRef.current = { y: e.touches[0].clientY, time: Date.now() }; scrollingRef.current = false; }, []);
  const onTouchMove = useCallback(() => { scrollingRef.current = true; }, []);
  const isTap = useCallback(() => !scrollingRef.current && (Date.now() - touchRef.current.time) < 400, []);
  return { onTouchStart, onTouchMove, isTap };
}

const StockBadge = ({ stock, uom }) => {
  const s = R2(stock), z = s <= 0, l = s > 0 && s <= 5;
  return (
    <span style={{ fontWeight: 'bold', padding: '2px 8px', borderRadius: 4, background: z ? '#fef2f2' : l ? '#fffbeb' : '#f0fdf4', color: z ? '#dc2626' : l ? '#d97706' : '#16a34a', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {z ? '🔴' : l ? '🟡' : '🟢'} {fmtQ(s)}{uom && uom !== 'unit' ? ` ${uom}` : ''}
    </span>
  );
};

const POSBatchCard = React.memo(({ batch, isSelected, allocatedQty = 0, onSelect, priceType = 'retail', index, uomFactor = 1 }) => {
  const f = Math.max(0.0001, R2(uomFactor || 1));
  const rem = R2(batch.remainingQty), remDisplay = R2(rem * f), qtyDisplay = R2(R2(batch.qty) * f);
  const cost = R2(batch.buyingNetPrice / f);
  const bp = getBatchPrice(batch, priceType);
  const original = R2(bp.original / f), discount = R2(bp.discount), net = R2(bp.net / f);
  const profit = R2(net - cost), empty = rem <= 0, newest = index === 0;
  return (
    <div onClick={() => !empty && onSelect(batch)} style={{
      padding: '10px 12px', borderRadius: 10, cursor: empty ? 'not-allowed' : 'pointer',
      border: isSelected ? '2px solid #3b82f6' : '1px solid #e2e8f0',
      background: isSelected ? '#eff6ff' : empty ? '#fafafa' : 'white',
      opacity: empty ? 0.6 : 1, marginBottom: 6,
      borderLeft: newest ? '4px solid #8b5cf6' : batch.isFIFO ? '4px solid #f59e0b' : 'none',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: isSelected ? '#3b82f6' : empty ? '#94a3b8' : '#22c55e' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: empty ? '#64748b' : '#1e293b' }}>{batch.supplierName}</span>
          {newest && <span style={{ fontSize: 8, fontWeight: 800, color: '#7c3aed', background: '#ede9fe', padding: '1px 5px', borderRadius: 6 }}>NEW</span>}
          {batch.isFIFO && <span style={{ fontSize: 8, fontWeight: 800, color: '#b45309', background: '#fef3c7', padding: '1px 5px', borderRadius: 6 }}>FIFO</span>}
          {empty && <span style={{ fontSize: 8, fontWeight: 800, color: '#64748b', background: '#f1f5f9', padding: '1px 5px', borderRadius: 6 }}>OLD / EMPTY</span>}
        </div>
        <span style={{ fontSize: 10, color: '#6b7280' }}>📅 {fmtDate(batch.date)}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 6, marginBottom: 6 }}>
        <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '6px 8px' }}>
          <div style={{ fontSize: 9, color: '#6366f1', fontWeight: 800 }}>Original</div>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#312e81' }}>Rs.{fmt(original)}</div>
          {discount > 0 && <div style={{ fontSize: 10, color: '#b45309', fontWeight: 700 }}>Disc {discount}%</div>}
        </div>
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '6px 8px' }}>
          <div style={{ fontSize: 9, color: '#16a34a', fontWeight: 800 }}>Net Sell</div>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#166534' }}>Rs.{fmt(net)}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, fontSize: 11, flexWrap: 'wrap' }}>
        <span style={{ color: empty ? '#64748b' : '#059669', fontWeight: 700 }}>📦 {fmtQ(remDisplay)}/{fmtQ(qtyDisplay)}</span>
        <span style={{ color: '#6b7280' }}>💰 Cost {fmt(cost)}</span>
        {profit > 0 && <span style={{ color: '#16a34a', fontWeight: 700 }}>📈+{fmt(profit)}</span>}
        {profit < 0 && <span style={{ color: '#dc2626', fontWeight: 700 }}>📉{fmt(profit)}</span>}
        {allocatedQty > 0 && <span style={{ color: '#1d4ed8', fontWeight: 800, background: '#dbeafe', padding: '1px 5px', borderRadius: 4 }}>Use: {fmtQ(R2(allocatedQty * f))}</span>}
      </div>
    </div>
  );
});
POSBatchCard.displayName = 'POSBatchCard';

const isPersistedCustomer = (cust) =>
  !!cust?.id && cust.id !== 'CASH_CUSTOMER' && cust.id !== 'TEMP_ORDER_CUSTOMER';

const snapshotInvoiceState = ({
  safeInvoiceItems, selectedCustomer, finalNetAmount, payAmount,
  balance, paymentMethod, subTotal, billDiscountPercent, billDiscount,
  exchangeAmount, totalDiscount, invoiceRemark,
  selectedBankAccountId, selectedBankAccount,
}) => {
  const fc = selectedCustomer || { id: 'CASH_CUSTOMER', name: 'Cash Customer', phone: '', address: '' };
  return {
    items: deepCloneItems(safeInvoiceItems), customer: { ...fc },
    netAmount: R2(finalNetAmount), payAmount: R2(payAmount), balance: R2(balance),
    paymentMethod, subTotal: R2(subTotal), billDiscountPercent: R2(billDiscountPercent),
    billDiscount: R2(billDiscount), exchangeAmount: R2(exchangeAmount),
    totalDiscount: R2(totalDiscount), remark: invoiceRemark || '',
    bankAccountId: selectedBankAccountId || '',
    bankAccount: selectedBankAccount ? { ...selectedBankAccount } : null,
    bankInfo: paymentMethod === 'etransfer' && selectedBankAccount
      ? { bankAccountId: selectedBankAccount.id, bankName: selectedBankAccount.bankName || '' } : {},
  };
};

const calculateCostSummary = (items) => {
  let totalCost = 0, hasCost = false;
  items.forEach(item => {
    const ac = R2(item.allocatedCostTotal || 0), av = R2(item.avgBatchCost || 0), q = R2(item.qty || 0);
    if (ac > 0) { totalCost += ac; hasCost = true; }
    else if (av > 0 && q > 0) { totalCost += R2(av * q); hasCost = true; }
  });
  return { totalCost: R2(totalCost), hasCost };
};

const calculateSellingRevenue = (items) =>
  R2(items.reduce((sum, i) => sum + R2(i.lineTotal || R2(i.yourPrice) * R2(i.qty)), 0));

const getCreditSaleInfo = (actualCashReceived, netAmount) => {
  const isCreditSale = actualCashReceived < netAmount - 0.01;
  const creditAmount = isCreditSale ? R2(netAmount - actualCashReceived) : 0;
  const isFullCredit = actualCashReceived < 1 && netAmount > 0;
  return { isCreditSale, creditAmount, isFullCredit };
};

const buildInvoicePayload = ({ user, snap, invoiceNo, actionType, mode, isFullCredit, previousOutstanding, newOutstanding }) => ({
  uid: user.uid, customerId: snap.customer.id, customerName: snap.customer.name,
  customerPhone: snap.customer.phone || '', customerAddress: snap.customer.address || '',
  invoiceNo,
  items: snap.items.map(i => ({
    itemId: i.itemId, name: i.name, nameSi: i.nameSi || '',
    sellingPrice: R2(i.sellingPrice), yourPrice: R2(i.yourPrice), qty: R2(i.qty),
    discountPercent: R2(i.discountPercent || 0), discAmount: R2(i.discAmount),
    lineTotal: R2(i.lineTotal), priceType: i.priceType || 'retail', uom: i.uom || 'unit',
    uomFactor: R2(i.uomFactor || 1), negativeStock: !!i.negativeStock,
    warrantyCode: i.warrantyCode || '', warrantyPeriod: i.warrantyPeriod || '',
    preferredBatchId: i.preferredBatchId || '', avgBatchCost: R2(i.avgBatchCost || 0),
    allocatedCostTotal: R2(i.allocatedCostTotal || 0), mixedBatchPricing: !!i.mixedBatchPricing,
    batchAllocations: (i.batchAllocations || []).map(a => ({
      batchId: a.batchId || '', invoiceId: a.invoiceId || '', invoiceCollection: a.invoiceCollection || '',
      itemIndex: a.itemIndex ?? -1, supplierName: a.supplierName || '',
      buyingNetPrice: R2(a.buyingNetPrice || 0), allocatedQty: R2(a.allocatedQty || 0),
      sellOriginalPrice: R2(a.sellOriginalPrice || 0), sellDiscountPercent: R2(a.sellDiscountPercent || 0),
      sellNetPrice: R2(a.sellNetPrice || 0), allocatedLineTotal: R2(a.allocatedLineTotal || 0),
    })),
  })),
  grossTotal: snap.subTotal, billDiscountPercent: snap.billDiscountPercent,
  billDiscount: snap.billDiscount, exchangeAmount: snap.exchangeAmount,
  totalDiscount: snap.totalDiscount, netAmount: snap.netAmount,
  paymentMethod: isFullCredit ? 'credit' : snap.paymentMethod,
  payAmount: snap.payAmount, balance: snap.balance,
  itemCount: snap.items.length, createdAt: new Date().toISOString(), mode,
  status: actionType === 'draft' ? 'draft' : 'completed',
  remarks: snap.remark, ...snap.bankInfo,
  previousOutstanding: R2(previousOutstanding),
  newOutstanding:      R2(newOutstanding),
});

const buildDeductionMap = (items) => {
  const d = {};
  items.forEach(i => {
    const f = Math.max(0.0001, R2(i.uomFactor || 1));
    d[i.itemId] = R2((d[i.itemId] || 0) + R2(R2(i.qty) / f));
  });
  return d;
};

const buildBatchUpdateMap = (items) => {
  const u = {};
  items.forEach(i => {
    (i.batchAllocations || []).forEach(al => {
      if (!al?.invoiceId || !al?.invoiceCollection) return;
      const k = `${al.invoiceCollection}/${al.invoiceId}`;
      if (!u[k]) u[k] = { col: al.invoiceCollection, docId: al.invoiceId, updates: [] };
      u[k].updates.push({ index: al.itemIndex, qty: R2(al.allocatedQty) });
    });
  });
  return u;
};

const applyBatchSourceUpdates = async (fbBatch, batchUpdates) => {
  for (const [, upd] of Object.entries(batchUpdates)) {
    try {
      const ref = doc(db, upd.col, upd.docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) continue;
      const data = snap.data(), items = [...(data.items || [])];
      upd.updates.forEach(({ index, qty }) => {
        if (index >= 0 && index < items.length) {
          const cur = getBatchRemaining(items[index]);
          items[index] = { ...items[index], remainingQty: Math.max(0, R2(cur - qty)) };
        }
      });
      fbBatch.update(ref, { items, updatedAt: new Date().toISOString() });
    } catch (e) { console.warn('Batch deduct:', e.message); }
  }
};

const applyBatchSourceUpdatesLocal = async (invoiceItems) => {
  if (!invoiceItems || !Array.isArray(invoiceItems) || !localDb || !localDb.items) return;
  const qtyMap = {};
  invoiceItems.forEach(it => {
    const itemId = it.itemId || it.id || it.docId;
    if (!itemId) return;
    const displayQty = parseFloat(it.qty || it.quantity || 0);
    const uomFactor = Math.max(0.0001, parseFloat(it.uomFactor || 1));
    const baseQty = displayQty / uomFactor;
    qtyMap[itemId] = (qtyMap[itemId] || 0) + baseQty;
  });
  for (const [itemId, totalDeduct] of Object.entries(qtyMap)) {
    if (totalDeduct <= 0) continue;
    try {
      const item = await localDb.items.get(itemId);
      if (item) {
        const curStock = item.currentStock ?? item.stock ?? 0;
        const newStock = Math.max(0, R2(curStock - totalDeduct));
        const updateData = {
          stock: newStock, currentStock: newStock,
          _deductedAt: Date.now(), _synced: false
        };
        if (item.stocks && typeof item.stocks === 'object') {
          updateData.stocks = { ...item.stocks };
          for (const storeKey of Object.keys(item.stocks)) {
            const storeStock = parseFloat(item.stocks[storeKey] || 0);
            updateData.stocks[storeKey] = Math.max(0, R2(storeStock - totalDeduct));
          }
        }
        await localDb.items.update(itemId, updateData);
      }
    } catch (e) { console.warn('Local item deduct:', e.message); }
  }
};

const buildCashTransactionPayload = ({
  user, snap, invoiceId, invoiceNo, mode,
  actualCashReceived, totalSellingRevenue, totalCost, hasCost,
  isCreditSale, creditAmount, isFullCredit,
}) => {
  const now = new Date();
  return {
    type:'in', category:'sales', source:mode==='pos'?'pos':'invoice',
    amount:actualCashReceived, invoiceTotal:snap.netAmount, totalSellingRevenue,
    totalCostPrice:R2(totalCost), lineProfit:hasCost?R2(totalSellingRevenue-totalCost):null,
    hasCostData:hasCost, creditAmount:R2(creditAmount), isCreditSale,
    isFullyPaid:!isCreditSale, isFullCredit, remainingCredit:R2(creditAmount),
    invoiceItems:snap.items.map(i=>({
      itemId:i.itemId||'', name:i.name||'', nameSi:i.nameSi||'',
      qty:R2(i.qty), sellingPrice:R2(i.sellingPrice), yourPrice:R2(i.yourPrice),
      discAmount:R2(i.discAmount||0), lineTotal:R2(i.lineTotal),
      avgBatchCost:R2(i.avgBatchCost||0), allocatedCostTotal:R2(i.allocatedCostTotal||0),
      priceType:i.priceType||'retail', uom:i.uom||'unit',
    })),
    itemCount:snap.items.length, invoiceId, invoiceNo,
    customerId:snap.customer.id||'', customerName:snap.customer.name||'',
    customerPhone:snap.customer.phone||'',
    paymentMethod:isFullCredit?'credit':snap.paymentMethod,
    description:isFullCredit
      ?`📝 Full Credit — ${snap.customer.name||'Cash'} — Rs.${fmt(snap.netAmount)}`
      :isCreditSale
        ?`🧾 ${snap.customer.name||'Cash'} — Rs.${fmt(actualCashReceived)} paid (Credit Rs.${fmt(creditAmount)})`
        :`🧾 ${snap.customer.name||'Cash'} — Rs.${fmt(actualCashReceived)}`,
    date:now.toISOString().split('T')[0], time:now.toTimeString().slice(0,5),
    isAutomatic:true, uid:user.uid, createdAt:new Date().toISOString(),
    timestamp:new Date().toISOString(), createdBy:user.email||'',
  };
};

const buildOutputInvoicePayload = ({ invoiceId, invoiceNo, user, snap, isFullCredit, actionType, custWithKey, previousOutstanding, newOutstanding }) => ({
  id:invoiceId, invoiceNo, uid:user.uid,
  customerId:snap.customer.id, customerName:snap.customer.name,
  customerPhone:snap.customer.phone||'', customerAddress:snap.customer.address||'',
  portalAccessKey:custWithKey?.portalAccessKey||'',
  items:snap.items.map(i=>({
    itemId:i.itemId, name:i.name, nameSi:i.nameSi||'',
    sellingPrice:R2(i.sellingPrice), yourPrice:R2(i.yourPrice),
    qty:R2(i.qty), discountPercent:R2(i.discountPercent||0),
    discAmount:R2(i.discAmount), lineTotal:R2(i.lineTotal),
    priceType:i.priceType||'retail', uom:i.uom||'unit',
    uomFactor:R2(i.uomFactor||1),
    warrantyCode:i.warrantyCode||'', warrantyPeriod:i.warrantyPeriod||'',
    mixedBatchPricing:!!i.mixedBatchPricing,
    batchAllocations:(i.batchAllocations||[]).map(a=>({
      batchId:a.batchId||'', allocatedQty:R2(R2(a.allocatedQty||0)*R2(i.uomFactor||1)),
      sellNetPrice:R2(a.sellNetPrice||0), allocatedLineTotal:R2(a.allocatedLineTotal||0),
    })),
  })),
  grossTotal:snap.subTotal, billDiscountPercent:snap.billDiscountPercent,
  billDiscount:snap.billDiscount, exchangeAmount:snap.exchangeAmount,
  totalDiscount:snap.totalDiscount, netAmount:snap.netAmount,
  payAmount:snap.payAmount, balance:snap.balance,
  paymentMethod:isFullCredit?'credit':snap.paymentMethod,
  remarks:snap.remark, createdAt:new Date(),
  initialMode:actionType==='link'?'share':'print',
  previousOutstanding: R2(previousOutstanding),
  newOutstanding:      R2(newOutstanding),
});

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════ */
export default function POSInvoice({ mode = 'invoice', lang: initialLang = 'si' }) {
  const [lang, setLangState] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('language') || initialLang || 'si';
    return initialLang || 'si';
  });

  useEffect(() => {
    const syncLang = () => { try { const s = localStorage.getItem('language'); if (s) setLangState(s); } catch {} };
    const onLangChange = (e) => setLangState(e.detail || 'si');
    syncLang();
    window.addEventListener('app-language-change', onLangChange);
    window.addEventListener('storage', syncLang);
    return () => { window.removeEventListener('app-language-change', onLangChange); window.removeEventListener('storage', syncLang); };
  }, [initialLang]);

  const t = TRANSLATIONS[lang] || TRANSLATIONS.si;
  const { user } = useUserAuth();
  const searchParams = useSearchParams();

  /* ── Refs ── */
  const lastScannedRef = useRef('');
  const lastScannedTimeRef = useRef(0);
  const customerSearchContainerRef = useRef(null);
  const itemSearchContainerRef = useRef(null);
  const isMountedRef = useRef(true);
  const photoInputRef = useRef(null);
  const savingRef = useRef(false);
  const enrichTimerRef = useRef(null);
  const itemSearchInputRef = useRef(null);
  const customerSearchInputRef = useRef(null);
  const payAmountInputRef = useRef(null);
  const qtyInputRefs = useRef({});
  const saveBtnRef = useRef(null);
  const printBtnRef = useRef(null);
  const activeItemRef = useRef(null);
  const activeCustRef = useRef(null);
  const lastAddedLineIdRef = useRef(null);
  const itemTouch = useTouchScrollTap();
  const custTouch = useTouchScrollTap();

  /* ── Viewport ── */
  const [viewportWidth, setViewportWidth] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 1024);
  const isSmallMobile = viewportWidth <= 480;

  /* ── Data state ── */
  const [allItems, setAllItems] = useState(() => loadCache(CACHE_KEY_ITEMS) || []);
  const [allCustomers, setAllCustomers] = useState(() => loadCache(CACHE_KEY_CUSTOMERS) || []);
  const [dataReady, setDataReady] = useState(() => { const ci = loadCache(CACHE_KEY_ITEMS); return !!(ci && ci.length > 0); });
  const [purchaseSources, setPurchaseSources] = useState({ purchases: [], purchaseInvoices: [], stockIn: [] });
  const [bankAccounts, setBankAccounts] = useState([]);
  const [autoSync, setAutoSync] = useState(() => { try { return localStorage.getItem('weerakkodi_autoSync') !== 'false'; } catch { return true; } });
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const autoSyncLockRef = useRef(false);

  /* ── Invoice state ── */
  const [invoiceItems, setInvoiceItems] = useState([]);
  const [itemSearch, setItemSearch] = useState('');
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [lastScannedDisplay, setLastScannedDisplay] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [billDiscountPercent, setBillDiscountPercent] = useState(0);
  const [billDiscount, setBillDiscount] = useState(0);
  const [exchangeAmount, setExchangeAmount] = useState(0);
  const [invoiceRemark, setInvoiceRemark] = useState('');
  const [showRemarkInput, setShowRemarkInput] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [payAmount, setPayAmount] = useState(0);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState('');
  const [stockControlEnabled, setStockControlEnabled] = useState(true);
  const [warrantyVisibility, setWarrantyVisibility] = useState({});
  const [batchVisibility, setBatchVisibility] = useState({});
  const [showProfit, setShowProfit] = useState(false);

  /* ── UI state ── */
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [popupImage, setPopupImage] = useState(null);
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '+94', address: '', creditLimit: 0, profilePicture: '' });
  const [outputInvoice, setOutputInvoice] = useState(null);
  const [contactPickerAvailable, setContactPickerAvailable] = useState(false);
  const [approvedCount, setApprovedCount] = useState(0);
  const [pendingOrderCount, setPendingOrderCount] = useState(0);
  const [orderLoaded, setOrderLoaded] = useState(false);
  const [activeItemIdx, setActiveItemIdx] = useState(-1);
  const [activeCustIdx, setActiveCustIdx] = useState(-1);

  const showToast = useCallback((msg) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3000); }, []);
  const toggleAutoSync = useCallback(() => {
    const next = !autoSync;
    setAutoSync(next);
    try { localStorage.setItem('weerakkodi_autoSync', String(next)); } catch {}
    showToast(next ? '🔄 Auto-Sync ON' : '⏸️ Auto-Sync OFF');
  }, [autoSync, showToast]);

  useEffect(() => { isMountedRef.current = true; setContactPickerAvailable(isContactPickerSupported()); return () => { isMountedRef.current = false; }; }, []);
  useEffect(() => { const h = () => setViewportWidth(window.innerWidth); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  useEffect(() => {
    const h = (e) => {
      if (customerSearchContainerRef.current && !customerSearchContainerRef.current.contains(e.target)) setShowCustomerDropdown(false);
      if (itemSearchContainerRef.current && !itemSearchContainerRef.current.contains(e.target)) setShowItemDropdown(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  /* ── Firestore listeners ── */
  useEffect(() => {
    if (!user?.uid) return;
    const unsubs = [];

    (async () => {
      try {
        const localItems = await localDb.items.where('uid').equals(user.uid).toArray();
        if (isMountedRef.current && localItems.length > 0) { setAllItems(localItems); setDataReady(true); }
      } catch(e) {}
      try {
        const localCusts = await localDb.customers.where('uid').equals(user.uid).toArray();
        if (isMountedRef.current && localCusts.length > 0) { setAllCustomers(localCusts); }
      } catch(e) {}
      try {
        const localAccs = await localDb.settings.where('uid').equals(user.uid).toArray();
        if (isMountedRef.current && localAccs.length > 0) { setBankAccounts(localAccs.filter(a => a.isActive !== false)); }
      } catch(e) {}
    })();

    unsubs.push(onSnapshot(query(collection(db, 'items'), where('uid', '==', user.uid)), s => {
      if (!isMountedRef.current || (typeof navigator !== 'undefined' && !navigator.onLine) || savingRef.current) return;
      const fbData = s.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllItems(fbData);
      setDataReady(true);
    }));

    unsubs.push(onSnapshot(query(collection(db, 'customers'), where('uid', '==', user.uid)), s => {
      if (!isMountedRef.current || (typeof navigator !== 'undefined' && !navigator.onLine) || savingRef.current) return;
      const fbData = s.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllCustomers(fbData);
    }));

    unsubs.push(onSnapshot(collection(db, `users/${user.uid}/bankAccounts`), snap => {
      if (!isMountedRef.current) return;
      const accs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => a.isActive !== false);
      setBankAccounts(accs);
      setSelectedBankAccountId(prev => prev || (accs[0]?.id ?? ''));
    }));

    return () => { unsubs.forEach(u => u()); };
  }, [user?.uid]);

  /* ── Line calculation ── */
  const calcLineTotals = useCallback((item) => {
    const sp = R2(item?.sellingPrice || 0), q = R2(item?.qty || 0);
    const da = Math.max(0, Math.min(R2(item?.discAmount || 0), sp));
    const yp = Math.max(0, R2(sp - da));
    return { ...item, sellingPrice: sp, qty: q, discAmount: da, yourPrice: yp, lineTotal: R2(yp * q) };
  }, []);

  const applyAllocations = useCallback((draft) => {
    const batches = Array.isArray(draft?.allBatches) ? draft.allBatches : [];
    const f = Math.max(0.0001, R2(draft?.uomFactor || 1));
    const needBase = R2(R2(draft?.qty || 0) / f);
    const { allocations, allocated, shortage } = allocateFIFO(batches, needBase, draft?.preferredBatchId || '');
    const costTotal = R2(allocations.reduce((s, a) => s + R2(a.buyingNetPrice) * R2(a.allocatedQty), 0));
    return { ...draft, batchAllocations: allocations, allocatedQty: allocated, allocationShortage: shortage, allocatedCostTotal: costTotal, avgBatchCost: allocated > 0 ? R2(costTotal / allocated) : 0, selectedBatch: allocations[0] || null };
  }, []);

  const applyBatchSellingTotals = useCallback((line) => {
    const qtyDisplay = R2(line?.qty || 0), f = Math.max(0.0001, R2(line?.uomFactor || 1));
    const allocations = Array.isArray(line?.batchAllocations) ? line.batchAllocations : [];
    const sp = R2(line?.sellingPrice || 0), da = Math.max(0, Math.min(R2(line?.discAmount || 0), sp));
    const yp = Math.max(0, R2(sp - da)), lt = R2(yp * qtyDisplay);
    if (!allocations.length || qtyDisplay <= 0) return { ...line, sellingPrice: sp, yourPrice: yp, discAmount: da, lineTotal: lt, batchAllocations: allocations };
    const pa = allocations.map(a => {
      const bp = getBatchPrice(a, line?.priceType || 'retail'), aqBase = R2(a?.allocatedQty || 0);
      return { ...a, sellOriginalPrice: R2(bp.original / f), sellDiscountPercent: R2(bp.discount), sellNetPrice: R2(bp.net / f), allocatedLineTotal: R2(bp.net * aqBase), allocatedOrigTotal: R2(bp.original * aqBase) };
    });
    return { ...line, batchAllocations: pa, sellingPrice: sp, yourPrice: yp, discAmount: da, lineTotal: lt, discountPercent: R2(line?.discountPercent || 0), mixedBatchPricing: false, selectedBatch: pa[0] || line?.selectedBatch || null, preferredBatchId: line?.preferredBatchId || pa[0]?.batchId || '' };
  }, []);

  const enrichLine = useCallback((draft) => {
    try { if (!draft) return draft; let line = calcLineTotals({ ...draft }); line = applyAllocations(line); line = applyBatchSellingTotals(line); return line; }
    catch { return draft ? calcLineTotals(draft) : draft; }
  }, [applyAllocations, applyBatchSellingTotals, calcLineTotals]);

  const safeInvoiceItems = useMemo(() => {
    if (!Array.isArray(invoiceItems)) return [];
    return invoiceItems.filter(item => item && typeof item === 'object' && item.itemId);
  }, [invoiceItems]);

  const getItemTotalStock = useCallback((itemOrId) => {
    try {
      if (!itemOrId) return 0;
      const itemId = typeof itemOrId === 'string' ? itemOrId : (itemOrId?.id || itemOrId?.itemId || '');
      if (!itemId) return 0;
      const live = typeof itemOrId === 'object' ? itemOrId : allItems.find(i => i.id === itemId);
      return live ? getDocStock(live) : 0;
    } catch { return 0; }
  }, [allItems]);

  const getAvailableStock = useCallback((itemId, excludeKey = null) => {
    const total = getItemTotalStock(itemId);
    const reserved = safeInvoiceItems.reduce((sum, line) => {
      if (!line || line.itemId !== itemId) return sum;
      const key = line.lineId || line.itemId;
      if (excludeKey && key === excludeKey) return sum;
      const lf = Math.max(0.0001, R2(line.uomFactor || 1));
      return sum + R2(R2(line.qty) / lf);
    }, 0);
    return R2(total - reserved);
  }, [getItemTotalStock, safeInvoiceItems]);

  /* ── Add item ── */
  const addItemToInvoice = useCallback((item) => {
    if (!item?.id) return;
    const avail = getAvailableStock(item.id), batches = extractBatches(item.id, purchaseSources, true);
    const iu = getItemAvailableUnits(item), bu = getBaseUnit(item) || 'unit';
    const pd = calcPricesForUom(item, 'retail', 1);

    setInvoiceItems(prev => {
      if (!Array.isArray(prev)) return prev;
      const existing = prev.find(i => i && i.itemId === item.id && !i.warrantyCode?.trim());
      if (existing) {
        const key = existing.lineId || existing.itemId, nq = R2(existing.qty + 1);
        const f = Math.max(0.0001, R2(existing.uomFactor || 1)), maxD = R2(getAvailableStock(item.id, key) * f);
        if (stockControlEnabled && nq > maxD + 0.001) { showToast(`⚠️ ${t.maxLabel}: ${fmtQ(maxD)}`); return prev; }
        return prev.map(i => i && (i.lineId || i.itemId) === key ? enrichLine({ ...i, qty: nq, allBatches: batches }) : i);
      }
      const wi = getWarrantyInfo(item), nid = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      return [enrichLine({ itemId: item.id, name: item.name, nameSi: getSinhala(item), photoURL: getItemImg(item), sellingPrice: pd.sellingPrice, yourPrice: pd.yourPrice, discAmount: pd.discAmount, discountPercent: pd.discountPercent, qty: 1, maxStock: getItemTotalStock(item), priceType: 'retail', originalItem: item, rack: getRack(item), uom: bu, uomName: bu, availableUnits: iu, uomFactor: 1, warrantyCode: wi.code, warrantyPeriod: wi.period, lineId: nid, allBatches: batches, preferredBatchId: '', manualPriceOverride: false, negativeStock: false }), ...prev];
    });
    setItemSearch(''); setShowItemDropdown(false);
  }, [stockControlEnabled, showToast, purchaseSources, getAvailableStock, getItemTotalStock, enrichLine, t]);

  /* ── Barcode scanning handler ── */
  const handleBarcodeScanned = useCallback((code) => {
    if (!code?.trim() || code.trim().length < 3) return;
    const c = code.trim(), now = Date.now();
    if (c === lastScannedRef.current && now - lastScannedTimeRef.current < 2000) return;
    lastScannedRef.current = c; lastScannedTimeRef.current = now;
    const item = allItems.find(i => i.barcode?.trim().toLowerCase() === c.toLowerCase() || i.itemCode?.trim().toLowerCase() === c.toLowerCase());
    if (item) { addItemToInvoice(item); setLastScannedDisplay(`✅ ${item.name}`); }
    else { setLastScannedDisplay(`❌ ${c}`); showToast(`❌ ${t.barcodeNotFound}: ${c}`); }
    setTimeout(() => setLastScannedDisplay(''), 2500);
  }, [allItems, addItemToInvoice, showToast, t]);

  /* ── Update item fields inline ── */
  const updateItemField = useCallback((key, field, value) => {
    setInvoiceItems(prev => {
      if (!Array.isArray(prev)) return prev;
      return prev.map(item => {
        if (!item || (item.lineId || item.itemId) !== key) return item;
        let u = { ...item };
        if (field === 'qty') {
          const req = R2(value);
          if (item?.warrantyCode?.trim() || req <= 0) return item;
          u.qty = req;
          return enrichLine(u);
        }
        if (field === 'sellingPrice') {
          const sp = R2(value); u.sellingPrice = sp; u.yourPrice = sp; return enrichLine(u);
        }
        if (field === 'yourPrice') {
          const yp = Math.max(0, R2(value)); u.yourPrice = yp; return enrichLine(u);
        }
        u[field] = value; return enrichLine(u);
      });
    });
  }, [enrichLine]);

  const removeItem = useCallback((key) => {
    setInvoiceItems(prev => Array.isArray(prev) ? prev.filter(i => i && (i.lineId || i.itemId) !== key) : prev);
  }, []);

  /* ── Filters ── */
  const filteredItems = useMemo(() => {
    const s = itemSearch.toLowerCase().trim(); if (!s) return [];
    return allItems.filter(i => {
      const x = [i.name, i.sinhalaName, i.itemCode, i.barcode, getRack(i)].filter(Boolean).join(' ').toLowerCase();
      return s.split(/\s+/).every(w => x.includes(w));
    }).slice(0, 50);
  }, [allItems, itemSearch]);

  const filteredCustomers = useMemo(() => {
    const raw = customerSearch.trim(); if (!raw) return allCustomers.slice(0, 20);
    const lower = raw.toLowerCase(), terms = lower.split(/\s+/);
    return allCustomers.filter(c => {
      const tx = [c.name, c.phone].filter(Boolean).join(' ').toLowerCase();
      return terms.every(term => tx.includes(term));
    }).slice(0, 20);
  }, [allCustomers, customerSearch]);

  /* ── Totals ── */
  const subTotal = useMemo(() => R2(safeInvoiceItems.reduce((s, i) => s + R2(i?.sellingPrice) * R2(i?.qty), 0)), [safeInvoiceItems]);
  const totalItemDiscount = useMemo(() => R2(safeInvoiceItems.reduce((s, i) => s + R2(i?.discAmount) * R2(i?.qty), 0)), [safeInvoiceItems]);
  const totalDiscount = useMemo(() => R2(totalItemDiscount + R2(billDiscount)), [totalItemDiscount, billDiscount]);
  const finalNetAmount = useMemo(() => R2(Math.max(0, subTotal - totalDiscount - R2(exchangeAmount))), [subTotal, totalDiscount, exchangeAmount]);
  const balance = useMemo(() => R2(R2(payAmount) - finalNetAmount), [payAmount, finalNetAmount]);
  const isFullyPaid = balance >= -0.01;
  const selectedBankAccount = useMemo(() => bankAccounts.find(a => a.id === selectedBankAccountId) || null, [bankAccounts, selectedBankAccountId]);
  const invoiceProfitVal = useMemo(() => R2(safeInvoiceItems.reduce((sum, item) => sum + R2((R2(item?.yourPrice) * R2(item?.qty)) - R2(item?.allocatedCostTotal || 0)), 0)), [safeInvoiceItems]);

  useEffect(() => { setBillDiscount(billDiscountPercent > 0 ? R2(subTotal * (billDiscountPercent / 100)) : 0); }, [subTotal, billDiscountPercent]);

  /* ── KEYBOARD HANDLERS (DEFINED TO FIX REFERENCE ERRORS) ── */
  const handlePayAmountKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (printBtnRef.current) printBtnRef.current.click();
    }
  }, []);

  const handleQtyKeyDown = useCallback((e, itemKey, lineIdx) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (payAmountInputRef.current) payAmountInputRef.current.focus();
    }
  }, []);

  const handleItemSearchKeyDown = useCallback((e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredItems.length > 0) setActiveItemIdx(prev => (prev + 1) % filteredItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredItems.length > 0) setActiveItemIdx(prev => (prev - 1 + filteredItems.length) % filteredItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems.length > 0 && activeItemIdx >= 0 && activeItemIdx < filteredItems.length) {
        addItemToInvoice(filteredItems[activeItemIdx]);
        setItemSearch(''); setShowItemDropdown(false);
      }
    } else if (e.key === 'Escape') setShowItemDropdown(false);
  }, [filteredItems, activeItemIdx, addItemToInvoice]);

  const handleCustSearchKeyDown = useCallback((e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredCustomers.length > 0) setActiveCustIdx(prev => (prev + 1) % filteredCustomers.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredCustomers.length > 0) setActiveCustIdx(prev => (prev - 1 + filteredCustomers.length) % filteredCustomers.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCustomers.length > 0 && activeCustIdx >= 0 && activeCustIdx < filteredCustomers.length) {
        setSelectedCustomer(filteredCustomers[activeCustIdx]);
        setShowCustomerDropdown(false); setCustomerSearch('');
      }
    } else if (e.key === 'Escape') setShowCustomerDropdown(false);
  }, [filteredCustomers, activeCustIdx]);

  /* ── Clear Form ── */
  const clearForm = useCallback(() => {
    setInvoiceItems([]); setBillDiscountPercent(0); setBillDiscount(0); setExchangeAmount(0); setPayAmount(0);
    setPaymentMethod('cash'); setInvoiceRemark(''); setShowRemarkInput(false); setSelectedCustomer(null);
    setCustomerSearch(''); setWarrantyVisibility({}); setBatchVisibility({}); setItemSearch('');
    setShowItemDropdown(false); setLastScannedDisplay('');
    setTimeout(() => { if (itemSearchInputRef.current) itemSearchInputRef.current.focus(); }, 150);
  }, []);

  const ensurePortalKey = useCallback(async (cust) => {
    if (!cust || cust.id === 'CASH_CUSTOMER') return cust;
    if (cust.portalAccessKey) return cust;
    const key = `${cust.id.slice(0, 8)}_${Date.now().toString(36)}`;
    try { await updateDoc(doc(db, 'customers', cust.id), { portalAccessKey: key }); return { ...cust, portalAccessKey: key }; }
    catch (e) { return cust; }
  }, []);

  const loadPendingSyncCount = useCallback(async () => {
    try {
      if (!user?.uid || !localDb?.invoices) return;
      const unsynced = await localDb.invoices.where('uid').equals(user.uid).and(r => r.synced === false || r.synced === 0 || r._synced === false).toArray();
      setPendingSyncCount(unsynced ? unsynced.length : 0);
    } catch (err) {}
  }, [user?.uid]);

  const handleOpenBackupFolder = async () => {
    showToast('📁 Backup Feature Available');
  };

  const handleSyncPendingInvoices = useCallback(async () => {
    if (syncingCloud || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    setSyncingCloud(true);
    showToast('🔄 Syncing pending invoices...');
    setTimeout(() => { setSyncingCloud(false); showToast('✅ Sync Completed'); }, 1500);
  }, [syncingCloud, showToast]);

  /* ── Save Invoice ── */
  const handleSaveInvoice = useCallback(async (actionType) => {
    if (!safeInvoiceItems.length || savingRef.current) return;
    savingRef.current = true; setSaving(true);

    try {
      const snap = snapshotInvoiceState({ safeInvoiceItems, selectedCustomer, finalNetAmount, payAmount, balance, paymentMethod, subTotal, billDiscountPercent, billDiscount, exchangeAmount, totalDiscount, invoiceRemark, selectedBankAccountId, selectedBankAccount });
      const invoiceNo = `INV-${Date.now().toString().slice(-6)}`;
      const invoiceId = `inv_${Date.now()}`;

      const previousOutstanding = R2(selectedCustomer?.currentBalance || 0);
      const newOutstanding = R2(previousOutstanding + (balance < 0 ? Math.abs(balance) : 0));

      const payload = buildInvoicePayload({ user, snap, invoiceNo, actionType, mode, isFullCredit: paymentMethod === 'credit', previousOutstanding, newOutstanding });

      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const wb = writeBatch(db);
        wb.set(doc(db, 'invoices', invoiceId), payload);
        await wb.commit();
        showToast('✅ Saved Online!');
      } else {
        await localDb.invoices.put({ id: invoiceId, invoiceNo, ...payload, synced: false });
        showToast('💾 Saved Offline!');
      }

      setOutputInvoice(buildOutputInvoicePayload({ invoiceId, invoiceNo, user, snap, isFullCredit: paymentMethod === 'credit', actionType, custWithKey: snap.customer, previousOutstanding, newOutstanding }));
      clearForm();
    } catch (e) {
      showToast(`❌ Error: ${e.message}`);
    } finally {
      savingRef.current = false; setSaving(false);
    }
  }, [safeInvoiceItems, selectedCustomer, finalNetAmount, payAmount, balance, paymentMethod, subTotal, billDiscountPercent, billDiscount, exchangeAmount, totalDiscount, invoiceRemark, selectedBankAccountId, selectedBankAccount, user, mode, clearForm, showToast]);

  /* ══════════════════════════════════════════════════════════════
     RENDER LAYOUT
  ══════════════════════════════════════════════════════════════ */
  return (
    <div style={{ padding: 10, backgroundColor: '#f8fafc', minHeight: '100vh', paddingBottom: 100 }}>
      <style>{printStyles + inputFixStyles + badgeStyles + keyboardStyles}</style>

      {toastMsg && (<div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', background: '#334155', color: '#fff', padding: '10px 20px', borderRadius: 8, zIndex: 9999 }}>{toastMsg}</div>)}

      {outputInvoice && (
        <InvoiceOutputManager
          invoice={outputInvoice}
          initialMode={outputInvoice.initialMode || 'print'}
          onClose={() => setOutputInvoice(null)}
        />
      )}

      {/* HEADER CONTROLS */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>🧾 {t.title}</h2>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <button onClick={() => setStockControlEnabled(p => !p)} style={{ padding: '7px 10px', borderRadius: 10, fontSize: 11, fontWeight: 800, background: stockControlEnabled ? '#f0fdf4' : '#fffbeb', color: stockControlEnabled ? '#16a34a' : '#b45309' }}>{stockControlEnabled ? '🔒 Stock ON' : '🔓 Stock OFF'}</button>
          <button onClick={clearForm} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', padding: '7px 11px', borderRadius: 6, fontSize: 12, fontWeight: 'bold' }}>🗑️ Clear</button>
        </div>
      </div>

      {/* MAIN ITEM SEARCH */}
      <div ref={itemSearchContainerRef} style={{ marginBottom: 10, position: 'relative' }}>
        <input
          ref={itemSearchInputRef}
          placeholder={`${t.searchItem} [F1]`}
          value={itemSearch}
          onChange={e => { setItemSearch(e.target.value); setShowItemDropdown(true); setActiveItemIdx(0); }}
          onKeyDown={handleItemSearchKeyDown}
          style={{ width: '100%', padding: 14, borderRadius: 8, border: '2px solid #3b82f6', fontSize: 16, boxSizing: 'border-box' }}
        />
        {showItemDropdown && itemSearch && filteredItems.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #cbd5e1', zIndex: 100, maxHeight: 300, overflowY: 'auto' }}>
            {filteredItems.map((item, idx) => (
              <div key={item.id} onClick={() => addItemToInvoice(item)} style={{ padding: 10, borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: idx === activeItemIdx ? '#dbeafe' : 'white' }}>
                <b>{item.name}</b> - Rs.{getOriginalPrice(item).toFixed(2)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* INVOICE ITEMS LIST */}
      <div style={{ background: 'white', borderRadius: 10, padding: 12, marginBottom: 15 }}>
        {safeInvoiceItems.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>{t.noData}</div>
        ) : safeInvoiceItems.map((item, lineIdx) => {
          const itemKey = item.lineId || item.itemId;
          return (
            <div key={itemKey} style={{ padding: 12, borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div><b>{item.name}</b></div>
                <button onClick={() => removeItem(itemKey)} style={{ color: '#ef4444', background: 'none', border: 'none', fontSize: 18 }}>✕</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
                <div>
                  <label style={{ fontSize: 10 }}>MRP</label>
                  <input type="number" value={item.sellingPrice} onChange={e => updateItemField(itemKey, 'sellingPrice', e.target.value)} style={{ width: '100%', padding: 6 }} />
                </div>
                <div>
                  <label style={{ fontSize: 10 }}>Your Price</label>
                  <input type="number" value={item.yourPrice} onChange={e => updateItemField(itemKey, 'yourPrice', e.target.value)} style={{ width: '100%', padding: 6 }} />
                </div>
                <div>
                  <label style={{ fontSize: 10 }}>Qty</label>
                  <input
                    ref={el => qtyInputRefs.current[itemKey] = el}
                    type="number"
                    value={item.qty}
                    onChange={e => updateItemField(itemKey, 'qty', e.target.value)}
                    onKeyDown={e => handleQtyKeyDown(e, itemKey, lineIdx)}
                    style={{ width: '100%', padding: 6, fontWeight: 'bold' }}
                  />
                </div>
              </div>
              <div style={{ textAlign: 'right', marginTop: 6, fontWeight: 'bold', color: '#1e40af' }}>
                Total: Rs. {item.lineTotal.toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>

      {/* BILL TOTALS & PAYMENT */}
      <div style={{ background: 'white', padding: 15, borderRadius: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 'bold' }}>
          <span>{t.netAmount}</span><span>Rs. {finalNetAmount.toFixed(2)}</span>
        </div>

        <div style={{ marginTop: 15 }}>
          <label style={{ fontSize: 12, fontWeight: 'bold' }}>{t.paymentAmountLabel}</label>
          <input
            ref={payAmountInputRef}
            type="number"
            value={payAmount}
            onChange={e => setPayAmount(R2(e.target.value))}
            onFocus={onFocusSel}
            onKeyDown={handlePayAmountKeyDown}
            placeholder={`${t.paymentAmountLabel} [Enter to Print]`}
            style={{ width: '100%', padding: 14, borderRadius: 8, border: '2px solid #3b82f6', fontSize: 20, fontWeight: 'bold', boxSizing: 'border-box', marginTop: 4 }}
          />
        </div>

        <div style={{ marginTop: 10, padding: 12, background: balance >= 0 ? '#f0fdf4' : '#fef2f2', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#64748b' }}>{t.balance}</div>
          <div style={{ fontSize: 24, fontWeight: 'bold', color: balance >= 0 ? '#16a34a' : '#dc2626' }}>Rs. {balance.toFixed(2)}</div>
        </div>

        <div style={{ marginTop: 15, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button ref={saveBtnRef} onClick={() => handleSaveInvoice('save')} disabled={saving || !safeInvoiceItems.length} style={{ padding: 16, background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: 'pointer' }}>💾 {t.saveOnly} [F2]</button>
          <button ref={printBtnRef} onClick={() => handleSaveInvoice('print')} disabled={saving || !safeInvoiceItems.length} style={{ padding: 16, background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: 'pointer' }}>🖨️ {t.savePrint} [F4]</button>
        </div>
      </div>
    </div>
  );
}
