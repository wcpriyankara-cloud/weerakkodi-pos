'use client';

// app/(protected)/return/page.jsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { useUserAuth } from '@/context/UserContext';
import { useLang } from '@/hooks/useLang';
import {
  collection, query, where, getDocs, getDoc,
  addDoc, increment, writeBatch, doc,
  serverTimestamp, orderBy, limit,
} from 'firebase/firestore';

/* ═══════════════════════════════════════
   UTILS
═══════════════════════════════════════ */
const toNum = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  const n = parseFloat(String(val).replace(/,/g, '').trim());
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
};

const fmt = (v) =>
  toNum(v).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const defaultProduct =
  'data:image/svg+xml;base64,' +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<rect width="100" height="100" fill="#f1f5f9" rx="8"/>' +
      '<path d="M30 65 L45 45 L55 55 L70 35 L80 65 H30 Z" fill="#cbd5e1"/>' +
      '<circle cx="70" cy="30" r="5" fill="#fcd34d"/></svg>'
  );

const formatDate = (timestamp) => {
  if (!timestamp) return '-';
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('si-LK', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '-'; }
};

const normalizeText = (text) => {
  if (!text) return '';
  return String(text).normalize('NFC').toLowerCase().trim().replace(/\s+/g, ' ');
};

const roundQty = (v) => Math.round(toNum(v) * 100) / 100;

/* ═══════════════════════════════════════
   HELPERS
═══════════════════════════════════════ */
const getItemDocStock = (item) => {
  if (!item) return 0;
  if (item.stocks && typeof item.stocks === 'object') {
    const keys = Object.keys(item.stocks);
    if (keys.length > 0) {
      const total = keys.reduce((s, k) => s + toNum(item.stocks[k]), 0);
      if (total >= 0) return toNum(total);
    }
  }
  if (item.currentStock != null && item.currentStock !== '') return toNum(item.currentStock);
  if (item.stock != null && item.stock !== '') return toNum(item.stock);
  if (item.openingStock != null && item.openingStock !== '' && !item.updatedAt) return toNum(item.openingStock);
  return 0;
};

const getBatchRemaining = (batchItem) => {
  if (!batchItem) return 0;
  if (batchItem.remainingQty !== undefined && batchItem.remainingQty !== null)
    return Math.max(0, toNum(batchItem.remainingQty));
  return toNum(batchItem.qty || batchItem.quantity);
};

const getEffectivePrice = (item) => {
  if (!item) return 0;
  const yourPrice = toNum(item.yourPrice);
  if (yourPrice > 0) return yourPrice;
  const sellingPrice = toNum(item.sellingPrice);
  const discAmount   = toNum(item.discAmount);
  if (sellingPrice > 0) return Math.max(0, sellingPrice - discAmount);
  const lineTotal = toNum(item.lineTotal || item.netAmount || item.total);
  const qty       = toNum(item.qty) || 1;
  if (lineTotal > 0 && qty > 0) return lineTotal / qty;
  return 0;
};

const buildLineKey = (item, index = 0) =>
  item?.returnLineKey || item?.lineKey || item?.lineId ||
  `${item?.itemId || item?.id || 'item'}__${item?.warrantyCode || ''}__${index}`;

const getSourceBatchAllocations = (invoiceItem) => {
  if (!invoiceItem) return [];
  if (Array.isArray(invoiceItem.batchAllocations) && invoiceItem.batchAllocations.length > 0) {
    return invoiceItem.batchAllocations.map((a) => ({
      batchId:           a.batchId || '',
      invoiceId:         a.invoiceId || a.batchInvoiceId || '',
      invoiceCollection: a.invoiceCollection || a.batchInvoiceCollection || '',
      itemIndex:         a.itemIndex ?? a.batchItemIndex ?? -1,
      supplierName:      a.supplierName || a.batchSupplierName || '',
      buyingNetPrice:    toNum(a.buyingNetPrice || a.batchBuyingNetPrice),
      allocatedQty:      toNum(a.allocatedQty),
    }));
  }
  if (invoiceItem.batchInvoiceId && invoiceItem.batchInvoiceCollection) {
    return [{
      batchId:           invoiceItem.batchId || '',
      invoiceId:         invoiceItem.batchInvoiceId || '',
      invoiceCollection: invoiceItem.batchInvoiceCollection || '',
      itemIndex:         invoiceItem.batchItemIndex ?? -1,
      supplierName:      invoiceItem.batchSupplierName || '',
      buyingNetPrice:    toNum(invoiceItem.batchBuyingNetPrice),
      allocatedQty:      toNum(invoiceItem.qty),
    }];
  }
  return [];
};

/* ═══════════════════════════════════════
   BUILD RETURN OUTPUT INVOICE
═══════════════════════════════════════ */
const buildReturnOutputInvoice = ({ completedReturn, originalInvoice, refundMethod }) => {
  if (!completedReturn) return null;

  const returnId   = completedReturn.returnId || completedReturn.id || '';
  const returnNo   = `RTN-${String(returnId).slice(0, 6).toUpperCase()}`;
  const originalNo =
    completedReturn.originalInvoiceNo ||
    (originalInvoice?.id ? `INV-${originalInvoice.id.slice(0, 6).toUpperCase()}` : '');

  const effectiveRefundMethod = refundMethod || completedReturn.refundMethod || 'cash';
  const methodMap = { cash: 'cash', credit: 'credit', exchange: 'etransfer' };

  const items = (completedReturn.items || []).map((it, idx) => {
    const qty       = toNum(it.returnQty || it.qty || 1);
    const unitPrice =
      toNum(it.effectivePrice || it.yourPrice || it.sellingPrice) ||
      (qty > 0 ? toNum(it.returnAmount) / qty : 0);
    return {
      id:           `${returnId}-${idx}`,
      itemId:       it.itemId || '',
      name:         it.name || `Item ${idx + 1}`,
      nameSi:       it.nameSi || '',
      qty,
      sellingPrice: unitPrice,
      yourPrice:    unitPrice,
      lineTotal:    toNum(it.returnAmount || unitPrice * qty),
      uom:          it.uom || 'unit',
      warrantyCode: '',
      photoURL:     it.photoURL || '',
    };
  });

  const total   = toNum(completedReturn.totalReturnAmount);
  const remarks = [
    'Sales Return',
    originalNo ? `Original: ${originalNo}` : '',
    completedReturn.reason || '',
  ].filter(Boolean).join(' | ');

  const createdAt =
    completedReturn.createdAt?.toDate
      ? completedReturn.createdAt
      : completedReturn.createdAt
        ? { toDate: () => new Date(completedReturn.createdAt) }
        : { toDate: () => new Date() };

  return {
    id:          `return-${returnId}`,
    invoiceNo:   returnNo,
    invoiceCode: returnNo,
    customerId:  completedReturn.customerId || originalInvoice?.customerId || '',
    customerName:
      completedReturn.customerName || originalInvoice?.customerName || 'Cash Customer',
    customerPhone:
      completedReturn.customerPhone || originalInvoice?.customerPhone || '',
    customerAddress:
      completedReturn.customerAddress || originalInvoice?.customerAddress || '',
    items,
    grossTotal:          total,
    totalDiscount:       0,
    billDiscount:        0,
    billDiscountPercent: 0,
    exchangeAmount:      0,
    returnAmount:        0,
    netAmount:           total,
    payAmount:           effectiveRefundMethod === 'exchange' ? 0 : total,
    balance:             0,
    paymentMethod:       methodMap[effectiveRefundMethod] || 'cash',
    refundMethod:        effectiveRefundMethod,
    remarks,
    invoiceRemark:       remarks,
    previousOutstanding: 0,
    newOutstanding:      0,
    createdAt,
    status:              'completed',
    _docType:            'return',
    _returnId:           returnId,
    originalInvoiceNo:   originalNo,
    refundMethodLabel:
      effectiveRefundMethod === 'cash'
        ? 'Cash Refund'
        : effectiveRefundMethod === 'credit'
          ? 'Credit Adjustment'
          : 'Exchange',
  };
};

