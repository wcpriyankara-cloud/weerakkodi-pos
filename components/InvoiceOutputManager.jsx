'use client';

// components/InvoiceOutputManager.jsx
// ✅ Next.js — same-origin portal links
// ✅ WhatsApp/Share default showPortalLink: true

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '@/shared/firebase-config';
import { useUserAuth } from '@/context/UserContext';
import {
  collection, query, where, getDocs,
  doc, getDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';

const CATALOG_BASE =
  process.env.NEXT_PUBLIC_CATALOG_URL || 'https://pos-catalog-gold.vercel.app';

// ★ Same-origin portal link base
const POS_BASE =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_POS_URL ||
  (typeof window !== 'undefined' ? window.location.origin : '');

/* ══════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════ */
const R2 = (v) => {
  const n = parseFloat(String(v ?? 0).replace(/,/g, ''));
  if (isNaN(n) || !isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
};

const fmt = (v) =>
  R2(v).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtDate = (v) => {
  if (!v) return '-';
  try {
    const d = v?.toDate ? v.toDate() : new Date(v);
    return isNaN(d.getTime()) ? '-' : d.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '-'; }
};

const formatPhoneWA = (phone) => {
  if (!phone) return '';
  let c = String(phone).replace(/\s/g, '');
  if (c.startsWith('+')) return c.substring(1);
  if (c.startsWith('0')) return '94' + c.substring(1);
  if (c.startsWith('7') && c.length === 9) return '94' + c;
  return c;
};

const formatPhoneSMS = (phone) => {
  if (!phone) return '';
  let c = String(phone).replace(/[^\d+]/g, '');
  if (!c.startsWith('+') && !c.startsWith('0')) c = '+94' + c;
  return c;
};

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getSMSCount = (msg) => {
  const hasUnicode = /[^\u0000-\u007F]/.test(msg);
  const perSMS = hasUnicode ? 70 : 160;
  const parts = Math.ceil(msg.length / perSMS);
  return { chars: msg.length, perSMS, parts };
};

/* ══════════════════════════════════════════════════════════
   LANGUAGE LABELS
   ══════════════════════════════════════════════════════════ */
const LANG = {
  en: {
    invoiceTitle: 'INVOICE', returnTitle: 'SALES RETURN NOTE',
    returnBadge: 'SALES RETURN NOTE', no: 'No:', returnNo: 'Return No:',
    originalInvoice: 'Original Invoice:', date: 'Date:',
    customer: 'Customer:', phone: 'Phone:', address: 'Addr:',
    items: 'ITEMS', returnedItems: 'RETURNED ITEMS',
    gross: 'Gross:', discount: 'Discount:', billDisc: 'Bill Disc:',
    exchange: 'Exchange:', netTotal: 'NET TOTAL', refundTotal: 'REFUND TOTAL',
    pay: 'Pay:', refundVia: 'Refund Via:', paid: 'Paid:',
    refundAmt: 'Refund Amt:', change: 'CHANGE', creditDue: 'CREDIT DUE',
    prevDue: 'Prev Due:', totalDue: 'TOTAL DUE', note: 'NOTE:',
    warranty: 'WTY:', computerGenerated: 'Computer Generated',
    cash: 'CASH', card: 'CARD', etransfer: 'E-TRANSFER',
    cheque: 'CHEQUE', credit: 'CREDIT',
    cashRefund: 'CASH REFUND', creditAdjustment: 'CREDIT ADJUSTMENT',
    exchangeRefund: 'EXCHANGE',
    waCash: '💵 Cash', waCard: '💳 Card', waEtransfer: '📲 E-Transfer',
    waCheque: '🧾 Cheque', waCredit: '📝 Credit',
    waCashRefund: '💵 Cash Refund', waCreditAdj: '🏦 Credit Adjustment',
    waExchange: '🔄 Exchange',
    smsItems: 'ITEMS', smsReturnedItems: 'RETURNED', smsCust: 'Cust',
    smsDate: 'Date', smsNo: 'No', smsRet: 'Ret', smsOrig: 'Orig',
    smsGross: 'Gross', smsDisc: 'Disc', smsBillDisc: 'BillDisc',
    smsExchange: 'Exchange', smsTotal: 'Total', smsRefund: 'Refund',
    smsPay: 'Pay', smsPaid: 'Paid', smsRefunded: 'Refunded',
    smsChange: 'Change', smsDue: 'Due', smsPrevDue: 'PrevDue',
    smsOutstanding: 'Outstanding', smsAccount: 'Account',
    smsNote: 'Note', smsWarranty: 'WTY', smsReturn: 'RETURN',
  },
  si: {
    invoiceTitle: 'ඉන්වොයිසිය', returnTitle: 'විකුණුම් ආපසු භාර පත්‍රය',
    returnBadge: '↩️ විකුණුම් ආපසු භාර පත්‍රය', no: 'අංකය:',
    returnNo: 'ආපසු අංකය:', originalInvoice: 'මුල් ඉන්වොයිසිය:',
    date: 'දිනය:', customer: 'පාරිභෝගිකයා:', phone: 'දුරකථනය:',
    address: 'ලිපිනය:', items: 'භාණ්ඩ', returnedItems: 'ආපසු භාණ්ඩ',
    gross: 'මුළු එකතුව:', discount: 'වට්ටම:', billDisc: 'බිල්පත් වට්ටම:',
    exchange: 'හුවමාරුව:', netTotal: 'ශුද්ධ එකතුව',
    refundTotal: 'ආපසු මුදල', pay: 'ගෙවීම:', refundVia: 'ආපසු ගෙවීම:',
    paid: 'ගෙවූ මුදල:', refundAmt: 'ආපසු මුදල:',
    change: 'ශේෂය', creditDue: 'ණය මුදල', prevDue: 'පෙර ණය:',
    totalDue: 'මුළු ණය', note: 'සටහන:', warranty: 'වගකීම:',
    computerGenerated: 'පරිගණක ජනිත',
    cash: 'මුදල්', card: 'කාඩ්', etransfer: 'ඊ-හුවමාරු',
    cheque: 'චෙක්පත', credit: 'ණය',
    cashRefund: 'මුදල් ආපසු', creditAdjustment: 'ණය සකසුම',
    exchangeRefund: 'හුවමාරුව',
    waCash: '💵 මුදල්', waCard: '💳 කාඩ්', waEtransfer: '📲 ඊ-හුවමාරු',
    waCheque: '🧾 චෙක්පත', waCredit: '📝 ණය',
    waCashRefund: '💵 මුදල් ආපසු', waCreditAdj: '🏦 ණය සකසුම',
    waExchange: '🔄 හුවමාරුව',
    smsItems: 'භාණ්ඩ', smsReturnedItems: 'ආපසු', smsCust: 'ගනුදෙනුකරු',
    smsDate: 'දිනය', smsNo: 'අංකය', smsRet: 'ආපසු', smsOrig: 'මුල්',
    smsGross: 'මුළු', smsDisc: 'වට්ටම', smsBillDisc: 'බිල් වට්ටම',
    smsExchange: 'හුවමාරුව', smsTotal: 'එකතුව', smsRefund: 'ආපසු',
    smsPay: 'ගෙවීම', smsPaid: 'ගෙවූ', smsRefunded: 'ආපසු',
    smsChange: 'ශේෂය', smsDue: 'ණය', smsPrevDue: 'පෙර ණය',
    smsOutstanding: 'මුළු ණය', smsAccount: 'ගිණුම',
    smsNote: 'සටහන', smsWarranty: 'වගකීම', smsReturn: 'ආපසු භාරය',
  },
};

const getLang = (k) => k === 'si' ? LANG.si : LANG.en;

const getPaymentLabel = (method, L, isWa = false) => {
  if (isWa) {
    const m = { cash: L.waCash, card: L.waCard, etransfer: L.waEtransfer, cheque: L.waCheque, credit: L.waCredit };
    return m[method] || method;
  }
  const m = { cash: L.cash, card: L.card, etransfer: L.etransfer, cheque: L.cheque, credit: L.credit };
  return m[method] || method;
};

const getRefundLabel = (method, L, isWa = false) => {
  if (isWa) {
    const m = { cash: L.waCashRefund, credit: L.waCreditAdj, exchange: L.waExchange };
    return m[method] || method;
  }
  const m = { cash: L.cashRefund, credit: L.creditAdjustment, exchange: L.exchangeRefund };
  return m[method] || method;
};

/* ══════════════════════════════════════════════════════════
   RETURN + OUTSTANDING
   ══════════════════════════════════════════════════════════ */
const isReturnDoc = (invoice) => invoice?._docType === 'return';

const getCreditDueFromInvoice = (invoice) => {
  if (isReturnDoc(invoice)) return 0;
  const net = R2(invoice?.netAmount);
  const paid = R2(invoice?.payAmount);
  const bal = R2(invoice?.balance);
  const method = invoice?.paymentMethod || 'cash';
  const isCreditSale = method === 'credit' || bal < -0.01;
  return isCreditSale ? Math.max(0, R2(net - paid)) : 0;
};

const getOutstandingInfo = (invoice, customer) => {
  if (isReturnDoc(invoice))
    return { creditDue: 0, isCreditSale: false, previousBalance: 0, newBalance: 0 };
  const dbBal = R2(customer?.currentBalance ?? invoice?.customerCurrentBalance ?? 0);
  const creditDue = getCreditDueFromInvoice(invoice);
  const isCreditSale = creditDue > 0.009;
  const previousBalance = invoice?.previousOutstanding != null
    ? R2(invoice.previousOutstanding)
    : isCreditSale ? R2(dbBal - creditDue) : dbBal;
  const newBalance = invoice?.newOutstanding != null
    ? R2(invoice.newOutstanding)
    : isCreditSale ? dbBal : previousBalance;
  return { creditDue, isCreditSale, previousBalance: R2(previousBalance), newBalance: R2(newBalance) };
};

/* ══════════════════════════════════════════════════════════
   ★ PORTAL LINK — same origin
   ══════════════════════════════════════════════════════════ */
const getPortalLink = (customer) => {
  const key = customer?.portalAccessKey;
  if (!key) return '';
  return `${POS_BASE.replace(/\/$/, '')}/portal/${key}`;
};

/* ══════════════════════════════════════════════════════════
   DEFAULT VISIBILITY
   ══════════════════════════════════════════════════════════ */
const DEFAULT_VISIBILITY = {
  showCustomerName: true, showCustomerPhone: false, showCustomerAddress: false,
  showItemPrices: true, showItemDiscount: true, showDiscountPercent: true,
  showGrossTotal: true, showTotalDiscount: true, showBillDiscount: true,
  showExchangeAmount: true, showNetAmount: true, showPaymentMethod: true,
  showPaidAmount: true, showBalance: true, showPreviousBalance: false,
  showNewBalance: false, showCreditDue: true, showRemarks: false,
  showWarranty: true, showUOM: true, showItemSinhala: true,
  showInvoiceNo: true, showDate: true, showPortalLink: false,
  showBusinessLogo: true, showBusinessName: true, showBusinessAddress: true,
  showBusinessPhone: true, showFooterMessage: true,
};

/* ══════════════════════════════════════════════════════════
   ★ DEFAULT MODE SETTINGS — portal link ON for whatsapp/share
   ══════════════════════════════════════════════════════════ */
const buildDefaultModeSettings = () => ({
  print: {
    lang: 'en',
    visibility: { ...DEFAULT_VISIBILITY, showPortalLink: false },
  },
  whatsapp: {
    lang: 'en',
    visibility: { ...DEFAULT_VISIBILITY, showPortalLink: true },
  },
  sms: {
    lang: 'en',
    visibility: {
      ...DEFAULT_VISIBILITY,
      showCustomerAddress: false, showItemSinhala: false,
      showWarranty: false, showBillDiscount: false,
      showExchangeAmount: false, showPreviousBalance: false,
      showPortalLink: false, showBusinessLogo: false,
      showBusinessAddress: false, showBusinessPhone: false,
      showDiscountPercent: false, showUOM: false,
      showRemarks: false, showGrossTotal: false, showTotalDiscount: false,
    },
  },
  share: {
    lang: 'en',
    visibility: { ...DEFAULT_VISIBILITY, showPortalLink: true },
  },
});

/* ══════════════════════════════════════════════════════════
   VISIBILITY SECTIONS
   ══════════════════════════════════════════════════════════ */
const VISIBILITY_SECTIONS = [
  {
    title: '👤 පාරිභෝගික', icon: '👤',
    fields: [
      { key: 'showCustomerName',    label: 'නම',       labelEn: 'Customer Name' },
      { key: 'showCustomerPhone',   label: 'දුරකථන',   labelEn: 'Phone' },
      { key: 'showCustomerAddress', label: 'ලිපිනය',   labelEn: 'Address' },
    ],
  },
  {
    title: '💰 මුදල්', icon: '💰',
    fields: [
      { key: 'showItemPrices',      label: 'භාණ්ඩ මිල',     labelEn: 'Item Prices' },
      { key: 'showItemDiscount',    label: 'භාණ්ඩ වට්ටම',   labelEn: 'Item Discount' },
      { key: 'showDiscountPercent', label: 'වට්ටම %',        labelEn: 'Discount %' },
      { key: 'showGrossTotal',      label: 'මුළු එකතුව',     labelEn: 'Gross Total' },
      { key: 'showTotalDiscount',   label: 'මුළු වට්ටම',     labelEn: 'Total Discount' },
      { key: 'showBillDiscount',    label: 'බිල් වට්ටම',    labelEn: 'Bill Discount' },
      { key: 'showExchangeAmount',  label: 'හුවමාරු',        labelEn: 'Exchange' },
      { key: 'showNetAmount',       label: 'ශුද්ධ මුදල',     labelEn: 'Net Amount' },
      { key: 'showPaymentMethod',   label: 'ගෙවීම් ක්‍රමය', labelEn: 'Payment Method' },
      { key: 'showPaidAmount',      label: 'ගෙවූ මුදල',      labelEn: 'Paid Amount' },
      { key: 'showBalance',         label: 'ශේෂය',           labelEn: 'Balance' },
    ],
  },
  {
    title: '📊 ණය', icon: '📊',
    fields: [
      { key: 'showPreviousBalance', label: 'පෙර ණය',    labelEn: 'Previous Balance' },
      { key: 'showNewBalance',      label: 'නව ණය',     labelEn: 'New Balance' },
      { key: 'showCreditDue',       label: 'ණය මුදල',   labelEn: 'Credit Due' },
    ],
  },
  {
    title: '📝 අමතර', icon: '📝',
    fields: [
      { key: 'showRemarks',     label: 'සටහන්',         labelEn: 'Remarks' },
      { key: 'showWarranty',    label: 'වගකීම',         labelEn: 'Warranty' },
      { key: 'showUOM',         label: 'ඒකක',           labelEn: 'UOM' },
      { key: 'showItemSinhala', label: 'සිංහල නම',      labelEn: 'Sinhala Name' },
      { key: 'showInvoiceNo',   label: 'ඉන්වොයිස් අංකය', labelEn: 'Invoice No' },
      { key: 'showDate',        label: 'දිනය',          labelEn: 'Date & Time' },
    ],
  },
  {
    title: '🔗 Portal', icon: '🔗',
    fields: [
      { key: 'showPortalLink', label: 'Portal Link', labelEn: 'Portal Link' },
    ],
  },
  {
    title: '🏢 ව්‍යාපාර', icon: '🏢',
    fields: [
      { key: 'showBusinessLogo',    label: 'Logo',          labelEn: 'Logo' },
      { key: 'showBusinessName',    label: 'ව්‍යාපාර නම',  labelEn: 'Business Name' },
      { key: 'showBusinessAddress', label: 'ලිපිනය',        labelEn: 'Address' },
      { key: 'showBusinessPhone',   label: 'දුරකථන',        labelEn: 'Phone' },
      { key: 'showFooterMessage',   label: 'Footer',        labelEn: 'Footer' },
    ],
  },
];

/* ══════════════════════════════════════════════════════════
   PRESETS
   ══════════════════════════════════════════════════════════ */
const PRESETS = {
  full:     { name: '📋 සම්පූර්ණ', config: Object.fromEntries(Object.keys(DEFAULT_VISIBILITY).map(k => [k, true])) },
  minimal:  { name: '📄 සරල', config: { ...Object.fromEntries(Object.keys(DEFAULT_VISIBILITY).map(k => [k, false])), showCustomerName: true, showItemPrices: true, showNetAmount: true, showInvoiceNo: true, showDate: true, showBusinessName: true } },
  standard: { name: '📊 සම්මත', config: { ...DEFAULT_VISIBILITY } },
  privacy:  { name: '🔒 පෞද්ගලිකත්වය', config: { ...DEFAULT_VISIBILITY, showCustomerPhone: false, showCustomerAddress: false, showPreviousBalance: false, showNewBalance: false, showPortalLink: false, showRemarks: false } },
};

/* ══════════════════════════════════════════════════════════
   TOGGLE SWITCH
   ══════════════════════════════════════════════════════════ */
function ToggleSwitch({ checked, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} style={{
      width: 44, height: 24, borderRadius: 12, border: 'none',
      cursor: 'pointer', background: checked ? '#16a34a' : '#d1d5db',
      position: 'relative', transition: 'background 0.2s', flexShrink: 0, padding: 0,
    }}>
      <span style={{
        position: 'absolute', top: 2, left: checked ? 22 : 2,
        width: 20, height: 20, borderRadius: '50%', background: 'white',
        transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}

/* ══════════════════════════════════════════════════════════
   LANGUAGE SELECTOR
   ══════════════════════════════════════════════════════════ */
function LanguageSelector({ lang, onChange, modeLabel }) {
  const opts = [
    { key: 'en',    label: '🇬🇧 English', desc: 'English labels' },
    { key: 'si',    label: '🇱🇰 සිංහල',   desc: 'සිංහල labels' },
    { key: 'mixed', label: '🔀 Mixed',    desc: 'EN + Sinhala names' },
  ];
  const colors = { en: '#2563eb', si: '#16a34a', mixed: '#7c3aed' };
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>
        🌐 භාෂාව — <strong>{modeLabel}</strong>
      </div>
      <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        {opts.map((opt, i) => (
          <button key={opt.key} onClick={() => onChange(opt.key)} style={{
            flex: 1, padding: '9px 4px', border: 'none',
            borderLeft: i > 0 ? '1px solid #e2e8f0' : 'none',
            fontWeight: 800, fontSize: 12, cursor: 'pointer',
            background: lang === opt.key ? colors[opt.key] : '#f8fafc',
            color: lang === opt.key ? '#fff' : '#64748b',
          }}>
            {opt.label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
        {opts.find(o => o.key === lang)?.desc || ''}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   BUILD RECEIPT HTML
   ══════════════════════════════════════════════════════════ */
function buildReceiptHTML(invoice, settings, visibility, customer, langKey = 'en') {
  const v = visibility || DEFAULT_VISIBILITY;
  const biz = settings || {};
  const items = invoice?.items || [];
  const isReturn = isReturnDoc(invoice);
  const L = getLang(langKey);

  const grossTotal   = R2(invoice?.grossTotal);
  const billDiscount = R2(invoice?.billDiscount);
  const totalDiscount = R2(invoice?.totalDiscount);
  const exchangeAmt  = R2(invoice?.exchangeAmount);
  const netAmount    = R2(invoice?.netAmount);
  const payAmount    = R2(invoice?.payAmount);
  const balance      = R2(invoice?.balance);
  const remarks      = invoice?.remarks || invoice?.invoiceRemark || '';
  const payMethod    = isReturn ? (invoice?.refundMethod || 'cash') : (invoice?.paymentMethod || 'cash');
  const { previousBalance, newBalance, creditDue, isCreditSale } = getOutstandingInfo(invoice, customer);
  const invoiceNo     = invoice?.invoiceNo || invoice?.id?.slice(0, 8)?.toUpperCase() || '';
  const originalInvNo = invoice?.originalInvoiceNo || '';
  const invDate       = fmtDate(invoice?.createdAt);
  const portalLink    = getPortalLink(customer);

  const row = (l, r, fs = 14) =>
    `<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:${fs}px;font-weight:900;color:#000;line-height:1.3"><span>${esc(l)}</span><span style="text-align:right;max-width:58%;word-break:break-word;margin-left:4px">${esc(r)}</span></div>`;
  const center = (txt, fs = 12) =>
    `<div style="text-align:center;font-weight:900;color:#000;font-size:${fs}px">${esc(txt)}</div>`;
  const div1 = `<div style="border-top:2px dashed #000;margin:5px 0"></div>`;
  const div2 = `<div style="border-top:1px dashed #000;margin:4px 0"></div>`;
  const div3 = `<div style="border-top:3px solid #000;margin:5px 0"></div>`;

  let html = '';
  if (v.showBusinessLogo && biz.logo) html += `<div style="text-align:center;margin-bottom:4px"><img src="${esc(biz.logo)}" crossorigin="anonymous" style="max-height:50px;max-width:80%;object-fit:contain" /></div>`;
  if (v.showBusinessName) html += center(biz.businessName || (isReturn ? L.returnTitle : L.invoiceTitle), 20);
  if (isReturn) html += `<div style="text-align:center;margin:4px 0"><span style="background:#fef2f2;color:#dc2626;font-size:13px;font-weight:900;padding:3px 14px;border-radius:20px;border:2px solid #fecaca">${esc(L.returnBadge)}</span></div>`;
  if (v.showBusinessAddress && biz.address) html += center(biz.address, 11);
  if (v.showBusinessPhone && biz.phone) html += center(`Tel: ${biz.phone}`, 11);
  html += div1;
  if (v.showInvoiceNo) { html += row(isReturn ? L.returnNo : L.no, invoiceNo, 15); if (isReturn && originalInvNo) html += row(L.originalInvoice, originalInvNo, 12); }
  if (v.showDate) html += row(L.date, invDate, 13);
  if (v.showCustomerName || v.showCustomerPhone || v.showCustomerAddress) html += div2;
  if (v.showCustomerName) html += row(L.customer, invoice?.customerName || 'Cash', 15);
  if (v.showCustomerPhone && invoice?.customerPhone) html += row(L.phone, invoice.customerPhone, 13);
  if (v.showCustomerAddress && invoice?.customerAddress) html += row(L.address, invoice.customerAddress, 12);
  html += div1;
  html += center(isReturn ? `— ${L.returnedItems} (${items.length}) —` : `— ${L.items} (${items.length}) —`, 12);

  items.forEach((item, i) => {
    const sp = R2(item.sellingPrice), yp = R2(item.yourPrice), qty = R2(item.qty);
    const hasDisc = sp > yp && sp > 0;
    const lt = R2(item.lineTotal ?? yp * qty);
    const uom = item.uom && item.uom !== 'unit' ? ` ${item.uom}` : '';
    const discPct = hasDisc && sp > 0 ? R2(((sp - yp) / sp) * 100) : 0;
    const border = i < items.length - 1 ? 'border-bottom:1px dotted #000;' : '';
    let primary = item.name || '', secondary = '';
    if (langKey === 'si' && item.nameSi) { primary = item.nameSi; secondary = item.name || ''; }
    else if (item.nameSi && v.showItemSinhala) secondary = item.nameSi;
    html += `<div style="margin-bottom:4px;padding-bottom:3px;${border}">`;
    html += `<div style="font-weight:900;font-size:14px;color:#000;word-break:break-word;line-height:1.2">${i + 1}. ${esc(primary)}</div>`;
    if (secondary) html += `<div style="font-size:12px;font-weight:900;color:#000;padding-left:14px">(${esc(secondary)})</div>`;
    if (v.showItemPrices) {
      let priceStr = '';
      if (hasDisc && v.showItemDiscount) {
        priceStr = `<span style="text-decoration:line-through">${fmt(sp)}</span> ${fmt(yp)}`;
        if (v.showDiscountPercent) priceStr += ` <span style="font-size:11px">(-${discPct}%)</span>`;
      } else { priceStr = fmt(sp); }
      html += `<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:900;color:#000;padding-left:14px;margin-top:1px"><span>${priceStr} x${qty}${v.showUOM ? esc(uom) : ''}</span><span style="font-size:14px;font-weight:900">Rs.${fmt(lt)}</span></div>`;
    }
    if (v.showWarranty && item.warrantyCode) html += `<div style="font-size:11px;font-weight:900;color:#000;padding-left:14px">${esc(L.warranty)} ${esc(item.warrantyCode)}${item.warrantyPeriod ? ' | ' + esc(item.warrantyPeriod) : ''}</div>`;
    html += `</div>`;
  });

  html += div1;
  if (!isReturn) {
    if (v.showGrossTotal) html += row(L.gross, `Rs.${fmt(grossTotal)}`);
    if (v.showTotalDiscount && totalDiscount > 0) html += row(L.discount, `-Rs.${fmt(totalDiscount)}`);
    if (v.showBillDiscount && billDiscount > 0) html += row(L.billDisc, `-Rs.${fmt(billDiscount)}`);
    if (v.showExchangeAmount && exchangeAmt > 0) html += row(L.exchange, `-Rs.${fmt(exchangeAmt)}`);
  }
  if (v.showNetAmount) {
    html += div3;
    html += `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:20px;font-weight:900;color:#000"><span>${esc(isReturn ? L.refundTotal : L.netTotal)}</span><span>Rs.${fmt(netAmount)}</span></div>`;
    html += div3;
  }
  if (v.showPaymentMethod) html += row(isReturn ? L.refundVia : L.pay, isReturn ? getRefundLabel(payMethod, L) : getPaymentLabel(payMethod, L), 15);
  if (v.showPaidAmount) html += row(isReturn ? L.refundAmt : L.paid, `Rs.${fmt(payAmount)}`, 15);
  if (!isReturn) {
    if (v.showBalance && balance >= 0.01) { html += div2; html += `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:17px;font-weight:900;color:#000"><span>${esc(L.change)}</span><span>Rs.${fmt(balance)}</span></div>`; }
    if (v.showCreditDue && isCreditSale && creditDue > 0) { html += div2; html += `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:17px;font-weight:900;color:#000"><span>${esc(L.creditDue)}</span><span>Rs.${fmt(creditDue)}</span></div>`; }
    if (v.showPreviousBalance) { html += div1; html += row(L.prevDue, `Rs.${fmt(previousBalance)}`, 15); }
    if (v.showNewBalance) { html += `<div style="border-top:2px solid #000;margin:3px 0"></div>`; html += `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:17px;font-weight:900;color:#000"><span>${esc(L.totalDue)}</span><span>Rs.${fmt(newBalance)}</span></div>`; }
  }
  if (v.showRemarks && remarks) html += div2 + `<div style="font-size:12px;font-weight:900;color:#000;padding:2px 0;word-break:break-word">${esc(L.note)} ${esc(remarks)}</div>`;
  if (!isReturn && v.showPortalLink && portalLink) { html += div2; html += `<div style="text-align:center;font-size:10px;font-weight:900;color:#000;word-break:break-all;padding:2px 0">${esc(portalLink)}</div>`; }
  html += div3;
  if (v.showFooterMessage) html += center(biz.footerMessage || (isReturn ? 'Return Processed!' : 'Thank You!'), 14);
  html += center(L.computerGenerated, 9);
  return html;
}

/* ══════════════════════════════════════════════════════════
   IFRAME PRINT
   ══════════════════════════════════════════════════════════ */
function printViaIframe(receiptHTML) {
  const fullHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Receipt</title><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:80mm;max-width:80mm;font-family:'Courier New',Courier,monospace;font-size:14px;font-weight:900;color:#000;background:#fff;line-height:1.4}body{padding:2mm 3mm}div,span,p{color:#000!important;font-weight:900!important}img{max-width:80%!important}@page{size:80mm auto;margin:0}@media print{html,body{width:80mm!important;max-width:80mm!important;margin:0!important;padding:2mm 3mm!important}}</style></head><body>${receiptHTML}</body></html>`;

  return new Promise((resolve) => {
    const isMobileSafari = typeof navigator !== 'undefined' && /iP(ad|hone|od)/.test(navigator.userAgent) && /WebKit/.test(navigator.userAgent) && !/CriOS/.test(navigator.userAgent);
    if (isMobileSafari) {
      const blob = new Blob([fullHTML], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (w) { setTimeout(() => { try { w.print(); } catch {} setTimeout(() => URL.revokeObjectURL(url), 5000); }, 800); }
      else { URL.revokeObjectURL(url); }
      resolve(); return;
    }
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
    document.body.appendChild(iframe);
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) { document.body.removeChild(iframe); resolve(); return; }
    iframeDoc.open(); iframeDoc.write(fullHTML); iframeDoc.close();
    let resolved = false;
    const cleanup = () => { if (resolved) return; resolved = true; setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); resolve(); }, 300); };
    let printed = false;
    const doPrint = async () => {
      if (printed) return; printed = true;
      try {
        const imgs = Array.from(iframeDoc.images || []);
        await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(res => { img.onload = res; img.onerror = res; })));
        iframe.contentWindow?.addEventListener('afterprint', cleanup);
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) { console.warn('Print error:', e); cleanup(); }
      setTimeout(cleanup, 30000);
    };
    iframe.onload = () => setTimeout(doPrint, 300);
    setTimeout(doPrint, 1500);
  });
}

/* ══════════════════════════════════════════════════════════
   BUILD WHATSAPP MESSAGE
   ══════════════════════════════════════════════════════════ */
function buildWAMessage(invoice, customer, settings, visibility, langKey = 'en') {
  const v = visibility || DEFAULT_VISIBILITY;
  const biz = settings || {};
  const items = invoice?.items || [];
  const isReturn = isReturnDoc(invoice);
  const L = getLang(langKey);
  const invoiceNo = invoice?.invoiceNo || invoice?.id?.slice(0, 8)?.toUpperCase() || '';
  const netAmount = R2(invoice?.netAmount);
  const payAmount = R2(invoice?.payAmount);
  const balance   = R2(invoice?.balance);
  const remarks   = invoice?.remarks || invoice?.invoiceRemark || '';
  const payMethod = isReturn ? (invoice?.refundMethod || 'cash') : (invoice?.paymentMethod || 'cash');
  const { previousBalance, newBalance, creditDue, isCreditSale } = getOutstandingInfo(invoice, customer);
  const portalLink = getPortalLink(customer);

  let msg = '';
  if (v.showBusinessName) msg += `${isReturn ? '↩️' : '🧾'} *${biz.businessName || (isReturn ? L.returnTitle : L.invoiceTitle)}*\n`;
  if (isReturn) msg += `*${L.returnBadge}*\n`;
  msg += `━━━━━━━━━━━━━━\n`;
  if (v.showInvoiceNo) { msg += `📋 *${isReturn ? L.returnNo : L.no}* ${invoiceNo}\n`; if (isReturn && invoice?.originalInvoiceNo) msg += `🧾 *${L.originalInvoice}* ${invoice.originalInvoiceNo}\n`; }
  if (v.showDate) msg += `📅 *${L.date}* ${fmtDate(invoice?.createdAt)}\n`;
  if (v.showCustomerName) msg += `👤 *${L.customer}* ${invoice?.customerName || 'Cash'}\n`;
  if (v.showCustomerPhone && invoice?.customerPhone) msg += `📞 ${invoice.customerPhone}\n`;
  msg += `━━━━━━━━━━━━━━\n\n`;

  items.forEach((it, i) => {
    const sp = R2(it.sellingPrice), yp = R2(it.yourPrice), qty = R2(it.qty);
    const lt = R2(it.lineTotal ?? yp * qty);
    const hasDisc = sp > yp && sp > 0;
    const uom = v.showUOM && it.uom && it.uom !== 'unit' ? ` ${it.uom}` : '';
    let name = it.name || '', siNote = '';
    if (langKey === 'si' && it.nameSi) { name = it.nameSi; siNote = it.name ? ` (${it.name})` : ''; }
    else if (it.nameSi && v.showItemSinhala) siNote = ` (${it.nameSi})`;
    msg += `${i + 1}. *${name}*${siNote}\n`;
    if (v.showItemPrices) {
      if (hasDisc && v.showItemDiscount) {
        msg += `   ~Rs.${fmt(sp)}~`;
        if (v.showDiscountPercent && sp > 0) msg += ` (-${R2(((sp - yp) / sp) * 100)}%)`;
        msg += `\n   *Rs.${fmt(yp)}* × ${qty}${uom} = *Rs.${fmt(lt)}*\n`;
      } else { msg += `   Rs.${fmt(sp)} × ${qty}${uom} = *Rs.${fmt(lt)}*\n`; }
    }
    if (v.showWarranty && it.warrantyCode) msg += `   🛡️ ${it.warrantyCode}${it.warrantyPeriod ? ` · ${it.warrantyPeriod}` : ''}\n`;
  });

  msg += `\n━━━━━━━━━━━━━━\n`;
  if (!isReturn) {
    if (v.showGrossTotal && R2(invoice?.grossTotal) > 0) msg += `💰 *${L.gross}* Rs.${fmt(R2(invoice.grossTotal))}\n`;
    if (v.showTotalDiscount && R2(invoice?.totalDiscount) > 0) msg += `🏷️ *${L.discount}* -Rs.${fmt(R2(invoice.totalDiscount))}\n`;
    if (v.showBillDiscount && R2(invoice?.billDiscount) > 0) msg += `📋 *${L.billDisc}* -Rs.${fmt(R2(invoice.billDiscount))}\n`;
    if (v.showExchangeAmount && R2(invoice?.exchangeAmount) > 0) msg += `🔄 *${L.exchange}* -Rs.${fmt(R2(invoice.exchangeAmount))}\n`;
  }
  if (v.showNetAmount) msg += `\n💰 *${isReturn ? L.refundTotal : L.netTotal}:* Rs.${fmt(netAmount)}\n`;
  if (v.showPaymentMethod) msg += isReturn ? `${getRefundLabel(payMethod, L, true)}\n` : `${getPaymentLabel(payMethod, L, true)}\n`;
  if (v.showPaidAmount) msg += `${isReturn ? '💸' : '💵'} *${isReturn ? L.refundAmt : L.paid}* Rs.${fmt(payAmount)}\n`;
  if (!isReturn) {
    if (v.showBalance && balance >= 0.01) msg += `🔄 *${L.change}:* Rs.${fmt(balance)}\n`;
    if (v.showCreditDue && isCreditSale && creditDue > 0) msg += `📝 *${L.creditDue}:* Rs.${fmt(creditDue)}\n`;
    if (v.showPreviousBalance) { msg += `\n━━━━━━━━━━━━━━\n`; msg += `🔴 *${L.prevDue}* Rs.${fmt(previousBalance)}\n`; }
    if (v.showNewBalance) msg += `🔴 *${L.totalDue}:* Rs.${fmt(newBalance)}\n`;
  }
  if (v.showRemarks && remarks) msg += `\n📝 ${remarks}\n`;
  msg += `\n━━━━━━━━━━━━━━\n`;
  if (v.showFooterMessage) msg += `✅ *${biz.footerMessage || (isReturn ? 'Return Processed! ස්තුතියි!' : 'Thank You! ස්තුතියි!')}*\n`;
  if (!isReturn && v.showPortalLink && portalLink) msg += `\n🛒 *ඔබේ ගිණුම:*\n${portalLink}\n`;
  return msg;
}

/* ══════════════════════════════════════════════════════════
   BUILD SMS MESSAGE
   ══════════════════════════════════════════════════════════ */
function buildSMSMessage(invoice, customer, settings, visibility, langKey = 'en') {
  const v = visibility || DEFAULT_VISIBILITY;
  const biz = settings || {};
  const isReturn = isReturnDoc(invoice);
  const L = getLang(langKey);
  const items = invoice?.items || [];
  const netAmount = R2(invoice?.netAmount);
  const payAmount = R2(invoice?.payAmount);
  const balance   = R2(invoice?.balance);
  const payMethod = isReturn ? (invoice?.refundMethod || 'cash') : (invoice?.paymentMethod || 'cash');
  const { creditDue, isCreditSale, previousBalance, newBalance } = getOutstandingInfo(invoice, customer);
  const portalLink = getPortalLink(customer);

  let msg = '';
  if (v.showBusinessName) msg += `${biz.businessName || (isReturn ? L.returnTitle : L.invoiceTitle)}\n`;
  if (isReturn) msg += `${L.smsReturn}\n`;
  if (v.showInvoiceNo) { msg += `${isReturn ? L.smsRet : L.smsNo}:${invoice?.invoiceNo || ''}\n`; if (isReturn && invoice?.originalInvoiceNo) msg += `${L.smsOrig}:${invoice.originalInvoiceNo}\n`; }
  if (v.showDate) msg += `${L.smsDate}:${fmtDate(invoice?.createdAt)}\n`;
  if (v.showCustomerName) msg += `${L.smsCust}:${invoice?.customerName || 'Cash'}\n`;
  if (v.showCustomerPhone && invoice?.customerPhone) msg += `Ph:${invoice.customerPhone}\n`;

  if (v.showItemPrices && items.length > 0) {
    msg += `---\n${isReturn ? L.smsReturnedItems : L.smsItems}(${items.length})\n`;
    items.forEach((item, i) => {
      const sp = R2(item.sellingPrice), yp = R2(item.yourPrice), qty = R2(item.qty);
      const hasDisc = sp > yp && sp > 0;
      const lt = R2(item.lineTotal ?? yp * qty);
      const uom = v.showUOM && item.uom && item.uom !== 'unit' ? item.uom : '';
      let name = item.name || '';
      if (langKey === 'si' && item.nameSi) name = item.nameSi;
      else if (langKey === 'mixed' && item.nameSi && v.showItemSinhala) name = `${item.name}(${item.nameSi})`;
      msg += `${i + 1}.${name}\n`;
      if (hasDisc && v.showItemDiscount) {
        let pl = `  ~${fmt(sp)}~>${fmt(yp)}`;
        if (v.showDiscountPercent && sp > 0) pl += `(-${R2(((sp - yp) / sp) * 100)}%)`;
        msg += `${pl}x${qty}${uom}=Rs.${fmt(lt)}\n`;
      } else { msg += `  ${fmt(sp)}x${qty}${uom}=Rs.${fmt(lt)}\n`; }
      if (v.showWarranty && item.warrantyCode) { msg += `  ${L.smsWarranty}:${item.warrantyCode}`; if (item.warrantyPeriod) msg += `|${item.warrantyPeriod}`; msg += `\n`; }
    });
    msg += `---\n`;
  }

  if (!isReturn) {
    if (v.showGrossTotal && R2(invoice?.grossTotal) > 0) msg += `${L.smsGross}:Rs.${fmt(R2(invoice.grossTotal))}\n`;
    if (v.showTotalDiscount && R2(invoice?.totalDiscount) > 0) msg += `${L.smsDisc}:-Rs.${fmt(R2(invoice.totalDiscount))}\n`;
    if (v.showBillDiscount && R2(invoice?.billDiscount) > 0) msg += `${L.smsBillDisc}:-Rs.${fmt(R2(invoice.billDiscount))}\n`;
    if (v.showExchangeAmount && R2(invoice?.exchangeAmount) > 0) msg += `${L.smsExchange}:-Rs.${fmt(R2(invoice.exchangeAmount))}\n`;
  }
  if (v.showNetAmount) msg += `${isReturn ? L.smsRefund : L.smsTotal}:Rs.${fmt(netAmount)}\n`;
  if (v.showPaymentMethod) msg += `${L.smsPay}:${isReturn ? getRefundLabel(payMethod, L) : getPaymentLabel(payMethod, L)}\n`;
  if (v.showPaidAmount) msg += `${isReturn ? L.smsRefunded : L.smsPaid}:Rs.${fmt(payAmount)}\n`;
  if (!isReturn) {
    if (v.showBalance && balance >= 0.01) msg += `${L.smsChange}:Rs.${fmt(balance)}\n`;
    if (v.showCreditDue && isCreditSale && creditDue > 0) msg += `${L.smsDue}:Rs.${fmt(creditDue)}\n`;
    if (v.showPreviousBalance) msg += `${L.smsPrevDue}:Rs.${fmt(previousBalance)}\n`;
    if (v.showNewBalance) msg += `${L.smsOutstanding}:Rs.${fmt(newBalance)}\n`;
    if (v.showPortalLink && portalLink) msg += `${L.smsAccount}:${portalLink}\n`;
  }
  if (v.showRemarks && (invoice?.remarks || invoice?.invoiceRemark)) msg += `${L.smsNote}:${invoice.remarks || invoice.invoiceRemark}\n`;
  if (v.showFooterMessage) msg += biz.footerMessage || (isReturn ? 'Return Processed!' : 'Thank You!');
  return msg;
}

/* ══════════════════════════════════════════════════════════
   LANG BADGE
   ══════════════════════════════════════════════════════════ */
const LANG_BADGE = { en: { color: '#2563eb', label: 'EN' }, si: { color: '#16a34a', label: 'සිං' }, mixed: { color: '#7c3aed', label: 'Mix' } };
function LangBadge({ lang }) {
  const b = LANG_BADGE[lang] || { color: '#64748b', label: lang };
  return <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: b.color, color: '#fff', marginLeft: 4, verticalAlign: 'middle' }}>{b.label}</span>;
}

/* ══════════════════════════════════════════════════════════
   MODES CONFIG
   ══════════════════════════════════════════════════════════ */
const MODES = [
  { key: 'print',    icon: '🖨️', label: 'Print',    color: '#2563eb' },
  { key: 'whatsapp', icon: '📲', label: 'WhatsApp', color: '#25D366' },
  { key: 'sms',      icon: '📱', label: 'SMS',      color: '#f59e0b' },
  { key: 'share',    icon: '🔗', label: 'Share',    color: '#7c3aed' },
];

// ═══════════════════════════════════
// Part 1 END — Part 2 continues with Main Component
// ═══════════════════════════════════// ═══════════════════════════════════
// Part 2 — Main Component
// (continues from Part 1 — paste below Part 1 code)
// ═══════════════════════════════════

/* ══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════ */
export default function InvoiceOutputManager({ invoice, onClose, initialMode = 'print' }) {
  const { user } = useUserAuth();

  const [settings,         setSettings]         = useState(null);
  const [customer,         setCustomer]         = useState(null);
  const [activeTab,        setActiveTab]        = useState('preview');
  const [outputMode,       setOutputMode]       = useState(initialMode);
  const [loading,          setLoading]          = useState(true);
  const [printing,         setPrinting]         = useState(false);
  const [toastMsg,         setToastMsg]         = useState('');
  const [settingsExpanded, setSettingsExpanded] = useState({});
  const [modeSettings,     setModeSettings]     = useState(buildDefaultModeSettings);
  const [settingsMode,     setSettingsMode]     = useState('print');

  const isReturn = isReturnDoc(invoice);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  }, []);

  const getModeSettings = useCallback((mode) => {
    const def = buildDefaultModeSettings();
    const ms = modeSettings[mode];
    if (!ms) return def[mode] || def.print;
    return {
      lang: ms.lang || 'en',
      visibility: { ...DEFAULT_VISIBILITY, ...(ms.visibility || {}) },
    };
  }, [modeSettings]);

  const currentLang       = getModeSettings(outputMode).lang;
  const currentVisibility = getModeSettings(outputMode).visibility;
  const editingLang       = getModeSettings(settingsMode).lang;
  const editingVisibility = getModeSettings(settingsMode).visibility;

  /* ── Load settings + customer ── */
  useEffect(() => {
    if (!user?.uid || !invoice) return;
    let active = true;

    (async () => {
      setLoading(true);
      try {
        const [ssSnap, prefSnap] = await Promise.all([
          getDocs(query(collection(db, 'invoice_settings'), where('uid', '==', user.uid))),
          getDoc(doc(db, `users/${user.uid}/settings`, 'invoiceOutputModes')),
        ]);
        const cid = invoice.customerId;
        const cSnap = cid && cid !== 'CASH_CUSTOMER'
          ? await getDoc(doc(db, 'customers', cid))
          : null;
        if (!active) return;
        if (!ssSnap.empty) setSettings(ssSnap.docs[0].data());
        if (cSnap?.exists()) setCustomer({ id: cSnap.id, ...cSnap.data() });
        if (prefSnap.exists()) {
          const saved = prefSnap.data();
          setModeSettings(prev => {
            const merged = { ...prev };
            const defaults = buildDefaultModeSettings();
            MODES.forEach(({ key: m }) => {
              const s = saved[m];
              const d = defaults[m] || defaults.print;
              merged[m] = {
                lang: s?.lang || d.lang,
                visibility: { ...d.visibility, ...(s?.visibility || {}) },
              };
            });
            return merged;
          });
        }
      } catch (e) {
        console.error('Load error:', e);
        if (active) showToast('❌ Load failed');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [user?.uid, invoice, showToast]);

  /* ── ESC key close ── */
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

  /* ── Memos ── */
  const receiptHTML = useMemo(() =>
    buildReceiptHTML(invoice, settings, currentVisibility, customer, currentLang),
    [invoice, settings, currentVisibility, customer, currentLang]
  );

  const waMessage = useMemo(() =>
    buildWAMessage(invoice, customer, settings, getModeSettings('whatsapp').visibility, getModeSettings('whatsapp').lang),
    [invoice, customer, settings, getModeSettings]
  );

  const smsMessage = useMemo(() =>
    buildSMSMessage(invoice, customer, settings, getModeSettings('sms').visibility, getModeSettings('sms').lang),
    [invoice, customer, settings, getModeSettings]
  );

  const shareMessage = useMemo(() =>
    buildWAMessage(invoice, customer, settings, getModeSettings('share').visibility, getModeSettings('share').lang),
    [invoice, customer, settings, getModeSettings]
  );

  const smsInfo = useMemo(() => getSMSCount(smsMessage), [smsMessage]);

  /* ── Settings actions ── */
  const saveAllModeSettings = useCallback(async () => {
    if (!user?.uid) return;
    try {
      await setDoc(
        doc(db, `users/${user.uid}/settings`, 'invoiceOutputModes'),
        { ...modeSettings, updatedAt: serverTimestamp() },
        { merge: true }
      );
      showToast('✅ සියලු mode සැකසුම් සුරැකුණි!');
    } catch (e) { showToast(`❌ ${e.message}`); }
  }, [user?.uid, modeSettings, showToast]);

  const setEditingLang = useCallback((lang) => {
    setModeSettings(prev => ({
      ...prev,
      [settingsMode]: { ...prev[settingsMode], lang },
    }));
  }, [settingsMode]);

  const toggleEditingField = useCallback((key) => {
    setModeSettings(prev => ({
      ...prev,
      [settingsMode]: {
        ...prev[settingsMode],
        visibility: {
          ...DEFAULT_VISIBILITY,
          ...(prev[settingsMode]?.visibility || {}),
          [key]: !(prev[settingsMode]?.visibility?.[key] ?? DEFAULT_VISIBILITY[key]),
        },
      },
    }));
  }, [settingsMode]);

  const applyPreset = useCallback((presetKey) => {
    const p = PRESETS[presetKey];
    if (!p) return;
    setModeSettings(prev => ({
      ...prev,
      [settingsMode]: {
        ...prev[settingsMode],
        visibility: { ...DEFAULT_VISIBILITY, ...p.config },
      },
    }));
    showToast(`✅ "${p.name}" applied`);
  }, [settingsMode, showToast]);

  const setAllFields = useCallback((val) => {
    setModeSettings(prev => ({
      ...prev,
      [settingsMode]: {
        ...prev[settingsMode],
        visibility: Object.fromEntries(Object.keys(DEFAULT_VISIBILITY).map(k => [k, val])),
      },
    }));
  }, [settingsMode]);

  const copySettingsFrom = useCallback((fromMode) => {
    setModeSettings(prev => ({
      ...prev,
      [settingsMode]: {
        lang: prev[fromMode]?.lang || 'en',
        visibility: { ...DEFAULT_VISIBILITY, ...(prev[fromMode]?.visibility || {}) },
      },
    }));
    showToast(`✅ ${fromMode} → ${settingsMode} copied!`);
  }, [settingsMode, showToast]);

  const copyToAllModes = useCallback(() => {
    const current = getModeSettings(settingsMode);
    setModeSettings(prev => {
      const updated = { ...prev };
      MODES.forEach(({ key: m }) => {
        updated[m] = { lang: current.lang, visibility: { ...current.visibility } };
      });
      return updated;
    });
    showToast('✅ සියලු modes වෙත copy විය!');
  }, [settingsMode, getModeSettings, showToast]);

  /* ── Output actions ── */
  const handlePrint = useCallback(async () => {
    if (printing) return;
    setPrinting(true);
    try { await printViaIframe(receiptHTML); showToast('🖨️ Print sent!'); }
    catch (e) { console.error(e); showToast('❌ Print failed'); }
    finally { setPrinting(false); }
  }, [receiptHTML, printing, showToast]);

  const handleWhatsApp = useCallback(() => {
    const phone = invoice?.customerPhone || '';
    if (!phone) { showToast('⚠️ දුරකථන අංකයක් නැත'); return; }
    window.open(`https://wa.me/${formatPhoneWA(phone)}?text=${encodeURIComponent(waMessage)}`, '_blank');
    showToast('📲 WhatsApp opened!');
  }, [invoice, waMessage, showToast]);

  const handleSMS = useCallback(() => {
    const phone = invoice?.customerPhone || '';
    if (!phone) { showToast('⚠️ දුරකථන අංකයක් නැත'); return; }
    window.open(`sms:${formatPhoneSMS(phone)}?body=${encodeURIComponent(smsMessage)}`, '_self');
  }, [invoice, smsMessage, showToast]);

  const handleShare = useCallback(async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${isReturn ? 'Return Note' : 'Invoice'} ${invoice?.invoiceNo || ''}`,
          text: shareMessage,
        });
      } else {
        await navigator.clipboard.writeText(shareMessage);
        showToast('📋 Copied!');
      }
    } catch {}
  }, [invoice, shareMessage, isReturn, showToast]);

  const handleCopy = useCallback(async () => {
    try {
      const text =
        outputMode === 'sms'   ? smsMessage   :
        outputMode === 'share' ? shareMessage :
        outputMode === 'print' ? receiptHTML.replace(/<[^>]*>/g, '') :
        waMessage;
      await navigator.clipboard.writeText(text);
      showToast('📋 Copied!');
    } catch { showToast('❌ Failed'); }
  }, [outputMode, smsMessage, waMessage, shareMessage, receiptHTML, showToast]);

  if (!invoice) return null;

  const headerBg = isReturn
    ? 'linear-gradient(135deg,#991b1b,#dc2626)'
    : 'linear-gradient(135deg,#1e293b,#334155)';

  /* ════════════════════════════════════════
     RENDER
  ════════════════════════════════════════ */
  return (
    <>
      {/* Toast */}
      {toastMsg && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: '#1e293b', color: '#fff', padding: '10px 20px', borderRadius: 10,
          zIndex: 10002, fontWeight: 700, fontSize: 14,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)', whiteSpace: 'nowrap',
        }}>
          {toastMsg}
        </div>
      )}

      {/* Overlay */}
      <div
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'stretch', justifyContent: 'center',
        }}
      >
        <div style={{
          background: '#fff', width: '100%', maxWidth: 900,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>

          {/* ── Header ── */}
          <div style={{
            background: headerBg, color: '#fff', padding: '12px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
          }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 16 }}>
                {isReturn ? '↩️ Return Output Manager' : '🧾 Output Manager'}
              </div>
              <div style={{ fontSize: 11, color: '#cbd5e1' }}>
                {invoice?.invoiceNo} — {invoice?.customerName || 'Cash'}
              </div>
            </div>
            <button onClick={onClose} style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 15,
            }}>✕</button>
          </div>

          {/* ── Return badge ── */}
          {isReturn && (
            <div style={{
              background: '#fef2f2', borderBottom: '1px solid #fecaca', padding: '8px 16px',
              display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
            }}>
              <span style={{ fontSize: 18 }}>↩️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: '#dc2626' }}>Sales Return Note</div>
                {invoice?.originalInvoiceNo && (
                  <div style={{ fontSize: 11, color: '#64748b' }}>Original: {invoice.originalInvoiceNo}</div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 900, fontSize: 16, color: '#dc2626' }}>Refund: Rs.{fmt(R2(invoice?.netAmount))}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{invoice?.refundMethodLabel || 'Cash Refund'}</div>
              </div>
            </div>
          )}

          {/* ── Mode tabs ── */}
          <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', flexShrink: 0, overflowX: 'auto' }}>
            {MODES.map((m) => {
              const active = outputMode === m.key;
              return (
                <button key={m.key} onClick={() => setOutputMode(m.key)} style={{
                  flex: 1, padding: '10px 4px', border: 'none', fontWeight: 800, fontSize: 12,
                  cursor: 'pointer', minWidth: 75,
                  background: active ? m.color : '#fff',
                  color: active ? '#fff' : '#64748b',
                  borderBottom: active ? `3px solid ${m.color}` : 'none',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  transition: 'all 0.15s',
                }}>
                  <span>{m.icon} {m.label}</span>
                  <LangBadge lang={getModeSettings(m.key).lang} />
                </button>
              );
            })}
          </div>

          {/* ── Preview / Settings tabs ── */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
            {[{ key: 'preview', label: '👁️ Preview' }, { key: 'settings', label: '⚙️ සැකසුම්' }].map(tb => (
              <button key={tb.key} onClick={() => setActiveTab(tb.key)} style={{
                flex: 1, padding: 10, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                background: activeTab === tb.key ? '#f1f5f9' : '#fff',
                color: activeTab === tb.key ? '#1e293b' : '#94a3b8',
                borderBottom: activeTab === tb.key ? '2px solid #3b82f6' : 'none',
              }}>
                {tb.label}
              </button>
            ))}
          </div>

          {/* ── Content area ── */}
          <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 60 }}>
                <div style={{ fontSize: 36 }}>⏳</div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>Loading…</div>
              </div>
            ) : activeTab === 'preview' ? (
              /* ═══ PREVIEW TAB ═══ */
              <div>
                <div style={{ textAlign: 'center', marginBottom: 10, fontSize: 11, color: '#64748b' }}>
                  🌐 {currentLang === 'si' ? 'සිංහල' : currentLang === 'mixed' ? 'Mixed' : 'English'}
                  {' · '}{MODES.find(m => m.key === outputMode)?.icon} {MODES.find(m => m.key === outputMode)?.label}
                </div>

                {outputMode === 'print' && (
                  <div style={{ maxWidth: 380, margin: '0 auto', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
                    <div
                      style={{ fontFamily: "'Courier New', monospace", fontSize: 14, padding: '8px 6px', lineHeight: 1.4, color: '#000', fontWeight: 900, background: '#fff' }}
                      dangerouslySetInnerHTML={{ __html: receiptHTML }}
                    />
                  </div>
                )}

                {outputMode === 'whatsapp' && (
                  <div style={{ maxWidth: 420, margin: '0 auto', background: '#e5ddd5', borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 12, color: '#555', marginBottom: 8, textAlign: 'center' }}>📲 WhatsApp Preview</div>
                    <div style={{ background: isReturn ? '#fde8e8' : '#dcf8c6', borderRadius: 10, padding: 12, fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.6, wordBreak: 'break-word' }}>
                      {waMessage}
                    </div>
                  </div>
                )}

                {outputMode === 'sms' && (
                  <div style={{ maxWidth: 360, margin: '0 auto', background: '#f8fafc', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8, textAlign: 'center' }}>
                      📱 SMS Preview
                      <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: smsInfo.chars > smsInfo.perSMS ? '#fef3c7' : '#dcfce7', color: smsInfo.chars > smsInfo.perSMS ? '#b45309' : '#16a34a' }}>
                        {smsInfo.chars} chars{smsInfo.chars > smsInfo.perSMS && ` (${smsInfo.parts} SMS)`}{smsInfo.perSMS === 70 && ' 🇱🇰'}
                      </span>
                    </div>
                    <div style={{ background: '#fff', borderRadius: 8, padding: 12, fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.6, border: '1px solid #e2e8f0', wordBreak: 'break-word', fontFamily: 'monospace' }}>
                      {smsMessage}
                    </div>
                  </div>
                )}

                {outputMode === 'share' && (
                  <div style={{ maxWidth: 420, margin: '0 auto', background: isReturn ? '#fef5f5' : '#f5f3ff', borderRadius: 12, padding: 16, border: `1px solid ${isReturn ? '#fecaca' : '#e9e5ff'}` }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8, textAlign: 'center' }}>
                      🔗 Share {isReturn ? 'Return Note' : 'Invoice'}
                    </div>
                    <div style={{ background: '#fff', borderRadius: 8, padding: 12, fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.6, border: '1px solid #e2e8f0', wordBreak: 'break-word' }}>
                      {shareMessage}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ═══ SETTINGS TAB ═══ */
              <div>
                {/* Mode selector */}
                <div style={{ background: '#f0f9ff', borderRadius: 12, padding: 12, marginBottom: 16, border: '1px solid #bae6fd' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0369a1', marginBottom: 8 }}>🎯 සැකසීමට mode</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {MODES.map((m) => {
                      const isActive = settingsMode === m.key;
                      return (
                        <button key={m.key} onClick={() => setSettingsMode(m.key)} style={{
                          flex: 1, minWidth: 70, padding: '9px 4px', borderRadius: 8,
                          border: isActive ? `2px solid ${m.color}` : '1px solid #e2e8f0',
                          background: isActive ? m.color : '#fff',
                          color: isActive ? '#fff' : '#64748b',
                          fontWeight: 800, fontSize: 12, cursor: 'pointer',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                        }}>
                          <span>{m.icon} {m.label}</span>
                          {!isActive && <LangBadge lang={getModeSettings(m.key).lang} />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Active mode header */}
                <div style={{
                  background: MODES.find(m => m.key === settingsMode)?.color || '#2563eb',
                  color: '#fff', borderRadius: 10, padding: '10px 14px', marginBottom: 14,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 14 }}>
                      {MODES.find(m => m.key === settingsMode)?.icon} {MODES.find(m => m.key === settingsMode)?.label} සැකසුම්
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.85 }}>මෙම mode එකට පමණක්</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700 }}>
                    🌐 {editingLang === 'si' ? 'සිංහල' : editingLang === 'mixed' ? 'Mixed' : 'English'}
                  </div>
                </div>

                {/* Language selector */}
                <LanguageSelector
                  lang={editingLang}
                  onChange={setEditingLang}
                  modeLabel={MODES.find(m => m.key === settingsMode)?.label || ''}
                />

                {/* Copy from */}
                <div style={{ background: '#fffbeb', borderRadius: 10, padding: 10, marginBottom: 14, border: '1px solid #fde68a' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#b45309', marginBottom: 6 }}>📋 Copy from:</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {MODES.filter(m => m.key !== settingsMode).map(m => (
                      <button key={m.key} onClick={() => copySettingsFrom(m.key)} style={{
                        padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0',
                        background: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer', color: '#374151',
                      }}>
                        {m.icon} {m.label}
                      </button>
                    ))}
                    <button onClick={copyToAllModes} style={{
                      padding: '5px 10px', borderRadius: 6, border: '1px solid #bbf7d0',
                      background: '#f0fdf4', fontWeight: 700, fontSize: 11, cursor: 'pointer', color: '#16a34a',
                    }}>
                      🔄 → සියලු
                    </button>
                  </div>
                </div>

                {/* Presets */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>⚡ Presets</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {Object.entries(PRESETS).map(([k, p]) => (
                      <button key={k} onClick={() => applyPreset(k)} style={{
                        padding: '7px 14px', borderRadius: 8, border: '1px solid #e2e8f0',
                        background: '#f8fafc', fontWeight: 700, fontSize: 12, cursor: 'pointer', color: '#374151',
                      }}>
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* All ON/OFF */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <button onClick={() => setAllFields(true)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#16a34a', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>✅ All ON</button>
                  <button onClick={() => setAllFields(false)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>❌ All OFF</button>
                </div>

                {/* Visibility sections */}
                {VISIBILITY_SECTIONS.map((sec) => {
                  const expandKey = `${settingsMode}_${sec.title}`;
                  const isOpen = settingsExpanded[expandKey] !== false;
                  const on = sec.fields.filter(f => editingVisibility[f.key]).length;
                  return (
                    <div key={expandKey} style={{ marginBottom: 10, borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                      <button
                        onClick={() => setSettingsExpanded(p => ({ ...p, [expandKey]: !isOpen }))}
                        style={{ width: '100%', padding: '10px 14px', border: 'none', background: '#f8fafc', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 800, fontSize: 14, color: '#1e293b' }}
                      >
                        <span>{sec.icon} {sec.title}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 700, background: on === sec.fields.length ? '#dcfce7' : '#fef3c7', color: on === sec.fields.length ? '#16a34a' : '#b45309' }}>
                            {on}/{sec.fields.length}
                          </span>
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>{isOpen ? '▲' : '▼'}</span>
                        </span>
                      </button>
                      {isOpen && (
                        <div style={{ padding: '4px 0' }}>
                          {sec.fields.map(f => (
                            <div key={f.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderBottom: '1px solid #f8fafc' }}>
                              <div>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{f.label}</div>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>{f.labelEn}</div>
                              </div>
                              <ToggleSwitch
                                checked={!!editingVisibility[f.key]}
                                onChange={() => toggleEditingField(f.key)}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Save button */}
                <div style={{ marginTop: 20, textAlign: 'center' }}>
                  <button onClick={saveAllModeSettings} style={{
                    padding: '14px 40px', background: '#16a34a', color: '#fff', border: 'none',
                    borderRadius: 10, fontWeight: 800, fontSize: 15, cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(22,163,74,0.3)',
                  }}>
                    💾 සියලු Mode සැකසුම් සුරකින්න
                  </button>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6 }}>
                    Print / WhatsApp / SMS / Share — සියලු modes save වේ
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Footer action buttons ── */}
          <div style={{
            padding: '12px 16px', borderTop: '2px solid #e2e8f0', background: '#f8fafc',
            flexShrink: 0, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
          }}>
            {outputMode === 'print' && (
              <button onClick={handlePrint} disabled={printing} style={{
                padding: '12px 28px',
                background: printing ? '#94a3b8' : (isReturn ? '#dc2626' : '#2563eb'),
                color: '#fff', border: 'none', borderRadius: 10,
                fontWeight: 800, fontSize: 15, cursor: printing ? 'wait' : 'pointer',
              }}>
                {printing ? '⏳ Printing…' : '🖨️ Print'}
              </button>
            )}
            {outputMode === 'whatsapp' && (
              <button onClick={handleWhatsApp} style={{
                padding: '12px 28px',
                background: 'linear-gradient(135deg,#25D366,#128C7E)',
                color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 15, cursor: 'pointer',
              }}>
                📲 WhatsApp
              </button>
            )}
            {outputMode === 'sms' && (
              <button onClick={handleSMS} style={{
                padding: '12px 28px', background: '#f59e0b',
                color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 15, cursor: 'pointer',
              }}>
                📱 SMS
              </button>
            )}
            {outputMode === 'share' && (
              <button onClick={handleShare} style={{
                padding: '12px 28px',
                background: isReturn ? 'linear-gradient(135deg,#dc2626,#b91c1c)' : '#7c3aed',
                color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 15, cursor: 'pointer',
              }}>
                🔗 Share
              </button>
            )}
            <button onClick={handleCopy} style={{
              padding: '12px 20px', background: '#f1f5f9', color: '#374151',
              border: '1px solid #e2e8f0', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}>
              📋 Copy
            </button>
            <button onClick={onClose} style={{
              padding: '12px 20px', background: '#fef2f2', color: '#dc2626',
              border: '1px solid #fecaca', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}>
              ✕ Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}