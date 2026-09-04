'use client';

// components/InvoiceList.jsx
// ✅ Integrated with correct @/firebaseConfig wrapper
// ✅ InvoiceOutputManager integrated cleanly for receipts
// ✅ FIXED: Unit (Pcs) profit calculation by properly applying uomFactor & allocatedCostTotal
// ✅ FIXED: Today's and filtered totals (Sales, Paid, Credit/Balance, and Profit) calculated 100% accurately
// ✅ FIXED: Added missing 'fmt' helper function to resolve Unhandled Runtime ReferenceError

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { db } from '@/firebaseConfig'; // ★★★ CORRECTED FIREBASE IMPORT ★★★
import { useUserAuth } from '@/context/UserContext';
import {
  collection, query, where, getDocs, getDoc,
  deleteDoc, doc, addDoc, serverTimestamp, updateDoc,
  Timestamp
} from 'firebase/firestore';

// ★ InvoiceOutputManager import
import InvoiceOutputManager from '@/components/InvoiceOutputManager';

const INVOICE_COLLECTIONS = ['invoices', 'drafts', 'invoiceDrafts'];

const TRANSLATIONS = {
  si: {
    title:'ඉන්වොයිස් ලැයිස්තුව', search:'පාරිභෝගිකයා / Invoice ID සොයන්න...',
    invoiceCode:'Invoice Code', balance:'ශේෂය', netAmount:'ශුද්ධ මුදල',
    invoiceValue:'ඉන්වොයිස් වටිනාකම', returnAmount:'ආපසු', totalDiscount:'මුළු වට්ටම',
    billDiscount:'බිල්පත් වට්ටම', exchange:'හුවමාරු', noData:'ඉන්වොයිස් නොමැත',
    loading:'පූරණය වෙමින්...', loadingAll:'ඉන්වොයිස් load වෙමින්...', all:'සියල්ල',
    drafts:'කෙටුම්පත්', completed:'සම්පූර්ණයි', paid:'ගෙවා ඇත', unpaid:'නොගෙවූ',
    partial:'අර්ධ', deleteConfirm:'මෙම ඉන්වොයිසය මකා දැමීමට අවශ්‍යද?', deleted:'මකා දමන ලදී!',
    cashCustomer:'Cash Customer', newSale:'නව විකුණුම', today:'අද', thisWeek:'සතිය',
    thisMonth:'මාසය', allTime:'සමස්ත', days:'දින', delete:'මකන්න', viewDetails:'විස්තර',
    back:'ආපසු', paymentMethod:'ගෙවීම් ක්‍රමය', paidAmount:'ගෙවූ මුදල', items:'භාණ්ඩ',
    totalSales:'මුළු විකිණීම්', totalPaid:'මුළු ගෙවීම්', totalBalance:'මුළු හිඟ',
    invoiceCount:'ඉන්වොයිස්', linkCopied:'Link copied!', noPortalKey:'Portal Key නැත',
    youSaved:'ඔබ ඉතිරි කළේ', totalDebt:'මුළු ණය', previousBalance:'පෙර ශේෂය',
    thisBill:'මෙම බිල්පත', noDebt:'ණය නැත', deposit:'තැන්පතුව',
    collectPayment:'ගෙවීම', paymentCollection:'ගෙවීම් එකතු', paymentAmount:'ගෙවන මුදල (Rs.)',
    paymentNote:'සටහන', paymentMethodLabel:'ගෙවීම් ක්‍රමය', paymentSuccess:'ගෙවීම සාර්ථකයි!',
    paymentError:'දෝෂයකි', paymentRequired:'මුදල ඇතුළත් කරන්න', savePayment:'සුරකින්න',
    saving:'සුරකිමින්...', cancel:'අවලංගු', invoiceDue:'හිඟ මුදල',
    currentBalance:'වත්මන් ශේෂය', newBalance:'නව ශේෂය', paymentReceipt:'රිසිට්',
    receiptUploaded:'Upload විය', cash:'මුදල්', card:'කාඩ්', bank:'බැංකු',
    cheque:'චෙක්', other:'වෙනත්',
    sendBill:'📤 යවන්න',  // ★ NEW
    profitBreakdown:'ලාභ', totalProfit:'මුළු ලාභය', quotaError:'Firebase Error',
    quotaDesc:'Data load කිරීමේ දෝෂයකි. නැවත උත්සාහ කරන්න.', retry:'Retry',
    portalLink:'Portal', remark:'සටහන', revenue:'ආදායම', cost:'පිරිවැය',
    qty:'ප්‍රමාණය', noCostData:'Cost data නොමැත', debugTitle:'Debug',
    lastUpdated:'අවසන් update', loadMore:'Load More',
  },
  en: {
    title:'Invoice List', search:'Search customer / Invoice ID...',
    invoiceCode:'Invoice Code', balance:'Balance', netAmount:'Net Amount',
    invoiceValue:'Invoice Value', returnAmount:'Return', totalDiscount:'Total Discount',
    billDiscount:'Bill Discount', exchange:'Exchange', noData:'No invoices found',
    loading:'Loading...', loadingAll:'Loading invoices...', all:'All',
    drafts:'Drafts', completed:'Completed', paid:'Paid', unpaid:'Unpaid',
    partial:'Partial', deleteConfirm:'Do you want to delete this invoice?', deleted:'Deleted!',
    cashCustomer:'Cash Customer', newSale:'New Sale', today:'Today', thisWeek:'Week',
    thisMonth:'Month', allTime:'All Time', days:'days', delete:'Delete', viewDetails:'Details',
    back:'Back', paymentMethod:'Payment Method', paidAmount:'Paid Amount', items:'Items',
    totalSales:'Total Sales', totalPaid:'Total Paid', totalBalance:'Total Balance',
    invoiceCount:'Invoices', linkCopied:'Link copied!', noPortalKey:'No portal key',
    youSaved:'You Saved', totalDebt:'Total Debt', previousBalance:'Previous Balance',
    thisBill:'This Bill', noDebt:'No Debt', deposit:'Deposit',
    collectPayment:'Collect Payment', paymentCollection:'Payment Collection',
    paymentAmount:'Payment Amount (Rs.)', paymentNote:'Payment Note',
    paymentMethodLabel:'Payment Method', paymentSuccess:'Payment success!',
    paymentError:'Error', paymentRequired:'Enter amount', savePayment:'Save',
    saving:'Saving...', cancel:'Cancel', invoiceDue:'Invoice Due',
    currentBalance:'Current Balance', newBalance:'New Balance', paymentReceipt:'Receipt',
    receiptUploaded:'Uploaded', cash:'Cash', card:'Card', bank:'Bank',
    cheque:'Cheque', other:'Other',
    sendBill:'📤 Send',  // ★ NEW
    profitBreakdown:'Profit', totalProfit:'Total Profit', quotaError:'Firebase Error',
    quotaDesc:'Data load error. Please try again.', retry:'Retry',
    portalLink:'Portal', remark:'Remark', revenue:'Revenue', cost:'Cost',
    qty:'Qty', noCostData:'No cost data', debugTitle:'Debug',
    lastUpdated:'Last updated', loadMore:'Load More',
  },
};

