'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '@/shared/firebase-config';
import { useUserAuth } from '@/context/UserContext';
import {
  collection, query, where, getDocs,
  doc, getDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';

const POS_BASE = (process.env.NEXT_PUBLIC_CATALOG_URL || 'https://pos-catalog-gold.vercel.app').replace(/\/$/, '');
const getPortalLink = (c) => { const k = c?.portalAccessKey || ''; return k ? `${POS_BASE}/portal/${k}` : ''; };

const R2 = (v) => { const n = parseFloat(String(v ?? 0).replace(/,/g, '')); return (isNaN(n)||!isFinite(n)) ? 0 : Math.round(n*100)/100; };
const fmt = (v) => R2(v).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
const fmtDate = (v) => { if (!v) return '-'; try { const d = v?.toDate ? v.toDate() : new Date(v); return isNaN(d.getTime()) ? '-' : d.toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }); } catch { return '-'; } };
const formatPhoneWA = (p) => { if (!p) return ''; let c=String(p).replace(/\s/g,''); if(c.startsWith('+'))return c.substring(1); if(c.startsWith('0'))return '94'+c.substring(1); if(c.startsWith('7')&&c.length===9)return '94'+c; return c; };
const formatPhoneSMS = (p) => { if (!p) return ''; let c=String(p).replace(/[^\d+]/g,''); if(!c.startsWith('+')&&!c.startsWith('0'))c='+94'+c; return c; };
const esc = (v) => String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const getSMSCount = (m) => { const u=/[^\u0000-\u007F]/.test(m); const ps=u?70:160; return { chars:m.length, perSMS:ps, parts:Math.ceil(m.length/ps) }; };

/* ══════════════════════════════════════════
   DOC TYPE DETECTORS
══════════════════════════════════════════ */
const isReturnDoc = (inv) => inv?._docType === 'return';
const isReceiptDoc = (inv) => !!inv?._isReceipt;
const isAppliedInvoicePayment = (inv) => Array.isArray(inv?.appliedInvoices) && inv.appliedInvoices.length > 0;
const isPortalInvoicePayment = (inv) => inv?.type === 'invoicePayment' || inv?.source === 'customer_portal';

const getReturnSettlementInfo = (inv) => {
  const m=inv?.refundMethod||'cash', t=R2(inv?.netAmount);
  return {
    method: m,
    cashAmt: R2(inv?.refundCashAmount ?? (m==='cash' ? (inv?.payAmount??t) : 0)),
    creditAmt: R2(inv?.creditAdjustedAmount ?? (m==='credit' ? t : 0)),
    exchangeAmt: R2(inv?.exchangeValueAmount ?? (m==='exchange' ? t : 0)),
  };
};

/* ══════════════════════════════════════════
   ★★★ BALANCE SNAPSHOT VALIDATOR ★★★
   Checks if stored previousOutstanding/newOutstanding are real values
   Returns false for: null, undefined, NaN, or both-zero placeholder
══════════════════════════════════════════ */
const hasStoredBalanceSnapshot = (invoice) => {
  const prev = invoice?.previousOutstanding;
  const next = invoice?.newOutstanding;

  // Must be actual numbers
  const hasPrev = prev !== undefined && prev !== null && !Number.isNaN(Number(prev));
  const hasNext = next !== undefined && next !== null && !Number.isNaN(Number(next));

  if (!hasPrev || !hasNext) return false;

  const p = R2(prev);
  const n = R2(next);

  // Both 0 = likely placeholder / unset — let fallback work
  if (p === 0 && n === 0) return false;

  return true;
};

/* ══════════════════════════════════════════
   ★★★ OUTSTANDING INFO — All doc types ★★★
══════════════════════════════════════════ */
const getOutstandingInfo = (invoice, customer) => {
  const dbBal = R2(customer?.currentBalance ?? 0);
  const empty = {
    creditDue:0, isCreditSale:false,
    isReturnCreditAdj:false, returnCreditAmount:0,
    previousBalance:0, newBalance:0,
    isReceipt:false, isPayment:false, isCredit:false,
    isInvoiceSettlement:false, settledAmount:0,
  };

  /* ── PORTAL / INVOICE PAYMENT ── */
  if (isPortalInvoicePayment(invoice)) {
    const rows = Array.isArray(invoice?.appliedInvoices) ? invoice.appliedInvoices : [];
    const settled = invoice?.amount != null
      ? R2(invoice.amount)
      : R2(rows.reduce((s, r) => s + R2(r?.appliedAmount||0), 0));
    const hasStored = hasStoredBalanceSnapshot(invoice);

    if (rows.length > 0) {
      const prevBal = hasStored ? R2(invoice.previousOutstanding) : R2(rows.reduce((s,r)=>s+R2(r?.dueBefore||0),0));
      const newBal  = hasStored ? R2(invoice.newOutstanding)      : R2(rows.reduce((s,r)=>s+R2(r?.dueAfter||0),0));
      return { ...empty, previousBalance:prevBal, newBalance:newBal, isReceipt:true, isPayment:true, isInvoiceSettlement:true, settledAmount:settled };
    }

    // Single invoice settlement
    const inferredPrev = invoice?.dueBefore!=null ? R2(invoice.dueBefore) : invoice?.balanceBefore!=null ? R2(invoice.balanceBefore) : settled;
    const inferredNew  = invoice?.dueAfter!=null  ? R2(invoice.dueAfter)  : invoice?.isInvoiceFullyPaid ? 0 : Math.max(0, R2(inferredPrev-settled));

    return {
      ...empty,
      previousBalance: hasStored ? R2(invoice.previousOutstanding) : inferredPrev,
      newBalance:      hasStored ? R2(invoice.newOutstanding)      : inferredNew,
      isReceipt:true, isPayment:true, isInvoiceSettlement:true, settledAmount:settled,
    };
  }

  /* ── MANUAL RECEIPT (customer payment / credit entry) ── */
  if (isReceiptDoc(invoice)) {
    const amount  = R2(invoice?.netAmount || invoice?.amount || 0);
    const isPay   = invoice?._receiptType === 'payment';
    const isCred  = invoice?._receiptType === 'credit';
    const hasStored = hasStoredBalanceSnapshot(invoice);

    let prevBal = 0, newBal = 0;

    if (hasStored) {
      prevBal = R2(invoice.previousOutstanding);
      newBal  = R2(invoice.newOutstanding);
    } else {
      // Fallback: reconstruct from DB balance
      if (isPay) {
        newBal  = dbBal;                    // current = after payment
        prevBal = R2(dbBal + amount);       // before = current + paid
      } else if (isCred) {
        newBal  = dbBal;                    // current = after credit
        prevBal = R2(dbBal - amount);       // before = current - credit
      } else {
        prevBal = dbBal;
        newBal  = dbBal;
      }
    }

    return {
      ...empty,
      creditDue: isCred ? amount : 0,
      isCreditSale: isCred,
      previousBalance: prevBal, newBalance: newBal,
      isReceipt:true, isPayment:isPay, isCredit:isCred,
      settledAmount: amount,
    };
  }

  /* ── RETURN ── */
  if (isReturnDoc(invoice)) {
    const rs = getReturnSettlementInfo(invoice);

    if (rs.method === 'credit' && rs.creditAmt > 0) {
      const hasStored = hasStoredBalanceSnapshot(invoice);

      // If stored values exist and are valid, use them
      // Otherwise: current DB balance = after return, before = current + creditAmt
      const newBal  = hasStored ? R2(invoice.newOutstanding)      : dbBal;
      const prevBal = hasStored ? R2(invoice.previousOutstanding) : R2(newBal + rs.creditAmt);

      return {
        ...empty,
        isReturnCreditAdj:true, returnCreditAmount:rs.creditAmt,
        previousBalance:prevBal, newBalance:newBal,
      };
    }

    // Cash / Exchange return — no balance change
    return { ...empty, previousBalance:dbBal, newBalance:dbBal };
  }

  /* ── REGULAR INVOICE ── */
  const net=R2(invoice?.netAmount), paid=R2(invoice?.payAmount);
  const bal=R2(invoice?.balance), method=invoice?.paymentMethod||'cash';
  const isCS=method==='credit'||bal<-0.01;
  const cd=isCS?Math.max(0,R2(net-paid)):0;
  const hasStored = hasStoredBalanceSnapshot(invoice);

  const prev = hasStored ? R2(invoice.previousOutstanding) : isCS ? R2(dbBal-cd) : dbBal;
  const nb   = hasStored ? R2(invoice.newOutstanding)      : isCS ? R2(prev+cd) : prev;

  return { ...empty, creditDue:cd, isCreditSale:isCS, previousBalance:R2(prev), newBalance:R2(nb) };
};

