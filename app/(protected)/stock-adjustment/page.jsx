'use client';

// app/(protected)/stock-adjustment/page.jsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '@/lib/firebase';
import {
  collection, query, where, onSnapshot,
  addDoc, doc, updateDoc, serverTimestamp,
  getDocs, writeBatch,
} from 'firebase/firestore';
import { useUserAuth } from '@/context/UserContext';

/* ═══════════════════════════════════════
   TOAST
═══════════════════════════════════════ */
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed', top: 20, left: '50%',
        transform: 'translateX(-50%)',
        background: type === 'error' ? '#dc2626' : '#16a34a',
        color: 'white', padding: '12px 22px',
        borderRadius: 12, fontWeight: 700,
        fontSize: 14, zIndex: 9999,
        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
        animation: 'fadeIn 0.3s ease',
        maxWidth: 360, textAlign: 'center',
      }}
    >
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
   CONFIRM MODAL
═══════════════════════════════════════ */
function ConfirmModal({ message, onConfirm, onCancel }) {
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
          ⚠️ Confirm
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
            අවලංගු
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
            ඔව්, ඉදිරියට යන්න
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

  const [items,       setItems]       = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [loading,     setLoading]     = useState(true);

  const [searchText,     setSearchText]     = useState('');
  const [selectedItem,   setSelectedItem]   = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const [editData,      setEditData]      = useState(null);
  const [originalData,  setOriginalData]  = useState(null);
  const [hasLoosePrice, setHasLoosePrice] = useState(false);
  const [isSaving,      setIsSaving]      = useState(false);
  const [isSyncing,     setIsSyncing]     = useState(false);

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

  /* ── Helpers ── */
  const sortByDate = (data) =>
    data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  const calcYourPrice = (price, discount) => {
    const p = parseFloat(price)    || 0;
    const d = parseFloat(discount) || 0;
    if (p <= 0) return '';
    return (p - (p * d / 100)).toFixed(2);
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
    return Math.max(s, ms, cs);
  };

  const populateEditData = (item) => {
    const actualStock = getActualStock(item);
    const data = {
      discountReceived:          item.discountReceived          ?? '',
      expiryDate:                item.expiryDate                ?? '',
      racks:                     item.racks                     ?? '',
      stock:                     actualStock,
      retailSellingPrice:        item.retailSellingPrice        ?? '',
      retailSellingDiscount:     item.retailSellingDiscount     ?? '',
      retailYourPrice:           item.retailYourPrice
        ?? calcYourPrice(item.retailSellingPrice, item.retailSellingDiscount),
      wholesaleSellingPrice:     item.wholesaleSellingPrice     ?? '',
      wholesaleSellingDiscount:  item.wholesaleSellingDiscount  ?? '',
      wholesaleYourPrice:        item.wholesaleYourPrice
        ?? calcYourPrice(item.wholesaleSellingPrice, item.wholesaleSellingDiscount),
      retailSellingPriceLoose:   item.retailSellingPriceLoose   ?? '',
      retailSellingLooseDiscount:item.retailSellingLooseDiscount ?? '',
      retailYourLoosePrice:      item.retailYourLoosePrice
        ?? calcYourPrice(item.retailSellingPriceLoose, item.retailSellingLooseDiscount),
    };
    setEditData(data);
    setOriginalData({ ...data, _stock: actualStock });
    setHasLoosePrice(
      !!(item.retailSellingPriceLoose || item.priceLoos || item.priceLoose || item.loosePrice || item.isLoose)
    );
  };

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

  /* ── Load history ── */
  const loadHistory = useCallback(async () => {
    if (!user) return;
    try {
      const snap = await getDocs(
        query(collection(db, 'stockAdjustments'), where('uid', '==', user.uid))
      );
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      sortByDate(data);
      setAdjustments(data);
    } catch (err) {
      console.error('Error loading history:', err);
    }
  }, [user]);

  /* ── Load items ── */
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, 'items'), where('uid', '==', user.uid)),
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    loadHistory().finally(() => setLoading(false));
    return () => unsub();
  }, [user, loadHistory]);

  /* ── Filtered items ── */
  const filteredItems = items.filter((item) =>
    item.name?.toLowerCase().includes(searchText.toLowerCase()) ||
    item.code?.toLowerCase().includes(searchText.toLowerCase()) ||
    item.barcode?.toLowerCase().includes(searchText.toLowerCase())
  );

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
    setHasLoosePrice(false);
  };

  const handleResetForm = () => {
    const item = items.find((i) => i.id === selectedItem);
    if (item) populateEditData(item);
  };

  const handleEditChange = (field, value) => {
    setEditData((prev) => {
      const updated = { ...prev, [field]: value };

      if (field === 'retailSellingPrice' || field === 'retailSellingDiscount') {
        updated.retailYourPrice = calcYourPrice(
          field === 'retailSellingPrice' ? value : prev.retailSellingPrice,
          field === 'retailSellingDiscount' ? value : prev.retailSellingDiscount
        );
      }

      if (field === 'wholesaleSellingPrice' || field === 'wholesaleSellingDiscount') {
        updated.wholesaleYourPrice = calcYourPrice(
          field === 'wholesaleSellingPrice' ? value : prev.wholesaleSellingPrice,
          field === 'wholesaleSellingDiscount' ? value : prev.wholesaleSellingDiscount
        );
      }

      if (field === 'retailSellingPriceLoose' || field === 'retailSellingLooseDiscount') {
        updated.retailYourLoosePrice = calcYourPrice(
          field === 'retailSellingPriceLoose' ? value : prev.retailSellingPriceLoose,
          field === 'retailSellingLooseDiscount' ? value : prev.retailSellingLooseDiscount
        );
      }

      return updated;
    });
  };

  /* ── Save ── */
  const handleSaveEdit = async () => {
    if (!selectedItem || !editData) {
      showToast('කරුණාකර Item එකක් තෝරන්න', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const item    = items.find((i) => i.id === selectedItem);
      const itemRef = doc(db, 'items', selectedItem);

      const toNum = (val) =>
        val !== '' && val !== undefined && val !== null
          ? parseFloat(val) : '';

      const newStock = parseFloat(editData.stock) || 0;

      const updateData = {
        discountReceived:         toNum(editData.discountReceived),
        expiryDate:               editData.expiryDate || '',
        racks:                    editData.racks      || '',
        stock:                    newStock,
        currentStock:             newStock,
        'stocks.Main_Store':      newStock,
        retailSellingPrice:       toNum(editData.retailSellingPrice),
        retailSellingDiscount:    toNum(editData.retailSellingDiscount),
        retailYourPrice:          toNum(editData.retailYourPrice),
        wholesaleSellingPrice:    toNum(editData.wholesaleSellingPrice),
        wholesaleSellingDiscount: toNum(editData.wholesaleSellingDiscount),
        wholesaleYourPrice:       toNum(editData.wholesaleYourPrice),
      };

      if (hasLoosePrice) {
        updateData.retailSellingPriceLoose    = toNum(editData.retailSellingPriceLoose);
        updateData.retailSellingLooseDiscount = toNum(editData.retailSellingLooseDiscount);
        updateData.retailYourLoosePrice       = toNum(editData.retailYourLoosePrice);
      }

      await updateDoc(itemRef, updateData);

      const oldStock = originalData?._stock || 0;
      const diff     = newStock - oldStock;

      if (diff !== 0) {
        await addDoc(collection(db, 'stockAdjustments'), {
          uid:      user.uid,
          itemId:   selectedItem,
          itemName: item?.name || 'Unknown',
          type:     diff > 0 ? 'add' : 'reduce',
          qty:      Math.abs(diff),
          reason:   'Direct Edit (Stock Adjusted)',
          date:     new Date().toISOString().split('T')[0],
          createdAt: serverTimestamp(),
        });
        setTimeout(() => loadHistory(), 500);
      }

      showToast('Item සාර්ථකව යාවත්කාලීන කරන ලදී!');
    } catch (e) {
      console.error(e);
      showToast('Error: ' + e.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  /* ── Sync ── */
  const handleSyncMissingHistory = async () => {
    const confirmed = await showConfirm(
      'මෙමගින් දැනට History නොමැති නමුත් Stock ඇති Items සඳහා History සටහන් සාදනු ඇත. ඉදිරියට යන්නද?'
    );
    if (!confirmed) return;

    setIsSyncing(true);
    try {
      const batch      = writeBatch(db);
      let   count      = 0;
      const existingIds = new Set(adjustments.map((a) => a.itemId));

      items.forEach((item) => {
        const actualStock = getActualStock(item);
        if (actualStock > 0 && !existingIds.has(item.id)) {
          const ref = doc(collection(db, 'stockAdjustments'));
          batch.set(ref, {
            uid:      user.uid,
            itemId:   item.id,
            itemName: item.name || 'Unknown',
            type:     'add',
            qty:      actualStock,
            reason:   'Bulk Import (System Synced)',
            date:     new Date().toISOString().split('T')[0],
            createdAt: serverTimestamp(),
          });
          count++;
        }
      });

      if (count > 0) {
        await batch.commit();
        showToast(`Items ${count} ක් සඳහා History සාදන ලදී.`);
        loadHistory();
      } else {
        showToast('යාවත්කාලීන කිරීමට Items නොමැත.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error: ' + err.message, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  /* ── Changed fields ── */
  const getChangedFields = () => {
    if (!editData || !originalData) return [];
    return Object.keys(editData).filter(
      (key) => String(editData[key]) !== String(originalData[key])
    );
  };
  const changedFields = getChangedFields();

  /* ─────────────────────────────
     STYLES
  ───────────────────────────── */
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
    transition: 'border 0.2s',
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

  /* ─────────────────────────────
     LOADING
  ───────────────────────────── */
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

  /* ─────────────────────────────
     RENDER
  ───────────────────────────── */
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Confirm Modal */}
      {confirm && (
        <ConfirmModal
          message={confirm.message}
          onConfirm={() => {
            confirm.resolve(true);
            setConfirm(null);
          }}
          onCancel={() => {
            confirm.resolve(false);
            setConfirm(null);
          }}
        />
      )}

      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 20,
        flexWrap: 'wrap', gap: 10,
      }}>
        <h2 style={{ color: '#1e293b', margin: 0 }}>
          📦 Stock & Price Adjustment
        </h2>
        <button
          onClick={handleSyncMissingHistory}
          disabled={isSyncing}
          style={{
            padding: '8px 16px', background: '#6366f1',
            color: 'white', border: 'none', borderRadius: 6,
            fontSize: 13, cursor: isSyncing ? 'not-allowed' : 'pointer',
          }}
        >
          {isSyncing ? '⏳ Syncing...' : '🔄 Sync Missing History'}
        </button>
      </div>

      {/* Search & Select */}
      <div style={cardStyle}>
        <div style={{ position: 'relative' }} ref={dropdownRef}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 5, fontSize: 15 }}>
            🔍 Search & Select Item
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
                  }
                }
              }}
              onFocus={() => setIsDropdownOpen(true)}
              placeholder="Item name, code or barcode type කරන්න..."
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
                ✕
              </button>
            )}
          </div>

          {/* Selected badge */}
          {selectedItem && (() => {
            const si = items.find((i) => i.id === selectedItem);
            return (
              <div style={{
                marginTop: 8, padding: '8px 14px',
                background: '#dcfce7', borderRadius: 8,
                fontSize: 13, color: '#166534',
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}>
                ✅ <strong>{si?.name}</strong>
                {si?.code && <span style={{ color: '#64748b' }}>| Code: {si.code}</span>}
                <span>| Stock: <strong>{getActualStock(si)}</strong></span>
              </div>
            );
          })()}

          {/* Dropdown */}
          {isDropdownOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0,
              zIndex: 1000, background: 'white',
              border: '1px solid #e2e8f0', borderRadius: 8,
              boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
              maxHeight: 280, overflowY: 'auto', marginTop: 4,
            }}>
              {filteredItems.length === 0 ? (
                <div style={{
                  padding: '20px 12px', textAlign: 'center',
                  color: '#94a3b8', fontSize: 14,
                }}>
                  🔍 "{searchText}" සඳහා ප්‍රතිඵල නොමැත
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
                      borderBottom: idx < filteredItems.length - 1
                        ? '1px solid #f1f5f9' : 'none',
                      background: selectedItem === item.id ? '#eff6ff' : 'white',
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = '#f8fafc')
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background =
                        selectedItem === item.id ? '#eff6ff' : 'white')
                    }
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
                      {item.code && (
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                          Code: {item.code}
                        </div>
                      )}
                    </div>
                    <span style={{
                      padding: '3px 10px', borderRadius: 12,
                      fontSize: 12, fontWeight: 'bold',
                      background: stk > 0 ? '#dcfce7' : '#fee2e2',
                      color:      stk > 0 ? '#166534' : '#991b1b',
                    }}>
                      Stock: {stk}
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
                  📋 {filteredItems.length} / {items.length} items
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Edit Form */}
      {editData && (
        <div style={cardStyle}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8,
          }}>
            <h3 style={{ margin: 0, color: '#1e293b' }}>
              ✏️ Edit: {items.find((i) => i.id === selectedItem)?.name}
            </h3>
            {changedFields.length > 0 && (
              <span style={{
                padding: '4px 12px', background: '#fef3c7',
                borderRadius: 20, fontSize: 12, fontWeight: 'bold',
                color: '#92400e',
              }}>
                ⚡ {changedFields.length} field(s) changed
              </span>
            )}
          </div>

          {/* Section 1 — General Info */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>📋 General Information</div>
            <div style={fieldRowStyle}>

              <div style={fieldStyle}>
                <label style={labelStyle}>Discount Received %</label>
                <input
                  type="number" step="0.01" min="0"
                  value={editData.discountReceived}
                  onChange={(e) => handleEditChange('discountReceived', e.target.value)}
                  style={getFieldInputStyle('discountReceived')}
                  placeholder="0"
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>📅 Expiry Date</label>
                <input
                  type="date"
                  value={editData.expiryDate}
                  onChange={(e) => handleEditChange('expiryDate', e.target.value)}
                  style={getFieldInputStyle('expiryDate')}
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>📍 Racks</label>
                <input
                  type="text"
                  value={editData.racks}
                  onChange={(e) => handleEditChange('racks', e.target.value)}
                  style={getFieldInputStyle('racks')}
                  placeholder="e.g. A1, B2"
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>📦 Quantity (Stock)</label>
                <input
                  type="number" min="0" step="1"
                  value={editData.stock}
                  onChange={(e) => handleEditChange('stock', e.target.value)}
                  style={{
                    ...getFieldInputStyle('stock'),
                    fontWeight: 'bold', fontSize: 16,
                    border: changedFields.includes('stock')
                      ? '2px solid #ef4444' : '2px solid #3b82f6',
                    background: changedFields.includes('stock')
                      ? '#fef2f2' : '#eff6ff',
                  }}
                  placeholder="0"
                />
                {changedFields.includes('stock') && (
                  <div style={{
                    marginTop: 4, fontSize: 12, fontWeight: 'bold',
                    color: (parseFloat(editData.stock) || 0) >= (originalData?._stock || 0)
                      ? '#16a34a' : '#dc2626',
                  }}>
                    {(() => {
                      const diff = (parseFloat(editData.stock) || 0) - (originalData?._stock || 0);
                      return diff > 0
                        ? `📈 +${diff} (Added)`
                        : `📉 ${diff} (Reduced)`;
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 2 — Retail Pricing */}
          <div style={{ ...sectionStyle, border: '1px solid #bfdbfe', background: '#f0f9ff' }}>
            <div style={sectionTitleStyle}>🏪 Retail Pricing</div>
            <div style={fieldRowStyle}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Selling Price (Rs.)</label>
                <input
                  type="number" step="0.01" min="0"
                  value={editData.retailSellingPrice}
                  onChange={(e) => handleEditChange('retailSellingPrice', e.target.value)}
                  style={getFieldInputStyle('retailSellingPrice')}
                  placeholder="0.00"
                />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Selling Discount %</label>
                <input
                  type="number" step="0.01" min="0" max="100"
                  value={editData.retailSellingDiscount}
                  onChange={(e) => handleEditChange('retailSellingDiscount', e.target.value)}
                  style={getFieldInputStyle('retailSellingDiscount')}
                  placeholder="0"
                />
              </div>
              <div style={fieldStyle}>
                <label style={{ ...labelStyle, color: '#166534' }}>Your Price ✨ Auto</label>
                <input
                  type="text" readOnly
                  value={editData.retailYourPrice ? `Rs. ${editData.retailYourPrice}` : ''}
                  style={autoInputStyle}
                />
              </div>
            </div>
          </div>

          {/* Section 3 — Wholesale Pricing */}
          <div style={{ ...sectionStyle, border: '1px solid #c4b5fd', background: '#f5f3ff' }}>
            <div style={sectionTitleStyle}>🏭 Wholesale Pricing</div>
            <div style={fieldRowStyle}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Selling Price (Rs.)</label>
                <input
                  type="number" step="0.01" min="0"
                  value={editData.wholesaleSellingPrice}
                  onChange={(e) => handleEditChange('wholesaleSellingPrice', e.target.value)}
                  style={getFieldInputStyle('wholesaleSellingPrice')}
                  placeholder="0.00"
                />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Selling Discount %</label>
                <input
                  type="number" step="0.01" min="0" max="100"
                  value={editData.wholesaleSellingDiscount}
                  onChange={(e) => handleEditChange('wholesaleSellingDiscount', e.target.value)}
                  style={getFieldInputStyle('wholesaleSellingDiscount')}
                  placeholder="0"
                />
              </div>
              <div style={fieldStyle}>
                <label style={{ ...labelStyle, color: '#166534' }}>Your Price ✨ Auto</label>
                <input
                  type="text" readOnly
                  value={editData.wholesaleYourPrice ? `Rs. ${editData.wholesaleYourPrice}` : ''}
                  style={autoInputStyle}
                />
              </div>
            </div>
          </div>

          {/* Section 4 — Loose Pricing */}
          {hasLoosePrice && (
            <div style={{ ...sectionStyle, border: '2px solid #fbbf24', background: '#fffbeb' }}>
              <div style={sectionTitleStyle}>
                📦 Loose Pricing
                <span style={{
                  padding: '2px 8px', background: '#fbbf24',
                  color: '#78350f', borderRadius: 12,
                  fontSize: 11, fontWeight: 'bold',
                }}>
                  LOOSE ITEM
                </span>
              </div>
              <div style={fieldRowStyle}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Selling Price Loose (Rs.)</label>
                  <input
                    type="number" step="0.01" min="0"
                    value={editData.retailSellingPriceLoose}
                    onChange={(e) => handleEditChange('retailSellingPriceLoose', e.target.value)}
                    style={getFieldInputStyle('retailSellingPriceLoose')}
                    placeholder="0.00"
                  />
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Loose Discount %</label>
                  <input
                    type="number" step="0.01" min="0" max="100"
                    value={editData.retailSellingLooseDiscount}
                    onChange={(e) => handleEditChange('retailSellingLooseDiscount', e.target.value)}
                    style={getFieldInputStyle('retailSellingLooseDiscount')}
                    placeholder="0"
                  />
                </div>
                <div style={fieldStyle}>
                  <label style={{ ...labelStyle, color: '#166634' }}>Your Loose Price ✨ Auto</label>
                  <input
                    type="text" readOnly
                    value={editData.retailYourLoosePrice ? `Rs. ${editData.retailYourLoosePrice}` : ''}
                    style={autoInputStyle}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            <button
              onClick={handleSaveEdit}
              disabled={isSaving || changedFields.length === 0}
              style={{
                flex: 1, padding: 14,
                background: isSaving
                  ? '#94a3b8'
                  : changedFields.length === 0
                    ? '#cbd5e1'
                    : '#22c55e',
                color: 'white', border: 'none', borderRadius: 10,
                fontWeight: 'bold', fontSize: 16,
                cursor: isSaving || changedFields.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {isSaving
                ? '⏳ Saving...'
                : changedFields.length === 0
                  ? '✅ No Changes'
                  : `💾 Save ${changedFields.length} Change(s)`}
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
              🔄 Reset
            </button>
          </div>
        </div>
      )}

      {/* Prompt */}
      {!editData && !selectedItem && (
        <div style={{
          ...cardStyle, textAlign: 'center', padding: 40,
          color: '#94a3b8', fontSize: 15,
        }}>
          ☝️ Edit කිරීමට ඉහත Search Box එකෙන් Item එකක් තෝරන්න
        </div>
      )}

      {/* History Table */}
      <h3 style={{ color: '#64748b', marginTop: 30 }}>
        🕒 Stock Adjustment History
      </h3>
      <div style={{
        background: 'white', borderRadius: 12,
        overflow: 'auto', boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
      }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse',
          fontSize: 14, minWidth: 500,
        }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
              {['Date', 'Item', 'Type', 'Qty', 'Reason'].map((h) => (
                <th key={h} style={{ padding: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {adjustments.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>
                  No adjustments yet
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
                    {adj.type === 'add' ? 'Added' : 'Reduced'}
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