'use client';

// app/(protected)/stock-value/page.jsx
// ✅ Total Stock Value Report Page (Updated for exact Purchase Discount sync)
// ✅ Cost (After Discount Received), Selling, and Expected Profit summary
// ✅ Filtering by Category, Rack, Stock Status
// ✅ CSV Export capability
// ✅ Real-time data sync from Firestore
// ✅ Fully synced with purchase form database fields (buyingDiscount & buyingNetPrice)

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useUserAuth } from '@/context/UserContext';
import { useLang } from '@/hooks/useLang';

/* ═══════════════════════════════════════
   TRANSLATIONS
═══════════════════════════════════════ */
const TEXT = {
  si: {
    pageTitle:       '💰 මුළු තොග වටිනාකම',
    subtitle:        'දැනට ඇති සියලුම භාණ්ඩ වල මුළු වටිනාකම (ලැබුණු වට්ටම් අඩුකර ඇත)',
    totalItems:      'මුළු භාණ්ඩ ගණන',
    totalUnits:      'මුළු ඒකක ගණන',
    totalCost:       'මුළු ගැනුම් වටිනාකම',
    totalSelling:    'මුළු විකුණුම් වටිනාකම',
    expectedProfit:  'අපේක්ෂිත ලාභය',
    profitMargin:    'ලාභ ප්‍රතිශතය',
    lowStockCount:   'අඩු තොග (< 5)',
    outOfStockCount: 'නිම වූ තොග',
    activeItems:     'සක්‍රීය භාණ්ඩ',
    searchLabel:     '🔍 සොයන්න',
    searchPlaceholder:'නම, කේතය හෝ බාර්කෝඩ්...',
    filterCategory:  'වර්ගය',
    filterRack:      'රාක්කය',
    filterStatus:    'තත්ත්වය',
    sortBy:          'අනුපිළිවෙල',
    all:             'සියල්ල',
    inStock:         '🟢 තොග ඇත',
    lowStock:        '🟡 අඩු තොග',
    outOfStock:      '🔴 නිම වූ',
    sortName:        'නම (A-Z)',
    sortCostHigh:    'වටිනාකම (වැඩිම)',
    sortCostLow:     'වටිනාකම (අඩුම)',
    sortStockHigh:   'තොග (වැඩිම)',
    sortStockLow:    'තොග (අඩුම)',
    itemName:        'භාණ්ඩය',
    code:            'කේතය',
    category:        'වර්ගය',
    rack:            'රාක්කය',
    stockQty:        'ප්‍රමාණය',
    buyingPrice:     'ගැනුම් මිල (Net)',
    sellingPrice:    'විකුණුම් මිල',
    costValue:       'ගැනුම් වටිනාකම',
    sellValue:       'විකුණුම් වටිනාකම',
    profit:          'ලාභය',
    noItems:         'භාණ්ඩ නොමැත',
    noResults:       'ප්‍රතිඵල නොමැත',
    exportBtn:       '📥 CSV Export',
    grandTotal:      'මුළු වටිනාකම',
    unit:            'ඒකකය',
    loading:         'දත්ත පූරණය වෙමින්...',
    itemsShown:      'භාණ්ඩ පෙන්වයි',
    of:              'න්',
    clearFilters:    '❌ Filter ඉවත් කරන්න',
    stockValue:      'තොග වටිනාකම',
    priceMode:       'මිල ගණන්',
    priceRetail:     'සිල්ලර',
    priceWholesale:  'තොග',
    priceLoose:      'ලූස්',
  },
  en: {
    pageTitle:       '💰 Total Stock Value',
    subtitle:        'Total value of all current inventory items (buying discounts applied)',
    totalItems:      'Total Items',
    totalUnits:      'Total Units',
    totalCost:       'Total Cost Value',
    totalSelling:    'Total Selling Value',
    expectedProfit:  'Expected Profit',
    profitMargin:    'Profit Margin',
    lowStockCount:   'Low Stock (< 5)',
    outOfStockCount: 'Out of Stock',
    activeItems:     'Active Items',
    searchLabel:     '🔍 Search',
    searchPlaceholder:'Name, code or barcode...',
    filterCategory:  'Category',
    filterRack:      'Rack',
    filterStatus:    'Status',
    sortBy:          'Sort By',
    all:             'All',
    inStock:         '🟢 In Stock',
    lowStock:        '🟡 Low Stock',
    outOfStock:      '🔴 Out of Stock',
    sortName:        'Name (A-Z)',
    sortCostHigh:    'Value (Highest)',
    sortCostLow:     'Value (Lowest)',
    sortStockHigh:   'Stock (Highest)',
    sortStockLow:    'Stock (Lowest)',
    itemName:        'Item Name',
    code:            'Code',
    category:        'Category',
    rack:            'Rack',
    stockQty:        'Qty',
    buyingPrice:     'Buying Price (Net)',
    sellingPrice:    'Selling Price',
    costValue:       'Cost Value',
    sellValue:       'Sell Value',
    profit:          'Profit',
    noItems:         'No items',
    noResults:       'No results',
    exportBtn:       '📥 Export CSV',
    grandTotal:      'Grand Total',
    unit:            'Unit',
    loading:         'Loading data...',
    itemsShown:      'items shown',
    of:              'of',
    clearFilters:    '❌ Clear Filters',
    stockValue:      'Stock Value',
    priceMode:       'Price Type',
    priceRetail:     'Retail',
    priceWholesale:  'Wholesale',
    priceLoose:      'Loose',
  },
};

