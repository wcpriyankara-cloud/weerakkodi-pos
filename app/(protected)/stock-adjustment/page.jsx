'use client';

// app/(protected)/stock-adjustment/page.jsx
// ✅ Synced with POS & ItemForm Canonical Database Fields
// ✅ Real-time Purchased Batches (තොග) viewer (Array Guard Added)
// ✅ Buying Price (Cost) Adjustment field
// ✅ Robust error fallback & History Syncing
// ✅ Adjust and Edit Old/Past/Active Batches directly with Auto-recalculated Item Stock
// ✅ Reactive Live Sync for Edit Form Stock Fields with Dirty State Guard
// ✅ Fixed Negative Stock Mismatch Bug on setting Batch Qty to 0
// ✅ Full Real-time Sync for Stock Adjustments History
// ✅ Expanded Batch Editor to Edit Retail, Wholesale & Loose Prices and Discounts directly!
// ✅ FIXED: Virtual Deficit Batch injection to view and adjust POS Negative Stock directly!

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { db } from '@/lib/firebase';
import {
  collection, query, where, onSnapshot,
  addDoc, doc, updateDoc, getDoc, serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { useUserAuth } from '@/context/UserContext';
import { useLang } from '@/hooks/useLang';

/* ═══════════════════════════════════════
   TRANSLATIONS
═══════════════════════════════════════ */
const TEXT = {
  si: {
    pageTitle:        '📦 Stock & Price Adjustment',
    searchLabel:      '🔍 භාණ්ඩය සොයන්න',
    searchPlaceholder:'නම, කේතය හෝ බාර්කෝඩ් ටයිප් කරන්න...',
    noResults:        'ප්‍රතිඵල නොමැත',
    selectPrompt:     'Edit කිරීමට ඉහත Search Box එකෙන් Item එකක් තෝරන්න',
    editTitle:        'Edit:',
    fieldsChanged:    'field(s) changed',
    syncBtn:          '🔄 Sync Missing History',
    syncing:          '⏳ Syncing...',
    syncConfirm:      'මෙමගින් දැනට History නොමැති නමුත් Stock ඇති Items සඳහා History සටහන් සාදනු ඇත. ඉදිරියට යන්නද?',
    syncDone:         'Items සඳහා History සාදන ලදී.',
    syncNone:         'යාවත්කාලීන කිරීමට Items නොමැත.',
    generalInfo:      '📋 සාමාන්‍ය තොරතුරු',
    buyingPrice:      'ගැනුම් මිල (Rs.)',
    discountReceived: 'ලැබුණු වට්ටම %',
    expiryDate:       '📅 කල් ඉකුත් දිනය',
    racks:            '📍 රාක්ක',
    quantity:         '📦 ප්‍රමාණය (Stock)',
    added:            'Added',
    reduced:          'Reduced',
    retailPricing:    '🏪 සිල්ලර මිල ගණන්',
    wholesalePricing: '🏭 තොග මිල ගණන්',
    loosePricing:     '📦 ලූස් මිල ගණන්',
    looseItem:        'LOOSE ITEM',
    sellingPrice:     'විකුණුම් මිල (Rs.)',
    sellingDiscount:  'විකුණුම් වට්ටම %',
    yourPrice:        'ඔබේ මිල ✨ Auto',
    loosePrice:       'ලූස් මිල (Rs.)',
    looseDiscount:    'ලූස් වට්ටම %',
    yourLoosePrice:   'ලූස් ඔබේ මිල ✨ Auto',
    saving:           '⏳ සුරකිමින්...',
    noChanges:        '✅ වෙනස්කම් නැත',
    saveChanges:      '💾 වෙනස්කම් සුරකින්න',
    reset:            '🔄 Reset',
    saveSuccess:      'Item සාර්ථකව යාවත්කාලීන කරන ලදී!',
    selectItemError:  'කරුණාකර Item එකක් තෝරන්න',
    historyTitle:     '🕒 Stock Adjustment ඉතිහාසය',
    noAdjustments:    'Adjustments නොමැත',
    date:             'දිනය',
    item:             'භාණ්ඩය',
    type:             'වර්ගය',
    qtyLabel:         'ප්‍රමාණය',
    reason:           'හේතුව',
    stock:            'Stock',
    code:             'Code',
    items:            'items',
    confirmTitle:     '⚠️ තහවුරු කරන්න',
    confirmYes:       'ඔව්, ඉදිරියට යන්න',
    confirmNo:        'අවලංගු',
    batchesTitle:     '📦 මිලදී ගත් තොග විස්තර (All Purchased Batches)',
    noBatches:        'මෙම භාණ්ඩය සඳහා මිලදී ගැනීමේ තොග සටහන් කිසිවක් හමු නොවීය.',
    supplier:         'සැපයුම්කරු',
    batchQty:         'තොග ප්‍රමාණය',
    buyingCost:       'ගැනුම් මිල',
    pricing:          'මිල ගණන්',
    remaining:        'ඉතිරි',
    adjustBatchBtn:   '✏️ Adjust Batch',
    batchAdjustSuccess: 'තොග විස්තර, මිල ගණන් සහ භාණ්ඩයේ මුළු ප්‍රමාණය සාර්ථකව යාවත්කාලීන කරන ලදී!',
    cancelBtn:        'අවලංගු',
    saveBtn:          'සුරකින්න',
  },
  en: {
    pageTitle:        '📦 Stock & Price Adjustment',
    searchLabel:      '🔍 Search Item',
    searchPlaceholder:'Type name, code or barcode...',
    noResults:        'No results',
    selectPrompt:     'Select an item from the search box above to edit',
    editTitle:        'Edit:',
    fieldsChanged:    'field(s) changed',
    syncBtn:          '🔄 Sync Missing History',
    syncing:          '⏳ Syncing...',
    syncConfirm:      'This will create history records for items with stock but no history. Continue?',
    syncDone:         'History created for items.',
    syncNone:         'No items to update.',
    generalInfo:      '📋 General Information',
    buyingPrice:      'Buying Price (Rs.)',
    discountReceived: 'Discount Received %',
    expiryDate:       '📅 Expiry Date',
    racks:            '📍 Racks',
    quantity:         '📦 Quantity (Stock)',
    added:            'Added',
    reduced:          'Reduced',
    retailPricing:    '🏪 Retail Pricing',
    wholesalePricing: '🏭 Wholesale Pricing',
    loosePricing:     '📦 Loose Pricing',
    looseItem:        'LOOSE ITEM',
    sellingPrice:     'Selling Price (Rs.)',
    sellingDiscount:  'Selling Discount %',
    yourPrice:        'Your Price ✨ Auto',
    loosePrice:       'Loose Price (Rs.)',
    looseDiscount:    'Loose Discount %',
    yourLoosePrice:   'Your Loose Price ✨ Auto',
    saving:           '⏳ Saving...',
    noChanges:        '✅ No Changes',
    saveChanges:      '💾 Save Changes',
    reset:            '🔄 Reset',
    saveSuccess:      'Item updated successfully!',
    selectItemError:  'Please select an item',
    historyTitle:     '🕒 Stock Adjustment History',
    noAdjustments:    'No adjustments yet',
    date:             'Date',
    item:             'Item',
    type:             'Type',
    qtyLabel:         'Qty',
    reason:           'Reason',
    stock:            'Stock',
    code:             'Code',
    items:            'items',
    confirmTitle:     '⚠️ Confirm',
    confirmYes:       'Yes, Continue',
    confirmNo:        'Cancel',
    batchesTitle:     '📦 Purchased Batches (All Purchased Batches)',
    noBatches:        'No purchase or stock-in batches found for this item.',
    supplier:         'Supplier',
    batchQty:         'Batch Qty',
    buyingCost:       'Cost Price',
    pricing:          'Pricing',
    remaining:        'Remaining',
    adjustBatchBtn:   '✏️ Adjust Batch',
    batchAdjustSuccess: 'Batch quantities, pricing and total item stock updated successfully!',
    cancelBtn:        'Cancel',
    saveBtn:          'Save',
  },
};

/* ═══════════════════════════════════════
   TOAST COMPONENT
═══════════════════════════════════════ */
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div style={{
      position: 'fixed', top: 20, left: '50%',
      transform: 'translateX(-50%)',
      background: type === 'error' ? '#dc2626' : '#16a34a',
      color: 'white', padding: '12px 22px',
      borderRadius: 12, fontWeight: 700,
      fontSize: 14, zIndex: 9999,
      boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
      animation: 'fadeIn 0.3s ease',
      maxWidth: 360, textAlign: 'center',
    }}>
      {message}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}