/* ═══════════════════════════════════════
   TRANSLATIONS
═══════════════════════════════════════ */
const TRANSLATIONS = {
  si: {
    pageTitle:           'Sales Return (විකුණුම් ආපසු භාර ගැනීම)',
    searchPlaceholder:   'පාරිභෝගික නම, දුරකථන අංකය හෝ Invoice ID...',
    customer:            'පාරිභෝගිකයා',
    purchasedQty:        'මිලදී ගත් ප්‍රමාණය',
    returnQty:           'ආපසු ප්‍රමාණය',
    alreadyReturned:     'කලින් Return කළ',
    availableToReturn:   'Return කළ හැකි',
    maxReturnExceeded:   'උපරිම ප්‍රමාණය ඉක්මවා ඇත!',
    selectItemsToReturn: 'ආපසු භාර දෙන භාණ්ඩ තෝරන්න!',
    refundMethod:        'ආපසු ගෙවීම් ක්‍රමය',
    cashRefund:          'මුදල් ආපසු',
    creditRefund:        'ණය අඩු කරන්න',
    exchangeRefund:      'හුවමාරුව',
    returnReason:        'ආපසු දීමේ හේතුව',
    reasonPlaceholder:   'හේතුව මෙහි ලියන්න...',
    totalRefund:         'මුළු ආපසු වටිනාකම',
    confirmReturn:       'Return තහවුරු කරන්න',
    processing:          'සකසමින්...',
    stockNote:           'තොගය (Stock) නිවැරදිව නැවත update වේ.',
    creditNote:          'පාරිභෝගික ණය (Credit) අඩු වේ.',
    exchangeNote:        'Stock පමණක් update වේ. මුදල් ආපසු ගෙවන්නේ නැත.',
    successMsg:          'Return සාර්ථකව සම්පූර්ණ විය!',
    returnId:            'Return අංකය',
    newReturn:           'තවත් Return',
    fullyReturned:       'සම්පූර්ණයෙන් Return කර ඇත',
    partiallyReturned:   'අර්ධ වශයෙන් Return කර ඇත',
    itemFullyReturned:   'මෙම භාණ්ඩය සම්පූර්ණයෙන් Return කර ඇත',
    originalInvoice:     'මුල් ඉන්වොයිසය',
    invoiceResults:      'ඉන්වොයිස් හමු විය',
    changeInvoice:       'වෙනත් ඉන්වොයිසයක් තෝරන්න',
    step1:               'ඉන්වොයිසය සොයන්න',
    step2:               'භාණ්ඩ තෝරන්න',
    step3:               'තහවුරු කරන්න',
    confirmTitle:        'Return තහවුරු කරන්න',
    back:                'ආපසු',
    next:                'ඊළඟ පියවරට',
    creditInfo:          'පාරිභෝගිකයාගේ ණය ශේෂයෙන් අඩු කෙරේ',
    items:               'භාණ්ඩ',
    done:                'සම්පූර්ණයි!',
    sendReturn:          'Return බිල්පත යවන්න',
    cashCustomer:        'Cash Customer',
    loadingInvoices:     'සියලුම ඉන්වොයිස් පූරණය වෙමින්...',
    totalInvoices:       'මුළු ඉන්වොයිස්',
    searchHint:          'පාරිභෝගික නම ටයිප් කරන්න - ඔහුගේ සියලුම බිල්පත් පෙන්වයි',
    typeToSearch:        'ඉහත ටයිප් කර සොයන්න...',
    noMatch:             'ගැලපෙන ඉන්වොයිස් නැත',
    reloadBtn:           'නැවත පූරණය',
    allLoaded:           'සියල්ල පූරණය විය',
    returnHistory:       'Return ඉතිහාසය',
    pastReturns:         'පැරණි Returns',
    noReturns:           'Returns හමු නොවීය',
    sendBill:            'යවන්න',
    loadingReturns:      'Returns පූරණය වෙමින්...',
    refund:              'ආපසු',
    method:              'ක්‍රමය',
    original:            'මුල් Invoice',
    newReturnTab:        'නව Return',
  },
  en: {
    pageTitle:           'Sales Return',
    searchPlaceholder:   'Customer name, phone or Invoice ID...',
    customer:            'Customer',
    purchasedQty:        'Purchased Qty',
    returnQty:           'Return Qty',
    alreadyReturned:     'Already Returned',
    availableToReturn:   'Available to Return',
    maxReturnExceeded:   'Max quantity exceeded!',
    selectItemsToReturn: 'Select items to return!',
    refundMethod:        'Refund Method',
    cashRefund:          'Cash Refund',
    creditRefund:        'Credit Adjustment',
    exchangeRefund:      'Exchange',
    returnReason:        'Return Reason',
    reasonPlaceholder:   'Enter reason here...',
    totalRefund:         'Total Refund',
    confirmReturn:       'Confirm Return',
    processing:          'Processing...',
    stockNote:           'Stock will be updated correctly.',
    creditNote:          'Customer credit balance will be reduced.',
    exchangeNote:        'Only stock will be updated. No cash refund.',
    successMsg:          'Return completed successfully!',
    returnId:            'Return ID',
    newReturn:           'New Return',
    fullyReturned:       'Fully Returned',
    partiallyReturned:   'Partially Returned',
    itemFullyReturned:   'This item has been fully returned',
    originalInvoice:     'Original Invoice',
    invoiceResults:      'invoices found',
    changeInvoice:       'Select another invoice',
    step1:               'Find Invoice',
    step2:               'Select Items',
    step3:               'Confirm',
    confirmTitle:        'Confirm Return',
    back:                'Back',
    next:                'Next Step',
    creditInfo:          'Will be deducted from customer credit balance',
    items:               'items',
    done:                'Done!',
    sendReturn:          'Send Return Bill',
    cashCustomer:        'Cash Customer',
    loadingInvoices:     'Loading all invoices...',
    totalInvoices:       'Total invoices',
    searchHint:          'Type customer name to see all their invoices',
    typeToSearch:        'Type above to search...',
    noMatch:             'No matching invoices',
    reloadBtn:           'Reload',
    allLoaded:           'All loaded',
    returnHistory:       'Return History',
    pastReturns:         'Past Returns',
    noReturns:           'No returns found',
    sendBill:            'Send',
    loadingReturns:      'Loading returns...',
    refund:              'Refund',
    method:              'Method',
    original:            'Original Invoice',
    newReturnTab:        'New Return',
  },
};