/* ══════════════════════════════════════════
   LANGUAGE LABELS
══════════════════════════════════════════ */
const LANG = {
  en: {
    invoiceTitle:'INVOICE', returnTitle:'SALES RETURN NOTE', returnBadge:'SALES RETURN NOTE',
    no:'No:', returnNo:'Return No:', originalInvoice:'Original Invoice:', date:'Date:',
    customer:'Customer:', phone:'Phone:', address:'Addr:',
    items:'ITEMS', returnedItems:'RETURNED ITEMS',
    gross:'Gross:', discount:'Discount:', billDisc:'Bill Disc:',
    exchange:'Exchange:', netTotal:'NET TOTAL', refundTotal:'REFUND TOTAL',
    pay:'Pay:', refundVia:'Refund Via:', paid:'Paid:',
    refundAmt:'Cash Refund:', creditAdjusted:'Credit Adjusted:', exchangeValue:'Exchange Value:',
    change:'CHANGE', creditDue:'CREDIT DUE',
    prevBalance:'Prev Balance:', newBalanceLabel:'New Balance:',
    totalDue:'TOTAL DUE', returnCreditAdj:'Credit Reduced:',
    balanceReduced:'Balance Adjusted by Return',
    note:'NOTE:', warranty:'WTY:', computerGenerated:'Computer Generated',
    cash:'CASH', card:'CARD', etransfer:'E-TRANSFER', cheque:'CHEQUE', credit:'CREDIT',
    cashRefund:'CASH REFUND', creditAdjustment:'CREDIT ADJUSTMENT', exchangeRefund:'EXCHANGE',
    waCash:'💵 Cash', waCard:'💳 Card', waEtransfer:'📲 E-Transfer', waCheque:'🧾 Cheque', waCredit:'📝 Credit',
    waCashRefund:'💵 Cash Refund', waCreditAdj:'🏦 Credit Adj', waExchange:'🔄 Exchange',
    waRefundAmt:'💸 Cash Refund:', waCreditAdjAmt:'🏦 Credit Adj:', waExchangeAmt:'🔄 Exchange:',
    waPrevBalance:'📊 Prev Balance:', waNewBalance:'📊 New Balance:', waReturnCreditAdj:'✅ Credit Reduced:',
    smsItems:'ITEMS', smsReturnedItems:'RETURNED', smsCust:'Cust', smsDate:'Date',
    smsNo:'No', smsRet:'Ret', smsOrig:'Orig', smsGross:'Gross', smsDisc:'Disc',
    smsBillDisc:'BillDisc', smsExchange:'Exchange', smsTotal:'Total', smsRefund:'Refund',
    smsPay:'Pay', smsPaid:'Paid', smsRefunded:'CashRefunded', smsCreditAdj:'CreditAdj',
    smsExchangeVal:'ExchangeVal', smsChange:'Change', smsDue:'Due',
    smsPrevBal:'PrevBal', smsNewBal:'NewBal', smsCreditReduced:'CreditReduced',
    smsOutstanding:'Outstanding', smsAccount:'Account', smsNote:'Note', smsWarranty:'WTY', smsReturn:'RETURN',
  },
  si: {
    invoiceTitle:'ඉන්වොයිසිය', returnTitle:'විකුණුම් ආපසු භාර පත්‍රය',
    returnBadge:'↩️ විකුණුම් ආපසු භාර පත්‍රය', no:'අංකය:', returnNo:'ආපසු අංකය:',
    originalInvoice:'මුල් ඉන්වොයිසිය:', date:'දිනය:',
    customer:'පාරිභෝගිකයා:', phone:'දුරකථනය:', address:'ලිපිනය:',
    items:'භාණ්ඩ', returnedItems:'ආපසු භාණ්ඩ',
    gross:'මුළු එකතුව:', discount:'වට්ටම:', billDisc:'බිල්පත් වට්ටම:',
    exchange:'හුවමාරුව:', netTotal:'ශුද්ධ එකතුව', refundTotal:'ආපසු මුදල',
    pay:'ගෙවීම:', refundVia:'ආපසු ගෙවීම:', paid:'ගෙවූ මුදල:',
    refundAmt:'මුදල් ආපසු:', creditAdjusted:'ණය ගිණුමෙන් අඩු:', exchangeValue:'හුවමාරු වටිනාකම:',
    change:'ශේෂය', creditDue:'ණය මුදල',
    prevBalance:'පෙර ණය ශේෂය:', newBalanceLabel:'නව ණය ශේෂය:',
    totalDue:'මුළු ණය ශේෂය', returnCreditAdj:'ණය ශේෂයෙන් අඩු:',
    balanceReduced:'ආපසු භාරයෙන් ණය ශේෂය සකසන ලදී',
    note:'සටහන:', warranty:'වගකීම:', computerGenerated:'පරිගණක ජනිත',
    cash:'මුදල්', card:'කාඩ්', etransfer:'ඊ-හුවමාරු', cheque:'චෙක්පත', credit:'ණය',
    cashRefund:'මුදල් ආපසු', creditAdjustment:'ණය ගිණුමෙන් අඩු', exchangeRefund:'හුවමාරුව',
    waCash:'💵 මුදල්', waCard:'💳 කාඩ්', waEtransfer:'📲 ඊ-හුවමාරු', waCheque:'🧾 චෙක්පත', waCredit:'📝 ණය',
    waCashRefund:'💵 මුදල් ආපසු', waCreditAdj:'🏦 ණය ගිණුමෙන් අඩු', waExchange:'🔄 හුවමාරුව',
    waRefundAmt:'💸 මුදල් ආපසු:', waCreditAdjAmt:'🏦 ණය අඩු:', waExchangeAmt:'🔄 හුවමාරු:',
    waPrevBalance:'📊 පෙර ණය:', waNewBalance:'📊 නව ණය:', waReturnCreditAdj:'✅ ණය අඩු:',
    smsItems:'භාණ්ඩ', smsReturnedItems:'ආපසු', smsCust:'ගනුදෙනුකරු', smsDate:'දිනය',
    smsNo:'අංකය', smsRet:'ආපසු', smsOrig:'මුල්', smsGross:'මුළු', smsDisc:'වට්ටම',
    smsBillDisc:'බිල් වට්ටම', smsExchange:'හුවමාරුව', smsTotal:'එකතුව', smsRefund:'ආපසු',
    smsPay:'ගෙවීම', smsPaid:'ගෙවූ', smsRefunded:'මුදල් ආපසු', smsCreditAdj:'ණය අඩු',
    smsExchangeVal:'හුවමාරු', smsChange:'ශේෂය', smsDue:'ණය',
    smsPrevBal:'පෙර ණය', smsNewBal:'නව ණය', smsCreditReduced:'ණය අඩු කළ',
    smsOutstanding:'මුළු ණය', smsAccount:'ගිණුම', smsNote:'සටහන', smsWarranty:'වගකීම', smsReturn:'ආපසු භාරය',
  },
};

const getLang = (k) => k === 'si' ? LANG.si : LANG.en;
const getPaymentLabel = (m,L,w=false) => { const map=w?{cash:L.waCash,card:L.waCard,etransfer:L.waEtransfer,cheque:L.waCheque,credit:L.waCredit}:{cash:L.cash,card:L.card,etransfer:L.etransfer,cheque:L.cheque,credit:L.credit}; return map[m]||m; };
const getRefundLabel = (m,L,w=false) => { const map=w?{cash:L.waCashRefund,credit:L.waCreditAdj,exchange:L.waExchange}:{cash:L.cashRefund,credit:L.creditAdjustment,exchange:L.exchangeRefund}; return map[m]||m; };

const DEFAULT_VISIBILITY = {
  showCustomerName:true, showCustomerPhone:false, showCustomerAddress:false,
  showItemPrices:true, showItemDiscount:true, showDiscountPercent:true,
  showGrossTotal:true, showTotalDiscount:true, showBillDiscount:true,
  showExchangeAmount:true, showNetAmount:true, showPaymentMethod:true,
  showPaidAmount:true, showBalance:true, showPreviousBalance:false,
  showNewBalance:false, showCreditDue:true, showRemarks:false,
  showWarranty:true, showUOM:true, showItemSinhala:true,
  showInvoiceNo:true, showDate:true, showPortalLink:false,
  showBusinessLogo:true, showBusinessName:true, showBusinessAddress:true,
  showBusinessPhone:true, showFooterMessage:true,
};

const buildDefaultModeSettings = () => ({
  print:{lang:'en',visibility:{...DEFAULT_VISIBILITY,showPortalLink:false}},
  whatsapp:{lang:'en',visibility:{...DEFAULT_VISIBILITY,showPortalLink:true}},
  sms:{lang:'en',visibility:{...DEFAULT_VISIBILITY,showCustomerAddress:false,showItemSinhala:false,showWarranty:false,showBillDiscount:false,showExchangeAmount:false,showPreviousBalance:false,showPortalLink:false,showBusinessLogo:false,showBusinessAddress:false,showBusinessPhone:false,showDiscountPercent:false,showUOM:false,showRemarks:false,showGrossTotal:false,showTotalDiscount:false}},
  share:{lang:'en',visibility:{...DEFAULT_VISIBILITY,showPortalLink:true}},
});

const VISIBILITY_SECTIONS = [
  {title:'👤 පාරිභෝගික',icon:'👤',fields:[{key:'showCustomerName',label:'නම',labelEn:'Name'},{key:'showCustomerPhone',label:'දුරකථන',labelEn:'Phone'},{key:'showCustomerAddress',label:'ලිපිනය',labelEn:'Address'}]},
  {title:'💰 මුදල්',icon:'💰',fields:[{key:'showItemPrices',label:'භාණ්ඩ මිල',labelEn:'Prices'},{key:'showItemDiscount',label:'වට්ටම',labelEn:'Discount'},{key:'showDiscountPercent',label:'වට්ටම %',labelEn:'Disc %'},{key:'showGrossTotal',label:'මුළු එකතුව',labelEn:'Gross'},{key:'showTotalDiscount',label:'මුළු වට්ටම',labelEn:'Total Disc'},{key:'showBillDiscount',label:'බිල් වට්ටම',labelEn:'Bill Disc'},{key:'showExchangeAmount',label:'හුවමාරු',labelEn:'Exchange'},{key:'showNetAmount',label:'ශුද්ධ මුදල',labelEn:'Net'},{key:'showPaymentMethod',label:'ගෙවීම් ක්‍රමය',labelEn:'Pay Method'},{key:'showPaidAmount',label:'ගෙවූ මුදල',labelEn:'Paid'},{key:'showBalance',label:'ශේෂය',labelEn:'Balance'}]},
  {title:'📊 ණය ශේෂය',icon:'📊',fields:[{key:'showPreviousBalance',label:'පෙර ණය',labelEn:'Prev Balance'},{key:'showNewBalance',label:'නව ණය',labelEn:'New Balance'},{key:'showCreditDue',label:'ණය මුදල',labelEn:'Credit Due'}]},
  {title:'📝 අමතර',icon:'📝',fields:[{key:'showRemarks',label:'සටහන්',labelEn:'Remarks'},{key:'showWarranty',label:'වගකීම',labelEn:'Warranty'},{key:'showUOM',label:'ඒකක',labelEn:'UOM'},{key:'showItemSinhala',label:'සිංහල නම',labelEn:'Sinhala'},{key:'showInvoiceNo',label:'අංකය',labelEn:'No'},{key:'showDate',label:'දිනය',labelEn:'Date'}]},
  {title:'🔗 Portal',icon:'🔗',fields:[{key:'showPortalLink',label:'Portal',labelEn:'Portal'}]},
  {title:'🏢 ව්‍යාපාර',icon:'🏢',fields:[{key:'showBusinessLogo',label:'Logo',labelEn:'Logo'},{key:'showBusinessName',label:'නම',labelEn:'Name'},{key:'showBusinessAddress',label:'ලිපිනය',labelEn:'Address'},{key:'showBusinessPhone',label:'දුරකථන',labelEn:'Phone'},{key:'showFooterMessage',label:'Footer',labelEn:'Footer'}]},
];

