'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db, auth } from '@/lib/firebase';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import localDb, { ensureDbOpen } from '@/lib/localDb';
import {
  doc,
  setDoc,
  writeBatch,
  increment,
  serverTimestamp,
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';

// ─── Safe DB Lookup Helpers ───
const getItemFromDb = async (itemId) => {
  if (!itemId) return null;
  try {
    await ensureDbOpen();
    let item = await localDb.items.get(itemId);
    if (!item && !isNaN(Number(itemId))) {
      item = await localDb.items.get(Number(itemId));
    }
    if (!item) {
      item = await localDb.items.where('docId').equals(String(itemId)).first();
    }
    if (!item) {
      item = await localDb.items.where('id').equals(String(itemId)).first();
    }
    return item;
  } catch (e) {
    console.warn('getItemFromDb warning:', e);
    return null;
  }
};

const getSupplierFromDb = async (supId) => {
  if (!supId) return null;
  try {
    await ensureDbOpen();
    let sup = await localDb.suppliers.get(supId);
    if (!sup && !isNaN(Number(supId))) {
      sup = await localDb.suppliers.get(Number(supId));
    }
    if (!sup) {
      sup = await localDb.suppliers.where('docId').equals(String(supId)).first();
    }
    if (!sup) {
      sup = await localDb.suppliers.where('id').equals(String(supId)).first();
    }
    return sup;
  } catch (e) {
    console.warn('getSupplierFromDb warning:', e);
    return null;
  }
};

// ─── Helper Functions ───
const toNum = (val) => {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
};

const formatCurrency = (val) => {
  return `LKR ${toNum(val).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const localISODate = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Accurate timestamp extractor for sorting
const getRecordTime = (inv) => {
  if (!inv) return 0;
  if (inv.createdAt) {
    if (typeof inv.createdAt === 'object' && inv.createdAt.seconds) {
      return inv.createdAt.seconds * 1000 + (inv.createdAt.nanoseconds || 0) / 1e6;
    }
    const parsed = new Date(inv.createdAt).getTime();
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  if (inv.updatedAt) {
    if (typeof inv.updatedAt === 'object' && inv.updatedAt.seconds) {
      return inv.updatedAt.seconds * 1000;
    }
    const parsed = new Date(inv.updatedAt).getTime();
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  if (inv.id) {
    const match = String(inv.id).match(/_(\d{10,14})_/);
    if (match && match[1]) return Number(match[1]);
  }
  if (inv.date) {
    const parsed = new Date(inv.date).getTime();
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 0;
};

const getExpiryStatus = (expiryDate) => {
  if (!expiryDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDate);
  exp.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { status: 'expired', label: '🔴 කල් ඉකුත් වී ඇත', bg: '#fef2f2', color: '#991b1b', border: '#fca5a5' };
  if (diffDays <= 30) return { status: 'soon', label: `🟠 තව දින ${diffDays}යි`, bg: '#fff7ed', color: '#9a3412', border: '#fdba74' };
  if (diffDays <= 90) return { status: 'warning', label: `🟡 තව දින ${diffDays}යි`, bg: '#fefce8', color: '#854d0e', border: '#fde047' };
  return { status: 'ok', label: `🟢 තව දින ${diffDays}යි`, bg: '#f0fdf4', color: '#166534', border: '#86efac' };
};

const getInvStatus = (inv) => {
  const bal = toNum(inv.balanceAmount ?? inv.currentBalance ?? 0);
  const paid = toNum(inv.paidAmount ?? 0);
  if (bal <= 0) return 'paid';
  if (paid > 0) return 'partial';
  return 'credit';
};

const PAYMENT_METHODS = [
  { v: 'cash', l: '💵 මුදල් (Cash)', c: '#16a34a' },
  { v: 'bank', l: '🏦 බැංකු (Bank)', c: '#2563eb' },
  { v: 'cheque', l: '📜 චෙක් (Cheque)', c: '#d97706' },
  { v: 'card', l: '💳 කාඩ් (Card)', c: '#7c3aed' },
];

// ─── Inline Styles ───
const S = {
  box: { padding: 20, maxWidth: 1200, margin: '0 auto', fontFamily: 'sans-serif' },
  card: { background: '#ffffff', borderRadius: 12, padding: 20, marginBottom: 20, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)', border: '1px solid #e2e8f0' },
  lbl: { display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 },
  inp: { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', boxSizing: 'border-box' },
  btn: { padding: '10px 18px', borderRadius: 8, border: 'none', fontWeight: 700, cursor: 'pointer', color: '#ffffff', transition: 'all 0.2s', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
  tab: (active) => ({ padding: '12px 24px', borderRadius: '10px 10px 0 0', border: 'none', fontWeight: 700, cursor: 'pointer', background: active ? '#ffffff' : '#f1f5f9', color: active ? '#2563eb' : '#64748b', borderBottom: active ? '3px solid #2563eb' : 'none' }),
};

// ─── Child Components ───
const ExpiryBadge = ({ expiryDate, size = 'normal' }) => {
  const info = getExpiryStatus(expiryDate);
  if (!info) return null;
  return (
    <span style={{ padding: size === 'small' ? '2px 6px' : '4px 8px', borderRadius: 6, fontSize: size === 'small' ? 10 : 12, fontWeight: 700, background: info.bg, color: info.color, border: `1px solid ${info.border}`, whiteSpace: 'nowrap' }}>
      {info.label}
    </span>
  );
};

const PriceBox = ({ title, icon, bgColor, borderColor, textColor, accentBg, price, disc, yourPrice, onPriceChange, onDiscChange, onYourPriceChange, priceLabel = 'Price', yourPriceLabel = 'Your Price' }) => (
  <div style={{ background: bgColor, border: `2px solid ${borderColor}`, borderRadius: 12, padding: 14 }}>
    <div style={{ fontWeight: 'bold', color: textColor, marginBottom: 10, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
      <span>{icon}</span> {title}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: textColor, marginBottom: 4 }}>{priceLabel}</label>
        <input type="number" value={price} onChange={(e) => onPriceChange(e.target.value)} onFocus={(e) => e.target.select()} style={{ ...S.inp, borderColor, background: '#ffffff', textAlign: 'center', fontWeight: 'bold', color: textColor }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: textColor, marginBottom: 4 }}>Disc %</label>
        <input type="number" value={disc} onChange={(e) => onDiscChange(e.target.value)} onFocus={(e) => e.target.select()} style={{ ...S.inp, borderColor, background: accentBg, textAlign: 'center', fontWeight: 'bold', color: textColor }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: textColor, marginBottom: 4 }}>{yourPriceLabel}</label>
        <input type="number" value={yourPrice} onChange={(e) => onYourPriceChange(e.target.value)} onFocus={(e) => e.target.select()} style={{ ...S.inp, borderColor, background: '#ffffff', textAlign: 'center', fontWeight: 'bold', color: textColor }} />
      </div>
    </div>
  </div>
);

const SupplierSearchableSelect = ({ options, value, onChange, onSupplierCreated, placeholder, user }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSupName, setNewSupName] = useState('');
  const [newSupPhone, setNewSupPhone] = useState('');
  const [isSavingSup, setIsSavingSup] = useState(false);

  const selectedSup = options.find((o) => o.id === value || o.docId === value);
  const filtered = options.filter((o) => (o.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || (o.phone || '').includes(searchTerm));

  const handleCreateSupplier = async () => {
    if (!newSupName.trim()) {
      alert('කරුණාකර සැපයුම්කරුගේ නම ඇතුළත් කරන්න!');
      return;
    }
    setIsSavingSup(true);
    try {
      await ensureDbOpen();
      const supId = `sup_${Date.now()}`;
      const nowIso = new Date().toISOString();
      const currentUid = user?.uid || 'pos_local_user';

      const newSup = {
        id: supId,
        docId: supId,
        uid: currentUid,
        userId: currentUid,
        name: newSupName.trim(),
        phone: newSupPhone.trim(),
        currentBalance: 0,
        balance: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: user?.email || currentUid,
        synced: false,
      };

      await localDb.suppliers.put(newSup);

      if (navigator.onLine) {
        try {
          await setDoc(doc(db, 'suppliers', supId), {
            ...newSup,
            synced: true,
            serverCreatedAt: serverTimestamp(),
          });
          await localDb.suppliers.update(supId, { synced: true });
        } catch (e) {
          console.warn('Firestore supplier save warning:', e);
        }
      }

      onSupplierCreated(newSup);
      setShowAddModal(false);
      setNewSupName('');
      setNewSupPhone('');
    } catch (err) {
      alert('දෝෂයක් සිදු විය: ' + err.message);
    } finally {
      setIsSavingSup(false);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={isOpen ? searchTerm : selectedSup ? selectedSup.name : ''}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          style={{ ...S.inp, textAlign: 'left' }}
        />
        <button type="button" onClick={() => setShowAddModal(true)} style={{ ...S.btn, background: '#16a34a', padding: '8px 14px' }}>
          ➕ නව
        </button>
      </div>

      {isOpen && (
        <div style={{ position: 'absolute', zIndex: 50, background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, width: '100%', maxHeight: 200, overflowY: 'auto', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
          {filtered.map((s) => (
            <div
              key={s.id || s.docId}
              onClick={() => {
                onChange(s.id || s.docId);
                setIsOpen(false);
                setSearchTerm('');
              }}
              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: (s.id === value || s.docId === value) ? '#eff6ff' : '#ffffff' }}
            >
              <b>{s.name}</b> {s.phone && <span style={{ fontSize: 12, color: '#64748b' }}>({s.phone})</span>}
            </div>
          ))}
          {!filtered.length && <div style={{ padding: 12, color: '#94a3b8', textAlign: 'center' }}>සැපයුම්කරුවන් නොමැත</div>}
        </div>
      )}

      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 360 }}>
            <h3 style={{ margin: '0 0 15px' }}>➕ නව සැපයුම්කරු එකතු කිරීම</h3>
            <label style={S.lbl}>නම *</label>
            <input value={newSupName} onChange={(e) => setNewSupName(e.target.value)} style={{ ...S.inp, marginBottom: 12 }} placeholder="Supplier Name" />
            <label style={S.lbl}>දුරකථන අංකය</label>
            <input value={newSupPhone} onChange={(e) => setNewSupPhone(e.target.value)} style={{ ...S.inp, marginBottom: 20 }} placeholder="07X XXX XXXX" />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowAddModal(false)} style={{ ...S.btn, background: '#94a3b8' }}>අවලංගුයි</button>
              <button type="button" onClick={handleCreateSupplier} disabled={isSavingSup} style={{ ...S.btn, background: '#16a34a' }}>
                {isSavingSup ? 'එකතු වෙමින්...' : 'එකතු කරන්න'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SearchableSelect = ({ options, value, onChange, placeholder }) => {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value || o.docId === value);
  const filtered = options.filter((o) => (o.name || o.itemName || '').toLowerCase().includes(term.toLowerCase()) || (o.barcode || '').includes(term) || (o.itemCode || '').includes(term));

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={open ? term : selected ? `${selected.name || selected.itemName} (Stock: ${selected.stock || selected.currentStock || 0})` : ''}
        onChange={(e) => {
          setTerm(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        style={{ ...S.inp, textAlign: 'left', fontSize: 16, padding: 14 }}
      />
      {open && (
        <div style={{ position: 'absolute', zIndex: 50, background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, width: '100%', maxHeight: 250, overflowY: 'auto', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
          {filtered.map((item) => (
            <div
              key={item.id || item.docId}
              onClick={() => {
                onChange(item.id || item.docId);
                setOpen(false);
                setTerm('');
              }}
              style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}
            >
              <div>
                <b>{item.name || item.itemName}</b>
                <div style={{ fontSize: 12, color: '#64748b' }}>Code: {item.itemCode || 'N/A'} | Barcode: {item.barcode || 'N/A'}</div>
              </div>
              <div style={{ textAlign: 'right', fontWeight: 'bold', color: '#2563eb' }}>
                Stock: {item.stock || item.currentStock || 0}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ReceiptUploader = ({ receipts, setReceipts, disabled }) => {
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setReceipts((prev) => [...prev, reader.result]);
      };
      reader.readAsDataURL(file);
    });
  };

  return (
    <div>
      <input type="file" accept="image/*" multiple onChange={handleFileChange} disabled={disabled} style={{ marginBottom: 10 }} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {receipts.map((src, i) => (
          <div key={i} style={{ position: 'relative' }}>
            <img src={src} alt="receipt" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #cbd5e1' }} />
            <button type="button" onClick={() => setReceipts((p) => p.filter((_, idx) => idx !== i))} style={{ position: 'absolute', top: -5, right: -5, background: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer' }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
};

const BankAccountSelector = ({ value, onChange, bankAccounts, loading, disabled, showDeductInfo, deductAmount }) => (
  <div>
    <label style={S.lbl}>🏦 බැංකු ගිණුම තෝරන්න *</label>
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled || loading} style={{ ...S.inp, textAlign: 'left' }}>
      <option value="">-- ගිණුමක් තෝරන්න --</option>
      {bankAccounts.map((b) => (
        <option key={b.id || b.docId} value={b.id || b.docId}>
          {b.accountName || b.bankName} - {b.accountNumber} (ශේෂය: {formatCurrency(b.balance || b.currentBalance || 0)})
        </option>
      ))}
    </select>
    {showDeductInfo && deductAmount > 0 && (
      <div style={{ fontSize: 12, color: '#2563eb', marginTop: 4 }}>
        💡 ගෙවීම් මුදල ({formatCurrency(deductAmount)}) මෙම ගිණුමෙන් අඩු කරනු ලැබේ.
      </div>
    )}
  </div>
);

const TabWarningModal = ({ isOpen, cartCount, onConfirm, onCancel }) => {
  if (!isOpen) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ ...S.card, width: 400, textAlign: 'center' }}>
        <h3 style={{ color: '#dc2626' }}>⚠️ අවධානය යොමු කරන්න</h3>
        <p>Cart හි භාණ්ඩ {cartCount}ක් ඇත. වෙනත් පිටුවකට යාමෙන් මෙම දත්ත ඉවත් විය හැක. ඔබට ඉදිරියට යාමට අවශ්‍යද?</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
          <button onClick={onCancel} style={{ ...S.btn, background: '#94a3b8' }}>නැත</button>
          <button onClick={onConfirm} style={{ ...S.btn, background: '#dc2626' }}>ඔව්, ඉදිරියට යන්න</button>
        </div>
      </div>
    </div>
  );
};

const ScannerModal = ({ isOpen, onClose, onScan }) => {
  if (!isOpen) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ ...S.card, width: 320, textAlign: 'center' }}>
        <h3>📷 Barcode Scanner</h3>
        <p style={{ fontSize: 13, color: '#64748b' }}>Barcode එක Scan කරන්න හෝ පහත ඇතුළත් කරන්න.</p>
        <input autoFocus onKeyDown={(e) => { if (e.key === 'Enter') { onScan(e.target.value); onClose(); } }} style={{ ...S.inp, marginBottom: 15 }} placeholder="Scan or Type Barcode..." />
        <button onClick={onClose} style={{ ...S.btn, background: '#94a3b8', width: '100%' }}>වසා දමන්න</button>
      </div>
    </div>
  );
};

// ─── INVOICE DETAILS MODAL (VIEW ALL DETAILS + PRINT) ───
const InvoiceDetailsModal = ({ isOpen, onClose, invoice }) => {
  if (!isOpen || !invoice) return null;

  const bal = toNum(invoice.balanceAmount ?? invoice.currentBalance ?? 0);
  const paid = toNum(invoice.paidAmount ?? 0);
  const total = toNum(invoice.totalAmount ?? 0);
  const status = getInvStatus(invoice);

  const statusLabel =
    status === 'paid'
      ? { text: 'සම්පූර්ණයෙන්ම ගෙවා ඇත (PAID)', bg: '#dcfce7', color: '#15803d' }
      : status === 'partial'
      ? { text: 'කොටසක් ගෙවා ඇත (PARTIAL)', bg: '#fef3c7', color: '#b45309' }
      : { text: 'ණයට ලබාගෙන ඇත (CREDIT)', bg: '#fee2e2', color: '#b91c1c' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 15 }}>
      <div style={{ background: '#ffffff', borderRadius: 16, width: '100%', maxWidth: 880, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden' }}>
        
        {/* Modal Header */}
        <div style={{ padding: '18px 24px', background: '#0f172a', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span>📑 මිලදී ගැනීමේ ඉන්වොයිස් විස්තර</span>
              <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, background: statusLabel.bg, color: statusLabel.color, fontWeight: 800 }}>
                {statusLabel.text}
              </span>
            </h3>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>ID: {invoice.id}</div>
          </div>
          <button onClick={onClose} style={{ background: '#334155', border: 'none', color: '#ffffff', borderRadius: '50%', width: 34, height: 34, cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
          {/* Key Meta Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>සැපයුම්කරු (SUPPLIER)</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>{invoice.supplierName || 'නොදනී'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>දිනය (DATE)</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{invoice.date || 'N/A'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>REF NO / බිල් අංකය</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{invoice.refNo || 'නැත'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>ගෙවීම් ක්‍රමය (METHOD)</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#2563eb', textTransform: 'capitalize' }}>
                {invoice.paymentMethod || 'cash'}
              </div>
            </div>
            {invoice.notes && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>විශේෂ සටහන් (NOTES)</div>
                <div style={{ fontSize: 13, color: '#334155', marginTop: 2 }}>{invoice.notes}</div>
              </div>
            )}
          </div>

          {/* Items Table */}
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ margin: '0 0 10px', fontSize: 15, color: '#1e293b' }}>📦 මිලදී ගත් භාණ්ඩ ලැයිස්තුව ({invoice.items?.length || 0})</h4>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead style={{ background: '#f1f5f9', color: '#475569', fontWeight: 700 }}>
                  <tr>
                    <th style={{ padding: '10px 12px' }}>#</th>
                    <th style={{ padding: '10px 12px' }}>භාණ්ඩය</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>කල් ඉකුත්වීම / Batch</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>ප්‍රමාණය (Qty)</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>මිලදී ගත් මිල</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>විකුණුම් මිල</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>එකතුව</th>
                  </tr>
                </thead>
                <tbody>
                  {(invoice.items || []).map((it, idx) => (
                    <tr key={idx} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 12px', color: '#64748b' }}>{idx + 1}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 700, color: '#1e293b' }}>{it.name || it.itemName}</div>
                        {(it.barcode || it.itemCode) && (
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            Code: {it.itemCode || it.barcode}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        {it.expiryDate ? <ExpiryBadge expiryDate={it.expiryDate} size="small" /> : <span style={{ color: '#94a3b8' }}>-</span>}
                        {it.batchNo && <div style={{ fontSize: 10, color: '#7c3aed', marginTop: 2 }}>🏷️ {it.batchNo}</div>}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: '#2563eb' }}>
                        {it.qty}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                        {formatCurrency(it.buyingNetPrice || it.buyingPrice)}
                        {toNum(it.discountPercent) > 0 && <span style={{ fontSize: 10, color: '#d97706' }}> (-{it.discountPercent}%)</span>}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#059669', fontWeight: 600 }}>
                        {formatCurrency(it.retailYourPrice || it.retailPrice || 0)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#1e293b' }}>
                        {formatCurrency(it.totalCost || (toNum(it.qty) * toNum(it.buyingNetPrice || it.buyingPrice)))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Receipts section if present */}
          {invoice.receiptImages && invoice.receiptImages.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 14, color: '#1e293b' }}>🧾 රිසිට්පත් / ලේඛන</h4>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {invoice.receiptImages.map((src, i) => (
                  <a key={i} href={src} target="_blank" rel="noopener noreferrer">
                    <img src={src} alt="receipt" style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid #cbd5e1' }} />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Financial Totals Summary */}
          <div style={{ background: '#f8fafc', padding: 18, borderRadius: 12, border: '2px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 14, color: '#64748b', fontWeight: 600 }}>මුළු බිල්පත් එකතුව (Total Amount):</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>{formatCurrency(total)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 14, color: '#16a34a', fontWeight: 600 }}>ගෙවූ මුදල (Paid Amount):</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#16a34a' }}>{formatCurrency(paid)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px dashed #cbd5e1', paddingTop: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: bal > 0 ? '#dc2626' : '#16a34a' }}>හිඟ ශේෂය (Balance Due):</span>
              <span style={{ fontSize: 22, fontWeight: 900, color: bal > 0 ? '#dc2626' : '#16a34a' }}>{formatCurrency(bal)}</span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div style={{ padding: '14px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => window.print()}
            style={{ ...S.btn, background: '#475569' }}
          >
            🖨️ Print
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{ ...S.btn, background: '#2563eb' }}
          >
            හරි (Close)
          </button>
        </div>

      </div>
    </div>
  );
};

const PaymentModal = ({ isOpen, onClose, invoice, onPaymentSaved, collectionName, bankAccounts, bankLoading, user }) => {
  const [payAmount, setPayAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [bankId, setBankId] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isOpen || !invoice) return null;
  const currentBal = toNum(invoice.balanceAmount ?? invoice.currentBalance ?? 0);

  const handleSavePayment = async () => {
    const amt = toNum(payAmount);
    if (amt <= 0 || amt > currentBal) {
      alert('කරුණාකර නිවැරදි මුදලක් ඇතුළත් කරන්න!');
      return;
    }
    if (method === 'bank' && !bankId) {
      alert('කරුණාකර බැංකු ගිණුමක් තෝරන්න!');
      return;
    }

    setSaving(true);
    try {
      await ensureDbOpen();
      const nowIso = new Date().toISOString();
      const newPaid = toNum(invoice.paidAmount || 0) + amt;
      const newBal = Math.max(0, Math.round((currentBal - amt) * 100) / 100);

      // Local Dexie Update
      if (localDb[collectionName]) {
        await localDb[collectionName].update(invoice.id, {
          paidAmount: newPaid,
          balanceAmount: newBal,
          currentBalance: newBal,
          synced: false,
          updatedAt: nowIso,
        });
      }

      if (invoice.supplierId) {
        const sup = await getSupplierFromDb(invoice.supplierId);
        if (sup) {
          const supBal = Math.max(0, Math.round((toNum(sup.currentBalance ?? sup.balance ?? 0) - amt) * 100) / 100);
          await localDb.suppliers.update(sup.id, {
            currentBalance: supBal,
            balance: supBal,
            synced: false,
            updatedAt: nowIso,
          });
        }
      }

      if (method === 'bank' && bankId) {
        const bank = await localDb.bankAccounts.get(bankId);
        if (bank) {
          const bankBal = toNum(bank.balance ?? bank.currentBalance ?? 0) - amt;
          await localDb.bankAccounts.update(bank.id, {
            balance: bankBal,
            currentBalance: bankBal,
            synced: false,
            updatedAt: nowIso,
          });
        }
      }

      // Record transaction locally if table exists
      try {
        if (localDb.supplierTransactions) {
          const txId = `stx_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
          await localDb.supplierTransactions.put({
            id: txId,
            docId: txId,
            uid: invoice.uid || user?.uid || 'pos_local_user',
            supplierId: invoice.supplierId,
            supplierName: invoice.supplierName,
            invoiceId: invoice.id,
            refNo: invoice.refNo || '',
            amount: amt,
            type: 'payment',
            method: method,
            bankAccountId: bankId || '',
            date: localISODate(),
            createdAt: nowIso,
            synced: false,
          });
        }
      } catch (txErr) {
        console.warn('supplierTransactions save warning:', txErr);
      }

      // Firestore Cloud Update
      if (navigator.onLine) {
        const batch = writeBatch(db);
        const invRef = doc(db, collectionName, String(invoice.id));
        batch.update(invRef, {
          paidAmount: increment(amt),
          balanceAmount: increment(-amt),
          currentBalance: increment(-amt),
          syncedAt: serverTimestamp(),
        });

        if (invoice.supplierId) {
          batch.update(doc(db, 'suppliers', String(invoice.supplierId)), {
            currentBalance: increment(-amt),
            balance: increment(-amt),
            syncedAt: serverTimestamp(),
          });
        }

        if (method === 'bank' && bankId) {
          batch.update(doc(db, 'bankAccounts', String(bankId)), {
            balance: increment(-amt),
            currentBalance: increment(-amt),
            syncedAt: serverTimestamp(),
          });
        }

        await batch.commit();

        if (localDb[collectionName]) {
          await localDb[collectionName].update(invoice.id, { synced: true });
        }
      }

      onPaymentSaved();
      onClose();
      alert('✅ ගෙවීම සාර්ථකව සුරැකිණි!');
    } catch (e) {
      alert('දෝෂයක් සිදු විය: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ ...S.card, width: 400 }}>
        <h3>💳 ගෙවීම් ලබාගැනීම</h3>
        <p style={{ fontSize: 13, color: '#64748b' }}>ඉන්වොයිස් අංකය: <b>{invoice.refNo || invoice.id}</b></p>
        <p style={{ fontSize: 14, fontWeight: 'bold', color: '#dc2626' }}>ගෙවිය යුතු හිඟ මුදල: {formatCurrency(currentBal)}</p>
        <label style={S.lbl}>ගෙවන මුදල *</label>
        <input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} style={{ ...S.inp, marginBottom: 12, fontSize: 18, fontWeight: 'bold' }} />
        <label style={S.lbl}>ගෙවීම් ක්‍රමය</label>
        <select value={method} onChange={(e) => setMethod(e.target.value)} style={{ ...S.inp, marginBottom: 12 }}>
          {PAYMENT_METHODS.map((m) => (
            <option key={m.v} value={m.v}>{m.l}</option>
          ))}
        </select>
        {method === 'bank' && (
          <div style={{ marginBottom: 15 }}>
            <BankAccountSelector value={bankId} onChange={setBankId} bankAccounts={bankAccounts} loading={bankLoading} />
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 15 }}>
          <button onClick={onClose} style={{ ...S.btn, background: '#94a3b8' }}>අවලංගුයි</button>
          <button onClick={handleSavePayment} disabled={saving} style={{ ...S.btn, background: '#16a34a' }}>
            {saving ? 'සුරැකෙමින්...' : 'ගෙවීම සටහන් කරන්න'}
          </button>
        </div>
      </div>
    </div>
  );
};

