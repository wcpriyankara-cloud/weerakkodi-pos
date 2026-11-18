'use client';

// components/POSInvoice.jsx
// ✅ Complete POS Billing System
// ✅ Fixed UOM price calculations using rate/factor sync
// ✅ Real-time Outstanding balances (Previous & New Balance) on receipts
// ✅ Fully responsive & fast rendering layout
// ✅ Synced to viewer both Active & Old/Exhausted Purchased Batches (පැරණි තොග)
// ✅ FIXED: Stock deduction now works correctly (onSnapshot merge, UOM conversion, race condition)

import localDb from '@/lib/localDb';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { db } from '@/shared/firebase-config';
import { useUserAuth } from '@/context/UserContext';
import {
  collection, onSnapshot, doc, increment, writeBatch,
  addDoc, serverTimestamp, query, where, getDoc, updateDoc, setDoc
} from 'firebase/firestore';

import MobileBarcodeScanner from './MobileBarcodeScanner';
import InvoiceOutputManager from './InvoiceOutputManager';
import { FolderOpen, UploadCloud } from 'lucide-react';

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
   CACHE
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
   BATCH HELPERS
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

/* ══════════════════════════════════════════════════════════════
   STOCK HELPERS
══════════════════════════════════════════════════════════════ */
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

// ✅ Modified to support displaying exhausted/old batches (පැරණි අවසන් වූ තොග)
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

        // If includeEmpty is false, filter out zero-stock batches.
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

/* ══════════════════════════════════════════════════════════════
   CONTACT PICKER
══════════════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════════════
   TOUCH HOOK
══════════════════════════════════════════════════════════════ */
function useTouchScrollTap() {
  const touchRef = useRef({ y: 0, time: 0 });
  const scrollingRef = useRef(false);
  const onTouchStart = useCallback((e) => { touchRef.current = { y: e.touches[0].clientY, time: Date.now() }; scrollingRef.current = false; }, []);
  const onTouchMove = useCallback(() => { scrollingRef.current = true; }, []);
  const isTap = useCallback(() => !scrollingRef.current && (Date.now() - touchRef.current.time) < 400, []);
  return { onTouchStart, onTouchMove, isTap };
}