const PRESETS = {
  full:{name:'📋 සම්පූර්ණ',config:Object.fromEntries(Object.keys(DEFAULT_VISIBILITY).map(k=>[k,true]))},
  minimal:{name:'📄 සරල',config:{...Object.fromEntries(Object.keys(DEFAULT_VISIBILITY).map(k=>[k,false])),showCustomerName:true,showItemPrices:true,showNetAmount:true,showInvoiceNo:true,showDate:true,showBusinessName:true}},
  standard:{name:'📊 සම්මත',config:{...DEFAULT_VISIBILITY}},
  privacy:{name:'🔒 පෞද්ගලිකත්වය',config:{...DEFAULT_VISIBILITY,showCustomerPhone:false,showCustomerAddress:false,showPreviousBalance:false,showNewBalance:false,showPortalLink:false,showRemarks:false}},
};

function ToggleSwitch({checked,onChange}){return(<button type="button" onClick={()=>onChange(!checked)} style={{width:44,height:24,borderRadius:12,border:'none',cursor:'pointer',background:checked?'#16a34a':'#d1d5db',position:'relative',transition:'background 0.2s',flexShrink:0,padding:0}}><span style={{position:'absolute',top:2,left:checked?22:2,width:20,height:20,borderRadius:'50%',background:'white',transition:'left 0.2s',boxShadow:'0 1px 4px rgba(0,0,0,0.2)'}}/></button>);}

function LanguageSelector({lang,onChange,modeLabel}){
  const opts=[{key:'en',label:'🇬🇧 EN'},{key:'si',label:'🇱🇰 සිං'},{key:'mixed',label:'🔀 Mix'}];
  const colors={en:'#2563eb',si:'#16a34a',mixed:'#7c3aed'};
  return(<div style={{marginBottom:14}}><div style={{fontSize:12,fontWeight:700,color:'#64748b',marginBottom:6}}>🌐 {modeLabel}</div><div style={{display:'flex',borderRadius:10,overflow:'hidden',border:'1px solid #e2e8f0'}}>{opts.map((o,i)=>(<button key={o.key} onClick={()=>onChange(o.key)} style={{flex:1,padding:'9px 4px',border:'none',borderLeft:i>0?'1px solid #e2e8f0':'none',fontWeight:800,fontSize:12,cursor:'pointer',background:lang===o.key?colors[o.key]:'#f8fafc',color:lang===o.key?'#fff':'#64748b'}}>{o.label}</button>))}</div></div>);
}