const InvoiceCard = ({ inv, collectionName, S, onPayClick, onViewDetails, onUpdate, onDeleteInvoice }) => {
  const isPaid = getInvStatus(inv) === 'paid';
  const bal = toNum(inv.balanceAmount ?? inv.currentBalance ?? 0);

  const handleDelete = async () => {
    if (!confirm('ඔබට මෙම ඉන්වොයිසිය මකා දැමීමට අවශ්‍යද?')) return;
    try {
      await ensureDbOpen();
      if (localDb[collectionName]) {
        await localDb[collectionName].delete(inv.id);
      }
      if (navigator.onLine) {
        const batch = writeBatch(db);
        batch.delete(doc(db, collectionName, String(inv.id)));
        await batch.commit();
      }
      if (onDeleteInvoice) onDeleteInvoice(inv.supplierId, bal);
      onUpdate();
    } catch (e) {
      alert('Error deleting: ' + e.message);
    }
  };

  return (
    <div style={{ ...S.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, transition: 'transform 0.15s ease' }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 'bold', color: '#0f172a' }}>
          {inv.supplierName || 'නොදනී'} <span style={{ fontSize: 12, color: '#64748b' }}>({inv.refNo || inv.id})</span>
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
          📅 දිනය: <b>{inv.date}</b> | 📦 අයිතම: <b>{inv.items?.length || 0}</b>
        </div>
        <div style={{ fontSize: 13, marginTop: 6 }}>
          එකතුව: <b>{formatCurrency(inv.totalAmount)}</b> | ගෙවූ: <span style={{ color: '#16a34a' }}>{formatCurrency(inv.paidAmount)}</span> | ශේෂය: <span style={{ color: bal > 0 ? '#dc2626' : '#16a34a', fontWeight: 'bold' }}>{formatCurrency(bal)}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {/* OPEN / VIEW DETAILS BUTTON */}
        <button
          type="button"
          onClick={() => onViewDetails(inv)}
          style={{ ...S.btn, background: '#0284c7', padding: '8px 14px', fontSize: 12 }}
          title="සියලු විස්තර බලන්න"
        >
          👁️ විස්තර (Open)
        </button>

        {!isPaid && (
          <button onClick={() => onPayClick(inv)} style={{ ...S.btn, background: '#2563eb', padding: '8px 14px', fontSize: 12 }}>
            💳 ගෙවීම් කරන්න
          </button>
        )}
        <button onClick={handleDelete} style={{ ...S.btn, background: '#ef4444', padding: '8px 12px', fontSize: 12 }}>
          🗑️
        </button>
      </div>
    </div>
  );
};