/* ═══════════════════════════════════════
   RETURN HISTORY LIST
═══════════════════════════════════════ */
function ReturnHistoryList({ user, t, onSend }) {
  const [returns,  setReturns]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [search,   setSearch]   = useState('');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const q = query(
      collection(db, 'returns'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    getDocs(q)
      .then((snap) => {
        setReturns(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [user]);

  const filtered = useMemo(() => {
    const term = normalizeText(search);
    if (!term) return returns;
    return returns.filter((r) => {
      const hay = [
        normalizeText(r.customerName),
        normalizeText(r.customerPhone),
        normalizeText(r.originalInvoiceNo),
        String(r.id || '').toLowerCase(),
      ].join(' ');
      return term.split(/\s+/).every((w) => hay.includes(w));
    });
  }, [returns, search]);

  if (loading) return (
    <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#dc2626', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 10px' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      {t.loadingReturns}
    </div>
  );

  if (error) return (
    <div style={{ padding: 16, color: '#dc2626', textAlign: 'center' }}>Error: {error}</div>
  );

  return (
    <div>
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, pointerEvents: 'none' }}>🔍</span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Return ID / Customer / Phone..."
          style={{ width: '100%', padding: '11px 36px 11px 38px', borderRadius: 10, border: '1.5px solid #fecaca', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16 }}>X</button>
        )}
      </div>

      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>{filtered.length} returns found</div>

      {filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
          {t.noReturns}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((ret) => {
            const isOpen   = expanded === ret.id;
            const returnNo = `RTN-${String(ret.id).slice(0, 6).toUpperCase()}`;
            const refLabel =
              ret.refundMethod === 'cash'    ? 'Cash Refund' :
              ret.refundMethod === 'credit'  ? 'Credit'      : 'Exchange';

            return (
              <div key={ret.id} style={{ background: 'white', borderRadius: 12, border: '1px solid #fecaca', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <div onClick={() => setExpanded(isOpen ? null : ret.id)} style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: '#dc2626', marginBottom: 3 }}>↩️ {returnNo}</div>
                    <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 600 }}>👤 {ret.customerName || t.cashCustomer}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span>📅 {formatDate(ret.createdAt)}</span>
                      {ret.originalInvoiceNo && <span>🧾 {ret.originalInvoiceNo}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontWeight: 900, fontSize: 17, color: '#dc2626', marginBottom: 4 }}>Rs.{fmt(ret.totalReturnAmount)}</div>
                    <div style={{ fontSize: 10, background: '#fef2f2', color: '#dc2626', padding: '2px 8px', borderRadius: 10, fontWeight: 700, marginBottom: 4 }}>{refLabel}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>{isOpen ? 'A' : 'V'}</div>
                  </div>
                </div>

                {isOpen && (
                  <div style={{ borderTop: '1px solid #fef2f2', padding: '12px 14px', background: '#fff9f9' }}>
                    <div style={{ marginBottom: 12 }}>
                      {(ret.items || []).map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: idx < ret.items.length - 1 ? '1px solid #fef2f2' : 'none', fontSize: 13 }}>
                          <div>
                            <div style={{ fontWeight: 600 }}>{item.name || `Item ${idx + 1}`}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                              Rs.{fmt(item.effectivePrice || item.yourPrice || item.sellingPrice)} x {item.returnQty}
                            </div>
                          </div>
                          <div style={{ fontWeight: 700, color: '#dc2626', fontSize: 14 }}>Rs.{fmt(item.returnAmount)}</div>
                        </div>
                      ))}
                    </div>

                    {ret.reason && (
                      <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', marginBottom: 10, padding: '6px 10px', background: '#f8fafc', borderRadius: 6 }}>
                        📝 "{ret.reason}"
                      </div>
                    )}

                    <button
                      onClick={() => onSend(ret)}
                      style={{ width: '100%', padding: '13px 16px', background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: 'white', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
                    >
                      📤 {t.sendBill}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════ */
export default function ReturnPage() {
  const { user }     = useUserAuth();
  const { lang }     = useLang();
  const t            = useMemo(() => TRANSLATIONS[lang] || TRANSLATIONS.si, [lang]);

  const [allInvoices,     setAllInvoices]     = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoicesError,   setInvoicesError]   = useState('');
  const [directId,        setDirectId]        = useState('');
  const [directSearching, setDirectSearching] = useState(false);
  const [searchText,      setSearchText]      = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [returnItems,     setReturnItems]     = useState([]);
  const [returnReason,    setReturnReason]    = useState('');
  const [refundMethod,    setRefundMethod]    = useState('cash');
  const [isProcessing,    setIsProcessing]    = useState(false);
  const [toastMsg,        setToastMsg]        = useState('');
  const [step,            setStep]            = useState('search');
  const [completedReturn, setCompletedReturn] = useState(null);
  const [showDebug,       setShowDebug]       = useState(false);
  const [outputInvoice,   setOutputInvoice]   = useState(null);
  const [activeTab,       setActiveTab]       = useState('new');

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 4000);
  }, []);

  /* ── Load Invoices ── */
  const loadAllInvoices = useCallback(async () => {
    if (!user) return;
    setInvoicesLoading(true);
    setInvoicesError('');
    try {
      const q    = query(collection(db, 'invoices'), where('uid', '==', user.uid));
      const snap = await getDocs(q);

      const invoices = [];
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.status === 'draft') return;

        const customerName =
          data.customerName || data.customer_name || data.customer?.name ||
          data.billTo || data.buyerName || '';
        const customerPhone =
          data.customerPhone || data.customer_phone || data.customer?.phone ||
          data.phone || data.mobile || '';

        const sid    = d.id.slice(0, 6).toLowerCase();
        const fullId = d.id.toLowerCase();

        const searchParts = [
          normalizeText(customerName), normalizeText(customerPhone),
          fullId, sid, `inv-${sid}`, `inv${sid}`,
          normalizeText(data.invoiceNo),
        ];

        if (Array.isArray(data.items)) {
          data.items.forEach((item) => {
            if (item.name)     searchParts.push(normalizeText(item.name));
            if (item.itemName) searchParts.push(normalizeText(item.itemName));
          });
        }

        invoices.push({
          id: d.id, ...data,
          customerName, customerPhone,
          _search: searchParts.filter(Boolean).join(' '),
          _sid:    sid,
        });
      });

      invoices.sort((a, b) => {
        const dA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const dB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return dB - dA;
      });

      setAllInvoices(invoices);
    } catch (error) {
      console.error('Load error:', error);
      setInvoicesError(error.message);
    } finally {
      setInvoicesLoading(false);
    }
  }, [user]);

  useEffect(() => { if (user) loadAllInvoices(); }, [user, loadAllInvoices]);

  /* ── Direct ID Search ── */
  const searchById = useCallback(async () => {
    const raw = directId.trim();
    if (!raw || !user) { showToast('Invoice ID ඇතුළත් කරන්න'); return; }
    setDirectSearching(true);
    try {
      const tries = [raw, raw.toUpperCase(), raw.toLowerCase(), raw.replace(/^inv-?/i, ''), raw.replace(/^inv-?/i, '').toUpperCase()];
      for (const id of tries) {
        const cached = allInvoices.find((inv) => inv.id === id || inv.id.toLowerCase() === id.toLowerCase() || inv._sid === id.toLowerCase());
        if (cached) { selectInvoice(cached); return; }
      }
      for (const id of tries) {
        try {
          const snap = await getDoc(doc(db, 'invoices', id));
          if (snap.exists() && snap.data().uid === user.uid) {
            const data = snap.data();
            selectInvoice({ id: snap.id, ...data, customerName: data.customerName || '', customerPhone: data.customerPhone || '', _search: '', _sid: snap.id.slice(0, 6).toLowerCase() });
            return;
          }
        } catch {}
      }
      showToast(`"${raw}" හමු නොවීය`);
    } catch (err) {
      showToast(err.message);
    } finally {
      setDirectSearching(false);
    }
  }, [directId, user, allInvoices, showToast]);

  /* ── Filter ── */
  const filteredInvoices = useMemo(() => {
    const input = normalizeText(searchText);
    if (!input) return [];
    const terms = input.split(/\s+/).filter(Boolean);
    return allInvoices.filter((inv) => terms.every((term) => inv._search.includes(term)));
  }, [searchText, allInvoices]);

  const customerSummary = useMemo(() => {
    if (filteredInvoices.length === 0) return null;
    const map = {};
    filteredInvoices.forEach((inv) => {
      const name = inv.customerName || t.cashCustomer;
      if (!map[name]) map[name] = { count: 0, total: 0 };
      map[name].count++;
      map[name].total += toNum(inv.netAmount || inv.grandTotal);
    });
    return map;
  }, [filteredInvoices, t.cashCustomer]);

  /* ── Select Invoice ── */
  const selectInvoice = async (inv) => {
    setSelectedInvoice(inv);

    const returnedByLine = {};
    const returnedByItem = {};

    if (Array.isArray(inv.returnedItems)) {
      inv.returnedItems.forEach((ri) => {
        const qty     = toNum(ri.returnQty);
        const lineKey = ri.returnLineKey || ri.lineKey || '';
        if (lineKey) returnedByLine[lineKey] = toNum(returnedByLine[lineKey]) + qty;
        else if (ri.itemId) returnedByItem[ri.itemId] = toNum(returnedByItem[ri.itemId]) + qty;
      });
    }

    try {
      const rq = query(collection(db, 'returns'), where('originalInvoiceId', '==', inv.id), where('uid', '==', user.uid));
      const rs = await getDocs(rq);
      const dbByLine = {};
      const dbByItem = {};
      rs.docs.forEach((rd) => {
        (rd.data().items || []).forEach((ri) => {
          const qty     = toNum(ri.returnQty);
          const lineKey = ri.returnLineKey || ri.lineKey || '';
          if (lineKey) dbByLine[lineKey] = toNum(dbByLine[lineKey]) + qty;
          else if (ri.itemId) dbByItem[ri.itemId] = toNum(dbByItem[ri.itemId]) + qty;
        });
      });
      Object.entries(dbByLine).forEach(([k, v]) => { returnedByLine[k] = Math.max(toNum(returnedByLine[k]), toNum(v)); });
      Object.entries(dbByItem).forEach(([k, v]) => { returnedByItem[k] = Math.max(toNum(returnedByItem[k]), toNum(v)); });
    } catch (e) { console.error('Returns fetch error:', e); }

    const items = (inv.items || []).map((item, index) => {
      const itemId         = item.itemId || item.id || '';
      const lineKey        = buildLineKey(item, index);
      const already        = toNum(returnedByLine[lineKey] || returnedByItem[itemId] || 0);
      const originalQty    = toNum(item.qty);
      const availableQty   = Math.max(0, originalQty - already);
      const effectivePrice = Math.round(getEffectivePrice(item) * 100) / 100;
      return { ...item, itemId, lineKey, originalQty, alreadyReturned: already, availableQty, returnQty: 0, selected: false, effectivePrice, sourceBatchAllocations: getSourceBatchAllocations(item) };
    });

    setReturnItems(items);
    setReturnReason('');
    setRefundMethod('cash');
    setStep('items');
  };

  const toggleItem = (index) => {
    setReturnItems((prev) => prev.map((item, i) => {
      if (i !== index || item.availableQty <= 0) return item;
      const selected = !item.selected;
      return { ...item, selected, returnQty: selected ? item.availableQty : 0 };
    }));
  };

  const updateReturnQty = (index, qty) => {
    const val = toNum(qty);
    setReturnItems((prev) => prev.map((item, i) => {
      if (i !== index) return item;
      const valid = Math.min(Math.max(0, val), item.availableQty);
      return { ...item, returnQty: valid, selected: valid > 0 };
    }));
  };

  const toggleSelectAll = () => {
    const allSelected = returnItems.every((i) => i.selected || i.availableQty === 0);
    setReturnItems((prev) => prev.map((item) => ({
      ...item,
      selected:  allSelected ? false : item.availableQty > 0,
      returnQty: allSelected ? 0    : item.availableQty,
    })));
  };

  const itemsToReturn = useMemo(
    () => returnItems.filter((i) => i.selected && i.returnQty > 0),
    [returnItems]
  );

  const totalRefund = useMemo(
    () => Math.round(itemsToReturn.reduce((s, i) => s + i.effectivePrice * i.returnQty, 0) * 100) / 100,
    [itemsToReturn]
  );

  const selectedCount   = itemsToReturn.length;
  const hasBatchRestore = useMemo(
    () => itemsToReturn.some((i) => Array.isArray(i.sourceBatchAllocations) && i.sourceBatchAllocations.length > 0),
    [itemsToReturn]
  );

  /* ── Process Return ── */
  const processReturn = async () => {
    if (!itemsToReturn.length) { showToast(t.selectItemsToReturn); return; }
    for (const item of itemsToReturn) {
      if (item.returnQty > item.availableQty) { showToast(`${item.name}: ${t.maxReturnExceeded}`); return; }
    }

    setIsProcessing(true);
    try {
      const fbBatch      = writeBatch(db);
      const returnDocRef = doc(collection(db, 'returns'));

      const normalizedReturnItems = itemsToReturn.map((i, idx) => ({
        itemId:         i.itemId,
        name:           i.name,
        photoURL:       i.photoURL || '',
        sellingPrice:   toNum(i.sellingPrice),
        discAmount:     toNum(i.discAmount),
        yourPrice:      toNum(i.yourPrice),
        effectivePrice: toNum(i.effectivePrice),
        originalQty:    toNum(i.originalQty),
        returnQty:      toNum(i.returnQty),
        returnAmount:   Math.round(i.effectivePrice * i.returnQty * 100) / 100,
        priceType:      i.priceType || 'retail',
        uom:            i.uom || 'unit',
        returnLineKey:  i.lineKey || buildLineKey(i, idx),
        invoiceItemIndex: idx,
        sourceBatchAllocations: Array.isArray(i.sourceBatchAllocations) ? i.sourceBatchAllocations : [],
      }));

      const returnData = {
        uid:               user.uid,
        originalInvoiceId: selectedInvoice.id,
        originalInvoiceNo: selectedInvoice.invoiceNo || `INV-${selectedInvoice.id.slice(0, 6).toUpperCase()}`,
        customerId:        selectedInvoice.customerId || '',
        customerName:      selectedInvoice.customerName || '',
        customerPhone:     selectedInvoice.customerPhone || '',
        items:             normalizedReturnItems,
        totalReturnAmount: totalRefund,
        refundMethod,
        reason:            returnReason,
        createdAt:         serverTimestamp(),
        status:            'completed',
      };

      fbBatch.set(returnDocRef, returnData);

      const batchRestoreMap      = {};
      const returnedQtyByItem    = {};

      normalizedReturnItems.forEach((item) => {
        returnedQtyByItem[item.itemId] = toNum(returnedQtyByItem[item.itemId]) + toNum(item.returnQty);
        const allocs = Array.isArray(item.sourceBatchAllocations) ? item.sourceBatchAllocations : [];
        if (allocs.length === 0) return;
        const allocTotal = allocs.reduce((s, a) => s + toNum(a.allocatedQty), 0) || toNum(item.originalQty) || toNum(item.returnQty);
        let remaining = toNum(item.returnQty);
        allocs.forEach((alloc, idx) => {
          let restoreQty = 0;
          if (idx === allocs.length - 1) { restoreQty = remaining; }
          else {
            const prop = allocTotal > 0 ? toNum(alloc.allocatedQty) / allocTotal : 0;
            restoreQty = Math.min(roundQty(item.returnQty * prop), remaining);
          }
          remaining = roundQty(remaining - restoreQty);
          if (restoreQty <= 0 || !alloc.invoiceId || !alloc.invoiceCollection || alloc.itemIndex === undefined || alloc.itemIndex === null || alloc.itemIndex < 0) return;
          const key = `${alloc.invoiceCollection}/${alloc.invoiceId}`;
          if (!batchRestoreMap[key]) batchRestoreMap[key] = { col: alloc.invoiceCollection, docId: alloc.invoiceId, updates: [] };
          batchRestoreMap[key].updates.push({ index: alloc.itemIndex, qty: restoreQty });
        });
      });

      const affectedItemIds = [...new Set(normalizedReturnItems.map((i) => i.itemId).filter(Boolean))];
      const currentItemDocStockMap = {};
      const exactBatchTotals       = {};
      const itemHasAnyBatch        = {};

      await Promise.all(
        affectedItemIds.map(async (itemId) => {
          try {
            const snap = await getDoc(doc(db, 'items', itemId));
            currentItemDocStockMap[itemId] = snap.exists() ? getItemDocStock(snap.data()) : 0;
          } catch { currentItemDocStockMap[itemId] = 0; }
        })
      );

      const purchaseCollections = ['purchases', 'purchaseInvoices', 'stockIn'];
      for (const colName of purchaseCollections) {
        const snap = await getDocs(query(collection(db, colName), where('uid', '==', user.uid)));
        snap.docs.forEach((ds) => {
          const refKey = `${colName}/${ds.id}`;
          const data   = ds.data();
          const items  = [...(data.items || [])];
          if (batchRestoreMap[refKey]) {
            batchRestoreMap[refKey].updates.forEach(({ index, qty }) => {
              if (index >= 0 && index < items.length) {
                const currentRem   = toNum(items[index].remainingQty ?? items[index].qty ?? items[index].quantity);
                const purchasedQty = toNum(items[index].qty || items[index].quantity);
                items[index] = { ...items[index], remainingQty: Math.min(purchasedQty, roundQty(currentRem + qty)) };
              }
            });
            fbBatch.update(doc(db, colName, ds.id), { items, updatedAt: serverTimestamp() });
          }
          items.forEach((it) => {
            const itemId = it.itemId || it.id;
            if (!itemId || !affectedItemIds.includes(itemId)) return;
            itemHasAnyBatch[itemId]  = true;
            exactBatchTotals[itemId] = roundQty(toNum(exactBatchTotals[itemId]) + getBatchRemaining(it));
          });
        });
      }

      affectedItemIds.forEach((itemId) => {
        const hasBatch   = !!itemHasAnyBatch[itemId];
        const fallback   = roundQty(toNum(currentItemDocStockMap[itemId]) + toNum(returnedQtyByItem[itemId]));
        const exactStock = hasBatch ? roundQty(exactBatchTotals[itemId]) : fallback;
        fbBatch.update(doc(db, 'items', itemId), { stock: exactStock, currentStock: exactStock, 'stocks.Main_Store': exactStock, updatedAt: serverTimestamp() });
      });

      const customerId     = selectedInvoice.customerId;
      const isCashCustomer = !customerId || customerId === 'CASH_CUSTOMER' || customerId === 'walk-in';
      if (!isCashCustomer && refundMethod === 'credit') {
        fbBatch.update(doc(db, 'customers', customerId), { currentBalance: increment(-totalRefund) });
      }

      const existingReturnedItems   = Array.isArray(selectedInvoice.returnedItems) ? selectedInvoice.returnedItems : [];
      const appendedReturnedItems   = [
        ...existingReturnedItems,
        ...normalizedReturnItems.map((i) => ({
          itemId: i.itemId, name: i.name, returnQty: i.returnQty, returnAmount: i.returnAmount,
          returnedAt: new Date().toISOString(), returnDocId: returnDocRef.id, refundMethod, returnLineKey: i.returnLineKey,
        })),
      ];

      const allFullyReturned = returnItems.every((item) => {
        const nowRet = normalizedReturnItems.find((r) => r.returnLineKey === item.lineKey)?.returnQty || 0;
        return roundQty(item.alreadyReturned + nowRet) >= roundQty(item.originalQty);
      });

      fbBatch.update(doc(db, 'invoices', selectedInvoice.id), {
        returnedItems: appendedReturnedItems,
        returnStatus:  allFullyReturned ? 'full' : 'partial',
        lastReturnAt:  serverTimestamp(),
      });

      await fbBatch.commit();

      const finalReturn = { returnId: returnDocRef.id, id: returnDocRef.id, ...returnData };
      setCompletedReturn(finalReturn);
      setStep('done');
      showToast(t.successMsg);
      setOutputInvoice(buildReturnOutputInvoice({ completedReturn: finalReturn, originalInvoice: selectedInvoice, refundMethod }));
      loadAllInvoices();
    } catch (error) {
      console.error('Return error:', error);
      showToast(error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const resetForm = () => {
    setSearchText(''); setSelectedInvoice(null); setReturnItems([]);
    setReturnReason(''); setRefundMethod('cash'); setCompletedReturn(null);
    setDirectId(''); setStep('search');
  };

  const handleSendPastReturn = useCallback((returnDoc) => {
    setOutputInvoice(buildReturnOutputInvoice({
      completedReturn: { ...returnDoc, returnId: returnDoc.id },
      originalInvoice: null,
      refundMethod:    returnDoc.refundMethod || 'cash',
    }));
  }, []);

  /* ═══════════════════════════════════════
     RENDER
  ═══════════════════════════════════════ */
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 16, backgroundColor: '#f8fafc', minHeight: '100vh' }}>

      {/* Toast */}
      {toastMsg && (
        <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', background: '#334155', color: '#fff', padding: '12px 24px', borderRadius: 10, zIndex: 9999, fontSize: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', maxWidth: '90%', textAlign: 'center' }}>
          {toastMsg}
        </div>
      )}

      {/* OutputManager — dynamic import to avoid SSR issues */}
      {outputInvoice && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }}>
          <div style={{ padding: 20, background: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'white', borderRadius: 16, padding: 24, maxWidth: 500, width: '100%' }}>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, color: '#dc2626' }}>
                📤 Return Bill — {outputInvoice.invoiceNo}
              </div>
              <div style={{ fontSize: 14, color: '#475569', marginBottom: 8 }}>
                👤 {outputInvoice.customerName}
              </div>
              <div style={{ fontSize: 14, color: '#475569', marginBottom: 8 }}>
                💰 Total: Rs. {fmt(outputInvoice.netAmount)}
              </div>
              <div style={{ fontSize: 14, color: '#475569', marginBottom: 16 }}>
                🔄 Method: {outputInvoice.refundMethodLabel}
              </div>
              <button
                onClick={() => setOutputInvoice(null)}
                style={{ width: '100%', padding: 14, background: '#dc2626', color: 'white', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: 'white', padding: '20px 24px', borderRadius: 16, marginBottom: 20, boxShadow: '0 4px 15px rgba(220,38,38,0.3)' }}>
        <h2 style={{ margin: 0, fontSize: 22 }}>↩️ {t.pageTitle}</h2>
      </div>

      {/* Tab Switcher */}
      <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 12, padding: 4, marginBottom: 20, gap: 4 }}>
        {[
          { key: 'new',     label: `➕ ${t.newReturnTab}` },
          { key: 'history', label: `↩️ ${t.returnHistory}` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1, padding: '11px 8px', border: 'none', borderRadius: 10,
              fontWeight: 800, fontSize: 14, cursor: 'pointer',
              background: activeTab === tab.key ? (tab.key === 'new' ? '#dc2626' : '#6366f1') : 'transparent',
              color:      activeTab === tab.key ? 'white' : '#64748b',
              transition: 'all 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* HISTORY TAB */}
      {activeTab === 'history' && (
        <div style={{ background: 'white', borderRadius: 16, padding: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
          <h3 style={{ margin: '0 0 16px', color: '#dc2626', fontSize: 18 }}>↩️ {t.pastReturns}</h3>
          <ReturnHistoryList user={user} t={t} onSend={handleSendPastReturn} />
        </div>
      )}

      {/* NEW RETURN TAB */}
      {activeTab === 'new' && (
        <>
          {/* Step indicator */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
            {[
              { key: 'search',  label: `① ${t.step1}` },
              { key: 'items',   label: `② ${t.step2}` },
              { key: 'confirm', label: `③ ${t.step3}` },
            ].map((s, idx) => {
              const ci     = ['search', 'items', 'confirm', 'done'].indexOf(step);
              const active = step === s.key || (step === 'done' && idx === 2);
              const past   = ci > idx;
              return (
                <div key={s.key} style={{ flex: 1, textAlign: 'center', padding: '8px 4px', fontSize: 13, fontWeight: 'bold', borderRadius: 8, background: active ? '#dc2626' : past ? '#f87171' : '#fecaca', color: active || past ? 'white' : '#991b1b' }}>
                  {s.label}
                </div>
              );
            })}
          </div>

          {/* STEP 1: SEARCH */}
          {step === 'search' && (
            <div style={{ background: 'white', borderRadius: 16, padding: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
              {invoicesLoading && (
                <div style={{ textAlign: 'center', padding: 30, color: '#64748b' }}>
                  <div style={{ width: 40, height: 40, border: '4px solid #e2e8f0', borderTopColor: '#dc2626', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                  <div>{t.loadingInvoices}</div>
                </div>
              )}

              {invoicesError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 14, marginBottom: 16, color: '#dc2626', fontSize: 14, textAlign: 'center' }}>
                  Error: {invoicesError}
                  <br />
                  <button onClick={loadAllInvoices} style={{ marginTop: 8, padding: '6px 16px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>{t.reloadBtn}</button>
                </div>
              )}

              {!invoicesLoading && (
                <>
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 14, color: '#1e40af' }}>
                    💡 {t.searchHint}
                  </div>

                  {/* Main search */}
                  <div style={{ position: 'relative', marginBottom: 16 }}>
                    <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 20, pointerEvents: 'none' }}>🔍</div>
                    <input
                      type="text"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      placeholder={t.searchPlaceholder}
                      autoFocus
                      style={{ width: '100%', padding: '14px 46px 14px 46px', borderRadius: 12, border: '2px solid #dc2626', fontSize: 17, outline: 'none', boxSizing: 'border-box', fontWeight: 500 }}
                    />
                    {searchText && (
                      <button onClick={() => setSearchText('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: '#fee2e2', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 14, color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>X</button>
                    )}
                  </div>

                  {/* Direct ID search */}
                  <div style={{ background: '#fefce8', border: '1px solid #fde047', borderRadius: 10, padding: 12, marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: '#854d0e', marginBottom: 8 }}>🔎 Invoice ID එකෙන් සොයන්න:</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        value={directId}
                        onChange={(e) => setDirectId(e.target.value)}
                        placeholder="Invoice ID"
                        style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #fde047', fontSize: 14, outline: 'none' }}
                        onKeyDown={(e) => e.key === 'Enter' && searchById()}
                      />
                      <button onClick={searchById} disabled={directSearching} style={{ padding: '10px 16px', background: '#eab308', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}>
                        {directSearching ? '...' : '🔎 Search'}
                      </button>
                    </div>
                  </div>

                  {/* Stats */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, fontSize: 13, color: '#94a3b8', flexWrap: 'wrap', gap: 8 }}>
                    <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '3px 10px', borderRadius: 8, fontWeight: 'bold' }}>
                      {t.allLoaded}: {allInvoices.length} {t.totalInvoices}
                    </span>
                    {searchText.trim() && (
                      <span style={{ background: filteredInvoices.length > 0 ? '#dcfce7' : '#fef2f2', color: filteredInvoices.length > 0 ? '#16a34a' : '#dc2626', padding: '3px 12px', borderRadius: 12, fontWeight: 'bold', fontSize: 14 }}>
                        {filteredInvoices.length} {t.invoiceResults}
                      </span>
                    )}
                  </div>

                  {/* Customer summary */}
                  {searchText.trim() && customerSummary && Object.keys(customerSummary).length > 0 && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                      <div style={{ fontSize: 13, color: '#166534', fontWeight: 'bold', marginBottom: 6 }}>👤 Customer Summary:</div>
                      {Object.entries(customerSummary).map(([name, data]) => (
                        <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', color: '#15803d' }}>
                          <span>{name}</span>
                          <span><strong>{data.count}</strong> invoices • Rs. {fmt(data.total)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Invoice list */}
                  {searchText.trim() && filteredInvoices.length > 0 && (
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', maxHeight: 500, overflowY: 'auto' }}>
                      {filteredInvoices.map((inv, idx) => (
                        <div
                          key={inv.id}
                          onClick={() => selectInvoice(inv)}
                          style={{ padding: 16, cursor: 'pointer', background: 'white', borderBottom: idx < filteredInvoices.length - 1 ? '1px solid #f1f5f9' : 'none', transition: 'background 0.15s' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#fef2f2')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontWeight: 'bold', fontSize: 14, color: '#dc2626', background: '#fef2f2', padding: '3px 10px', borderRadius: 6 }}>
                              INV-{inv.id.slice(0, 6).toUpperCase()}
                            </span>
                            <span style={{ fontWeight: 'bold', fontSize: 17, color: '#1e293b' }}>Rs. {fmt(inv.netAmount || inv.grandTotal)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 15, color: '#1e293b' }}>
                              👤 {inv.customerName || t.cashCustomer}
                              {inv.customerPhone && <span style={{ color: '#64748b', marginLeft: 8, fontSize: 13 }}>📞 {inv.customerPhone}</span>}
                            </span>
                            <span style={{ fontSize: 13, color: '#94a3b8' }}>📦 {inv.itemCount || inv.items?.length || 0} {t.items}</span>
                          </div>
                          {inv.returnStatus && inv.returnStatus !== 'none' && (
                            <div style={{ display: 'inline-block', marginTop: 6, padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 'bold', background: inv.returnStatus === 'full' ? '#fecaca' : '#fef3c7', color: inv.returnStatus === 'full' ? '#dc2626' : '#d97706' }}>
                              {inv.returnStatus === 'full' ? t.fullyReturned : t.partiallyReturned}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {searchText.trim() && filteredInvoices.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                      <div style={{ fontSize: 50, marginBottom: 10 }}>🔍</div>
                      <div style={{ fontSize: 16 }}>{t.noMatch}</div>
                    </div>
                  )}

                  {!searchText.trim() && (
                    <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>
                      <div style={{ fontSize: 40, marginBottom: 8 }}>⌨️</div>
                      <div style={{ fontSize: 15 }}>{t.typeToSearch}</div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* STEP 2: ITEMS */}
          {step === 'items' && selectedInvoice && (
            <div>
              <div style={{ background: '#fef2f2', padding: 14, borderRadius: 12, marginBottom: 16, border: '1px solid #fecaca', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 'bold', color: '#dc2626', fontSize: 15 }}>{t.originalInvoice}: INV-{selectedInvoice.id.slice(0, 6).toUpperCase()}</div>
                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>👤 {selectedInvoice.customerName} • {formatDate(selectedInvoice.createdAt)}</div>
                </div>
                <button onClick={() => { setStep('search'); setSelectedInvoice(null); }} style={{ fontSize: 13, color: '#dc2626', background: 'white', border: '1px solid #fecaca', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 'bold' }}>
                  {t.changeInvoice}
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontWeight: 'bold', fontSize: 16 }}>{t.selectItemsToReturn.replace('!', '')}</span>
                <button onClick={toggleSelectAll} style={{ fontSize: 13, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontWeight: 'bold' }}>
                  Select All
                </button>
              </div>

              <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', marginBottom: 16 }}>
                {returnItems.map((item, index) => {
                  const isDisabled = item.availableQty <= 0;
                  return (
                    <div key={item.lineKey || index} style={{ padding: 14, borderBottom: '1px solid #f1f5f9', opacity: isDisabled ? 0.45 : 1, background: item.selected ? '#fef2f2' : 'white' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <input type="checkbox" checked={item.selected} onChange={() => !isDisabled && toggleItem(index)} disabled={isDisabled} style={{ width: 22, height: 22, accentColor: '#dc2626', cursor: isDisabled ? 'not-allowed' : 'pointer' }} />
                        <img src={item.photoURL || defaultProduct} alt="" onError={(e) => { e.target.src = defaultProduct; }} style={{ width: 46, height: 46, borderRadius: 8, objectFit: 'cover', background: '#f1f5f9', border: '1px solid #e2e8f0' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 'bold', fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                          <div style={{ fontSize: 13, color: '#64748b' }}>Rs. {fmt(item.effectivePrice)}</div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
                        {[
                          { label: t.purchasedQty,      value: item.originalQty,    bg: '#f1f5f9', color: '#1e293b' },
                          { label: t.alreadyReturned,   value: item.alreadyReturned, bg: '#fef2f2', color: '#dc2626' },
                          { label: t.availableToReturn, value: item.availableQty,    bg: '#f0fdf4', color: '#16a34a' },
                        ].map((cell) => (
                          <div key={cell.label} style={{ background: cell.bg, padding: '6px 8px', borderRadius: 6, textAlign: 'center' }}>
                            <div style={{ fontSize: 11, color: '#64748b' }}>{cell.label}</div>
                            <div style={{ fontWeight: 'bold', fontSize: 16, color: cell.color }}>{cell.value}</div>
                          </div>
                        ))}
                      </div>

                      {item.selected && !isDisabled && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff1f2', padding: '8px 12px', borderRadius: 8, border: '1px solid #fecdd3' }}>
                          <span style={{ fontSize: 14, fontWeight: 'bold', color: '#be123c' }}>{t.returnQty}:</span>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <button onClick={() => updateReturnQty(index, item.returnQty - 1)} style={{ width: 36, height: 36, background: '#fecdd3', border: '1px solid #fda4af', borderRadius: '8px 0 0 8px', fontSize: 18, cursor: 'pointer' }}>-</button>
                            <input type="number" value={item.returnQty} onChange={(e) => updateReturnQty(index, e.target.value)} min={0} max={item.availableQty} style={{ width: 55, textAlign: 'center', padding: '6px 2px', border: '1px solid #fda4af', borderLeft: 'none', borderRight: 'none', fontWeight: 'bold', fontSize: 18, outline: 'none' }} />
                            <button onClick={() => updateReturnQty(index, item.returnQty + 1)} style={{ width: 36, height: 36, background: '#fecdd3', border: '1px solid #fda4af', borderRadius: '0 8px 8px 0', fontSize: 18, cursor: 'pointer' }}>+</button>
                          </div>
                          <span style={{ marginLeft: 'auto', fontWeight: 'bold', fontSize: 16, color: '#be123c' }}>Rs. {fmt(item.effectivePrice * item.returnQty)}</span>
                        </div>
                      )}

                      {isDisabled && (
                        <div style={{ textAlign: 'center', fontSize: 13, color: '#dc2626', fontWeight: 'bold', background: '#fef2f2', padding: 6, borderRadius: 6 }}>{t.itemFullyReturned}</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {selectedCount > 0 && (
                <div style={{ background: '#fef2f2', padding: 16, borderRadius: 12, border: '2px solid #dc2626', marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 6 }}>
                    <span>Return items:</span>
                    <span style={{ fontWeight: 'bold' }}>{selectedCount}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 'bold', color: '#dc2626' }}>
                    <span>{t.totalRefund}:</span>
                    <span>Rs. {fmt(totalRefund)}</span>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button onClick={() => { setStep('search'); setSelectedInvoice(null); }} style={{ padding: 14, background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 'bold', cursor: 'pointer' }}>{t.back}</button>
                <button onClick={() => selectedCount > 0 ? setStep('confirm') : showToast(t.selectItemsToReturn)} disabled={selectedCount === 0} style={{ padding: 14, background: selectedCount > 0 ? '#dc2626' : '#d1d5db', color: 'white', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 'bold', cursor: selectedCount > 0 ? 'pointer' : 'not-allowed' }}>
                  {t.next}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: CONFIRM */}
          {step === 'confirm' && (
            <div style={{ background: 'white', borderRadius: 16, padding: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
              <h3 style={{ margin: '0 0 16px', color: '#dc2626', fontSize: 20 }}>{t.confirmTitle}</h3>

              <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 20 }}>
                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>
                  {t.originalInvoice}: <strong style={{ color: '#dc2626' }}>INV-{selectedInvoice.id.slice(0, 6).toUpperCase()}</strong>
                </div>
                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>👤 {selectedInvoice.customerName || t.cashCustomer}</div>

                {itemsToReturn.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: idx < itemsToReturn.length - 1 ? '1px solid #e2e8f0' : 'none' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>Rs. {fmt(item.effectivePrice)} x {item.returnQty}</div>
                    </div>
                    <div style={{ fontWeight: 'bold', color: '#dc2626', fontSize: 15 }}>Rs. {fmt(item.effectivePrice * item.returnQty)}</div>
                  </div>
                ))}

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTop: '2px solid #dc2626', fontSize: 22, fontWeight: 'bold', color: '#dc2626' }}>
                  <span>{t.totalRefund}</span>
                  <span>Rs. {fmt(totalRefund)}</span>
                </div>
              </div>

              {/* Refund method */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontWeight: 'bold', fontSize: 15, display: 'block', marginBottom: 10 }}>{t.refundMethod}</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {[
                    { key: 'cash',     label: `💵 ${t.cashRefund}`,     color: '#16a34a' },
                    { key: 'credit',   label: `🏦 ${t.creditRefund}`,   color: '#2563eb' },
                    { key: 'exchange', label: `🔄 ${t.exchangeRefund}`, color: '#d97706' },
                  ].map((m) => (
                    <button key={m.key} onClick={() => setRefundMethod(m.key)} style={{ padding: '14px 8px', fontSize: 13, fontWeight: 'bold', borderRadius: 10, cursor: 'pointer', textAlign: 'center', border: refundMethod === m.key ? `2px solid ${m.color}` : '1px solid #e2e8f0', background: refundMethod === m.key ? '#fef2f2' : 'white', color: refundMethod === m.key ? m.color : '#64748b' }}>
                      {m.label}
                    </button>
                  ))}
                </div>
                {refundMethod === 'credit' && (
                  <div style={{ marginTop: 10, padding: 12, background: '#eff6ff', borderRadius: 8, fontSize: 13, color: '#1e40af' }}>ℹ️ {t.creditInfo}: Rs. {fmt(totalRefund)}</div>
                )}
                {refundMethod === 'exchange' && (
                  <div style={{ marginTop: 10, padding: 12, background: '#fefce8', borderRadius: 8, fontSize: 13, color: '#854d0e' }}>ℹ️ {t.exchangeNote}</div>
                )}
                {refundMethod === 'cash' && (
                  <div style={{ marginTop: 10, padding: 12, background: '#f0fdf4', borderRadius: 8, fontSize: 13, color: '#166534' }}>💵 Rs. {fmt(totalRefund)}</div>
                )}
              </div>

              {/* Reason */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontWeight: 'bold', fontSize: 15, display: 'block', marginBottom: 8 }}>📝 {t.returnReason}</label>
                <textarea value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder={t.reasonPlaceholder} rows={3} style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', resize: 'vertical', outline: 'none' }} />
              </div>

              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, fontSize: 13, color: '#64748b', marginBottom: 20, border: '1px solid #e2e8f0' }}>
                <div>📦 {t.stockNote}</div>
                {hasBatchRestore && <div>📦 Batch remainingQty restore කෙරේ.</div>}
                {refundMethod === 'credit' && <div>💳 {t.creditNote}</div>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <button onClick={() => setStep('items')} style={{ padding: 16, background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 'bold', cursor: 'pointer' }}>{t.back}</button>
                <button onClick={processReturn} disabled={isProcessing} style={{ padding: 16, background: isProcessing ? '#9ca3af' : 'linear-gradient(135deg, #dc2626, #b91c1c)', color: 'white', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 'bold', cursor: isProcessing ? 'wait' : 'pointer' }}>
                  {isProcessing ? `⏳ ${t.processing}` : t.confirmReturn}
                </button>
              </div>
            </div>
          )}

          {/* STEP DONE */}
          {step === 'done' && completedReturn && (
            <div style={{ background: 'white', borderRadius: 16, padding: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.08)', textAlign: 'center' }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#f0fdf4', border: '3px solid #16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 40 }}>✅</div>
              <h3 style={{ color: '#16a34a', marginBottom: 8, fontSize: 22 }}>{t.done}</h3>
              <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
                {t.returnId}: <strong style={{ color: '#dc2626' }}>RTN-{completedReturn.returnId.slice(0, 6).toUpperCase()}</strong>
              </p>

              <div style={{ background: '#f8fafc', padding: 18, borderRadius: 12, border: '1px solid #e2e8f0', textAlign: 'left', marginBottom: 24 }}>
                <div style={{ fontWeight: 'bold', fontSize: 17, marginBottom: 12, textAlign: 'center', color: '#dc2626', paddingBottom: 10, borderBottom: '2px dashed #fecaca' }}>↩️ RETURN CREDIT NOTE</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13, marginBottom: 12 }}>
                  <div><span style={{ color: '#64748b' }}>{t.originalInvoice}:</span><br /><strong>INV-{selectedInvoice?.id?.slice(0, 6).toUpperCase()}</strong></div>
                  <div><span style={{ color: '#64748b' }}>{t.customer}:</span><br /><strong>{completedReturn.customerName || t.cashCustomer}</strong></div>
                </div>
                <div style={{ borderTop: '1px dashed #cbd5e1', borderBottom: '1px dashed #cbd5e1', padding: '8px 0', marginBottom: 10 }}>
                  {completedReturn.items.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14, borderBottom: idx < completedReturn.items.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                      <span>{item.name} <span style={{ color: '#94a3b8' }}>x{item.returnQty}</span></span>
                      <span style={{ fontWeight: 'bold' }}>Rs. {fmt(item.returnAmount)}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 20, color: '#dc2626', paddingTop: 4 }}>
                  <span>{t.totalRefund}</span>
                  <span>Rs. {fmt(completedReturn.totalReturnAmount)}</span>
                </div>
                <div style={{ marginTop: 10, fontSize: 13, color: '#64748b', textAlign: 'center', paddingTop: 8, borderTop: '1px dashed #cbd5e1' }}>
                  {t.refundMethod}: <strong>{refundMethod === 'cash' ? `💵 ${t.cashRefund}` : refundMethod === 'credit' ? `🏦 ${t.creditRefund}` : `🔄 ${t.exchangeRefund}`}</strong>
                </div>
                {completedReturn.reason && <div style={{ marginTop: 8, fontSize: 12, color: '#64748b', textAlign: 'center', fontStyle: 'italic' }}>"{completedReturn.reason}"</div>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <button onClick={resetForm} style={{ padding: 16, background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 'bold', cursor: 'pointer' }}>↩️ {t.newReturn}</button>
                <button
                  onClick={() => setOutputInvoice(buildReturnOutputInvoice({ completedReturn, originalInvoice: selectedInvoice, refundMethod }))}
                  style={{ padding: 16, background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
                >
                  📤 {t.sendReturn}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}