'use client';

// src/components/VehicleExpenseTab.jsx
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// v1.0 â€” Full Vehicle Expense Manager
// Next.js compatible version
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { db } from '@/shared/firebase-config';
import { useUserAuth } from '@/context/UserContext';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, where, getDocs,
  serverTimestamp, Timestamp, increment
} from 'firebase/firestore';

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   HELPERS
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const toNum = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const fmtC = v => toNum(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQ = v => { const n = Math.round(toNum(v) * 100) / 100; return n % 1 === 0 ? String(n) : n.toFixed(2); };
const pad = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const nowHHMM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

const tsMs = src => {
  if (!src) return 0;
  try {
    if (typeof src?.toDate === 'function') return src.toDate().getTime();
    if (src?.seconds) return src.seconds * 1000;
    if (typeof src === 'number') return src;
    const d = new Date(src);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  } catch { return 0; }
};

const toDateStr = src => {
  if (!src) return '';
  if (typeof src === 'string' && /^\d{4}-\d{2}-\d{2}/.test(src)) return src.slice(0, 10);
  const ms = tsMs(src);
  if (ms > 0) { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  return '';
};

const diffDaysFrom = src => {
  if (!src) return 0;
  const ms = tsMs(src);
  const d = ms > 0 ? new Date(ms) : new Date(`${src}T00:00:00`);
  if (isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
};

const compressImage = (file, maxW = 400, quality = 0.6) => new Promise(resolve => {
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > maxW) { h = (h * maxW) / w; w = maxW; }
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(null);
    img.src = e.target.result;
  };
  reader.onerror = () => resolve(null);
  reader.readAsDataURL(file);
});

const getItemImageUrl = item => {
  if (!item) return null;
  if (item.itemImage) return item.itemImage;
  if (item.picture && typeof item.picture === 'string' && item.picture.length > 20) return item.picture;
  if (Array.isArray(item.images) && item.images.length > 0 && typeof item.images[0] === 'string') return item.images[0];
  if (item.photoURL) return item.photoURL;
  return null;
};

const rangeStart = f => {
  const d = new Date();
  switch (f) {
    case 'today': return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    case 'yesterday': return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1).getTime();
    case 'thisWeek': { const day = d.getDay(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + (day === 0 ? -6 : 1)).getTime(); }
    case 'thisMonth': return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    case 'lastMonth': return new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
    case 'thisYear': return new Date(d.getFullYear(), 0, 1).getTime();
    default: return 0;
  }
};
const rangeEnd = f => {
  const d = new Date();
  if (f === 'yesterday') return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (f === 'lastMonth') return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  return Date.now() + 86400000;
};