const SupplierOutstandingCard = ({ group, onPayInvoice }) => (
  <div style={{ ...S.card, borderLeft: '4px solid #ef4444' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
      <h4 style={{ margin: 0, fontSize: 16 }}>🏢 {group.supplierName}</h4>
      <span style={{ fontSize: 16, fontWeight: '900', color: '#dc2626' }}>{formatCurrency(group.totalDebt)}</span>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {group.invoices.map((inv) => (
        <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', background: '#f8fafc', padding: 8, borderRadius: 6, fontSize: 13 }}>
          <span>Ref: {inv.refNo || inv.id} ({inv.date})</span>
          <span>ශේෂය: <b style={{ color: '#dc2626' }}>{formatCurrency(inv.balanceAmount ?? inv.currentBalance)}</b></span>
          <button onClick={() => onPayInvoice(inv)} style={{ ...S.btn, background: '#2563eb', padding: '4px 8px', fontSize: 11 }}>ගෙවන්න</button>
        </div>
      ))}
    </div>
  </div>
);

// ════════════════════════════════════════════════════════════════════════
// ─── MAIN COMPONENT: PurchaseCommonForm ───
// ════════════════════════════════════════════════════════════════════════
export default function PurchaseCommonForm({ title, type, storageKey }) {
  // ─── Auth State Listener (Safe Native Firebase Auth) ───
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let unsubscribe = () => {};
    try {
      const activeAuth = auth || getAuth();
      if (activeAuth) {
        unsubscribe = onAuthStateChanged(activeAuth, (u) => {
          if (u) {
            setUser(u);
          } else {
            setUser({ uid: 'pos_local_user', email: 'admin@pos.local' });
          }
          setAuthLoading(false);
        });
      } else {
        setUser({ uid: 'pos_local_user', email: 'admin@pos.local' });
        setAuthLoading(false);
      }
    } catch (err) {
      setUser({ uid: 'pos_local_user', email: 'admin@pos.local' });
      setAuthLoading(false);
    }
    return () => unsubscribe();
  }, []);

  // ─── States ───
  const [activeTab, setActiveTab] = useState('new');
  const [tabWarning, setTabWarning] = useState(false);
  const [pendingTab, setPendingTab] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [items, setItems] = useState([]);
  const [history, setHistory] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [bankLoading, setBankLoading] = useState(false);

  const [formData, setFormData] = useState({
    supplierId: '',
    supplierName: '',
    refNo: '',
    date: localISODate(),
    notes: '',
  });

  const [lineItem, setLineItem] = useState({
    itemId: '',
    name: '',
    qty: 1,
    barcode: '',
    warranty: '',
    expiryDate: '',
    batchNo: '',
    buyingPrice: '',
    buyingNetPrice: '',
    discountPercent: 0,
    retailPrice: '',
    retailDiscount: 0,
    retailYourPrice: '',
    wholesalePrice: '',
    wholesaleDiscount: 0,
    wholesaleYourPrice: '',
    loosePrice: '',
    looseDiscount: 0,
    looseYourPrice: '',
  });

  const [cart, setCart] = useState([]);
  const [receiptImages, setReceiptImages] = useState([]);
  const [paymentData, setPaymentData] = useState({
    payNow: 0,
    paymentMethod: 'cash',
    bankAccountId: '',
  });

  const [showScanner, setShowScanner] = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // New Details Modal State
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState(null);

  const [isSaving, setIsSaving] = useState(false);
  const [saveStep, setSaveStep] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');
  const [historyFilter, setHistoryFilter] = useState('all');

  // ─── Sync Data from Local DB (Strict UID Scoping & Foreign User Purge) ───
  const syncLocalUiStates = useCallback(async () => {
    try {
      await ensureDbOpen();
      const currentUid = user?.uid || 'pos_local_user';
      const currentUserEmail = user?.email || '';

      // 1. Purge foreign users' records from local Dexie
      if (currentUid && currentUid !== 'pos_local_user') {
        try {
          if (localDb[storageKey]) {
            await localDb[storageKey].filter((r) => r.uid && r.uid !== currentUid).delete();
          }
          if (localDb.purchases && storageKey !== 'purchases') {
            await localDb.purchases.filter((r) => r.uid && r.uid !== currentUid).delete();
          }
          if (localDb.purchaseInvoices && storageKey !== 'purchaseInvoices') {
            await localDb.purchaseInvoices.filter((r) => r.uid && r.uid !== currentUid).delete();
          }
        } catch (purgeErr) {
          console.warn('Purge foreign records warning:', purgeErr);
        }
      }

      // 2. Fetch User's Invoices from Firestore if Online
      if (typeof window !== 'undefined' && navigator.onLine && currentUid && currentUid !== 'pos_local_user') {
        try {
          const q = query(collection(db, storageKey), where('uid', '==', currentUid));
          const snap = await getDocs(q);
          if (!snap.empty && localDb[storageKey]) {
            const remoteDocs = snap.docs.map((d) => ({
              ...d.data(),
              id: d.id,
              docId: d.id,
              synced: true,
            }));
            await localDb[storageKey].bulkPut(remoteDocs);
          }
        } catch (fsSyncErr) {
          console.warn('Firestore fetch purchases warning:', fsSyncErr);
        }
      }

      // 3. Load Suppliers (Filtered by UID)
      if (localDb.suppliers) {
        const allSups = await localDb.suppliers.toArray();
        const userSups = allSups.filter((s) => {
          if (!s.uid || s.uid === 'pos_local_user') return true;
          return s.uid === currentUid;
        });
        setSuppliers(userSups);
      }

      // 4. Load Items
      if (localDb.items) {
        const itms = await localDb.items.toArray();
        setItems(itms);
      }

      // 5. Load History (Strict User UID Isolation)
      if (localDb[storageKey]) {
        const allHist = await localDb[storageKey].toArray();
        const userHist = allHist.filter((item) => {
          if (item.uid === currentUid) return true;
          if (item.userId === currentUid) return true;
          if (currentUid === 'pos_local_user' && (!item.uid || item.uid === 'pos_local_user')) return true;
          if (!item.uid && currentUserEmail && item.createdBy === currentUserEmail) return true;
          return false;
        });
        setHistory(userHist);
      }

      // 6. Load Bank Accounts
      setBankLoading(true);
      if (localDb.bankAccounts) {
        const allBanks = await localDb.bankAccounts.toArray();
        const userBanks = allBanks.filter((b) => {
          if (!b.uid || b.uid === 'pos_local_user') return true;
          return b.uid === currentUid;
        });
        setBankAccounts(userBanks);
      }
      setBankLoading(false);
    } catch (e) {
      console.error('Local UI sync error:', e);
      setBankLoading(false);
    }
  }, [storageKey, user]);

  useEffect(() => {
    syncLocalUiStates();
  }, [syncLocalUiStates]);

  // ─── Tab Switch Warning ───
  const handleTabChange = (targetTab) => {
    if (cart.length > 0 && activeTab === 'new' && targetTab !== 'new') {
      setPendingTab(targetTab);
      setTabWarning(true);
    } else {
      setActiveTab(targetTab);
    }
  };

  const confirmTabChange = () => {
    setCart([]);
    setActiveTab(pendingTab);
    setTabWarning(false);
    setPendingTab(null);
  };

  // ─── Item Selection Handlers ───
  const handleItemSelect = (id) => {
    const found = items.find((i) => i.id === id || i.docId === id);
    if (!found) return;
    const itemIdVal = found.id || found.docId;
    setLineItem({
      itemId: itemIdVal,
      name: found.name || found.itemName || '',
      qty: 1,
      barcode: found.barcode || '',
      warranty: found.warranty || '',
      expiryDate: found.expiryDate || '',
      batchNo: found.batchNo || '',
      buyingPrice: found.buyingPrice || '',
      buyingNetPrice: found.buyingNetPrice || found.buyingPrice || '',
      discountPercent: found.discountPercent || 0,
      retailPrice: found.sellingPriceRetail || found.retailPrice || '',
      retailDiscount: found.retailDiscount || 0,
      retailYourPrice: found.retailYourPrice || found.sellingPriceRetail || '',
      wholesalePrice: found.wholesalePrice || '',
      wholesaleDiscount: found.wholesaleDiscount || 0,
      wholesaleYourPrice: found.wholesaleYourPrice || found.wholesalePrice || '',
      loosePrice: found.loosePrice || '',
      looseDiscount: found.looseDiscount || 0,
      looseYourPrice: found.looseYourPrice || found.loosePrice || '',
    });
  };

  const hPrice = (fieldGroup, type, value) => {
    setLineItem((prev) => {
      const updated = { ...prev };
      const val = toNum(value);
      if (fieldGroup === 'buying') {
        if (type === 'price') {
          updated.buyingPrice = value;
          updated.buyingNetPrice = (val * (1 - toNum(updated.discountPercent) / 100)).toFixed(2);
        } else if (type === 'disc') {
          updated.discountPercent = value;
          updated.buyingNetPrice = (toNum(updated.buyingPrice) * (1 - val / 100)).toFixed(2);
        } else if (type === 'yourPrice') {
          updated.buyingNetPrice = value;
        }
      } else if (fieldGroup === 'retail') {
        if (type === 'price') {
          updated.retailPrice = value;
          updated.retailYourPrice = (val * (1 - toNum(updated.retailDiscount) / 100)).toFixed(2);
        } else if (type === 'disc') {
          updated.retailDiscount = value;
          updated.retailYourPrice = (toNum(updated.retailPrice) * (1 - val / 100)).toFixed(2);
        } else if (type === 'yourPrice') {
          updated.retailYourPrice = value;
        }
      } else if (fieldGroup === 'wholesale') {
        if (type === 'price') {
          updated.wholesalePrice = value;
          updated.wholesaleYourPrice = (val * (1 - toNum(updated.wholesaleDiscount) / 100)).toFixed(2);
        } else if (type === 'disc') {
          updated.wholesaleDiscount = value;
          updated.wholesaleYourPrice = (toNum(updated.wholesalePrice) * (1 - val / 100)).toFixed(2);
        } else if (type === 'yourPrice') {
          updated.wholesaleYourPrice = value;
        }
      } else if (fieldGroup === 'loose') {
        if (type === 'price') {
          updated.loosePrice = value;
          updated.looseYourPrice = (val * (1 - toNum(updated.looseDiscount) / 100)).toFixed(2);
        } else if (type === 'disc') {
          updated.looseDiscount = value;
          updated.looseYourPrice = (toNum(updated.loosePrice) * (1 - val / 100)).toFixed(2);
        } else if (type === 'yourPrice') {
          updated.looseYourPrice = value;
        }
      }
      return updated;
    });
  };

  const addToCart = () => {
    if (!lineItem.itemId) {
      alert('කරුණාකර අයිතමයක් තෝරන්න!');
      return;
    }
    const q = toNum(lineItem.qty);
    const netP = toNum(lineItem.buyingNetPrice);
    setCart((prev) => [
      ...prev,
      {
        ...lineItem,
        id: lineItem.itemId,
        qty: q,
        totalCost: q * netP,
      },
    ]);
    setLineItem({
      itemId: '',
      name: '',
      qty: 1,
      barcode: '',
      warranty: '',
      expiryDate: '',
      batchNo: '',
      buyingPrice: '',
      buyingNetPrice: '',
      discountPercent: 0,
      retailPrice: '',
      retailDiscount: 0,
      retailYourPrice: '',
      wholesalePrice: '',
      wholesaleDiscount: 0,
      wholesaleYourPrice: '',
      loosePrice: '',
      looseDiscount: 0,
      looseYourPrice: '',
    });
  };

  const updateCartQty = (index, newQty) => {
    if (newQty <= 0) return;
    setCart((prev) =>
      prev.map((c, i) => (i === index ? { ...c, qty: newQty, totalCost: newQty * toNum(c.buyingNetPrice) } : c))
    );
  };

  // ─── Calculations ───
  const cartTotal = useMemo(() => cart.reduce((acc, c) => acc + toNum(c.totalCost), 0), [cart]);
  const currentPayNow = toNum(paymentData.payNow);
  const currentBalance = Math.max(0, Math.round((cartTotal - currentPayNow) * 100) / 100);
  const needsBank = paymentData.paymentMethod === 'bank';
  const bankMissing = needsBank && !paymentData.bankAccountId;

  // History Totals (Strict User Scoped)
  const totalPurchases = useMemo(() => history.reduce((acc, h) => acc + toNum(h.totalAmount), 0), [history]);
  const totalPaid = useMemo(() => history.reduce((acc, h) => acc + toNum(h.paidAmount), 0), [history]);
  const totalBillsOutstanding = useMemo(() => history.reduce((acc, h) => acc + toNum(h.balanceAmount ?? h.currentBalance), 0), [history]);

  // Grouped Outstanding Suppliers
  const groupedOutstanding = useMemo(() => {
    const groups = {};
    history.forEach((inv) => {
      const bal = toNum(inv.balanceAmount ?? inv.currentBalance);
      if (bal > 0 && inv.supplierId) {
        if (!groups[inv.supplierId]) {
          groups[inv.supplierId] = {
            sid: inv.supplierId,
            supplierName: inv.supplierName,
            totalDebt: 0,
            invoices: [],
          };
        }
        groups[inv.supplierId].totalDebt += bal;
        groups[inv.supplierId].invoices.push(inv);
      }
    });
    return Object.values(groups);
  }, [history]);

  const totalSupplierDebt = useMemo(() => {
    const debtFromInvoices = groupedOutstanding.reduce((acc, g) => acc + toNum(g.totalDebt), 0);
    if (debtFromInvoices > 0) return debtFromInvoices;
    return suppliers.reduce((acc, s) => acc + toNum(s.currentBalance || s.balance), 0);
  }, [groupedOutstanding, suppliers]);

  // ─── Filtered & Accurately Sorted History ───
  const filteredHistory = useMemo(() => {
    return history
      .filter((inv) => {
        const matchesSearch =
          (inv.supplierName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (inv.refNo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (inv.id || '').toLowerCase().includes(searchTerm.toLowerCase());
        const status = getInvStatus(inv);
        const matchesFilter = historyFilter === 'all' || status === historyFilter;
        return matchesSearch && matchesFilter;
      })
      .sort((a, b) => {
        if (sortBy === 'date-desc') {
          // Precise Millisecond Sorting: Exact newest invoice on top
          return getRecordTime(b) - getRecordTime(a);
        }
        if (sortBy === 'date-asc') {
          return getRecordTime(a) - getRecordTime(b);
        }
        if (sortBy === 'amount-desc') return toNum(b.totalAmount) - toNum(a.totalAmount);
        if (sortBy === 'balance-desc') return toNum(b.balanceAmount ?? b.currentBalance) - toNum(a.balanceAmount ?? a.currentBalance);
        return 0;
      });
  }, [history, searchTerm, historyFilter, sortBy]);

  // ════════════════════════════════════════════════════════════════════════
  // ─── SAVE INVOICE (PC Hard Disk IndexedDB + Firebase Firestore) ───
  // ════════════════════════════════════════════════════════════════════════
  const handleSave = async () => {
    if (isSaving) return;
    if (!formData.supplierId) {
      alert('කරුණාකර සැපයුම්කරුවෙකු තෝරන්න!');
      return;
    }
    if (!cart.length) {
      alert('කරුණාකර අවම වශයෙන් එක් භාණ්ඩයක්වත් Cart එකට එකතු කරන්න!');
      return;
    }
    if (needsBank && !paymentData.bankAccountId) {
      alert('කරුණාකර බැංකු ගිණුමක් තෝරන්න!');
      return;
    }

    setIsSaving(true);
    setSaveStep('දත්ත සූදානම් කරමින්...');
    const emergencyTimer = setTimeout(() => {
      setIsSaving(false);
      setSaveStep('');
    }, 10000);

    try {
      await ensureDbOpen();
      const currentUid = user?.uid || 'pos_local_user';
      const currentUserEmail = user?.email || 'admin@pos.local';

      const invId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const nowIso = new Date().toISOString();
      const isOnline = typeof window !== 'undefined' && navigator.onLine;
      const netPayNow = toNum(paymentData.payNow);
      const calculatedBalance = Math.max(0, Math.round((cartTotal - netPayNow) * 100) / 100);
      const isPurchaseType = type === 'purchase' || type === 'purchases';
      const isReturnType = type === 'purchase-return' || type === 'purchase_returns';

      const cleanedItems = cart.map((item) => {
        const copy = { ...item };
        delete copy.originalItem;
        const targetId = copy.itemId || copy.id;
        return {
          ...copy,
          id: targetId,
          itemId: targetId,
          qty: toNum(copy.qty),
          remainingQty: isPurchaseType ? toNum(copy.qty) : 0,
          buyingPrice: toNum(copy.buyingPrice),
          buyingNetPrice: toNum(copy.buyingNetPrice),
          discountPercent: toNum(copy.discountPercent),
          retailPrice: toNum(copy.retailPrice),
          retailYourPrice: toNum(copy.retailYourPrice),
          wholesalePrice: toNum(copy.wholesalePrice),
          wholesaleYourPrice: toNum(copy.wholesaleYourPrice),
          loosePrice: toNum(copy.loosePrice),
          looseYourPrice: toNum(copy.looseYourPrice),
          totalCost: toNum(copy.totalCost),
        };
      });

      const invoiceDoc = {
        id: invId,
        docId: invId,
        uid: currentUid,
        userId: currentUid,
        type,
        supplierId: formData.supplierId,
        supplierName: formData.supplierName,
        refNo: formData.refNo || '',
        date: formData.date || localISODate(),
        notes: formData.notes || '',
        items: cleanedItems,
        totalAmount: cartTotal,
        paidAmount: netPayNow,
        balanceAmount: calculatedBalance,
        currentBalance: calculatedBalance,
        paymentMethod: paymentData.paymentMethod,
        bankAccountId: paymentData.bankAccountId || '',
        receiptImages: receiptImages || [],
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: currentUserEmail,
        synced: false,
      };

      const cleanInvoicePayload = JSON.parse(JSON.stringify(invoiceDoc));

      // ─── 1. PC HARD DISK (IndexedDB) SAVE ───
      setSaveStep('PC Hard Disk (IndexedDB) හි සුරකිමින්...');
      if (localDb[storageKey]) {
        await localDb[storageKey].put(cleanInvoicePayload);
      }

      // ─── STOCK UPDATE IN LOCAL DB ───
      if (isPurchaseType || isReturnType) {
        for (const cartItem of cleanedItems) {
          const itemId = cartItem.itemId || cartItem.id;
          if (!itemId) continue;
          const localItem = await getItemFromDb(itemId);
          const changeQty = toNum(cartItem.qty);
          if (localItem) {
            const currentStock = toNum(localItem.stock ?? localItem.currentStock ?? 0);
            const newStock = isReturnType ? currentStock - changeQty : currentStock + changeQty;
            const updatedStocks = { ...(localItem.stocks || {}) };
            const currentMainStore = toNum(updatedStocks.Main_Store || 0);
            updatedStocks.Main_Store = isReturnType
              ? currentMainStore - changeQty
              : currentMainStore + changeQty;

            const itemUpdate = {
              stock: newStock,
              currentStock: newStock,
              stocks: updatedStocks,
              synced: false,
              updatedAt: nowIso,
            };

            if (isPurchaseType) {
              if (cartItem.buyingPrice) itemUpdate.buyingPrice = cartItem.buyingPrice;
              if (cartItem.buyingNetPrice) itemUpdate.buyingNetPrice = cartItem.buyingNetPrice;
              if (cartItem.retailPrice) itemUpdate.sellingPriceRetail = cartItem.retailPrice;
              if (cartItem.retailYourPrice) itemUpdate.retailYourPrice = cartItem.retailYourPrice;
              if (cartItem.wholesalePrice) itemUpdate.wholesalePrice = cartItem.wholesalePrice;
              if (cartItem.wholesaleYourPrice) itemUpdate.wholesaleYourPrice = cartItem.wholesaleYourPrice;
              if (cartItem.loosePrice) itemUpdate.loosePrice = cartItem.loosePrice;
              if (cartItem.looseYourPrice) itemUpdate.looseYourPrice = cartItem.looseYourPrice;
            }
            await localDb.items.update(localItem.id, itemUpdate);
          } else {
            // New Item creation in local DB if missing
            const newLocalItem = {
              id: String(itemId),
              docId: String(itemId),
              uid: currentUid,
              userId: currentUid,
              name: cartItem.name || 'Uncategorized',
              itemName: cartItem.name || 'Uncategorized',
              barcode: cartItem.barcode || '',
              stock: isReturnType ? -changeQty : changeQty,
              currentStock: isReturnType ? -changeQty : changeQty,
              stocks: { Main_Store: isReturnType ? -changeQty : changeQty },
              buyingPrice: cartItem.buyingPrice || 0,
              buyingNetPrice: cartItem.buyingNetPrice || 0,
              sellingPriceRetail: cartItem.retailPrice || 0,
              retailYourPrice: cartItem.retailYourPrice || 0,
              wholesalePrice: cartItem.wholesalePrice || 0,
              wholesaleYourPrice: cartItem.wholesaleYourPrice || 0,
              loosePrice: cartItem.loosePrice || 0,
              looseYourPrice: cartItem.looseYourPrice || 0,
              synced: false,
              updatedAt: nowIso,
            };
            await localDb.items.put(newLocalItem);
          }
        }
      }

      // ─── SUPPLIER DEBT UPDATE IN LOCAL DB ───
      if (formData.supplierId) {
        const localSup = await getSupplierFromDb(formData.supplierId);
        const diffBal = isReturnType ? -calculatedBalance : calculatedBalance;
        if (localSup) {
          const supBal = toNum(localSup.currentBalance ?? localSup.balance ?? 0);
          const newSupBal = Math.max(0, Math.round((supBal + diffBal) * 100) / 100);
          await localDb.suppliers.update(localSup.id, {
            currentBalance: newSupBal,
            balance: newSupBal,
            synced: false,
            updatedAt: nowIso,
          });
        } else if (formData.supplierName) {
          const initialBal = Math.max(0, calculatedBalance);
          await localDb.suppliers.put({
            id: String(formData.supplierId),
            docId: String(formData.supplierId),
            uid: currentUid,
            userId: currentUid,
            name: formData.supplierName,
            currentBalance: initialBal,
            balance: initialBal,
            synced: false,
            createdAt: nowIso,
            updatedAt: nowIso,
          });
        }
      }

      // ─── BANK ACCOUNT UPDATE IN LOCAL DB ───
      if (needsBank && paymentData.bankAccountId && netPayNow > 0) {
        const localBank = await localDb.bankAccounts.get(paymentData.bankAccountId);
        if (localBank) {
          const curBal = toNum(localBank.balance ?? localBank.currentBalance ?? 0);
          const newBankBal = curBal - netPayNow;
          await localDb.bankAccounts.update(localBank.id, {
            balance: newBankBal,
            currentBalance: newBankBal,
            synced: false,
            updatedAt: nowIso,
          });
        }
      }

      // ─── 2. FIREBASE FIRESTORE CLOUD SAVE ───
      if (isOnline) {
        try {
          setSaveStep('Firebase Cloud Firestore වෙත සුරකිමින්...');
          const batch = writeBatch(db);
          const firestoreInvoiceRef = doc(db, storageKey, invId);
          batch.set(firestoreInvoiceRef, {
            ...cleanInvoicePayload,
            uid: currentUid,
            userId: currentUid,
            synced: true,
            serverCreatedAt: serverTimestamp(),
          });

          // Stock Update in Firestore
          if (isPurchaseType || isReturnType) {
            for (const cartItem of cleanedItems) {
              const itemId = String(cartItem.itemId || cartItem.id);
              if (!itemId) continue;
              const itemRef = doc(db, 'items', itemId);
              const changeQty = isReturnType ? -toNum(cartItem.qty) : toNum(cartItem.qty);
              const firestoreFields = {
                stock: increment(changeQty),
                currentStock: increment(changeQty),
                stocks: {
                  Main_Store: increment(changeQty),
                },
                syncedAt: serverTimestamp(),
              };

              if (isPurchaseType) {
                if (cartItem.buyingPrice) firestoreFields.buyingPrice = cartItem.buyingPrice;
                if (cartItem.buyingNetPrice) firestoreFields.buyingNetPrice = cartItem.buyingNetPrice;
                if (cartItem.retailPrice) firestoreFields.sellingPriceRetail = cartItem.retailPrice;
                if (cartItem.retailYourPrice) firestoreFields.retailYourPrice = cartItem.retailYourPrice;
                if (cartItem.wholesalePrice) firestoreFields.wholesalePrice = cartItem.wholesalePrice;
                if (cartItem.wholesaleYourPrice) firestoreFields.wholesaleYourPrice = cartItem.wholesaleYourPrice;
                if (cartItem.loosePrice) firestoreFields.loosePrice = cartItem.loosePrice;
                if (cartItem.looseYourPrice) firestoreFields.looseYourPrice = cartItem.looseYourPrice;
              }
              batch.set(itemRef, firestoreFields, { merge: true });
            }
          }

          // Supplier Debt Update in Firestore
          if (formData.supplierId) {
            const supRef = doc(db, 'suppliers', String(formData.supplierId));
            const diffBal = isReturnType ? -calculatedBalance : calculatedBalance;
            batch.set(
              supRef,
              {
                uid: currentUid,
                currentBalance: increment(diffBal),
                balance: increment(diffBal),
                syncedAt: serverTimestamp(),
              },
              { merge: true }
            );
          }

          // Bank Account Update in Firestore
          if (needsBank && paymentData.bankAccountId && netPayNow > 0) {
            const bankRef = doc(db, 'bankAccounts', String(paymentData.bankAccountId));
            batch.set(
              bankRef,
              {
                balance: increment(-netPayNow),
                currentBalance: increment(-netPayNow),
                syncedAt: serverTimestamp(),
              },
              { merge: true }
            );
          }

          await batch.commit();

          if (localDb[storageKey]) {
            await localDb[storageKey].update(invId, { synced: true });
          }
        } catch (fsErr) {
          console.warn('⚠️ Firestore save warning:', fsErr);
        }
      }

      clearTimeout(emergencyTimer);
      setSaveStep('සාර්ථකව සුරැකිණි!');
      setCart([]);
      setReceiptImages([]);
      setFormData({
        supplierId: '',
        supplierName: '',
        refNo: '',
        date: localISODate(),
        notes: '',
      });
      setPaymentData({
        payNow: 0,
        paymentMethod: 'cash',
        bankAccountId: '',
      });

      await syncLocalUiStates();
      alert('✅ ගැනුම් ඉන්වොයිසිය PC Hard Disk එකෙහි සහ Firebase හී සාර්ථකව සුරැකිණි!');
    } catch (err) {
      console.error('❌ Save error:', err);
      alert('⚠️ සුරැකීමේදී දෝෂයක් සිදු විය: ' + err.message);
    } finally {
      clearTimeout(emergencyTimer);
      setIsSaving(false);
      setSaveStep('');
    }
  };

  if (authLoading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
        ⏳ පරිශීලක තොරතුරු පරීක්ෂා කරමින්...
      </div>
    );
  }

  return (
    <div style={S.box}>
      <TabWarningModal
        isOpen={tabWarning}
        cartCount={cart.length}
        onConfirm={confirmTabChange}
        onCancel={() => {
          setTabWarning(false);
          setPendingTab(null);
        }}
      />
      <ScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={(v) => {
          setLineItem((p) => ({ ...p, barcode: v }));
          const found = items.find((i) => i.barcode === v || i.itemCode === v);
          if (found) handleItemSelect(found.id || found.docId);
        }}
      />
      <PaymentModal
        isOpen={paymentModal}
        onClose={() => {
          setPaymentModal(false);
          setSelectedInvoice(null);
        }}
        invoice={selectedInvoice}
        onPaymentSaved={syncLocalUiStates}
        collectionName={storageKey}
        bankAccounts={bankAccounts}
        bankLoading={bankLoading}
        user={user}
      />

      {/* Full Details Modal */}
      <InvoiceDetailsModal
        isOpen={viewModalOpen}
        onClose={() => {
          setViewModalOpen(false);
          setViewingInvoice(null);
        }}
        invoice={viewingInvoice}
      />

      {bankLoading && (
        <div style={{ padding: '8px 16px', background: '#fef3c7', borderRadius: 8, marginBottom: 10, fontSize: 13, color: '#92400e', textAlign: 'center' }}>
          ⏳ Loading bank accounts...
        </div>
      )}

      {/* ─── Tabs ─── */}
      <div style={{ display: 'flex', gap: 5, borderBottom: '2px solid #e2e8f0' }}>
        <button type="button" style={S.tab(activeTab === 'new')} onClick={() => handleTabChange('new')}>
          📝 New Purchase
        </button>
        <button type="button" style={S.tab(activeTab === 'history')} onClick={() => handleTabChange('history')}>
          📋 History ({history.length})
        </button>
        <button type="button" style={S.tab(activeTab === 'payments')} onClick={() => handleTabChange('payments')}>
          💳 Payments Outstanding
          {totalBillsOutstanding > 0 && (
            <span style={{ background: '#ef4444', color: 'white', borderRadius: 10, padding: '2px 8px', fontSize: 11, marginLeft: 6 }}>
              {formatCurrency(totalBillsOutstanding)}
            </span>
          )}
        </button>
      </div>

      {/* ════════════════ NEW TAB ════════════════ */}
      {activeTab === 'new' && (
        <>
          <div style={{ ...S.card, marginTop: 0, borderRadius: '0 12px 12px 12px' }}>
            <h2 style={{ margin: '0 0 15px' }}>{title}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 15 }}>
              <div>
                <label style={S.lbl}>Supplier *</label>
                <SupplierSearchableSelect
                  options={suppliers}
                  value={formData.supplierId}
                  onChange={(id) => {
                    const s = suppliers.find((x) => x.id === id || x.docId === id);
                    setFormData((p) => ({
                      ...p,
                      supplierId: id,
                      supplierName: s?.name || '',
                    }));
                  }}
                  onSupplierCreated={(newSupplier) => {
                    setSuppliers((prev) => [newSupplier, ...prev]);
                    setFormData((p) => ({
                      ...p,
                      supplierId: newSupplier.id || newSupplier.docId,
                      supplierName: newSupplier.name,
                    }));
                  }}
                  placeholder="සැපයුම්කරු තෝරන්න / නව"
                  user={user}
                />
              </div>
              <div>
                <label style={S.lbl}>Ref No</label>
                <input style={{ ...S.inp, textAlign: 'left' }} value={formData.refNo} onChange={(e) => setFormData((p) => ({ ...p, refNo: e.target.value }))} />
              </div>
              <div>
                <label style={S.lbl}>Date</label>
                <input type="date" style={S.inp} value={formData.date} onChange={(e) => setFormData((p) => ({ ...p, date: e.target.value }))} />
              </div>
              <div>
                <label style={S.lbl}>Notes</label>
                <input style={{ ...S.inp, textAlign: 'left' }} value={formData.notes} onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Add Item */}
          <div style={S.card}>
            <h3 style={{ margin: '0 0 15px', fontSize: 18 }}>➕ Add Item</h3>
            <div style={{ marginBottom: 15 }}>
              <SearchableSelect options={items} value={lineItem.itemId} onChange={handleItemSelect} placeholder="භාණ්ඩය සොයන්න..." />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <div>
                <label style={S.lbl}>📦 Qty</label>
                <input type="number" value={lineItem.qty} onChange={(e) => setLineItem((p) => ({ ...p, qty: e.target.value }))} onFocus={(e) => e.target.select()} style={{ width: '100%', padding: 16, borderRadius: 12, border: '2px solid #3b82f6', fontSize: 24, fontWeight: '900', textAlign: 'center', background: '#eff6ff', color: '#1e40af', outline: 'none' }} />
              </div>
              <div>
                <label style={S.lbl}>📊 Barcode</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={lineItem.barcode} onChange={(e) => setLineItem((p) => ({ ...p, barcode: e.target.value }))} style={{ flex: 1, padding: 16, borderRadius: 12, border: '2px solid #f59e0b', fontSize: 16, fontWeight: 'bold', textAlign: 'center', background: '#fffbeb', outline: 'none' }} />
                  <button type="button" onClick={() => setShowScanner(true)} style={{ padding: '14px 18px', borderRadius: 12, border: '2px solid #f59e0b', background: '#fef3c7', fontSize: 22 }}>📷</button>
                </div>
              </div>
              <div>
                <label style={S.lbl}>🔒 Warranty</label>
                <input value={lineItem.warranty} onChange={(e) => setLineItem((p) => ({ ...p, warranty: e.target.value }))} style={{ width: '100%', padding: 16, borderRadius: 12, border: '1px solid #cbd5e1', fontSize: 16, textAlign: 'center', outline: 'none' }} />
              </div>
            </div>

            {/* Expiry & Batch */}
            <div style={{ marginTop: 15, padding: 16, background: 'linear-gradient(135deg, #fefce8, #fef9c3)', borderRadius: 12, border: '2px solid #fde047' }}>
              <div style={{ fontWeight: 'bold', color: '#854d0e', marginBottom: 12, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                📅 කල් ඉකුත්වීම / Batch තොරතුරු
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 700, color: '#92400e' }}>📅 කල් ඉකුත්වීමේ දිනය (Expiry Date)</label>
                  <input
                    type="date"
                    value={lineItem.expiryDate}
                    onChange={(e) => setLineItem((p) => ({ ...p, expiryDate: e.target.value }))}
                    min={localISODate()}
                    style={{ width: '100%', padding: 14, borderRadius: 10, border: '2px solid #fcd34d', background: '#fffbeb', fontSize: 15, fontWeight: 600, textAlign: 'center', outline: 'none', color: '#854d0e' }}
                  />
                  {lineItem.expiryDate && (
                    <div style={{ marginTop: 8 }}>
                      <ExpiryBadge expiryDate={lineItem.expiryDate} />
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 700, color: '#92400e' }}>🏷️ Batch / Lot අංකය</label>
                  <input
                    value={lineItem.batchNo}
                    onChange={(e) => setLineItem((p) => ({ ...p, batchNo: e.target.value }))}
                    placeholder="eg: BATCH-2024-001"
                    style={{ width: '100%', padding: 14, borderRadius: 10, border: '2px solid #fcd34d', background: '#fffbeb', fontSize: 15, fontWeight: 600, textAlign: 'center', outline: 'none', color: '#854d0e' }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                {[
                  { label: '+3 මාස', months: 3 },
                  { label: '+6 මාස', months: 6 },
                  { label: '+1 වසර', months: 12 },
                  { label: '+2 වසර', months: 24 },
                  { label: '+3 වසර', months: 36 },
                ].map((opt) => {
                  const d = new Date();
                  d.setMonth(d.getMonth() + opt.months);
                  const dateStr = localISODate(d);
                  return (
                    <button
                      key={opt.months}
                      type="button"
                      onClick={() => setLineItem((p) => ({ ...p, expiryDate: dateStr }))}
                      style={{ padding: '6px 12px', borderRadius: 8, border: lineItem.expiryDate === dateStr ? '2px solid #f59e0b' : '1px solid #e5e7eb', background: lineItem.expiryDate === dateStr ? '#fef3c7' : 'white', color: '#92400e', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
                {lineItem.expiryDate && (
                  <button type="button" onClick={() => setLineItem((p) => ({ ...p, expiryDate: '' }))} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                    ✕ Clear
                  </button>
                )}
              </div>
            </div>

            <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 15 }}>
              <PriceBox title="Buying Cost" icon="💰" bgColor="#fffbeb" borderColor="#fcd34d" textColor="#b45309" accentBg="#fef3c7" price={lineItem.buyingPrice} disc={lineItem.discountPercent} yourPrice={lineItem.buyingNetPrice} onPriceChange={(v) => hPrice('buying', 'price', v)} onDiscChange={(v) => hPrice('buying', 'disc', v)} onYourPriceChange={(v) => hPrice('buying', 'yourPrice', v)} priceLabel="Cost" yourPriceLabel="Net Cost" />
              <PriceBox title="Retail" icon="🏪" bgColor="#eff6ff" borderColor="#bfdbfe" textColor="#1e40af" accentBg="#dbeafe" price={lineItem.retailPrice} disc={lineItem.retailDiscount} yourPrice={lineItem.retailYourPrice} onPriceChange={(v) => hPrice('retail', 'price', v)} onDiscChange={(v) => hPrice('retail', 'disc', v)} onYourPriceChange={(v) => hPrice('retail', 'yourPrice', v)} />
              <PriceBox title="Wholesale" icon="🏭" bgColor="#faf5ff" borderColor="#e9d5ff" textColor="#6b21a8" accentBg="#f3e8ff" price={lineItem.wholesalePrice} disc={lineItem.wholesaleDiscount} yourPrice={lineItem.wholesaleYourPrice} onPriceChange={(v) => hPrice('wholesale', 'price', v)} onDiscChange={(v) => hPrice('wholesale', 'disc', v)} onYourPriceChange={(v) => hPrice('wholesale', 'yourPrice', v)} />
              <PriceBox title="Loose" icon="📦" bgColor="#fff7ed" borderColor="#fdba74" textColor="#c2410c" accentBg="#ffedd5" price={lineItem.loosePrice} disc={lineItem.looseDiscount} yourPrice={lineItem.looseYourPrice} onPriceChange={(v) => hPrice('loose', 'price', v)} onDiscChange={(v) => hPrice('loose', 'disc', v)} onYourPriceChange={(v) => hPrice('loose', 'yourPrice', v)} />
            </div>

            <button type="button" onClick={addToCart} disabled={!lineItem.itemId} style={{ ...S.btn, marginTop: 20, width: '100%', padding: 18, fontSize: 18, borderRadius: 12, background: lineItem.itemId ? 'linear-gradient(135deg, #3b82f6, #1e40af)' : '#94a3b8' }}>
              ⬇ Add to Cart
            </button>
          </div>

          {/* Cart Section */}
          <div style={S.card}>
            <h3 style={{ margin: '0 0 15px' }}>🛒 Cart ({cart.length})</h3>
            {!cart.length && <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>Cart හිස්.</div>}
            {cart.map((c, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ flex: 2 }}>
                  <b>{c.name}</b>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    × {toNum(c.buyingNetPrice).toFixed(2)}
                    {toNum(c.discountPercent) > 0 && <span style={{ color: '#d97706' }}> (-{c.discountPercent}%)</span>}
                  </div>
                  {c.expiryDate && <div style={{ marginTop: 4 }}><ExpiryBadge expiryDate={c.expiryDate} size="small" /></div>}
                  {c.batchNo && <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 2 }}>🏷️ {c.batchNo}</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <button type="button" onClick={() => updateCartQty(i, c.qty - 1)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #cbd5e1', background: '#f1f5f9', cursor: 'pointer', fontWeight: 'bold', fontSize: 16 }}>−</button>
                    <span style={{ fontWeight: 700, minWidth: 32, textAlign: 'center', fontSize: 16 }}>{c.qty}</span>
                    <button type="button" onClick={() => updateCartQty(i, c.qty + 1)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #cbd5e1', background: '#f1f5f9', cursor: 'pointer', fontWeight: 'bold', fontSize: 16 }}>+</button>
                  </div>
                </div>
                <div style={{ flex: 1, textAlign: 'right', fontWeight: 'bold', fontSize: 16, color: '#1e40af' }}>{(c.totalCost || 0).toFixed(2)}</div>
                <button type="button" onClick={() => setCart((p) => p.filter((_, x) => x !== i))} style={{ color: '#ef4444', background: 'none', border: 'none', fontSize: 20, marginLeft: 10 }}>✕</button>
              </div>
            ))}

            {cart.length > 0 && (
              <>
                <div style={{ padding: 20, background: '#f8fafc', borderRadius: 12, border: '2px solid #e2e8f0', marginTop: 15 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 'bold' }}>Total:</span>
                    <span style={{ fontSize: 18, fontWeight: 'bold', color: '#1e40af' }}>{formatCurrency(cartTotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 16, color: '#16a34a', fontWeight: 'bold' }}>Pay Now:</span>
                    <span style={{ fontSize: 18, fontWeight: 'bold', color: '#16a34a' }}>{formatCurrency(currentPayNow)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px dashed #cbd5e1', paddingTop: 10 }}>
                    <span style={{ fontSize: 18, color: '#dc2626', fontWeight: 'bold' }}>Balance:</span>
                    <span style={{ fontSize: 24, fontWeight: '900', color: currentBalance > 0 ? '#dc2626' : '#16a34a' }}>{formatCurrency(currentBalance)}</span>
                  </div>
                </div>

                <div style={{ background: '#fefce8', padding: 20, borderRadius: 12, border: '2px solid #fde047', marginTop: 15 }}>
                  <h4 style={{ margin: '0 0 12px', color: '#854d0e' }}>🧾 රිසිට්පත්</h4>
                  <ReceiptUploader receipts={receiptImages} setReceipts={setReceiptImages} disabled={isSaving} />
                </div>

                <div style={{ background: '#f0fdf4', padding: 20, borderRadius: 12, border: '2px solid #86efac', marginTop: 15 }}>
                  <h4 style={{ margin: '0 0 15px', color: '#166534' }}>💳 ගෙවීම් තොරතුරු</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 15, marginBottom: 16 }}>
                    <div>
                      <label style={{ ...S.lbl, color: '#166534' }}>Pay Now</label>
                      <input type="number" style={{ ...S.inp, fontSize: 18, fontWeight: 'bold', border: '2px solid #22c55e' }} value={paymentData.payNow} onChange={(e) => setPaymentData((p) => ({ ...p, payNow: e.target.value }))} onFocus={(e) => e.target.select()} />
                      <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
                        <button type="button" onClick={() => setPaymentData((p) => ({ ...p, payNow: (cartTotal / 2).toFixed(2) }))} style={{ flex: 1, padding: 6, fontSize: 11, borderRadius: 6, border: '1px solid #cbd5e1', background: '#f1f5f9' }}>½</button>
                        <button type="button" onClick={() => setPaymentData((p) => ({ ...p, payNow: (Number(cartTotal) || 0).toFixed(2) }))} style={{ flex: 1, padding: 6, fontSize: 11, fontWeight: 'bold', borderRadius: 6, border: '1px solid #22c55e', background: '#dcfce7', color: '#166534' }}>Full</button>
                      </div>
                    </div>
                    <div>
                      <label style={{ ...S.lbl, color: '#166534' }}>ක්‍රමය</label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 6 }}>
                        {PAYMENT_METHODS.map((m) => (
                          <button
                            key={m.v}
                            type="button"
                            onClick={() => setPaymentData((p) => ({ ...p, paymentMethod: m.v, bankAccountId: m.v !== 'bank' ? '' : p.bankAccountId }))}
                            style={{ padding: '8px 12px', borderRadius: 8, border: paymentData.paymentMethod === m.v ? `2px solid ${m.c}` : '2px solid #e2e8f0', background: paymentData.paymentMethod === m.v ? `${m.c}12` : 'white', color: paymentData.paymentMethod === m.v ? m.c : '#64748b', fontWeight: paymentData.paymentMethod === m.v ? 700 : 500, fontSize: 13 }}
                          >
                            {m.l}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {needsBank && (
                    <div style={{ padding: 16, background: 'white', borderRadius: 12, border: '2px solid #bfdbfe', marginTop: 4 }}>
                      <BankAccountSelector value={paymentData.bankAccountId} onChange={(id) => setPaymentData((p) => ({ ...p, bankAccountId: id }))} bankAccounts={bankAccounts} loading={bankLoading} disabled={isSaving} showDeductInfo deductAmount={currentPayNow} />
                    </div>
                  )}
                </div>

                {saveStep && (
                  <div style={{ marginTop: 10, padding: 15, background: '#eff6ff', borderRadius: 10, textAlign: 'center', color: '#1e40af', fontWeight: 'bold' }}>
                    ⏳ {saveStep}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || !formData.supplierId || bankMissing}
                  style={{ ...S.btn, background: isSaving || !formData.supplierId || bankMissing ? '#94a3b8' : 'linear-gradient(135deg, #16a34a, #22c55e)', marginTop: 20, width: '100%', padding: 18, fontSize: 18, borderRadius: 12 }}
                >
                  {isSaving ? `⏳ ${saveStep || 'Save...'}` : bankMissing ? '🏦 බැංකු ගිණුම තෝරන්න' : !formData.supplierId ? '⚠️ Supplier තෝරන්න' : `💾 Save Purchase — ${formatCurrency(cartTotal)}`}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* ════════════════ HISTORY TAB ════════════════ */}
      {activeTab === 'history' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Total Purchases', value: totalPurchases, bg: 'linear-gradient(135deg, #1e40af, #3b82f6)' },
              { label: 'Total Paid', value: totalPaid, bg: 'linear-gradient(135deg, #166534, #22c55e)' },
              { label: 'ණය ශේෂය', value: totalSupplierDebt, bg: totalSupplierDebt > 0 ? 'linear-gradient(135deg, #991b1b, #ef4444)' : 'linear-gradient(135deg, #166534, #22c55e)' },
              { label: 'බිල් ඉතිරිය', value: totalBillsOutstanding, bg: totalBillsOutstanding > 0 ? 'linear-gradient(135deg, #7c3aed, #a855f7)' : 'linear-gradient(135deg, #166534, #22c55e)' },
            ].map((card, idx) => (
              <div key={idx} style={{ background: card.bg, padding: 16, borderRadius: 12, color: 'white' }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>{card.label}</div>
                <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4 }}>{formatCurrency(card.value)}</div>
              </div>
            ))}
          </div>

          <div style={S.card}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 15 }}>
              <input placeholder="🔍 Search invoices..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ ...S.inp, textAlign: 'left', flex: '1 1 300px', padding: 12 }} />
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ ...S.inp, textAlign: 'left', width: 'auto', minWidth: 160 }}>
                <option value="date-desc">📅 Latest (නවතම පළමුව)</option>
                <option value="date-asc">📅 Oldest (පැරණි පළමුව)</option>
                <option value="amount-desc">💰 Highest Amount</option>
                <option value="balance-desc">🔴 Outstanding Balance</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { v: 'all', l: 'All', c: '#3b82f6' },
                { v: 'credit', l: '🔴 Credit', c: '#ef4444' },
                { v: 'partial', l: '🟡 Partial', c: '#f59e0b' },
                { v: 'paid', l: '🟢 Paid', c: '#22c55e' },
              ].map((f) => (
                <button
                  key={f.v}
                  type="button"
                  onClick={() => setHistoryFilter(f.v)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: historyFilter === f.v ? `2px solid ${f.c}` : '1px solid #e2e8f0',
                    color: historyFilter === f.v ? f.c : '#64748b',
                    background: 'white',
                    cursor: 'pointer',
                    fontWeight: historyFilter === f.v ? 700 : 400,
                  }}
                >
                  {f.l} ({history.filter((i) => f.v === 'all' || getInvStatus(i) === f.v).length})
                </button>
              ))}
            </div>
          </div>

          {!filteredHistory.length ? (
            <div style={{ ...S.card, textAlign: 'center', padding: 40, color: '#94a3b8' }}>බිල්පත් කිසිවක් සොයාගත නොහැක.</div>
          ) : (
            filteredHistory.map((inv) => (
              <InvoiceCard
                key={inv.id}
                inv={inv}
                collectionName={storageKey}
                S={S}
                onViewDetails={(invoice) => {
                  setViewingInvoice(invoice);
                  setViewModalOpen(true);
                }}
                onPayClick={(invoice) => {
                  setSelectedInvoice(invoice);
                  setPaymentModal(true);
                }}
                onUpdate={syncLocalUiStates}
                onDeleteInvoice={async (supplierId, deletedBalance) => {
                  if (supplierId && deletedBalance > 0) {
                    const targetSup = await getSupplierFromDb(supplierId);
                    if (targetSup) {
                      const updatedBal = Math.max(0, Math.round((toNum(targetSup.currentBalance ?? targetSup.balance) - deletedBalance) * 100) / 100);
                      await localDb.suppliers.update(targetSup.id, { currentBalance: updatedBal, balance: updatedBal, synced: false });
                      syncLocalUiStates();
                    }
                  }
                }}
              />
            ))
          )}
        </div>
      )}

      {/* ════════════════ PAYMENTS TAB ════════════════ */}
      {activeTab === 'payments' && (
        <div>
          <div style={S.card}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
              <div style={{ background: '#fef2f2', border: '2px solid #fca5a5', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, color: '#991b1b', fontWeight: 700, marginBottom: 6 }}>සැපයුම්කරුගේ ණය ශේෂය</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#dc2626' }}>{formatCurrency(totalSupplierDebt)}</div>
              </div>
              <div style={{ background: '#f5f3ff', border: '2px solid #c4b5fd', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, color: '#6d28d9', fontWeight: 700, marginBottom: 6 }}>ගෙවීමට ඇති බිල්පත් එකතුව</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#7c3aed' }}>{formatCurrency(totalBillsOutstanding)}</div>
              </div>
            </div>

            <div style={{ marginBottom: 15, fontWeight: 700, fontSize: 18, color: '#1e293b' }}>🔴 Supplier Outstanding Balances</div>
            {groupedOutstanding.length > 0 ? (
              groupedOutstanding.map((g) => (
                <SupplierOutstandingCard
                  key={g.sid}
                  group={g}
                  onPayInvoice={(inv) => {
                    setSelectedInvoice(inv);
                    setPaymentModal(true);
                  }}
                />
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: 50, color: '#16a34a' }}>
                <div style={{ fontSize: 60, marginBottom: 10 }}>✅</div>
                <div style={{ fontSize: 18, fontWeight: 'bold' }}>සියලු ගෙවීම් සම්පූර්ණයි!</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}