const LANG_BADGE={en:{color:'#2563eb',label:'EN'},si:{color:'#16a34a',label:'සිං'},mixed:{color:'#7c3aed',label:'Mix'}};
function LangBadge({lang}){const b=LANG_BADGE[lang]||{color:'#64748b',label:lang};return(<span style={{fontSize:9,fontWeight:800,padding:'1px 5px',borderRadius:4,background:b.color,color:'#fff',marginLeft:4,verticalAlign:'middle'}}>{b.label}</span>);}
const MODES=[{key:'print',icon:'🖨️',label:'Print',color:'#2563eb'},{key:'whatsapp',icon:'📲',label:'WhatsApp',color:'#25D366'},{key:'sms',icon:'📱',label:'SMS',color:'#f59e0b'},{key:'share',icon:'🔗',label:'Share',color:'#7c3aed'}];/* ══════════════════════════════════════════
   BUILD RECEIPT HTML
══════════════════════════════════════════ */
function buildReceiptHTML(invoice, settings, visibility, customer, langKey='en') {
  const v=visibility||DEFAULT_VISIBILITY, biz=settings||{}, items=invoice?.items||[];
  const isRet=isReturnDoc(invoice), L=getLang(langKey);
  const isPortalPay=isPortalInvoicePayment(invoice);
  const grossTotal=R2(invoice?.grossTotal), billDiscount=R2(invoice?.billDiscount), totalDiscount=R2(invoice?.totalDiscount);
  const exchangeAmt=R2(invoice?.exchangeAmount), netAmount=R2(invoice?.netAmount), payAmount=R2(invoice?.payAmount);
  const balance=R2(invoice?.balance), remarks=invoice?.remarks||invoice?.invoiceRemark||invoice?.note||'';
  const payMethod=isRet?(invoice?.refundMethod||'cash'):(invoice?.paymentMethod||invoice?.method||'cash');
  const invoiceNo=invoice?.invoiceNo||invoice?.invoiceCode||invoice?.id?.slice(0,8)?.toUpperCase()||'';
  const originalInvNo=invoice?.originalInvoiceNo||'', invDate=fmtDate(invoice?.createdAt);
  const portalLink=getPortalLink(customer);
  const oi=getOutstandingInfo(invoice,customer);
  const returnSettle=isRet?getReturnSettlementInfo(invoice):null;
  const {creditDue,isCreditSale,previousBalance,newBalance,isReturnCreditAdj,returnCreditAmount,isReceipt,isPayment,isCredit,isInvoiceSettlement,settledAmount}=oi;
  const isReceiptType=isReceipt||isInvoiceSettlement||isPortalPay;

  const row=(l,r,fs=14)=>`<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:${fs}px;font-weight:900;color:#000;line-height:1.3"><span>${esc(l)}</span><span style="text-align:right;max-width:58%;word-break:break-word;margin-left:4px">${esc(r)}</span></div>`;
  const center=(t,fs=12)=>`<div style="text-align:center;font-weight:900;color:#000;font-size:${fs}px">${esc(t)}</div>`;
  const div1=`<div style="border-top:2px dashed #000;margin:5px 0"></div>`;
  const div2=`<div style="border-top:1px dashed #000;margin:4px 0"></div>`;
  const div3=`<div style="border-top:3px solid #000;margin:5px 0"></div>`;

  let html='';
  if(v.showBusinessLogo&&biz.logo) html+=`<div style="text-align:center;margin-bottom:4px"><img src="${esc(biz.logo)}" crossorigin="anonymous" style="max-height:50px;max-width:80%;object-fit:contain"/></div>`;
  if(v.showBusinessName) html+=center(biz.businessName||(isRet?L.returnTitle:isPortalPay?'Payment Receipt':L.invoiceTitle),20);
  if(isRet) html+=`<div style="text-align:center;margin:4px 0"><span style="background:#fef2f2;color:#dc2626;font-size:13px;font-weight:900;padding:3px 14px;border-radius:20px;border:2px solid #fecaca">${esc(L.returnBadge)}</span></div>`;
  if(isPortalPay&&!isRet) html+=`<div style="text-align:center;margin:4px 0"><span style="background:#f0fdf4;color:#16a34a;font-size:13px;font-weight:900;padding:3px 14px;border-radius:20px;border:2px solid #bbf7d0">💰 Payment Receipt</span></div>`;
  if(v.showBusinessAddress&&biz.address) html+=center(biz.address,11);
  if(v.showBusinessPhone&&biz.phone) html+=center(`Tel: ${biz.phone}`,11);
  html+=div1;
  if(v.showInvoiceNo){
    html+=row(isRet?L.returnNo:isPortalPay?'Receipt:':L.no, invoiceNo, 15);
    if(isRet&&originalInvNo) html+=row(L.originalInvoice, originalInvNo, 12);
    if(isPortalPay&&invoice?.invoiceNo&&!isRet) html+=row('Invoice:', invoice.invoiceNo, 12);
  }
  if(v.showDate) html+=row(L.date, invDate, 13);
  if(v.showCustomerName||v.showCustomerPhone||v.showCustomerAddress) html+=div2;
  if(v.showCustomerName) html+=row(L.customer, invoice?.customerName||'Cash', 15);
  if(v.showCustomerPhone&&invoice?.customerPhone) html+=row(L.phone, invoice.customerPhone, 13);
  if(v.showCustomerAddress&&invoice?.customerAddress) html+=row(L.address, invoice.customerAddress, 12);
  html+=div1;

  if(isPortalPay&&!isRet){
    html+=center('— Payment Details —', 12);
    html+=div2;
    html+=row(isPortalPay?'Paid Amount:':'Amount:', `Rs.${fmt(settledAmount||netAmount)}`, 16);
    const mLabel=(invoice?.method||invoice?.paymentMethod||'').replace('_',' ').toUpperCase()||'CASH';
    html+=row('Method:', mLabel, 13);
    if(remarks) html+=row('Note:', remarks, 12);
  } else {
    html+=center(isRet?`— ${L.returnedItems} (${items.length}) —`:`— ${L.items} (${items.length}) —`, 12);
    items.forEach((item,i)=>{
      const sp=R2(item.sellingPrice),yp=R2(item.yourPrice),qty=R2(item.qty),lt=R2(item.lineTotal??yp*qty);
      const hd=sp>yp&&sp>0,dp=hd&&sp>0?R2(((sp-yp)/sp)*100):0;
      const uom=item.uom&&item.uom!=='unit'?` ${item.uom}`:'';
      const bdr=i<items.length-1?'border-bottom:1px dotted #000;':'';
      let primary=item.name||'',secondary='';
      if(langKey==='si'&&item.nameSi){primary=item.nameSi;secondary=item.name||'';}
      else if(item.nameSi&&v.showItemSinhala) secondary=item.nameSi;
      html+=`<div style="margin-bottom:4px;padding-bottom:3px;${bdr}">`;
      html+=`<div style="font-weight:900;font-size:14px;color:#000;word-break:break-word;line-height:1.2">${i+1}. ${esc(primary)}</div>`;
      if(secondary) html+=`<div style="font-size:12px;font-weight:900;color:#000;padding-left:14px">(${esc(secondary)})</div>`;
      if(v.showItemPrices){let ps='';if(hd&&v.showItemDiscount){ps=`<span style="text-decoration:line-through">${fmt(sp)}</span> ${fmt(yp)}`;if(v.showDiscountPercent)ps+=` <span style="font-size:11px">(-${dp}%)</span>`;}else{ps=fmt(sp);}html+=`<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:900;color:#000;padding-left:14px;margin-top:1px"><span>${ps} x${qty}${v.showUOM?esc(uom):''}</span><span style="font-size:14px;font-weight:900">Rs.${fmt(lt)}</span></div>`;}
      if(v.showWarranty&&item.warrantyCode) html+=`<div style="font-size:11px;font-weight:900;color:#000;padding-left:14px">${esc(L.warranty)} ${esc(item.warrantyCode)}${item.warrantyPeriod?' | '+esc(item.warrantyPeriod):''}</div>`;
      html+=`</div>`;
    });
  }

  html+=div1;
  if(!isRet&&!isReceiptType){
    if(v.showGrossTotal) html+=row(L.gross,`Rs.${fmt(grossTotal)}`);
    if(v.showTotalDiscount&&totalDiscount>0) html+=row(L.discount,`-Rs.${fmt(totalDiscount)}`);
    if(v.showBillDiscount&&billDiscount>0) html+=row(L.billDisc,`-Rs.${fmt(billDiscount)}`);
    if(v.showExchangeAmount&&exchangeAmt>0) html+=row(L.exchange,`-Rs.${fmt(exchangeAmt)}`);
  }
  if(v.showNetAmount){html+=div3;html+=`<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:20px;font-weight:900;color:#000"><span>${esc(isRet?L.refundTotal:isPortalPay?'PAID:':L.netTotal)}</span><span>Rs.${fmt(isPortalPay?settledAmount:netAmount)}</span></div>`;html+=div3;}
  if(v.showPaymentMethod&&!isPortalPay) html+=row(isRet?L.refundVia:L.pay, isRet?getRefundLabel(payMethod,L):getPaymentLabel(payMethod,L), 15);

  if(v.showPaidAmount){
    if(isRet&&returnSettle){
      if(returnSettle.method==='cash') html+=row(L.refundAmt,`Rs.${fmt(returnSettle.cashAmt)}`,15);
      else if(returnSettle.method==='credit'){html+=div2;html+=`<div style="background:#eff6ff;border-radius:6px;padding:6px 8px;margin:2px 0"><div style="display:flex;justify-content:space-between;font-size:15px;font-weight:900;color:#1d4ed8"><span>${esc(L.creditAdjusted)}</span><span>Rs.${fmt(returnSettle.creditAmt)}</span></div></div>`;}
      else html+=row(L.exchangeValue,`Rs.${fmt(returnSettle.exchangeAmt)}`,15);
    } else if(!isRet&&!isPortalPay) html+=row(L.paid,`Rs.${fmt(payAmount)}`,15);
  }

  /* ★★★ OUTSTANDING BALANCE ★★★ */
  if(!isRet){
    if(isReceiptType){
      if(v.showPreviousBalance||v.showNewBalance){
        html+=div1;
        html+=`<div style="background:#f0f9ff;border-radius:8px;padding:8px 10px;margin:4px 0">`;
        const title=isInvoiceSettlement||isPortalPay?'Invoice Settlement Summary':(isPayment?'ගෙවීම් ශේෂය / Payment Balance':'ණය ශේෂය / Credit Balance');
        html+=`<div style="font-size:12px;font-weight:900;color:#0369a1;text-align:center;margin-bottom:6px">📊 ${esc(title)}</div>`;
        if(v.showPreviousBalance) html+=`<div style="display:flex;justify-content:space-between;font-size:14px;font-weight:900;color:#475569;padding:3px 0"><span>${esc(L.prevBalance)}</span><span>Rs.${fmt(previousBalance)}</span></div>`;
        if(isInvoiceSettlement||isPortalPay){
          html+=`<div style="display:flex;justify-content:space-between;font-size:14px;font-weight:900;color:#16a34a;padding:3px 0"><span>✅ Applied Payment</span><span>-Rs.${fmt(settledAmount)}</span></div>`;
          const rows=invoice?.appliedInvoices||[];
          if(rows.length>1) rows.forEach((r,idx)=>{html+=`<div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:#64748b;padding:1px 0 1px 16px"><span>${idx+1}. ${esc(r.invoiceNo||'')}</span><span>Rs.${fmt(r.appliedAmount)}</span></div>`;});
        } else if(isPayment) html+=`<div style="display:flex;justify-content:space-between;font-size:14px;font-weight:900;color:#16a34a;padding:3px 0"><span>✅ ${esc(L.paid)}</span><span>-Rs.${fmt(netAmount)}</span></div>`;
        else if(isCredit) html+=`<div style="display:flex;justify-content:space-between;font-size:14px;font-weight:900;color:#dc2626;padding:3px 0"><span>🔴 ණය ඇතුළු:</span><span>+Rs.${fmt(netAmount)}</span></div>`;
        if(v.showNewBalance){const nb=newBalance,nbc=nb>0.01?'#dc2626':nb<-0.01?'#2563eb':'#16a34a';html+=`<div style="border-top:2px solid #0369a1;margin:4px 0"></div><div style="display:flex;justify-content:space-between;font-size:16px;font-weight:900;padding:3px 0;color:${nbc}"><span>${esc(L.newBalanceLabel)}</span><span>Rs.${fmt(nb)}</span></div>`;}
        html+=`</div>`;
      }
    } else {
      if(v.showBalance&&balance>=0.01){html+=div2;html+=`<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:17px;font-weight:900;color:#000"><span>${esc(L.change)}</span><span>Rs.${fmt(balance)}</span></div>`;}
      if(v.showCreditDue&&isCreditSale&&creditDue>0){html+=div2;html+=`<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:17px;font-weight:900;color:#dc2626"><span>${esc(L.creditDue)}</span><span>Rs.${fmt(creditDue)}</span></div>`;}
      if(v.showPreviousBalance&&isCreditSale){html+=div1;html+=row(L.prevBalance,`Rs.${fmt(previousBalance)}`,14);}
      if(v.showNewBalance&&isCreditSale){html+=`<div style="border-top:2px solid #dc2626;margin:3px 0"></div>`;html+=`<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:17px;font-weight:900;color:#dc2626"><span>${esc(L.totalDue)}</span><span>Rs.${fmt(newBalance)}</span></div>`;}
    }
  } else {
    if(isReturnCreditAdj&&(v.showPreviousBalance||v.showNewBalance)){
      html+=div1;html+=`<div style="background:#eff6ff;border-radius:8px;padding:8px 10px;margin:4px 0">`;
      html+=`<div style="font-size:12px;font-weight:900;color:#1d4ed8;text-align:center;margin-bottom:6px">📊 ${esc(L.balanceReduced)}</div>`;
      if(v.showPreviousBalance) html+=`<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:900;color:#475569;padding:2px 0"><span>${esc(L.prevBalance)}</span><span>Rs.${fmt(previousBalance)}</span></div>`;
      html+=`<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:900;color:#16a34a;padding:2px 0"><span>${esc(L.returnCreditAdj)}</span><span>-Rs.${fmt(returnCreditAmount)}</span></div>`;
      if(v.showNewBalance){html+=`<div style="border-top:2px solid #1d4ed8;margin:4px 0"></div>`;html+=`<div style="display:flex;justify-content:space-between;font-size:15px;font-weight:900;color:#1d4ed8;padding:2px 0"><span>${esc(L.newBalanceLabel)}</span><span>Rs.${fmt(newBalance)}</span></div>`;}
      html+=`</div>`;
    }
  }

  if(v.showRemarks&&remarks) html+=div2+`<div style="font-size:12px;font-weight:900;color:#000;padding:2px 0;word-break:break-word">${esc(L.note)} ${esc(remarks)}</div>`;
  if(!isRet&&v.showPortalLink&&portalLink){html+=div2;html+=`<div style="text-align:center;background:#eff6ff;border-radius:8px;padding:6px;margin-top:4px"><div style="font-size:11px;font-weight:900;color:#1e40af;margin-bottom:3px">👤 ඔබේ ගිණුම</div><div style="font-size:10px;font-weight:900;color:#1e293b;word-break:break-all">${esc(portalLink)}</div></div>`;}
  html+=div3;
  if(v.showFooterMessage) html+=center(biz.footerMessage||(isRet?'Return Processed!':isPortalPay?'Payment Confirmed!':'Thank You!'),14);
  html+=center(L.computerGenerated,9);
  return html;
}