/* ═══════════════════════════════════════
   HELPER FUNCTIONS
═══════════════════════════════════════ */
const R2 = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : Math.round(n * 100) / 100; };
const fmt = (v) => R2(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQ = (v) => {
  const n = parseFloat(v);
  return isNaN(n) ? '0' : Number.isInteger(n) ? n.toString() : n.toFixed(2);
};

const getActualStock = (item) => {
  if (!item) return 0;
  const s  = parseFloat(item.stock)        || 0;
  const cs = parseFloat(item.currentStock) || 0;
  let ms   = 0;
  if (item.stocks && typeof item.stocks === 'object') {
    ms = Object.values(item.stocks).reduce(
      (sum, v) => sum + (parseFloat(v) || 0), 0
    );
  }
  return Math.max(0, s, ms, cs);
};

// ✅ Dynamically gets the exact discount percentage from DB
const getBuyingDiscountPercent = (item) => {
  if (!item) return 0;
  return R2(
    item.buyingDiscount !== undefined ? item.buyingDiscount :
    item.discountPercent !== undefined ? item.discountPercent :
    item.discountReceived !== undefined ? item.discountReceived :
    item.discount || 0
  );
};

// ✅ Recalculates Net Buying Price using exact DB parameters (buyingNetPrice, buyingDiscount)
const getBuyingPrice = (item) => {
  if (!item) return 0;

  // 1. If exact pre-calculated Net Buying Price is saved in Firestore, use it directly!
  const dbNetPrice = R2(item.buyingNetPrice || item.netCost || item.netPrice || 0);
  if (dbNetPrice > 0) return dbNetPrice;

  // 2. Fallback: Calculate manually using buying price and discount percent
  const bp = R2(item.buyingPrice || item.costPrice || item.purchasePrice || 0);
  const discPercent = getBuyingDiscountPercent(item);

  if (bp <= 0) return 0;
  if (discPercent > 0) {
    return R2(bp - (bp * discPercent / 100)); // ශුද්ධ ගැනුම් මිල ගණනය කිරීම
  }
  return bp;
};

const getSellingPrice = (item, mode = 'retail') => {
  if (!item) return 0;
  if (mode === 'wholesale') {
    return R2(item.sellingPriceWholesale || item.wholesaleSellingPrice || item.wholesalePrice || 0);
  }
  if (mode === 'loose') {
    return R2(item.sellingPriceLoose || item.retailSellingPriceLoose || item.loosePrice || 0);
  }
  return R2(
    item.sellingPriceRetail || item.retailSellingPrice ||
    item.sellingPrice || item.price || 0
  );
};

const getYourPrice = (item, mode = 'retail') => {
  if (!item) return 0;
  const sp = getSellingPrice(item, mode);
  let disc = 0;
  if (mode === 'wholesale') disc = R2(item.wholesaleDiscount || item.wholesaleSellingDiscount || 0);
  else if (mode === 'loose') disc = R2(item.looseDiscount || item.retailSellingLooseDiscount || 0);
  else disc = R2(item.retailDiscount || item.retailSellingDiscount || 0);

  if (sp <= 0) return 0;
  return R2(sp - (sp * disc / 100));
};

const getRack = (i) => i?.racks || i?.rackName || i?.rack || i?.rackNo || '';
const getCategory = (i) => i?.category || i?.categoryName || '';

/* ═══════════════════════════════════════
   STAT CARD COMPONENT
═══════════════════════════════════════ */
const StatCard = React.memo(({ icon, title, value, subtitle, color, bgColor }) => (
  <div style={{
    background: bgColor || 'white',
    padding: '16px 18px',
    borderRadius: 12,
    border: `1px solid ${color}30`,
    boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minHeight: 100,
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 22 }}>{icon}</span>
      <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</span>
    </div>
    <div style={{ fontSize: 22, fontWeight: 900, color: color, marginTop: 4 }}>{value}</div>
    {subtitle && <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{subtitle}</div>}
  </div>
));
StatCard.displayName = 'StatCard';

/* ═══════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════ */
export default function StockValuePage() {
  const { user } = useUserAuth();
  const { lang } = useLang();
  const t = useMemo(() => TEXT[lang] || TEXT.si, [lang]);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchText, setSearchText] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterRack, setFilterRack] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [priceMode, setPriceMode] = useState('retail');

  /* ── Firestore listener ── */
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(
      query(collection(db, 'items'), where('uid', '==', user.uid)),
      (snap) => {
        setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('Load error:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [user?.uid]);

  /* ── Extract unique categories & racks ── */
  const categories = useMemo(() => {
    const s = new Set();
    items.forEach(i => { const c = getCategory(i); if (c) s.add(c); });
    return [...s].sort();
  }, [items]);

  const racks = useMemo(() => {
    const s = new Set();
    items.forEach(i => { const r = getRack(i); if (r) s.add(r); });
    return [...s].sort();
  }, [items]);

  /* ── Enrich items with calculated values ── */
  const enrichedItems = useMemo(() => {
    return items.map(item => {
      const stock = getActualStock(item);
      const cost = getBuyingPrice(item); // exact net buying price is pulled here
      const sellPrice = getYourPrice(item, priceMode);
      const costValue = R2(stock * cost);
      const sellValue = R2(stock * sellPrice);
      const profit = R2(sellValue - costValue);
      return { 
        ...item, 
        _stock: stock, 
        _cost: cost, 
        _sellPrice: sellPrice, 
        _costValue: costValue, 
        _sellValue: sellValue, 
        _profit: profit 
      };
    });
  }, [items, priceMode]);

  /* ── Filtered items ── */
  const filteredItems = useMemo(() => {
    let list = enrichedItems.filter(item => {
      const search = searchText.toLowerCase().trim();
      if (search) {
        const combined = [item.name, item.sinhalaName, item.nameSi, item.itemCode, item.code, item.barcode]
          .filter(Boolean).join(' ').toLowerCase();
        if (!combined.includes(search)) return false;
      }
      if (filterCategory && getCategory(item) !== filterCategory) return false;
      if (filterRack && getRack(item) !== filterRack) return false;
      if (filterStatus === 'in') { if (item._stock <= 0) return false; }
      else if (filterStatus === 'low') { if (item._stock <= 0 || item._stock > 5) return false; }
      else if (filterStatus === 'out') { if (item._stock > 0) return false; }
      return true;
    });

    // Sort
    if (sortBy === 'name') list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (sortBy === 'costHigh') list.sort((a, b) => b._costValue - a._costValue);
    else if (sortBy === 'costLow') list.sort((a, b) => a._costValue - b._costValue);
    else if (sortBy === 'stockHigh') list.sort((a, b) => b._stock - a._stock);
    else if (sortBy === 'stockLow') list.sort((a, b) => a._stock - b._stock);

    return list;
  }, [enrichedItems, searchText, filterCategory, filterRack, filterStatus, sortBy]);

  /* ── Overall Summary Totals ── */
  const summary = useMemo(() => {
    let totalCost = 0, totalSell = 0, totalUnits = 0;
    let lowCount = 0, outCount = 0, activeCount = 0;
    filteredItems.forEach(i => {
      totalCost  += i._costValue;
      totalSell  += i._sellValue;
      totalUnits += i._stock;
      if (i._stock <= 0) outCount++;
      else {
        activeCount++;
        if (i._stock <= 5) lowCount++;
      }
    });
    const profit = R2(totalSell - totalCost);
    const margin = totalSell > 0 ? R2((profit / totalSell) * 100) : 0;
    return {
      totalCost: R2(totalCost),
      totalSell: R2(totalSell),
      totalUnits: R2(totalUnits),
      profit,
      margin,
      lowCount,
      outCount,
      activeCount,
      itemCount: filteredItems.length,
    };
  }, [filteredItems]);

  /* ── Clear filters ── */
  const clearFilters = useCallback(() => {
    setSearchText('');
    setFilterCategory('');
    setFilterRack('');
    setFilterStatus('');
    setSortBy('name');
  }, []);

  const hasFilters = searchText || filterCategory || filterRack || filterStatus || sortBy !== 'name';

  /* ── CSV Export ── */
  const exportCSV = useCallback(() => {
    if (!filteredItems.length) return;
    const headers = [
      t.itemName, t.code, t.category, t.rack, t.stockQty,
      t.buyingPrice, t.sellingPrice, t.costValue, t.sellValue, t.profit
    ];
    const rows = filteredItems.map(i => [
      `"${(i.name || '').replace(/"/g, '""')}"`,
      `"${i.itemCode || i.code || ''}"`,
      `"${getCategory(i)}"`,
      `"${getRack(i)}"`,
      i._stock,
      i._cost,
      i._sellPrice,
      i._costValue,
      i._sellValue,
      i._profit,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stock-value-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [filteredItems, t]);

  /* ── Styles ── */
  const cardStyle = {
    background: 'white',
    padding: 16,
    borderRadius: 12,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    marginBottom: 16,
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #cbd5e1',
    fontSize: 14,
    boxSizing: 'border-box',
    outline: 'none',
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <div style={{
          width: 40, height: 40, margin: '0 auto 12px',
          border: '4px solid #e2e8f0', borderTopColor: '#3b82f6',
          borderRadius: '50%', animation: 'spin 1s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ color: '#64748b', fontWeight: 600 }}>{t.loading}</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: 16 }}>
      {/* Header */}
      <div style={{
        marginBottom: 20,
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', flexWrap: 'wrap', gap: 10,
      }}>
        <div>
          <h2 style={{ color: '#1e293b', margin: 0, fontSize: 24 }}>{t.pageTitle}</h2>
          <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 13 }}>{t.subtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Price Mode */}
          <div style={{ display: 'flex', gap: 2, background: '#f1f5f9', padding: 3, borderRadius: 8 }}>
            {['retail', 'wholesale', 'loose'].map(m => (
              <button key={m} onClick={() => setPriceMode(m)} style={{
                padding: '6px 10px', border: 'none', borderRadius: 6,
                cursor: 'pointer', fontSize: 12, fontWeight: 700,
                background: priceMode === m ? '#3b82f6' : 'transparent',
                color: priceMode === m ? 'white' : '#64748b',
              }}>
                {m === 'retail' ? t.priceRetail : m === 'wholesale' ? t.priceWholesale : t.priceLoose}
              </button>
            ))}
          </div>
          <button onClick={exportCSV} disabled={!filteredItems.length} style={{
            padding: '8px 14px', background: filteredItems.length ? '#16a34a' : '#cbd5e1',
            color: 'white', border: 'none', borderRadius: 8,
            fontSize: 13, fontWeight: 700,
            cursor: filteredItems.length ? 'pointer' : 'not-allowed',
          }}>
            {t.exportBtn}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 12, marginBottom: 20,
      }}>
        <StatCard icon="📦" title={t.totalItems} value={summary.itemCount} subtitle={`${fmtQ(summary.totalUnits)} ${t.unit}`} color="#3b82f6" bgColor="#eff6ff" />
        <StatCard icon="💰" title={t.totalCost} value={`Rs.${fmt(summary.totalCost)}`} color="#f59e0b" bgColor="#fffbeb" />
        <StatCard icon="📈" title={t.totalSelling} value={`Rs.${fmt(summary.totalSell)}`} color="#8b5cf6" bgColor="#f5f3ff" />
        <StatCard icon="💎" title={t.expectedProfit} value={`Rs.${fmt(summary.profit)}`} subtitle={`${t.profitMargin}: ${summary.margin}%`} color={summary.profit >= 0 ? '#16a34a' : '#dc2626'} bgColor={summary.profit >= 0 ? '#f0fdf4' : '#fef2f2'} />
        <StatCard icon="🟢" title={t.activeItems} value={summary.activeCount} color="#16a34a" bgColor="#f0fdf4" />
        <StatCard icon="🟡" title={t.lowStockCount} value={summary.lowCount} color="#f59e0b" bgColor="#fffbeb" />
        <StatCard icon="🔴" title={t.outOfStockCount} value={summary.outCount} color="#dc2626" bgColor="#fef2f2" />
      </div>

      {/* Filters */}
      <div style={cardStyle}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 10,
        }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>
              {t.searchLabel}
            </label>
            <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
              placeholder={t.searchPlaceholder} style={inputStyle} />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>
              {t.filterCategory}
            </label>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={inputStyle}>
              <option value="">{t.all}</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>
              {t.filterRack}
            </label>
            <select value={filterRack} onChange={e => setFilterRack(e.target.value)} style={inputStyle}>
              <option value="">{t.all}</option>
              {racks.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>
              {t.filterStatus}
            </label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={inputStyle}>
              <option value="">{t.all}</option>
              <option value="in">{t.inStock}</option>
              <option value="low">{t.lowStock}</option>
              <option value="out">{t.outOfStock}</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>
              {t.sortBy}
            </label>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={inputStyle}>
              <option value="name">{t.sortName}</option>
              <option value="costHigh">{t.sortCostHigh}</option>
              <option value="costLow">{t.sortCostLow}</option>
              <option value="stockHigh">{t.sortStockHigh}</option>
              <option value="stockLow">{t.sortStockLow}</option>
            </select>
          </div>

          {hasFilters && (
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button onClick={clearFilters} style={{
                padding: '10px 14px', background: '#fee2e2', color: '#dc2626',
                border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700,
                cursor: 'pointer', width: '100%',
              }}>
                {t.clearFilters}
              </button>
            </div>
          )}
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: '#64748b' }}>
          <strong>{filteredItems.length}</strong> {t.of} <strong>{items.length}</strong> {t.itemsShown}
        </div>
      </div>

      {/* Items Table */}
      <div style={{
        background: 'white', borderRadius: 12,
        overflow: 'auto', boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 900 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: '12px 10px', textAlign: 'left', fontSize: 11, color: '#475569', fontWeight: 700 }}>{t.itemName}</th>
              <th style={{ padding: '12px 10px', textAlign: 'left', fontSize: 11, color: '#475569', fontWeight: 700 }}>{t.code}</th>
              <th style={{ padding: '12px 10px', textAlign: 'left', fontSize: 11, color: '#475569', fontWeight: 700 }}>{t.rack}</th>
              <th style={{ padding: '12px 10px', textAlign: 'right', fontSize: 11, color: '#475569', fontWeight: 700 }}>{t.stockQty}</th>
              <th style={{ padding: '12px 10px', textAlign: 'right', fontSize: 11, color: '#475569', fontWeight: 700 }}>{t.buyingPrice}</th>
              <th style={{ padding: '12px 10px', textAlign: 'right', fontSize: 11, color: '#475569', fontWeight: 700 }}>{t.sellingPrice}</th>
              <th style={{ padding: '12px 10px', textAlign: 'right', fontSize: 11, color: '#b45309', fontWeight: 700 }}>{t.costValue}</th>
              <th style={{ padding: '12px 10px', textAlign: 'right', fontSize: 11, color: '#7c3aed', fontWeight: 700 }}>{t.sellValue}</th>
              <th style={{ padding: '12px 10px', textAlign: 'right', fontSize: 11, color: '#16a34a', fontWeight: 700 }}>{t.profit}</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                  📭 {t.noResults}
                </td>
              </tr>
            ) : filteredItems.map(item => {
              const zero = item._stock <= 0;
              const low = item._stock > 0 && item._stock <= 5;
              const discPercent = getBuyingDiscountPercent(item);
              const hasDiscount = discPercent > 0;
              return (
                <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', background: zero ? '#fef2f2' : low ? '#fffbeb' : 'white' }}>
                  <td style={{ padding: '10px', fontWeight: 600, color: '#0f172a' }}>
                    {item.name}
                    {(item.sinhalaName || item.nameSi) && (
                      <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 500, marginTop: 2 }}>
                        {item.sinhalaName || item.nameSi}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px', color: '#64748b', fontSize: 12 }}>{item.itemCode || item.code || '-'}</td>
                  <td style={{ padding: '10px' }}>
                    {getRack(item) && (
                      <span style={{ background: '#fef2f2', color: '#e11d48', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                        📍 {getRack(item)}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>
                    <span style={{
                      padding: '3px 8px', borderRadius: 6,
                      fontSize: 12, fontWeight: 800,
                      background: zero ? '#fee2e2' : low ? '#fef3c7' : '#dcfce7',
                      color: zero ? '#dc2626' : low ? '#b45309' : '#166534',
                    }}>
                      {zero ? '🔴' : low ? '🟡' : '🟢'} {fmtQ(item._stock)}
                    </span>
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#0f172a', fontWeight: 'bold' }}>
                    Rs.{fmt(item._cost)}
                    {hasDiscount && (
                      <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 'bold', marginTop: 3 }}>
                        🏷️ Disc: {discPercent}%
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#64748b' }}>Rs.{fmt(item._sellPrice)}</td>
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: '#b45309' }}>Rs.{fmt(item._costValue)}</td>
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: '#7c3aed' }}>Rs.{fmt(item._sellValue)}</td>
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: item._profit >= 0 ? '#16a34a' : '#dc2626' }}>
                    Rs.{fmt(item._profit)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {filteredItems.length > 0 && (
            <tfoot>
              <tr style={{ background: '#1e293b', color: 'white', fontWeight: 700 }}>
                <td colSpan={3} style={{ padding: '14px 10px', fontSize: 13 }}>
                  🎯 {t.grandTotal} ({filteredItems.length} {t.itemsShown})
                </td>
                <td style={{ padding: '14px 10px', textAlign: 'right', fontSize: 14 }}>
                  {fmtQ(summary.totalUnits)}
                </td>
                <td colSpan={2}></td>
                <td style={{ padding: '14px 10px', textAlign: 'right', fontSize: 14, color: '#fbbf24' }}>
                  Rs.{fmt(summary.totalCost)}
                </td>
                <td style={{ padding: '14px 10px', textAlign: 'right', fontSize: 14, color: '#c4b5fd' }}>
                  Rs.{fmt(summary.totalSell)}
                </td>
                <td style={{ padding: '14px 10px', textAlign: 'right', fontSize: 14, color: summary.profit >= 0 ? '#4ade80' : '#f87171' }}>
                  Rs.{fmt(summary.profit)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Footer note */}
      <div style={{ marginTop: 20, padding: 12, background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe', fontSize: 12, color: '#1e40af' }}>
        💡 <strong>සටහන:</strong> ගැනුම් මිල ගණනය කර ඇත්තේ ලැබුණු වට්ටම (<strong>Buying Discount % / Discount Received %</strong>) අඩු කිරීමෙන් පසුවය. 
        එමෙන්ම මෙම වටිනාකම් තෝරාගත් <strong>{priceMode === 'retail' ? t.priceRetail : priceMode === 'wholesale' ? t.priceWholesale : t.priceLoose}</strong> මිල අනුව දළ ලාභය ගණනය කර පෙන්වයි.
      </div>
    </div>
  );
}