/* ══════════════════════════════════════════════════════════════
   STOCK BADGE
══════════════════════════════════════════════════════════════ */
const StockBadge = ({ stock, uom }) => {
  const s = R2(stock), z = s <= 0, l = s > 0 && s <= 5;
  return (
    <span style={{ fontWeight: 'bold', padding: '2px 8px', borderRadius: 4, background: z ? '#fef2f2' : l ? '#fffbeb' : '#f0fdf4', color: z ? '#dc2626' : l ? '#d97706' : '#16a34a', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {z ? '🔴' : l ? '🟡' : '🟢'} {fmtQ(s)}{uom && uom !== 'unit' ? ` ${uom}` : ''}
    </span>
  );
};

/* ══════════════════════════════════════════════════════════════
   BATCH CARD
══════════════════════════════════════════════════════════════ */
// ✅ Updated to cleanly render Empty/Past Batches visually faded
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

/* ══════════════════════════════════════════════════════════════
   SAVE HELPERS
   ══════════════════════════════════════════════════════════════ */
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

// ✅ FIX 2: Offline stock deduction with UOM factor conversion
const applyBatchSourceUpdatesLocal = async (invoiceItems) => {
  if (!invoiceItems || !Array.isArray(invoiceItems) || !localDb || !localDb.items) return;
  // Group quantities by itemId — converted to BASE units using uomFactor
  const qtyMap = {};
  invoiceItems.forEach(it => {
    const itemId = it.itemId || it.id || it.docId;
    if (!itemId) return;
    const displayQty = parseFloat(it.qty || it.quantity || 0);
    const uomFactor = Math.max(0.0001, parseFloat(it.uomFactor || 1));
    const baseQty = displayQty / uomFactor; // ← Convert display qty to base units
    qtyMap[itemId] = (qtyMap[itemId] || 0) + baseQty;
  });
  for (const [itemId, totalDeduct] of Object.entries(qtyMap)) {
    if (totalDeduct <= 0) continue;
    try {
      const item = await localDb.items.get(itemId);
      console.log('[DEBUG] localDb.items.get(' + itemId + '):', item ? 'FOUND (stock=' + (item.currentStock ?? item.stock) + ')' : 'NOT FOUND');
      if (item) {
        const curStock = item.currentStock ?? item.stock ?? 0;
                const newStock = Math.max(0, R2(curStock - totalDeduct));
        const updateData = {
          stock: newStock,
          currentStock: newStock,
          _deductedAt: Date.now(),
          _synced: false
        };
        // 🔑 FIX: Also update stocks object (Main_Store etc.) to match Firestore behavior
        if (item.stocks && typeof item.stocks === 'object') {
          updateData.stocks = { ...item.stocks };
          for (const storeKey of Object.keys(item.stocks)) {
            const storeStock = parseFloat(item.stocks[storeKey] || 0);
            updateData.stocks[storeKey] = Math.max(0, R2(storeStock - totalDeduct));
          }
        }
        await localDb.items.update(itemId, updateData);
        console.log('[Offline] Item stock deducted:', itemId, '-' + totalDeduct, '->', newStock, '(stocks:', updateData.stocks || 'N/A', ')');
      } else {
        console.warn('[Offline] Item not in Dexie:', itemId);
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
  // ── Sync & Backup States ──
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [backupFeedback, setBackupFeedback] = useState('');
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


  /* ── Dexie offline pre-load ── */
  const loadFromDexie = async () => {
    try {
      if (!localDb || !user?.uid) return;
      // Load items from Dexie
      if (localDb.items) {
        const dexItems = await localDb.items.where('uid').equals(user.uid).toArray();
        if (dexItems.length > 0 && isMountedRef.current) {
          setAllItems(dexItems);
          setDataReady(true);
          console.log('[Offline] Loaded', dexItems.length, 'items from Dexie');
        }
      }
      // Load customers from Dexie
      if (localDb.customers) {
        const dexCusts = await localDb.customers.where('uid').equals(user.uid).toArray();
        if (dexCusts.length > 0 && isMountedRef.current) {
          setAllCustomers(dexCusts);
          console.log('[Offline] Loaded', dexCusts.length, 'customers from Dexie');
        }
      }
    } catch (e) {
      console.warn('[Dexie] Preload failed:', e.message);
    }
  };

  /* ── Firestore listeners ── */
  // ✅ FIX 1 + FIX 3: Fixed onSnapshot merge logic (no race conditions, respects _synced flag)
  useEffect(() => {
    if (!user?.uid) return;
    const unsubs = [];

    // ── Always load from localDb first (works online + offline) ──
    (async () => {
      try {
        const localItems = await localDb.items.where('uid').equals(user.uid).toArray();
        if (isMountedRef.current && localItems.length > 0) { setAllItems(localItems); setDataReady(true); }
      } catch(e) { console.warn('[LocalDB] items err:', e); }
      try {
        const localCusts = await localDb.customers.where('uid').equals(user.uid).toArray();
        if (isMountedRef.current && localCusts.length > 0) { setAllCustomers(localCusts); }
      } catch(e) { console.warn('[LocalDB] customers err:', e); }
      try {
        const localAccs = await localDb.settings.where('uid').equals(user.uid).toArray();
        if (isMountedRef.current && localAccs.length > 0) { setBankAccounts(localAccs.filter(a => a.isActive !== false)); }
      } catch(e) {}
    })();

    // ✅ FIXED: Items listener — race-condition-free, offline-safe
unsubs.push(onSnapshot(
  query(collection(db, 'items'), where('uid', '==', user.uid)),
  s => {
    // 🔑 GUARD 0: fromCache check — stale cache data වලින් local overwrite වෙන්න දෙන්න එපා
    if (s.metadata.fromCache && typeof navigator !== 'undefined' && !navigator.onLine) {
      console.log('[Items Listener] 🔌 Offline cache — skip');
      return;
    }

    if (!isMountedRef.current) return;

    // 🔑 GUARD 1: Offline එකේ Firestore cached data වලින් local changes overwrite වෙන්න දෙන්න එපා
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.log('[Items Listener] 🔌 Offline — skip Firestore cache');
      return;
    }

    // 🔑 GUARD 2: Save ක්‍රියාවලිය අතරතුර listener data වලින් overwrite වෙන්න දෙන්න එපා
    if (savingRef.current) {
      console.log('[Items Listener] ⏳ Save in progress — skip');
      return;
    }

    const fbData = s.docs.map(d => ({ id: d.id, ...d.data() }));

    // 🔑 GUARD 3: Debounce — Dexie writes වලට කාලය දෙන්න
    if (window.__itemsMergeTimer) clearTimeout(window.__itemsMergeTimer);
    window.__itemsMergeTimer = setTimeout(async () => {
      if (!isMountedRef.current) return;
      // Double-check after debounce
      if (savingRef.current) return;

      try {
        const localAll = await localDb.items.where('uid').equals(user.uid).toArray();
        const localMap = new Map(localAll.map(li => [li.id, li]));
        const fbIds = new Set(fbData.map(d => d.id));

        const merged = fbData.map(d => {
          const local = localMap.get(d.id);
          if (!local) return d;

          // 🔑 Robust unsynced check — handles boolean, number, null, undefined
          const isUnsynced =
            local._synced === false || local._synced === 0 ||
            local.synced === false || local.synced === 0 ||
            !!local._deductedAt ||
            !!local._localSaved;

          if (isUnsynced) {
            return {
              ...d,
              stock: local.stock ?? d.stock,
              currentStock: local.currentStock ?? d.currentStock,
              stocks: local.stocks ?? d.stocks,
              _synced: local._synced,
              _deductedAt: local._deductedAt,
            };
          }
          return d;
        });

        // Append local-only items (not yet in Firestore)
        const extra = localAll.filter(i =>
          !fbIds.has(i.id) && (
            i._synced === false || i._synced === 0 ||
            i.synced === false || i.synced === 0
          )
        );
        if (extra.length > 0) merged.push(...extra);

                if (isMountedRef.current && !savingRef.current) {
          setAllItems(merged);
                    // 🔑 FIX: Sync merged items to Dexie — PRESERVE local unsynced flags!
          try {
            const toSave = merged.map(m => {
              const local = localMap.get(m.id);
              const wasUnsynced = local && (
                local._synced === false || local._synced === 0 ||
                local.synced === false || local.synced === 0 ||
                !!local._deductedAt ||
                !!local._localSaved
              );
              if (wasUnsynced) {
                return {
                  ...m, uid: user.uid,
                  _synced: local._synced,
                  _deductedAt: local._deductedAt,
                  _localSaved: local._localSaved,
                  stock: local.stock ?? m.stock,
                  currentStock: local.currentStock ?? m.currentStock,
                  stocks: local.stocks ?? m.stocks
                };
              }
              return { ...m, uid: user.uid, _synced: true };
            });
            await localDb.items.bulkPut(toSave);
            console.log('[Dexie] Synced', merged.length, 'items to local DB (preserved unsynced)');
          } catch(dexErr) { console.warn('[Dexie] items bulkPut failed:', dexErr); }
        }
      } catch (e) {
        console.warn('[Items merge] Fallback to Firestore:', e.message);
        if (isMountedRef.current && !savingRef.current) {
          setAllItems(fbData);
                    try {
            const localAll2 = await localDb.items.where('uid').equals(user.uid).toArray();
            const lMap2 = new Map(localAll2.map(l => [l.id, l]));
            await localDb.items.bulkPut(fbData.map(d => {
              const l = lMap2.get(d.id);
              if (l && (l._synced === false || l._synced === 0 || !!l._deductedAt)) {
                return { ...d, uid: user.uid, _synced: l._synced, _deductedAt: l._deductedAt, stock: l.stock, currentStock: l.currentStock, stocks: l.stocks };
              }
              return { ...d, uid: user.uid, _synced: true };
            }));
          } catch(e2) {}
        }
      }
    }, 600); // ← 600ms delay ensures Dexie writes are committed

    // Cache for next load (this is fine — cache is only for initial load)
    saveCache(CACHE_KEY_ITEMS, fbData.map(i => ({
      id: i.id, name: i.name, sinhalaName: i.sinhalaName || i.nameSi || '',
      itemCode: i.itemCode || '', barcode: i.barcode || '',
      sellingPriceRetail: i.sellingPriceRetail || i.retailPrice || i.sellingPrice || i.price || 0,
      retailDiscount: i.retailDiscount || i.discPercent || i.discount || 0, retailYourPrice: i.retailYourPrice || 0,
      sellingPriceWholesale: i.sellingPriceWholesale || i.wholesalePrice || 0, wholesaleDiscount: i.wholesaleDiscount || 0, wholesaleYourPrice: i.wholesaleYourPrice || 0,
      sellingPriceLoose: i.sellingPriceLoose || i.loosePrice || 0, looseDiscount: i.looseDiscount || 0, looseYourPrice: i.looseYourPrice || 0,
      stock: i.stock, currentStock: i.currentStock, stocks: i.stocks, picture: i.picture || '',
      rackName: i.rackName || i.rack || '', packSize: i.packSize || i.uomName || i.uom || '',
      availableUnits: i.availableUnits || i.conversions || [],
      warrantyCode: i.warrantyCode || '', warrantyPeriod: i.warrantyPeriod || '', uid: i.uid,
     })));
  },
  (err) => {
    console.warn('[Items Listener] Error (likely offline):', err?.message);
  }
));


      // ✅ FIXED: Customers listener
unsubs.push(onSnapshot(
  query(collection(db, 'customers'), where('uid', '==', user.uid)),
  s => {
    if (!isMountedRef.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (savingRef.current) return;

    const fbData = s.docs.map(d => ({ id: d.id, ...d.data() }));

    if (window.__custsMergeTimer) clearTimeout(window.__custsMergeTimer);
    window.__custsMergeTimer = setTimeout(async () => {
      if (!isMountedRef.current || savingRef.current) return;
      try {
        const localAll = await localDb.customers.where('uid').equals(user.uid).toArray();
        const localMap = new Map(localAll.map(c => [c.id, c]));
        const fbIds = new Set(fbData.map(d => d.id));

        const merged = fbData.map(d => {
          const local = localMap.get(d.id);
          const isUnsynced = local && (
            local._synced === false || local._synced === 0 ||
            local.synced === false || local.synced === 0 ||
            !!local._localSaved
          );
          if (isUnsynced) {
            return { ...d, currentBalance: local.currentBalance ?? d.currentBalance };
          }
          return d;
        });

        const extra = localAll.filter(c =>
          !fbIds.has(c.id) && (
            c._synced === false || c._synced === 0 ||
            c.synced === false || c.synced === 0
          )
        );
        if (extra.length > 0) merged.push(...extra);

               if (isMountedRef.current && !savingRef.current) {
          setAllCustomers(merged);
                    // 🔑 FIX: Sync merged customers to Dexie — PRESERVE local unsynced flags!
          try {
            const toSave = merged.map(m => {
              const local = localMap.get(m.id);
              const wasUnsynced = local && (
                local._synced === false || local._synced === 0 ||
                local.synced === false || local.synced === 0 ||
                !!local._localSaved
              );
              if (wasUnsynced) {
                return {
                  ...m, uid: user.uid,
                  _synced: local._synced,
                  _localSaved: local._localSaved,
                  currentBalance: local.currentBalance ?? m.currentBalance
                };
              }
              return { ...m, uid: user.uid, _synced: true };
            });
            await localDb.customers.bulkPut(toSave);
            console.log('[Dexie] Synced', merged.length, 'customers to local DB (preserved unsynced)');
          } catch(dexErr) { console.warn('[Dexie] customers bulkPut failed:', dexErr); }
        }
      } catch (e) {
        if (isMountedRef.current && !savingRef.current) {
          setAllCustomers(fbData);
                    try {
            const localC2 = await localDb.customers.where('uid').equals(user.uid).toArray();
            const lMapC2 = new Map(localC2.map(l => [l.id, l]));
            await localDb.customers.bulkPut(fbData.map(d => {
              const l = lMapC2.get(d.id);
              if (l && (l._synced === false || l._synced === 0 || !!l._localSaved)) {
                return { ...d, uid: user.uid, _synced: l._synced, _localSaved: l._localSaved, currentBalance: l.currentBalance };
              }
              return { ...d, uid: user.uid, _synced: true };
            }));
          } catch(e2) {}
        }
      }
    }, 600);

    saveCache(CACHE_KEY_CUSTOMERS, fbData.map(c => ({
      id: c.id, name: c.name || '', phone: c.phone || '', address: c.address || '',
      currentBalance: c.currentBalance || 0, profilePicture: c.profilePicture || '',
      creditLimit: c.creditLimit || 0, portalAccessKey: c.portalAccessKey || '', uid: c.uid,
    })));
    },
  (err) => {
    console.warn('[Customers Listener] Error (likely offline):', err?.message);
  }
));

    unsubs.push(onSnapshot(collection(db, `users/${user.uid}/bankAccounts`), snap => {
      if (!isMountedRef.current) return;
      const accs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => a.isActive !== false);
      setBankAccounts(accs);
      setSelectedBankAccountId(prev => prev || (accs[0]?.id ?? ''));
    }));

    try { unsubs.push(onSnapshot(query(collection(db, `shops/${user.uid}/pfis`), where('status', '==', 'confirmed')), snap => { if (isMountedRef.current) setApprovedCount(snap.size); }, () => {})); } catch {}
    try { unsubs.push(onSnapshot(query(collection(db, `shops/${user.uid}/pfis`), where('status', '==', 'pending')), snap => { if (isMountedRef.current) setPendingOrderCount(snap.size); }, () => {})); } catch {}

    const batchTimer = setTimeout(() => {
      ['purchases', 'purchaseInvoices', 'stockIn'].forEach(col => {
        unsubs.push(onSnapshot(query(collection(db, col), where('uid', '==', user.uid)), snap => {
          if (isMountedRef.current) setPurchaseSources(prev => ({ ...prev, [col]: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
        }));
      });
    }, 1500);

    return () => { unsubs.forEach(u => u()); clearTimeout(batchTimer); };
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

  /* ── Stock ── */
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

  /* ── Auto enrich (පැරණි තොග ද ඇතුළත්ව යාවත්කාලීන කිරීම) ── */
  useEffect(() => {
    if (!allItems.length && !Object.values(purchaseSources).some(a => a.length > 0)) return;
    if (enrichTimerRef.current) clearTimeout(enrichTimerRef.current);
    enrichTimerRef.current = setTimeout(() => {
      setInvoiceItems(prev => {
        if (!Array.isArray(prev) || prev.length === 0) return prev;
        const updated = prev.map(inv => {
          if (!inv || typeof inv !== 'object') return inv;
          try {
            const fi = allItems.find(i => i.id === inv.itemId) || inv.originalItem;
            return enrichLine({
              ...inv,
              maxStock: getItemTotalStock(inv.itemId),
              originalItem: fi,
              allBatches: extractBatches(inv.itemId, purchaseSources, true)
            });
          } catch { return inv; }
        });
        const changed = updated.some((item, idx) => {
          const old = prev[idx]; if (!old || !item) return true;
          return R2(item.lineTotal) !== R2(old.lineTotal) || R2(item.maxStock) !== R2(old.maxStock) || R2(item.allocatedQty) !== R2(old.allocatedQty);
        });
        return changed ? updated : prev;
      });
    }, 300);
    return () => { if (enrichTimerRef.current) clearTimeout(enrichTimerRef.current); };
  }, [allItems, purchaseSources, getItemTotalStock, enrichLine]);

  /* ── Load approved order ── */
  useEffect(() => {
    if (orderLoaded || !dataReady || !allItems.length) return;
    const orderId = searchParams.get('orderId');
    if (!orderId) { setOrderLoaded(true); return; }
    let orderData = null;
    try { const raw = sessionStorage.getItem('approved_order'); if (raw) { orderData = JSON.parse(raw); if (orderData.orderId !== orderId) orderData = null; } } catch { orderData = null; }
    if (!orderData) { setOrderLoaded(true); return; }
    try { sessionStorage.removeItem('approved_order'); } catch {}

    if (orderData.customerName || orderData.customerPhone) {
      const phone = (orderData.customerPhone || '').trim(), name = (orderData.customerName || '').trim();
      const matched = allCustomers.find(c => { if (phone && c.phone && normalizePhone(c.phone) === normalizePhone(phone)) return true; if (name && c.name && c.name.toLowerCase() === name.toLowerCase()) return true; return false; });
      if (matched) setSelectedCustomer(matched);
      else if (name) setSelectedCustomer({ id: 'TEMP_ORDER_CUSTOMER', name, phone, address: '', currentBalance: 0 });
    }

    const orderItems = (orderData.items || []).filter(i => !i.outOfStock);
    const loadedItems = [];
    for (const oi of orderItems) {
      const li = allItems.find(i => { if (oi.itemId && i.id === oi.itemId) return true; const oN = (oi.name || '').toLowerCase(), oS = (oi.sinhalaName || '').toLowerCase(); if (oN && i.name && i.name.toLowerCase() === oN) return true; if (oS && i.sinhalaName && i.sinhalaName.toLowerCase() === oS) return true; return false; });
      if (!li) continue;
      const qty = R2(oi.qty || 1), batches = extractBatches(li.id, purchaseSources, true);
      const iu = getItemAvailableUnits(li), bu = getBaseUnit(li) || 'unit';
      const uom = oi.uom || bu, pt = oi.priceType || 'retail';
      const factor = Math.max(0.0001, getUomFactor(uom, bu, iu));
      const pd = calcPricesForUom(li, pt, factor);
      let sp = R2(oi.sellingPrice), yp = R2(oi.yourPrice), da = R2(oi.discAmount), dp = R2(oi.discountPercent);
      if (sp <= 0) sp = pd.sellingPrice; if (yp <= 0) yp = pd.yourPrice; if (da <= 0) da = pd.discAmount; if (dp <= 0) dp = pd.discountPercent;
      const wi = getWarrantyInfo(li);
      loadedItems.push(enrichLine({
        itemId: li.id, name: li.name, nameSi: getSinhala(li), photoURL: getItemImg(li),
        sellingPrice: sp, yourPrice: yp, discAmount: da, discountPercent: dp, qty, maxStock: getItemTotalStock(li),
        priceType: pt, originalItem: li, rack: getRack(li), uom, uomName: bu, availableUnits: iu, uomFactor: factor,
        warrantyCode: wi.code, warrantyPeriod: wi.period,
        lineId: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        allBatches: batches, preferredBatchId: '', manualPriceOverride: false, negativeStock: false, sourceOrderId: orderId,
      }));
    }
    if (loadedItems.length > 0) { setInvoiceItems(loadedItems); showToast(`✅ ${t.orderLoaded} ${loadedItems.length}`); }
    else showToast(t.orderItemsNotFound);
    setOrderLoaded(true);
  }, [searchParams, orderLoaded, dataReady, allItems, allCustomers, purchaseSources, enrichLine, getItemTotalStock, showToast, t]);

  /* ── Auto-focus qty ── */
  useEffect(() => {
    const lineId = lastAddedLineIdRef.current; if (!lineId || !invoiceItems.length) return;
    const tryFocus = () => { const el = qtyInputRefs.current[lineId]; if (!el) return false; el.focus(); requestAnimationFrame(() => { try { el.select(); } catch {} }); return true; };
    if (tryFocus()) { lastAddedLineIdRef.current = null; return; }
    const t1 = setTimeout(() => { if (tryFocus()) lastAddedLineIdRef.current = null; }, 50);
    const t2 = setTimeout(() => { if (tryFocus()) lastAddedLineIdRef.current = null; }, 150);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [invoiceItems]);

  /* ── Add item ── */
  const addItemToInvoice = useCallback((item) => {
    if (!item?.id) return;
    const avail = getAvailableStock(item.id), batches = extractBatches(item.id, purchaseSources, true);
    const iu = getItemAvailableUnits(item), bu = getBaseUnit(item) || 'unit';
    const pd = calcPricesForUom(item, 'retail', 1);
    const focusQty = (lineId) => { lastAddedLineIdRef.current = lineId; };

    if (stockControlEnabled && avail <= 0) {
      const lastBP = getLastBatchPrice(item.id, purchaseSources, 'retail');
      if (!lastBP) { showToast(`⛔ "${item.name}" stock is 0!`); return; }
      showToast(`⚠️ "${item.name}" stock 0 — ${t.lastBatchPrice}`);
      setInvoiceItems(prev => {
        if (!Array.isArray(prev)) return prev;
        const existing = prev.find(i => i && i.itemId === item.id && !i.warrantyCode?.trim());
        if (existing) { const key = existing.lineId || existing.itemId; focusQty(key); return prev.map(i => i && (i.lineId || i.itemId) === key ? enrichLine({ ...i, qty: R2(i.qty + 1), allBatches: batches }) : i); }
        const wi = getWarrantyInfo(item), nid = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        focusQty(nid);
        return [enrichLine({ itemId: item.id, name: item.name, nameSi: getSinhala(item), photoURL: getItemImg(item), sellingPrice: lastBP.original, yourPrice: lastBP.net, discAmount: R2(lastBP.original - lastBP.net), discountPercent: lastBP.discount, qty: 1, maxStock: 0, priceType: 'retail', originalItem: item, rack: getRack(item), uom: bu, uomName: bu, availableUnits: iu, uomFactor: 1, warrantyCode: wi.code, warrantyPeriod: wi.period, lineId: nid, allBatches: batches, preferredBatchId: '', manualPriceOverride: false, negativeStock: true, lastBatchInfo: lastBP }), ...prev];
      });
      setItemSearch(''); setShowItemDropdown(false); return;
    }

    setInvoiceItems(prev => {
      if (!Array.isArray(prev)) return prev;
      const existing = prev.find(i => i && i.itemId === item.id && !i.warrantyCode?.trim());
      if (existing) {
        const key = existing.lineId || existing.itemId, nq = R2(existing.qty + 1);
        const f = Math.max(0.0001, R2(existing.uomFactor || 1)), maxD = R2(getAvailableStock(item.id, key) * f);
        if (stockControlEnabled && nq > maxD + 0.001) { showToast(`⚠️ ${t.maxLabel}: ${fmtQ(maxD)}`); return prev; }
        focusQty(key);
        return prev.map(i => i && (i.lineId || i.itemId) === key ? enrichLine({ ...i, qty: nq, allBatches: batches }) : i);
      }
      const wi = getWarrantyInfo(item), nid = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      focusQty(nid);
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

  useEffect(() => {
    let buf = '', timer = null, lastKey = 0;
    const h = (e) => {
      if (e.ctrlKey || e.altKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return;
      const now = Date.now();
      if (e.key === 'Enter') { e.preventDefault(); if (buf.length >= 3) handleBarcodeScanned(buf); buf = ''; clearTimeout(timer); return; }
      if (e.key === 'Exchange' || e.key.length === 1) { if (now - lastKey > 300) buf = ''; lastKey = now; buf += e.key; clearTimeout(timer); timer = setTimeout(() => { buf = ''; }, 200); }
    };
    window.addEventListener('keydown', h);
    return () => { window.removeEventListener('keydown', h); clearTimeout(timer); };
  }, [handleBarcodeScanned]);

  /* ── Update item fields inline ── */
  const updateItemField = useCallback((key, field, value) => {
    setInvoiceItems(prev => {
      if (!Array.isArray(prev)) return prev;
      return prev.map(item => {
        if (!item || (item.lineId || item.itemId) !== key) return item;
        let u = { ...item };

        if (field === 'selectedBatch') {
          u.preferredBatchId = value?.batchId || '';
          u.selectedBatch = value || null;
          u.manualPriceOverride = false;
          return enrichLine(u);
        }

        if (field === 'warrantyCode') {
          u.warrantyCode = String(value).trim();
          if (u.warrantyCode) u.qty = 1;
          return enrichLine(u);
        }

        if (field === 'warrantyPeriod') {
          u.warrantyPeriod = value;
          return u;
        }

        if (field === 'uom') {
          const newUom = value;
          const baseUomName = u.uomName || getBaseUnit(u.originalItem) || 'unit';
          const units = u.availableUnits || getItemAvailableUnits(u.originalItem) || [];
          const nf = Math.max(0.0001, getUomFactor(newUom, baseUomName, units));
          u.uom = newUom;
          u.uomFactor = nf;
          const pd = calcPricesForUom(u.originalItem, u.priceType || 'retail', nf);
          u.sellingPrice = pd.sellingPrice;
          u.yourPrice = pd.yourPrice;
          u.discountPercent = pd.discountPercent;
          u.discAmount = pd.discAmount;
          u.manualPriceOverride = false;
          return enrichLine(u);
        }

        if (field === 'qty') {
          const req = R2(value);
          if (item?.warrantyCode?.trim() || req <= 0) return item;
          const f = Math.max(0.0001, R2(u.uomFactor || 1));
          const maxD = R2(getAvailableStock(item.itemId, key) * f);
          if (stockControlEnabled && !item.negativeStock && req > maxD + 0.001) {
            showToast(`⚠️ ${t.maxLabel}: ${fmtQ(maxD)} ${u.uom || ''}`);
            return item;
          }
          u.qty = req;
          return enrichLine(u);
        }

        if (field === 'priceType') {
          u.priceType = value;
          const f = Math.max(0.0001, R2(u.uomFactor || 1));
          const pd = calcPricesForUom(u.originalItem, value, f);
          u.sellingPrice = pd.sellingPrice;
          u.yourPrice = pd.yourPrice;
          u.discountPercent = pd.discountPercent;
          u.discAmount = pd.discAmount;
          u.manualPriceOverride = false;
          return enrichLine(u);
        }

        if (field === 'sellingPrice') {
          const sp = R2(value); u.sellingPrice = sp;
          const dp = R2(u.discountPercent || 0), oldDA = R2(u.discAmount || 0);
          if (dp > 0) { u.discAmount = R2(sp * (dp / 100)); u.yourPrice = R2(sp - u.discAmount); }
          else if (oldDA > 0) { u.discAmount = Math.min(oldDA, sp); u.yourPrice = R2(sp - u.discAmount); u.discountPercent = sp > 0 ? R2((u.discAmount / sp) * 100) : 0; }
          else { u.discAmount = 0; u.discountPercent = 0; u.yourPrice = sp; }
          u.manualPriceOverride = true; return enrichLine(u);
        }

        if (field === 'discountPercent') {
          const p = Math.max(0, Math.min(100, R2(value)));
          u.discountPercent = p; u.discAmount = R2(u.sellingPrice * (p / 100));
          u.yourPrice = R2(u.sellingPrice - u.discAmount); u.manualPriceOverride = true; return enrichLine(u);
        }

        if (field === 'discAmount') {
          const a = Math.max(0, Math.min(R2(value), u.sellingPrice));
          u.discAmount = a; u.yourPrice = R2(u.sellingPrice - a);
          u.discountPercent = u.sellingPrice > 0 ? R2((a / u.sellingPrice) * 100) : 0;
          u.manualPriceOverride = true; return enrichLine(u);
        }

        if (field === 'yourPrice') {
          const yp = Math.max(0, Math.min(R2(value), u.sellingPrice));
          u.yourPrice = yp; u.discAmount = R2(u.sellingPrice - yp);
          u.discountPercent = u.sellingPrice > 0 ? R2(((u.sellingPrice - yp) / u.sellingPrice) * 100) : 0;
          u.manualPriceOverride = true; return enrichLine(u);
        }

        u[field] = value; return enrichLine(u);
      });
    });
  }, [enrichLine, getAvailableStock, stockControlEnabled, showToast, t]);

  const removeItem = useCallback((key) => {
    setInvoiceItems(prev => Array.isArray(prev) ? prev.filter(i => i && (i.lineId || i.itemId) !== key) : prev);
    setWarrantyVisibility(p => { const u = { ...p }; delete u[key]; return u; });
    setBatchVisibility(p => { const u = { ...p }; delete u[key]; return u; });
    delete qtyInputRefs.current[key];
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
    const isDigits = /^[\d\+\s\-]+$/.test(raw), normSearch = normalizePhone(raw);
    return allCustomers.filter(c => {
      if (isDigits && c.phone) { const nc = normalizePhone(c.phone); if (nc.includes(normSearch)) return true; }
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

  /* ── New customer creation ── */
  const handleShowNewCustomerWithPreFill = useCallback((searchText) => {
    const txt = searchText.trim(), isPhone = /^[\d\+\s\-]+$/.test(txt);
    let phonePrefill = '+94';
    if (isPhone) { let d = txt.replace(/[^\d]/g, ''); if (d.startsWith('0')) d = d.substring(1); if (d.startsWith('94')) d = d.substring(2); phonePrefill = '+94' + d; }
    setNewCustomer({ name: isPhone ? '' : txt, phone: phonePrefill, address: '', creditLimit: 0, profilePicture: '' });
    setShowNewCustomerModal(true); setShowCustomerDropdown(false); setCustomerSearch('');
  }, []);

  const handlePickContact = async () => {
    const contact = await pickContactFromPhone();
    if (!contact) { showToast(t.contactsNotSupported); return; }
    let rp = ''; if (contact.photo) rp = await resizeImage(contact.photo, 200);
    setNewCustomer(prev => ({ ...prev, name: contact.name || prev.name, phone: contact.phone || prev.phone, profilePicture: rp || prev.profilePicture }));
    if (contact.name || contact.phone) showToast(`✅ ${contact.name || 'Contact'} loaded!`);
  };

  const handlePhotoCapture = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    try { const b64 = await blobToBase64(file), resized = await resizeImage(b64, 200); setNewCustomer(prev => ({ ...prev, profilePicture: resized })); }
    catch { showToast(t.imageError); }
  };

  const handleCreateCustomer = async () => {
    if (!newCustomer.name || !newCustomer.phone) return showToast('⚠️ Name + Phone required');
    setSaving(true);
    try {
      const cd = { uid: user.uid, name: newCustomer.name, phone: newCustomer.phone, address: newCustomer.address || '', creditLimit: R2(newCustomer.creditLimit), currentBalance: 0, profilePicture: newCustomer.profilePicture || '', createdAt: new Date().toISOString() };
      const custRef = doc(collection(db, 'customers')); const cr = { id: custRef.id }; try { await localDb.customers.put({ id: cr.id, ...cd, synced: false, _localSaved: true }); } catch(e) {} try { await Promise.race([setDoc(custRef, cd), new Promise((_,rej) => setTimeout(() => rej(new Error('timeout')), 4000))]); try { await localDb.customers.update(cr.id, { synced: true }); } catch(e2) {} } catch(e3) { console.warn('[Offline] Customer Firestore skipped'); }
      if (isMountedRef.current) { setSelectedCustomer({ id: cr.id, ...cd }); setShowNewCustomerModal(false); setNewCustomer({ name: '', phone: '+94', address: '', creditLimit: 0, profilePicture: '' }); showToast(t.customerCreated); }
    } catch (e) { if (isMountedRef.current) showToast(`❌ ${e.message}`); }
    finally { if (isMountedRef.current) setSaving(false); }
  };

  /* ── Clear pos state ── */
  const clearForm = useCallback(() => {
    setInvoiceItems([]); setBillDiscountPercent(0); setBillDiscount(0); setExchangeAmount(0); setPayAmount(0);
    setPaymentMethod('cash'); setInvoiceRemark(''); setShowRemarkInput(false); setSelectedCustomer(null);
    setCustomerSearch(''); setWarrantyVisibility({}); setBatchVisibility({}); setItemSearch('');
    setShowItemDropdown(false); setLastScannedDisplay(''); setOrderLoaded(false);
    qtyInputRefs.current = {}; lastAddedLineIdRef.current = null;
    setTimeout(() => { if (itemSearchInputRef.current) itemSearchInputRef.current.focus(); }, 150);
  }, []);

  const ensurePortalKey = useCallback(async (cust) => {
    if (!cust || cust.id === 'CASH_CUSTOMER' || cust.id === 'TEMP_ORDER_CUSTOMER') return cust;
    if (cust.portalAccessKey) return cust;
    const key = `${cust.id.slice(0, 8)}_${Date.now().toString(36)}`;
    try { await updateDoc(doc(db, 'customers', cust.id), { portalAccessKey: key }); const updated = { ...cust, portalAccessKey: key }; setSelectedCustomer(updated); return updated; }
    catch (e) { console.warn('Portal key error:', e); return cust; }
  }, []);
  /* ══════════════════════════════════════════════
     📊 PENDING SYNC COUNT
  ══════════════════════════════════════════════ */
  const loadPendingSyncCount = useCallback(async () => {
    try {
      if (!user?.uid) return;
      const unsynced = await localDb.invoices
  .where('uid').equals(user.uid)
  .and(r => r.synced === false || r.synced === 0 || r._synced === false || r._synced === 0)
  .toArray();
      setPendingSyncCount(unsynced ? unsynced.length : 0);
    } catch (err) {
      console.warn('⚠️ Pending count error:', err);
    }
  }, [user?.uid]);

  /* ══════════════════════════════════════════════
     📁 OPEN BACKUP FOLDER
  ══════════════════════════════════════════════ */
  const handleOpenBackupFolder = async () => {
    console.log('🔍 [POS Backup] Button clicked');
    try {
      if (typeof window !== "undefined" && window.electronAPI?.openBackupFolder) {
        const savedPath = localStorage.getItem("pos_backup_path") || null;
        await window.electronAPI.openBackupFolder(savedPath);
        showToast('📁 Backup ෆෝල්ඩරය විවෘත කරන ලදී.');
        return;
      }
      if (typeof window !== "undefined" && typeof window.showDirectoryPicker === "function") {
        try {
          const dirHandle = await window.showDirectoryPicker({ mode: "read" });
          showToast('📁 Backup Folder: ' + dirHandle.name);
          localStorage.setItem("pos_backup_path", dirHandle.name);
          return;
        } catch (pickerErr) {
          if (pickerErr.name === "AbortError") return;
          if (pickerErr.name === "SecurityError" || pickerErr.name === "NotAllowedError") {
            showToast('⚠️ Browser එකෙන් folder access block කර ඇත.');
            return;
          }
          throw pickerErr;
        }
      }
      const fallbackInput = document.createElement("input");
      fallbackInput.type = "file";
      fallbackInput.webkitdirectory = true;
      fallbackInput.mozdirectory = true;
      fallbackInput.directory = true;
      fallbackInput.style.display = "none";
      fallbackInput.onchange = (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
          const folderName = files[0].webkitRelativePath.split("/")[0];
          showToast('📁 Backup Folder: ' + folderName);
          localStorage.setItem("pos_backup_path", folderName);
        }
        document.body.removeChild(fallbackInput);
      };
      fallbackInput.oncancel = () => { document.body.removeChild(fallbackInput); };
      document.body.appendChild(fallbackInput);
      fallbackInput.click();
    } catch (err) {
      console.error("❌ [POS Backup] Error:", err);
      showToast('❌ Backup Folder error: ' + (err?.message || 'Unknown'));
    }
  };

    /* ══════════════════════════════════════════════
     🔄 SYNC PENDING INVOICES TO CLOUD
  ══════════════════════════════════════════════ */
  const handleSyncPendingInvoices = useCallback(async () => {
    if (syncingCloud) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      showToast('🔌 Offline — Sync කළ නොහැක.');
      return;
    }
    if (!user?.uid) return;

    setSyncingCloud(true);
    showToast('🔄 Syncing pending invoices...');

    try {
      const INTERNAL_FLAGS = ['synced', '_synced', '_deductedAt', '_localSaved', '_pendingBatchUpdates', '_savedAt'];
      const unsynced = await localDb.invoices
        .where('uid').equals(user.uid)
        .and(r => r.synced === false || r.synced === 0 || r._synced === false || r._synced === 0)
        .toArray();

      if (!unsynced || unsynced.length === 0) {
        showToast('✅ Sync කිරීමට බිල්පත් නොමැත.');
        setPendingSyncCount(0);
        return;
      }

      let successCount = 0;
      const BATCH_SIZE = 100;

      for (let i = 0; i < unsynced.length; i += BATCH_SIZE) {
        const batch = unsynced.slice(i, i + BATCH_SIZE);
        const wb = writeBatch(db);

        // Aggregate: itemId -> totalDeduct
        const itemDeductions = {};
        // Aggregate: customerId -> totalDelta
        const customerDeltas = {};
        // Batch source updates
        const batchSourceUpdates = [];

        for (const inv of batch) {
          const invId = inv.id || inv.invoiceNo;
          if (!invId) continue;

          // 1️⃣ Invoice data → Firestore (clean, no internal flags)
          const cleanData = {};
          for (const [key, val] of Object.entries(inv)) {
            if (!INTERNAL_FLAGS.includes(key)) cleanData[key] = val;
          }
          wb.set(doc(db, 'invoices', invId), {
            ...cleanData, uid: user.uid, synced: true, updatedAt: new Date().toISOString()
          }, { merge: true });

          // 2️⃣ Collect item stock deductions from snap.items
          const snapItems = inv.snap?.items || inv.items || [];
          for (const item of snapItems) {
            const itemId = item.itemId || item.id;
            if (!itemId) continue;
            const uomFactor = Number(item.uomFactor || 1);
            const qty = Number(item.qty || 0);
            const deduct = qty * uomFactor;
            if (deduct > 0) {
              itemDeductions[itemId] = (itemDeductions[itemId] || 0) + deduct;
            }
          }

          // 3️⃣ Collect customer balance delta
          if (inv.customerId && inv.newOutstanding !== undefined && inv.customerBalanceBefore !== undefined) {
            const delta = Number(inv.newOutstanding || 0) - Number(inv.customerBalanceBefore || 0);
            if (delta !== 0) {
              customerDeltas[inv.customerId] = (customerDeltas[inv.customerId] || 0) + delta;
            }
          }

          // 4️⃣ Collect batch source updates (purchase/stockIn docs)
          if (inv._pendingBatchUpdates && Array.isArray(inv._pendingBatchUpdates)) {
            batchSourceUpdates.push(...inv._pendingBatchUpdates);
          }
        }

        // 5️⃣ Apply stock deductions to Firestore items
        for (const [itemId, totalDeduct] of Object.entries(itemDeductions)) {
          if (totalDeduct > 0) {
            wb.update(doc(db, 'items', itemId), {
              stock: increment(-totalDeduct),
              currentStock: increment(-totalDeduct),
              'stocks.Main_Store': increment(-totalDeduct),
            });
          }
        }

        // 6️⃣ Apply customer balance deltas to Firestore
        for (const [custId, totalDelta] of Object.entries(customerDeltas)) {
          if (totalDelta !== 0) {
            wb.update(doc(db, 'customers', custId), {
              currentBalance: increment(totalDelta),
              outstanding: increment(totalDelta),
            });
          }
        }

        // 7️⃣ Apply batch source updates to Firestore
        for (const bsu of batchSourceUpdates) {
          if (bsu.docPath && bsu.updates) {
            const parts = bsu.docPath.split('/');
            if (parts.length >= 2) {
              wb.update(doc(db, ...parts), bsu.updates);
            }
          }
        }

        try {
          await wb.commit();
          successCount += batch.length;

          // 8️⃣ Mark invoices as synced in Dexie
          for (const inv of batch) {
            const invId = inv.id || inv.invoiceNo;
            if (invId) {
              await localDb.invoices.update(invId, {
                synced: true, _synced: true, _localSaved: false,
                _deductedAt: null, _pendingBatchUpdates: null
              });
            }
          }

          // 9️⃣ Mark deducted items as synced in Dexie
          const deductedIds = Object.keys(itemDeductions);
          if (deductedIds.length > 0) {
            await localDb.items
              .where('id').anyOf(deductedIds)
              .modify({ _synced: true, _deductedAt: null });
          }

          console.log(`✅ [Sync] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} invoices, ${deductedIds.length} items deducted, ${Object.keys(customerDeltas).length} customers updated`);
        } catch (batchErr) {
          console.error('❌ [POS Sync] Batch error:', batchErr);
        }
      }

      // 🔟 Refresh local UI from Dexie
      try {
        const freshItems = await localDb.items.where('uid').equals(user.uid).toArray();
        const freshCusts = await localDb.customers.where('uid').equals(user.uid).toArray();
        if (typeof setAllItems === 'function') setAllItems(freshItems);
        if (typeof setAllCustomers === 'function') setAllCustomers(freshCusts);
      } catch (e) {
        console.warn('[Sync] Refresh warning:', e);
      }

      setPendingSyncCount(Math.max(0, unsynced.length - successCount));
      showToast(successCount > 0
        ? `✅ බිල්පත් ${successCount} ක් sync විය (stock + balances).`
        : '❌ Sync අසාර්ථකයි.');
    } catch (err) {
      console.error('❌ [POS Sync] Error:', err);
      showToast('❌ Sync error: ' + (err?.message || 'Unknown'));
    } finally {
      setSyncingCloud(false);
    }
  }, [syncingCloud, user?.uid, showToast, setAllItems, setAllCustomers]);

  /* ══════════════════════════════════════════════
     🔄 AUTO-SYNC: Load + Online + Periodic
  ══════════════════════════════════════════════ */
  useEffect(() => {
    if (!user?.uid) return;
    loadPendingSyncCount();

    const doAutoSync = async () => {
      if (autoSyncLockRef.current) return;
      if (typeof navigator === 'undefined' || !navigator.onLine) return;
      if (!autoSync) return;
      try {
        const unsynced = await localDb.invoices
          .where('uid').equals(user.uid)
          .and(r => r.synced === false || r.synced === 0 || r._synced === false || r._synced === 0)
          .toArray();
        if (!unsynced || unsynced.length === 0) {
          setPendingSyncCount(0);
          return;
        }
        setPendingSyncCount(unsynced.length);
        autoSyncLockRef.current = true;
        console.log('🔄 [POS Auto-Sync]', unsynced.length, 'pending');
        await handleSyncPendingInvoices();
      } catch (err) {
        console.error('❌ [POS Auto-Sync]', err);
      } finally {
        setTimeout(() => { autoSyncLockRef.current = false; }, 15000);
      }
    };

    const mountTimer = setTimeout(doAutoSync, 5000);
    const handleOnline = () => {
      autoSyncLockRef.current = false;
      setTimeout(doAutoSync, 3000);
    };
    window.addEventListener('online', handleOnline);
    const intervalTimer = setInterval(() => {
      loadPendingSyncCount();
      if (typeof navigator !== 'undefined' && navigator.onLine) doAutoSync();
    }, 60000);

    return () => {
      clearTimeout(mountTimer);
      clearInterval(intervalTimer);
      window.removeEventListener('online', handleOnline);
    };
  }, [user?.uid, autoSync, loadPendingSyncCount, handleSyncPendingInvoices]);

/* ── Process and save invoice ── */
  // ✅ FIX: Safely check navigator.onLine directly and handle local & online saves
  const handleSaveInvoice = useCallback(async (actionType) => {
    if (!safeInvoiceItems.length || savingRef.current) return;
    savingRef.current = true;
    if (paymentMethod === 'etransfer' && !selectedBankAccountId) { savingRef.current = false; return showToast(t.selectBankPlease); }
    if (actionType !== 'draft' && !isFullyPaid && !isPersistedCustomer(selectedCustomer)) { savingRef.current = false; return showToast(`⚠️ ${t.customerRequired}`); }

    setSaving(true);

    // Live customer balance fetch
    let customerBalanceBefore = 0;
    if (isPersistedCustomer(selectedCustomer)) {
      try {
        const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
        let custSnap = null;
        if (isOnline) {
          try {
            custSnap = await Promise.race([
              getDoc(doc(db, 'customers', selectedCustomer.id)),
              new Promise((_, rej) => setTimeout(() => rej(new Error('getDoc timeout')), 3000))
            ]);
          } catch(e) {
            console.warn('[Offline] getDoc skipped');
          }
        }
        if (custSnap && custSnap.exists()) {
          customerBalanceBefore = R2(custSnap.data().currentBalance || 0);
        } else {
          customerBalanceBefore = R2(selectedCustomer.currentBalance || 0);
        }
      } catch (e) {
        console.warn('Live balance fetch failed:', e.message);
        customerBalanceBefore = R2(selectedCustomer.currentBalance || 0);
      }
    }

    const actualCashReceived = R2(Math.min(payAmount, finalNetAmount));
    const { isCreditSale, creditAmount, isFullCredit } = getCreditSaleInfo(actualCashReceived, finalNetAmount);

    const customerBalanceAfter = isCreditSale
      ? R2(customerBalanceBefore + creditAmount)
      : R2(customerBalanceBefore + (balance < -0.01 ? balance : 0));

    const snap = snapshotInvoiceState({ safeInvoiceItems, selectedCustomer, finalNetAmount, payAmount, balance, paymentMethod, subTotal, billDiscountPercent, billDiscount, exchangeAmount, totalDiscount, invoiceRemark, selectedBankAccountId, selectedBankAccount });
    const _batchUpdateMap = buildBatchUpdateMap(snap.items);

    // Generate IDs first (works offline)
    const invRef = doc(collection(db, actionType === 'draft' ? 'drafts' : 'invoices'));
    const invoiceId = invRef.id, invoiceNo = `INV-${invoiceId.slice(0, 8).toUpperCase()}`;
    const { totalCost, hasCost } = calculateCostSummary(snap.items);
    const totalSellingRevenue = calculateSellingRevenue(snap.items);
    const invoicePayload = buildInvoicePayload({
      user, snap, invoiceNo, actionType, mode, isFullCredit,
      previousOutstanding: customerBalanceBefore,
      newOutstanding:      customerBalanceAfter
    });

    // STEP 1: Dexie local save FIRST (always works offline)
    let dexieSaved = false;
    try {
      await localDb.invoices.put({
        id: invoiceId, invoiceNo, uid: user.uid,
        ...invoicePayload,
        _localSaved: true, _synced: false, synced: 0,
        _pendingBatchUpdates: Object.keys(_batchUpdateMap).length > 0 ? _batchUpdateMap : null,
        _savedAt: new Date().toISOString()
      });
      dexieSaved = true;

      if (actionType !== 'draft') {
        try {
          await applyBatchSourceUpdatesLocal(snap.items);
          console.log('[Offline] Stock deducted in Dexie via applyBatchSourceUpdatesLocal');
        } catch (deductErr) {
          console.error('[Offline] Stock deduction failed:', deductErr);
        }
      }

      try {
        const updatedItems = await localDb.items.where('uid').equals(user.uid).toArray();
        if (isMountedRef.current && updatedItems.length > 0) {
          setAllItems(updatedItems);
        }
      } catch(e) { console.warn('[Offline] setAllItems failed:', e); }

      if (selectedCustomer && actionType !== 'draft') {
        try {
          await localDb.customers.update(selectedCustomer.id, {
            currentBalance: customerBalanceAfter, _synced: false, _localSaved: true, synced: 0
          });
          if (isMountedRef.current) {
            setAllCustomers(prev => {
              if (!Array.isArray(prev)) return prev;
              return prev.map(c =>
                c.id === selectedCustomer.id
                  ? { ...c, currentBalance: customerBalanceAfter }
                  : c
              );
            });
            setSelectedCustomer(prev =>
              prev && prev.id === selectedCustomer.id
                ? { ...prev, currentBalance: customerBalanceAfter }
                : prev
            );
          }
        } catch(e) { console.warn('Local customer update:', e.message); }
      }
    } catch (dexErr) {
      console.error('[Dexie] Save failed:', dexErr);
    }

    // STEP 2: Try Firestore (may fail offline)
    let firestoreOk = false;
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;

    if (isOnline) {
      try {
        const fbBatch = writeBatch(db);
        fbBatch.set(invRef, invoicePayload);
        if (actionType !== 'draft') {
          const deductions = buildDeductionMap(snap.items);
          Object.entries(deductions).forEach(([id, qty]) => {
            fbBatch.update(doc(db, 'items', id), {
              stock: increment(-qty),
              currentStock: increment(-qty),
              'stocks.Main_Store': increment(-qty)
            });
          });
          await applyBatchSourceUpdates(fbBatch, buildBatchUpdateMap(snap.items));
          if (isPersistedCustomer(snap.customer)) {
            const balanceDelta = R2(customerBalanceAfter - customerBalanceBefore);
            if (balanceDelta !== 0) {
              fbBatch.update(doc(db, 'customers', snap.customer.id), {
                currentBalance: increment(balanceDelta),
                outstanding: increment(balanceDelta),
              });
            }
          }
          if (snap.paymentMethod === 'etransfer' && snap.bankAccountId && snap.bankAccount) {
            fbBatch.update(doc(collection(db, `users/${user.uid}/bankTransactions`)), { type: 'deposit', accountId: snap.bankAccountId, amount: R2(snap.payAmount), date: new Date().toISOString(), description: `Invoice - ${snap.customer.name}`, createdAt: new Date().toISOString(), source: 'pos-invoice', invoiceId });
          }
          if (snap.netAmount > 0) {
            fbBatch.set(doc(collection(db, `users/${user.uid}/cashTransactions`)), buildCashTransactionPayload({ user, snap, invoiceId, invoiceNo, mode, actualCashReceived, totalSellingRevenue, totalCost, hasCost, isCreditSale, creditAmount, isFullCredit }));
          }
        }
        await Promise.race([fbBatch.commit(), new Promise((_, rej) => setTimeout(() => rej(new Error("Firestore timeout")), 5000))]);
        firestoreOk = true;
        if (dexieSaved) { try { await localDb.invoices.update(invoiceId, { _synced: true, synced: 1 }); } catch(e2) {} }

        if (actionType !== 'draft') {
          try {
            const deductionIds = Object.keys(buildDeductionMap(snap.items));
            for (const itemId of deductionIds) {
              await localDb.items.update(itemId, { _synced: true, synced: 1, _deductedAt: null });
            }
            if (isPersistedCustomer(snap.customer)) {
              try { await localDb.customers.update(snap.customer.id, { _synced: true, synced: 1 }); } catch(e3) {}
            }
          } catch (e) {
            console.warn('[Sync] Failed to mark items synced:', e.message);
          }
        }
      } catch (fsErr) {
        console.warn('[Offline] Firestore skipped:', fsErr.message);
      }
    }

    // STEP 3: Result
    if (!isMountedRef.current) { savingRef.current = false; return; }

    try {
      const updatedCusts = await localDb.customers.where('uid').equals(user.uid).toArray();
      if (isMountedRef.current && updatedCusts.length > 0) setAllCustomers(updatedCusts);
      const updatedItems = await localDb.items.where('uid').equals(user.uid).toArray();
      if (isMountedRef.current && updatedItems.length > 0) setAllItems(updatedItems);
    } catch(e) { console.warn('[Save] Post-save refresh:', e); }

    if (firestoreOk) {
      showToast(`✅ ${t.successMsg}`);
    } else if (dexieSaved) {
      showToast(`⚠️ Offline save — online උනාම sync වේ`);
    } else {
      showToast(`❌ Save failed`);
    }
    
    if (actionType === 'print' || actionType === 'link') {
      try {
        const custWithKey = actionType === 'link' ? await ensurePortalKey(snap.customer) : snap.customer;
        setOutputInvoice(buildOutputInvoicePayload({ invoiceId, invoiceNo, user, snap, isFullCredit, actionType, custWithKey, previousOutstanding: customerBalanceBefore, newOutstanding: customerBalanceAfter }));
      } catch(e3) { console.warn('Output err:', e3); }
    }
    clearForm();
    try { if (typeof syncAll === 'function') syncAll(); } catch(e4) {}
    try { if (typeof triggerLocalDiskBackup === 'function') triggerLocalDiskBackup(); } catch(e5) {}
    savingRef.current = false;
    setSaving(false);
  }, [safeInvoiceItems, paymentMethod, selectedBankAccountId, selectedCustomer, isFullyPaid, finalNetAmount, payAmount, balance, subTotal, billDiscountPercent, billDiscount, exchangeAmount, totalDiscount, invoiceRemark, selectedBankAccount, user, mode, clearForm, ensurePortalKey, showToast, t]);

  /* ══════════════════════════════════════════════════════════════
     RENDER LAYOUT
  ══════════════════════════════════════════════════════════════ */
  return (
    <div style={{ padding: 10, backgroundColor: '#f8fafc', minHeight: '100vh', paddingBottom: 100 }}>
      <style>{printStyles}</style>
      <style>{inputFixStyles}</style>
      <style>{badgeStyles}</style>
      <style>{keyboardStyles}</style>

      {toastMsg && (<div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', background: '#334155', color: '#fff', padding: '10px 20px', borderRadius: 8, zIndex: 9999, maxWidth: '90%', textAlign: 'center' }}>{toastMsg}</div>)}

      {!dataReady && (<div style={{ textAlign: 'center', padding: 40 }}><div style={{ fontSize: 32, marginBottom: 10 }}>⏳</div><div style={{ color: '#64748b', fontWeight: 'bold' }}>{t.loadingItems}</div></div>)}

      {outputInvoice && (
        <InvoiceOutputManager
          invoice={outputInvoice}
          initialMode={outputInvoice.initialMode || 'print'}
          onClose={() => { setOutputInvoice(null); setTimeout(() => { if (itemSearchInputRef.current) itemSearchInputRef.current.focus(); }, 200); }}
        />
      )}

      {/* Keyboard help shortcuts */}
      <div className="no-print kb-help-bar">
        <span style={{ color: '#fbbf24', fontSize: 11, fontWeight: 900, marginRight: 4 }}>⌨️</span>
        {[['F1', 'භාණ්ඩ'], ['F2', 'පාරිභෝගික'], ['F3', 'Pay'], ['F4', 'ගෙවීම'], ['F5', 'Full'], ['F6', 'Scan'], ['F7', 'Draft'], ['F8', 'Save'], ['F9', 'WA'], ['F10', 'Print'], ['F12', 'Clear'], ['U', 'Unit'], ['↑↓', 'Nav'], ['Enter', 'Select'], ['Del', 'Remove']].map(([k, d]) => (
          <React.Fragment key={k}><span className="kb-help-key">{k}</span><span className="kb-help-desc">{d}</span></React.Fragment>
        ))}
      </div>

      {/* HEADER CONTROLS */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>🧾 {t.title}</h2>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => { setStockControlEnabled(p => !p); showToast(stockControlEnabled ? t.stockOff : t.stockOn); }} style={{ padding: '7px 10px', borderRadius: 10, fontSize: 11, fontWeight: 800, cursor: 'pointer', border: stockControlEnabled ? '2px solid #16a34a' : '2px solid #f59e0b', background: stockControlEnabled ? '#f0fdf4' : '#fffbeb', color: stockControlEnabled ? '#16a34a' : '#b45309' }}>{stockControlEnabled ? '🔒' : '🔓'}</button>
          <button onClick={() => setShowProfit(p => !p)} style={{ padding: '7px 10px', borderRadius: 10, fontSize: 11, fontWeight: 800, cursor: 'pointer', border: showProfit ? '2px solid #16a34a' : '2px solid #94a3b8', background: showProfit ? '#f0fdf4' : '#f8fafc', color: showProfit ? '#16a34a' : '#64748b' }}>{showProfit ? '📈' : '📊'}</button>
          {pendingSyncCount > 0 && (
            <button onClick={handleSyncPendingInvoices} disabled={syncingCloud} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f59e0b', color: 'white', border: 'none', padding: '7px 11px', borderRadius: 8, fontSize: 12, fontWeight: 'bold', cursor: syncingCloud ? 'wait' : 'pointer', opacity: syncingCloud ? 0.7 : 1 }}>
              <span>☁️ Sync ({pendingSyncCount})</span>
            </button>
          )}
          <button onClick={handleOpenBackupFolder} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#334155', color: 'white', border: 'none', padding: '7px 11px', borderRadius: 8, fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>
            <span>📁 Backup</span>
          </button>
          <button onClick={() => { window.location.href = '/invoice-list'; }} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '7px 11px', borderRadius: 8, fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>📋 {t.invoiceListPage}</button>
          <button onClick={() => { window.location.href = '/approved'; }} style={{ background: approvedCount > 0 ? 'linear-gradient(135deg,#16a34a,#15803d)' : '#16a34a', color: 'white', border: 'none', padding: '7px 11px', borderRadius: 8, fontSize: 12, fontWeight: 'bold', cursor: 'pointer', position: 'relative' }}>
            📋 {t.approvedLabel}
            {approvedCount > 0 && <span style={{ position: 'absolute', top: -7, right: -7, background: '#ef4444', color: 'white', fontSize: 10, fontWeight: 900, minWidth: 20, height: 20, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', border: '2px solid white' }}>{approvedCount}</span>}
          </button>
          {pendingOrderCount > 0 && (<button onClick={() => { window.location.href = '/customer-orders'; }} style={{ background: 'linear-gradient(135deg,#f59e0b,#d77706)', color: 'white', border: 'none', padding: '7px 11px', borderRadius: 8, fontSize: 12, fontWeight: 'bold', cursor: 'pointer', position: 'relative' }}>⏳ {t.pendingLabel}<span style={{ position: 'absolute', top: -7, right: -7, background: '#dc2626', color: 'white', fontSize: 10, fontWeight: 900, minWidth: 20, height: 20, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', border: '2px solid white' }}>{pendingOrderCount}</span></button>)}
          <button onClick={() => { window.location.href = '/return'; }} style={{ background: '#dc2626', color: 'white', border: 'none', padding: '7px 11px', borderRadius: 8, fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>↩️ {t.returnLabel}</button>
          {safeInvoiceItems.length > 0 && (<button onClick={clearForm} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', padding: '7px 11px', borderRadius: 6, fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>🗑️ <span className="kb-shortcut-badge">F12</span></button>)}
        </div>
      </div>

      {/* MOBILE SCANNER */}
      <div className="no-print" style={{ marginBottom: 10 }}>
        <button onClick={() => setShowScanner(true)} style={{ width: '100%', padding: 14, background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: 'white', border: 'none', borderRadius: 10, fontWeight: 'bold', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          📷 {t.scannerBtn} <span className="kb-shortcut-badge">F6</span>
          {lastScannedDisplay && <span style={{ fontSize: 13, background: lastScannedDisplay.includes('✅') ? 'rgba(255,255,255,0.3)' : 'rgba(239,68,68,0.5)', padding: '2px 10px', borderRadius: 8 }}>{lastScannedDisplay}</span>}
        </button>
      </div>
      {typeof MobileBarcodeScanner !== 'undefined' && <MobileBarcodeScanner isOpen={showScanner} onClose={() => setShowScanner(false)} onScan={handleBarcodeScanned} />}

      {/* MAIN ITEM SEARCH */}
      <div ref={itemSearchContainerRef} className="no-print" style={{ marginBottom: 10, position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          <input ref={itemSearchInputRef} placeholder={`${t.searchItem} [F1]`} value={itemSearch}
            onChange={e => { setItemSearch(e.target.value); setShowItemDropdown(true); setActiveItemIdx(0); }}
            onFocus={() => { if (itemSearch) setShowItemDropdown(true); }}
            onKeyDown={(e) => typeof handleItemSearchKeyDown === 'function' ? handleItemSearchKeyDown(e) : null}
            style={{ width: '100%', padding: 14, paddingRight: 50, borderRadius: 8, border: '2px solid #3b82f6', fontSize: 16, boxSizing: 'border-box' }} />
          <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#94a3b8', fontWeight: 800, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, border: '1px solid #e2e8f0' }}>F1</span>
        </div>
        {showItemDropdown && itemSearch && filteredItems.length > 0 && (
          <div onTouchStart={itemTouch?.onTouchStart} onTouchMove={itemTouch?.onTouchMove} style={dropdownStyle}>
            <div style={stickyHeaderStyle}><span>🔍 {filteredItems.length} items</span><button onClick={() => setShowItemDropdown(false)} style={{ background: 'none', border: 'none', fontSize: 16, color: '#94a3b8', cursor: 'pointer' }}>✕</button></div>
            {filteredItems.map((i, idx) => {
              const ts = getItemTotalStock(i), as = getAvailableStock(i.id), isOut = as <= 0;
              const op = getOriginalPrice(i), disc = getItemDisc(i);
              let yp = getYourPrice(i); if (!yp && op > 0) yp = R2(op - (op * disc / 100));
              const isActive = idx === activeItemIdx;
              return (
                <div key={i.id} ref={isActive ? activeItemRef : null}
                  onTouchEnd={e => { if (itemTouch?.isTap && itemTouch.isTap()) { e.preventDefault(); addItemToInvoice(i); } }}
                  onClick={() => addItemToInvoice(i)} className={isActive ? 'kb-active-item' : ''}
                  style={{ ...dropdownRowStyle, opacity: (stockControlEnabled && isOut) ? 0.6 : 1, background: isActive ? '#dbeafe' : isOut ? '#fef2f2' : 'white', borderLeft: isActive ? '4px solid #2563eb' : 'none' }}>
                  <img src={getItemImg(i)} alt="" onError={e => onImgErr(e)} style={{ width: 46, height: 46, borderRadius: 8, objectFit: 'cover', border: '1px solid #e2e8f0', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isActive && <span style={{ color: '#2563eb', marginRight: 4 }}>▶</span>}{i.name}</div>
                    {getSinhala(i) && <div style={{ fontSize: 13, color: '#1e40af', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getSinhala(i)}</div>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, flexWrap: 'wrap', marginTop: 2 }}>
                      <StockBadge stock={ts} />
                      {as !== ts && <span style={{ fontSize: 11, color: '#64748b' }}>({t.available}: {fmtQ(as)})</span>}
                      <span style={{ fontWeight: 'bold' }}>Rs.{op.toFixed(2)}</span>
                      {disc > 0 && <><span style={{ color: '#f59e0b', fontWeight: 'bold', fontSize: 11 }}>-{disc}%</span><span style={{ color: '#16a34a', fontWeight: 'bold', fontSize: 11 }}>→{yp.toFixed(2)}</span></>}
                    </div>
                    {getRack(i) && <div style={{ fontSize: 11, color: '#e11d48', fontWeight: 'bold', marginTop: 1 }}>📍 {getRack(i)}</div>}
                  </div>
                  <span style={{ fontSize: 20, color: isActive ? '#2563eb' : '#cbd5e1', flexShrink: 0 }}>＋</span>
                </div>
              );
            })}
          </div>
        )}
        {showItemDropdown && itemSearch && itemSearch.trim().length > 0 && filteredItems.length === 0 && (
          <div style={{ position: 'absolute', width: '100%', background: 'white', border: '1px solid #fecaca', borderRadius: 8, zIndex: 100, padding: 16, textAlign: 'center', color: '#dc2626', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>🔍 &quot;{itemSearch}&quot; — {t.noResults}</div>
        )}
      </div>

      {/* INVOICE ITEMS LIST */}
      <div style={{ background: 'white', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: 15 }}>
        {safeInvoiceItems.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>{t.noData}</div>
        ) : safeInvoiceItems.map((item, lineIdx) => {
          const itemKey = item.lineId || item.itemId;
          const baseUomName = item.uomName || getBaseUnit(item.originalItem) || 'unit';
          const itemAvailUnits = item.availableUnits || getItemAvailableUnits(item.originalItem) || [];
          const currentUom = item.uom || baseUomName;
          const factor = Math.max(0.0001, R2(item.uomFactor || getUomFactor(currentUom, baseUomName, itemAvailUnits)));
          const tsBase = getItemTotalStock(item.itemId), tsDisplay = R2(tsBase * factor);
          const availBase = getAvailableStock(item.itemId, itemKey), maxLineQty = R2(availBase * factor);
          const afterBillQty = R2(maxLineQty - R2(item.qty));
          const isOver = stockControlEnabled && !item.negativeStock && R2(item.qty) > maxLineQty + 0.001;
          const isWV = warrantyVisibility[itemKey], isBV = batchVisibility[itemKey], hasWC = !!item.warrantyCode?.trim();
          const batches = item.allBatches || [], allocMap = {};
          (item.batchAllocations || []).forEach(a => { if (a?.batchId) allocMap[a.batchId] = R2((allocMap[a.batchId] || 0) + R2(a.allocatedQty)); });
          const lP = (item.allocatedQty || 0) > 0 ? R2(R2(item.yourPrice) * R2(item.qty) - R2(item.allocatedCostTotal || 0)) : 0;

          return (
            <div key={itemKey} style={{ padding: 12, borderBottom: '1px solid #f1f5f9', background: isOver ? '#fef2f2' : item.negativeStock ? '#fffbeb' : 'white' }}>
              {/* Item header row */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                <img src={item.photoURL || DP} alt="" onError={e => onImgErr(e)} onClick={() => setPopupImage(item.photoURL)} style={{ width: 54, height: 54, borderRadius: 6, objectFit: 'cover', cursor: 'pointer', border: '1px solid #e2e8f0' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'bold', fontSize: 16 }}>{item.name}</div>
                  {item.nameSi && <div style={{ fontSize: 13, color: '#1e40af', fontWeight: 500 }}>{item.nameSi}</div>}
                  {item.sourceOrderId && <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 700, background: '#f3e8ff', padding: '1px 6px', borderRadius: 4, display: 'inline-block', marginTop: 2 }}>📋 {t.orderLabel}</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', fontSize: 12 }}>
                    <StockBadge stock={tsDisplay} uom={currentUom !== 'unit' ? currentUom : null} />
                    {(item.negativeStock || afterBillQty < 0)
                      ? <span style={{ fontSize: 11, fontWeight: 800, color: '#dc2626', background: '#fef2f2', padding: '1px 6px', borderRadius: 4, border: '1px solid #fecaca' }}>📉 -{fmtQ(Math.abs(afterBillQty))}</span>
                      : <span style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', padding: '1px 5px', borderRadius: 4 }}>{t.afterBill}: {fmtQ(afterBillQty)}</span>}
                    {isOver && !item.negativeStock && <span style={{ color: '#dc2626', fontWeight: 'bold', fontSize: 11 }}>⚠️ {t.stockExceeded}</span>}
                    {item.negativeStock && <span style={{ fontSize: 9, fontWeight: 800, color: '#9333ea', background: '#f3e8ff', padding: '1px 5px', borderRadius: 4 }}>{t.lastBatchPrice}</span>}
                  </div>
                </div>
                <button onClick={() => removeItem(itemKey)} style={{ color: '#ef4444', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
              </div>

              {/* Price Type selectors */}
              <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
                {['retail', 'loose', 'wholesale'].map(pt => (
                  <button key={pt} onClick={() => updateItemField(itemKey, 'priceType', pt)} style={{ flex: 1, padding: 6, fontSize: 12, fontWeight: 'bold', borderRadius: 4, border: item.priceType === pt ? '2px solid #3b82f6' : '1px solid #e2e8f0', background: item.priceType === pt ? '#eff6ff' : 'white', color: item.priceType === pt ? '#3b82f6' : '#64748b', cursor: 'pointer' }}>{t[pt]}</button>
                ))}
              </div>

              {/* Sync UOM Conversions pack selector */}
              {baseUomName && (
                <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10, background: '#f8fafc', padding: 8, borderRadius: 8, border: '1px dashed #cbd5e1' }}>
                  <span style={{ fontSize: 11, color: '#475569', fontWeight: 'bold' }}>{t.packUnitSelect}: <span className="kb-shortcut-badge">U</span></span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {(() => {
                      const sel = currentUom === baseUomName;
                      const pd = calcPricesForUom(item.originalItem, item.priceType, 1);
                      return (
                        <button onClick={() => updateItemField(itemKey, 'uom', baseUomName)} style={{ flex: '1 1 100px', minWidth: 100, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'center', border: sel ? '2px solid #7c3aed' : '1px solid #cbd5e1', background: sel ? '#f3e8ff' : 'white', color: sel ? '#6d28d9' : '#334155' }}>
                          <div style={{ fontSize: 13, fontWeight: 900 }}>{baseUomName}</div>
                          <div style={{ fontSize: 11, marginTop: 4, fontWeight: 700 }}>Rs.{fmt(pd.yourPrice)}</div>
                          <div style={{ fontSize: 10, marginTop: 2, color: '#16a34a', fontWeight: 'bold' }}>{t.stock}: {fmtQ(tsBase)}</div>
                        </button>
                      );
                    })()}

                    {itemAvailUnits.map((conv, idx) => {
                      const convRate = getConvRate(conv);
                      if (convRate <= 0) return null;
                      const sel = currentUom === conv.toUnitName;
                      const pd = calcPricesForUom(item.originalItem, item.priceType, convRate);
                      const stk = R2(tsBase * convRate);
                      return (
                        <button key={idx} onClick={() => updateItemField(itemKey, 'uom', conv.toUnitName)} style={{ flex: '1 1 100px', minWidth: 100, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'center', border: sel ? '2px solid #7c3aed' : '1px solid #cbd5e1', background: sel ? '#f3e8ff' : 'white', color: sel ? '#6d28d9' : '#334155' }}>
                          <div style={{ fontSize: 13, fontWeight: 900 }}>{conv.toUnitName}</div>
                          <div style={{ fontSize: 11, marginTop: 4, fontWeight: 700 }}>Rs.{fmt(pd.yourPrice)}</div>
                          <div style={{ fontSize: 10, marginTop: 2, color: '#16a34a', fontWeight: 'bold' }}>{t.stock}: {fmtQ(stk)}</div>
                          <div style={{ fontSize: 9, marginTop: 2, color: '#94a3b8' }}>(1 {baseUomName} = {convRate} {conv.toUnitName})</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Batches & Warranties toggles */}
              <div className="no-print" style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <button onClick={() => setBatchVisibility(p => ({ ...p, [itemKey]: !p[itemKey] }))} style={{ flex: 1, padding: '6px 10px', background: isBV ? '#dbeafe' : '#f8fafc', color: isBV ? '#1d4ed8' : '#64748b', border: `1px solid ${isBV ? '#93c5fd' : '#e2e8f0'}`, borderRadius: 6, fontSize: 12, fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <span>{isBV ? t.hideBatches : t.batchesLabel}</span>
                  <span style={{ background: '#3b82f6', color: 'white', fontSize: 10, padding: '0 6px', borderRadius: 999, minWidth: 18, textAlign: 'center' }}>{batches.length}</span>
                </button>
                <button onClick={() => setWarrantyVisibility(p => ({ ...p, [itemKey]: !p[itemKey] }))} style={{ padding: '6px 12px', background: isWV ? '#fef3c7' : '#f8fafc', color: isWV ? '#92400e' : '#64748b', border: `1px solid ${isWV ? '#fde68a' : '#e2e8f0'}`, borderRadius: 6, fontSize: 12, fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🛡️</span><span>{t.warrantyDetails}</span>
                </button>
              </div>

              {/* Batches panel layout */}
              {isBV && (
                <div style={{ marginBottom: 8, padding: 8, background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd', maxHeight: 260, overflowY: 'auto' }}>
                  {batches.length === 0 ? <div style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>📭</div>
                    : batches.map((b, idx) => (
                      <POSBatchCard key={b.batchId} batch={b} index={idx} isSelected={!!allocMap[b.batchId]}
                        allocatedQty={allocMap[b.batchId] || 0} onSelect={b2 => updateItemField(itemKey, 'selectedBatch', b2)}
                        priceType={item.priceType || 'retail'} uomFactor={factor} />
                    ))}
                </div>
              )}

              {/* Warranty panel layout */}
              {isWV && (
                <div style={{ marginBottom: 8, padding: 8, background: '#fffbeb', borderRadius: 6, border: '1px solid #fde68a' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <div><label style={{ fontSize: 10, color: '#92400e' }}>{t.warrantyCode}</label><input value={item.warrantyCode || ''} onChange={e => updateItemField(itemKey, 'warrantyCode', e.target.value)} style={{ width: '100%', padding: 4, borderRadius: 4, border: '1px solid #fde68a', fontSize: 12, boxSizing: 'border-box', fontWeight: 'bold' }} /></div>
                    <div><label style={{ fontSize: 10, color: '#92400e' }}>{t.warrantyPeriod}</label><input value={item.warrantyPeriod || ''} onChange={e => updateItemField(itemKey, 'warrantyPeriod', e.target.value)} style={{ width: '100%', padding: 4, borderRadius: 4, border: '1px solid #fde68a', fontSize: 12, boxSizing: 'border-box', fontWeight: 'bold' }} /></div>
                  </div>
                  {calcWarrantyExpiry(item.warrantyPeriod) && <div style={{ marginTop: 4, fontSize: 10, color: '#16a34a', fontWeight: 'bold', textAlign: 'center' }}>✅ {t.warrantyExpires}: {calcWarrantyExpiry(item.warrantyPeriod)}</div>}
                </div>
              )}

              {/* Inline price inputs */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div><label style={{ fontSize: 11, color: '#64748b' }}>{t.sellingPrice}</label><input type="number" inputMode="decimal" value={item.sellingPrice} onChange={e => updateItemField(itemKey, 'sellingPrice', e.target.value)} onFocus={onFocusSel} tabIndex={-1} style={{ width: '100%', minWidth: 0, textAlign: 'right', padding: '6px 8px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', fontWeight: 'bold', height: 38 }} /></div>
                <div><label style={{ fontSize: 11, color: '#f59e0b', fontWeight: 'bold' }}>{t.discPct}</label><input type="number" inputMode="decimal" value={item.discountPercent} onChange={e => updateItemField(itemKey, 'discountPercent', e.target.value)} onFocus={onFocusSel} tabIndex={-1} style={{ width: '100%', minWidth: 0, textAlign: 'right', padding: '6px 8px', borderRadius: 4, border: '2px solid #fcd34d', fontSize: 14, boxSizing: 'border-box', fontWeight: 'bold', background: '#fffbeb', color: '#b45309', height: 38 }} /></div>
                <div><label style={{ fontSize: 11, color: '#f59e0b', fontWeight: 'bold' }}>{t.discAmt}</label><input type="number" inputMode="decimal" value={item.discAmount} onChange={e => updateItemField(itemKey, 'discAmount', e.target.value)} onFocus={onFocusSel} tabIndex={-1} style={{ width: '100%', minWidth: 0, textAlign: 'right', padding: '6px 8px', borderRadius: 4, border: '2px solid #fcd34d', fontSize: 14, boxSizing: 'border-box', fontWeight: 'bold', background: '#fffbeb', color: '#b45309', height: 38 }} /></div>
              </div>

              {/* Net price & Qty controllers */}
              <div style={{ display: 'grid', gridTemplateColumns: isSmallMobile ? '1fr' : 'minmax(0,1.4fr) minmax(0,0.8fr)', gap: 8, marginBottom: 8, alignItems: 'end' }}>
                <div style={{ minWidth: 0 }}>
                  <label style={{ fontSize: 11, color: '#0369a1', fontWeight: 'bold' }}>{t.yourPrice} ✏️</label>
                  <input type="number" step="0.01" inputMode="decimal" value={item.yourPrice} onChange={e => updateItemField(itemKey, 'yourPrice', e.target.value)} onFocus={onFocusSel} tabIndex={-1}
                    style={{ width: '100%', minWidth: 0, textAlign: 'right', padding: isSmallMobile ? '10px 14px' : '8px 12px', borderRadius: 6, border: '2px solid #3b82f6', background: '#eff6ff', fontWeight: 'bold', color: '#0369a1', fontSize: isSmallMobile ? 17 : 18, height: isSmallMobile ? 48 : 44, boxSizing: 'border-box' }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={{ fontSize: 11, color: '#64748b' }}>{t.qty} {currentUom !== 'unit' ? `(${currentUom})` : ''}</label>
                  <div style={{ display: 'flex', width: '100%' }}>
                    <button onClick={() => updateItemField(itemKey, 'qty', R2(item.qty) - 1)} disabled={hasWC} tabIndex={-1} style={{ width: isSmallMobile ? 42 : 36, height: isSmallMobile ? 42 : 36, background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px 0 0 4px', fontSize: 18, cursor: hasWC ? 'not-allowed' : 'pointer', opacity: hasWC ? 0.5 : 1, flexShrink: 0 }}>−</button>
                    <input ref={el => { if (el) qtyInputRefs.current[itemKey] = el; else delete qtyInputRefs.current[itemKey]; }} type="number" inputMode="numeric" value={item.qty}
                      onChange={e => updateItemField(itemKey, 'qty', e.target.value)} onFocus={onFocusSel} onKeyDown={e => handleQtyKeyDown(e, itemKey, lineIdx)} readOnly={hasWC}
                      style={{ flex: 1, minWidth: 0, textAlign: 'center', padding: 6, border: '1px solid #e2e8f0', borderLeft: 'none', borderRight: 'none', fontWeight: 'bold', fontSize: 16, color: isOver ? '#dc2626' : '#0f172a', background: isOver ? '#fef2f2' : 'white', height: isSmallMobile ? 42 : 36, boxSizing: 'border-box' }} />
                    <button onClick={() => updateItemField(itemKey, 'qty', R2(item.qty) + 1)} disabled={hasWC} tabIndex={-1} style={{ width: isSmallMobile ? 42 : 36, height: isSmallMobile ? 42 : 36, background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '0 4px 4px 0', fontSize: 18, cursor: hasWC ? 'not-allowed' : 'pointer', opacity: hasWC ? 0.5 : 1, flexShrink: 0 }}>+</button>
                  </div>
                </div>
              </div>

              {/* Total calculations display */}
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontWeight: 'bold', fontSize: 18, color: '#1e40af' }}>{t.lineTotal}: Rs. {R2(item.lineTotal).toFixed(2)}</span>
                {item.mixedBatchPricing && Array.isArray(item.batchAllocations) && item.batchAllocations.length > 1 && (
                  <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: '#7c3aed' }}>
                    ⚖️ {t.mixedLabel}: {item.batchAllocations.map(a => `${fmtQ(R2(R2(a.allocatedQty) * factor))} × ${fmt(a.sellNetPrice)}`).join(' + ')} = Rs. {fmt(item.lineTotal)}
                  </div>
                )}
                {showProfit && (item.allocatedQty || 0) > 0 && lP !== 0 && (
                  <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: lP >= 0 ? '#16a34a' : '#dc2626' }}>({t.profit}: {lP >= 0 ? '+' : ''}{fmt(lP)})</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* CUSTOMER SEARCH PORTLET */}
      <div className="no-print" style={{ background: 'white', padding: 12, borderRadius: 10, marginBottom: 15 }}>
        <div style={{ fontSize: 14, fontWeight: 'bold', color: '#64748b', marginBottom: 5 }}>{t.customer} <span className="kb-shortcut-badge">F2</span></div>
        {selectedCustomer ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src={getCustImg(selectedCustomer)} alt="" onError={e => onImgErr(e, 'a')} onClick={() => { const img = getCustImg(selectedCustomer); if (img !== DA) setPopupImage(img); }} style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', border: '3px solid #3b82f6', cursor: 'pointer' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 'bold', fontSize: 16 }}>{selectedCustomer.name}</div>
              {selectedCustomer.phone && <div style={{ fontSize: 13, color: '#64748b' }}>📞 {selectedCustomer.phone}</div>}
              {selectedCustomer.currentBalance != null && (<div style={{ fontSize: 12, marginTop: 2 }}>{(() => { const st = getBalSt(selectedCustomer.currentBalance); return <span style={{ color: st.color, fontWeight: 'bold' }}>{st.icon} {st.text}</span>; })()}</div>)}
            </div>
            <button onClick={() => setSelectedCustomer(null)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', fontSize: 13 }}>{t.changeCustomer} <span className="kb-shortcut-badge">F2</span></button>
          </div>
        ) : (
          <div ref={customerSearchContainerRef} style={{ position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              <input ref={customerSearchInputRef} placeholder={`${t.searchCustomer} [F2]`} value={customerSearch}
                onChange={e => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); setActiveCustIdx(0); }}
                onFocus={() => setShowCustomerDropdown(true)} onKeyDown={handleCustSearchKeyDown}
                style={{ width: '100%', padding: 12, paddingRight: 50, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 15, boxSizing: 'border-box' }} />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#94a3b8', fontWeight: 800, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, border: '1px solid #e2e8f0' }}>F2</span>
            </div>
            {showCustomerDropdown && (
              <div onTouchStart={custTouch?.onTouchStart} onTouchMove={custTouch?.onTouchMove} style={dropdownStyle}>
                <div style={stickyHeaderStyle}><span>👤 {filteredCustomers.length} customers</span><button onClick={() => setShowCustomerDropdown(false)} style={{ background: 'none', border: 'none', fontSize: 16, color: '#94a3b8', cursor: 'pointer' }}>✕</button></div>
                {customerSearch.trim().length > 0 && (
                  <div onTouchEnd={e => { if (custTouch?.isTap && custTouch.isTap()) { e.preventDefault(); handleShowNewCustomerWithPreFill(customerSearch); } }} onClick={() => handleShowNewCustomerWithPreFill(customerSearch)}
                    style={{ ...dropdownRowStyle, background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', fontWeight: 'bold', color: '#2563eb', borderBottom: '2px solid #93c5fd', minHeight: 52, justifyContent: 'center', gap: 6 }}>
                    <span style={{ fontSize: 22 }}>➕</span><span style={{ fontSize: 14 }}>&quot;{customerSearch.trim()}&quot; {t.addAsNew}</span>
                  </div>
                )}
                {filteredCustomers.map((c, idx) => {
                  const st = getBalSt(c.currentBalance), isActive = idx === activeCustIdx;
                  return (
                    <div key={c.id} ref={isActive ? activeCustRef : null}
                      onTouchEnd={e => { if (custTouch?.isTap && custTouch.isTap()) { e.preventDefault(); setSelectedCustomer(c); setShowCustomerDropdown(false); setCustomerSearch(''); } }}
                      onClick={() => { setSelectedCustomer(c); setShowCustomerDropdown(false); setCustomerSearch(''); }}
                      className={isActive ? 'kb-active-cust' : ''} style={{ ...dropdownRowStyle, background: isActive ? '#dbeafe' : 'white', borderLeft: isActive ? '4px solid #2563eb' : 'none' }}>
                      <img src={getCustImg(c)} alt="" onError={e => onImgErr(e, 'a')} style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', border: '2px solid #e2e8f0', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isActive && <span style={{ color: '#2563eb', marginRight: 4 }}>▶</span>}{c.name}</div>
                        <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>{c.phone && <span>📞 {c.phone}</span>}<span style={{ color: st.color, fontWeight: 'bold' }}>{st.icon} {st.text}</span></div>
                        {c.address && <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📍 {c.address}</div>}
                      </div>
                      <span style={{ fontSize: 18, color: isActive ? '#2563eb' : '#cbd5e1', flexShrink: 0 }}>›</span>
                    </div>
                  );
                })}
                {customerSearch.trim().length > 0 && filteredCustomers.length === 0 && (<div style={{ padding: 16, textAlign: 'center', color: '#dc2626', fontSize: 13, fontWeight: 'bold' }}>⚠️ &quot;{customerSearch}&quot; — {t.noResults}</div>)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* BILL TOTALS LAYOUT */}
      <div style={{ background: 'white', padding: 15, borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, marginBottom: 6 }}><span>{t.grossTotal}</span><b>{subTotal.toFixed(2)}</b></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, marginBottom: 6, color: '#ef4444' }}><span>{t.discount}</span><span>-{totalDiscount.toFixed(2)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, marginBottom: 8 }}>
          <span>{t.billDiscount} %</span>
          <input type="number" inputMode="decimal" value={billDiscountPercent} onChange={e => setBillDiscountPercent(Math.min(100, Math.max(0, R2(e.target.value))))} onFocus={onFocusSel} tabIndex={-1} style={{ width: 60, textAlign: 'right', border: '1px solid #cbd5e1', borderRadius: 4, padding: '4px 6px' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, marginBottom: 8 }}>
          <span>{t.exchange}</span>
          <input type="number" inputMode="decimal" value={exchangeAmount} onChange={e => setExchangeAmount(Math.max(0, R2(e.target.value)))} onFocus={onFocusSel} tabIndex={-1} style={{ width: 90, textAlign: 'right', border: '1px solid #cbd5e1', borderRadius: 4, padding: '4px 6px' }} />
        </div>
        <div className="no-print" style={{ marginBottom: 6, textAlign: 'right' }}>
          <button onClick={() => setShowRemarkInput(!showRemarkInput)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: 13, fontWeight: 'bold' }}>{t.addRemark}</button>
        </div>
        {showRemarkInput && <textarea placeholder={t.notesPlaceholder} value={invoiceRemark} onChange={e => setInvoiceRemark(e.target.value)} rows={2} tabIndex={-1} style={{ width: '100%', border: '2px solid #e2e8f0', padding: 8, borderRadius: 6, marginBottom: 10, boxSizing: 'border-box' }} />}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 'bold', borderTop: '1px solid #e2e8f0', paddingTop: 10, marginTop: 5 }}><span>{t.netAmount}</span><span>{finalNetAmount.toFixed(2)}</span></div>
        {showProfit && invoiceProfitVal !== 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 'bold', marginTop: 6, padding: '6px 8px', borderRadius: 6, background: invoiceProfitVal >= 0 ? '#f0fdf4' : '#fef2f2', color: invoiceProfitVal >= 0 ? '#16a34a' : '#dc2626' }}>
            <span>{invoiceProfitVal >= 0 ? '📈' : '📉'} {t.profit}:</span><span>{invoiceProfitVal >= 0 ? '+' : ''}{fmt(invoiceProfitVal)}</span>
          </div>
        )}

        {/* Payment input controller */}
        <div className="no-print" style={{ marginTop: 15 }}>
          <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
            {['cash', 'card', 'etransfer', 'cheque'].map((pm, idx) => (
              <button key={pm} onClick={() => setPaymentMethod(pm)} style={{ flex: 1, padding: 8, fontSize: 13, fontWeight: 'bold', borderRadius: 4, border: paymentMethod === pm ? '2px solid #3b82f6' : '1px solid #e2e8f0', background: paymentMethod === pm ? '#eff6ff' : 'white', color: paymentMethod === pm ? '#3b82f6' : '#64748b', cursor: 'pointer' }}>
                {pm === 'etransfer' ? t.eTransfer : t[pm]} {idx === 0 && <span className="kb-shortcut-badge">F3</span>}
              </button>
            ))}
          </div>
          {paymentMethod === 'etransfer' && bankAccounts.length > 0 && (
            <select value={selectedBankAccountId} onChange={e => setSelectedBankAccountId(e.target.value)} tabIndex={-1} style={{ width: '100%', padding: 10, border: '2px solid #3b82f6', borderRadius: 8, marginBottom: 10, boxSizing: 'border-box' }}>
              <option value="">-- {t.selectBank} --</option>
              {bankAccounts.map(a => <option key={a.id} value={a.id}>🏦 {a.bankName} | {a.accountName}</option>)}
            </select>
          )}
          <div style={{ position: 'relative' }}>
            <input ref={payAmountInputRef} type="number" inputMode="decimal" value={payAmount} onChange={e => setPayAmount(R2(e.target.value))} onFocus={onFocusSel} onKeyDown={handlePayAmountKeyDown}
              placeholder={`${t.paymentAmountLabel} [F4]`}
              style={{ width: '100%', padding: 14, paddingRight: 90, borderRadius: 8, border: '2px solid #3b82f6', fontSize: 20, fontWeight: 'bold', boxSizing: 'border-box' }} />
            <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 4 }}>
              <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 800, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, border: '1px solid #e2e8f0' }}>F4</span>
              <button onClick={() => { setPayAmount(finalNetAmount); showToast(`💵 ${t.fullPay}: Rs.${fmt(finalNetAmount)}`); }} tabIndex={-1} style={{ fontSize: 9, color: '#16a34a', fontWeight: 800, background: '#f0fdf4', padding: '2px 6px', borderRadius: 4, border: '1px solid #bbf7d0', cursor: 'pointer' }}>F5 {t.fullPay}</button>
            </div>
          </div>
        </div>

        {/* Change / balance display */}
        <div style={{ marginTop: 10, padding: 12, background: balance >= 0 ? '#f0fdf4' : '#fef2f2', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#64748b' }}>{t.balance}</div>
          <div style={{ fontSize: 24, fontWeight: 'bold', color: balance >= 0 ? '#16a34a' : '#dc2626' }}>{balance.toFixed(2)}</div>
        </div>

        {/* Auto-Sync Toggle */}
        <div className="no-print" style={{ marginBottom: 10, display: 'flex', justifyContent: 'center' }}>
          <button onClick={toggleAutoSync} title={autoSync ? 'Click to disable auto-sync' : 'Click to enable auto-sync'} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6, background: autoSync ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>
            {autoSync ? '🔄' : '⏸️'} {autoSync ? 'Auto-Sync ON' : 'Auto-Sync OFF'}
          </button>
        </div>

        <div className="no-print" style={{ marginTop: 15, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button ref={saveBtnRef} onClick={() => handleSaveInvoice('save')} disabled={saving || !safeInvoiceItems.length} style={{ padding: 16, background: !safeInvoiceItems.length ? '#ccc' : '#3b82f6', color: 'white', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: 'pointer' }}>💾 {t.saveOnly} <span className="kb-shortcut-badge">F8</span></button>
          <button ref={printBtnRef} onClick={() => handleSaveInvoice('print')} disabled={saving || !safeInvoiceItems.length} style={{ padding: 16, background: !safeInvoiceItems.length ? '#ccc' : '#16a34a', color: 'white', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: 'pointer' }}>🖨️ {t.savePrint} <span className="kb-shortcut-badge">F10</span></button>
          <button onClick={() => handleSaveInvoice('link')} disabled={saving || !safeInvoiceItems.length} style={{ padding: 16, background: !safeInvoiceItems.length ? '#ccc' : 'linear-gradient(135deg,#25D366,#128C7E)', color: 'white', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: 'pointer' }}>🔗 Share / WhatsApp <span className="kb-shortcut-badge">F9</span></button>
          <button onClick={() => handleSaveInvoice('draft')} disabled={saving || !safeInvoiceItems.length} style={{ padding: 16, background: '#f59e0b', color: 'white', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: 'pointer' }}>📝 {t.saveDraft} <span className="kb-shortcut-badge">F7</span></button>
        </div>
      </div>

      {/* NEW CUSTOMER CREATION MODAL */}
      {showNewCustomerModal && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10002, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', padding: 20, borderRadius: 16, width: '100%', maxWidth: 380, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', textAlign: 'center' }}>➕ {t.newCustomer}</h3>
            {contactPickerAvailable && <button onClick={handlePickContact} style={{ width: '100%', padding: 14, marginBottom: 16, background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: 'white', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 'bold', cursor: 'pointer' }}>📱 {t.pickContact}</button>}
            {!contactPickerAvailable && <div style={{ background: '#fefce8', border: '1px solid #fde047', borderRadius: 10, padding: 10, marginBottom: 12, fontSize: 12, color: '#854d0e', textAlign: 'center' }}>{t.contactsNotSupported}</div>}
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img src={newCustomer.profilePicture || DA} alt="" onError={e => onImgErr(e, 'a')} style={{ width: 90, height: 90, borderRadius: '50%', objectFit: 'cover', border: '3px solid #3b82f6' }} />
                <button onClick={() => photoInputRef.current?.click()} style={{ position: 'absolute', bottom: -2, right: -2, width: 32, height: 32, borderRadius: '50%', background: '#3b82f6', color: 'white', border: '2px solid white', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📷</button>
              </div>
              <input type="file" ref={photoInputRef} onChange={handlePhotoCapture} style={{ display: 'none' }} accept="image/*" />
              {newCustomer.profilePicture && <div style={{ marginTop: 6 }}><button onClick={() => setNewCustomer(prev => ({ ...prev, profilePicture: '' }))} style={{ fontSize: 11, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>{t.removePhoto}</button></div>}
            </div>
            <input value={newCustomer.name} onChange={e => setNewCustomer(p => ({ ...p, name: e.target.value }))} placeholder={`${t.customer} *`} style={{ width: '100%', padding: 12, marginBottom: 10, border: '1px solid #cbd5e1', borderRadius: 8, boxSizing: 'border-box', fontSize: 15 }} />
            <input value={newCustomer.phone} onChange={e => setNewCustomer(p => ({ ...p, phone: e.target.value }))} placeholder="Phone *" style={{ width: '100%', padding: 12, marginBottom: 10, border: '1px solid #cbd5e1', borderRadius: 8, boxSizing: 'border-box', fontSize: 15 }} />
            <input value={newCustomer.address} onChange={e => setNewCustomer(p => ({ ...p, address: e.target.value }))} placeholder="Address" style={{ width: '100%', padding: 12, marginBottom: 16, border: '1px solid #cbd5e1', borderRadius: 8, boxSizing: 'border-box', fontSize: 15 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setShowNewCustomerModal(false); setNewCustomer({ name: '', phone: '+94', address: '', creditLimit: 0, profilePicture: '' }); }} style={{ flex: 1, padding: 14, background: '#f1f5f9', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 15, fontWeight: 'bold', color: '#64748b' }}>{t.cancel}</button>
              <button onClick={handleCreateCustomer} disabled={saving} style={{ flex: 1, padding: 14, background: '#3b82f6', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 15, fontWeight: 'bold' }}>{saving ? '⏳' : t.createCustomer}</button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP IMAGE ZOOM PREVIEW */}
      {popupImage && (<div onClick={() => setPopupImage(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}><img src={popupImage} alt="" style={{ maxWidth: '90%', maxHeight: '80vh', borderRadius: 10 }} /></div>)}
    </div>
  );
}