const INV_CACHE_TTL = 1000 * 60 * 60 * 24; // Cache valid for 24 hours to support offline use

// Save to localStorage instead of sessionStorage to persist offline across browser closures
const saveInvoiceCache = (uid, list) => {
  try {
    const slim = list.map((inv) => ({
      ...inv, _raw: undefined,
      items: (inv.items || []).map((it) => ({
        name:it.name||'', nameSi:it.nameSi||'', sinhalaName:it.sinhalaName||'',
        qty:it.qty||0, lineTotal:it.lineTotal||0, yourPrice:it.yourPrice||0,
        sellingPrice:it.sellingPrice||0, discAmount:it.discAmount||0,
        costPrice:it.costPrice||0, avgBatchCost:it.avgBatchCost||0,
        allocatedCostTotal:it.allocatedCostTotal||0,
        photoURL:it.photoURL||'', uom:it.uom||'', warrantyCode:it.warrantyCode||'',
        warrantyPeriod:it.warrantyPeriod||'',
        uomFactor:it.uomFactor||1,
      })),
    }));
    localStorage.setItem(`invoices_${uid}`, JSON.stringify({ data: slim, ts: Date.now() }));
  } catch {}
};

const loadInvoiceCache = (uid) => {
  try {
    const raw = localStorage.getItem(`invoices_${uid}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > INV_CACHE_TTL) return null;
    return data;
  } catch { return null; }
};

const clearInvoiceCache = (uid) => {
  try { localStorage.removeItem(`invoices_${uid}`); } catch {}
};

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
        const scale = Math.min(800 / img.width, 1);
        canvas.width = img.width * scale; canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });

const toNum = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const R2 = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : Math.round(n * 100) / 100; };

// ✅ FIXED: Missing 'fmt' helper function defined
const fmt = (v) => R2(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (ts) => {
  if (!ts) return '-';
  try {
    const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('si-LK', { year:'numeric', month:'short', day:'numeric' });
  } catch { return '-'; }
};

const fmtTime = (ts) => {
  if (!ts) return '';
  try {
    const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('si-LK', { hour:'2-digit', minute:'2-digit' });
  } catch { return ''; }
};

const getTsMs = (ts) => {
  if (!ts) return 0;
  try {
    if (ts.seconds) return ts.seconds * 1000;
    if (ts.toDate)  return ts.toDate().getTime();
    const d = new Date(ts);
    return isNaN(d.getTime()) ? 0 : d.getTime();
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

const payIcon = (m) => ({
  cash:'💵', card:'💳', etransfer:'📱', bank_transfer:'🏦', cheque:'📄', credit:'🏦', bank:'🏦',
})[m?.toLowerCase()] || '💰';

const DEFAULT_SVG = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#f1f5f9" rx="8"/><path d="M30 65 L45 45 L55 55 L70 35 L80 65 H30 Z" fill="#cbd5e1"/><circle cx="70" cy="30" r="5" fill="#fcd34d"/></svg>')}`;

const normalizeInvoice = (raw, id, col, path) => {
  const net   = toNum(raw.netAmount  || raw.grandTotal || raw.total        || 0);
  const pay   = toNum(raw.payAmount  || raw.paidAmount || raw.paid         || 0);
  const gross = toNum(raw.grossTotal || raw.subTotal   || raw.invoiceValue || 0);
  const isDraft = ['drafts', 'invoiceDrafts'].includes(col);
  return {
    id, _col:col, _path:path, _raw:raw,
    customerName:raw.customerName||raw.customer||'', customerPhone:raw.customerPhone||raw.phone||'',
    customerId:raw.customerId||'', customerAddress:raw.customerAddress||'',
    netAmount:net, grossTotal:gross, invoiceValue:gross, payAmount:pay,
    balance:raw.balance !== undefined ? toNum(raw.balance) : net - pay,
    totalDiscount:toNum(raw.totalDiscount||raw.discount||0), billDiscount:toNum(raw.billDiscount||0),
    billDiscountPercent:toNum(raw.billDiscountPercent||0), exchangeAmount:toNum(raw.exchangeAmount||0),
    returnAmount:toNum(raw.returnAmount||0), itemCount:raw.itemCount||raw.items?.length||0,
    status:raw.status||(isDraft?'draft':'completed'), type:isDraft?'draft':'invoice',
    paymentMethod:raw.paymentMethod||'cash', mode:raw.mode||'invoice',
    createdAt:raw.createdAt||null, date:raw.date||fmtDate(raw.createdAt), time:raw.time||fmtTime(raw.createdAt),
    age:getAgeDays(raw.createdAt),
    invoiceNo:raw.invoiceNo||raw.invoiceNumber||`#${id.slice(-6).toUpperCase()}`,
    invoiceCode:raw.invoiceCode||raw.invoiceNo||`INV-${id.slice(-6).toUpperCase()}`,
    draftCode:isDraft?`DRF-${id.slice(-6).toUpperCase()}`:'-',
    rep:raw.rep||raw.salesRep||'-', branch:raw.branch||raw.branchName||'-',
    remarks:raw.remarks||raw.invoiceRemark||'',
    uid:raw.uid||raw.userId||raw.ownerId||raw.createdBy||'',
    previousOutstanding:raw.previousOutstanding !== undefined ? toNum(raw.previousOutstanding) : 0,
    newOutstanding:raw.newOutstanding !== undefined ? toNum(raw.newOutstanding) : 0,
    items: (raw.items || []).map((it) => ({
      name: it.name || '',
      nameSi: it.nameSi || it.sinhalaName || '',
      qty: toNum(it.qty || it.quantity || 1),
      lineTotal: toNum(it.lineTotal || 0),
      yourPrice: toNum(it.yourPrice || it.sellingPrice || 0),
      sellingPrice: toNum(it.sellingPrice || 0),
      discAmount: toNum(it.discAmount || 0),
      costPrice: toNum(it.costPrice || it.buyingPrice || 0),
      avgBatchCost: toNum(it.avgBatchCost || 0),
      allocatedCostTotal: toNum(it.allocatedCostTotal || 0),
      uomFactor: toNum(it.uomFactor || 1),
      photoURL: it.photoURL || '',
      uom: it.uom || '',
      warrantyCode: it.warrantyCode || '',
      warrantyPeriod: it.warrantyPeriod || '',
    })),
  };
};

const getCustomerBalanceBreakdown = (customer, invoice) => {
  if (!customer || !invoice) return null;
  if (!invoice.customerId || invoice.customerId === 'CASH_CUSTOMER') return null;
  const totalDebt       = toNum(customer.currentBalance || 0);
  const thisInvoiceDue  = invoice.balance > 0.01 ? invoice.balance : 0;
  const previousBalance = totalDebt - thisInvoiceDue;
  return {
    previousBalance, thisInvoiceDue, totalDebt,
    hasDebt:totalDebt>0.01, hasDeposit:totalDebt<-0.01, isZero:Math.abs(totalDebt)<=0.01,
  };
};

const costOf = (i) => toNum(i.costPrice||i.buyingPrice||i.unitCost||i.cost||i.avgBatchCost||i.purchasePrice||0);
const sellOf = (i) => toNum(i.yourPrice||i.sellingPrice||i.unitPrice||i.price||i.salePrice||0);

// Unit (Pcs) Profit calculation considering uomFactor and pre-calculated line cost (allocatedCostTotal)
const itemProfit = (item) => {
  const qty = toNum(item.qty || item.quantity || 1);
  const factor = Math.max(0.0001, toNum(item.uomFactor || 1));
  const sell = sellOf(item);
  const disc = toNum(item.discAmount || item.discount || 0);
  const rev = toNum(item.lineTotal) || (sell * qty - disc * qty);

  let lc = 0;
  let hasCost = false;
  let costPerUnit = 0;

  if (toNum(item.allocatedCostTotal) > 0) {
    lc = toNum(item.allocatedCostTotal);
    costPerUnit = R2(lc / qty);
    hasCost = true;
  } else {
    const baseCost = costOf(item);
    if (baseCost > 0) {
      costPerUnit = R2(baseCost / factor);
      lc = R2(costPerUnit * qty);
      hasCost = true;
    }
  }

  const lp = hasCost ? R2(rev - lc) : null;
  const mg = rev > 0 && hasCost ? (lp / rev) * 100 : null;

  return { qty, sell, cost: costPerUnit, disc, rev, lc, lp, mg, hasCost };
};

const invoiceProfit = (items) => {
  if (!Array.isArray(items)||!items.length) return { tp:0, tr:0, tc:0, mg:0, ok:false };
  let tp=0, tr=0, tc=0, ok=false;
  items.forEach((i) => { const p=itemProfit(i); tr+=p.rev; if(p.hasCost){tp+=p.lp;tc+=p.lc;ok=true;} });
  return { tp, tr, tc, mg:tr>0&&ok?(tp/tr)*100:0, ok };
};

/* ── Profit Table ── */
function ProfitTable({ items, t }) {
  const [show, setShow] = useState(false);
  if (!Array.isArray(items)||!items.length) return null;
  const s = invoiceProfit(items);
  if (!s.ok) return (<div style={{ padding:'8px 12px', background:'#fef3c7', borderRadius:8, fontSize:12, color:'#92400e', marginTop:8 }}>{t.noCostData}</div>);
  return (
    <div style={{ marginTop:10 }}>
      <button type="button" onClick={()=>setShow(!show)} style={{ width:'100%', padding:'8px 12px', borderRadius:8, border:'1px solid #e2e8f0', background:show?'#f0fdf4':'#f8fafc', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', fontWeight:700, fontSize:12 }}>
        <span>{t.profitBreakdown}</span>
        <span style={{ color:s.tp>=0?'#059669':'#dc2626', fontWeight:900 }}>Rs.{s.tp.toFixed(2)} ({s.mg.toFixed(1)}%)</span>
      </button>
      {show && (
        <div style={{ marginTop:6, background:'white', borderRadius:8, border:'1px solid #e2e8f0', overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr', background:'#f1f5f9', padding:'6px 10px', fontSize:10, fontWeight:800, color:'#475569' }}>
            <span>{t.items}</span><span style={{textAlign:'right'}}>{t.qty}</span>
            <span style={{textAlign:'right'}}>{t.cost}</span><span style={{textAlign:'right'}}>{t.revenue}</span>
            <span style={{textAlign:'right'}}>{t.totalProfit}</span>
          </div>
          {items.map((item,i)=>{const p=itemProfit(item);const c=p.lp===null?'#94a3b8':p.lp>=0?'#059669':'#dc2626';return(
            <div key={i} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr', padding:'8px 10px', borderBottom:'1px solid #f1f5f9', alignItems:'center', background:p.lp!==null&&p.lp<0?'#fef2f2':i%2===0?'white':'#fafafa' }}>
              <div><div style={{ fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name||`Item ${i+1}`}</div>{(item.nameSi||item.sinhalaName)&&<div style={{ fontSize:10, color:'#6366f1' }}>{item.nameSi||item.sinhalaName}</div>}</div>
              <div style={{textAlign:'right',fontSize:11}}>{p.qty}</div>
              <div style={{textAlign:'right',fontSize:11,color:p.hasCost?'#475569':'#94a3b8'}}>{p.hasCost?p.cost.toFixed(0):'-'}</div>
              <div style={{textAlign:'right',fontSize:11,color:'#2563eb',fontWeight:700}}>{p.rev.toFixed(0)}</div>
              <div style={{textAlign:'right',fontSize:12,fontWeight:900,color:c}}>{p.lp===null?'-':`${p.lp>=0?'':'-'}${Math.abs(p.lp).toFixed(0)}`}</div>
            </div>
          );})}
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
   MAIN COMPONENT
══════════════════════════════════════════════════════════════ */
export default function InvoiceList({ lang: initialLang = 'si' }) {
  const [lang, setLang] = useState(initialLang);

  useEffect(() => {
    try { const s = localStorage.getItem('language'); if (s === 'si' || s === 'en') setLang(s); } catch {}
    const onLang  = (e) => { if (e.detail === 'si' || e.detail === 'en') setLang(e.detail); };
    const onStore = (e) => { if (e.key === 'language' && (e.newValue === 'si' || e.newValue === 'en')) setLang(e.newValue); };
    window.addEventListener('app-language-change', onLang);
    window.addEventListener('storage', onStore);
    return () => { window.removeEventListener('app-language-change', onLang); window.removeEventListener('storage', onStore); };
  }, []);

  const t = TRANSLATIONS[lang] || TRANSLATIONS.si;
  const { user, loading: authLoading } = useUserAuth();

  const [invoices,             setInvoices            ] = useState([]);
  const [loading,              setLoading             ] = useState(true);
  const [loadMsg,              setLoadMsg             ] = useState('');
  const [search,               setSearch              ] = useState('');
  const [statusF,              setStatusF             ] = useState('all');
  
  // 🚀 OPTIMIZED: Restrict default state to 'today' for super-fast page loading & offline support
  const [dateF,                setDateF               ] = useState('today'); 
  
  const [selected,             setSelected            ] = useState(null);
  const [expanded,             setExpanded            ] = useState(null);
  const [payModal,             setPayModal            ] = useState(null);
  const [toast,                setToast               ] = useState('');
  const [fetchErr,             setFetchErr            ] = useState(false);
  const [lastFetch,            setLastFetch           ] = useState(0);
  const [dbg,                  setDbg                 ] = useState([]);
  const [visibleCount,         setVisibleCount        ] = useState(30);
  const [selectedCustomerData, setSelectedCustomerData] = useState(null);

  // ★ InvoiceOutputManager state
  const [outputInvoice, setOutputInvoice] = useState(null);

  const customerCacheRef = useRef({});

  const showToast = useCallback((m) => { setToast(m); setTimeout(() => setToast(''), 3000); }, []);

  const fetchCustomerById = useCallback(async (customerId) => {
    if (!customerId || customerId === 'CASH_CUSTOMER') return null;
    if (customerCacheRef.current[customerId]) return customerCacheRef.current[customerId];
    try {
      const snap = await getDoc(doc(db, 'customers', customerId));
      if (!snap.exists()) return null;
      const data = { id: snap.id, ...snap.data() };
      customerCacheRef.current[customerId] = data;
      return data;
    } catch { return null; }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!selected?.customerId || selected.customerId === 'CASH_CUSTOMER') { setSelectedCustomerData(null); return; }
    fetchCustomerById(selected.customerId).then((c) => { if (!cancelled) setSelectedCustomerData(c); });
    return () => { cancelled = true; };
  }, [selected?.customerId, fetchCustomerById]);

  useEffect(() => { setVisibleCount(30); }, [search, statusF, dateF]);

  const fetchInvoices = useCallback(async (forceRefresh = false, showSpinner = true) => {
    if (!user?.uid) { setLoading(false); return; }
    const uid = user.uid;
    
    // 🚀 OFFLINE & INSTANT SYNC: Load immediately from persistent localStorage (No loading spinner shown)
    if (!forceRefresh) {
      const cached = loadInvoiceCache(uid);
      if (cached && cached.length > 0) { 
        setInvoices(cached); 
        setLastFetch(Date.now()); 
        setLoading(false); 
        return; 
      }
    }
    
    if (showSpinner) { setLoading(true); setLoadMsg(t.loadingAll); }
    setFetchErr(false);
    
    try {
      const seen = new Map(), log = [];
      
      // Calculate optimized start date
      const todayStartMs = getDateStart(dateF);
      const startTimestamp = todayStartMs > 0 ? Timestamp.fromMillis(todayStartMs) : null;

      // Plan queries (Applying today's limits dynamically where supported)
      const primaryPlans = INVOICE_COLLECTIONS.map((col) => ({ col, field: 'uid' }));
      
      const primaryResults = await Promise.allSettled(primaryPlans.map(async (p) => {
        let q;
        // 🚀 Index-Free Query fallback wrapper
        try {
          if (startTimestamp) {
            q = query(
              collection(db, p.col),
              where(p.field, '==', uid),
              where('createdAt', '>=', startTimestamp)
            );
          } else {
            q = query(collection(db, p.col), where(p.field, '==', uid));
          }
          return await getDocs(q);
        } catch (queryErr) {
          console.warn(`Firestore optimization query failed for ${p.col}, falling back to client-side filter:`, queryErr.message);
          // Fallback to fetch only uid (100% index-free safe, no composite indexes required)
          q = query(collection(db, p.col), where(p.field, '==', uid));
          return await getDocs(q);
        }
      }));

      primaryResults.forEach((res, i) => {
        const { col, field } = primaryPlans[i];
        if (res.status === 'rejected') { 
          const c = res.reason?.code || ''; 
          if (!c.includes('permission') && !c.includes('indexes')) {
            log.push(`${col}.${field}: ${c}`); 
          }
          return; 
        }
        if (res.value.empty) return;
        log.push(`${col}.${field}: ${res.value.size}`);
        res.value.docs.forEach((d) => { 
          const p = d.ref.path; 
          if (!seen.has(p)) seen.set(p, normalizeInvoice(d.data(), d.id, d.ref.parent.id, p)); 
        });
      });

      if (seen.size === 0) {
        const fbPlans = []; INVOICE_COLLECTIONS.forEach((col) => ['userId','ownerId','createdBy'].forEach((field) => fbPlans.push({ col, field })));
        const fbResults = await Promise.allSettled(fbPlans.map((p) => getDocs(query(collection(db, p.col), where(p.field, '==', uid)))));
        fbResults.forEach((res, i) => {
          const { col, field } = fbPlans[i];
          if (res.status !== 'fulfilled' || res.value.empty) return;
          log.push(`fb ${col}.${field}: ${res.value.size}`);
          res.value.docs.forEach((d) => { const p = d.ref.path; if (!seen.has(p)) seen.set(p, normalizeInvoice(d.data(), d.id, d.ref.parent.id, p)); });
        });
      }
      
      const list = Array.from(seen.values()).sort((a, b) => getTsMs(b.createdAt) - getTsMs(a.createdAt));
      setDbg(log); 
      setInvoices(list); 
      setLastFetch(Date.now()); 
      saveInvoiceCache(uid, list);
    } catch (e) {
      console.error('Fetch error:', e); setFetchErr(true);
      const cached = loadInvoiceCache(uid);
      if (cached && cached.length > 0) { setInvoices(cached); setLastFetch(Date.now()); }
    } finally { setLoading(false); setLoadMsg(''); }
  }, [user?.uid, dateF, t.loadingAll]);

  useEffect(() => {
    if (authLoading || !user?.uid) return;
    const cached = loadInvoiceCache(user.uid);
    if (cached && cached.length > 0) { 
      setInvoices(cached); 
      setLoading(false); 
      setLastFetch(Date.now()); 
      // Background fetch quietly to update the local store (Zero latency experience)
      fetchInvoices(false, false); 
    }
    else {
      fetchInvoices();
    }
  }, [authLoading, user?.uid, fetchInvoices]);

  const handleDelete = useCallback(async (inv) => {
    if (!window.confirm(t.deleteConfirm)) return;
    try {
      await deleteDoc(doc(db, inv._path));
      showToast(t.deleted); clearInvoiceCache(user?.uid);
      setInvoices((p) => p.filter((i) => i._path !== inv._path));
      if (selected?._path === inv._path) setSelected(null);
    } catch (e) { showToast(`Error: ${e.message}`); }
  }, [selected, showToast, t.deleteConfirm, t.deleted, user?.uid]);

  const openPay = useCallback(async (inv, e) => {
    e?.stopPropagation();
    const customer = await fetchCustomerById(inv.customerId);
    setPayModal({ invoice: inv, customer });
  }, [fetchCustomerById]);

  // ★ Open InvoiceOutputManager with mapped financial attributes
  const openOutput = useCallback(async (inv, e) => {
    e?.stopPropagation();
    
    const outputInv = {
      ...inv,
      customerAddress: inv.customerAddress || '',
      grossTotal:      toNum(inv.grossTotal || inv.invoiceValue || 0),
      totalDiscount:   toNum(inv.totalDiscount || 0),
      billDiscount:    toNum(inv.billDiscount || 0),
      billDiscountPercent: toNum(inv.billDiscountPercent || 0),
      exchangeAmount:  toNum(inv.exchangeAmount || 0),
      netAmount:       toNum(inv.netAmount || 0),
      payAmount:       toNum(inv.payAmount || 0),
      balance:         toNum(inv.balance || 0),
      paymentMethod:   inv.paymentMethod || 'cash',
      remarks:         inv.remarks || '',
      previousOutstanding: toNum(inv.previousOutstanding || 0),
      newOutstanding:      toNum(inv.newOutstanding || 0),
      items: (inv.items || []).map(it => ({
        name: it.name || '',
        nameSi: it.nameSi || it.sinhalaName || '',
        qty: toNum(it.qty || it.quantity || 1),
        sellingPrice: toNum(it.sellingPrice || it.unitPrice || 0),
        yourPrice: toNum(it.yourPrice || it.unitPrice || 0),
        lineTotal: toNum(it.lineTotal || (toNum(it.yourPrice || it.unitPrice || 0) * toNum(it.qty || 1))),
        uom: it.uom || '',
        warrantyCode: it.warrantyCode || '',
        warrantyPeriod: it.warrantyPeriod || '',
      }))
    };
    setOutputInvoice(outputInv);
  }, []);

  const handleCopyPortalLink = useCallback(async (inv) => {
    const c = await fetchCustomerById(inv.customerId);
    if (!c?.portalAccessKey) { showToast(t.noPortalKey); return; }
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(`${window.location.origin}/portal/${c.portalAccessKey}`);
      showToast(t.linkCopied);
    }
  }, [fetchCustomerById, showToast, t.noPortalKey, t.linkCopied]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    return invoices.filter((inv) => {
      if (term) {
        const txt = [inv.customerName, inv.invoiceNo, inv.invoiceCode, inv.id, inv.customerPhone].filter(Boolean).join(' ').toLowerCase();
        if (!txt.includes(term)) return false;
      }
      if      (statusF === 'completed') { if (inv.status === 'draft') return false; }
      else if (statusF === 'draft')     { if (inv.status !== 'draft') return false; }
      else if (statusF === 'paid')      { if (!(inv.payAmount >= inv.netAmount - 0.01 && inv.netAmount > 0)) return false; }
      else if (statusF === 'unpaid')    { if (inv.payAmount >= inv.netAmount - 0.01) return false; }
      if (dateF !== 'allTime' && getTsMs(inv.createdAt) < getDateStart(dateF)) return false;
      return true;
    });
  }, [invoices, search, statusF, dateF]);

  const visibleInvoices = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  // Calculate Total Sales, Total Cash Paid, Total Credit Due, and Net Profit of filtered invoices accurately (excluding Drafts)
  const stats = useMemo(() => {
    const completedInvoices = filtered.filter(inv => inv.status !== 'draft');
    
    let totalSales = 0;
    let totalPaid = 0;
    let totalBalance = 0;
    let totalProfit = 0;
    let hasProfitData = false;

    completedInvoices.forEach(inv => {
      totalSales += inv.netAmount;
      totalPaid += inv.payAmount;
      totalBalance += (inv.balance > 0.01 ? inv.balance : 0);
      
      const p = invoiceProfit(inv.items || []);
      if (p.ok) {
        totalProfit += p.tp;
        hasProfitData = true;
      }
    });

    return {
      n: filtered.length,
      totalSales,
      totalPaid,
      totalBalance,
      totalProfit,
      hasProfitData
    };
  }, [filtered]);

  const profits = useMemo(() => {
    const m = {};
    visibleInvoices.forEach((inv) => { m[inv._path] = invoiceProfit(inv.items || []); });
    return m;
  }, [visibleInvoices]);

  const badge = (inv) => {
    if (inv.status === 'draft') return { bg:'#fef3c7', cl:'#92400e', lb:t.drafts,  ac:'#f59e0b' };
    if (inv.netAmount <= 0 || inv.payAmount >= inv.netAmount - 0.01) return { bg:'#dcfce7', cl:'#166534', lb:t.paid,    ac:'#22c55e' };
    if (inv.payAmount > 0)                                            return { bg:'#fed7aa', cl:'#9a3412', lb:t.partial, ac:'#f97316' };
    return { bg:'#fecaca', cl:'#991b1b', lb:t.unpaid, ac:'#ef4444' };
  };

  if (authLoading || loading) return (
    <div style={{ textAlign:'center', padding:60, color:'#94a3b8' }}>
      <div style={{ fontSize:40, marginBottom:10 }}>⏳</div>
      <div style={{ fontSize:16, fontWeight:600, color:'#475569', marginBottom:6 }}>{t.loading}</div>
      {loadMsg && <div style={{ fontSize:13, color:'#94a3b8' }}>{loadMsg}</div>}
    </div>
  );

  if (!user?.uid) return <div style={{ textAlign:'center', padding:60, color:'#64748b' }}>Login required</div>;

  /* ── DETAIL VIEW ── */
  if (selected) {
    const customer = selectedCustomerData;
    const bal = getCustomerBalanceBreakdown(customer, selected);
    return (
      <div style={{ padding:12, backgroundColor:'#f8fafc', minHeight:'100vh', paddingBottom:80 }}>

        {/* ★ InvoiceOutputManager */}
        {outputInvoice && (
          <InvoiceOutputManager
            invoice={outputInvoice}
            initialMode="whatsapp"
            onClose={() => setOutputInvoice(null)}
          />
        )}

        {payModal && (
          <PaymentModal invoice={payModal.invoice} customer={payModal.customer} user={user} t={t}
            onClose={() => setPayModal(null)}
            onSuccess={() => { showToast(t.paymentSuccess); setPayModal(null); clearInvoiceCache(user?.uid); fetchInvoices(true); }}
          />
        )}

        {toast && <div style={{ position:'fixed', top:20, left:'50%', transform:'translateX(-50%)', background:'#334155', color:'#fff', padding:'10px 20px', borderRadius:8, zIndex:9999, fontSize:14 }}>{toast}</div>}

        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, flexWrap:'wrap' }}>
          <button type="button" onClick={() => { setSelected(null); setSelectedCustomerData(null); }} style={{ background:'#f1f5f9', border:'none', padding:'8px 14px', borderRadius:8, fontSize:15, cursor:'pointer', fontWeight:'bold' }}>{t.back}</button>
          <h2 style={{ margin:0, fontSize:18, color:'#0f172a', flex:1 }}>{selected.invoiceCode}</h2>
          {/* ★ Send button in detail view */}
          <button type="button" onClick={(e) => openOutput(selected, e)} style={{ background:'linear-gradient(135deg,#6366f1,#4f46e5)', color:'white', border:'none', padding:'8px 14px', borderRadius:8, fontWeight:800, fontSize:13, cursor:'pointer' }}>
            {t.sendBill}
          </button>
          <button type="button" onClick={() => handleDelete(selected)} style={S.ab('#ef4444')}>🗑️</button>
        </div>

        {selected.status !== 'draft' && selected.balance > 0.01 && (
          <button type="button" onClick={() => openPay(selected)} style={{ width:'100%', padding:'13px 18px', marginBottom:12, background:'linear-gradient(135deg,#16a34a,#15803d)', color:'white', border:'none', borderRadius:12, fontWeight:800, fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            {t.collectPayment}
            <span style={{ background:'rgba(255,255,255,0.2)', padding:'2px 10px', borderRadius:6 }}>Rs.{selected.balance.toFixed(2)}</span>
          </button>
        )}

        <div style={{ background:'linear-gradient(135deg,#eff6ff,#dbeafe)', borderRadius:12, padding:14, marginBottom:14, border:'1px solid #bfdbfe' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
            <div>
              <div style={{ fontSize:11, color:'#64748b' }}>{t.invoiceCode}</div>
              <div style={{ fontSize:16, fontWeight:'bold', color:'#1e40af', fontFamily:'monospace' }}>{selected.invoiceCode}</div>
            </div>
            {(() => { const b = badge(selected); return <span style={{ padding:'4px 10px', borderRadius:16, fontSize:12, fontWeight:'bold', background:b.bg, color:b.cl }}>{b.lb}</span>; })()}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, fontSize:13 }}>
            <div>{selected.date} {selected.time}</div>
            <div style={{ color:getAgeColor(selected.age), fontWeight:'bold' }}>{selected.age} {t.days}</div>
            <div>{selected.customerName || t.cashCustomer}</div>
            <div>{selected.customerPhone || '-'}</div>
            <div>{selected.branch}</div>
            <div>{selected.rep}</div>
          </div>
        </div>

        {selected.items?.length > 0 && (
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:14, fontWeight:'bold', color:'#334155', marginBottom:8 }}>{t.items} ({selected.items.length})</div>
            <div style={{ background:'white', borderRadius:10, border:'1px solid #e2e8f0', overflow:'hidden' }}>
              {selected.items.map((item, idx) => {
                const p = itemProfit(item), disc = toNum(item.discAmount||item.discount||0);
                return (
                  <div key={idx} style={{ padding:10, display:'flex', alignItems:'center', gap:10, borderBottom:idx<selected.items.length-1?'1px solid #f1f5f9':'none', background:p.lp!==null&&p.lp<0?'#fef2f2':'white' }}>
                    <img src={item.photoURL||DEFAULT_SVG} alt="" onError={(e)=>{e.target.src=DEFAULT_SVG;}} style={{ width:40, height:40, borderRadius:6, objectFit:'cover', background:'#f1f5f9', flexShrink:0 }}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, fontSize:14, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</div>
                      {(item.nameSi||item.sinhalaName)&&<div style={{ fontSize:12, color:'#1e40af' }}>{item.nameSi||item.sinhalaName}</div>}
                      <div style={{ fontSize:12, color:'#64748b' }}>{item.qty} x Rs.{sellOf(item).toFixed(2)}{item.uom&&item.uom!=='unit'?` ${item.uom}`:''}</div>
                      {disc>0&&<div style={{ fontSize:11, color:'#ef4444', marginTop:2 }}>-Rs.{disc.toFixed(2)}</div>}
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <div style={{ fontWeight:'bold', fontSize:15, color:'#1e40af' }}>{toNum(item.lineTotal).toFixed(2)}</div>
                      {p.hasCost&&<div style={{ fontSize:11, fontWeight:700, color:p.lp>=0?'#059669':'#dc2626' }}>{p.lp>=0?'+':''}Rs.{p.lp?.toFixed(2)}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
            <ProfitTable items={selected.items} t={t}/>
          </div>
        )}

        <div style={{ background:'white', borderRadius:10, padding:14, border:'1px solid #e2e8f0', marginBottom:14 }}>
          {[
            { l:t.invoiceValue,  v:(i)=>i.invoiceValue,   show:()=>true },
            { l:t.totalDiscount, v:(i)=>i.totalDiscount,  show:(i)=>i.totalDiscount>0,  c:'#ef4444', px:'-' },
            { l:t.billDiscount,  v:(i)=>i.billDiscount,   show:(i)=>i.billDiscount>0,   c:'#f59e0b', px:'-' },
            { l:t.exchange,      v:(i)=>i.exchangeAmount, show:(i)=>i.exchangeAmount>0, c:'#8b5cf6', px:'-' },
            { l:t.returnAmount,  v:(i)=>i.returnAmount,   show:(i)=>i.returnAmount>0,   c:'#dc2626', px:'-' },
          ].filter((r)=>r.show(selected)).map((row,i)=>(
            <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:14, marginBottom:5, color:row.c||'#475569' }}>
              <span>{row.l}</span><span>{row.px||''}Rs.{row.v(selected).toFixed(2)}</span>
            </div>
          ))}
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:17, fontWeight:'bold', borderTop:'2px solid #e2e8f0', paddingTop:10, marginTop:5 }}>
            <span>{t.netAmount}</span><span>Rs. {selected.netAmount.toFixed(2)}</span>
          </div>
        </div>

        {selected.remarks&&<div style={{ background:'white', borderRadius:10, padding:12, border:'1px solid #e2e8f0', marginBottom:14 }}><div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>{t.remark}</div><div style={{ fontSize:14, color:'#334155' }}>{selected.remarks}</div></div>}

        <div style={{ background:'white', borderRadius:10, padding:14, border:'1px solid #e2e8f0', marginBottom:14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:14, marginBottom:6 }}><span>{t.paymentMethod}</span><span style={{ fontWeight:600 }}>{payIcon(selected.paymentMethod)} {(selected.paymentMethod||'cash').toUpperCase()}</span></div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:14, marginBottom:6 }}><span>{t.paidAmount}</span><span style={{ fontWeight:600, color:'#16a34a' }}>Rs. {selected.payAmount.toFixed(2)}</span></div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:16, fontWeight:'bold', padding:'10px', borderRadius:8, background:selected.balance<=0.01?'#f0fdf4':'#fef2f2', color:selected.balance<=0.01?'#16a34a':'#dc2626' }}><span>{t.balance}</span><span>Rs. {selected.balance.toFixed(2)}</span></div>
        </div>

        {bal&&(
          <div style={{ background:bal.hasDebt?'#fef2f2':'#f0fdf4', border:`2px solid ${bal.hasDebt?'#fecaca':'#bbf7d0'}`, borderRadius:12, padding:14, marginBottom:14 }}>
            <div style={{ fontSize:13, fontWeight:800, color:'#334155', marginBottom:8 }}>{t.totalDebt}</div>
            {Math.abs(bal.previousBalance)>0.01&&<div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:4, color:'#64748b' }}><span>{t.previousBalance}</span><span>Rs.{bal.previousBalance.toFixed(2)}</span></div>}
            {bal.thisInvoiceDue>0&&<div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:4, color:'#dc2626' }}><span>{t.thisBill}</span><span>Rs.{bal.thisInvoiceDue.toFixed(2)}</span></div>}
            <div style={{ borderTop:'1px solid #e2e8f0', paddingTop:8, marginTop:6, display:'flex', justifyContent:'space-between', fontSize:17, fontWeight:900, color:bal.hasDebt?'#dc2626':bal.hasDeposit?'#16a34a':'#059669' }}>
              <span>{bal.hasDebt?t.totalDebt:bal.hasDeposit?t.deposit:t.noDebt}</span>
              <span>{bal.hasDebt?`Rs.${bal.totalDebt.toFixed(2)}`:bal.hasDeposit?`Rs.${Math.abs(bal.totalDebt).toFixed(2)}`:'OK'}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── LIST VIEW ── */
  return (
    <div style={{ padding:10, backgroundColor:'#f8fafc', minHeight:'100vh', paddingBottom:80 }}>

      {/* ★ InvoiceOutputManager */}
      {outputInvoice && (
        <InvoiceOutputManager
          invoice={outputInvoice}
          initialMode="whatsapp"
          onClose={() => setOutputInvoice(null)}
        />
      )}

      {payModal && (
        <PaymentModal invoice={payModal.invoice} customer={payModal.customer} user={user} t={t}
          onClose={() => setPayModal(null)}
          onSuccess={() => { showToast(t.paymentSuccess); setPayModal(null); clearInvoiceCache(user?.uid); fetchInvoices(true); }}
        />
      )}

      {toast && <div style={{ position:'fixed', top:20, left:'50%', transform:'translateX(-50%)', background:'#334155', color:'#fff', padding:'10px 20px', borderRadius:8, zIndex:9999, fontSize:14 }}>{toast}</div>}

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
        <div>
          <h2 style={{ margin:0, fontSize:22, color:'#0f172a' }}>{t.title}</h2>
          <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>{t.invoiceCount}: {invoices.length}</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button type="button" onClick={() => { clearInvoiceCache(user?.uid); fetchInvoices(true); }} style={{ padding:'8px 14px', background:'#f1f5f9', color:'#374151', border:'1px solid #e2e8f0', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:13 }}>Refresh</button>
          <Link href="/pos" prefetch={false} style={{ padding:'8px 16px', background:'#3b82f6', color:'white', borderRadius:8, fontWeight:'bold', fontSize:14, textDecoration:'none', display:'inline-flex', alignItems:'center' }}>{t.newSale}</Link>
        </div>
      </div>

      {dbg.length > 0 && (
        <details style={{ marginBottom:10, background:'#fefce8', border:'1px solid #fde047', borderRadius:8, padding:'8px 10px' }}>
          <summary style={{ cursor:'pointer', fontWeight:700, fontSize:11, color:'#854d0e' }}>{t.debugTitle}: {invoices.length} loaded</summary>
          <pre style={{ fontSize:10, color:'#713f12', marginTop:6, whiteSpace:'pre-wrap', fontFamily:'monospace', maxHeight:150, overflowY:'auto' }}>{`UID: ${user?.uid}\n${dbg.join('\n')}\nTOTAL: ${invoices.length}`}</pre>
        </details>
      )}

      {lastFetch > 0 && <div style={{ fontSize:11, color:'#94a3b8', textAlign:'right', marginBottom:8 }}>{new Date(lastFetch).toLocaleTimeString()} | {invoices.length}</div>}

      {fetchErr && (
        <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'12px 14px', marginBottom:14, display:'flex', gap:10, alignItems:'center' }}>
          <span style={{ fontSize:24 }}>⚠️</span>
          <div style={{ flex:1 }}><div style={{ fontWeight:800, color:'#dc2626' }}>{t.quotaError}</div><div style={{ fontSize:12, color:'#991b1b' }}>{t.quotaDesc}</div></div>
          <button type="button" onClick={() => fetchInvoices(true)} style={{ padding:'8px 14px', background:'#dc2626', color:'white', border:'none', borderRadius:8, cursor:'pointer', fontWeight:700 }}>{t.retry}</button>
        </div>
      )}

      {/* ✅ Stats Cards Panel with Grid auto-fitting for Desktop & Mobile layout */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:8, marginBottom:12 }}>
        {[
          { l:`${t.invoiceCount}`, v:stats.n, bg:'#eff6ff', bc:'#3b82f6', tc:'#1e40af' },
          { l:t.totalSales,        v:`Rs.${fmt(stats.totalSales)}`, bg:'#f0fdf4', bc:'#22c55e', tc:'#15803d' },
          { l:t.totalPaid,         v:`Rs.${fmt(stats.totalPaid)}`, bg:'#f0fdf4', bc:'#16a34a', tc:'#166534' },
          { l:t.totalBalance,      v:`Rs.${fmt(stats.totalBalance)}`, bg:stats.totalBalance>0.5?'#fef2f2':'#f0fdf4', bc:stats.totalBalance>0.5?'#ef4444':'#22c55e', tc:stats.totalBalance>0.5?'#dc2626':'#16a34a' },
          { l:t.totalProfit,       v:`Rs.${fmt(stats.totalProfit)}`, bg:stats.totalProfit>=0?'#f5f3ff':'#fef2f2', bc:stats.totalProfit>=0?'#8b5cf6':'#ef4444', tc:stats.totalProfit>=0?'#6d28d9':'#dc2626' },
        ].map((s,i)=>(
          <div key={i} style={{ background:s.bg, padding:10, borderRadius:8, borderLeft:`3px solid ${s.bc}`, borderTop:'1px solid #f1f5f9', borderRight:'1px solid #f1f5f9', borderBottom:'1px solid #f1f5f9' }}>
            <div style={{ fontSize:11, color:'#64748b', fontWeight:'bold' }}>{s.l}</div>
            <div style={{ fontSize:15, fontWeight:900, color:s.tc, marginTop:4 }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Date filter */}
      <div style={{ display:'flex', marginBottom:8, background:'#f1f5f9', borderRadius:8, overflow:'hidden' }}>
        {['today','thisWeek','thisMonth','allTime'].map((f)=>(
          <button key={f} type="button" onClick={()=>setDateF(f)} style={{ flex:1, padding:'10px 2px', fontSize:12, fontWeight:'bold', border:'none', cursor:'pointer', background:dateF===f?'#3b82f6':'transparent', color:dateF===f?'white':'#64748b' }}>{t[f]}</button>
        ))}
      </div>

      {/* Status filter */}
      <div style={{ display:'flex', marginBottom:8, background:'#f1f5f9', borderRadius:8, overflow:'hidden' }}>
        {[{k:'all',l:`${t.all} (${invoices.length})`},{k:'completed',l:t.completed},{k:'paid',l:t.paid},{k:'unpaid',l:t.unpaid},{k:'draft',l:t.drafts}].map((tab)=>(
          <button key={tab.k} type="button" onClick={()=>setStatusF(tab.k)} style={{ flex:1, padding:'8px 2px', fontSize:11, fontWeight:'bold', border:'none', cursor:'pointer', background:statusF===tab.k?'white':'transparent', color:statusF===tab.k?'#3b82f6':'#64748b', boxShadow:statusF===tab.k?'0 1px 4px rgba(0,0,0,0.08)':'none', borderRadius:statusF===tab.k?6:0 }}>{tab.l}</button>
        ))}
      </div>

      {/* Search */}
      <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder={t.search} style={{ width:'100%', padding:13, borderRadius:8, border:'1px solid #e2e8f0', fontSize:15, boxSizing:'border-box', marginBottom:8, background:'white', outline:'none' }}/>
      <div style={{ fontSize:12, color:'#94a3b8', marginBottom:10, textAlign:'right' }}>{filtered.length} / {invoices.length}</div>

      {filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:40, color:'#94a3b8', background:'white', borderRadius:10, border:'1px solid #e2e8f0' }}>
          <div style={{ fontSize:50, marginBottom:15 }}>📭</div>
          <div style={{ fontSize:15 }}>{t.noData}</div>
          <button type="button" onClick={()=>fetchInvoices(true)} style={{ marginTop:14, padding:'10px 24px', background:'#3b82f6', color:'white', border:'none', borderRadius:8, cursor:'pointer', fontWeight:700 }}>Refresh</button>
        </div>
      ) : (
        <>
          {visibleInvoices.map((inv) => {
            const b=badge(inv), rk=inv._path, isExp=expanded===rk;
            const isDue=inv.balance>0.01&&inv.status!=='draft';
            const ps=profits[rk], sav=inv.totalDiscount+inv.billDiscount;

            return (
              <div key={rk} style={{ background:'white', borderRadius:10, marginBottom:8, border:'1px solid #e2e8f0', overflow:'hidden', borderLeft:`4px solid ${b.ac}` }}>
                <div onClick={()=>setExpanded(isExp?null:rk)} style={{ padding:12, cursor:'pointer' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:5 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:'bold', fontSize:16, color:'#0f172a', marginBottom:2 }}>{inv.customerName||t.cashCustomer}</div>
                      <div style={{ fontSize:12, color:'#94a3b8', fontFamily:'monospace' }}>{inv.invoiceCode}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontWeight:'bold', fontSize:18, color:'#1e40af' }}>Rs.{inv.netAmount.toFixed(0)}</div>
                      {ps?.ok&&<div style={{ fontSize:11, fontWeight:700, color:ps.tp>=0?'#059669':'#dc2626' }}>Rs.{ps.tp.toFixed(0)}</div>}
                      <span style={{ fontSize:11, padding:'2px 8px', borderRadius:10, background:b.bg, color:b.cl, fontWeight:'bold' }}>{b.lb}</span>
                    </div>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:4 }}>
                    <div style={{ display:'flex', gap:8, fontSize:12, color:'#64748b', flexWrap:'wrap', alignItems:'center' }}>
                      <span>{inv.date}</span><span>{inv.itemCount} items</span><span>{payIcon(inv.paymentMethod)}</span>
                      {sav>0&&<span style={{ fontSize:10, color:'#d97706', fontWeight:'bold' }}>-{sav.toFixed(0)}</span>}
                      {isDue&&<span style={{ fontSize:10, color:'#dc2626', fontWeight:800, background:'#fef2f2', padding:'2px 6px', borderRadius:5, border:'1px solid #fecaca' }}>Rs.{inv.balance.toFixed(0)}</span>}
                    </div>
                    <span style={{ fontSize:13, color:'#6366f1', fontWeight:600 }}>{isExp?'A':'V'}</span>
                  </div>
                </div>

                {isExp && (
                  <div style={{ borderTop:'1px solid #e2e8f0', padding:12, background:'#f8fafc' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6, marginBottom:10 }}>
                      {[
                        { l:t.netAmount,  v:`Rs.${inv.netAmount.toFixed(2)}`,  c:'#1e40af' },
                        { l:t.paidAmount, v:`Rs.${inv.payAmount.toFixed(2)}`,  c:'#16a34a' },
                        { l:t.balance,    v:`Rs.${inv.balance.toFixed(2)}`,    c:inv.balance<=0.01?'#16a34a':'#dc2626' },
                      ].map((r,i)=>(
                        <div key={i} style={{ background:'white', padding:'6px 8px', borderRadius:8, border:'1px solid #e2e8f0', textAlign:'center' }}>
                          <div style={{ fontSize:10, color:'#94a3b8' }}>{r.l}</div>
                          <div style={{ fontSize:12, fontWeight:'bold', color:r.c }}>{r.v}</div>
                        </div>
                      ))}
                    </div>

                    {/* Action buttons */}
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
                      <button type="button" onClick={(e)=>{e.stopPropagation();setSelected(inv);}} style={S.ac('#6366f1')}>
                        <span style={{ fontSize:18 }}>👁️</span><span style={{ fontSize:9 }}>{t.viewDetails}</span>
                      </button>

                      {/* Send Bill button */}
                      <button type="button" onClick={(e)=>openOutput(inv,e)} style={S.ac('#3b82f6')}>
                        <span style={{ fontSize:18 }}>📤</span><span style={{ fontSize:9 }}>{t.sendBill}</span>
                      </button>

                      <button type="button" onClick={(e)=>{e.stopPropagation();handleDelete(inv);}} style={S.ac('#ef4444')}>
                        <span style={{ fontSize:18 }}>🗑️</span><span style={{ fontSize:9 }}>{t.delete}</span>
                      </button>

                      {isDue ? (
                        <button type="button" onClick={(e)=>openPay(inv,e)} style={{...S.ac('#16a34a'),background:'#f0fdf4',border:'1.5px solid #16a34a'}}>
                          <span style={{ fontSize:18 }}>💰</span><span style={{ fontSize:9 }}>{t.collectPayment}</span>
                        </button>
                      ) : (
                        <button type="button" onClick={(e)=>{e.stopPropagation();handleCopyPortalLink(inv);}} style={S.ac('#10b981')}>
                          <span style={{ fontSize:18 }}>🔗</span><span style={{ fontSize:9 }}>{t.portalLink}</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length > visibleCount && (
            <div style={{ textAlign:'center', marginTop:10, marginBottom:20 }}>
              <button type="button" onClick={()=>setVisibleCount((p)=>p+30)} style={{ padding:'12px 24px', background:'#e2e8f0', color:'#334155', border:'none', borderRadius:10, cursor:'pointer', fontWeight:700, fontSize:14 }}>
                {t.loadMore} ({filtered.length - visibleCount})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const S = {
  ab:(bg)=>({ background:bg, color:'white', border:'none', borderRadius:6, width:34, height:34, fontSize:15, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }),
  ac:(bg)=>({ background:'white', border:`1px solid ${bg}33`, borderRadius:8, padding:'7px 4px', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:2, color:bg, fontWeight:'bold' }),
  ov:{ position:'fixed', inset:0, zIndex:99999, background:'rgba(15,23,42,0.75)', backdropFilter:'blur(4px)', display:'flex', alignItems:'flex-end', justifyContent:'center' },
  mb:{ position:'relative', width:'100%', maxWidth:480, background:'white', borderTopLeftRadius:20, borderTopRightRadius:20, boxShadow:'0 -8px 32px rgba(0,0,0,0.2)' },
  ls:{ display:'block', fontWeight:700, fontSize:13, color:'#334155', marginBottom:5 },
  greenBtn:{ width:'100%', padding:13, background:'#16a34a', color:'white', border:'none', borderRadius:10, fontWeight:800, fontSize:16, cursor:'pointer' },
};