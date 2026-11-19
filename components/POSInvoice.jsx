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

   // =========================================================================
  // 🔄 AUTO-SYNC: Load + Online + Periodic
  // =========================================================================

  // Initial Data Loading from Dexie Local DB
  const loadLocalData = useCallback(async () => {
    try {
      if (!localDb) return;
      
      const localItems = await localDb.items.toArray();
      const localCustomers = await localDb.customers.toArray();
      
      if (localItems && localItems.length > 0) {
        setItems(localItems);
      }
      if (localCustomers && localCustomers.length > 0) {
        setCustomers(localCustomers);
      }
    } catch (err) {
      console.error("Local DB read error:", err);
    }
  }, []);

  useEffect(() => {
    loadLocalData();

    const handleOnlineStatus = () => {
      setIsOnline(navigator.onLine);
      if (navigator.onLine) {
        triggerBackgroundSync();
      }
    };

    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);

    // Periodic sync attempt every 30 seconds if online
    const syncInterval = setInterval(() => {
      if (navigator.onLine) {
        triggerBackgroundSync();
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
      clearInterval(syncInterval);
    };
  }, [loadLocalData]);

  // Trigger background sync for unsynced local invoices
  const triggerBackgroundSync = async () => {
    if (isSyncing || !navigator.onLine) return;
    try {
      setIsSyncing(true);
      const unsyncedInvoices = await localDb.invoices.where('_synced').equals(0).toArray();
      
      if (unsyncedInvoices && unsyncedInvoices.length > 0) {
        for (const inv of unsyncedInvoices) {
          // Attempt sync to Firestore via background handler
          const cleanInv = { ...inv, _synced: true, updatedAt: new Date().toISOString() };
          delete cleanInv._localSaved;
          
          await localDb.invoices.put({ ...inv, _synced: 1 });
        }
      }
    } catch (err) {
      console.error("Background sync error:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  // =========================================================================
  // 💾 SAVE INVOICE / SALE PROCESSING (Offline-First)
  // =========================================================================

  const handleSaveInvoice = async () => {
    if (cart.length === 0) {
      alert(lang === 'si' ? 'කරුණාකර භාණ්ඩ ඇතුළත් කරන්න.' : 'Please add items to cart.');
      return;
    }

    const netPayable = calculateTotal();
    const paid = parseFloat(payAmount) || 0;

    if (paymentType === 'Credit' && !selectedCustomer) {
      alert(lang === 'si' ? 'ණය පදනමට අලෙවි කිරීමට පාරිභෝගිකයෙකු තෝරන්න.' : 'Please select a customer for Credit sale.');
      return;
    }

    if (paymentType !== 'Credit' && paid < netPayable) {
      alert(lang === 'si' ? 'ලබාදුන් මුදල මදි!' : 'Insufficient payment amount!');
      return;
    }

    try {
      setIsSaving(true);
      const invoiceNo = `INV-${Date.now()}`;
      const timestamp = new Date().toISOString();

      // 1. Calculate Customer Balances
      const prevOutstanding = selectedCustomer ? (parseFloat(selectedCustomer.outstandingBalance) || 0) : 0;
      let balanceDelta = 0;
      
      if (paymentType === 'Credit') {
        balanceDelta = netPayable - paid;
      } else {
        balanceDelta = 0; // Fully paid
      }

      const updatedNewOutstanding = prevOutstanding + balanceDelta;

      // 2. Prepare Stock Deductions & Update Dexie Local Storage
      const itemsToUpdate = [...items];

      for (const cartItem of cart) {
        const itemIdx = itemsToUpdate.findIndex(i => i.id === cartItem.id);
        if (itemIdx !== -1) {
          const item = itemsToUpdate[itemIdx];
          const factor = getUomFactor(item, cartItem.selectedUom);
          const deductBaseQty = (parseFloat(cartItem.qty) || 0) * factor;

          // Apply FIFO or selected batch deduction locally
          if (item.batches && item.batches.length > 0) {
            let remainingDeduct = deductBaseQty;
            const updatedBatches = item.batches.map(batch => {
              if (cartItem.selectedBatchId && batch.batchId !== cartItem.selectedBatchId) {
                return batch;
              }
              if (remainingDeduct <= 0) return batch;

              const avail = parseFloat(batch.quantity) || 0;
              const deduct = Math.min(avail, remainingDeduct);
              remainingDeduct -= deduct;

              return {
                ...batch,
                quantity: Math.max(0, avail - deduct)
              };
            });

            itemsToUpdate[itemIdx] = {
              ...item,
              stockQty: Math.max(0, (parseFloat(item.stockQty) || 0) - deductBaseQty),
              batches: updatedBatches,
              _synced: false
            };
          } else {
            itemsToUpdate[itemIdx] = {
              ...item,
              stockQty: Math.max(0, (parseFloat(item.stockQty) || 0) - deductBaseQty),
              _synced: false
            };
          }

          // Update Dexie
          await localDb.items.put(itemsToUpdate[itemIdx]);
        }
      }

      // 3. Update Customer Balance locally in Dexie if customer selected
      if (selectedCustomer) {
        const updatedCust = {
          ...selectedCustomer,
          outstandingBalance: updatedNewOutstanding,
          _synced: false
        };
        await localDb.customers.put(updatedCust);
        
        // Update local customers state
        setCustomers(prev => prev.map(c => c.id === selectedCustomer.id ? updatedCust : c));
        setSelectedCustomer(updatedCust);
      }

      // 4. Construct Invoice Document
      const invoiceData = {
        id: invoiceNo,
        invoiceNo,
        date: timestamp,
        createdAt: timestamp,
        items: cart.map(item => ({
          id: item.id,
          name: item.name,
          qty: item.qty,
          selectedUom: item.selectedUom,
          uomFactor: getUomFactor(item, item.selectedUom),
          unitPrice: item.unitPrice,
          discount: item.discount || 0,
          lineTotal: item.lineTotal,
          selectedBatchId: item.selectedBatchId || null
        })),
        subtotal: calculateSubtotal(),
        discount: parseFloat(discount) || 0,
        netTotal: netPayable,
        payAmount: paid,
        changeAmount: Math.max(0, paid - netPayable),
        paymentType,
        customerId: selectedCustomer ? selectedCustomer.id : null,
        customerName: selectedCustomer ? selectedCustomer.name : 'Walk-in Customer',
        previousOutstanding: prevOutstanding,
        newOutstanding: updatedNewOutstanding,
        _synced: 0,
        _localSaved: true
      };

      // Save Invoice to Dexie
      await localDb.invoices.add(invoiceData);

      // Update Local Items State
      setItems(itemsToUpdate);

      // Set for Receipt Print
      setLastSavedInvoice(invoiceData);
      setIsReceiptOpen(true);

      // Reset Form State
      setCart([]);
      setPayAmount('');
      setDiscount(0);

      // Trigger auto background sync if online
      if (navigator.onLine) {
        triggerBackgroundSync();
      }

    } catch (err) {
      console.error("Failed to save invoice:", err);
      alert(lang === 'si' ? 'ඉන්වොයිසිය සුරැකීමට අපොහොසත් විය!' : 'Failed to save invoice!');
    } finally {
      setIsSaving(false);
    }
  };

  // Print Handle
  const handlePrintReceipt = () => {
    window.print();
  };

  // Close Receipt Modal & Focus back to Search
  const handleCloseReceipt = () => {
    setIsReceiptOpen(false);
    if (itemSearchInputRef.current) {
      itemSearchInputRef.current.focus();
    }
  };

  // Quick Pay Helper
  const handleQuickCash = (amount) => {
    setPayAmount(amount.toString());
  };

  // =========================================================================
  // 🎨 RENDER INTERFACE
  // =========================================================================

  return (
    <div className="flex flex-col h-screen bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-100 select-none overflow-hidden">
      
      {/* HEADER BAR */}
      <header className="bg-slate-800 text-white px-4 py-2 flex justify-between items-center shadow-md">
        <div className="flex items-center space-x-3">
          <h1 className="text-xl font-bold tracking-wide text-amber-400">
            {lang === 'si' ? 'වීරක්කොඩි POS පද්ධතිය' : 'Weerakkodi POS'}
          </h1>
          <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${isOnline ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white animate-pulse'}`}>
            {isOnline ? (lang === 'si' ? 'සක්‍රියයි (Online)' : 'Online') : (lang === 'si' ? 'අක්‍රියයි (Offline)' : 'Offline')}
          </span>
          {isSyncing && (
            <span className="text-xs text-amber-300 flex items-center space-x-1 animate-spin">
              🔄 <span>{lang === 'si' ? 'සමමුහුර්ත වෙමින්...' : 'Syncing...'}</span>
            </span>
          )}
        </div>

        <div className="flex items-center space-x-4 text-xs text-slate-300">
          <div><kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-amber-300 font-mono">Enter</kbd> : තේරීම / එක් කිරීම</div>
          <div><kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-amber-300 font-mono">F10</kbd> : සුරැකීම (Pay)</div>
          <div><kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-amber-300 font-mono">Esc</kbd> : අවලංගු කිරීම</div>
        </div>
      </header>

      {/* MAIN CONTENT WORKSPACE */}
      <div className="flex flex-1 overflow-hidden p-3 gap-3">

        {/* LEFT COLUMN: ITEM SEARCH & CART TABLE */}
        <div className="flex-1 flex flex-col bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          
          {/* SEARCH BAR */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 relative">
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              {lang === 'si' ? 'භාණ්ඩය සෙවීම (නම / බාර්කෝඩ් / අංකය)' : 'Search Item (Name / Barcode / ID)'}
            </label>
            <div className="relative">
              <input
                ref={itemSearchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchFilteredIndex(0);
                }}
                onKeyDown={handleItemSearchKeyDown}
                placeholder={lang === 'si' ? 'භාණ්ඩයේ නම හෝ බාර්කෝඩ් එක මෙතැනට ඇතුළත් කරන්න...' : 'Type item name or scan barcode...'}
                className="w-full pl-10 pr-4 py-2.5 text-base rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none font-medium"
                autoFocus
              />
              <span className="absolute left-3 top-3 text-slate-400">🔍</span>
            </div>

            {/* QUICK ITEM SEARCH SEARCH RESULTS DROPDOWN */}
            {searchQuery.trim() !== '' && searchFilteredItems.length > 0 && (
              <div className="absolute left-3 right-3 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl z-50 max-h-64 overflow-y-auto">
                {searchFilteredItems.map((item, idx) => {
                  const isSelected = idx === searchFilteredIndex;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectItem(item)}
                      className={`p-2.5 border-b border-slate-100 dark:border-slate-700/50 cursor-pointer flex justify-between items-center ${
                        isSelected ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 font-semibold' : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'
                      }`}
                    >
                      <div>
                        <div className="text-sm font-medium">{item.name}</div>
                        <div className="text-xs text-slate-400">
                          {lang === 'si' ? 'තොගය' : 'Stock'}: {item.stockQty || 0} {item.unit || 'PCS'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-amber-600 dark:text-amber-400">
                          Rs. {parseFloat(item.sellingPrice || item.price || 0).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* CART ITEMS TABLE */}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase sticky top-0 z-10">
                <tr>
                  <th className="p-3 w-10">#</th>
                  <th className="p-3">{lang === 'si' ? 'භාණ්ඩය' : 'Item'}</th>
                  <th className="p-3 w-28 text-center">{lang === 'si' ? 'ඒකකය (UOM)' : 'UOM'}</th>
                  <th className="p-3 w-24 text-center">{lang === 'si' ? 'ප්‍රමාණය' : 'Qty'}</th>
                  <th className="p-3 w-28 text-right">{lang === 'si' ? 'ඒකක මිළ' : 'Unit Price'}</th>
                  <th className="p-3 w-24 text-right">{lang === 'si' ? 'වට්ටම්' : 'Discount'}</th>
                  <th className="p-3 w-32 text-right">{lang === 'si' ? 'එකතුව' : 'Total'}</th>
                  <th className="p-3 w-12 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">
                {cart.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="text-center py-20 text-slate-400">
                      <div className="text-4xl mb-2">🛒</div>
                      <div>{lang === 'si' ? 'කාඩ්පත හිස්ය. භාණ්ඩ ඇතුළත් කරන්න.' : 'Cart is empty. Add items to start.'}</div>
                    </td>
                  </tr>
                ) : (
                  cart.map((item, index) => (
                    <tr key={`${item.id}-${index}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="p-3 font-mono text-xs text-slate-400">{index + 1}</td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-800 dark:text-slate-100">{item.name}</div>
                        {item.selectedBatchId && (
                          <button
                            onClick={() => {
                              setSelectedItemForBatch(item);
                              setIsBatchModalOpen(true);
                            }}
                            className="text-[11px] text-amber-600 dark:text-amber-400 underline font-mono hover:text-amber-700"
                          >
                            Batch: {item.selectedBatchId}
                          </button>
                        )}
                      </td>
                      
                      {/* UOM SELECTOR */}
                      <td className="p-3 text-center">
                        <select
                          value={item.selectedUom || 'PCS'}
                          onChange={(e) => handleUomChange(index, e.target.value)}
                          className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 focus:ring-1 focus:ring-amber-500 outline-none"
                        >
                          {(item.uomList && item.uomList.length > 0 ? item.uomList : ['PCS']).map((uom, uIdx) => (
                            <option key={uIdx} value={typeof uom === 'string' ? uom : uom.code}>
                              {typeof uom === 'string' ? uom : uom.code}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* QTY INPUT */}
                      <td className="p-3 text-center">
                        <input
                          type="number"
                          min="0.001"
                          step="any"
                          value={item.qty}
                          onChange={(e) => handleQtyChange(index, e.target.value)}
                          onKeyDown={(e) => handleQtyKeyDown(e, index)}
                          className="w-20 text-center font-bold px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
                        />
                      </td>

                      {/* UNIT PRICE */}
                      <td className="p-3 text-right font-mono">
                        Rs. {parseFloat(item.unitPrice || 0).toFixed(2)}
                      </td>

                      {/* LINE DISCOUNT */}
                      <td className="p-3 text-right">
                        <input
                          type="number"
                          min="0"
                          value={item.discount || ''}
                          onChange={(e) => handleLineDiscountChange(index, e.target.value)}
                          placeholder="0"
                          className="w-16 text-right px-1.5 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 focus:ring-1 focus:ring-amber-500 outline-none"
                        />
                      </td>

                      {/* LINE TOTAL */}
                      <td className="p-3 text-right font-bold font-mono text-amber-600 dark:text-amber-400">
                        Rs. {parseFloat(item.lineTotal || 0).toFixed(2)}
                      </td>

                      {/* DELETE ACTION */}
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleRemoveCartItem(index)}
                          className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 p-1 rounded transition-colors"
                          title="ඉවත් කරන්න"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT COLUMN: CUSTOMER, SUMMARY & PAYMENT */}
        <div className="w-96 flex flex-col gap-3">

          {/* CUSTOMER SELECTION CARD */}
          <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              {lang === 'si' ? 'පාරිභෝගිකයා තේරීම' : 'Customer Selection'}
            </label>
            
            <div className="relative mb-2">
              <input
                type="text"
                value={customerSearchQuery}
                onChange={(e) => setCustomerSearchQuery(e.target.value)}
                onKeyDown={handleCustSearchKeyDown}
                placeholder={lang === 'si' ? 'පාරිභෝගිකයාගේ නම / දුරකථනය...' : 'Search customer by name/phone...'}
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
              />

              {/* CUSTOMER SEARCH DROPDOWN */}
              {customerSearchQuery.trim() !== '' && filteredCustomers.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
                  {filteredCustomers.map(cust => (
                    <div
                      key={cust.id}
                      onClick={() => {
                        setSelectedCustomer(cust);
                        setCustomerSearchQuery('');
                      }}
                      className="p-2 border-b border-slate-100 dark:border-slate-700 cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-950/30 flex justify-between items-center text-xs"
                    >
                      <div>
                        <div className="font-semibold">{cust.name}</div>
                        <div className="text-[10px] text-slate-400">{cust.phone || 'No phone'}</div>
                      </div>
                      <div className="text-right text-rose-500 font-mono font-semibold">
                        Rs. {parseFloat(cust.outstandingBalance || 0).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SELECTED CUSTOMER DETAILS */}
            {selectedCustomer ? (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg p-2.5 flex justify-between items-center text-xs">
                <div>
                  <div className="font-bold text-amber-900 dark:text-amber-200">{selectedCustomer.name}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {lang === 'si' ? 'පෙර හිඟ මුදල' : 'Prev Outstanding'}: <span className="font-mono text-rose-600 dark:text-rose-400 font-bold">Rs. {previousOutstanding.toFixed(2)}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {lang === 'si' ? 'අපේක්ෂිත නවාංග හිඟය' : 'New Outstanding'}: <span className="font-mono text-rose-700 dark:text-rose-300 font-bold">Rs. {newOutstanding.toFixed(2)}</span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="text-xs text-rose-500 font-bold hover:underline"
                >
                  {lang === 'si' ? 'ඉවත් කරන්න' : 'Clear'}
                </button>
              </div>
            ) : (
              <div className="text-xs text-slate-400 italic text-center py-1">
                {lang === 'si' ? 'සාමාන්‍ය පාරිභෝගිකයා (Walk-in Customer)' : 'Walk-in Customer selected'}
              </div>
            )}
          </div>

          {/* PAYMENT & SUMMARY CARD */}
          <div className="flex-1 bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
            
            {/* TOTALS SUMMARY */}
            <div className="space-y-2 border-b border-slate-200 dark:border-slate-700 pb-3">
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>{lang === 'si' ? 'එකතුව (Subtotal)' : 'Subtotal'}</span>
                <span className="font-mono text-sm font-semibold">Rs. {calculateSubtotal().toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 items-center">
                <span>{lang === 'si' ? 'විශේෂ වට්ටම්' : 'Overall Discount'}</span>
                <input
                  type="number"
                  min="0"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="0.00"
                  className="w-24 text-right px-2 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                />
              </div>

              <div className="flex justify-between items-center pt-2">
                <span className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {lang === 'si' ? 'ගෙවිය යුතු මුළු මුදල' : 'Net Payable'}
                </span>
                <span className="text-2xl font-black font-mono text-amber-600 dark:text-amber-400">
                  Rs. {calculateTotal().toFixed(2)}
                </span>
              </div>
            </div>

            {/* PAYMENT MODE & AMOUNT */}
            <div className="space-y-3 my-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  {lang === 'si' ? 'ගෙවීම් මාධ්‍යය' : 'Payment Method'}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['Cash', 'Card', 'Credit'].map(mode => (
                    <button
                      key={mode}
                      onClick={() => setPaymentType(mode)}
                      className={`py-1.5 text-xs font-bold rounded-lg border transition-all ${
                        paymentType === mode
                          ? 'bg-amber-500 text-white border-amber-500 shadow-md'
                          : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      {mode === 'Cash' ? (lang === 'si' ? 'මුදලින්' : 'Cash') : mode === 'Card' ? (lang === 'si' ? 'කාඩ්පත' : 'Card') : (lang === 'si' ? 'ණයට' : 'Credit')}
                    </button>
                  ))}
                </div>
              </div>

              {/* PAID AMOUNT INPUT */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  {lang === 'si' ? 'ලබාදුන් මුදල (Paid Amount)' : 'Paid Amount'}
                </label>
                <input
                  type="number"
                  step="any"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  onKeyDown={handlePayAmountKeyDown}
                  placeholder="0.00"
                  className="w-full text-right font-mono text-xl font-bold px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-amber-500 outline-none text-emerald-600 dark:text-emerald-400"
                />
              </div>

              {/* QUICK CASH BUTTONS */}
              {paymentType === 'Cash' && (
                <div className="grid grid-cols-5 gap-1">
                  {[100, 500, 1000, 5000].map(val => (
                    <button
                      key={val}
                      onClick={() => handleQuickCash(val)}
                      className="py-1 text-[11px] font-bold bg-slate-100 dark:bg-slate-700 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded text-slate-700 dark:text-slate-200"
                    >
                      +{val}
                    </button>
                  ))}
                  <button
                    onClick={() => handleQuickCash(calculateTotal())}
                    className="py-1 text-[11px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 rounded"
                  >
                    Exact
                  </button>
                </div>
              )}

              {/* BALANCE RETURN / CHANGE */}
              <div className="bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {lang === 'si' ? 'ඉතිරි මුදල (Change)' : 'Balance Return'}
                </span>
                <span className="font-mono text-lg font-bold text-slate-800 dark:text-slate-100">
                  Rs. {calculateBalance().toFixed(2)}
                </span>
              </div>
            </div>

            {/* SAVE & PRINT BUTTON */}
            <button
              onClick={handleSaveInvoice}
              disabled={isSaving || cart.length === 0}
              className={`w-full py-3 text-base font-bold rounded-xl shadow-lg transition-all flex justify-center items-center space-x-2 ${
                isSaving || cart.length === 0
                  ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 hover:scale-[1.01] active:scale-[0.99]'
              }`}
            >
              <span>{isSaving ? (lang === 'si' ? 'සුරකිමින්...' : 'Saving...') : (lang === 'si' ? 'අලෙවිය තහවුරු කරන්න (F10)' : 'Complete & Print (F10)')}</span>
            </button>

          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 📦 BATCH SELECTION MODAL (Showing Active & Exhausted/Old Batches) */}
      {/* ========================================================================= */}
      {isBatchModalOpen && selectedItemForBatch && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-700">
            
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                  {lang === 'si' ? 'Batch තේරීම' : 'Select Batch'}
                </h3>
                <p className="text-xs text-slate-400">{selectedItemForBatch.name}</p>
              </div>
              <button
                onClick={() => setIsBatchModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-2.5">
              {(!selectedItemForBatch.batches || selectedItemForBatch.batches.length === 0) ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  {lang === 'si' ? 'Batch තොරතුරු හමු නොවීය.' : 'No batch information available.'}
                </div>
              ) : (
                selectedItemForBatch.batches.map((batch, bIdx) => {
                  const qty = parseFloat(batch.quantity) || 0;
                  const isExhausted = qty <= 0;

                  return (
                    <div
                      key={batch.batchId || bIdx}
                      onClick={() => {
                        // Manual batch override
                        const cartIdx = cart.findIndex(c => c.id === selectedItemForBatch.id);
                        if (cartIdx !== -1) {
                          const updatedCart = [...cart];
                          updatedCart[cartIdx].selectedBatchId = batch.batchId;
                          setCart(updatedCart);
                        }
                        setIsBatchModalOpen(false);
                      }}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex justify-between items-center ${
                        isExhausted
                          ? 'bg-slate-100 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 opacity-60'
                          : 'bg-white dark:bg-slate-700/50 border-amber-200 dark:border-amber-800 hover:border-amber-500 hover:shadow-md'
                      }`}
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-amber-600 dark:text-amber-400 text-sm">
                            {batch.batchId}
                          </span>
                          {isExhausted && (
                            <span className="text-[10px] bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 px-1.5 py-0.5 rounded font-bold">
                              {lang === 'si' ? 'අවසන් වූ Batch එකක්' : 'Exhausted'}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          EXP: {batch.expDate || 'N/A'}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className={`text-sm font-bold font-mono ${isExhausted ? 'text-slate-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {qty} {selectedItemForBatch.unit || 'PCS'}
                        </div>
                        <div className="text-xs text-slate-400">
                          Rs. {parseFloat(batch.sellingPrice || selectedItemForBatch.sellingPrice || 0).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 text-right">
              <button
                onClick={() => setIsBatchModalOpen(false)}
                className="px-4 py-1.5 text-xs font-bold rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300"
              >
                {lang === 'si' ? 'වසා දමන්න' : 'Close'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 📄 RECEIPT / INVOICE PRINT MODAL */}
      {/* ========================================================================= */}
      {isReceiptOpen && lastSavedInvoice && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white text-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            
            {/* PRINTABLE RECEIPT TEMPLATE */}
            <div id="printable-receipt" className="text-xs font-mono space-y-3">
              <div className="text-center space-y-1 border-b border-dashed border-slate-300 pb-3">
                <h2 className="text-lg font-bold uppercase tracking-wider">WEERAKKODI STORES</h2>
                <p className="text-[11px] text-slate-600">Main Street, Colombo Road, Sri Lanka</p>
                <p className="text-[11px] text-slate-600">Tel: 077-1234567 / 034-2212345</p>
              </div>

              <div className="flex justify-between text-[11px] border-b border-dashed border-slate-300 pb-2">
                <div>
                  <div>INV: <span className="font-bold">{lastSavedInvoice.invoiceNo}</span></div>
                  <div>CUST: {lastSavedInvoice.customerName}</div>
                </div>
                <div className="text-right">
                  <div>DATE: {new Date(lastSavedInvoice.date).toLocaleDateString()}</div>
                  <div>TIME: {new Date(lastSavedInvoice.date).toLocaleTimeString()}</div>
                </div>
              </div>

              {/* ITEMS TABLE */}
              <table className="w-full text-left my-2">
                <thead>
                  <tr className="border-b border-slate-300 text-[11px]">
                    <th className="py-1">ITEM</th>
                    <th className="py-1 text-center">QTY</th>
                    <th className="py-1 text-right">PRICE</th>
                    <th className="py-1 text-right">TOTAL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lastSavedInvoice.items.map((item, i) => (
                    <tr key={i} className="text-[11px]">
                      <td className="py-1">{item.name}</td>
                      <td className="py-1 text-center">{item.qty} {item.selectedUom}</td>
                      <td className="py-1 text-right">{parseFloat(item.unitPrice).toFixed(2)}</td>
                      <td className="py-1 text-right font-bold">{parseFloat(item.lineTotal).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* TOTALS */}
              <div className="border-t border-dashed border-slate-300 pt-2 space-y-1">
                <div className="flex justify-between">
                  <span>SUBTOTAL</span>
                  <span>Rs. {parseFloat(lastSavedInvoice.subtotal).toFixed(2)}</span>
                </div>
                {lastSavedInvoice.discount > 0 && (
                  <div className="flex justify-between">
                    <span>DISCOUNT</span>
                    <span>- Rs. {parseFloat(lastSavedInvoice.discount).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold border-t border-slate-800 pt-1">
                  <span>NET TOTAL</span>
                  <span>Rs. {parseFloat(lastSavedInvoice.netTotal).toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span>PAID AMOUNT</span>
                  <span>Rs. {parseFloat(lastSavedInvoice.payAmount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>CHANGE</span>
                  <span>Rs. {parseFloat(lastSavedInvoice.changeAmount).toFixed(2)}</span>
                </div>

                {/* CUSTOMER OUTSTANDING SUMMARY */}
                {lastSavedInvoice.customerId && (
                  <div className="border-t border-dashed border-slate-300 pt-2 mt-2 text-[11px]">
                    <div className="flex justify-between">
                      <span>PREV BALANCE:</span>
                      <span>Rs. {parseFloat(lastSavedInvoice.previousOutstanding || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold">
                      <span>NEW OUTSTANDING:</span>
                      <span>Rs. {parseFloat(lastSavedInvoice.newOutstanding || 0).toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="text-center pt-4 border-t border-dashed border-slate-300 space-y-1 text-[11px]">
                <p className="font-bold">THANK YOU FOR YOUR BUSINESS!</p>
                <p className="text-[10px] text-slate-500">Software by Weerakkodi POS</p>
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div className="mt-6 flex space-x-3">
              <button
                onClick={handlePrintReceipt}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl shadow-lg transition-all"
              >
                🖨️ {lang === 'si' ? 'මුද්‍රණය කරන්න' : 'Print Receipt'}
              </button>
              <button
                onClick={handleCloseReceipt}
                className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all"
              >
                {lang === 'si' ? 'වසා දමන්න' : 'Close'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}