'use client';

// src/components/InvoiceList.jsx
// ✅ Language-aware version
// ✅ Quota-safe: getDocs + sessionStorage cache
// ✅ compressImage included
// ✅ Next.js client component

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { db } from '@/shared/firebase-config';
import { useUserAuth } from '@/context/UserContext';
import {
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  doc,
  addDoc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import InvoiceOutputManager from './InvoiceOutputManager';

const CATALOG_BASE = 'https://pos-catalog-gold.vercel.app';
const INVOICE_COLLECTIONS = ['invoices', 'drafts', 'invoiceDrafts'];
const USER_FIELDS = ['uid', 'userId', 'ownerId', 'createdBy'];

/* ══════════════════════════════════════════════════════════════
   TRANSLATIONS
   ══════════════════════════════════════════════════════════════ */
const TRANSLATIONS = {
  si: {
    title:              'ඉන්වොයිස් ලැයිස්තුව',
    search:             'පාරිභෝගිකයා / Invoice ID සොයන්න...',
    invoiceCode:        'Invoice Code',
    balance:            'ශේෂය',
    netAmount:          'ශුද්ධ මුදල',
    invoiceValue:       'ඉන්වොයිස් වටිනාකම',
    returnAmount:       'ආපසු',
    totalDiscount:      'මුළු වට්ටම',
    billDiscount:       'බිල්පත් වට්ටම',
    exchange:           'හුවමාරු',
    noData:             'ඉන්වොයිස් නොමැත',
    loading:            'පූරණය වෙමින්...',
    loadingAll:         'ඉන්වොයිස් load වෙමින්...',
    all:                'සියල්ල',
    drafts:             'කෙටුම්පත්',
    completed:          'සම්පූර්ණයි',
    paid:               'ගෙවා ඇත',
    unpaid:             'නොගෙවූ',
    partial:            'අර්ධ',
    deleteConfirm:      'මෙම ඉන්වොයිසය මකා දැමීමට අවශ්‍යද?',
    deleted:            '✅ මකා දමන ලදී!',
    cashCustomer:       'Cash Customer',
    newSale:            '➕ නව විකුණුම',
    today:              'අද',
    thisWeek:           'සතිය',
    thisMonth:          'මාසය',
    allTime:            'සමස්ත',
    days:               'දින',
    delete:             'මකන්න',
    viewDetails:        'විස්තර',
    back:               '← ආපසු',
    paymentMethod:      'ගෙවීම් ක්‍රමය',
    paidAmount:         'ගෙවූ මුදල',
    items:              'භාණ්ඩ',
    totalSales:         'මුළු විකිණීම්',
    totalPaid:          'මුළු ගෙවීම්',
    totalBalance:       'මුළු හිඟ',
    invoiceCount:       'ඉන්වොයිස්',
    linkCopied:         'Link copied!',
    noPortalKey:        'Portal Key නැත',
    youSaved:           'ඔබ ඉතිරි කළේ',
    totalDebt:          'මුළු ණය',
    previousBalance:    'පෙර ශේෂය',
    thisBill:           'මෙම බිල්පත',
    noDebt:             'ණය නැත',
    deposit:            'තැන්පතුව',
    collectPayment:     '💰 ගෙවීම',
    paymentCollection:  '💰 ගෙවීම් එකතු',
    paymentAmount:      'ගෙවන මුදල (Rs.)',
    paymentNote:        'සටහන',
    paymentMethodLabel: 'ගෙවීම් ක්‍රමය',
    paymentSuccess:     '✅ ගෙවීම සාර්ථකයි!',
    paymentError:       '❌ දෝෂයකි',
    paymentRequired:    '⚠️ මුදල ඇතුළත් කරන්න',
    savePayment:        '✅ සුරකින්න',
    saving:             'සුරකිමින්...',
    cancel:             'අවලංගු',
    invoiceDue:         'හිඟ මුදල',
    currentBalance:     'වත්මන් ශේෂය',
    newBalance:         'නව ශේෂය',
    paymentReceipt:     '🧾 රිසිට්',
    receiptUploaded:    '✅ Upload විය',
    cash:               'මුදල්',
    card:               'කාඩ්',
    bank:               'බැංකු',
    cheque:             'චෙක්',
    other:              'වෙනත්',
    sendBill:           '📤 යවන්න',
    profitBreakdown:    '📊 ලාභ',
    totalProfit:        'මුළු ලාභය',
    quotaError:         'Firebase Error',
    quotaDesc:          'Data load කිරීමේ දෝෂයකි. නැවත උත්සාහ කරන්න.',
    retry:              '🔄 Retry',
    openInvoiceList:    '🌐 Invoice Portal',
    portalLink:         'Portal',
    remark:             'සටහන',
    revenue:            'ආදායම',
    cost:               'පිරිවැය',
    qty:                'ප්‍රමාණය',
    noCostData:         'Cost data නොමැත',
    debugTitle:         '🔍 Debug',
    lastUpdated:        'අවසන් update',
    cachedData:         '⚠️ Cache data',
  },
  en: {
    title:              'Invoice List',
    search:             'Search customer / Invoice ID...',
    invoiceCode:        'Invoice Code',
    balance:            'Balance',
    netAmount:          'Net Amount',
    invoiceValue:       'Invoice Value',
    returnAmount:       'Return',
    totalDiscount:      'Total Discount',
    billDiscount:       'Bill Discount',
    exchange:           'Exchange',
    noData:             'No invoices found',
    loading:            'Loading...',
    loadingAll:         'Loading invoices...',
    all:                'All',
    drafts:             'Drafts',
    completed:          'Completed',
    paid:               'Paid',
    unpaid:             'Unpaid',
    partial:            'Partial',
    deleteConfirm:      'Do you want to delete this invoice?',
    deleted:            '✅ Deleted!',
    cashCustomer:       'Cash Customer',
    newSale:            '➕ New Sale',
    today:              'Today',
    thisWeek:           'Week',
    thisMonth:          'Month',
    allTime:            'All Time',
    days:               'days',
    delete:             'Delete',
    viewDetails:        'Details',
    back:               '← Back',
    paymentMethod:      'Payment Method',
    paidAmount:         'Paid Amount',
    items:              'Items',
    totalSales:         'Total Sales',
    totalPaid:          'Total Paid',
    totalBalance:       'Total Balance',
    invoiceCount:       'Invoices',
    linkCopied:         'Link copied!',
    noPortalKey:        'No portal key',
    youSaved:           'You Saved',
    totalDebt:          'Total Debt',
    previousBalance:    'Previous Balance',
    thisBill:           'This Bill',
    noDebt:             'No Debt',
    deposit:            'Deposit',
    collectPayment:     '💰 Collect Payment',
    paymentCollection:  '💰 Payment Collection',
    paymentAmount:      'Payment Amount (Rs.)',
    paymentNote:        'Payment Note',
    paymentMethodLabel: 'Payment Method',
    paymentSuccess:     '✅ Payment success!',
    paymentError:       '❌ Error',
    paymentRequired:    '⚠️ Enter amount',
    savePayment:        '✅ Save',
    saving:             'Saving...',
    cancel:             'Cancel',
    invoiceDue:         'Invoice Due',
    currentBalance:     'Current Balance',
    newBalance:         'New Balance',
    paymentReceipt:     '🧾 Receipt',
    receiptUploaded:    '✅ Uploaded',
    cash:               'Cash',
    card:               'Card',
    bank:               'Bank',
    cheque:             'Cheque',
    other:              'Other',
    sendBill:           '📤 Send',
    profitBreakdown:    '📊 Profit',
    totalProfit:        'Total Profit',
    quotaError:         'Firebase Error',
    quotaDesc:          'Data load error. Please try again.',
    retry:              '🔄 Retry',
    openInvoiceList:    '🌐 Invoice Portal',
    portalLink:         'Portal',
    remark:             'Remark',
    revenue:            'Revenue',
    cost:               'Cost',
    qty:                'Qty',
    noCostData:         'No cost data',
    debugTitle:         '🔍 Debug',
    lastUpdated:        'Last updated',
    cachedData:         '⚠️ Cache data',
  },
};

/* ══════════════════════════════════════════════════════════════
   CACHE HELPERS
   ══════════════════════════════════════════════════════════════ */
const INV_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const saveInvoiceCache = (uid, list) => {
  try {
    const slim = list.map((inv) => ({
      ...inv,
      _raw: undefined,
      items: (inv.items || []).map((it) => ({
        name:         it.name         || '',
        nameSi:       it.nameSi       || '',
        sinhalaName:  it.sinhalaName  || '',
        qty:          it.qty          || 0,
        lineTotal:    it.lineTotal    || 0,
        yourPrice:    it.yourPrice    || 0,
        sellingPrice: it.sellingPrice || 0,
        discAmount:   it.discAmount   || 0,
        costPrice:    it.costPrice    || 0,
        avgBatchCost: it.avgBatchCost || 0,
        photoURL:     it.photoURL     || '',
        uom:          it.uom          || '',
        warrantyCode:   it.warrantyCode   || '',
        warrantyPeriod: it.warrantyPeriod || '',
      })),
    }));
    sessionStorage.setItem(
      `invoices_${uid}`,
      JSON.stringify({ data: slim, ts: Date.now() })
    );
  } catch {}
};

const loadInvoiceCache = (uid) => {
  try {
    const raw = sessionStorage.getItem(`invoices_${uid}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > INV_CACHE_TTL) return null;
    return data;
  } catch { return null; }
};

const clearInvoiceCache = (uid) => {
  try { sessionStorage.removeItem(`invoices_${uid}`); } catch {}
};

/* ══════════════════════════════════════════════════════════════
   IMAGE COMPRESS
   ══════════════════════════════════════════════════════════════ */
const compressImage = (file) =>
  new Promise((resolve, reject) => {
    if (!file) { resolve(''); return; }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW   = 800;
        const scale  = Math.min(maxW / img.width, 1);
        canvas.width  = img.width  * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });

/* ══════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════ */
const toNum = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

const fmtDate = (ts) => {
  if (!ts) return '-';
  try {
    const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('si-LK', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return '-'; }
};

const fmtTime = (ts) => {
  if (!ts) return '';
  try {
    const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('si-LK', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};

const getTsMs = (ts) => {
  if (!ts) return 0;
  try {
    if (ts.seconds) return ts.seconds * 1000;
    if (ts.toDate)  return ts.toDate().getTime();
    const d = new Date(ts); return isNaN(d.getTime()) ? 0 : d.getTime();
  } catch { return 0; }
};

const getAgeDays  = (ts) => { const ms = getTsMs(ts); return ms ? Math.floor((Date.now() - ms) / 86400000) : 0; };
const getAgeColor = (d)  => d <= 7 ? '#16a34a' : d <= 30 ? '#d97706' : d <= 60 ? '#ea580c' : '#dc2626';

const getDateStart = (f) => {
  const now = new Date();
  if (f === 'today')     return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (f === 'thisWeek')  { const d = now.getDay(); return new Date(now.getFullYear(), now.getMonth(), now.getDate() - d + (d === 0 ? -6 : 1)).getTime(); }
  if (f === 'thisMonth') return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return 0;
};

const payIcon = (m) =>
  ({ cash:'💵', card:'💳', etransfer:'📱', bank_transfer:'🏦', cheque:'📄', credit:'🏦', bank:'🏦' })[m?.toLowerCase()] || '💰';

const DEFAULT_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#f1f5f9" rx="8"/><path d="M30 65 L45 45 L55 55 L70 35 L80 65 H30 Z" fill="#cbd5e1"/><circle cx="70" cy="30" r="5" fill="#fcd34d"/></svg>'
)}`;

/* ══════════════════════════════════════════════════════════════
   NORMALIZE
   ══════════════════════════════════════════════════════════════ */
const normalizeInvoice = (raw, id, col, path) => {
  const net     = toNum(raw.netAmount  || raw.grandTotal || raw.total    || 0);
  const pay     = toNum(raw.payAmount  || raw.paidAmount || raw.paid     || 0);
  const gross   = toNum(raw.grossTotal || raw.subTotal   || raw.invoiceValue || 0);
  const isDraft = ['drafts', 'invoiceDrafts'].includes(col);
  return {
    id, _col: col, _path: path, _raw: raw,
    customerName:    raw.customerName    || raw.customer || '',
    customerPhone:   raw.customerPhone   || raw.phone    || '',
    customerId:      raw.customerId      || '',
    customerAddress: raw.customerAddress || '',
    netAmount: net, grossTotal: gross, invoiceValue: gross, payAmount: pay,
    balance: raw.balance !== undefined ? toNum(raw.balance) : net - pay,
    totalDiscount:       toNum(raw.totalDiscount       || raw.discount || 0),
    billDiscount:        toNum(raw.billDiscount        || 0),
    billDiscountPercent: toNum(raw.billDiscountPercent || 0),
    exchangeAmount:      toNum(raw.exchangeAmount      || 0),
    returnAmount:        toNum(raw.returnAmount        || 0),
    items:     raw.items     || [],
    itemCount: raw.itemCount || raw.items?.length || 0,
    status: raw.status || (isDraft ? 'draft' : 'completed'),
    type:   isDraft ? 'draft' : 'invoice',
    paymentMethod: raw.paymentMethod || 'cash',
    mode:          raw.mode          || 'invoice',
    createdAt: raw.createdAt || null,
    date: raw.date || fmtDate(raw.createdAt),
    time: raw.time || fmtTime(raw.createdAt),
    age:  getAgeDays(raw.createdAt),
    invoiceNo:   raw.invoiceNo   || raw.invoiceNumber || `#${id.slice(-6).toUpperCase()}`,
    invoiceCode: raw.invoiceCode || raw.invoiceNo     || `INV-${id.slice(-6).toUpperCase()}`,
    draftCode:   isDraft ? `DRF-${id.slice(-6).toUpperCase()}` : '-',
    rep:    raw.rep    || raw.salesRep   || '-',
    branch: raw.branch || raw.branchName || '-',
    remarks:       raw.remarks       || raw.invoiceRemark || '',
    uid: raw.uid || raw.userId || raw.ownerId || raw.createdBy || '',
  };
};

/* ══════════════════════════════════════════════════════════════
   CUSTOMER BALANCE BREAKDOWN
   ══════════════════════════════════════════════════════════════ */
const getCustomerBalanceBreakdown = (customer, invoice) => {
  if (!customer || !invoice) return null;
  if (!invoice.customerId || invoice.customerId === 'CASH_CUSTOMER') return null;
  const totalDebt      = toNum(customer.currentBalance || 0);
  const thisInvoiceDue = invoice.balance > 0.01 ? invoice.balance : 0;
  const previousBalance = totalDebt - thisInvoiceDue;
  return { previousBalance, thisInvoiceDue, totalDebt, hasDebt: totalDebt > 0.01, hasDeposit: totalDebt < -0.01, isZero: Math.abs(totalDebt) <= 0.01 };
};

/* ══════════════════════════════════════════════════════════════
   PROFIT HELPERS
   ══════════════════════════════════════════════════════════════ */
const costOf = (i) => toNum(i.costPrice || i.buyingPrice || i.unitCost || i.cost || i.avgBatchCost || i.purchasePrice || 0);
const sellOf = (i) => toNum(i.yourPrice || i.sellingPrice || i.unitPrice || i.price || i.salePrice || 0);

const itemProfit = (item) => {
  const qty = toNum(item.qty || item.quantity || 1);
  const sell = sellOf(item), cost = costOf(item);
  const disc = toNum(item.discAmount || item.discount || 0);
  const rev  = toNum(item.lineTotal) || (sell * qty - disc * qty);
  const lc   = cost * qty, lp = cost > 0 ? rev - lc : null;
  const mg   = rev > 0 && cost > 0 ? (lp / rev) * 100 : null;
  return { qty, sell, cost, disc, rev, lc, lp, mg, hasCost: cost > 0 };
};

const invoiceProfit = (items) => {
  if (!Array.isArray(items) || !items.length) return { tp:0, tr:0, tc:0, mg:0, ok:false };
  let tp=0, tr=0, tc=0, ok=false;
  items.forEach((i) => { const p=itemProfit(i); tr+=p.rev; if(p.hasCost){tp+=p.lp;tc+=p.lc;ok=true;} });
  return { tp, tr, tc, mg: tr>0&&ok?(tp/tr)*100:0, ok };
};

/* ══════════════════════════════════════════════════════════════
   PROFIT TABLE
   ══════════════════════════════════════════════════════════════ */
function ProfitTable({ items, t }) {
  const [show, setShow] = useState(false);
  if (!Array.isArray(items) || !items.length) return null;
  const s = invoiceProfit(items);
  if (!s.ok) return (
    <div style={{ padding:'8px 12px', background:'#fef3c7', borderRadius:8, fontSize:12, color:'#92400e', marginTop:8 }}>
      ⚠️ {t.noCostData}
    </div>
  );
  return (
    <div style={{ marginTop:10 }}>
      <button onClick={() => setShow(!show)} style={{ width:'100%', padding:'8px 12px', borderRadius:8, border:'1px solid #e2e8f0', background:show?'#f0fdf4':'#f8fafc', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', fontWeight:700, fontSize:12 }}>
        <span>📊 {t.profitBreakdown}</span>
        <span style={{ color:s.tp>=0?'#059669':'#dc2626', fontWeight:900 }}>Rs.{s.tp.toFixed(2)} ({s.mg.toFixed(1)}%)</span>
      </button>
      {show && (
        <div style={{ marginTop:6, background:'white', borderRadius:8, border:'1px solid #e2e8f0', overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr', background:'#f1f5f9', padding:'6px 10px', fontSize:10, fontWeight:800, color:'#475569' }}>
            <span>{t.items}</span>
            <span style={{textAlign:'right'}}>{t.qty}</span>
            <span style={{textAlign:'right'}}>{t.cost}</span>
            <span style={{textAlign:'right'}}>{t.revenue}</span>
            <span style={{textAlign:'right'}}>{t.totalProfit}</span>
          </div>
          {items.map((item, i) => {
            const p = itemProfit(item);
            const c = p.lp===null?'#94a3b8':p.lp>=0?'#059669':'#dc2626';
            return (
              <div key={i} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr', padding:'8px 10px', borderBottom:'1px solid #f1f5f9', alignItems:'center', background:p.lp!==null&&p.lp<0?'#fef2f2':i%2===0?'white':'#fafafa' }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name||`Item ${i+1}`}</div>
                  {(item.nameSi||item.sinhalaName)&&<div style={{ fontSize:10, color:'#6366f1' }}>{item.nameSi||item.sinhalaName}</div>}
                </div>
                <div style={{ textAlign:'right', fontSize:11 }}>{p.qty}</div>
                <div style={{ textAlign:'right', fontSize:11, color:p.hasCost?'#475569':'#94a3b8' }}>{p.hasCost?p.cost.toFixed(0):'—'}</div>
                <div style={{ textAlign:'right', fontSize:11, color:'#2563eb', fontWeight:700 }}>{p.rev.toFixed(0)}</div>
                <div style={{ textAlign:'right', fontSize:12, fontWeight:900, color:c }}>{p.lp===null?'—':`${p.lp>=0?'':'-'}${Math.abs(p.lp).toFixed(0)}`}</div>
              </div>
            );
          })}
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr', padding:'10px', borderTop:'2px solid #e2e8f0', background:s.tp>=0?'#f0fdf4':'#fef2f2' }}>
            <div style={{ fontWeight:800, fontSize:12, gridColumn:'1/4' }}>{t.totalProfit}</div>
            <div style={{ textAlign:'right', fontSize:12, color:'#dc2626', fontWeight:700 }}>{s.tc.toFixed(0)}</div>
            <div style={{ textAlign:'right', fontSize:14, fontWeight:900, color:s.tp>=0?'#059669':'#dc2626' }}>Rs.{s.tp.toFixed(0)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   PAYMENT MODAL
   ══════════════════════════════════════════════════════════════ */
function PaymentModal({ invoice, customer, onClose, onSuccess, user, t }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [note,   setNote  ] = useState('');
  const [img,    setImg   ] = useState('');
  const [preview,setPreview] = useState('');
  const [saving, setSaving ] = useState(false);
  const [done,   setDone  ] = useState(false);
  const fileRef = useRef(null);

  const due  = invoice.balance > 0.01 ? invoice.balance : 0;
  const cbal = toNum(customer?.currentBalance || 0);

  useEffect(() => { if (due > 0) setAmount(due.toFixed(2)); }, [due]);

  const handleImg = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { const b = await compressImage(f); setImg(b); setPreview(b); }
    catch { alert('Image error'); }
    e.target.value = '';
  };

  const save = async () => {
    const amt = toNum(amount);
    if (amt <= 0) { alert(t.paymentRequired); return; }
    setSaving(true);
    try {
      await addDoc(collection(db, 'customerTransactions'), {
        customerId: invoice.customerId || '', customerName: invoice.customerName || '',
        invoiceId: invoice.id, invoiceCode: invoice.invoiceCode || '',
        invoiceCollection: invoice._col || 'invoices',
        amount: amt, method, note: note.trim() || `Payment ${invoice.invoiceCode}`,
        receiptImage: img || '', type: 'payment', status: 'confirmed',
        uid: user.uid, createdAt: serverTimestamp(), date: new Date().toISOString(),
      });
      const newPay = invoice.payAmount + amt, newBal = invoice.netAmount - newPay;
      await updateDoc(doc(db, invoice._path), {
        payAmount: newPay, paidAmount: newPay, balance: newBal,
        status: newBal <= 0.01 ? 'paid' : 'partial', updatedAt: serverTimestamp(),
      });
      if (invoice.customerId && customer) {
        await updateDoc(doc(db, 'customers', invoice.customerId), {
          currentBalance: cbal - amt, updatedAt: serverTimestamp(),
        });
      }
      setDone(true); if (onSuccess) onSuccess(amt);
    } catch (e) { alert(`${t.paymentError}: ${e.message}`); }
    finally { setSaving(false); }
  };

  const methods = [
    { k:'cash',   l:t.cash,   i:'💵' },
    { k:'card',   l:t.card,   i:'💳' },
    { k:'bank',   l:t.bank,   i:'🏦' },
    { k:'cheque', l:t.cheque, i:'📄' },
    { k:'other',  l:t.other,  i:'💰' },
  ];

  if (done) return (
    <div style={S.ov} onClick={onClose}>
      <div style={{ ...S.mb, textAlign:'center', padding:'40px 24px' }} onClick={e=>e.stopPropagation()}>
        <div style={{ fontSize:60 }}>✅</div>
        <h3 style={{ color:'#16a34a', margin:'12px 0 8px' }}>{t.paymentSuccess}</h3>
        <div style={{ fontSize:28, fontWeight:900, color:'#16a34a', margin:'10px 0 20px' }}>Rs. {toNum(amount).toFixed(2)}</div>
        <button onClick={onClose} style={S.greenBtn}>OK ✓</button>
      </div>
    </div>
  );

  return (
    <div style={S.ov} onClick={onClose}>
      <div style={{ ...S.mb, maxHeight:'92vh', overflowY:'auto' }} onClick={e=>e.stopPropagation()}>
        <div style={{ background:'linear-gradient(135deg,#1e40af,#3b82f6)', padding:'18px', borderTopLeftRadius:20, borderTopRightRadius:20, color:'white', position:'relative' }}>
          <button onClick={onClose} style={{ position:'absolute', top:10, right:10, background:'rgba(255,255,255,0.2)', color:'white', width:28, height:28, borderRadius:'50%', border:'none', cursor:'pointer', fontWeight:700 }}>✕</button>
          <div style={{ fontSize:24 }}>💰</div>
          <h3 style={{ margin:'4px 0 2px', fontSize:17, fontWeight:800 }}>{t.paymentCollection}</h3>
          <div style={{ fontSize:12, opacity:0.85 }}>{invoice.invoiceCode} • {invoice.customerName || t.cashCustomer}</div>
        </div>
        <div style={{ padding:'14px 16px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
            <div style={{ background:due>0?'#fef2f2':'#f0fdf4', border:`1.5px solid ${due>0?'#fecaca':'#bbf7d0'}`, borderRadius:8, padding:10, textAlign:'center' }}>
              <div style={{ fontSize:11, color:'#64748b' }}>{t.invoiceDue}</div>
              <div style={{ fontSize:18, fontWeight:900, color:due>0?'#dc2626':'#16a34a' }}>Rs.{due.toFixed(2)}</div>
            </div>
            <div style={{ background:cbal>0?'#fef2f2':'#f0fdf4', border:`1.5px solid ${cbal>0?'#fecaca':'#bbf7d0'}`, borderRadius:8, padding:10, textAlign:'center' }}>
              <div style={{ fontSize:11, color:'#64748b' }}>{t.currentBalance}</div>
              <div style={{ fontSize:18, fontWeight:900, color:cbal>0?'#dc2626':'#16a34a' }}>Rs.{cbal.toFixed(2)}</div>
            </div>
          </div>

          <label style={S.ls}>{t.paymentAmount} *</label>
          <div style={{ position:'relative', marginBottom:6 }}>
            <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontWeight:800, color:'#64748b' }}>Rs.</span>
            <input type="number" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00"
              style={{ width:'100%', padding:'12px 12px 12px 44px', fontSize:22, fontWeight:900, border:'2px solid #e2e8f0', borderRadius:8, boxSizing:'border-box', color:'#059669', fontFamily:'monospace', outline:'none' }} />
          </div>
          <div style={{ display:'flex', gap:6, marginBottom:14, flexWrap:'wrap' }}>
            {due>0&&<button onClick={()=>setAmount(due.toFixed(2))} style={{ padding:'5px 10px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:6, fontSize:12, fontWeight:700, color:'#dc2626', cursor:'pointer' }}>🔴 Rs.{due.toFixed(2)}</button>}
            {cbal>0&&<button onClick={()=>setAmount(cbal.toFixed(2))} style={{ padding:'5px 10px', background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:6, fontSize:12, fontWeight:700, color:'#ea580c', cursor:'pointer' }}>💳 Rs.{cbal.toFixed(2)}</button>}
          </div>

          <label style={S.ls}>{t.paymentMethodLabel}</label>
          <div style={{ display:'flex', gap:6, marginBottom:14, flexWrap:'wrap' }}>
            {methods.map(m=>(
              <button key={m.k} onClick={()=>setMethod(m.k)} style={{ flex:'1 1 70px', padding:'8px 4px', background:method===m.k?'#dbeafe':'#f8fafc', border:`2px solid ${method===m.k?'#3b82f6':'#e2e8f0'}`, borderRadius:8, cursor:'pointer', fontSize:11, fontWeight:700, color:method===m.k?'#1e40af':'#64748b', display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                <span style={{ fontSize:18 }}>{m.i}</span><span>{m.l}</span>
              </button>
            ))}
          </div>

          <label style={S.ls}>{t.paymentNote}</label>
          <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional note..."
            style={{ width:'100%', padding:10, border:'1.5px solid #e2e8f0', borderRadius:8, fontSize:14, boxSizing:'border-box', marginBottom:14, outline:'none' }} />

          <label style={S.ls}>{t.paymentReceipt}</label>
          {preview ? (
            <div style={{ borderRadius:8, overflow:'hidden', border:'2px solid #16a34a', marginBottom:14 }}>
              <img src={preview} alt="Receipt" style={{ width:'100%', maxHeight:160, objectFit:'contain', background:'#f8fafc', display:'block' }} />
              <div style={{ background:'#dcfce7', padding:'6px 10px', display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontSize:12, fontWeight:700, color:'#166534' }}>{t.receiptUploaded}</span>
                <button onClick={()=>{setImg('');setPreview('');}} style={{ background:'none', border:'none', color:'#dc2626', cursor:'pointer', fontWeight:700 }}>✕</button>
              </div>
            </div>
          ) : (
            <button onClick={()=>fileRef.current?.click()} style={{ width:'100%', padding:14, border:'2px dashed #93c5fd', borderRadius:8, background:'#eff6ff', cursor:'pointer', color:'#1e40af', fontSize:13, fontWeight:700, display:'flex', flexDirection:'column', alignItems:'center', gap:4, marginBottom:14 }}>
              <span style={{ fontSize:26 }}>📷</span>{t.paymentReceipt}
            </button>
          )}
          <input type="file" ref={fileRef} onChange={handleImg} style={{ display:'none' }} accept="image/*" />

          {toNum(amount)>0&&(
            <div style={{ background:'#f0fdf4', border:'1.5px solid #bbf7d0', borderRadius:8, padding:10, marginBottom:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#475569', marginBottom:3 }}><span>{t.currentBalance}</span><span>Rs.{cbal.toFixed(2)}</span></div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#16a34a', fontWeight:700 }}><span>- Payment</span><span>Rs.{toNum(amount).toFixed(2)}</span></div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:15, fontWeight:900, borderTop:'1px solid #bbf7d0', paddingTop:6, marginTop:6, color:(cbal-toNum(amount))>0.01?'#dc2626':'#16a34a' }}>
                <span>{t.newBalance}</span><span>Rs.{(cbal-toNum(amount)).toFixed(2)}</span>
              </div>
            </div>
          )}

          <button onClick={save} disabled={saving||toNum(amount)<=0} style={{ width:'100%', padding:14, background:saving||toNum(amount)<=0?'#9ca3af':'linear-gradient(135deg,#16a34a,#15803d)', color:'white', border:'none', borderRadius:10, fontWeight:800, fontSize:16, cursor:saving?'wait':'pointer', marginBottom:8 }}>
            {saving?`⏳ ${t.saving}`:`${t.savePayment}${toNum(amount)>0?` — Rs.${toNum(amount).toFixed(2)}`:''}`}
          </button>
          <button onClick={onClose} style={{ width:'100%', padding:10, background:'none', border:'1px solid #e2e8f0', borderRadius:8, color:'#64748b', fontWeight:700, cursor:'pointer' }}>{t.cancel}</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════ */
export default function InvoiceList({ lang: initialLang = 'si' }) {
  /* ── Language sync ── */
  const [lang, setLang] = useState(initialLang);

  useEffect(() => {
    const syncLang = () => {
      try { const s = localStorage.getItem('language'); if (s) setLang(s); } catch {}
    };
    const onLangChange = (e) => setLang(e.detail || 'si');
    syncLang();
    window.addEventListener('app-language-change', onLangChange);
    window.addEventListener('storage', syncLang);
    return () => {
      window.removeEventListener('app-language-change', onLangChange);
      window.removeEventListener('storage', syncLang);
    };
  }, [initialLang]);

  const t = TRANSLATIONS[lang] || TRANSLATIONS.si;
  const { user, loading: authLoading } = useUserAuth();

  const [invoices,  setInvoices ] = useState([]);
  const [loading,   setLoading  ] = useState(true);
  const [loadMsg,   setLoadMsg  ] = useState('');
  const [search,    setSearch   ] = useState('');
  const [statusF,   setStatusF  ] = useState('all');
  const [dateF,     setDateF    ] = useState('allTime');
  const [selected,  setSelected ] = useState(null);
  const [expanded,  setExpanded ] = useState(null);
  const [customers, setCustomers] = useState({});
  const [payModal,  setPayModal ] = useState(null);
  const [outputInv, setOutputInv] = useState(null);
  const [toast,     setToast    ] = useState('');
  const [fetchErr,  setFetchErr ] = useState(false);
  const [lastFetch, setLastFetch] = useState(0);
  const [dbg,       setDbg      ] = useState([]);

  const showToast = useCallback((m) => {
    setToast(m); setTimeout(() => setToast(''), 3000);
  }, []);

  /* ── Load customers (one-time) ── */
  useEffect(() => {
    if (!user?.uid) return;
    getDocs(query(collection(db, 'customers'), where('uid', '==', user.uid)))
      .then((s) => {
        const map = {};
        s.docs.forEach((d) => { map[d.id] = { id: d.id, ...d.data() }; });
        setCustomers(map);
      })
      .catch((e) => console.warn('customers:', e.message));
  }, [user?.uid]);

  /* ════════════════════════════════════════════════════════════
     ✅ QUOTA-SAFE FETCH (getDocs + cache)
     ════════════════════════════════════════════════════════════ */
  const fetchInvoices = useCallback(async (forceRefresh = false) => {
    if (!user?.uid) { setLoading(false); return; }

    setFetchErr(false);

    // ── Cache check ──
    if (!forceRefresh) {
      const cached = loadInvoiceCache(user.uid);
      if (cached && cached.length > 0) {
        setInvoices(cached);
        setLastFetch(Date.now());
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setLoadMsg(t.loadingAll);

    try {
      const uid = user.uid;
      const plans = [];
      for (const col of INVOICE_COLLECTIONS) {
        for (const field of USER_FIELDS) {
          plans.push({ col, field });
        }
      }

      const results = await Promise.allSettled(
        plans.map((p) => getDocs(query(collection(db, p.col), where(p.field, '==', uid))))
      );

      const seen = new Map(), log = [];

      results.forEach((res, i) => {
        const { col, field } = plans[i];
        if (res.status === 'rejected') {
          const code = res.reason?.code || '';
          if (!code.includes('permission') && !code.includes('indexes')) log.push(`⚠️ ${col}.${field}: ${code}`);
          return;
        }
        if (res.value.empty) return;
        log.push(`✅ ${col}.${field}: ${res.value.size}`);
        res.value.docs.forEach((d) => {
          const path = d.ref.path;
          if (!seen.has(path)) seen.set(path, normalizeInvoice(d.data(), d.id, d.ref.parent.id, path));
        });
      });

      const list = Array.from(seen.values()).sort((a, b) => getTsMs(b.createdAt) - getTsMs(a.createdAt));

      console.log('── Invoice Fetch ──', 'TOTAL:', list.length);
      log.forEach((x) => console.log(x));

      setDbg(log);
      setInvoices(list);
      setLastFetch(Date.now());
      saveInvoiceCache(uid, list); // ✅ save cache

    } catch (e) {
      console.error('Fetch error:', e);
      setFetchErr(true);
      // ── Quota/offline — try cache ──
      const cached = loadInvoiceCache(user.uid);
      if (cached && cached.length > 0) {
        setInvoices(cached);
        setLastFetch(Date.now());
      }
    } finally {
      setLoading(false);
      setLoadMsg('');
    }
  }, [user?.uid, t.loadingAll]);

  useEffect(() => {
    if (!authLoading) fetchInvoices();
  }, [authLoading, fetchInvoices]);

  /* ── Portal link (SSR safe) ── */
  const portalLink = useCallback((inv) => {
    if (typeof window === 'undefined') return null;
    const c = customers[inv.customerId];
    return c?.portalAccessKey ? `${window.location.origin}/portal/${c.portalAccessKey}` : null;
  }, [customers]);

  /* ── Delete ── */
  const handleDelete = useCallback(async (inv) => {
    if (!window.confirm(t.deleteConfirm)) return;
    try {
      await deleteDoc(doc(db, inv._path));
      showToast(t.deleted);
      clearInvoiceCache(user?.uid); // ✅ clear cache
      setInvoices((p) => p.filter((i) => i._path !== inv._path));
      if (selected?._path === inv._path) setSelected(null);
    } catch (e) { showToast(`❌ ${e.message}`); }
  }, [selected, showToast, t.deleteConfirm, t.deleted, user?.uid]);

  const openPay = useCallback((inv, e) => { e?.stopPropagation(); setPayModal({ invoice:inv, customer:customers[inv.customerId]||null }); }, [customers]);
  const openOut = useCallback((inv, e) => { e?.stopPropagation(); setOutputInv(inv); }, []);

  const handleCopyPortalLink = useCallback((inv) => {
    const link = portalLink(inv);
    if (!link) { showToast(`⚠️ ${t.noPortalKey}`); return; }
    navigator.clipboard.writeText(link);
    showToast(`✅ ${t.linkCopied}`);
  }, [portalLink, showToast, t.noPortalKey, t.linkCopied]);

  /* ── Filter ── */
  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    return invoices.filter((inv) => {
      if (term) {
        const txt = [inv.customerName, inv.invoiceNo, inv.invoiceCode, inv.id, inv.customerPhone].filter(Boolean).join(' ').toLowerCase();
        if (!txt.includes(term)) return false;
      }
      if (statusF==='completed') { if(inv.status==='draft') return false; }
      else if (statusF==='draft')  { if(inv.status!=='draft') return false; }
      else if (statusF==='paid')   { if(!(inv.payAmount>=inv.netAmount-0.01&&inv.netAmount>0)) return false; }
      else if (statusF==='unpaid') { if(inv.payAmount>=inv.netAmount-0.01) return false; }
      if (dateF!=='allTime'&&getTsMs(inv.createdAt)<getDateStart(dateF)) return false;
      return true;
    });
  }, [invoices, search, statusF, dateF]);

  /* ── Stats ── */
  const stats = useMemo(() => {
    const ta = filtered.reduce((s,i)=>s+i.netAmount,0);
    const tp = filtered.reduce((s,i)=>s+i.payAmount,0);
    return { n:filtered.length, ta, tp, tb:ta-tp };
  }, [filtered]);

  /* ── Profit map ── */
  const profits = useMemo(() => {
    const m = {};
    filtered.forEach((inv) => { m[inv._path] = invoiceProfit(inv.items||[]); });
    return m;
  }, [filtered]);

  /* ── Status badge ── */
  const badge = (inv) => {
    if (inv.status==='draft') return { bg:'#fef3c7', cl:'#92400e', lb:`📝 ${t.drafts}`,   ac:'#f59e0b' };
    if (inv.netAmount<=0||inv.payAmount>=inv.netAmount-0.01) return { bg:'#dcfce7', cl:'#166534', lb:`✅ ${t.paid}`,    ac:'#22c55e' };
    if (inv.payAmount>0) return { bg:'#fed7aa', cl:'#9a3412', lb:`⏳ ${t.partial}`, ac:'#f97316' };
    return { bg:'#fecaca', cl:'#991b1b', lb:`🔴 ${t.unpaid}`,  ac:'#ef4444' };
  };

  if (authLoading||loading) return (
    <div style={{ textAlign:'center', padding:60, color:'#94a3b8' }}>
      <div style={{ fontSize:40, marginBottom:10 }}>⏳</div>
      <div style={{ fontSize:16, fontWeight:600, color:'#475569', marginBottom:6 }}>{t.loading}</div>
      {loadMsg&&<div style={{ fontSize:13, color:'#94a3b8' }}>{loadMsg}</div>}
    </div>
  );

  if (!user?.uid) return (
    <div style={{ textAlign:'center', padding:60, color:'#64748b' }}>🔐 Login required</div>
  );

  /* ════════════════════════════════════════════════════════════
     DETAIL VIEW
     ════════════════════════════════════════════════════════════ */
  if (selected) {
    const customer = customers[selected.customerId];
    const bal = getCustomerBalanceBreakdown(customer, selected);
    return (
      <div style={{ padding:12, backgroundColor:'#f8fafc', minHeight:'100vh', paddingBottom:80 }}>
        {outputInv&&<InvoiceOutputManager invoice={outputInv} onClose={()=>setOutputInv(null)} />}
        {payModal&&(
          <PaymentModal invoice={payModal.invoice} customer={payModal.customer} user={user} t={t}
            onClose={()=>setPayModal(null)}
            onSuccess={()=>{ showToast(t.paymentSuccess); setPayModal(null); clearInvoiceCache(user?.uid); fetchInvoices(true); }}
          />
        )}
        {toast&&<div style={{ position:'fixed', top:20, left:'50%', transform:'translateX(-50%)', background:'#334155', color:'#fff', padding:'10px 20px', borderRadius:8, zIndex:9999, fontSize:14 }}>{toast}</div>}

        {/* Back */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, flexWrap:'wrap' }}>
          <button onClick={()=>setSelected(null)} style={{ background:'#f1f5f9', border:'none', padding:'8px 14px', borderRadius:8, fontSize:15, cursor:'pointer', fontWeight:'bold' }}>{t.back}</button>
          <h2 style={{ margin:0, fontSize:18, color:'#0f172a', flex:1 }}>🧾 {selected.invoiceCode}</h2>
          <button onClick={()=>openOut(selected)} style={{ background:'#6366f1', color:'white', border:'none', borderRadius:8, padding:'8px 12px', fontSize:13, cursor:'pointer', fontWeight:800 }}>{t.sendBill}</button>
          <button onClick={()=>handleDelete(selected)} style={S.ab('#ef4444')}>🗑️</button>
        </div>

        {/* Path */}
        <div style={{ fontSize:10, color:'#94a3b8', fontFamily:'monospace', background:'#f1f5f9', padding:'4px 8px', borderRadius:4, marginBottom:12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          📂 {selected._path}
        </div>

        {/* Collect payment */}
        {selected.status!=='draft'&&selected.balance>0.01&&(
          <button onClick={()=>openPay(selected)} style={{ width:'100%', padding:'13px 18px', marginBottom:12, background:'linear-gradient(135deg,#16a34a,#15803d)', color:'white', border:'none', borderRadius:12, fontWeight:800, fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            {t.collectPayment}<span style={{ background:'rgba(255,255,255,0.2)', padding:'2px 10px', borderRadius:6 }}>Rs.{selected.balance.toFixed(2)}</span>
          </button>
        )}

        {/* Portal */}
        {portalLink(selected)&&(
          <div style={{ background:'linear-gradient(135deg,#059669,#10b981)', borderRadius:10, padding:12, marginBottom:14, color:'white', display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
            <div style={{ fontSize:13, fontFamily:'monospace', wordBreak:'break-all' }}>🔗 {portalLink(selected)}</div>
            <button onClick={()=>handleCopyPortalLink(selected)} style={S.portalBtn}>📋</button>
          </div>
        )}

        {/* Invoice info */}
        <div style={{ background:'linear-gradient(135deg,#eff6ff,#dbeafe)', borderRadius:12, padding:14, marginBottom:14, border:'1px solid #bfdbfe' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
            <div>
              <div style={{ fontSize:11, color:'#64748b' }}>{t.invoiceCode}</div>
              <div style={{ fontSize:16, fontWeight:'bold', color:'#1e40af', fontFamily:'monospace' }}>{selected.invoiceCode}</div>
            </div>
            {(()=>{ const b=badge(selected); return <span style={{ padding:'4px 10px', borderRadius:16, fontSize:12, fontWeight:'bold', background:b.bg, color:b.cl }}>{b.lb}</span>; })()}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, fontSize:13 }}>
            <div>📅 {selected.date} {selected.time}</div>
            <div>⏰ <span style={{ color:getAgeColor(selected.age), fontWeight:'bold' }}>{selected.age} {t.days}</span></div>
            <div>👤 {selected.customerName||t.cashCustomer}</div>
            <div>📞 {selected.customerPhone||'-'}</div>
            <div>🏢 {selected.branch}</div>
            <div>👔 {selected.rep}</div>
          </div>
        </div>

        {/* Items */}
        {selected.items?.length>0&&(
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:14, fontWeight:'bold', color:'#334155', marginBottom:8 }}>📦 {t.items} ({selected.items.length})</div>
            <div style={{ background:'white', borderRadius:10, border:'1px solid #e2e8f0', overflow:'hidden' }}>
              {selected.items.map((item,idx)=>{
                const p=itemProfit(item), disc=toNum(item.discAmount||item.discount||0);
                return (
                  <div key={idx} style={{ padding:10, display:'flex', alignItems:'center', gap:10, borderBottom:idx<selected.items.length-1?'1px solid #f1f5f9':'none', background:p.lp!==null&&p.lp<0?'#fef2f2':'white' }}>
                    <img src={item.photoURL||DEFAULT_SVG} alt="" onError={e=>{e.target.src=DEFAULT_SVG;}} style={{ width:40, height:40, borderRadius:6, objectFit:'cover', background:'#f1f5f9', flexShrink:0 }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, fontSize:14, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</div>
                      {(item.nameSi||item.sinhalaName)&&<div style={{ fontSize:12, color:'#1e40af' }}>{item.nameSi||item.sinhalaName}</div>}
                      <div style={{ fontSize:12, color:'#64748b' }}>{item.qty} × Rs.{sellOf(item).toFixed(2)}{item.uom&&item.uom!=='unit'?` ${item.uom}`:''}</div>
                      {disc>0&&<div style={{ fontSize:11, color:'#ef4444', marginTop:2 }}>🏷️ -Rs.{disc.toFixed(2)}</div>}
                      {p.hasCost&&<div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>{t.cost}: Rs.{p.cost.toFixed(2)} | <span style={{ color:p.lp>=0?'#059669':'#dc2626', fontWeight:700 }}>{t.totalProfit}: Rs.{p.lp?.toFixed(2)} ({p.mg?.toFixed(1)}%)</span></div>}
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <div style={{ fontWeight:'bold', fontSize:15, color:'#1e40af' }}>{toNum(item.lineTotal).toFixed(2)}</div>
                      {p.hasCost&&<div style={{ fontSize:11, fontWeight:800, color:p.lp>=0?'#059669':'#dc2626' }}>{p.lp>=0?'+':''}Rs.{p.lp?.toFixed(2)}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
            <ProfitTable items={selected.items} t={t} />
          </div>
        )}

        {/* Totals */}
        <div style={{ background:'white', borderRadius:10, padding:14, border:'1px solid #e2e8f0', marginBottom:14 }}>
          {[
            { l:t.invoiceValue,  v:i=>i.invoiceValue,   show:()=>true },
            { l:t.totalDiscount, v:i=>i.totalDiscount,  show:i=>i.totalDiscount>0, c:'#ef4444', px:'-', ic:'🏷️' },
            { l:`${t.billDiscount} (${selected.billDiscountPercent}%)`, v:i=>i.billDiscount, show:i=>i.billDiscount>0, c:'#f59e0b', px:'-', ic:'🎯' },
            { l:t.exchange,      v:i=>i.exchangeAmount, show:i=>i.exchangeAmount>0, c:'#8b5cf6', px:'-', ic:'🔄' },
            { l:t.returnAmount,  v:i=>i.returnAmount,   show:i=>i.returnAmount>0,   c:'#dc2626', px:'-', ic:'↩️' },
          ].filter(r=>r.show(selected)).map((row,i)=>(
            <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:14, marginBottom:5, color:row.c||'#475569' }}>
              <span>{row.ic?`${row.ic} `:''}{row.l}</span>
              <span>{row.px||''}Rs.{row.v(selected).toFixed(2)}</span>
            </div>
          ))}
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:17, fontWeight:'bold', borderTop:'2px solid #e2e8f0', paddingTop:10, marginTop:5 }}>
            <span>{t.netAmount}</span><span>Rs. {selected.netAmount.toFixed(2)}</span>
          </div>
        </div>

        {/* Savings */}
        {(selected.totalDiscount+selected.billDiscount)>0&&(
          <div style={{ background:'linear-gradient(135deg,#fef3c7,#fde68a)', borderRadius:10, padding:14, marginBottom:14, border:'1px dashed #f59e0b', textAlign:'center' }}>
            <div style={{ fontSize:12, color:'#92400e', marginBottom:4 }}>🎉 {t.youSaved}</div>
            <div style={{ fontSize:22, fontWeight:'bold', color:'#d97706' }}>Rs. {(selected.totalDiscount+selected.billDiscount).toFixed(2)}</div>
          </div>
        )}

        {/* Remarks */}
        {selected.remarks&&(
          <div style={{ background:'white', borderRadius:10, padding:12, border:'1px solid #e2e8f0', marginBottom:14 }}>
            <div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>📝 {t.remark}</div>
            <div style={{ fontSize:14, color:'#334155' }}>{selected.remarks}</div>
          </div>
        )}

        {/* Payment */}
        <div style={{ background:'white', borderRadius:10, padding:14, border:'1px solid #e2e8f0', marginBottom:14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:14, marginBottom:6 }}>
            <span>{t.paymentMethod}</span>
            <span style={{ fontWeight:600 }}>{payIcon(selected.paymentMethod)} {(selected.paymentMethod||'cash').toUpperCase()}</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:14, marginBottom:6 }}>
            <span>{t.paidAmount}</span>
            <span style={{ fontWeight:600, color:'#16a34a' }}>Rs. {selected.payAmount.toFixed(2)}</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:16, fontWeight:'bold', padding:'10px', borderRadius:8, background:selected.balance<=0.01?'#f0fdf4':'#fef2f2', color:selected.balance<=0.01?'#16a34a':'#dc2626' }}>
            <span>{t.balance}</span><span>Rs. {selected.balance.toFixed(2)}</span>
          </div>
        </div>

        {/* Customer debt */}
        {bal&&(
          <div style={{ background:bal.hasDebt?'#fef2f2':'#f0fdf4', border:`2px solid ${bal.hasDebt?'#fecaca':'#bbf7d0'}`, borderRadius:12, padding:14, marginBottom:14 }}>
            <div style={{ fontSize:13, fontWeight:800, color:'#334155', marginBottom:8 }}>💳 {t.totalDebt}</div>
            {Math.abs(bal.previousBalance)>0.01&&(
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:4, color:'#64748b' }}><span>{t.previousBalance}</span><span>Rs.{bal.previousBalance.toFixed(2)}</span></div>
            )}
            {bal.thisInvoiceDue>0&&(
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:4, color:'#dc2626' }}><span>{t.thisBill}</span><span>Rs.{bal.thisInvoiceDue.toFixed(2)}</span></div>
            )}
            <div style={{ borderTop:'1px dashed #e2e8f0', paddingTop:8, marginTop:6, display:'flex', justifyContent:'space-between', fontSize:17, fontWeight:900, color:bal.hasDebt?'#dc2626':bal.hasDeposit?'#16a34a':'#059669' }}>
              <span>{bal.hasDebt?t.totalDebt:bal.hasDeposit?t.deposit:t.noDebt}</span>
              <span>{bal.hasDebt?`Rs.${bal.totalDebt.toFixed(2)}`:bal.hasDeposit?`Rs.${Math.abs(bal.totalDebt).toFixed(2)}`:'✅'}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════
     LIST VIEW
     ════════════════════════════════════════════════════════════ */
  return (
    <div style={{ padding:10, backgroundColor:'#f8fafc', minHeight:'100vh', paddingBottom:80 }}>
      {outputInv&&<InvoiceOutputManager invoice={outputInv} onClose={()=>setOutputInv(null)} />}
      {payModal&&(
        <PaymentModal invoice={payModal.invoice} customer={payModal.customer} user={user} t={t}
          onClose={()=>setPayModal(null)}
          onSuccess={()=>{ showToast(t.paymentSuccess); setPayModal(null); clearInvoiceCache(user?.uid); fetchInvoices(true); }}
        />
      )}
      {toast&&<div style={{ position:'fixed', top:20, left:'50%', transform:'translateX(-50%)', background:'#334155', color:'#fff', padding:'10px 20px', borderRadius:8, zIndex:9999, fontSize:14 }}>{toast}</div>}

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
        <div>
          <h2 style={{ margin:0, fontSize:22, color:'#0f172a' }}>📋 {t.title}</h2>
          <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>{t.invoiceCount}: {invoices.length}</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button
            onClick={() => { clearInvoiceCache(user?.uid); fetchInvoices(true); }}
            style={{ padding:'8px 14px', background:'#f1f5f9', color:'#374151', border:'1px solid #e2e8f0', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:13 }}
          >
            🔄
          </button>
          <Link href="/pos" prefetch={false} style={{ padding:'8px 16px', background:'#3b82f6', color:'white', borderRadius:8, fontWeight:'bold', fontSize:14, textDecoration:'none', display:'inline-flex', alignItems:'center' }}>
            {t.newSale}
          </Link>
        </div>
      </div>

      {/* Debug */}
      {dbg.length>0&&(
        <details style={{ marginBottom:10, background:'#fefce8', border:'1px solid #fde047', borderRadius:8, padding:'8px 10px' }}>
          <summary style={{ cursor:'pointer', fontWeight:700, fontSize:11, color:'#854d0e' }}>{t.debugTitle}: {invoices.length} loaded</summary>
          <pre style={{ fontSize:10, color:'#713f12', marginTop:6, whiteSpace:'pre-wrap', fontFamily:'monospace', maxHeight:150, overflowY:'auto' }}>
            {`UID: ${user?.uid}\n${dbg.join('\n')}\nTOTAL: ${invoices.length}`}
          </pre>
        </details>
      )}

      {lastFetch>0&&(
        <div style={{ fontSize:11, color:'#94a3b8', textAlign:'right', marginBottom:8 }}>
          ⏱️ {new Date(lastFetch).toLocaleTimeString()} | 📦 {invoices.length}
        </div>
      )}

      {/* Error */}
      {fetchErr&&(
        <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'12px 14px', marginBottom:14, display:'flex', gap:10, alignItems:'center' }}>
          <span style={{ fontSize:24 }}>⚠️</span>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:800, color:'#dc2626' }}>{t.quotaError}</div>
            <div style={{ fontSize:12, color:'#991b1b' }}>{t.quotaDesc}</div>
          </div>
          <button onClick={()=>fetchInvoices(true)} style={{ padding:'8px 14px', background:'#dc2626', color:'white', border:'none', borderRadius:8, cursor:'pointer', fontWeight:700 }}>{t.retry}</button>
        </div>
      )}

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8, marginBottom:12 }}>
        {[
          { l:`🧾 ${t.invoiceCount}`, v:stats.n, big:true, bg:'#eff6ff', bc:'#3b82f6', tc:'#1e40af' },
          { l:`💰 ${t.totalSales}`,   v:`Rs.${stats.ta.toFixed(0)}`, bg:'#f0fdf4', bc:'#22c55e', tc:'#15803d' },
          { l:`✅ ${t.totalPaid}`,    v:`Rs.${stats.tp.toFixed(0)}`, bg:'#f0fdf4', bc:'#16a34a', tc:'#16a34a' },
          { l:`📊 ${t.totalBalance}`, v:`Rs.${stats.tb.toFixed(0)}`, bg:stats.tb>0.5?'#fef2f2':'#f0fdf4', bc:stats.tb>0.5?'#ef4444':'#22c55e', tc:stats.tb>0.5?'#dc2626':'#16a34a' },
        ].map((s,i)=>(
          <div key={i} style={{ background:s.bg, padding:10, borderRadius:8, borderLeft:`3px solid ${s.bc}` }}>
            <div style={{ fontSize:12, color:'#64748b' }}>{s.l}</div>
            <div style={{ fontSize:s.big?22:17, fontWeight:'bold', color:s.tc }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Date tabs */}
      <div style={{ display:'flex', marginBottom:8, background:'#f1f5f9', borderRadius:8, overflow:'hidden' }}>
        {['today','thisWeek','thisMonth','allTime'].map(f=>(
          <button key={f} onClick={()=>setDateF(f)} style={{ flex:1, padding:'10px 2px', fontSize:12, fontWeight:'bold', border:'none', cursor:'pointer', background:dateF===f?'#3b82f6':'transparent', color:dateF===f?'white':'#64748b' }}>
            {t[f]}
          </button>
        ))}
      </div>

      {/* Status tabs */}
      <div style={{ display:'flex', marginBottom:8, background:'#f1f5f9', borderRadius:8, overflow:'hidden' }}>
        {[
          { k:'all',       l:`${t.all} (${invoices.length})` },
          { k:'completed', l:t.completed },
          { k:'paid',      l:t.paid      },
          { k:'unpaid',    l:t.unpaid    },
          { k:'draft',     l:t.drafts    },
        ].map(tab=>(
          <button key={tab.k} onClick={()=>setStatusF(tab.k)} style={{ flex:1, padding:'8px 2px', fontSize:11, fontWeight:'bold', border:'none', cursor:'pointer', background:statusF===tab.k?'white':'transparent', color:statusF===tab.k?'#3b82f6':'#64748b', boxShadow:statusF===tab.k?'0 1px 4px rgba(0,0,0,0.08)':'none', borderRadius:statusF===tab.k?6:0 }}>
            {tab.l}
          </button>
        ))}
      </div>

      {/* Search */}
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t.search}
        style={{ width:'100%', padding:13, borderRadius:8, border:'1px solid #e2e8f0', fontSize:15, boxSizing:'border-box', marginBottom:8, background:'white', outline:'none' }} />

      <div style={{ fontSize:12, color:'#94a3b8', marginBottom:10, textAlign:'right' }}>
        {search||statusF!=='all'||dateF!=='allTime'?`🔍 ${filtered.length} / ${invoices.length}`:`📦 ${invoices.length}`}
      </div>

      {/* Cards */}
      {filtered.length===0 ? (
        <div style={{ textAlign:'center', padding:40, color:'#94a3b8', background:'white', borderRadius:10, border:'1px solid #e2e8f0' }}>
          <div style={{ fontSize:50, marginBottom:15 }}>📭</div>
          <div style={{ fontSize:15 }}>{t.noData}</div>
          <div style={{ fontSize:12, color:'#cbd5e1', marginTop:8 }}>{invoices.length>0?`${invoices.length} loaded — filter වෙනස් කරන්න`:'Debug panel expand කරලා check කරන්න'}</div>
          <button onClick={()=>fetchInvoices(true)} style={{ marginTop:14, padding:'10px 24px', background:'#3b82f6', color:'white', border:'none', borderRadius:8, cursor:'pointer', fontWeight:700 }}>🔄 Refresh</button>
        </div>
      ) : (
        filtered.map(inv=>{
          const b=badge(inv), rk=inv._path, isExp=expanded===rk;
          const isDue=inv.balance>0.01&&inv.status!=='draft';
          const ps=profits[rk], sav=inv.totalDiscount+inv.billDiscount;

          return (
            <div key={rk} style={{ background:'white', borderRadius:10, marginBottom:8, border:'1px solid #e2e8f0', overflow:'hidden', borderLeft:`4px solid ${b.ac}` }}>
              {/* Card header */}
              <div onClick={()=>setExpanded(isExp?null:rk)} style={{ padding:12, cursor:'pointer' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:5 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:'bold', fontSize:16, color:'#0f172a', marginBottom:2 }}>{inv.customerName||t.cashCustomer}</div>
                    <div style={{ fontSize:12, color:'#94a3b8', fontFamily:'monospace' }}>{inv.invoiceCode}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontWeight:'bold', fontSize:18, color:'#1e40af' }}>Rs.{inv.netAmount.toFixed(0)}</div>
                    {ps?.ok&&<div style={{ fontSize:11, fontWeight:700, color:ps.tp>=0?'#059669':'#dc2626' }}>📊 Rs.{ps.tp.toFixed(0)}</div>}
                    <span style={{ fontSize:11, padding:'2px 8px', borderRadius:10, background:b.bg, color:b.cl, fontWeight:'bold' }}>{b.lb}</span>
                  </div>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:4 }}>
                  <div style={{ display:'flex', gap:8, fontSize:12, color:'#64748b', flexWrap:'wrap', alignItems:'center' }}>
                    <span>📅 {inv.date}</span>
                    <span>📦 {inv.itemCount}</span>
                    <span>{payIcon(inv.paymentMethod)}</span>
                    {sav>0&&<span style={{ fontSize:10, color:'#d97706', fontWeight:'bold' }}>🏷️-{sav.toFixed(0)}</span>}
                    {isDue&&<span style={{ fontSize:10, color:'#dc2626', fontWeight:800, background:'#fef2f2', padding:'2px 6px', borderRadius:5, border:'1px solid #fecaca' }}>🔴 Rs.{inv.balance.toFixed(0)}</span>}
                  </div>
                  <span style={{ fontSize:13, color:'#6366f1', fontWeight:600 }}>{isExp?'▲':'▼'}</span>
                </div>
              </div>

              {/* Expanded */}
              {isExp&&(
                <div style={{ borderTop:'1px solid #e2e8f0', padding:12, background:'#f8fafc' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6, marginBottom:10 }}>
                    {[
                      { l:t.netAmount,  v:`Rs.${inv.netAmount.toFixed(2)}`, c:'#1e40af' },
                      { l:t.paidAmount, v:`Rs.${inv.payAmount.toFixed(2)}`, c:'#16a34a' },
                      { l:t.balance,    v:`Rs.${inv.balance.toFixed(2)}`,   c:inv.balance<=0.01?'#16a34a':'#dc2626' },
                    ].map((r,i)=>(
                      <div key={i} style={{ background:'white', padding:'6px 8px', borderRadius:8, border:'1px solid #e2e8f0', textAlign:'center' }}>
                        <div style={{ fontSize:10, color:'#94a3b8' }}>{r.l}</div>
                        <div style={{ fontSize:12, fontWeight:'bold', color:r.c }}>{r.v}</div>
                      </div>
                    ))}
                  </div>

                  {ps?.ok&&(
                    <div style={{ marginBottom:10, padding:'8px 12px', background:ps.tp>=0?'#f0fdf4':'#fef2f2', borderRadius:8, border:`1px solid ${ps.tp>=0?'#86efac':'#fecaca'}` }}>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6, textAlign:'center' }}>
                        <div><div style={{ fontSize:10, color:'#64748b' }}>{t.revenue}</div><div style={{ fontSize:12, fontWeight:800, color:'#1e40af' }}>Rs.{ps.tr.toFixed(0)}</div></div>
                        <div><div style={{ fontSize:10, color:'#64748b' }}>{t.cost}</div><div style={{ fontSize:12, fontWeight:800, color:'#dc2626' }}>Rs.{ps.tc.toFixed(0)}</div></div>
                        <div><div style={{ fontSize:10, color:'#64748b' }}>{t.totalProfit}</div><div style={{ fontSize:13, fontWeight:900, color:ps.tp>=0?'#059669':'#dc2626' }}>Rs.{ps.tp.toFixed(0)}</div></div>
                      </div>
                    </div>
                  )}

                  <div style={{ fontSize:9, color:'#94a3b8', fontFamily:'monospace', marginBottom:8, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>📂 {inv._path}</div>

                  <div style={{ display:'grid', gridTemplateColumns:isDue?'repeat(4,1fr)':'repeat(3,1fr)', gap:6 }}>
                    <button onClick={e=>{e.stopPropagation();setSelected(inv);}} style={S.ac('#6366f1')}>
                      <span style={{ fontSize:18 }}>👁️</span><span style={{ fontSize:9 }}>{t.viewDetails}</span>
                    </button>
                    <button onClick={e=>openOut(inv,e)} style={{ ...S.ac('#8b5cf6'), background:'linear-gradient(135deg,#ede9fe,#ddd6fe)', border:'1.5px solid #8b5cf6' }}>
                      <span style={{ fontSize:18 }}>📤</span><span style={{ fontSize:9, color:'#6d28d9' }}>{t.sendBill}</span>
                    </button>
                    <button onClick={e=>{e.stopPropagation();handleDelete(inv);}} style={S.ac('#ef4444')}>
                      <span style={{ fontSize:18 }}>🗑️</span><span style={{ fontSize:9 }}>{t.delete}</span>
                    </button>
                    {isDue&&(
                      <button onClick={e=>openPay(inv,e)} style={{ ...S.ac('#16a34a'), background:'#f0fdf4', border:'1.5px solid #16a34a' }}>
                        <span style={{ fontSize:18 }}>💰</span><span style={{ fontSize:9 }}>{t.collectPayment}</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   STYLES
   ══════════════════════════════════════════════════════════════ */
const S = {
  ab: (bg) => ({ background:bg, color:'white', border:'none', borderRadius:6, width:34, height:34, fontSize:15, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }),
  ac: (bg) => ({ background:'white', border:`1px solid ${bg}33`, borderRadius:8, padding:'7px 4px', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:2, color:bg, fontWeight:'bold' }),
  portalBtn: { background:'rgba(255,255,255,0.2)', color:'white', border:'none', borderRadius:6, padding:'6px 10px', fontSize:12, cursor:'pointer', fontWeight:'bold' },
  ov: { position:'fixed', inset:0, zIndex:99999, background:'rgba(15,23,42,0.75)', backdropFilter:'blur(4px)', display:'flex', alignItems:'flex-end', justifyContent:'center' },
  mb: { position:'relative', width:'100%', maxWidth:480, background:'white', borderTopLeftRadius:20, borderTopRightRadius:20, boxShadow:'0 -8px 32px rgba(0,0,0,0.2)' },
  ls: { display:'block', fontWeight:700, fontSize:13, color:'#334155', marginBottom:5 },
  greenBtn: { width:'100%', padding:13, background:'#16a34a', color:'white', border:'none', borderRadius:10, fontWeight:800, fontSize:16, cursor:'pointer' },
};