const PLACEHOLDER_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Crect width='60' height='60' fill='%23f1f5f9'/%3E%3Ctext x='50%25' y='54%25' text-anchor='middle' fill='%2394a3b8' font-size='24'%3EðŸ“¦%3C/text%3E%3C/svg%3E";

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   EXPENSE TYPE CONFIG
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const EXP_TYPES = {
  fuel:    { label: 'à¶©à·“à·ƒà¶½à·Š / Fuel',    icon: 'â›½', color: '#ea580c', bg: '#fff7ed', border: '#fdba74' },
  tyre:    { label: 'à¶§à¶ºà¶»à·Š / Tyre',      icon: 'ðŸ›ž', color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
  service: { label: 'Service / Repair', icon: 'ðŸ”§', color: '#7c3aed', bg: '#faf5ff', border: '#c4b5fd' },
  oil:     { label: 'Oil / Lubricant',  icon: 'ðŸ›¢ï¸', color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' },
  battery: { label: 'Battery',          icon: 'ðŸ”‹', color: '#059669', bg: '#ecfdf5', border: '#6ee7b7' },
  insurance:{ label: 'Insurance',       icon: 'ðŸ“‹', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' },
  licence: { label: 'Licence / Revenue',icon: 'ðŸ“„', color: '#65a30d', bg: '#f7fee7', border: '#d9f99d' },
  washing: { label: 'Washing',          icon: 'ðŸš¿', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' },
  parking: { label: 'Parking / Toll',   icon: 'ðŸ…¿ï¸', color: '#9333ea', bg: '#fdf4ff', border: '#e9d5ff' },
  other:   { label: 'à·€à·™à¶±à¶­à·Š / Other',   icon: 'ðŸ“Œ', color: '#475569', bg: '#f8fafc', border: '#cbd5e1' },
};
const getExpMeta = k => EXP_TYPES[k] || EXP_TYPES.other;

const DEFAULT_CATEGORIES = Object.entries(EXP_TYPES).map(([k, v]) => ({
  key: k, name: v.label, icon: v.icon, color: v.color,
}));

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   FUEL / TYRE / SERVICE STATS
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const fuelCalc = f => {
  const litres = toNum(f.fuelLitres), kmB = toNum(f.kmBefore), kmA = toNum(f.kmAfter);
  const kmDriven = Math.max(0, kmA - kmB);
  const autoAmt = litres * toNum(f.pricePerLitre);
  const kmPerLitre = litres > 0 && kmDriven > 0 ? kmDriven / litres : 0;
  return { litres, kmB, kmA, kmDriven, autoAmt, kmPerLitre };
};

const tyreCalc = f => {
  const iKm = toNum(f.installedKm), cKm = toNum(f.currentKm);
  const kmUsed = Math.max(0, cKm - iKm);
  const daysUsed = diffDaysFrom(f.installedDate);
  const expectedKm = toNum(f.expectedLifeKm);
  const remainingKm = expectedKm > 0 ? expectedKm - kmUsed : 0;
  return { iKm, cKm, kmUsed, daysUsed, expectedKm, remainingKm };
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   PAYMENT METHODS
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const PAY_METHODS = [
  { value: 'cash',   label: 'ðŸ’µ à¶¸à·”à¶¯à¶½à·Š',   en: 'Cash',   icon: 'ðŸ’µ', needsBank: false },
  { value: 'bank',   label: 'ðŸ¦ à¶¶à·à¶‚à¶šà·”',   en: 'Bank',   icon: 'ðŸ¦', needsBank: true },
  { value: 'card',   label: 'ðŸ’³ à¶šà·à¶©à·Š',    en: 'Card',   icon: 'ðŸ’³', needsBank: true },
  { value: 'cheque', label: 'ðŸ“ à¶ à·™à¶šà·Š',    en: 'Cheque', icon: 'ðŸ“', needsBank: true },
  { value: 'credit', label: 'ðŸ“‹ à¶«à¶º',      en: 'Credit', icon: 'ðŸ“‹', needsBank: false },
];

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   INITIAL FORM STATE
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const INIT_FORM = {
  vehicleId: '', expenseType: 'fuel',
  expenseDate: todayStr(), expenseTime: nowHHMM(),
  amount: '', description: '', notes: '',
  paymentMethod: 'cash', bankAccountId: '',
  receipt: null, reference: '',
  expenseBy: '', expenseBySupplierId: '',
  expenseItems: [],
  fuelLitres: '', pricePerLitre: '', kmBefore: '', kmAfter: '', fuelType: 'diesel', tankFull: true,
  tyreBrand: '', tyrePosition: 'Front-Left', installedDate: todayStr(),
  installedKm: '', currentKm: '', expectedLifeKm: '', tyreQty: '1',
  serviceKm: '', nextServiceKm: '', serviceDetails: '',
  issueDate: '', expiryDate: '', referenceNo: '', company: '',
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ITEM SEARCH DROPDOWN
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const ItemSearchDropdown = ({ inventoryItems, value, onSelect, onNameChange, currentName }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const h = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return inventoryItems.slice(0, 50);
    const terms = s.split(/\s+/);
    return inventoryItems.filter(it => {
      const hay = `${it.name || ''} ${it.sinhalaName || ''} ${it.itemCode || ''} ${it.barcode || ''} ${it.brandName || ''}`.toLowerCase();
      return terms.every(term => hay.includes(term));
    }).slice(0, 50);
  }, [inventoryItems, search]);

  const selectedItem = value ? inventoryItems.find(it => it.id === value) : null;
  const imgUrl = selectedItem ? getItemImageUrl(selectedItem) : null;

  if (selectedItem) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 10, border: '2px solid #22c55e', background: '#f0fdf4' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <img src={imgUrl || PLACEHOLDER_IMG} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', border: '1px solid #e2e8f0' }} onError={e => { e.target.src = PLACEHOLDER_IMG; }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{selectedItem.name}</div>
            {selectedItem.sinhalaName && <div style={{ fontSize: 11, color: '#64748b' }}>{selectedItem.sinhalaName}</div>}
            <div style={{ fontSize: 10, color: '#94a3b8' }}>{selectedItem.itemCode}{selectedItem.brandName ? ` â€¢ ${selectedItem.brandName}` : ''}</div>
          </div>
        </div>
        <button onClick={() => { onSelect(null); setSearch(''); }} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>âœ•</button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input value={open ? search : currentName || ''} onChange={e => { if (open) setSearch(e.target.value); else onNameChange(e.target.value); }} onFocus={() => { setSearch(''); setOpen(true); }} placeholder="ðŸ” à¶·à·à¶«à·Šà¶©à¶º à·ƒà·œà¶ºà¶±à·Šà¶±..." style={ST.inpSm} />
        {!open && <button onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12 }}>â–¼</button>}
      </div>

      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'white', border: '2px solid #3b82f6', borderRadius: 12, boxShadow: '0 12px 36px rgba(0,0,0,.15)', maxHeight: 340, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 8, borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <input autoFocus ref={inputRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="ðŸ” à·ƒà·œà¶ºà¶±à·Šà¶±..." style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ overflowY: 'auto', flex: 1, maxHeight: 280 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                <span style={{ fontSize: 24 }}>ðŸ”</span>
                <div>{search ? 'à¶œà·à¶½à¶´à·™à¶± à¶·à·à¶«à·Šà¶© à¶±à·œà¶¸à·à¶­' : 'à¶·à·à¶«à·Šà¶© à¶±à·œà¶¸à·à¶­'}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>à·„à· à¶…à¶­à·’à¶±à·Š à¶§à¶ºà·’à¶´à·Š à¶šà¶»à¶±à·Šà¶±</div>
              </div>
            ) : filtered.map(item => {
              const img = getItemImageUrl(item);
              const stock = toNum(item.stock || 0);
              return (
                <div key={item.id} onClick={() => { onSelect(item); setSearch(''); setOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}>
                  <img src={img || PLACEHOLDER_IMG} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', border: '1px solid #e2e8f0' }} onError={e => { e.target.src = PLACEHOLDER_IMG; }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                    {item.sinhalaName && <div style={{ fontSize: 11, color: '#64748b' }}>{item.sinhalaName}</div>}
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{item.itemCode}{item.brandName ? ` â€¢ ${item.brandName}` : ''}{item.uomName ? ` â€¢ ${item.uomName}` : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {toNum(item.buyingPrice) > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>Rs.{fmtC(item.buyingPrice)}</div>}
                    <div style={{ fontSize: 10, color: stock > 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>Stock: {stock}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   MAIN COMPONENT
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export default function VehicleExpenseTab({ vehicles: externalVehicles }) {
  const { user } = useUserAuth();

  const [vehicles, setVehicles] = useState(externalVehicles || []);
  const [expenses, setExpenses] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [categories, setCategories] = useState([...DEFAULT_CATEGORIES]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const [mainTab, setMainTab] = useState('list');
  const [dateFilter, setDateFilter] = useState('thisMonth');
  const [typeFilter, setTypeFilter] = useState('all');
  const [vehicleFilter, setVehicleFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [expandedId, setExpandedId] = useState(null);
  const [page, setPage] = useState(1);
  const perPage = 20;

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...INIT_FORM });
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: '', companyName: '', phone: '' });
  const [viewReceipt, setViewReceipt] = useState(null);

  const fileRef = useRef(null);
  const printRef = useRef(null);
  const showToast = useCallback(msg => { setToast(msg); setTimeout(() => setToast(''), 3500); }, []);

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const fs = fuelCalc(form);
  const ts = tyreCalc(form);

  const activeBanks = useMemo(() => bankAccounts.filter(a => a.isActive !== false), [bankAccounts]);
  const selectedPM = PAY_METHODS.find(p => p.value === form.paymentMethod);
  const needsBank = selectedPM?.needsBank || false;

  const normalizedItems = useMemo(() => {
    return (form.expenseItems || []).map(r => {
      const name = (r.itemName || '').trim();
      const qty = toNum(r.qty || 1) || 1;
      const up = toNum(r.unitPrice || 0);
      if (!name && !r.itemId && !up) return null;
      return { itemId: r.itemId || '', itemName: name, qty, unitPrice: up, unit: r.unit || '', lineTotal: qty * up, itemImage: r.itemImage || '' };
    }).filter(Boolean);
  }, [form.expenseItems]);

  const itemsTotal = useMemo(() => normalizedItems.reduce((s, r) => s + toNum(r.lineTotal), 0), [normalizedItems]);
  const hasItems = normalizedItems.length > 0;

  const supplierListFiltered = useMemo(() => {
    const s = supplierSearch.trim().toLowerCase();
    if (!s) return suppliers;
    return suppliers.filter(sup => `${sup.name || ''} ${sup.companyName || ''} ${sup.phone || ''}`.toLowerCase().includes(s));
  }, [suppliers, supplierSearch]);

  // LOAD DATA
  useEffect(() => {
    if (!user?.uid) { setLoading(false); return; }
    const unsubs = [];

    if (!externalVehicles) {
      unsubs.push(onSnapshot(collection(db, `users/${user.uid}/vehicles`), s => setVehicles(s.docs.map(d => ({ id: d.id, ...d.data() })))));
    }

    unsubs.push(onSnapshot(collection(db, `users/${user.uid}/vehicleExpenses`), s => {
      const list = s.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => tsMs(b.timestamp || b.createdAt) - tsMs(a.timestamp || a.createdAt));
      setExpenses(list); setLoading(false);
    }, () => setLoading(false)));

    unsubs.push(onSnapshot(collection(db, `users/${user.uid}/bankAccounts`), s => setBankAccounts(s.docs.map(d => ({ id: d.id, ...d.data() })))));

    unsubs.push(onSnapshot(query(collection(db, 'suppliers'), where('uid', '==', user.uid)), s => {
      const list = s.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setSuppliers(list);
    }));

    unsubs.push(onSnapshot(query(collection(db, 'items'), where('uid', '==', user.uid)), s => {
      const list = s.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setInventoryItems(list);
    }));

    unsubs.push(onSnapshot(query(collection(db, 'vehicleExpenseCategories'), where('uid', '==', user.uid)), s => {
      const custom = s.docs.map(d => ({ id: d.id, ...d.data(), isCustom: true }));
      setCategories([...DEFAULT_CATEGORIES, ...custom.map(c => ({ key: c.key || c.name, name: c.name, icon: c.icon || 'ðŸ“‹', color: c.color || '#64748b', id: c.id, isCustom: true }))]);
    }, () => {}));

    return () => unsubs.forEach(f => typeof f === 'function' && f());
  }, [user, externalVehicles]);

  useEffect(() => { if (externalVehicles) setVehicles(externalVehicles); }, [externalVehicles]);

  // FILTER
  const filtered = useMemo(() => {
    let res = expenses.filter(e => {
      const ms = tsMs(e.timestamp || e.createdAt || e.expenseDate);
      if (dateFilter !== 'allTime' && (ms < rangeStart(dateFilter) || ms > rangeEnd(dateFilter))) return false;
      if (typeFilter !== 'all' && e.expenseType !== typeFilter) return false;
      if (vehicleFilter !== 'all' && e.vehicleId !== vehicleFilter) return false;
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        const hay = [e.description, e.vehicleNo, e.expenseBy, e.tyreBrand, e.tyrePosition, e.serviceDetails, String(e.amount || ''), e.notes, e.reference].join(' ').toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
    switch (sortBy) {
      case 'oldest': res.sort((a, b) => tsMs(a.timestamp) - tsMs(b.timestamp)); break;
      case 'highest': res.sort((a, b) => toNum(b.amount) - toNum(a.amount)); break;
      case 'lowest': res.sort((a, b) => toNum(a.amount) - toNum(b.amount)); break;
      default: res.sort((a, b) => tsMs(b.timestamp || b.createdAt) - tsMs(a.timestamp || a.createdAt));
    }
    return res;
  }, [expenses, dateFilter, typeFilter, vehicleFilter, searchTerm, sortBy]);

  // STATS
  const stats = useMemo(() => {
    const total = filtered.reduce((s, e) => s + toNum(e.amount), 0);
    const count = filtered.length;
    const byType = {};
    filtered.forEach(e => {
      const t = e.expenseType || 'other';
      if (!byType[t]) byType[t] = { total: 0, count: 0 };
      byType[t].total += toNum(e.amount); byType[t].count++;
    });
    const typeBreak = Object.entries(byType).sort((a, b) => b[1].total - a[1].total);

    const byVehicle = {};
    filtered.forEach(e => {
      const v = e.vehicleNo || '-';
      if (!byVehicle[v]) byVehicle[v] = { total: 0, count: 0 };
      byVehicle[v].total += toNum(e.amount); byVehicle[v].count++;
    });
    const vehicleBreak = Object.entries(byVehicle).sort((a, b) => b[1].total - a[1].total);

    const byPay = {};
    filtered.forEach(e => {
      const p = e.paymentMethod || 'cash';
      if (!byPay[p]) byPay[p] = { total: 0, count: 0 };
      byPay[p].total += toNum(e.amount); byPay[p].count++;
    });
    const payBreak = Object.entries(byPay).sort((a, b) => b[1].total - a[1].total);

    const fuelRecs = filtered.filter(e => e.expenseType === 'fuel' && toNum(e.kmPerLitre) > 0);
    const avgKmL = fuelRecs.length > 0 ? fuelRecs.reduce((s, e) => s + toNum(e.kmPerLitre), 0) / fuelRecs.length : 0;

    return { total, count, typeBreak, vehicleBreak, payBreak, avgKmL };
  }, [filtered]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = useMemo(() => filtered.slice((page - 1) * perPage, page * perPage), [filtered, page]);
  useEffect(() => { setPage(1); }, [dateFilter, typeFilter, vehicleFilter, searchTerm, sortBy]);

  const clearFilters = () => { setSearchTerm(''); setTypeFilter('all'); setVehicleFilter('all'); setDateFilter('thisMonth'); setSortBy('newest'); setPage(1); };

  // CATEGORY CRUD
  const handleAddCategory = async () => {
    if (!newCatName.trim() || !user) return;
    try {
      await addDoc(collection(db, 'vehicleExpenseCategories'), { uid: user.uid, name: newCatName.trim(), key: newCatName.trim().toLowerCase().replace(/\s+/g, '_'), icon: 'ðŸ“‹', color: '#64748b', createdAt: serverTimestamp() });
      setNewCatName(''); showToast('âœ… à·€à¶»à·Šà¶œà¶º à¶‘à¶šà·Š à·€à·’à¶º!');
    } catch (e) { showToast(`âŒ ${e.message}`); }
  };

  const handleDeleteCategory = async id => {
    if (!window.confirm('à¶¸à·™à¶¸ à·€à¶»à·Šà¶œà¶º à¶¸à¶šà¶±à·Šà¶±à¶¯?')) return;
    try { await deleteDoc(doc(db, 'vehicleExpenseCategories', id)); showToast('âœ… à·€à¶»à·Šà¶œà¶º à¶¸à¶šà· à¶¯à·à¶¸à·’à¶«à·’!'); } catch (e) { showToast(`âŒ ${e.message}`); }
  };

  // RECEIPT
  const handleReceipt = async e => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 5 * 1024 * 1024) { showToast('âš ï¸ 5MB à¶§ à·€à¶©à· à·€à·’à·à·à¶½à¶ºà·’'); return; }
    const c = await compressImage(f); if (c) setField('receipt', c); else showToast('âŒ à¶´à·’à¶±à·Šà¶­à·–à¶»à¶º process à¶šà·… à¶±à·œà·„à·à¶š');
    if (fileRef.current) fileRef.current.value = '';
  };

  // SUPPLIER
  const openSupplierPicker = () => { setSupplierSearch(''); setShowNewSupplier(false); setNewSupplier({ name: '', companyName: '', phone: '' }); setShowSupplierModal(true); };
  const handleSelectSupplier = sup => { setForm(p => ({ ...p, expenseBy: sup?.name || '', expenseBySupplierId: sup?.id || '' })); setShowSupplierModal(false); };
  const handleClearSupplier = () => setForm(p => ({ ...p, expenseBy: '', expenseBySupplierId: '' }));

  const handleCreateSupplier = async () => {
    if (!user) return;
    if (!newSupplier.name.trim()) { showToast('âš ï¸ à·ƒà·à¶´à¶ºà·”à¶¸à·Šà¶šà¶»à·” à¶±à¶¸ à¶…à·€à·à·Šâ€à¶ºà¶ºà·’'); return; }
    setCreatingSupplier(true);
    try {
      const payload = { uid: user.uid, name: newSupplier.name.trim(), companyName: newSupplier.companyName.trim(), phone: newSupplier.phone.trim(), email: '', city: '', address: '', openingBalance: 0, balance: 0, currentBalance: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      const ref = await addDoc(collection(db, 'suppliers'), payload);
      setForm(p => ({ ...p, expenseBy: payload.name, expenseBySupplierId: ref.id }));
      setShowSupplierModal(false); setShowNewSupplier(false); setNewSupplier({ name: '', companyName: '', phone: '' });
      showToast('âœ… à·ƒà·à¶´à¶ºà·”à¶¸à·Šà¶šà¶»à·” à¶‘à¶šà·Š à·€à·’à¶º!');
    } catch (e) { showToast(`âŒ ${e.message}`); } finally { setCreatingSupplier(false); }
  };

  // EXPENSE ITEMS
  const addItemRow = () => setForm(p => ({ ...p, expenseItems: [...(p.expenseItems || []), { itemId: '', itemName: '', qty: '1', unitPrice: '', unit: '', itemImage: '' }] }));
  const removeItemRow = i => setForm(p => ({ ...p, expenseItems: (p.expenseItems || []).filter((_, j) => j !== i) }));
  const updateItemRow = (i, patch) => setForm(p => ({ ...p, expenseItems: (p.expenseItems || []).map((r, j) => j === i ? { ...r, ...patch } : r) }));

  const handleSelectInventoryItem = (idx, item) => {
    if (!item) { updateItemRow(idx, { itemId: '', itemName: '', unit: '', itemImage: '' }); return; }
    const img = getItemImageUrl(item);
    updateItemRow(idx, { itemId: item.id, itemName: item.name || '', unitPrice: toNum(item.buyingPrice) > 0 ? String(item.buyingPrice) : '', unit: item.uomName || '', itemImage: img || '' });
  };

  // RESET
  const resetForm = () => { setForm({ ...INIT_FORM, expenseDate: todayStr(), expenseTime: nowHHMM(), installedDate: todayStr() }); setEditingId(null); setShowForm(false); };

  // EDIT
  const handleEdit = exp => {
    setForm({
      ...INIT_FORM,
      ...exp,
      expenseDate: toDateStr(exp.expenseDate) || todayStr(),
      expenseTime: exp.expenseTime || nowHHMM(),
      installedDate: toDateStr(exp.installedDate) || todayStr(),
      amount: exp.amount !== undefined ? String(exp.amount) : '',
      fuelLitres: exp.fuelLitres !== undefined ? String(exp.fuelLitres) : '',
      pricePerLitre: exp.pricePerLitre !== undefined ? String(exp.pricePerLitre) : '',
      kmBefore: exp.kmBefore !== undefined ? String(exp.kmBefore) : '',
      kmAfter: exp.kmAfter !== undefined ? String(exp.kmAfter) : '',
      installedKm: exp.installedKm !== undefined ? String(exp.installedKm) : '',
      currentKm: exp.currentKm !== undefined ? String(exp.currentKm) : '',
      expectedLifeKm: exp.expectedLifeKm !== undefined ? String(exp.expectedLifeKm) : '',
      tyreQty: exp.tyreQty !== undefined ? String(exp.tyreQty) : '1',
      serviceKm: exp.serviceKm !== undefined ? String(exp.serviceKm) : '',
      nextServiceKm: exp.nextServiceKm !== undefined ? String(exp.nextServiceKm) : '',
      expenseItems: Array.isArray(exp.expenseItems) ? exp.expenseItems.map(r => ({
        itemId: r.itemId || '', itemName: r.itemName || '', qty: String(r.qty ?? 1), unitPrice: String(r.unitPrice ?? ''), unit: r.unit || '', itemImage: r.itemImage || ''
      })) : [],
    });
    setEditingId(exp.id); setShowForm(true);
  };

  // SAVE
  const handleSave = async () => {
    if (!user?.uid) return;
    if (!form.vehicleId) return showToast('âŒ à·€à·à·„à¶±à¶º à¶­à·à¶»à¶±à·Šà¶±');

    const meta = getExpMeta(form.expenseType);
    let amount = hasItems ? itemsTotal : toNum(form.amount);
    if (form.expenseType === 'fuel' && amount <= 0) amount = fs.autoAmt;
    if (amount <= 0) return showToast('âŒ à¶¸à·”à¶¯à¶½ à¶‡à¶­à·”à·…à¶­à·Š à¶šà¶»à¶±à·Šà¶±');
    if (needsBank && !form.bankAccountId) return showToast('âŒ à¶¶à·à¶‚à¶šà·” à¶œà·’à¶«à·”à¶¸ à¶­à·à¶»à¶±à·Šà¶±');

    setSaving(true);
    try {
      const selectedVehicle = vehicles.find(v => v.id === form.vehicleId);
      const dateStr = typeof form.expenseDate === 'string' ? form.expenseDate : todayStr();
      const timeStr = form.expenseTime || '12:00';
      const txTs = Timestamp.fromDate(new Date(`${dateStr}T${timeStr}:00`));

      const payload = {
        ...form,
        expenseDate: dateStr,
        expenseTime: timeStr,
        installedDate: typeof form.installedDate === 'string' ? form.installedDate : todayStr(),
        amount, uid: user.uid,
        vehicleNo: selectedVehicle?.vehicleNo || '',
        vehicleType: selectedVehicle?.vehicleType || '',
        expenseTypeLabel: meta.label,
        kmDriven:   form.expenseType === 'fuel' ? fs.kmDriven   : 0,
        kmPerLitre: form.expenseType === 'fuel' ? fs.kmPerLitre : 0,
        kmUsed:      form.expenseType === 'tyre' ? ts.kmUsed      : 0,
        daysUsed:    form.expenseType === 'tyre' ? ts.daysUsed    : 0,
        remainingKm: form.expenseType === 'tyre' ? ts.remainingKm : 0,
        serviceRemainingKm: form.expenseType === 'service' ? Math.max(0, toNum(form.nextServiceKm) - toNum(form.currentKm)) : 0,
        expenseItems: normalizedItems,
        expenseItemsCount: normalizedItems.length,
        amountSource: normalizedItems.length ? 'items' : 'manual',
        timestamp: txTs, createdAt: editingId ? form.createdAt : serverTimestamp(),
        updatedAt: editingId ? serverTimestamp() : null,
      };

      Object.keys(payload).forEach(k => { if (payload[k] === undefined || payload[k] === null) delete payload[k]; });

      let expenseRef;
      if (editingId) {
        delete payload.createdAt;
        payload.updatedAt = serverTimestamp();
        await updateDoc(doc(db, `users/${user.uid}/vehicleExpenses`, editingId), payload);
        expenseRef = { id: editingId };
        showToast('âœ… à¶ºà·à·€à¶­à·Šà¶šà·à¶½à·“à¶± à·€à·’à¶º!');
      } else {
        payload.createdAt = serverTimestamp();
        expenseRef = await addDoc(collection(db, `users/${user.uid}/vehicleExpenses`), payload);
        showToast('âœ… à·ƒà·”à¶»à¶šà·’à¶± à¶½à¶¯à·“!');
      }

      if (!editingId && form.paymentMethod === 'cash') {
        await addDoc(collection(db, `users/${user.uid}/cashTransactions`), {
          type: 'out', source: 'vehicleExpense',
          category: form.expenseType === 'fuel' ? 'vehicleFuel' : form.expenseType === 'tyre' ? 'vehicleTyre' : form.expenseType === 'service' ? 'vehicleService' : 'vehicleOther',
          amount, expenseId: expenseRef.id, expenseType: form.expenseType,
          vehicleId: form.vehicleId, vehicleNo: selectedVehicle?.vehicleNo || '',
          paymentMethod: 'cash',
          description: form.description || `${meta.icon} ${meta.label} - ${selectedVehicle?.vehicleNo || ''}`,
          date: dateStr, time: timeStr, timestamp: txTs,
          createdAt: serverTimestamp(), uid: user.uid,
          expenseBy: form.expenseBy || '', expenseBySupplierId: form.expenseBySupplierId || '',
          expenseItems: normalizedItems,
        });
      }

      if (!editingId && form.paymentMethod === 'bank' && form.bankAccountId) {
        const bankRef = doc(db, `users/${user.uid}/bankAccounts`, form.bankAccountId);
        await updateDoc(bankRef, { currentBalance: increment(-amount), liveBalance: increment(-amount), updatedAt: serverTimestamp() });
        await addDoc(collection(db, `users/${user.uid}/bankTransactions`), {
          type: 'expense', source: 'vehicleExpense', category: 'vehicleExpense',
          accountId: form.bankAccountId, amount,
          description: form.description || `${meta.icon} ${meta.label} - ${selectedVehicle?.vehicleNo || ''}`,
          reference: `VEXP-${expenseRef.id.slice(-6).toUpperCase()}`,
          date: txTs, createdAt: serverTimestamp(),
        });
      }

      resetForm();
    } catch (err) { console.error(err); showToast(`âŒ ${err.message}`); }
    setSaving(false);
  };

  // DELETE
  const handleDelete = async id => {
    if (!window.confirm('à¶¸à·™à¶¸ à·€à·’à¶ºà¶¯à¶¸ à¶¸à¶šà· à¶¯à·à¶¸à·“à¶¸à¶§ à¶…à·€à·à·Šâ€à¶ºà¶¯?')) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/vehicleExpenses`, id));
      try {
        const q = query(collection(db, `users/${user.uid}/cashTransactions`), where('expenseId', '==', id), where('source', '==', 'vehicleExpense'));
        const snap = await getDocs(q);
        await Promise.all(snap.docs.map(d => deleteDoc(doc(db, `users/${user.uid}/cashTransactions`, d.id))));
      } catch {}
      if (expandedId === id) setExpandedId(null);
      showToast('âœ… à¶¸à¶šà· à¶¯à¶¸à¶± à¶½à¶¯à·“!');
    } catch (e) { showToast(`âŒ ${e.message}`); }
  };

  // DUPLICATE
  const handleDuplicate = async exp => {
    try {
      const meta = getExpMeta(exp.expenseType);
      const dateStr = todayStr(), timeStr = nowHHMM();
      const txTs = Timestamp.fromDate(new Date(`${dateStr}T${timeStr}:00`));
      const data = {
        ...exp, expenseDate: dateStr, expenseTime: timeStr,
        receipt: null, reference: '', timestamp: txTs,
        createdAt: serverTimestamp(), updatedAt: null,
      };
      delete data.id;
      const ref = await addDoc(collection(db, `users/${user.uid}/vehicleExpenses`), data);

      if (exp.paymentMethod === 'cash') {
        await addDoc(collection(db, `users/${user.uid}/cashTransactions`), {
          type: 'out', source: 'vehicleExpense',
          category: exp.expenseType === 'fuel' ? 'vehicleFuel' : 'vehicleOther',
          amount: toNum(exp.amount), expenseId: ref.id,
          vehicleId: exp.vehicleId, vehicleNo: exp.vehicleNo || '',
          paymentMethod: 'cash',
          description: `${meta.icon} ${meta.label} - ${exp.vehicleNo || ''}`,
          date: dateStr, time: timeStr, timestamp: txTs,
          createdAt: serverTimestamp(), uid: user.uid,
        });
      }
      showToast('âœ… à¶…à¶±à·”à¶´à·’à¶§à¶´à¶­à·Š à·€à·’à¶º!');
    } catch (e) { showToast(`âŒ ${e.message}`); }
  };

  // EXPORT
  const exportCSV = () => {
    const hdr = ['Date', 'Time', 'Vehicle', 'Type', 'Amount', 'Description', 'Payment', 'Supplier', 'Notes'];
    const rows = filtered.map(e => [
      toDateStr(e.expenseDate) || '', e.expenseTime || '',
      e.vehicleNo || '', e.expenseType || '', e.amount || 0,
      (e.description || '').replace(/,/g, ';'), e.paymentMethod || '',
      e.expenseBy || '', (e.notes || '').replace(/,/g, ';'),
    ]);
    const csv = [hdr, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `vehicle_expenses_${todayStr()}.csv`; a.click();
  };

  const handlePrint = () => {
    const el = printRef.current; if (!el) return;
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(`<html><head><title>ðŸš› à·€à·à·„à¶± à·€à·’à¶ºà¶¯à¶¸à·Š</title><style>body{font-family:Arial;padding:20px;font-size:12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px}th{background:#f0f0f0}h1{font-size:18px}.total{font-size:16px;font-weight:bold;margin:10px 0}</style></head><body><h1>ðŸš› à·€à·à·„à¶± à·€à·’à¶ºà¶¯à¶¸à·Š</h1><div class="total">à¶¸à·”à·…à·”: Rs.${fmtC(stats.total)} (${stats.count})</div>${el.innerHTML}</body></html>`);
    w.document.close(); w.onafterprint = () => w.close();
    setTimeout(() => { w.focus(); w.print(); }, 500);
  };

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '40vh' }}>
      <div style={{ width: 44, height: 44, border: '4px solid #e2e8f0', borderTopColor: '#ef4444', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <p style={{ color: '#64748b', marginTop: 12 }}>à¶´à·–à¶»à¶«à¶º à·€à·™à¶¸à·’à¶±à·Š...</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 8px 80px', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif', background: '#f8fafc', minHeight: '100vh' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@media print{.noPrint{display:none!important}}`}</style>
      {toast && <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', background: '#1e293b', color: '#fff', padding: '12px 24px', borderRadius: 10, zIndex: 9999, fontSize: 15, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,.2)' }}>{toast}</div>}

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid #e2e8f0' }} className="noPrint">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 30 }}>ðŸš›</span>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1e293b' }}>à·€à·à·„à¶± à·€à·’à¶ºà¶¯à¶¸à·Š à¶šà·…à¶¸à¶±à·à¶šà¶»à¶«à¶º</h1>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>à¶¸à·”à·…à·”: Rs.{fmtC(stats.total)} ({stats.count})</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
            {[['list', 'ðŸ“„', 'à¶½à·à¶ºà·’à·ƒà·Šà¶­à·”à·€'], ['analytics', 'ðŸ“Š', 'à·€à·’à·à·Šà¶½à·šà·‚à¶«']].map(([k, ico, lb]) => (
              <button key={k} onClick={() => setMainTab(k)} style={{ padding: '8px 16px', border: 'none', borderRadius: 8, background: mainTab === k ? 'white' : 'transparent', color: mainTab === k ? '#1e293b' : '#64748b', fontWeight: mainTab === k ? 600 : 500, fontSize: 13, cursor: 'pointer', boxShadow: mainTab === k ? '0 1px 3px rgba(0,0,0,.1)' : 'none' }}>{ico} {lb}</button>
            ))}
          </div>
          <button onClick={() => setShowCategoryModal(true)} style={{ width: 38, height: 38, borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>âš™ï¸</button>
          <button onClick={() => { setForm({ ...INIT_FORM, expenseDate: todayStr(), expenseTime: nowHHMM(), installedDate: todayStr() }); setEditingId(null); setShowForm(true); }} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#dc2626,#ef4444)', color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>âž• à·€à·’à¶ºà¶¯à¶¸à¶šà·Š</button>
        </div>
      </div>

      {/* STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10, marginBottom: 14 }} className="noPrint">
        <div style={{ padding: 16, borderRadius: 14, background: 'linear-gradient(135deg,#dc2626,#ef4444)', color: 'white' }}>
          <div style={{ fontSize: 11, opacity: .8 }}>ðŸ’¸ à¶¸à·”à·…à·” à·€à·’à¶ºà¶¯à¶¸à·Š</div>
          <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>Rs.{fmtC(stats.total)}</div>
          <div style={{ fontSize: 11, opacity: .7, marginTop: 2 }}>{stats.count} à¶‡à¶­à·”à·…à¶­à·Š à¶šà·’à¶»à·“à¶¸à·Š</div>
        </div>
        {stats.avgKmL > 0 && (
          <div style={{ padding: 16, borderRadius: 14, background: 'linear-gradient(135deg,#ea580c,#f97316)', color: 'white' }}>
            <div style={{ fontSize: 11, opacity: .8 }}>â›½ à·ƒà·à¶¸à·à¶±à·Šâ€à¶º KM/L</div>
            <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{fmtQ(stats.avgKmL)}</div>
            <div style={{ fontSize: 11, opacity: .7, marginTop: 2 }}>Fuel efficiency</div>
          </div>
        )}
        {Object.entries(EXP_TYPES).slice(0, 3).map(([k, m]) => {
          const typeTotal = filtered.filter(e => e.expenseType === k).reduce((s, e) => s + toNum(e.amount), 0);
          if (typeTotal <= 0) return null;
          return (
            <div key={k} style={{ padding: 16, borderRadius: 14, background: m.bg, border: `2px solid ${m.border}` }}>
              <div style={{ fontSize: 11, color: m.color, fontWeight: 700 }}>{m.icon} {m.label}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: m.color, marginTop: 4 }}>Rs.{fmtC(typeTotal)}</div>
            </div>
          );
        })}
      </div>

      {/* FILTERS */}
      {mainTab === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }} className="noPrint">
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {['today', 'thisWeek', 'thisMonth', 'lastMonth', 'thisYear', 'allTime'].map(f => (
              <button key={f} onClick={() => { setDateFilter(f); setPage(1); }} style={{ padding: '7px 14px', borderRadius: 20, border: dateFilter === f ? '1px solid #3b82f6' : '1px solid #e2e8f0', background: dateFilter === f ? '#eff6ff' : 'white', color: dateFilter === f ? '#2563eb' : '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {{ today: 'à¶…à¶¯', thisWeek: 'à·ƒà¶­à·’à¶º', thisMonth: 'à¶¸à·à·ƒà¶º', lastMonth: 'à¶´à·ƒà·” à¶¸à·à·ƒà¶º', thisYear: 'à¶¸à·š à·€à·ƒà¶»', allTime: 'à·ƒà¶¸à·ƒà·Šà¶­' }[f]}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '10px 14px', background: 'white', borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ position: 'relative', flex: 2, minWidth: 160 }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none' }}>ðŸ”</span>
              <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="à·ƒà·œà¶ºà¶±à·Šà¶±..." style={{ width: '100%', padding: '9px 30px 9px 34px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#f8fafc' }} />
              {searchTerm && <button onClick={() => setSearchTerm('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#94a3b8' }}>âœ•</button>}
            </div>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={ST.sel}>
              <option value="all">ðŸ“Œ à·ƒà·’à¶ºà¶½à·”à¶¸ à·€à¶»à·Šà¶œ</option>
              {Object.entries(EXP_TYPES).map(([k, m]) => <option key={k} value={k}>{m.icon} {m.label.split('/')[0].trim()}</option>)}
            </select>
            <select value={vehicleFilter} onChange={e => setVehicleFilter(e.target.value)} style={ST.sel}>
              <option value="all">ðŸš› à·ƒà·’à¶ºà¶½à·”à¶¸</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.vehicleNo}</option>)}
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={ST.sel}>
              <option value="newest">â¬‡ï¸ à¶…à¶½à·”à¶­à·Šà¶¸</option>
              <option value="oldest">â¬†ï¸ à¶´à·à¶»à¶«à·’à¶¸</option>
              <option value="highest">ðŸ’° à·€à·à¶©à·’à¶¸</option>
              <option value="lowest">ðŸ’² à¶…à¶©à·”à¶¸</option>
            </select>
            <button onClick={clearFilters} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f8fafc', color: '#64748b', fontSize: 14, cursor: 'pointer' }}>ðŸ”„</button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>ðŸ“‹ {filtered.length} à¶‡à¶­à·”à·…à¶­à·Š à¶šà·’à¶»à·“à¶¸à·Š â€¢ Rs.{fmtC(stats.total)}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={exportCSV} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #16a34a', background: '#f0fdf4', color: '#166534', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>ðŸ“¥ CSV</button>
              <button onClick={handlePrint} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #6366f1', background: '#eef2ff', color: '#4338ca', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>ðŸ–¨ï¸ Print</button>
            </div>
          </div>
        </div>
      )}

      {/* ANALYTICS TAB */}
      {mainTab === 'analytics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {stats.typeBreak.length > 0 && (
            <div style={ST.card}>
              <h3 style={ST.cardH}>ðŸ“Š à·€à¶»à·Šà¶œ à¶…à¶±à·”à·€</h3>
              {stats.typeBreak.map(([type, data]) => {
                const m = getExpMeta(type);
                const pct = stats.total > 0 ? (data.total / stats.total * 100) : 0;
                return (
                  <div key={type} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{m.icon} {m.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: m.color }}>Rs.{fmtC(data.total)} <span style={{ fontSize: 11, color: '#94a3b8' }}>({data.count})</span></span>
                    </div>
                    <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: m.color, borderRadius: 6 }} /></div>
                  </div>
                );
              })}
            </div>
          )}

          {stats.vehicleBreak.length > 0 && (
            <div style={ST.card}>
              <h3 style={ST.cardH}>ðŸš› à·€à·à·„à¶± à¶…à¶±à·”à·€</h3>
              {stats.vehicleBreak.map(([v, data]) => {
                const pct = stats.total > 0 ? (data.total / stats.total * 100) : 0;
                return (
                  <div key={v} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>ðŸš› {v}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1e40af' }}>Rs.{fmtC(data.total)}</span>
                    </div>
                    <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: '#3b82f6', borderRadius: 6 }} /></div>
                  </div>
                );
              })}
            </div>
          )}

          {stats.payBreak.length > 0 && (
            <div style={ST.card}>
              <h3 style={ST.cardH}>ðŸ’³ à¶œà·™à·€à·“à¶¸à·Š à¶…à¶±à·”à·€</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10 }}>
                {stats.payBreak.map(([pay, data]) => {
                  const pm = PAY_METHODS.find(p => p.value === pay) || { icon: 'ðŸ’µ', en: pay };
                  return (
                    <div key={pay} style={{ padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                      <div style={{ fontSize: 24 }}>{pm.icon}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{pm.en}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>Rs.{fmtC(data.total)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* LIST TAB */}
      {mainTab === 'list' && (
        <div ref={printRef}>
          {!filtered.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', background: 'white', borderRadius: 14, border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: 56 }}>ðŸš›</span>
              <p style={{ color: '#94a3b8', marginTop: 12 }}>à·€à·à·„à¶± à·€à·’à¶ºà¶¯à¶¸à·Š à¶±à·œà¶¸à·à¶­</p>
              <button onClick={clearFilters} style={{ marginTop: 16, padding: '10px 20px', borderRadius: 8, border: '1px solid #3b82f6', background: '#eff6ff', color: '#2563eb', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>à¶´à·™à¶»à·„à¶±à·Š à¶‰à·€à¶­à·Š</button>
            </div>
          ) : (
            <>
              {paged.map(exp => {
                const m = getExpMeta(exp.expenseType);
                const isExpanded = expandedId === exp.id;
                const displayDate = toDateStr(exp.expenseDate) || '-';
                const pmInfo = PAY_METHODS.find(p => p.value === exp.paymentMethod);
                const itemCount = Array.isArray(exp.expenseItems) ? exp.expenseItems.length : 0;

                return (
                  <div key={exp.id} style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', borderLeft: `5px solid ${m.color}`, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : exp.id)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0, background: `${m.color}18`, color: m.color }}>{m.icon}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{String(m.label)}</div>
                          {exp.description && <div style={{ fontSize: 13, color: '#64748b', marginTop: 1 }}>{String(exp.description)}</div>}
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#f0fdf4', color: '#166534', fontWeight: 500 }}>ðŸ“… {displayDate}</span>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#f1f5f9', color: '#475569' }}>{pmInfo?.icon || 'ðŸ’µ'} {pmInfo?.en || 'Cash'}</span>
                            <span style={{ fontSize: 12, color: '#475569', fontWeight: 700 }}>ðŸš› {String(exp.vehicleNo || '-')}</span>
                            {exp.expenseBy && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#ecfeff', color: '#155e75', border: '1px solid #a5f3fc' }}>ðŸ‘¤ {String(exp.expenseBy)}</span>}
                            {itemCount > 0 && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe' }}>ðŸ“¦ {itemCount}</span>}
                            {exp.receipt && <span style={{ fontSize: 12, color: '#16a34a' }}>ðŸ“·</span>}
                            {exp.expenseType === 'fuel' && toNum(exp.kmPerLitre) > 0 && (
                              <span style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', background: '#f0fdf4', padding: '2px 8px', borderRadius: 6 }}>ðŸ† {fmtQ(exp.kmPerLitre)} KM/L</span>
                            )}
                            {exp.expenseType === 'tyre' && toNum(exp.kmUsed) > 0 && (
                              <span style={{ fontSize: 11, fontWeight: 800, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: 6 }}>ðŸ“ {fmtQ(exp.kmUsed)} KM</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 900, fontSize: 20, color: '#dc2626' }}>Rs.{fmtC(exp.amount)}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{isExpanded ? 'ðŸ”¼' : 'ðŸ”½'}</div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ padding: '12px 16px', background: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
                        {exp.notes && <div style={{ display: 'flex', gap: 8, fontSize: 13, color: '#334155', marginBottom: 6 }}><span style={{ fontWeight: 600, color: '#64748b' }}>ðŸ“ à·ƒà¶§à·„à¶±à·Š:</span><span>{String(exp.notes)}</span></div>}
                        {exp.reference && <div style={{ display: 'flex', gap: 8, fontSize: 13, color: '#334155', marginBottom: 6 }}><span style={{ fontWeight: 600, color: '#64748b' }}>ðŸ”– à¶ºà·œà¶¸à·”:</span><span>{String(exp.reference)}</span></div>}

                        {exp.expenseType === 'fuel' && (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 10 }}>
                            {[
                              { l: 'â›½ Litres', v: `${fmtQ(exp.fuelLitres)} L`, c: '#ea580c' },
                              { l: 'ðŸ“ KM', v: `${fmtQ(exp.kmDriven)} KM`, c: '#2563eb' },
                              { l: 'ðŸ† KM/L', v: fmtQ(exp.kmPerLitre), c: '#16a34a' },
                              { l: 'ðŸ’° /KM', v: toNum(exp.kmDriven) > 0 ? `Rs.${fmtC(toNum(exp.amount) / toNum(exp.kmDriven))}` : '-', c: '#7c3aed' },
                            ].map(card => (
                              <div key={card.l} style={{ background: 'white', padding: '10px 12px', borderRadius: 10, textAlign: 'center', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>{card.l}</div>
                                <div style={{ fontSize: 15, fontWeight: 900, color: card.c, marginTop: 4 }}>{card.v}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {exp.expenseType === 'tyre' && (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 10 }}>
                            {[
                              { l: 'ðŸ›ž Position', v: String(exp.tyrePosition || '-'), c: '#2563eb' },
                              { l: 'ðŸ“ Used KM', v: `${fmtQ(exp.kmUsed)} KM`, c: '#2563eb' },
                              { l: 'ðŸ“… Days', v: String(toNum(exp.daysUsed)), c: '#16a34a' },
                              { l: 'ðŸŽ¯ à¶‰à¶­à·’à¶»à·’', v: toNum(exp.expectedLifeKm) > 0 ? `${fmtQ(exp.remainingKm)} KM` : '-', c: toNum(exp.remainingKm) <= 5000 ? '#dc2626' : '#7c3aed' },
                            ].map(card => (
                              <div key={card.l} style={{ background: 'white', padding: '10px 12px', borderRadius: 10, textAlign: 'center', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>{card.l}</div>
                                <div style={{ fontSize: 14, fontWeight: 900, color: card.c, marginTop: 4 }}>{card.v}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {exp.expenseType === 'service' && (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 10 }}>
                            {[
                              { l: 'ðŸ”§ Service KM', v: fmtQ(exp.serviceKm), c: '#7c3aed' },
                              { l: 'âž¡ï¸ Next KM', v: fmtQ(exp.nextServiceKm), c: '#2563eb' },
                              { l: 'ðŸ“ à¶‰à¶­à·’à¶»à·’', v: toNum(exp.nextServiceKm) > 0 && toNum(exp.currentKm) > 0 ? fmtQ(toNum(exp.nextServiceKm) - toNum(exp.currentKm)) : '-', c: '#16a34a' },
                            ].map(card => (
                              <div key={card.l} style={{ background: 'white', padding: '10px 12px', borderRadius: 10, textAlign: 'center', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>{card.l}</div>
                                <div style={{ fontSize: 15, fontWeight: 900, color: card.c, marginTop: 4 }}>{card.v}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {itemCount > 0 && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontWeight: 600, color: '#64748b', marginBottom: 8 }}>ðŸ“¦ à·€à·’à¶ºà¶¯à¶¸à·Š à¶·à·à¶«à·Šà¶©</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {exp.expenseItems.map((row, idx) => {
                                const rowImg = row.itemImage || getItemImageUrl(inventoryItems.find(i => i.id === row.itemId)) || null;
                                return (
                                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'white', border: '1px solid #e2e8f0' }}>
                                    <img src={rowImg || PLACEHOLDER_IMG} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', border: '1px solid #e2e8f0' }} onError={e => { e.target.src = PLACEHOLDER_IMG; }} />
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontWeight: 600, fontSize: 13 }}>{String(row.itemName || '')}{row.unit ? <small style={{ color: '#64748b', marginLeft: 6 }}>({String(row.unit)})</small> : null}</div>
                                      <div style={{ fontSize: 12, color: '#64748b' }}>{toNum(row.qty || 1)} Ã— Rs.{fmtC(row.unitPrice)}</div>
                                    </div>
                                    <div style={{ fontWeight: 800, fontSize: 14 }}>Rs.{fmtC(row.lineTotal || toNum(row.qty || 1) * toNum(row.unitPrice))}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                          {exp.receipt && <button onClick={() => setViewReceipt(exp.receipt)} style={{ padding: '6px 12px', fontSize: 12, background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>ðŸ“· à¶»à·’à·ƒà·’à¶§à·Šà¶´à¶­</button>}
                          <button onClick={() => handleEdit(exp)} style={{ padding: '6px 12px', fontSize: 12, background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>âœï¸ à·ƒà¶‚à·ƒà·Šà¶šà¶»à¶«à¶º</button>
                          <button onClick={() => handleDuplicate(exp)} style={{ padding: '6px 12px', fontSize: 12, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>ðŸ“‹ à¶…à¶±à·”à¶´à·’à¶§à¶´à¶­à·Š</button>
                          <button onClick={() => handleDelete(exp.id)} style={{ padding: '6px 12px', fontSize: 12, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>ðŸ—‘ï¸ à¶¸à¶šà¶±à·Šà¶±</button>
                        </div>
                      </div>
                    )}

                    {!isExpanded && (
                      <div style={{ display: 'flex', gap: 4, padding: '6px 16px 10px', justifyContent: 'flex-end' }} className="noPrint">
                        <button onClick={e => { e.stopPropagation(); handleEdit(exp); }} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 12 }}>âœï¸</button>
                        <button onClick={e => { e.stopPropagation(); handleDuplicate(exp); }} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 12 }}>ðŸ“‹</button>
                        <button onClick={e => { e.stopPropagation(); handleDelete(exp.id); }} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fef2f2', cursor: 'pointer', fontSize: 12 }}>ðŸ—‘ï¸</button>
                      </div>
                    )}
                  </div>
                );
              })}

              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, padding: '12px 16px', background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', marginTop: 8 }} className="noPrint">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: page === 1 ? .4 : 1 }}>â—€ à¶´à·™à¶»</button>
                  <span style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>{page}/{totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: page === totalPages ? .4 : 1 }}>à¶Šà·…à¶Ÿ â–¶</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* FORM MODAL */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 18, width: '100%', maxWidth: 760, maxHeight: '94vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 22px', background: 'linear-gradient(135deg,#dc2626,#ef4444)', color: 'white' }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>{editingId ? 'âœï¸ à·€à·’à¶ºà¶¯à¶¸ à·ƒà¶‚à·ƒà·Šà¶šà¶»à¶«à¶º' : 'âž• à¶±à·€ à·€à·’à¶ºà¶¯à¶¸à¶šà·Š'}</h3>
              <button onClick={resetForm} style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,.2)', border: 'none', fontSize: 18, cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>âœ•</button>
            </div>
            <div style={{ padding: 22, overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={ST.formLabel}>ðŸš› à·€à·à·„à¶±à¶º *</label>
                  <select value={form.vehicleId} onChange={e => setField('vehicleId', e.target.value)} style={ST.sel}>
                    <option value="">-- à¶­à·à¶»à¶±à·Šà¶± --</option>
                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.vehicleNo}</option>)}
                  </select>
                </div>
                <div><label style={ST.formLabel}>ðŸ“… à¶¯à·’à¶±à¶º</label><input type="date" value={form.expenseDate} onChange={e => setField('expenseDate', e.target.value)} style={ST.inp} /></div>
                <div><label style={ST.formLabel}>ðŸ• à·€à·šà¶½à·à·€</label><input type="time" value={form.expenseTime} onChange={e => setField('expenseTime', e.target.value)} style={ST.inp} /></div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={ST.formLabel}>ðŸ“Œ à·€à·’à¶ºà¶¯à¶¸à·Š à·€à¶»à·Šà¶œà¶º *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6 }}>
                  {Object.entries(EXP_TYPES).map(([k, m]) => (
                    <button key={k} type="button" onClick={() => setField('expenseType', k)} style={{ padding: '10px 6px', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 11, textAlign: 'center', border: form.expenseType === k ? `2px solid ${m.color}` : '1px solid #e2e8f0', background: form.expenseType === k ? `${m.color}12` : 'white', color: form.expenseType === k ? m.color : '#475569' }}>
                      <div style={{ fontSize: 22, marginBottom: 2 }}>{m.icon}</div>
                      <div style={{ lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label.split('/')[0].trim()}</div>
                    </button>
                  ))}
                </div>
              </div>

              {form.expenseType === 'fuel' && (
                <div style={{ background: '#fff7ed', border: '2px solid #fdba74', borderRadius: 14, padding: 16, marginBottom: 14 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#ea580c', marginBottom: 12 }}>â›½ Fuel Tracking</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                    {[['fuelLitres', 'à¶½à·“à¶§à¶»'], ['pricePerLitre', 'à¶½à·“à¶§à¶» à¶¸à·’à¶½'], ['kmBefore', 'KM Before'], ['kmAfter', 'KM After']].map(([field, label]) => (
                      <div key={field}>
                        <label style={ST.formLabelSm}>{label}</label>
                        <input type="number" step="0.01" value={form[field]} onChange={e => setField(field, e.target.value)} style={ST.inpSm} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                    {[
                      { l: 'ðŸ“ à¶¯à·à·€à·– à¶¯à·”à¶»', v: `${fmtQ(fs.kmDriven)} KM`, c: '#ea580c' },
                      { l: 'ðŸ† KM/L', v: fmtQ(fs.kmPerLitre), c: '#16a34a' },
                      { l: 'ðŸ’° Auto Total', v: `Rs.${fmtC(fs.autoAmt)}`, c: '#2563eb' },
                    ].map(x => (
                      <div key={x.l} style={{ background: 'white', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>{x.l}</div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: x.c, marginTop: 4 }}>{x.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {form.expenseType === 'tyre' && (
                <div style={{ background: '#eff6ff', border: '2px solid #93c5fd', borderRadius: 14, padding: 16, marginBottom: 14 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#2563eb', marginBottom: 12 }}>ðŸ›ž Tyre Tracking</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div><label style={ST.formLabelSm}>Brand</label><input value={form.tyreBrand} onChange={e => setField('tyreBrand', e.target.value)} style={ST.inpSm} /></div>
                    <div>
                      <label style={ST.formLabelSm}>Position</label>
                      <select value={form.tyrePosition} onChange={e => setField('tyrePosition', e.target.value)} style={{ ...ST.inpSm, cursor: 'pointer' }}>
                        <option>Front-Left</option><option>Front-Right</option><option>Rear-Left</option><option>Rear-Right</option><option>Spare</option><option>All</option>
                      </select>
                    </div>
                    <div><label style={ST.formLabelSm}>Installed Date</label><input type="date" value={form.installedDate} onChange={e => setField('installedDate', e.target.value)} style={ST.inpSm} /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                    {[['installedKm', 'Installed KM'], ['currentKm', 'Current KM'], ['expectedLifeKm', 'Expected Life KM']].map(([field, label]) => (
                      <div key={field}><label style={ST.formLabelSm}>{label}</label><input type="number" value={form[field]} onChange={e => setField(field, e.target.value)} style={ST.inpSm} /></div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                    {[
                      { l: 'ðŸ“ à¶¯à·à·€à·– KM', v: `${fmtQ(ts.kmUsed)} KM`, c: '#2563eb' },
                      { l: 'ðŸ“… à¶¯à·’à¶±', v: String(ts.daysUsed), c: '#16a34a' },
                      { l: 'ðŸŽ¯ à¶‰à¶­à·’à¶»à·’ KM', v: toNum(form.expectedLifeKm) > 0 ? fmtQ(ts.remainingKm) : '-', c: ts.remainingKm <= 5000 && toNum(form.expectedLifeKm) > 0 ? '#dc2626' : '#7c3aed' },
                    ].map(x => (
                      <div key={x.l} style={{ background: 'white', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>{x.l}</div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: x.c, marginTop: 4 }}>{x.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {form.expenseType === 'service' && (
                <div style={{ background: '#faf5ff', border: '2px solid #c4b5fd', borderRadius: 14, padding: 16, marginBottom: 14 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#7c3aed', marginBottom: 12 }}>ðŸ”§ Service Tracking</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                    {[['serviceKm', 'Service KM'], ['nextServiceKm', 'Next Service KM'], ['currentKm', 'Current KM']].map(([field, label]) => (
                      <div key={field}><label style={ST.formLabelSm}>{label}</label><input type="number" value={form[field]} onChange={e => setField(field, e.target.value)} style={ST.inpSm} /></div>
                    ))}
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={ST.formLabelSm}>Service Details</label>
                    <textarea value={form.serviceDetails} onChange={e => setField('serviceDetails', e.target.value)} rows={2} style={{ ...ST.inpSm, resize: 'vertical', fontFamily: 'inherit' }} />
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <label style={ST.formLabel}>ðŸ’° à¶¸à·”à¶¯à¶½ *</label>
                <input type="number" value={hasItems ? itemsTotal.toFixed(2) : form.amount} onChange={e => !hasItems && setField('amount', e.target.value)} style={{ width: '100%', padding: 16, borderRadius: 14, border: '2px solid #ef4444', fontSize: 28, fontWeight: 900, textAlign: 'center', boxSizing: 'border-box', color: '#dc2626', background: hasItems ? '#fef7ed' : '#fef2f2', outline: 'none', opacity: hasItems ? .85 : 1 }} placeholder={form.expenseType === 'fuel' ? `Auto: ${fmtC(fs.autoAmt)}` : '0.00'} readOnly={hasItems} />
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>{hasItems ? 'â„¹ï¸ à¶·à·à¶«à·Šà¶©à·€à¶½ à¶‘à¶šà¶­à·”à·€ à¶…à¶±à·”à·€ à¶¸à·”à¶¯à¶½ à·ƒà·Šà·€à¶ºà¶‚à¶šà·Šâ€à¶»à·“à¶ºà·€ à·ƒà·à¶šà·ƒà·š' : form.expenseType === 'fuel' && fs.autoAmt > 0 ? `â„¹ï¸ Auto: ${fmtQ(fs.litres)}L Ã— Rs.${fmtC(form.pricePerLitre)} = Rs.${fmtC(fs.autoAmt)}` : 'âœï¸ Manual Amount'}</div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={ST.formLabel}>ðŸ“ à·€à·’à·ƒà·Šà¶­à¶»à¶º</label>
                <input value={form.description} onChange={e => setField('description', e.target.value)} style={ST.inp} />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={ST.formLabel}>ðŸ’³ à¶œà·™à·€à·“à¶¸à·Š à¶šà·Šâ€à¶»à¶¸à¶º</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {PAY_METHODS.map(pm => (
                    <button key={pm.value} onClick={() => setForm(p => ({ ...p, paymentMethod: pm.value, bankAccountId: pm.needsBank ? p.bankAccountId : '' }))} style={{ flex: 1, padding: '10px 6px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12, minWidth: 70, border: form.paymentMethod === pm.value ? '2px solid #3b82f6' : '1px solid #e2e8f0', background: form.paymentMethod === pm.value ? '#eff6ff' : 'white', color: form.paymentMethod === pm.value ? '#3b82f6' : '#64748b' }}>{pm.label}</button>
                  ))}
                </div>
              </div>

              {needsBank && (
                <div style={{ marginBottom: 14, padding: 16, borderRadius: 12, background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', border: '2px solid #93c5fd' }}>
                  <label style={{ ...ST.formLabel, color: '#1e40af' }}>ðŸ¦ à¶¶à·à¶‚à¶šà·” à¶œà·’à¶«à·”à¶¸ *</label>
                  {!activeBanks.length ? (
                    <div style={{ padding: 14, borderRadius: 10, background: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e', fontSize: 13 }}>âš ï¸ à¶¶à·à¶‚à¶šà·” à¶œà·’à¶«à·”à¶¸à·Š à¶±à·œà¶¸à·à¶­.</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 8, marginTop: 8 }}>
                      {activeBanks.map(acc => {
                        const isSel = form.bankAccountId === acc.id;
                        return (
                          <button key={acc.id} onClick={() => setField('bankAccountId', acc.id)} style={{ padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', border: isSel ? '2px solid #2563eb' : '1px solid #cbd5e1', background: isSel ? 'linear-gradient(135deg,#2563eb,#3b82f6)' : 'white', color: isSel ? 'white' : '#1e293b' }}>
                            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>ðŸ¦ {String((acc.bankName || '').split('(')[0].trim())}</div>
                            <div style={{ fontSize: 12, opacity: isSel ? .9 : .7, marginBottom: 6 }}>{String(acc.accountName || '-')}</div>
                            <div style={{ fontSize: 16, fontWeight: 900 }}>Rs.{fmtC(toNum(acc.currentBalance))}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div><label style={ST.formLabelSm}>ðŸ”– à¶ºà·œà¶¸à·” à¶…à¶‚à¶šà¶º</label><input value={form.reference} onChange={e => setField('reference', e.target.value)} style={ST.inpSm} /></div>
                <div>
                  <label style={ST.formLabelSm}>ðŸ‘¤ Supplier</label>
                  <button type="button" onClick={openSupplierPicker} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                    <span style={{ color: form.expenseBy ? '#0f172a' : '#94a3b8', fontWeight: form.expenseBy ? 700 : 500 }}>{form.expenseBy || 'Supplier à¶­à·à¶»à¶±à·Šà¶±...'}</span>
                    <span style={{ color: '#64748b' }}>â–¼</span>
                  </button>
                  {form.expenseBy && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <span style={{ padding: '6px 10px', borderRadius: 999, background: '#ecfeff', color: '#155e75', border: '1px solid #a5f3fc', fontSize: 12, fontWeight: 700 }}>ðŸ‘¤ {String(form.expenseBy)}</span>
                      <button onClick={handleClearSupplier} style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>âœ•</button>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={ST.formLabelSm}>ðŸ“‹ à·ƒà¶§à·„à¶±à·Š</label>
                <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} rows={2} style={{ ...ST.inpSm, resize: 'vertical', fontFamily: 'inherit' }} />
              </div>

              <div style={{ marginBottom: 16, padding: 14, borderRadius: 12, background: '#fafafc', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
                  <label style={ST.formLabel}>ðŸ“¦ à·€à·’à¶ºà¶¯à¶¸à·Š à¶·à·à¶«à·Šà¶©</label>
                  <button onClick={addItemRow} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #22c55e', background: '#f0fdf4', color: '#166534', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>âž• à¶·à·à¶«à·Šà¶©à¶ºà¶šà·Š</button>
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>à¶·à·à¶«à·Šà¶© à¶‘à¶šà¶­à·” à¶šà·…à·œà¶­à·Š à¶¸à·”à·…à·” à¶¸à·”à¶¯à¶½ à·ƒà·Šà·€à¶ºà¶‚à¶šà·Šâ€à¶»à·“à¶ºà·€ à¶œà¶«à¶±à¶º à·€à·š.</div>

                {!(form.expenseItems || []).length ? (
                  <div style={{ padding: 18, borderRadius: 12, border: '1px dashed #cbd5e1', background: 'white', textAlign: 'center' }}>
                    <div style={{ fontSize: 28 }}>ðŸ“¦</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>à¶·à·à¶«à·Šà¶© à¶‘à¶šà¶­à·” à¶šà¶»à¶±à·Šà¶±</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(form.expenseItems || []).map((row, idx) => {
                      const rowImg = row.itemImage || null;
                      return (
                        <div key={idx} style={{ padding: 12, borderRadius: 12, background: 'white', border: '1px solid #e2e8f0' }}>
                          {rowImg && <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><img src={rowImg} alt="" style={{ width: 80, height: 60, borderRadius: 10, objectFit: 'cover', border: '2px solid #e2e8f0' }} onError={e => { e.target.style.display = 'none'; }} /></div>}
                          <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            <div style={{ flex: 1 }}>
                              <ItemSearchDropdown inventoryItems={inventoryItems} value={row.itemId || ''} currentName={row.itemName || ''} onSelect={item => handleSelectInventoryItem(idx, item)} onNameChange={v => updateItemRow(idx, { itemName: v })} />
                            </div>
                            <button onClick={() => removeItemRow(idx)} style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontWeight: 700, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>âœ•</button>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                            <div><label style={ST.formLabelSm}>à¶´à·Šâ€à¶»à¶¸à·à¶«à¶º</label><input type="number" min="0" step="0.01" value={row.qty || ''} onChange={e => updateItemRow(idx, { qty: e.target.value })} style={ST.inpSm} /></div>
                            <div><label style={ST.formLabelSm}>à¶’à¶šà¶š à¶¸à·’à¶½</label><input type="number" min="0" step="0.01" value={row.unitPrice || ''} onChange={e => updateItemRow(idx, { unitPrice: e.target.value })} style={ST.inpSm} /></div>
                            <div><label style={ST.formLabelSm}>à¶‘à¶šà¶­à·”à·€</label><div style={{ padding: 10, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', fontWeight: 800, textAlign: 'right', fontSize: 13 }}>Rs.{fmtC(toNum(row.qty || 1) * toNum(row.unitPrice))}</div></div>
                          </div>
                          {row.unit && <div style={{ marginTop: 6, fontSize: 11, color: '#64748b' }}>ðŸ“ {String(row.unit)}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: '#fff7ed', border: '1px solid #fdba74', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 800, color: '#9a3412' }}>
                  <span>ðŸ“¦ à¶·à·à¶«à·Šà¶© à¶¸à·”à·…à·” à¶‘à¶šà¶­à·”à·€</span>
                  <span>Rs.{fmtC(itemsTotal)}</span>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={ST.formLabel}>ðŸ“· à¶»à·’à·ƒà·’à¶§à·Šà¶´à¶­</label>
                <input type="file" accept="image/*" ref={fileRef} onChange={handleReceipt} style={{ display: 'none' }} />
                {form.receipt ? (
                  <div style={{ position: 'relative' }}>
                    <img src={form.receipt} alt="Receipt" style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 10, border: '2px solid #16a34a' }} />
                    <button onClick={() => setField('receipt', null)} style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(239,68,68,.9)', color: 'white', border: 'none', borderRadius: '50%', width: 28, height: 28, fontSize: 14, cursor: 'pointer' }}>âœ•</button>
                  </div>
                ) : (
                  <button onClick={() => fileRef.current?.click()} style={{ width: '100%', padding: 14, border: '2px dashed #cbd5e1', borderRadius: 10, background: '#f8fafc', color: '#64748b', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>ðŸ“· à¶»à·’à·ƒà·’à¶§à·Šà¶´à¶­ à¶‘à¶šà·Š à¶šà¶»à¶±à·Šà¶±</button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={resetForm} style={{ flex: 1, padding: 14, background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>à¶…à·€à¶½à¶‚à¶œà·”</button>
                <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: 14, background: saving ? '#94a3b8' : 'linear-gradient(135deg,#dc2626,#ef4444)', color: 'white', border: 'none', borderRadius: 10, fontWeight: 900, fontSize: 16, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .6 : 1 }}>
                  {saving ? 'â³ à·ƒà·”à¶»à¶šà·’à¶¸à·’à¶±à·Š...' : editingId ? 'âœ… à¶ºà·à·€à¶­à·Šà¶šà·à¶½à·“à¶±' : 'ðŸ’¾ à·ƒà·”à¶»à¶šà·’à¶±à·Šà¶±'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUPPLIER MODAL */}
      {showSupplierModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 18, width: '100%', maxWidth: 520, maxHeight: '94vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 22px', background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white' }}>
              <h3 style={{ margin: 0, fontSize: 17 }}>ðŸ‘¤ à·ƒà·à¶´à¶ºà·”à¶¸à·Šà¶šà¶»à·” à¶­à·à¶»à¶±à·Šà¶±</h3>
              <button onClick={() => setShowSupplierModal(false)} style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,.2)', border: 'none', fontSize: 18, cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>âœ•</button>
            </div>
            <div style={{ padding: 22, overflowY: 'auto', flex: 1 }}>
              <input value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)} placeholder="à·ƒà·à¶´à¶ºà·”à¶¸à·Šà¶šà¶»à·” à·ƒà·œà¶ºà¶±à·Šà¶±..." style={{ ...ST.inpSm, marginBottom: 12 }} />
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button onClick={() => setShowNewSupplier(p => !p)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #22c55e', background: '#f0fdf4', color: '#166534', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>âž• à¶±à·€ à·ƒà·à¶´à¶ºà·”à¶¸à·Šà¶šà¶»à·”</button>
              </div>
              {showNewSupplier && (
                <div style={{ padding: 14, borderRadius: 12, background: '#f0fdfa', border: '1px solid #99f6e4', marginBottom: 12 }}>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <input value={newSupplier.name} onChange={e => setNewSupplier(p => ({ ...p, name: e.target.value }))} placeholder="à·ƒà·à¶´à¶ºà·”à¶¸à·Šà¶šà¶»à·” à¶±à¶¸" style={ST.inpSm} />
                    <input value={newSupplier.companyName} onChange={e => setNewSupplier(p => ({ ...p, companyName: e.target.value }))} placeholder="à¶†à¶ºà¶­à¶±à¶ºà·š à¶±à¶¸" style={ST.inpSm} />
                    <input value={newSupplier.phone} onChange={e => setNewSupplier(p => ({ ...p, phone: e.target.value }))} placeholder="à¶¯à·”à¶»à¶šà¶®à¶±" style={ST.inpSm} />
                    <button onClick={handleCreateSupplier} disabled={creatingSupplier} style={{ padding: 14, background: creatingSupplier ? '#94a3b8' : 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', border: 'none', borderRadius: 10, fontWeight: 900, cursor: creatingSupplier ? 'not-allowed' : 'pointer', opacity: creatingSupplier ? .7 : 1 }}>
                      {creatingSupplier ? 'â³ à·ƒà·”à¶»à¶šà·’à¶¸à·’à¶±à·Š...' : 'âœ… à·ƒà·à¶´à¶ºà·”à¶¸à·Šà¶šà¶»à·” à·ƒà·”à¶»à¶šà·’à¶±à·Šà¶±'}
                    </button>
                  </div>
                </div>
              )}
              <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                {!supplierListFiltered.length ? (
                  <div style={{ padding: 18, borderRadius: 12, border: '1px dashed #cbd5e1', background: 'white', textAlign: 'center' }}>
                    <div style={{ fontSize: 28 }}>ðŸ‘¤</div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>{supplierSearch ? 'à¶œà·à¶½à¶´à·™à¶± à·ƒà·à¶´à¶ºà·”à¶¸à·Šà¶šà¶»à·”à·€à¶±à·Š à¶±à·œà¶¸à·à¶­' : 'à·ƒà·à¶´à¶ºà·”à¶¸à·Šà¶šà¶»à·”à·€à¶±à·Š à¶±à·œà¶¸à·à¶­'}</div>
                  </div>
                ) : supplierListFiltered.map(sup => {
                  const isS = form.expenseBySupplierId === sup.id;
                  return (
                    <button key={sup.id} onClick={() => handleSelectSupplier(sup)} style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: `1px solid ${isS ? '#14b8a6' : '#e2e8f0'}`, background: isS ? '#f0fdfa' : 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', cursor: 'pointer', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{String(sup.name || '')}</div>
                        {sup.companyName && <div style={{ fontSize: 12, color: '#64748b' }}>{String(sup.companyName)}</div>}
                        {sup.phone && <div style={{ fontSize: 11, color: '#94a3b8' }}>{String(sup.phone)}</div>}
                      </div>
                      {isS && <div style={{ color: '#0f766e', fontWeight: 800 }}>âœ“</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CATEGORY MODAL */}
      {showCategoryModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 18, width: '100%', maxWidth: 420, maxHeight: '94vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 22px', background: '#f8fafc', color: '#1e293b' }}>
              <h3 style={{ margin: 0, fontSize: 17 }}>âš™ï¸ à·€à¶»à·Šà¶œ à¶šà·…à¶¸à¶±à·à¶šà¶»à¶«à¶º</h3>
              <button onClick={() => setShowCategoryModal(false)} style={{ width: 36, height: 36, borderRadius: '50%', background: '#e2e8f0', border: 'none', fontSize: 18, cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>âœ•</button>
            </div>
            <div style={{ padding: 22, overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="à¶±à·€ à·€à¶»à·Šà¶œ à¶±à¶¸" onKeyDown={e => e.key === 'Enter' && handleAddCategory()} style={{ flex: 1, padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
                <button onClick={handleAddCategory} style={{ padding: '12px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>âž•</button>
              </div>
              <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                {categories.map((cat, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 4px', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 20 }}>{cat.icon}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>{String(cat.name)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: cat.color }} />
                      {cat.isCustom && (
                        <button onClick={() => handleDeleteCategory(cat.id)} style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>ðŸ—‘ï¸</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Receipt View */}
      {viewReceipt && (
        <div onClick={() => setViewReceipt(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)', zIndex: 10002, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
            <img src={viewReceipt} alt="Receipt" style={{ maxWidth: '92vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 12 }} />
            <button onClick={() => setViewReceipt(null)} style={{ position: 'absolute', top: -14, right: -14, background: '#ef4444', color: 'white', border: '3px solid white', borderRadius: '50%', width: 38, height: 38, fontSize: 18, cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>âœ•</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   STYLES
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const ST = {
  inp: { width: '100%', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 15, boxSizing: 'border-box', background: 'white', outline: 'none' },
  inpSm: { width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', outline: 'none' },
  sel: { padding: '9px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 12, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 80 },
  formLabel: { display: 'block', fontSize: 14, fontWeight: 700, color: '#334155', marginBottom: 6 },
  formLabelSm: { display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 3 },
  card: { background: 'white', borderRadius: 14, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,.06)', border: '1px solid #e2e8f0', marginBottom: 16 },
  cardH: { margin: '0 0 14px 0', fontSize: 16, fontWeight: 700, color: '#1e293b' },
};