function printViaIframe(rHTML){const f=`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Receipt</title><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:80mm;max-width:80mm;font-family:'Courier New',monospace;font-size:14px;font-weight:900;color:#000;background:#fff;line-height:1.4}body{padding:2mm 3mm}div,span,p{color:#000!important;font-weight:900!important}img{max-width:80%!important}@page{size:80mm auto;margin:0}</style></head><body>${rHTML}</body></html>`;return new Promise(res=>{const iframe=document.createElement('iframe');iframe.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;';document.body.appendChild(iframe);const d=iframe.contentDocument||iframe.contentWindow?.document;if(!d){document.body.removeChild(iframe);res();return;}d.open();d.write(f);d.close();let done=false;const cl=()=>{if(done)return;done=true;setTimeout(()=>{if(document.body.contains(iframe))document.body.removeChild(iframe);res();},300);};let pr=false;const dp=async()=>{if(pr)return;pr=true;try{const imgs=Array.from(d.images||[]);await Promise.all(imgs.map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r;})));iframe.contentWindow?.addEventListener('afterprint',cl);iframe.contentWindow?.focus();iframe.contentWindow?.print();}catch(e){console.warn(e);cl();}setTimeout(cl,30000);};iframe.onload=()=>setTimeout(dp,300);setTimeout(dp,1500);});}

function buildWAMessage(invoice,customer,settings,visibility,langKey='en'){
  const v=visibility||DEFAULT_VISIBILITY,biz=settings||{},items=invoice?.items||[];
  const isRet=isReturnDoc(invoice),isPortalPay=isPortalInvoicePayment(invoice),L=getLang(langKey);
  const invoiceNo=invoice?.invoiceNo||invoice?.invoiceCode||invoice?.id?.slice(0,8)?.toUpperCase()||'';
  const netAmount=R2(invoice?.netAmount),payAmount=R2(invoice?.payAmount),balance=R2(invoice?.balance);
  const remarks=invoice?.remarks||invoice?.invoiceRemark||invoice?.note||'';
  const payMethod=isRet?(invoice?.refundMethod||'cash'):(invoice?.paymentMethod||invoice?.method||'cash');
  const portalLink=getPortalLink(customer);
  const oi=getOutstandingInfo(invoice,customer);
  const returnSettle=isRet?getReturnSettlementInfo(invoice):null;
  const {creditDue,isCreditSale,previousBalance,newBalance,isReturnCreditAdj,returnCreditAmount,isReceipt,isPayment,isCredit,isInvoiceSettlement,settledAmount}=oi;
  const isReceiptType=isReceipt||isInvoiceSettlement||isPortalPay;

  let msg='';
  if(v.showBusinessName) msg+=`${isRet?'↩️':isPortalPay?'💰':'🧾'} *${biz.businessName||(isRet?L.returnTitle:isPortalPay?'Payment Receipt':L.invoiceTitle)}*\n`;
  if(isRet) msg+=`*${L.returnBadge}*\n`;
  msg+=`━━━━━━━━━━━━━━\n`;
  if(v.showInvoiceNo){msg+=`📋 *${isRet?L.returnNo:isPortalPay?'Receipt:':L.no}* ${invoiceNo}\n`;if(isRet&&invoice?.originalInvoiceNo)msg+=`🧾 *${L.originalInvoice}* ${invoice.originalInvoiceNo}\n`;}
  if(v.showDate) msg+=`📅 *${L.date}* ${fmtDate(invoice?.createdAt)}\n`;
  if(v.showCustomerName) msg+=`👤 *${L.customer}* ${invoice?.customerName||'Cash'}\n`;
  if(v.showCustomerPhone&&invoice?.customerPhone) msg+=`📞 ${invoice.customerPhone}\n`;
  msg+=`━━━━━━━━━━━━━━\n\n`;

  if(isPortalPay&&!isRet){
    msg+=`💵 *Paid:* Rs.${fmt(settledAmount)}\n`;
    msg+=`🏦 *Method:* ${(invoice?.method||invoice?.paymentMethod||'').replace('_',' ')||'Cash'}\n`;
    if(remarks) msg+=`📝 ${remarks}\n`;
  } else {
    items.forEach((it,i)=>{const sp=R2(it.sellingPrice),yp=R2(it.yourPrice),qty=R2(it.qty),lt=R2(it.lineTotal??yp*qty),hd=sp>yp&&sp>0;const uom=v.showUOM&&it.uom&&it.uom!=='unit'?` ${it.uom}`:'';let name=it.name||'',si='';if(langKey==='si'&&it.nameSi){name=it.nameSi;si=it.name?` (${it.name})`:''}else if(it.nameSi&&v.showItemSinhala)si=` (${it.nameSi})`;msg+=`${i+1}. *${name}*${si}\n`;if(v.showItemPrices){if(hd&&v.showItemDiscount){msg+=`   ~Rs.${fmt(sp)}~`;if(v.showDiscountPercent&&sp>0)msg+=` (-${R2(((sp-yp)/sp)*100)}%)`;msg+=`\n   *Rs.${fmt(yp)}* × ${qty}${uom} = *Rs.${fmt(lt)}*\n`;}else msg+=`   Rs.${fmt(sp)} × ${qty}${uom} = *Rs.${fmt(lt)}*\n`;}if(v.showWarranty&&it.warrantyCode)msg+=`   🛡️ ${it.warrantyCode}${it.warrantyPeriod?` · ${it.warrantyPeriod}`:''}\n`;});
  }

  msg+=`\n━━━━━━━━━━━━━━\n`;
  if(!isRet&&!isReceiptType){if(v.showGrossTotal&&R2(invoice?.grossTotal)>0)msg+=`💰 *${L.gross}* Rs.${fmt(R2(invoice.grossTotal))}\n`;if(v.showTotalDiscount&&R2(invoice?.totalDiscount)>0)msg+=`🏷️ *${L.discount}* -Rs.${fmt(R2(invoice.totalDiscount))}\n`;}
  if(v.showNetAmount) msg+=`\n💰 *${isRet?L.refundTotal:isPortalPay?'Total Paid:':L.netTotal}:* Rs.${fmt(isPortalPay?settledAmount:netAmount)}\n`;
  if(v.showPaymentMethod&&!isPortalPay) msg+=isRet?`${getRefundLabel(payMethod,L,true)}\n`:`${getPaymentLabel(payMethod,L,true)}\n`;

  if(v.showPaidAmount){if(isRet&&returnSettle){if(returnSettle.method==='cash')msg+=`${L.waRefundAmt} Rs.${fmt(returnSettle.cashAmt)}\n`;else if(returnSettle.method==='credit')msg+=`${L.waCreditAdjAmt} Rs.${fmt(returnSettle.creditAmt)}\n`;else msg+=`${L.waExchangeAmt} Rs.${fmt(returnSettle.exchangeAmt)}\n`;}else if(!isRet&&!isPortalPay) msg+=`💵 *${L.paid}* Rs.${fmt(payAmount)}\n`;}

  /* ★ OUTSTANDING */
  if(!isRet){
    if(isReceiptType){
      if(v.showPreviousBalance||v.showNewBalance){
        msg+=`\n━━━━━━━━━━━━━━\n`;
        const title=isInvoiceSettlement||isPortalPay?'Invoice Settlement':(isPayment?'ගෙවීම් ශේෂය':'ණය ශේෂය');
        msg+=`📊 *${title}*\n`;
        if(v.showPreviousBalance) msg+=`${L.waPrevBalance} Rs.${fmt(previousBalance)}\n`;
        if(isInvoiceSettlement||isPortalPay) msg+=`✅ Applied: -Rs.${fmt(settledAmount)}\n`;
        else if(isPayment) msg+=`✅ ${L.paid} -Rs.${fmt(netAmount)}\n`;
        else if(isCredit) msg+=`🔴 ණය: +Rs.${fmt(netAmount)}\n`;
        if(v.showNewBalance) msg+=`${L.waNewBalance} Rs.${fmt(newBalance)}${newBalance<=0.01?' ✅':' ⚠️'}\n`;
      }
    } else {
      if(v.showBalance&&balance>=0.01) msg+=`🔄 *${L.change}:* Rs.${fmt(balance)}\n`;
      if(v.showCreditDue&&isCreditSale&&creditDue>0) msg+=`📝 *${L.creditDue}:* Rs.${fmt(creditDue)}\n`;
      if(v.showPreviousBalance&&isCreditSale){msg+=`\n━━━━━━━━━━━━━━\n`;msg+=`${L.waPrevBalance} Rs.${fmt(previousBalance)}\n`;}
      if(v.showNewBalance&&isCreditSale) msg+=`🔴 *${L.waNewBalance}* Rs.${fmt(newBalance)}\n`;
    }
  } else {
    if(isReturnCreditAdj&&(v.showPreviousBalance||v.showNewBalance)){msg+=`\n━━━━━━━━━━━━━━\n`;msg+=`📊 *${L.balanceReduced}*\n`;if(v.showPreviousBalance)msg+=`${L.waPrevBalance} Rs.${fmt(previousBalance)}\n`;msg+=`${L.waReturnCreditAdj} -Rs.${fmt(returnCreditAmount)}\n`;if(v.showNewBalance)msg+=`${L.waNewBalance} Rs.${fmt(newBalance)}\n`;}
  }

  if(v.showRemarks&&remarks) msg+=`\n📝 ${remarks}\n`;
  msg+=`\n━━━━━━━━━━━━━━\n`;
  if(v.showFooterMessage) msg+=`✅ *${biz.footerMessage||(isRet?'Return Processed!':'Thank You!')}*\n`;
  if(!isRet&&v.showPortalLink&&portalLink) msg+=`\n👤 *ඔබේ ගිණුම:*\n${portalLink}\n`;
  return msg;
}

function buildSMSMessage(invoice,customer,settings,visibility,langKey='en'){
  const v=visibility||DEFAULT_VISIBILITY,biz=settings||{};
  const isRet=isReturnDoc(invoice),isPortalPay=isPortalInvoicePayment(invoice),L=getLang(langKey);
  const items=invoice?.items||[],net=R2(invoice?.netAmount),paid=R2(invoice?.payAmount),bal=R2(invoice?.balance);
  const pm=isRet?(invoice?.refundMethod||'cash'):(invoice?.paymentMethod||invoice?.method||'cash');
  const pl=getPortalLink(customer);
  const oi=getOutstandingInfo(invoice,customer);
  const returnSettle=isRet?getReturnSettlementInfo(invoice):null;
  const {creditDue,isCreditSale,previousBalance,newBalance,isReturnCreditAdj,returnCreditAmount,isReceipt,isPayment,isCredit,isInvoiceSettlement,settledAmount}=oi;
  const isReceiptType=isReceipt||isInvoiceSettlement||isPortalPay;

  let msg='';
  if(v.showBusinessName) msg+=`${biz.businessName||(isRet?L.returnTitle:L.invoiceTitle)}\n`;
  if(v.showInvoiceNo) msg+=`${isRet?L.smsRet:L.smsNo}:${invoice?.invoiceNo||''}\n`;
  if(v.showDate) msg+=`${L.smsDate}:${fmtDate(invoice?.createdAt)}\n`;
  if(v.showCustomerName) msg+=`${L.smsCust}:${invoice?.customerName||'Cash'}\n`;
  if(isPortalPay&&!isRet){msg+=`Paid:Rs.${fmt(settledAmount)}\n`;}
  else if(v.showItemPrices&&items.length>0){msg+=`---\n${isRet?L.smsReturnedItems:L.smsItems}(${items.length})\n`;items.forEach((item,i)=>{const sp=R2(item.sellingPrice),qty=R2(item.qty),lt=R2(item.lineTotal??sp*qty);msg+=`${i+1}.${item.name||''}\n  ${fmt(sp)}x${qty}=Rs.${fmt(lt)}\n`;});msg+=`---\n`;}
  if(!isRet&&!isReceiptType&&v.showGrossTotal&&R2(invoice?.grossTotal)>0)msg+=`${L.smsGross}:Rs.${fmt(R2(invoice.grossTotal))}\n`;
  if(v.showNetAmount) msg+=`${isRet?L.smsRefund:L.smsTotal}:Rs.${fmt(isPortalPay?settledAmount:net)}\n`;
  if(v.showPaymentMethod&&!isPortalPay) msg+=`${L.smsPay}:${isRet?getRefundLabel(pm,L):getPaymentLabel(pm,L)}\n`;
  if(v.showPaidAmount){if(isRet&&returnSettle){if(returnSettle.method==='cash')msg+=`${L.smsRefunded}:Rs.${fmt(returnSettle.cashAmt)}\n`;else if(returnSettle.method==='credit')msg+=`${L.smsCreditAdj}:Rs.${fmt(returnSettle.creditAmt)}\n`;}else if(!isRet&&!isPortalPay) msg+=`${L.smsPaid}:Rs.${fmt(paid)}\n`;}

  /* ★ OUTSTANDING */
  if(!isRet){
    if(isReceiptType){
      if(v.showPreviousBalance) msg+=`${L.smsPrevBal}:Rs.${fmt(previousBalance)}\n`;
      if(isInvoiceSettlement||isPortalPay) msg+=`Applied:-Rs.${fmt(settledAmount)}\n`;
      else if(isPayment) msg+=`Paid:-Rs.${fmt(net)}\n`;
      else if(isCredit) msg+=`Credit:+Rs.${fmt(net)}\n`;
      if(v.showNewBalance) msg+=`${L.smsNewBal}:Rs.${fmt(newBalance)}\n`;
    } else {
      if(v.showBalance&&bal>=0.01) msg+=`${L.smsChange}:Rs.${fmt(bal)}\n`;
      if(v.showCreditDue&&isCreditSale&&creditDue>0) msg+=`${L.smsDue}:Rs.${fmt(creditDue)}\n`;
      if(v.showPreviousBalance&&isCreditSale) msg+=`${L.smsPrevBal}:Rs.${fmt(previousBalance)}\n`;
      if(v.showNewBalance&&isCreditSale) msg+=`${L.smsNewBal}:Rs.${fmt(newBalance)}\n`;
    }
  } else {
    if(isReturnCreditAdj){
      if(v.showPreviousBalance) msg+=`${L.smsPrevBal}:Rs.${fmt(previousBalance)}\n`;
      msg+=`${L.smsCreditReduced}:-Rs.${fmt(returnCreditAmount)}\n`;
      if(v.showNewBalance) msg+=`${L.smsNewBal}:Rs.${fmt(newBalance)}\n`;
    }
  }

  const remarks=invoice?.remarks||invoice?.invoiceRemark||invoice?.note||'';
  if(v.showRemarks&&remarks) msg+=`${L.smsNote}:${remarks}\n`;
  if(v.showFooterMessage) msg+=biz.footerMessage||(isRet?'Return Processed!':'Thank You!');
  return msg;
}

/* ══════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════ */
export default function InvoiceOutputManager({invoice,onClose,initialMode='print',forceVisibility=null}){
  const {user}=useUserAuth();
  const [settings,setSettings]=useState(null);
  const [customer,setCustomer]=useState(null);
  const [activeTab,setActiveTab]=useState('preview');
  const [outputMode,setOutputMode]=useState(initialMode);
  const [loading,setLoading]=useState(true);
  const [printing,setPrinting]=useState(false);
  const [toastMsg,setToastMsg]=useState('');
  const [settingsExpanded,setSettingsExpanded]=useState({});
  const [modeSettings,setModeSettings]=useState(buildDefaultModeSettings);
  const [settingsMode,setSettingsMode]=useState('print');

  const isReturn=isReturnDoc(invoice);
  const isPortalPay=isPortalInvoicePayment(invoice);
  const showToast=useCallback((m)=>{setToastMsg(m);setTimeout(()=>setToastMsg(''),3000);},[]);

  const getModeSettings=useCallback((mode)=>{
    const def=buildDefaultModeSettings(),ms=modeSettings[mode];
    const base={lang:ms?.lang||def[mode]?.lang||'en',visibility:{...DEFAULT_VISIBILITY,...(def[mode]?.visibility||{}),...(ms?.visibility||{})}};
    if(forceVisibility) base.visibility={...base.visibility,...forceVisibility};
    return base;
  },[modeSettings,forceVisibility]);

  const currentLang=getModeSettings(outputMode).lang;
  const currentVisibility=getModeSettings(outputMode).visibility;
  const editingLang=getModeSettings(settingsMode).lang;
  const editingVisibility=getModeSettings(settingsMode).visibility;

  useEffect(()=>{if(!user?.uid||!invoice)return;let a=true;(async()=>{setLoading(true);try{const [ss,ps]=await Promise.all([getDocs(query(collection(db,'invoice_settings'),where('uid','==',user.uid))),getDoc(doc(db,`users/${user.uid}/settings`,'invoiceOutputModes'))]);const cid=invoice.customerId;let rc=null;if(cid&&cid!=='CASH_CUSTOMER'){try{const cs=await getDoc(doc(db,'customers',cid));if(cs.exists())rc={id:cs.id,...cs.data()};}catch{}}if(!a)return;if(!ss.empty)setSettings(ss.docs[0].data());setCustomer(rc);if(ps.exists()){const saved=ps.data();setModeSettings(p=>{const m={...p},d=buildDefaultModeSettings();MODES.forEach(({key:k})=>{const s=saved[k],dd=d[k]||d.print;m[k]={lang:s?.lang||dd.lang,visibility:{...dd.visibility,...(s?.visibility||{})}};});return m;});}}catch(e){console.error(e);if(a)showToast('❌ Load failed');}finally{if(a)setLoading(false);}})();return()=>{a=false;};},[user?.uid,invoice,showToast]);

  useEffect(()=>{const fn=(e)=>{if(e.key==='Escape')onClose();};document.addEventListener('keydown',fn);return()=>document.removeEventListener('keydown',fn);},[onClose]);

  const receiptHTML=useMemo(()=>buildReceiptHTML(invoice,settings,currentVisibility,customer,currentLang),[invoice,settings,currentVisibility,customer,currentLang]);
  const waMessage=useMemo(()=>buildWAMessage(invoice,customer,settings,getModeSettings('whatsapp').visibility,getModeSettings('whatsapp').lang),[invoice,customer,settings,getModeSettings]);
  const smsMessage=useMemo(()=>buildSMSMessage(invoice,customer,settings,getModeSettings('sms').visibility,getModeSettings('sms').lang),[invoice,customer,settings,getModeSettings]);
  const shareMessage=useMemo(()=>buildWAMessage(invoice,customer,settings,getModeSettings('share').visibility,getModeSettings('share').lang),[invoice,customer,settings,getModeSettings]);
  const smsInfo=useMemo(()=>getSMSCount(smsMessage),[smsMessage]);
  const portalLink=useMemo(()=>getPortalLink(customer),[customer]);

  const saveAll=useCallback(async()=>{if(!user?.uid)return;try{await setDoc(doc(db,`users/${user.uid}/settings`,'invoiceOutputModes'),{...modeSettings,updatedAt:serverTimestamp()},{merge:true});showToast('✅ Saved!');}catch(e){showToast(`❌ ${e.message}`);}},[user?.uid,modeSettings,showToast]);
  const setEditLang=useCallback((l)=>setModeSettings(p=>({...p,[settingsMode]:{...p[settingsMode],lang:l}})),[settingsMode]);
  const toggleField=useCallback((k)=>setModeSettings(p=>({...p,[settingsMode]:{...p[settingsMode],visibility:{...DEFAULT_VISIBILITY,...(p[settingsMode]?.visibility||{}),[k]:!(p[settingsMode]?.visibility?.[k]??DEFAULT_VISIBILITY[k])}}})),[settingsMode]);
  const applyPreset=useCallback((pk)=>{const p=PRESETS[pk];if(!p)return;setModeSettings(prev=>({...prev,[settingsMode]:{...prev[settingsMode],visibility:{...DEFAULT_VISIBILITY,...p.config}}}));showToast(`✅ "${p.name}"`);},[settingsMode,showToast]);
  const setAllFlds=useCallback((val)=>setModeSettings(p=>({...p,[settingsMode]:{...p[settingsMode],visibility:Object.fromEntries(Object.keys(DEFAULT_VISIBILITY).map(k=>[k,val]))}})),[settingsMode]);
  const copyFrom=useCallback((f)=>{setModeSettings(p=>({...p,[settingsMode]:{lang:p[f]?.lang||'en',visibility:{...DEFAULT_VISIBILITY,...(p[f]?.visibility||{})}}}));showToast('✅ Copied!');},[settingsMode,showToast]);
  const copyToAll=useCallback(()=>{const c=getModeSettings(settingsMode);setModeSettings(p=>{const u={...p};MODES.forEach(({key:m})=>{u[m]={lang:c.lang,visibility:{...c.visibility}};});return u;});showToast('✅ All!');},[settingsMode,getModeSettings,showToast]);

  const handlePrint=useCallback(async()=>{if(printing)return;setPrinting(true);try{await printViaIframe(receiptHTML);showToast('🖨️ Print!');}catch{showToast('❌ Failed');}finally{setPrinting(false);}},[receiptHTML,printing,showToast]);
  const handleWA=useCallback(()=>{const ph=invoice?.customerPhone||'';if(!ph){showToast('⚠️ No phone');return;}window.open(`https://wa.me/${formatPhoneWA(ph)}?text=${encodeURIComponent(waMessage)}`,'_blank');showToast('📲 WhatsApp!');},[invoice,waMessage,showToast]);
  const handleSMS=useCallback(()=>{const ph=invoice?.customerPhone||'';if(!ph){showToast('⚠️ No phone');return;}window.open(`sms:${formatPhoneSMS(ph)}?body=${encodeURIComponent(smsMessage)}`,'_self');},[invoice,smsMessage,showToast]);
  const handleShare=useCallback(async()=>{try{if(navigator.share)await navigator.share({title:`${isReturn?'Return':'Invoice'} ${invoice?.invoiceNo||''}`,text:shareMessage});else{await navigator.clipboard.writeText(shareMessage);showToast('📋 Copied!');}}catch{}},[invoice,shareMessage,isReturn,showToast]);
  const handleCopy=useCallback(async()=>{try{const t=outputMode==='sms'?smsMessage:outputMode==='share'?shareMessage:outputMode==='print'?receiptHTML.replace(/<[^>]*>/g,''):waMessage;await navigator.clipboard.writeText(t);showToast('📋 Copied!');}catch{showToast('❌ Failed');}},[outputMode,smsMessage,waMessage,shareMessage,receiptHTML,showToast]);

  if(!invoice) return null;

  const headerBg=isReturn?'linear-gradient(135deg,#991b1b,#dc2626)':isPortalPay?'linear-gradient(135deg,#166534,#16a34a)':'linear-gradient(135deg,#1e293b,#334155)';
  const returnSettle=isReturn?getReturnSettlementInfo(invoice):null;

  return(
    <>{toastMsg&&(<div style={{position:'fixed',top:16,left:'50%',transform:'translateX(-50%)',background:'#1e293b',color:'#fff',padding:'10px 20px',borderRadius:10,zIndex:10002,fontWeight:700,fontSize:14,boxShadow:'0 4px 20px rgba(0,0,0,0.4)',whiteSpace:'nowrap'}}>{toastMsg}</div>)}
    <div onClick={(e)=>{if(e.target===e.currentTarget)onClose();}} style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'stretch',justifyContent:'center'}}>
    <div style={{background:'#fff',width:'100%',maxWidth:900,display:'flex',flexDirection:'column',overflow:'hidden'}}>

    <div style={{background:headerBg,color:'#fff',padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
      <div><div style={{fontWeight:900,fontSize:16}}>{isReturn?'↩️ Return Output':isPortalPay?'💰 Payment Receipt':'🧾 Output Manager'}</div><div style={{fontSize:11,color:'#cbd5e1'}}>{invoice?.invoiceNo} — {invoice?.customerName||'Cash'}</div></div>
      <button onClick={onClose} style={{background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',borderRadius:8,padding:'6px 14px',cursor:'pointer',fontWeight:700,fontSize:15}}>✕</button>
    </div>

    {isReturn&&(<div style={{background:returnSettle?.method==='credit'?'#eff6ff':returnSettle?.method==='exchange'?'#fefce8':'#fef2f2',borderBottom:'1px solid',borderColor:returnSettle?.method==='credit'?'#bfdbfe':returnSettle?.method==='exchange'?'#fde047':'#fecaca',padding:'8px 16px',display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
      <span style={{fontSize:18}}>↩️</span>
      <div style={{flex:1}}><div style={{fontWeight:800,fontSize:13,color:'#dc2626'}}>Sales Return</div>{invoice?.originalInvoiceNo&&<div style={{fontSize:11,color:'#64748b'}}>Original: {invoice.originalInvoiceNo}</div>}</div>
      <div style={{textAlign:'right'}}><div style={{fontWeight:900,fontSize:15,color:'#dc2626'}}>Rs.{fmt(R2(invoice?.netAmount))}</div><div style={{fontSize:11,fontWeight:800,marginTop:2,color:returnSettle?.method==='credit'?'#1d4ed8':'#dc2626',background:returnSettle?.method==='credit'?'#dbeafe':'#fecaca',padding:'2px 8px',borderRadius:6}}>{returnSettle?.method==='credit'?'🏦 ණය අඩු':returnSettle?.method==='exchange'?'🔄 Exchange':'💵 Cash Refund'}</div></div>
    </div>)}

    {isPortalPay&&!isReturn&&(<div style={{background:'#f0fdf4',borderBottom:'1px solid #bbf7d0',padding:'8px 16px',display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
      <span style={{fontSize:18}}>💰</span><div style={{flex:1}}><div style={{fontWeight:800,fontSize:13,color:'#16a34a'}}>Payment</div></div>
      <div style={{fontWeight:900,fontSize:15,color:'#16a34a'}}>Rs.{fmt(R2(invoice?.amount||invoice?.netAmount))}</div>
    </div>)}

    {invoice?._isReceipt&&(<div style={{background:invoice._receiptType==='payment'?'#f0fdf4':'#fef2f2',borderBottom:'1px solid',borderColor:invoice._receiptType==='payment'?'#bbf7d0':'#fecaca',padding:'8px 16px',display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
      <span style={{fontSize:18}}>{invoice._receiptType==='payment'?'💰':'➕'}</span>
      <div style={{flex:1}}><div style={{fontWeight:800,fontSize:13,color:invoice._receiptType==='payment'?'#16a34a':'#dc2626'}}>{invoice._receiptType==='payment'?'ගෙවීම්':'ණය ඇතුළු'}</div></div>
      <div style={{fontWeight:900,fontSize:15,color:invoice._receiptType==='payment'?'#16a34a':'#dc2626'}}>Rs.{fmt(R2(invoice?.netAmount))}</div>
    </div>)}

    {portalLink?(<div style={{background:'#f0fdf4',borderBottom:'1px solid #bbf7d0',padding:'6px 16px',fontSize:11,color:'#16a34a',fontWeight:700}}>✅ Portal: <span style={{color:'#1e293b',fontFamily:'monospace'}}>{portalLink}</span></div>):(<div style={{background:'#fef3c7',borderBottom:'1px solid #fde68a',padding:'6px 16px',fontSize:11,color:'#92400e',fontWeight:700}}>⚠️ No portal</div>)}

    <div style={{display:'flex',borderBottom:'2px solid #e2e8f0',flexShrink:0,overflowX:'auto'}}>
      {MODES.map((m)=>{const a=outputMode===m.key;return(<button key={m.key} onClick={()=>setOutputMode(m.key)} style={{flex:1,padding:'10px 4px',border:'none',fontWeight:800,fontSize:12,cursor:'pointer',minWidth:75,background:a?m.color:'#fff',color:a?'#fff':'#64748b',borderBottom:a?`3px solid ${m.color}`:'none',display:'flex',flexDirection:'column',alignItems:'center',gap:2}}><span>{m.icon} {m.label}</span><LangBadge lang={getModeSettings(m.key).lang}/></button>);})}
    </div>

    <div style={{display:'flex',borderBottom:'1px solid #e2e8f0',flexShrink:0}}>
      {[{key:'preview',label:'👁️ Preview'},{key:'settings',label:'⚙️ සැකසුම්'}].map(tb=>(<button key={tb.key} onClick={()=>setActiveTab(tb.key)} style={{flex:1,padding:10,border:'none',fontWeight:700,fontSize:13,cursor:'pointer',background:activeTab===tb.key?'#f1f5f9':'#fff',color:activeTab===tb.key?'#1e293b':'#94a3b8',borderBottom:activeTab===tb.key?'2px solid #3b82f6':'none'}}>{tb.label}</button>))}
    </div>

    <div style={{flex:1,overflow:'auto',padding:16}}>
      {loading?(<div style={{textAlign:'center',padding:60}}><div style={{fontSize:36}}>⏳</div></div>):activeTab==='preview'?(
        <div>
          <div style={{textAlign:'center',marginBottom:10,fontSize:11,color:'#64748b'}}>🌐 {currentLang==='si'?'සිංහල':currentLang==='mixed'?'Mix':'EN'} · {MODES.find(m=>m.key===outputMode)?.icon} {MODES.find(m=>m.key===outputMode)?.label}</div>
          {outputMode==='print'&&(<div style={{maxWidth:380,margin:'0 auto',border:'1px solid #e2e8f0',borderRadius:12,overflow:'hidden',boxShadow:'0 2px 12px rgba(0,0,0,0.08)'}}><div style={{fontFamily:"'Courier New',monospace",fontSize:14,padding:'8px 6px',lineHeight:1.4,color:'#000',fontWeight:900,background:'#fff'}} dangerouslySetInnerHTML={{__html:receiptHTML}}/></div>)}
          {outputMode==='whatsapp'&&(<div style={{maxWidth:420,margin:'0 auto',background:'#e5ddd5',borderRadius:12,padding:16}}><div style={{background:isReturn?'#fde8e8':'#dcf8c6',borderRadius:10,padding:12,fontSize:13,whiteSpace:'pre-wrap',lineHeight:1.6,wordBreak:'break-word'}}>{waMessage}</div></div>)}
          {outputMode==='sms'&&(<div style={{maxWidth:360,margin:'0 auto',background:'#f8fafc',borderRadius:12,padding:16,border:'1px solid #e2e8f0'}}><div style={{fontSize:12,color:'#64748b',marginBottom:8,textAlign:'center'}}>📱 SMS <span style={{padding:'2px 8px',borderRadius:8,fontSize:11,fontWeight:700,background:smsInfo.chars>smsInfo.perSMS?'#fef3c7':'#dcfce7',color:smsInfo.chars>smsInfo.perSMS?'#b45309':'#16a34a'}}>{smsInfo.chars}ch</span></div><div style={{background:'#fff',borderRadius:8,padding:12,fontSize:13,whiteSpace:'pre-wrap',lineHeight:1.6,border:'1px solid #e2e8f0',wordBreak:'break-word',fontFamily:'monospace'}}>{smsMessage}</div></div>)}
          {outputMode==='share'&&(<div style={{maxWidth:420,margin:'0 auto',background:'#f5f3ff',borderRadius:12,padding:16,border:'1px solid #e9e5ff'}}><div style={{background:'#fff',borderRadius:8,padding:12,fontSize:13,whiteSpace:'pre-wrap',lineHeight:1.6,border:'1px solid #e2e8f0',wordBreak:'break-word'}}>{shareMessage}</div></div>)}
        </div>
      ):(
        <div>
          <div style={{background:'#f0f9ff',borderRadius:12,padding:12,marginBottom:16,border:'1px solid #bae6fd'}}>
            <div style={{fontSize:13,fontWeight:800,color:'#0369a1',marginBottom:8}}>🎯 Mode</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{MODES.map((m)=>{const ia=settingsMode===m.key;return(<button key={m.key} onClick={()=>setSettingsMode(m.key)} style={{flex:1,minWidth:70,padding:'9px 4px',borderRadius:8,border:ia?`2px solid ${m.color}`:'1px solid #e2e8f0',background:ia?m.color:'#fff',color:ia?'#fff':'#64748b',fontWeight:800,fontSize:12,cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:3}}><span>{m.icon} {m.label}</span>{!ia&&<LangBadge lang={getModeSettings(m.key).lang}/>}</button>);})}</div>
          </div>
          <LanguageSelector lang={editingLang} onChange={setEditLang} modeLabel={MODES.find(m=>m.key===settingsMode)?.label||''}/>
          <div style={{background:'#fffbeb',borderRadius:10,padding:10,marginBottom:14,border:'1px solid #fde68a'}}>
            <div style={{fontSize:11,fontWeight:700,color:'#b45309',marginBottom:6}}>📋 Copy:</div>
            <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
              {MODES.filter(m=>m.key!==settingsMode).map(m=>(<button key={m.key} onClick={()=>copyFrom(m.key)} style={{padding:'5px 10px',borderRadius:6,border:'1px solid #e2e8f0',background:'#fff',fontWeight:700,fontSize:11,cursor:'pointer'}}>{m.icon}</button>))}
              <button onClick={copyToAll} style={{padding:'5px 10px',borderRadius:6,border:'1px solid #bbf7d0',background:'#f0fdf4',fontWeight:700,fontSize:11,cursor:'pointer',color:'#16a34a'}}>→ All</button>
            </div>
          </div>
          <div style={{marginBottom:14}}><div style={{fontSize:13,fontWeight:800,marginBottom:8}}>⚡ Presets</div><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{Object.entries(PRESETS).map(([k,p])=>(<button key={k} onClick={()=>applyPreset(k)} style={{padding:'7px 14px',borderRadius:8,border:'1px solid #e2e8f0',background:'#f8fafc',fontWeight:700,fontSize:12,cursor:'pointer'}}>{p.name}</button>))}</div></div>
          <div style={{display:'flex',gap:8,marginBottom:14}}><button onClick={()=>setAllFlds(true)} style={{padding:'6px 14px',borderRadius:8,border:'1px solid #bbf7d0',background:'#f0fdf4',color:'#16a34a',fontWeight:700,fontSize:12,cursor:'pointer'}}>✅ ON</button><button onClick={()=>setAllFlds(false)} style={{padding:'6px 14px',borderRadius:8,border:'1px solid #fecaca',background:'#fef2f2',color:'#dc2626',fontWeight:700,fontSize:12,cursor:'pointer'}}>❌ OFF</button></div>
          {VISIBILITY_SECTIONS.map((sec)=>{const ek=`${settingsMode}_${sec.title}`,io=settingsExpanded[ek]!==false,on=sec.fields.filter(f=>editingVisibility[f.key]).length;return(<div key={ek} style={{marginBottom:10,borderRadius:10,border:'1px solid #e2e8f0',overflow:'hidden'}}><button onClick={()=>setSettingsExpanded(p=>({...p,[ek]:!io}))} style={{width:'100%',padding:'10px 14px',border:'none',background:'#f8fafc',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',fontWeight:800,fontSize:14,color:'#1e293b'}}><span>{sec.icon} {sec.title}</span><span style={{display:'flex',alignItems:'center',gap:8}}><span style={{fontSize:11,padding:'2px 8px',borderRadius:10,fontWeight:700,background:on===sec.fields.length?'#dcfce7':'#fef3c7',color:on===sec.fields.length?'#16a34a':'#b45309'}}>{on}/{sec.fields.length}</span><span style={{fontSize:12,color:'#94a3b8'}}>{io?'▲':'▼'}</span></span></button>{io&&(<div style={{padding:'4px 0'}}>{sec.fields.map(f=>(<div key={f.key} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 14px',borderBottom:'1px solid #f8fafc'}}><div><div style={{fontWeight:600,fontSize:13}}>{f.label}</div><div style={{fontSize:11,color:'#94a3b8'}}>{f.labelEn}</div></div><ToggleSwitch checked={!!editingVisibility[f.key]} onChange={()=>toggleField(f.key)}/></div>))}</div>)}</div>);})}
          <div style={{marginTop:20,textAlign:'center'}}><button onClick={saveAll} style={{padding:'14px 40px',background:'#16a34a',color:'#fff',border:'none',borderRadius:10,fontWeight:800,fontSize:15,cursor:'pointer'}}>💾 Save</button></div>
        </div>
      )}
    </div>

    <div style={{padding:'12px 16px',borderTop:'2px solid #e2e8f0',background:'#f8fafc',flexShrink:0,display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center'}}>
      {outputMode==='print'&&(<button onClick={handlePrint} disabled={printing} style={{padding:'12px 28px',background:printing?'#94a3b8':isReturn?'#dc2626':'#2563eb',color:'#fff',border:'none',borderRadius:10,fontWeight:800,fontSize:15,cursor:printing?'wait':'pointer'}}>{printing?'⏳':'🖨️ Print'}</button>)}
      {outputMode==='whatsapp'&&(<button onClick={handleWA} style={{padding:'12px 28px',background:'linear-gradient(135deg,#25D366,#128C7E)',color:'#fff',border:'none',borderRadius:10,fontWeight:800,fontSize:15,cursor:'pointer'}}>📲 WhatsApp</button>)}
      {outputMode==='sms'&&(<button onClick={handleSMS} style={{padding:'12px 28px',background:'#f59e0b',color:'#fff',border:'none',borderRadius:10,fontWeight:800,fontSize:15,cursor:'pointer'}}>📱 SMS</button>)}
      {outputMode==='share'&&(<button onClick={handleShare} style={{padding:'12px 28px',background:isReturn?'#dc2626':'#7c3aed',color:'#fff',border:'none',borderRadius:10,fontWeight:800,fontSize:15,cursor:'pointer'}}>🔗 Share</button>)}
      <button onClick={handleCopy} style={{padding:'12px 20px',background:'#f1f5f9',color:'#374151',border:'1px solid #e2e8f0',borderRadius:10,fontWeight:700,fontSize:13,cursor:'pointer'}}>📋 Copy</button>
      <button onClick={onClose} style={{padding:'12px 20px',background:'#fef2f2',color:'#dc2626',border:'1px solid #fecaca',borderRadius:10,fontWeight:700,fontSize:13,cursor:'pointer'}}>✕ Close</button>
    </div>

    </div></div></>
  );
}