/* ═══════════════════════════════════════
   CONFIRM MODAL COMPONENT
═══════════════════════════════════════ */
function ConfirmModal({ message, onConfirm, onCancel, t }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(15,23,42,0.5)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 16,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'white', borderRadius: 16,
          padding: '28px 24px', maxWidth: 420, width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 20, marginBottom: 14, color: '#1e293b', fontWeight: 700 }}>
          {t.confirmTitle}
        </div>
        <p style={{ color: '#475569', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '11px 0',
              background: '#f1f5f9', color: '#475569',
              border: 'none', borderRadius: 10,
              fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}
          >
            {t.confirmNo}
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, padding: '11px 0',
              background: '#3b82f6', color: 'white',
              border: 'none', borderRadius: 10,
              fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}
          >
            {t.confirmYes}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════ */
export default function StockAdjustmentPage() {
  const { user } = useUserAuth();
  const { lang } = useLang();
  const t = useMemo(() => TEXT[lang] || TEXT.si, [lang]);

  const [items,       setItems]       = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [loading,     setLoading]     = useState(true);

  // Batches / Purchase history state
  const [purchaseSources, setPurchaseSources] = useState({ purchases: [], purchaseInvoices: [], stockIn: [] });

  const [searchText,     setSearchText]     = useState('');
  const [selectedItem,   setSelectedItem]   = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const [editData,      setEditData]      = useState(null);
  const [originalData,  setOriginalData]  = useState(null);
  const [isStockDirty,  setIsStockDirty]  = useState(false);
  const [hasLoosePrice, setHasLoosePrice] = useState(false);
  const [isSaving,      setIsSaving]      = useState(false);
  const [isSyncing,     setIsSyncing]     = useState(false);

  // Batch edit expanded local state
  const [editingBatchId, setEditingBatchId] = useState(null);
  const [batchEditData, setBatchEditData] = useState({
    remainingQty: '',
    buyingNetPrice: '',
    retailPrice: '',
    retailDiscount: '',
    wholesalePrice: '',
    wholesaleDiscount: '',
    loosePrice: '',
    looseDiscount: ''
  });
  const [isSavingBatch, setIsSavingBatch] = useState(false);

  const [toast,   setToast]   = useState(null);
  const [confirm, setConfirm] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
  }, []);

  const showConfirm = useCallback((message) =>
    new Promise((resolve) => {
      setConfirm({ message, resolve });
    }),
  []);

  /* ── Math / Decimal Rounder & Date/Qty Formatters ── */
  const R2 = useCallback((v) => { const n = parseFloat(v); return isNaN(n) ? 0 : Math.round(n * 100) / 100; }, []);
  const fmt = useCallback((v) => R2(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), [R2]);
  
  const fmtQ = useCallback((v) => {
    const n = parseFloat(v);
    return isNaN(n) ? '0' : Number.isInteger(n) ? n.toString() : (Number(n) || 0).toFixed(2);
  }, []);

  const fmtDate = useCallback((d) => {
    if (!d) return 'N/A';
    const dateObj = d.toDate ? d.toDate() : new Date(d);
    return isNaN(dateObj.getTime()) ? 'N/A' : dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }, []);

  /* ── Helpers ── */
  const sortByDate = useCallback((data) =>
    data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)), []);

  const calcYourPrice = useCallback((price, discount) => {
    const p = parseFloat(price)    || 0;
    const d = parseFloat(discount) || 0;
    if (p <= 0) return '';
    return (p - (p * d / 100)).toFixed(2);
  }, []);

  // ✅ Modified to cleanly support and retain raw negative stock values
  const getActualStock = useCallback((item) => {
    if (!item) return 0;
    const s  = parseFloat(item.stock)        || 0;
    const cs = parseFloat(item.currentStock) || 0;
    let ms   = 0;
    if (item.stocks && typeof item.stocks === 'object') {
      ms = Object.values(item.stocks).reduce(
        (sum, v) => sum + (parseFloat(v) || 0), 0
      );
    }
    const vals = [s, cs];
    if (item.stocks) vals.push(ms);
    return Math.min(...vals) < 0 ? Math.min(...vals) : Math.max(...vals);
  }, []);

  /* ── Find Live Selected Item ── */
  const liveSelectedItem = useMemo(() => {
    return items.find(i => i.id === selectedItem) || null;
  }, [items, selectedItem]);

  /* ── Reactively Sync stock when database updates (Guarded by Dirty State) ── */
  useEffect(() => {
    if (!liveSelectedItem || !editData || isStockDirty) return;
    const liveStock = getActualStock(liveSelectedItem);

    if (editData.stock !== liveStock) {
      setEditData(prev => ({ ...prev, stock: liveStock }));
      setOriginalData(prev => ({ ...prev, stock: liveStock, _stock: liveStock }));
    }
  }, [liveSelectedItem, isStockDirty, editData, getActualStock]);

  /* ── Batch Helpers (allowing negative remaining quantities for sync) ── */
  const getBatchRemainingInfo = useCallback((bi) => {
    if (!bi) return { remaining: 0, isTracked: false };
    const p = R2(bi.qty || bi.quantity || 0);
    if (bi.remainingQty !== undefined && bi.remainingQty !== null && bi.remainingQty !== '') {
      // ✅ Removed Math.max(0, ...) so negative stock balances from POS show correctly
      return { remaining: R2(bi.remainingQty), isTracked: true };
    }
    return { remaining: p, isTracked: false };
  }, [R2]);

  const getBatchTime = useCallback((b) => b?.createdAt?.toDate?.()?.getTime?.() || new Date(b?.date || 0).getTime() || 0, []);

  const extractBatches = useCallback((itemId) => {
    if (!itemId || !purchaseSources) return [];
    const batches = [];
    ['purchases', 'purchaseInvoices', 'stockIn'].forEach(col => {
      const invs = purchaseSources[col];
      if (!Array.isArray(invs)) return;
      invs.forEach(inv => {
        if (!inv || !Array.isArray(inv.items)) return;
        inv.items.forEach((item, idx) => {
          if (!item) return;
          const id = item.itemId || item.id;
          if (id !== itemId) return;
          const ri = getBatchRemainingInfo(item);
          batches.push({
            batchId: `${inv.id}_${idx}`,
            invoiceId: inv.id,
            invoiceCollection: col,
            itemIndex: idx,
            supplierName: inv.supplierName || 'Unknown',
            date: inv.date || inv.createdAt,
            createdAt: inv.createdAt,
            qty: R2(item.qty || item.quantity || 0),
            remainingQty: ri.remaining,
            isTracked: ri.isTracked,
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
    // Sort Newest first
    batches.sort((a, b) => getBatchTime(b) - getBatchTime(a));
    return batches;
  }, [purchaseSources, getBatchRemainingInfo, getBatchTime, R2]);

  // List of active batches + Virtual deficit batch injector
  const selectedItemBatches = useMemo(() => {
    if (!selectedItem) return [];
    const res = extractBatches(selectedItem);
    const parentItem = items.find(i => i.id === selectedItem);
    
    if (parentItem) {
      const parentStock = getActualStock(parentItem);
      const totalBatchStock = res.reduce((sum, b) => sum + parseFloat(b.remainingQty || 0), 0);

      // ✅ POS එකෙන් 0 ට වඩා අඩුවෙන් විකුණා ඇති විට, එම සෘණ තොගය (Virtual Deficit Batch) එකක් ලෙස ඉහලින්ම එක් කරයි.
      if (parentStock < totalBatchStock) {
        const deficit = R2(parentStock - totalBatchStock);
        res.unshift({
          batchId: 'virtual_deficit_batch',
          isVirtualDeficit: true,
          invoiceId: 'VIRTUAL',
          invoiceCollection: 'items',
          itemIndex: -1,
          supplierName: '⚠️ Overdrawn / Negative Stock (අතථ්‍ය සෘණ තොගය)',
          date: null,
          createdAt: null,
          qty: 0,
          remainingQty: deficit,
          isTracked: true,
          buyingNetPrice: parentItem.buyingPrice || parentItem.costPrice || 0,
          retailPrice: parentItem.sellingPriceRetail || 0,
          retailDiscount: parentItem.retailDiscount || 0,
          wholesalePrice: parentItem.sellingPriceWholesale || 0,
          wholesaleDiscount: parentItem.wholesaleDiscount || 0,
          loosePrice: parentItem.sellingPriceLoose || 0,
          looseDiscount: parentItem.looseDiscount || 0,
        });
      }
    }
    
    return Array.isArray(res) ? res : [];
  }, [selectedItem, extractBatches, items, getActualStock, R2]);

  const populateEditData = useCallback((item) => {
    const actualStock = getActualStock(item);
    const data = {
      discountReceived:          item.discountReceived          ?? '',
      buyingPrice:               item.buyingPrice ?? item.costPrice ?? '',
      expiryDate:                item.expiryDate                ?? '',
      racks:                     item.racks ?? item.rackName    ?? '',
      stock:                     actualStock,

      sellingPriceRetail:        item.sellingPriceRetail ?? item.retailSellingPrice ?? item.sellingPrice ?? item.price ?? '',
      retailDiscount:            item.retailDiscount ?? item.retailSellingDiscount ?? '',
      retailYourPrice:           item.retailYourPrice
        ?? calcYourPrice(item.sellingPriceRetail ?? item.retailSellingPrice, item.retailDiscount ?? item.retailSellingDiscount),

      sellingPriceWholesale:     item.sellingPriceWholesale ?? item.wholesaleSellingPrice ?? item.wholesalePrice ?? '',
      wholesaleDiscount:         item.wholesaleDiscount ?? item.wholesaleSellingDiscount ?? '',
      wholesaleYourPrice:        item.wholesaleYourPrice
        ?? calcYourPrice(item.sellingPriceWholesale ?? item.wholesaleSellingPrice, item.wholesaleDiscount ?? item.wholesaleSellingDiscount),

      sellingPriceLoose:         item.sellingPriceLoose ?? item.retailSellingPriceLoose ?? item.loosePrice ?? '',
      looseDiscount:             item.looseDiscount ?? item.retailSellingLooseDiscount ?? '',
      looseYourPrice:            item.looseYourPrice
        ?? calcYourPrice(item.sellingPriceLoose ?? item.retailSellingPriceLoose, item.looseDiscount ?? item.retailSellingLooseDiscount),
    };
    setEditData(data);
    setOriginalData({ ...data, _stock: actualStock });
    setIsStockDirty(false);
    setHasLoosePrice(
      !!(item.sellingPriceLoose || item.retailSellingPriceLoose || item.priceLoose || item.loosePrice || item.isLoose)
    );
  }, [getActualStock, calcYourPrice]);

  /* ── Click outside ── */
  useEffect(() => {
    const h = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  /* ── Load items, History, & Purchase streams real-time ── */
  useEffect(() => {
    if (!user) return;

    const unsubItems = onSnapshot(
      query(collection(db, 'items'), where('uid', '==', user.uid)),
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    ,
    (error) => {
      console.warn("⚠️ Firestore listener error:", error?.code, error?.message);
      if (error?.code === "resource-exhausted") {
        console.warn("📊 Quota exceeded — offline data පමණක් භාවිතා වේ");
      }
    }
  );

    const unsubHistory = onSnapshot(
      query(collection(db, 'stockAdjustments'), where('uid', '==', user.uid)),
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        sortByDate(data);
        setAdjustments(data);
        setLoading(false);
      },
      (err) => {
        console.error('History load error:', err);
        setLoading(false);
      }
    );

    // Stream Batch Sources (Purchases / Stock In)
    const unsubsBatches = ['purchases', 'purchaseInvoices', 'stockIn'].map(col => {
      return onSnapshot(
        query(collection(db, col), where('uid', '==', user.uid)),
        (snap) => {
          setPurchaseSources(prev => ({
            ...prev,
            [col]: snap.docs.map(d => ({ id: d.id, ...d.data() }))
          }));
        }
      ,
    (error) => {
      console.warn("⚠️ Firestore listener error:", error?.code, error?.message);
      if (error?.code === "resource-exhausted") {
        console.warn("📊 Quota exceeded — offline data පමණක් භාවිතා වේ");
      }
    }
  );
    });

    return () => {
      unsubItems();
      unsubHistory();
      unsubsBatches.forEach(unsubFn => unsubFn());
    };
  }, [user, sortByDate]);

  /* ── Filtered items ── */
  const filteredItems = useMemo(() =>
    items.filter((item) =>
      item.name?.toLowerCase().includes(searchText.toLowerCase()) ||
      item.code?.toLowerCase().includes(searchText.toLowerCase()) ||
      item.barcode?.toLowerCase().includes(searchText.toLowerCase())
    ),
  [items, searchText]);

  /* ── Handlers ── */
  const handleSelectItem = (item) => {
    setSelectedItem(item.id);
    setSearchText(item.name);
    setIsDropdownOpen(false);
    populateEditData(item);
  };

  const handleClearSelection = () => {
    setSelectedItem('');
    setSearchText('');
    setIsDropdownOpen(false);
    setEditData(null);
    setOriginalData(null);
    setIsStockDirty(false);
    setHasLoosePrice(false);
    setEditingBatchId(null);
  };

  const handleResetForm = () => {
    const item = items.find((i) => i.id === selectedItem);
    if (item) populateEditData(item);
  };

  const handleEditChange = (field, value) => {
    if (field === 'stock') {
      setIsStockDirty(true);
    }

    setEditData((prev) => {
      const updated = { ...prev, [field]: value };

      if (field === 'sellingPriceRetail' || field === 'retailDiscount') {
        updated.retailYourPrice = calcYourPrice(
          field === 'sellingPriceRetail' ? value : prev.sellingPriceRetail,
          field === 'retailDiscount' ? value : prev.retailDiscount
        );
      }

      if (field === 'sellingPriceWholesale' || field === 'wholesaleDiscount') {
        updated.wholesaleYourPrice = calcYourPrice(
          field === 'sellingPriceWholesale' ? value : prev.sellingPriceWholesale,
          field === 'wholesaleDiscount' ? value : prev.wholesaleDiscount
        );
      }

      if (field === 'sellingPriceLoose' || field === 'looseDiscount') {
        updated.looseYourPrice = calcYourPrice(
          field === 'sellingPriceLoose' ? value : prev.sellingPriceLoose,
          field === 'looseDiscount' ? value : prev.looseDiscount
        );
      }

      return updated;
    });
  };

  /* ── Save canonical item fields ── */
  const handleSaveEdit = async () => {
    if (!selectedItem || !editData) {
      showToast(t.selectItemError, 'error');
      return;
    }

    setIsSaving(true);
    try {
      const item    = items.find((i) => i.id === selectedItem);
      const itemRef = doc(db, 'items', selectedItem);

      const toNum = (val) =>
        val !== '' && val !== undefined && val !== null ? parseFloat(val) : '';

      const newStock = parseFloat(editData.stock) || 0; // Negative raw allowed

      const updateData = {
        discountReceived:         toNum(editData.discountReceived),
        buyingPrice:              toNum(editData.buyingPrice),
        costPrice:                toNum(editData.buyingPrice), 
        expiryDate:               editData.expiryDate || '',
        racks:                    editData.racks      || '',
        rackName:                 editData.racks      || '', 
        stock:                    newStock,
        currentStock:             newStock,
        'stocks.Main_Store':      newStock,

        sellingPriceRetail:       toNum(editData.sellingPriceRetail),
        retailDiscount:           toNum(editData.retailDiscount),
        retailYourPrice:          toNum(editData.retailYourPrice),
        sellingPrice:             toNum(editData.sellingPriceRetail), 
        price:                    toNum(editData.sellingPriceRetail), 

        retailSellingPrice:       toNum(editData.sellingPriceRetail),
        retailSellingDiscount:    toNum(editData.retailDiscount),

        sellingPriceWholesale:    toNum(editData.sellingPriceWholesale),
        wholesaleDiscount:        toNum(editData.wholesaleDiscount),
        wholesaleYourPrice:       toNum(editData.wholesaleYourPrice),
        wholesalePrice:           toNum(editData.sellingPriceWholesale), 

        wholesaleSellingPrice:    toNum(editData.sellingPriceWholesale),
        wholesaleSellingDiscount: toNum(editData.wholesaleDiscount),
      };

      if (hasLoosePrice) {
        updateData.sellingPriceLoose         = toNum(editData.sellingPriceLoose);
        updateData.looseDiscount             = toNum(editData.looseDiscount);
        updateData.looseYourPrice            = toNum(editData.looseYourPrice);
        updateData.loosePrice                = toNum(editData.sellingPriceLoose); 

        updateData.retailSellingPriceLoose    = toNum(editData.sellingPriceLoose);
        updateData.retailSellingLooseDiscount = toNum(editData.looseDiscount);
        updateData.retailYourLoosePrice       = toNum(editData.looseYourPrice);
      }

      await updateDoc(itemRef, updateData);

      const oldStock = originalData?._stock || 0;
      const diff     = newStock - oldStock;

      if (diff !== 0) {
        await addDoc(collection(db, 'stockAdjustments'), {
          uid:       user.uid,
          itemId:    selectedItem,
          itemName:  item?.name || 'Unknown',
          type:      diff > 0 ? 'add' : 'reduce',
          qty:       Math.abs(diff),
          reason:    'Direct Edit (Stock Adjusted)',
          date:      new Date().toISOString().split('T')[0],
          createdAt: serverTimestamp(),
        });
      }

      setIsStockDirty(false);
      showToast(t.saveSuccess);
    } catch (e) {
      console.error(e);
      showToast('Error: ' + e.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  /* ── Batch Qty & Price Editor Save Handler with Deficit Fix ── */
  const handleSaveBatchEdit = async (b) => {
    setIsSavingBatch(true);
    try {
      const parentItem = items.find(i => i.id === selectedItem);
      
      // ✅ අතථ්‍ය සෘණ තොගය (Virtual Deficit) වෙනස් කළ විට සෘජුවම Parent Item එක යාවත්කාලීන කරයි
      if (b.isVirtualDeficit) {
        const nextRemaining = parseFloat(batchEditData.remainingQty) || 0; // user සෘණ තොගය 0 කළ විට

        const otherBatchesSum = selectedItemBatches
          .filter(x => x.batchId !== b.batchId)
          .reduce((sum, x) => sum + parseFloat(x.remainingQty || 0), 0);
        
        const newTotalStock = otherBatchesSum + nextRemaining;

        const itemRef = doc(db, 'items', selectedItem);
        const writeBt = writeBatch(db);
        
        writeBt.update(itemRef, {
          stock: newTotalStock,
          currentStock: newTotalStock,
          'stocks.Main_Store': newTotalStock
        });

        const diff = nextRemaining - b.remainingQty;
        if (diff !== 0) {
          const adjRef = doc(collection(db, 'stockAdjustments'));
          writeBt.set(adjRef, {
            uid:       user.uid,
            itemId:    selectedItem,
            itemName:  parentItem?.name || 'Unknown',
            type:      diff > 0 ? 'add' : 'reduce',
            qty:       Math.abs(diff),
            reason:    `Adjusted POS Overdrawn Deficit Stock`,
            date:      new Date().toISOString().split('T')[0],
            createdAt: serverTimestamp(),
          });
        }

        await writeBt.commit();
        showToast(t.batchAdjustSuccess);
        setEditingBatchId(null);
        return;
      }

      // සාමාන්‍ය Batch වෙනස් කිරීමේ පියවර
      const docRef = doc(db, b.invoiceCollection, b.invoiceId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error('Invoice document not found in ' + b.invoiceCollection);
      }

      const invoiceData = docSnap.data();
      const itemsArray = [...(invoiceData.items || [])];

      if (b.itemIndex >= 0 && b.itemIndex < itemsArray.length) {
        const targetItem = { ...itemsArray[b.itemIndex] };
        
        const currentRemaining = targetItem.remainingQty !== undefined ? parseFloat(targetItem.remainingQty) : parseFloat(targetItem.qty || targetItem.quantity || 0);
        const nextRemaining = parseFloat(batchEditData.remainingQty) || 0;
        const nextNetPrice = parseFloat(batchEditData.buyingNetPrice) || 0;
        
        const nextRetailPrice = parseFloat(batchEditData.retailPrice) || 0;
        const nextRetailDiscount = parseFloat(batchEditData.retailDiscount) || 0;
        const nextWholesalePrice = parseFloat(batchEditData.wholesalePrice) || 0;
        const nextWholesaleDiscount = parseFloat(batchEditData.wholesaleDiscount) || 0;
        const nextLoosePrice = parseFloat(batchEditData.loosePrice) || 0;
        const nextLooseDiscount = parseFloat(batchEditData.looseDiscount) || 0;

        // Apply Qty & Cost changes
        targetItem.remainingQty = nextRemaining;
        targetItem.buyingNetPrice = nextNetPrice;
        if (targetItem.netPrice !== undefined) targetItem.netPrice = nextNetPrice;
        if (targetItem.unitPrice !== undefined) targetItem.unitPrice = nextNetPrice;
        if (targetItem.qty !== undefined && targetItem.remainingQty === undefined) targetItem.qty = nextRemaining;

        // Apply Pricing Changes to Batch
        targetItem.retailPrice = nextRetailPrice;
        targetItem.sellingPriceRetail = nextRetailPrice;
        targetItem.retailDiscount = nextRetailDiscount;

        targetItem.wholesalePrice = nextWholesalePrice;
        targetItem.sellingPriceWholesale = nextWholesalePrice;
        targetItem.wholesaleDiscount = nextWholesaleDiscount;

        targetItem.loosePrice = nextLoosePrice;
        targetItem.sellingPriceLoose = nextLoosePrice;
        targetItem.looseDiscount = nextLooseDiscount;

        itemsArray[b.itemIndex] = targetItem;

        const writeBt = writeBatch(db);
        
        writeBt.update(docRef, {
          items: itemsArray,
          updatedAt: serverTimestamp()
        });

        const otherBatchesSum = selectedItemBatches
          .filter(x => x.batchId !== b.batchId)
          .reduce((sum, x) => sum + parseFloat(x.remainingQty || 0), 0);
        
        const newTotalStock = otherBatchesSum + nextRemaining;

        const itemRef = doc(db, 'items', selectedItem);
        writeBt.update(itemRef, {
          stock: newTotalStock,
          currentStock: newTotalStock,
          'stocks.Main_Store': newTotalStock
        });

        const diff = nextRemaining - currentRemaining;
        if (diff !== 0) {
          const adjRef = doc(collection(db, 'stockAdjustments'));
          writeBt.set(adjRef, {
            uid:       user.uid,
            itemId:    selectedItem,
            itemName:  items.find(i => i.id === selectedItem)?.name || 'Unknown',
            type:      diff > 0 ? 'add' : 'reduce',
            qty:       Math.abs(diff),
            reason:    `Batch Qty Adjusted (Invoice #${b.invoiceId.slice(-6).toUpperCase()})`,
            date:      new Date().toISOString().split('T')[0],
            createdAt: serverTimestamp(),
          });
        }

        await writeBt.commit();
        showToast(t.batchAdjustSuccess);
        setEditingBatchId(null);
      }
    } catch (err) {
      console.error(err);
      showToast('Error: ' + err.message, 'error');
    } finally {
      setIsSavingBatch(false);
    }
  };

  const startEditingBatch = (b) => {
    setEditingBatchId(b.batchId);
    setBatchEditData({
      remainingQty: b.remainingQty.toString(),
      buyingNetPrice: b.buyingNetPrice.toString(),
      retailPrice: b.retailPrice.toString(),
      retailDiscount: b.retailDiscount.toString(),
      wholesalePrice: b.wholesalePrice.toString(),
      wholesaleDiscount: b.wholesaleDiscount.toString(),
      loosePrice: b.loosePrice.toString(),
      looseDiscount: b.looseDiscount.toString()
    });
  };

  /* ── Sync Missing History ── */
  const handleSyncMissingHistory = async () => {
    const confirmed = await showConfirm(t.syncConfirm);
    if (!confirmed) return;

    setIsSyncing(true);
    try {
      const batch       = writeBatch(db);
      let   count       = 0;
      const existingIds = new Set(adjustments.map((a) => a.itemId));

      items.forEach((item) => {
        const actualStock = getActualStock(item);
        if (actualStock > 0 && !existingIds.has(item.id)) {
          const ref = doc(collection(db, 'stockAdjustments'));
          batch.set(ref, {
            uid:       user.uid,
            itemId:    item.id,
            itemName:  item.name || 'Unknown',
            type:      'add',
            qty:       actualStock,
            reason:    'Bulk Import (System Synced)',
            date:      new Date().toISOString().split('T')[0],
            createdAt: serverTimestamp(),
          });
          count++;
        }
      });

      if (count > 0) {
        await batch.commit();
        showToast(`${count} ${t.syncDone}`);
      } else {
        showToast(t.syncNone, 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error: ' + err.message, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  /* ── Changed fields ── */
  const changedFields = useMemo(() => {
    if (!editData || !originalData) return [];
    return Object.keys(editData).filter(
      (key) => String(editData[key]) !== String(originalData[key])
    );
  }, [editData, originalData]);

  /* ═══════════════════════════════════════
     STYLES
  ═══════════════════════════════════════ */
  const cardStyle = {
    background: 'white', padding: 20, borderRadius: 12,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 20,
  };

  const sectionStyle = {
    background: '#f8fafc', padding: 16, borderRadius: 10,
    marginBottom: 16, border: '1px solid #e2e8f0',
  };

  const sectionTitleStyle = {
    fontSize: 15, fontWeight: 'bold', color: '#334155',
    marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6,
  };

  const fieldRowStyle = { display: 'flex', gap: 12, flexWrap: 'wrap' };
  const fieldStyle    = { flex: '1 1 180px', marginBottom: 12 };

  const labelStyle = {
    display: 'block', fontSize: 12, fontWeight: '600',
    color: '#64748b', marginBottom: 4,
  };

  const inputStyle = {
    width: '100%', padding: '9px 10px', borderRadius: 6,
    border: '1px solid #cbd5e1', fontSize: 14,
    boxSizing: 'border-box', outline: 'none',
  };

  const autoInputStyle = {
    ...inputStyle,
    background: '#dcfce7', border: '2px solid #86efac',
    fontWeight: 'bold', color: '#166534', cursor: 'default',
  };

  const getFieldInputStyle = (fieldName) => {
    const isChanged = changedFields.includes(fieldName);
    return {
      ...inputStyle,
      border:     isChanged ? '2px solid #f59e0b' : '1px solid #cbd5e1',
      background: isChanged ? '#fffbeb' : 'white',
    };
  };

  /* ── Loading State ── */
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <div style={{
          width: 40, height: 40, margin: '0 auto 12px',
          border: '4px solid #e2e8f0', borderTopColor: '#3b82f6',
          borderRadius: '50%', animation: 'spin 1s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ color: '#64748b', fontWeight: 600 }}>Loading...</div>
      </div>
    );
  }

  /* ═══════════════════════════════════════
     RENDER
  ═══════════════════════════════════════ */
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      {confirm && (
        <ConfirmModal
          message={confirm.message}
          t={t}
          onConfirm={() => { confirm.resolve(true); setConfirm(null); }}
          onCancel={() => { confirm.resolve(false); setConfirm(null); }}
        />
      )}

      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 20,
        flexWrap: 'wrap', gap: 10,
      }}>
        <h2 style={{ color: '#1e293b', margin: 0 }}>{t.pageTitle}</h2>
        <button
          onClick={handleSyncMissingHistory}
          disabled={isSyncing}
          style={{
            padding: '8px 16px', background: '#6366f1',
            color: 'white', border: 'none', borderRadius: 6,
            fontSize: 13, cursor: isSyncing ? 'not-allowed' : 'pointer',
          }}
        >
          {isSyncing ? t.syncing : t.syncBtn}
        </button>
      </div>

      {/* Search Bar */}
      <div style={cardStyle}>
        <div style={{ position: 'relative' }} ref={dropdownRef}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 5, fontSize: 15 }}>
            {t.searchLabel}
          </label>

          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setIsDropdownOpen(true);
                if (selectedItem) {
                  const cur = items.find((i) => i.id === selectedItem);
                  if (cur?.name !== e.target.value) {
                    setSelectedItem('');
                    setEditData(null);
                    setOriginalData(null);
                    setIsStockDirty(false);
                  }
                }
              }}
              onFocus={() => setIsDropdownOpen(true)}
              placeholder={t.searchPlaceholder}
              style={{
                width: '100%', padding: '12px 40px 12px 14px',
                borderRadius: 8, fontSize: 14,
                boxSizing: 'border-box', outline: 'none',
                border: selectedItem ? '2px solid #22c55e' : '1px solid #ccc',
                background: selectedItem ? '#f0fdf4' : 'white',
              }}
            />
            {searchText && (
              <button
                onClick={handleClearSelection}
                style={{
                  position: 'absolute', right: 12, top: '50%',
                  transform: 'translateY(-50%)', background: 'none',
                  border: 'none', fontSize: 18, cursor: 'pointer',
                  color: '#94a3b8', padding: 0,
                }}
              >
                X
              </button>
            )}
          </div>

          {selectedItem && (() => {
            const si = items.find((i) => i.id === selectedItem);
            const rawStock = getActualStock(si);
            return (
              <div style={{
                marginTop: 8, padding: '8px 14px',
                background: rawStock >= 0 ? '#dcfce7' : '#fee2e2', 
                borderRadius: 8, fontSize: 13, 
                color: rawStock >= 0 ? '#166534' : '#991b1b',
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}>
                <strong>{si?.name}</strong>
                {si?.code && <span style={{ color: '#64748b' }}>| {t.code}: {si.code}</span>}
                <span>| {t.stock}: <strong style={{ textDecoration: rawStock < 0 ? 'underline' : 'none' }}>{rawStock}</strong></span>
              </div>
            );
          })()}

          {isDropdownOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0,
              zIndex: 1000, background: 'white',
              border: '1px solid #e2e8f0', borderRadius: 8,
              boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
              maxHeight: 280, overflowY: 'auto', marginTop: 4,
            }}>
              {filteredItems.length === 0 ? (
                <div style={{ padding: '20px 12px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                  🔍 "{searchText}" — {t.noResults}
                </div>
              ) : filteredItems.map((item, idx) => {
                const stk = getActualStock(item);
                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelectItem(item)}
                    style={{
                      padding: '10px 14px', cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center',
                      borderBottom: idx < filteredItems.length - 1 ? '1px solid #f1f5f9' : 'none',
                      background: selectedItem === item.id ? '#eff6ff' : 'white',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = selectedItem === item.id ? '#eff6ff' : 'white')}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
                      {item.code && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{t.code}: {item.code}</div>}
                    </div>
                    <span style={{
                      padding: '3px 10px', borderRadius: 12,
                      fontSize: 12, fontWeight: 'bold',
                      background: stk >= 0 ? '#dcfce7' : '#fee2e2',
                      color:      stk >= 0 ? '#166534' : '#991b1b',
                    }}>
                      {t.stock}: {stk}
                    </span>
                  </div>
                );
              })}
              {filteredItems.length > 0 && (
                <div style={{
                  padding: '8px 14px', background: '#f8fafc',
                  fontSize: 12, color: '#94a3b8', textAlign: 'center',
                  borderTop: '1px solid #e2e8f0',
                }}>
                  {filteredItems.length} / {items.length} {t.items}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Real-time Purchased Batches Panel */}
      {selectedItem && (
        <div style={{ ...cardStyle, borderLeft: '5px solid #2563eb' }}>
          <div style={{ ...sectionTitleStyle, fontSize: 16, color: '#1e3a8a', marginBottom: 14 }}>
            {t.batchesTitle}
          </div>
          {selectedItemBatches.length === 0 ? (
            <div style={{ padding: '24px 12px', textAlign: 'center', color: '#94a3b8', fontSize: 13, background: '#f8fafc', borderRadius: 10, border: '1px dashed #cbd5e1' }}>
              📭 {t.noBatches}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
              {selectedItemBatches.map((b) => {
                const isZero = b.remainingQty === 0;
                const isNegative = b.remainingQty < 0 || b.isVirtualDeficit;
                const isEditing = b.batchId === editingBatchId;

                return (
                  <div 
                    key={b.batchId} 
                    style={{ 
                      padding: '14px 16px', borderRadius: 12, 
                      background: isEditing ? '#fffbeb' : isNegative ? '#fff5f5' : isZero ? '#fafafa' : '#f0f9ff', 
                      border: isEditing ? '2px solid #fbbf24' : isNegative ? '2.5px dashed #f87171' : isZero ? '1px solid #cbd5e1' : '1px solid #93c5fd',
                      display: 'flex', flexDirection: 'column', gap: 10,
                      opacity: isZero && !isEditing ? 0.6 : 1
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 14, color: isNegative ? '#991b1b' : '#1e3a8a' }}>
                          {b.supplierName}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                          {b.date ? `📅 ${fmtDate(b.date)} | ` : ''}Invoice: <strong style={{ color: '#475569' }}>{b.invoiceId === 'VIRTUAL' ? 'POS NEGATIVE' : `#${b.invoiceId.slice(-6).toUpperCase()}`}</strong>
                        </div>
                      </div>
                      
                      {!isEditing && (
                        <button
                          onClick={() => startEditingBatch(b)}
                          style={{
                            padding: '4px 10px', background: isNegative ? '#ef4444' : '#3b82f6', color: 'white',
                            border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 'bold',
                            cursor: 'pointer'
                          }}
                        >
                          {t.adjustBatchBtn}
                        </button>
                      )}
                    </div>

                    {isEditing ? (
                      <div style={{ background: '#fff', padding: 14, borderRadius: 8, border: '1px solid #fde68a' }}>
                        
                        {/* Row 1: Stock Remaining & Buying Price */}
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                          <div style={{ flex: '1 1 120px' }}>
                            <label style={{ fontSize: 11, fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: 4 }}>
                              {t.remaining} {t.qtyLabel}
                            </label>
                            <input 
                              type="number" 
                              step="0.01"
                              value={batchEditData.remainingQty}
                              onChange={(e) => setBatchEditData(prev => ({ ...prev, remainingQty: e.target.value }))}
                              style={inputStyle}
                            />
                          </div>
                          <div style={{ flex: '1 1 120px' }}>
                            <label style={{ fontSize: 11, fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: 4 }}>
                              {t.buyingCost} (Rs.)
                            </label>
                            <input 
                              type="number" 
                              step="0.01"
                              disabled={b.isVirtualDeficit}
                              value={batchEditData.buyingNetPrice}
                              onChange={(e) => setBatchEditData(prev => ({ ...prev, buyingNetPrice: e.target.value }))}
                              style={inputStyle}
                            />
                          </div>
                        </div>

                        {/* pricing rows disabled if virtual deficit */}
                        {!b.isVirtualDeficit && (
                          <>
                            {/* Row 2: Retail Pricing in Batch */}
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12, borderTop: '1px dashed #e2e8f0', paddingTop: 10 }}>
                              <div style={{ flex: '1 1 120px' }}>
                                <label style={{ fontSize: 11, fontWeight: 'bold', color: '#1e3a8a', display: 'block', marginBottom: 4 }}>
                                  🏪 සිල්ලර මිල (Retail Price)
                                </label>
                                <input 
                                  type="number" 
                                  step="0.01"
                                  value={batchEditData.retailPrice}
                                  onChange={(e) => setBatchEditData(prev => ({ ...prev, retailPrice: e.target.value }))}
                                  style={inputStyle}
                                />
                              </div>
                              <div style={{ flex: '1 1 120px' }}>
                                <label style={{ fontSize: 11, fontWeight: 'bold', color: '#1e3a8a', display: 'block', marginBottom: 4 }}>
                                  සිල්ලර වට්ටම % (Retail Disc.)
                                </label>
                                <input 
                                  type="number" 
                                  step="0.1"
                                  value={batchEditData.retailDiscount}
                                  onChange={(e) => setBatchEditData(prev => ({ ...prev, retailDiscount: e.target.value }))}
                                  style={inputStyle}
                                />
                              </div>
                            </div>

                            {/* Row 3: Wholesale Pricing in Batch */}
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                              <div style={{ flex: '1 1 120px' }}>
                                <label style={{ fontSize: 11, fontWeight: 'bold', color: '#6d28d9', display: 'block', marginBottom: 4 }}>
                                  🏭 තොග මිල (Wholesale Price)
                                </label>
                                <input 
                                  type="number" 
                                  step="0.01"
                                  value={batchEditData.wholesalePrice}
                                  onChange={(e) => setBatchEditData(prev => ({ ...prev, wholesalePrice: e.target.value }))}
                                  style={inputStyle}
                                />
                              </div>
                              <div style={{ flex: '1 1 120px' }}>
                                <label style={{ fontSize: 11, fontWeight: 'bold', color: '#6d28d9', display: 'block', marginBottom: 4 }}>
                                  තොග වට්ටම % (Wholesale Disc.)
                                </label>
                                <input 
                                  type="number" 
                                  step="0.1"
                                  value={batchEditData.wholesaleDiscount}
                                  onChange={(e) => setBatchEditData(prev => ({ ...prev, wholesaleDiscount: e.target.value }))}
                                  style={inputStyle}
                                />
                              </div>
                            </div>

                            {/* Row 4: Loose Pricing in Batch */}
                            {hasLoosePrice && (
                              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                                <div style={{ flex: '1 1 120px' }}>
                                  <label style={{ fontSize: 11, fontWeight: 'bold', color: '#b45309', display: 'block', marginBottom: 4 }}>
                                    📦 ලූස් මිල (Loose Price)
                                  </label>
                                  <input 
                                    type="number" 
                                    step="0.01"
                                    value={batchEditData.loosePrice}
                                    onChange={(e) => setBatchEditData(prev => ({ ...prev, loosePrice: e.target.value }))}
                                    style={inputStyle}
                                  />
                                </div>
                                <div style={{ flex: '1 1 120px' }}>
                                  <label style={{ fontSize: 11, fontWeight: 'bold', color: '#b45309', display: 'block', marginBottom: 4 }}>
                                    ලූස් වට්ටම % (Loose Disc.)
                                  </label>
                                  <input 
                                    type="number" 
                                    step="0.1"
                                    value={batchEditData.looseDiscount}
                                    onChange={(e) => setBatchEditData(prev => ({ ...prev, looseDiscount: e.target.value }))}
                                    style={inputStyle}
                                  />
                                </div>
                              </div>
                            )}
                          </>
                        )}

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                          <button
                            disabled={isSavingBatch}
                            onClick={() => setEditingBatchId(null)}
                            style={{ padding: '6px 12px', background: '#cbd5e1', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}
                          >
                            {t.cancelBtn}
                          </button>
                          <button
                            disabled={isSavingBatch}
                            onClick={() => handleSaveBatchEdit(b)}
                            style={{ padding: '6px 12px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}
                          >
                            {isSavingBatch ? t.saving : t.saveBtn}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {/* Passive viewer pricing labels */}
                        {!b.isVirtualDeficit && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 10, background: '#fff', border: '1px solid #cbd5e1', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                              Cost: Rs.{fmt(b.buyingNetPrice)}
                            </span>
                            {b.retailPrice > 0 && (
                              <span style={{ fontSize: 10, background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                                Retail: Rs.{fmt(b.retailPrice)} {b.retailDiscount > 0 ? `(-${b.retailDiscount}%) = Rs.${fmt(b.retailPrice - (b.retailPrice * b.retailDiscount / 100))}` : ''}
                              </span>
                            )}
                            {b.wholesalePrice > 0 && (
                              <span style={{ fontSize: 10, background: '#f5f3ff', color: '#6d28d9', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                                Wholesale: Rs.{fmt(b.wholesalePrice)} {b.wholesaleDiscount > 0 ? `(-${b.wholesaleDiscount}%) = Rs.${fmt(b.wholesalePrice - (b.wholesalePrice * b.wholesaleDiscount / 100))}` : ''}
                              </span>
                            )}
                            {hasLoosePrice && b.loosePrice > 0 && (
                              <span style={{ fontSize: 10, background: '#fffbeb', color: '#b45309', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                                Loose: Rs.{fmt(b.loosePrice)} {b.looseDiscount > 0 ? `(-${b.looseDiscount}%) = Rs.${fmt(b.loosePrice - (b.loosePrice * b.looseDiscount / 100))}` : ''}
                              </span>
                            )}
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                          <span style={{ fontSize: 11, color: isNegative ? '#b91c1c' : '#64748b', fontWeight: isNegative ? 700 : 500 }}>
                            {b.isVirtualDeficit ? '⚠️ POS සෘණ විකුණුම් නිසා තොගයේ ඇතිවූ අඩුව පියවීමට මෙය 0 කරන්න' : 'Batch Pricing Details Synced'}
                          </span>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 15, fontWeight: 900, color: isNegative ? '#dc2626' : isZero ? '#64748b' : '#16a34a' }}>
                              {fmtQ(b.remainingQty)} <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>{b.isVirtualDeficit ? '' : `/ ${fmtQ(b.qty)}`}</span>
                            </div>
                            {isNegative ? (
                              <span style={{ fontSize: 9, background: '#fee2e2', color: '#b91c1c', padding: '1px 6px', borderRadius: 4, fontWeight: 700, display: 'inline-block', marginTop: 2 }}>POS OVERDRAWN</span>
                            ) : isZero ? (
                              <span style={{ fontSize: 9, background: '#f1f5f9', color: '#64748b', padding: '1px 6px', borderRadius: 4, fontWeight: 700, display: 'inline-block', marginTop: 2 }}>EMPTY</span>
                            ) : (
                              <span style={{ fontSize: 9, background: '#dcfce7', color: '#16a34a', padding: '1px 6px', borderRadius: 4, fontWeight: 700, display: 'inline-block', marginTop: 2 }}>ACTIVE</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Main Edit Form */}
      {editData && (
        <div style={cardStyle}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8,
          }}>
            <h3 style={{ margin: 0, color: '#1e293b' }}>
              ✏️ {t.editTitle} {items.find((i) => i.id === selectedItem)?.name}
            </h3>
            {changedFields.length > 0 && (
              <span style={{
                padding: '4px 12px', background: '#fef3c7',
                borderRadius: 20, fontSize: 12, fontWeight: 'bold',
                color: '#92400e',
              }}>
                ⚡ {changedFields.length} {t.fieldsChanged}
              </span>
            )}
          </div>

          {/* General Information Section */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>{t.generalInfo}</div>
            <div style={fieldRowStyle}>
              <div style={fieldStyle}>
                <label style={labelStyle}>{t.buyingPrice}</label>
                <input type="number" step="0.01" min="0" value={editData.buyingPrice} onChange={(e) => handleEditChange('buyingPrice', e.target.value)} style={getFieldInputStyle('buyingPrice')} placeholder="0.00" />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>{t.discountReceived}</label>
                <input type="number" step="0.01" min="0" value={editData.discountReceived} onChange={(e) => handleEditChange('discountReceived', e.target.value)} style={getFieldInputStyle('discountReceived')} placeholder="0" />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>{t.expiryDate}</label>
                <input type="date" value={editData.expiryDate} onChange={(e) => handleEditChange('expiryDate', e.target.value)} style={getFieldInputStyle('expiryDate')} />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>{t.racks}</label>
                <input type="text" value={editData.racks} onChange={(e) => handleEditChange('racks', e.target.value)} style={getFieldInputStyle('racks')} placeholder="A1, B2" />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>{t.quantity}</label>
                <input
                  type="number" step="1"
                  value={editData.stock}
                  onChange={(e) => handleEditChange('stock', e.target.value)}
                  style={{
                    ...getFieldInputStyle('stock'),
                    fontWeight: 'bold', fontSize: 16,
                    border: changedFields.includes('stock') ? '2px solid #ef4444' : '2px solid #3b82f6',
                    background: changedFields.includes('stock') ? '#fef2f2' : '#eff6ff',
                  }}
                  placeholder="0"
                />
                {changedFields.includes('stock') && (
                  <div style={{
                    marginTop: 4, fontSize: 12, fontWeight: 'bold',
                    color: (parseFloat(editData.stock) || 0) >= (originalData?._stock || 0) ? '#16a34a' : '#dc2626',
                  }}>
                    {(() => {
                      const diff = (parseFloat(editData.stock) || 0) - (originalData?._stock || 0);
                      return diff > 0
                        ? `📈 +${diff} (${t.added})`
                        : `📉 ${diff} (${t.reduced})`;
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Retail Pricing Section */}
          <div style={{ ...sectionStyle, border: '1px solid #bfdbfe', background: '#f0fdf4' }}>
            <div style={sectionTitleStyle}>{t.retailPricing}</div>
            <div style={fieldRowStyle}>
              <div style={fieldStyle}>
                <label style={labelStyle}>{t.sellingPrice}</label>
                <input type="number" step="0.01" min="0" value={editData.sellingPriceRetail} onChange={(e) => handleEditChange('sellingPriceRetail', e.target.value)} style={getFieldInputStyle('sellingPriceRetail')} placeholder="0.00" />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>{t.sellingDiscount}</label>
                <input type="number" step="0.01" min="0" max="100" value={editData.retailDiscount} onChange={(e) => handleEditChange('retailDiscount', e.target.value)} style={getFieldInputStyle('retailDiscount')} placeholder="0" />
              </div>
              <div style={{ ...fieldStyle, minWidth: 160 }}>
                <label style={{ ...labelStyle, color: '#166534' }}>{t.yourPrice}</label>
                <input type="text" readOnly value={editData.retailYourPrice ? `Rs. ${editData.retailYourPrice}` : ''} style={autoInputStyle} />
              </div>
            </div>
          </div>

          {/* Wholesale Pricing Section */}
          <div style={{ ...sectionStyle, border: '1px solid #c4b5fd', background: '#f5f3ff' }}>
            <div style={sectionTitleStyle}>{t.wholesalePricing}</div>
            <div style={fieldRowStyle}>
              <div style={fieldStyle}>
                <label style={labelStyle}>{t.sellingPrice}</label>
                <input type="number" step="0.01" min="0" value={editData.sellingPriceWholesale} onChange={(e) => handleEditChange('sellingPriceWholesale', e.target.value)} style={getFieldInputStyle('sellingPriceWholesale')} placeholder="0.00" />
              </div>
              <div style={fieldStyle}>
                <label style={{ ...labelStyle, color: '#166534' }}>{t.yourPrice}</label>
                <input type="text" readOnly value={editData.wholesaleYourPrice ? `Rs. ${editData.wholesaleYourPrice}` : ''} style={autoInputStyle} />
              </div>
            </div>
          </div>

          {/* Loose Pricing Section */}
          {hasLoosePrice && (
            <div style={{ ...sectionStyle, border: '2px solid #fbbf24', background: '#fffbeb' }}>
              <div style={sectionTitleStyle}>
                {t.loosePricing}
                <span style={{ padding: '2px 8px', background: '#fbbf24', color: '#78350f', borderRadius: 12, fontSize: 11, fontWeight: 'bold' }}>
                  {t.looseItem}
                </span>
              </div>
              <div style={fieldRowStyle}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>{t.loosePrice}</label>
                  <input type="number" step="0.01" min="0" value={editData.sellingPriceLoose} onChange={(e) => handleEditChange('sellingPriceLoose', e.target.value)} style={getFieldInputStyle('sellingPriceLoose')} placeholder="0.00" />
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>{t.looseDiscount}</label>
                  <input type="number" step="0.01" min="0" max="100" value={editData.looseDiscount} onChange={(e) => handleEditChange('looseDiscount', e.target.value)} style={getFieldInputStyle('looseDiscount')} placeholder="0" />
                </div>
                <div style={{ ...fieldStyle, minWidth: 160 }}>
                  <label style={{ ...labelStyle, color: '#166534' }}>{t.yourLoosePrice}</label>
                  <input type="text" readOnly value={editData.looseYourPrice ? `Rs. ${editData.looseYourPrice}` : ''} style={autoInputStyle} />
                </div>
              </div>
            </div>
          )}

          {/* Bottom Action Buttons */}
          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            <button
              onClick={handleSaveEdit}
              disabled={isSaving || changedFields.length === 0}
              style={{
                flex: 1, padding: 14,
                background: isSaving ? '#94a3b8' : changedFields.length === 0 ? '#cbd5e1' : '#22c55e',
                color: 'white', border: 'none', borderRadius: 10,
                fontWeight: 'bold', fontSize: 16,
                cursor: isSaving || changedFields.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {isSaving
                ? t.saving
                : changedFields.length === 0
                  ? t.noChanges
                  : `${t.saveChanges} (${changedFields.length})`}
            </button>
            <button
              onClick={handleResetForm}
              disabled={changedFields.length === 0}
              style={{
                padding: '14px 24px',
                background: changedFields.length === 0 ? '#f1f5f9' : '#fef3c7',
                color:      changedFields.length === 0 ? '#cbd5e1' : '#92400e',
                border: '1px solid #e2e8f0', borderRadius: 10,
                fontWeight: 'bold', fontSize: 14,
                cursor: changedFields.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {t.reset}
            </button>
          </div>
        </div>
      )}

      {/* Select Prompt */}
      {!editData && !selectedItem && (
        <div style={{ ...cardStyle, textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 15 }}>
          ☝️ {t.selectPrompt}
        </div>
      )}

      {/* Real-time Adjustment History Table */}
      <h3 style={{ color: '#64748b', marginTop: 30 }}>{t.historyTitle}</h3>
      <div style={{
        background: 'white', borderRadius: 12,
        overflow: 'auto', boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 500 }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
              {[t.date, t.item, t.type, t.qtyLabel, t.reason].map((h) => (
                <th key={h} style={{ padding: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {adjustments.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>
                  {t.noAdjustments}
                </td>
              </tr>
            ) : adjustments.map((adj) => (
              <tr key={adj.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: 12 }}>{adj.date}</td>
                <td style={{ padding: 12, fontWeight: 'bold' }}>{adj.itemName}</td>
                <td style={{ padding: 12 }}>
                  <span style={{
                    padding: '4px 8px', borderRadius: 6,
                    fontSize: 12, fontWeight: 'bold',
                    background: adj.type === 'add' ? '#dcfce7' : '#fee2e2',
                    color:      adj.type === 'add' ? '#166534' : '#991b1b',
                  }}>
                    {adj.type === 'add' ? t.added : t.reduced}
                  </span>
                </td>
                <td style={{ padding: 12 }}>{adj.qty}</td>
                <td style={{ padding: 12, color: '#64748b' }}>{adj.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}