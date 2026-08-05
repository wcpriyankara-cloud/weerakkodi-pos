'use client';

// components/VehicleIncomeManager.jsx
// ═══════════════════════════════════════════════════════════════
// v24.1 — Income + Expenses Tabs
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  collection, addDoc, updateDoc, doc,
  onSnapshot, query, where, orderBy,
  Timestamp, serverTimestamp, increment, getDocs,
} from 'firebase/firestore';
import { db } from '@/shared/firebase-config';
import { useUserAuth } from '@/context/UserContext';
import VehicleExpenseTab from './VehicleExpenseTab';
import InvoiceOutputManager from './InvoiceOutputManager';

/* ═══════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════ */
const todayStr = () => new Date().toISOString().split('T')[0];

const toMs = (src) => {
  if (!src) return 0;
  if (typeof src?.toDate === 'function') return src.toDate().getTime();
  if (src?.seconds) return src.seconds * 1000;
  if (src?._seconds) return src._seconds * 1000;
  if (typeof src === 'number') return src;
  const d = new Date(src);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

const formatDate = (src) => {
  if (!src) return '-';
  const ms = toMs(src);
  if (ms > 0) return new Date(ms).toLocaleDateString('si-LK');
  if (typeof src === 'string' && src.length >= 10) {
    const d = new Date(src + 'T00:00:00');
    return isNaN(d.getTime()) ? src : d.toLocaleDateString('si-LK');
  }
  return '-';
};

const formatCurrency = (v) =>
  'Rs. ' + (Number(v) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const R2 = (v) => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
};

const norm = (v) => (v || '').toString().trim().toLowerCase();

const normalizePhone = (raw) => {
  if (!raw) return '';
  let p = String(raw).replace(/[\s\-\(\)]/g, '');
  if (p.startsWith('+94')) p = '0' + p.slice(3);
  else if (p.startsWith('94') && p.length >= 11) p = '0' + p.slice(2);
  else if (/^\d{9}$/.test(p)) p = '0' + p;
  return p;
};

const getCustomerPicture = (c) =>
  c?.profilePicture || c?.picture || c?.photoURL || c?.photo || '';

const getCustomerBalance = (c) =>
  R2(c?.currentBalance ?? c?.balance ?? 0);

/* ════════════════════════════════════════
   BUILD TRIP INVOICE
   ════════════════════════════════════════ */
const buildTripInvoice = (trip, vehicles = []) => {
  if (!trip) return null;
  const tripId = trip.id || trip.receiptId || Date.now().toString(36);
  const invoiceNo = `TRP-${String(tripId).slice(0, 6).toUpperCase()}`;
  const vehicleNo =
    trip.vehicleName || vehicles.find((v) => v.id === trip.vehicleId)?.vehicleNo || '';
  const totalBill = R2(trip.totalBillAmount || 0);
  const paidAmt = R2(trip.paidAmount || 0);
  const methodMap = { cash: 'cash', bank: 'etransfer', card: 'card', credit: 'credit' };
  const payMethod = methodMap[trip.paymentMethod] || 'cash';
  const items = [];

  if (R2(trip.fare) > 0) {
    items.push({
      name: `ප්‍රවාහන ගාස්තුව${vehicleNo ? ` (${vehicleNo})` : ''}`,
      qty: 1,
      sellingPrice: R2(trip.fare),
      yourPrice: R2(trip.fare),
      lineTotal: R2(trip.fare),
      uom: 'unit',
    });
  }

  (trip.cargoItems || []).forEach((ci, idx) => {
    if (!ci.goodsName && !ci.goodsId) return;
    const up = R2(ci.unitPrice || 0);
    items.push({
      name: ci.goodsName || `Item ${idx + 1}`,
      qty: R2(ci.qty) || 1,
      sellingPrice: R2(ci.originalPrice || up),
      yourPrice: up,
      lineTotal: R2(ci.total || R2(ci.qty) * up),
      uom: 'unit',
    });
  });

  return {
    id: `trip-${tripId}`,
    invoiceNo,
    customerName: trip.customerName || 'Guest',
    customerPhone: trip.customerPhone || '',
    items,
    netAmount: totalBill,
    payAmount: paidAmt,
    balance: paidAmt > totalBill ? R2(paidAmt - totalBill) : 0,
    paymentMethod: payMethod,
    createdAt: trip.createdAt || { toDate: () => new Date() },
  };
};

/* ═══════════════════════════════════════
   TRANSLATIONS
   ═══════════════════════════════════════ */
const TRANSLATIONS = {
  si: {
    title: 'වාහන ආදායම් කළමනාකරණය',
    vehicles: 'වාහන',
    trips: 'ගමන්',
    incomeTab: 'ආදායම්',
    expenses: 'වියදම්',
    reports: 'වාර්තා',
    addVehicle: 'වාහනයක් එකතු කරන්න',
    addTrip: 'ගමනක් එකතු කරන්න',
    vehicleNo: 'වාහන අංකය',
    vehicleType: 'වාහන වර්ගය',
    driverName: 'රියදුරු නම',
    driverPhone: 'දුරකථනය',
    status: 'තත්ත්වය',
    active: 'සක්‍රීය',
    inactive: 'නිෂ්ක්‍රීය',
    tripDate: 'ගමන් දිනය',
    customer: 'පාරිභෝගිකයා',
    fare: 'ප්‍රවාහන ගාස්තුව',
    paidAmount: 'ගෙවන ලද මුදල',
    balanceDue: 'ඉතිරි ණය',
    save: 'සුරකින්න',
    cancel: 'අවලංගු',
    saving: 'සුරකිමින්...',
    noData: 'දත්ත නොමැත',
    amount: 'මුදල',
    totalIncome: 'මුළු ආදායම',
    totalExpense: 'මුළු වියදම',
    netProfit: 'ශුද්ධ ලාභය',
    allVehicles: 'සියලුම වාහන',
    selectVehicle: 'වාහනයක් තෝරන්න',
    totalBill: 'මුළු බිල්පත',
    received: 'ලැබුණු',
    close: 'වසන්න',
    print: 'මුද්‍රණය',
    sendBill: 'යවන්න',
    truck: 'ට්‍රක්',
    van: 'වෑන්',
    lorry: 'ලොරි',
    pickup: 'පිකප්',
    guestCustomer: 'Guest',
    from: 'සිට',
    to: 'දක්වා',
    searchCustomer: 'පාරිභෝගිකයා සොයන්න...',
    paymentMethod: 'ගෙවීම් ක්‍රමය',
    cash: 'මුදල්',
    bank: 'බැංකු',
    credit: 'ණය',
    addGoods: 'භාණ්ඩ එකතු කරන්න',
    goodsName: 'භාණ්ඩ නම',
    qty: 'ප්‍රමාණය',
    unitPrice: 'එකක මිල',
    total: 'එකතුව',
    fromLocation: 'ආරම්භ ස්ථානය',
    toLocation: 'ගමනාන්තය',
    notes: 'සටහන්',
    vehicle: 'වාහනය',
    capacity: 'ධාරිතාව',
    noVehicles: 'වාහන නොමැත',
    tripCount: 'ගමන් ගණන',
    income: 'ආදායම',
    actions: 'ක්‍රියා',
    share: 'Share',
    fullyPaid: 'ගෙවා ඇත',
    cargo: 'භාණ්ඩ',
    search: 'සොයන්න...',
    filter: 'පෙරහන',
    headerSubtitle: 'වාහන',
    tripCountLabel: 'ගමන්',
    totalTrips: 'මුළු ගමන්',
    totalBilled: 'මුළු බිල්',
    totalReceived: 'මුළු ලැබුණු',
    totalDue: 'මුළු ඉතිරි',
    date: 'දිනය',
    route: 'මාර්ගය',
    paid: 'ගෙවූ',
    due: 'ඉතිරි',
    summary: 'සාරාංශය',
    noMatches: 'ගැලපෙන ප්‍රතිඵල නැත',
    notRegistered: 'ලියාපදිංචි නැත',
    customerName: 'ගනුදෙනුකරු නම',
    phone: 'දුරකථනය',
  },
  en: {
    title: 'Vehicle Income Manager',
    vehicles: 'Vehicles',
    trips: 'Trips',
    incomeTab: 'Income',
    expenses: 'Expenses',
    reports: 'Reports',
    addVehicle: 'Add Vehicle',
    addTrip: 'Add Trip',
    vehicleNo: 'Vehicle No',
    vehicleType: 'Vehicle Type',
    driverName: 'Driver Name',
    driverPhone: 'Phone',
    status: 'Status',
    active: 'Active',
    inactive: 'Inactive',
    tripDate: 'Trip Date',
    customer: 'Customer',
    fare: 'Transport Fare',
    paidAmount: 'Paid Amount',
    balanceDue: 'Balance Due',
    save: 'Save',
    cancel: 'Cancel',
    saving: 'Saving...',
    noData: 'No data',
    amount: 'Amount',
    totalIncome: 'Total Income',
    totalExpense: 'Total Expense',
    netProfit: 'Net Profit',
    allVehicles: 'All Vehicles',
    selectVehicle: 'Select Vehicle',
    totalBill: 'Total Bill',
    received: 'Received',
    close: 'Close',
    print: 'Print',
    sendBill: 'Send',
    truck: 'Truck',
    van: 'Van',
    lorry: 'Lorry',
    pickup: 'Pickup',
    guestCustomer: 'Guest',
    from: 'From',
    to: 'To',
    searchCustomer: 'Search customer...',
    paymentMethod: 'Payment Method',
    cash: 'Cash',
    bank: 'Bank',
    credit: 'Credit',
    addGoods: 'Add Goods',
    goodsName: 'Item Name',
    qty: 'Qty',
    unitPrice: 'Unit Price',
    total: 'Total',
    fromLocation: 'From',
    toLocation: 'To',
    notes: 'Notes',
    vehicle: 'Vehicle',
    capacity: 'Capacity',
    noVehicles: 'No vehicles',
    tripCount: 'Trip Count',
    income: 'Income',
    actions: 'Actions',
    share: 'Share',
    fullyPaid: 'Fully Paid',
    cargo: 'Cargo',
    search: 'Search...',
    filter: 'Filter',
    headerSubtitle: 'vehicles',
    tripCountLabel: 'trips',
    totalTrips: 'Total Trips',
    totalBilled: 'Total Billed',
    totalReceived: 'Total Received',
    totalDue: 'Total Due',
    date: 'Date',
    route: 'Route',
    paid: 'Paid',
    due: 'Due',
    summary: 'Summary',
    noMatches: 'No matches found',
    notRegistered: 'Not registered',
    customerName: 'Customer Name',
    phone: 'Phone',
  },
};

/* ═══════════════════════════════════════
   STYLES
   ═══════════════════════════════════════ */
const S = {
  container: {
    maxWidth: 1400,
    margin: '0 auto',
    padding: 20,
    minHeight: '100vh',
    fontFamily: 'inherit',
  },
  header: {
    background: 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)',
    padding: 30,
    borderRadius: 20,
    marginBottom: 30,
    color: 'white',
    textAlign: 'center',
  },
  tabs: {
    display: 'flex',
    gap: 12,
    background: 'white',
    borderRadius: 16,
    padding: 10,
    marginBottom: 25,
    overflowX: 'auto',
  },
  card: {
    background: 'white',
    borderRadius: 20,
    padding: 30,
    boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
    marginBottom: 25,
  },
  th: {
    padding: '14px 16px',
    textAlign: 'left',
    background: '#f8fafc',
    borderBottom: '2px solid #e2e8f0',
    fontWeight: 700,
    fontSize: 13,
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '14px 16px',
    borderBottom: '1px solid #f1f5f9',
    fontSize: 14,
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    border: '2px solid #e2e8f0',
    borderRadius: 10,
    fontSize: 14,
    boxSizing: 'border-box',
    outline: 'none',
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 700,
    color: '#374151',
    marginBottom: 5,
  },
  btn: (bg = '#3b82f6', c = 'white') => ({
    padding: '10px 20px',
    background: bg,
    color: c,
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 14,
  }),
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: 'white',
    borderRadius: 20,
    width: '95%',
    maxWidth: 640,
    maxHeight: '92vh',
    overflowY: 'auto',
    boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
  },
  modalHdr: (bg = '#667eea') => ({
    background: `linear-gradient(135deg,${bg},${bg}cc)`,
    padding: '20px 24px',
    borderRadius: '20px 20px 0 0',
    color: 'white',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  }),
  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 14,
  },
  badge: (bg, c) => ({
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 700,
    background: bg,
    color: c,
    display: 'inline-block',
  }),
};

/* ════════════════════════════════════════
   useLanguage HOOK
   ════════════════════════════════════════ */
function useLanguage() {
  const [lang, setLang] = useState('si');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('language');
      if (saved === 'en' || saved === 'si') setLang(saved);
    } catch {}

    const handleLangEvent = (e) => {
      const newLang = e.detail || 'si';
      setLang(newLang);
    };

    const handleStorage = () => {
      try {
        const s = localStorage.getItem('language');
        if (s === 'en' || s === 'si') setLang(s);
      } catch {}
    };

    window.addEventListener('app-language-change', handleLangEvent);
    window.addEventListener('storage', handleStorage);

    const interval = setInterval(() => {
      try {
        const s = localStorage.getItem('language');
        if (s && s !== lang) setLang(s);
      } catch {}
    }, 1000);

    return () => {
      window.removeEventListener('app-language-change', handleLangEvent);
      window.removeEventListener('storage', handleStorage);
      clearInterval(interval);
    };
  }, [lang]);

  const t = useMemo(() => TRANSLATIONS[lang] || TRANSLATIONS.si, [lang]);

  return { lang, t };
}

/* ════════════════════════════════════════
   CUSTOMER SEARCH
   ════════════════════════════════════════ */
function CustomerSearch({ uid, value, onChange, placeholder, t }) {
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(collection(db, 'customers'), where('uid', '==', uid)),
      (s) => setCustomers(s.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return unsub;
  }, [uid]);

  useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return customers.slice(0, 12);
    const lq = norm(q);
    return customers
      .filter((c) =>
        norm(c.name).includes(lq) ||
        (c.phone && normalizePhone(c.phone).includes(lq.replace(/\D/g, '')))
      )
      .slice(0, 10);
  }, [customers, q]);

  const selected = customers.find((c) => c.id === value);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          ...S.input,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: selected ? '#f0fdf4' : 'white',
          borderColor: selected ? '#10b981' : '#e2e8f0',
        }}
      >
        {selected ? (
          <>
            {getCustomerPicture(selected) ? (
              <img
                src={getCustomerPicture(selected)}
                alt=""
                style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: '#dbeafe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                }}
              >
                👤
              </div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{selected.name}</div>
              {selected.phone && (
                <div style={{ fontSize: 11, color: '#64748b' }}>{selected.phone}</div>
              )}
            </div>
            {getCustomerBalance(selected) > 0 && (
              <span style={S.badge('#fef2f2', '#dc2626')}>
                Rs.{getCustomerBalance(selected).toLocaleString()}
              </span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onChange(null, null);
                setQ('');
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#dc2626',
                fontSize: 16,
              }}
            >
              ✕
            </button>
          </>
        ) : (
          <span style={{ color: '#94a3b8' }}>{placeholder || t.searchCustomer}</span>
        )}
      </div>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 99,
            background: 'white',
            border: '2px solid #e2e8f0',
            borderRadius: 12,
            boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: 10, borderBottom: '1px solid #e2e8f0' }}>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.searchCustomer}
              style={{ ...S.input, border: '1px solid #e2e8f0', padding: '8px 12px' }}
            />
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            <div
              onClick={() => {
                onChange('guest', null);
                setOpen(false);
                setQ('');
              }}
              style={{
                padding: '10px 14px',
                cursor: 'pointer',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span style={{ fontSize: 20 }}>👤</span>
              <span style={{ fontWeight: 600, color: '#475569' }}>
                {t.guestCustomer} ({t.notRegistered})
              </span>
            </div>
            {filtered.map((c) => (
              <div
                key={c.id}
                onClick={() => {
                  onChange(c.id, c);
                  setOpen(false);
                  setQ('');
                }}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: c.id === value ? '#f0fdf4' : 'white',
                }}
              >
                {getCustomerPicture(c) ? (
                  <img
                    src={getCustomerPicture(c)}
                    alt=""
                    style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      background: '#dbeafe',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 16,
                    }}
                  >
                    👤
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{c.name}</div>
                  {c.phone && <div style={{ fontSize: 12, color: '#64748b' }}>{c.phone}</div>}
                </div>
                {getCustomerBalance(c) > 0 && (
                  <span style={S.badge('#fef2f2', '#dc2626')}>
                    Rs.{getCustomerBalance(c).toLocaleString()}
                  </span>
                )}
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>
                {t.noMatches}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════
   ADD VEHICLE MODAL
   ════════════════════════════════════════ */
function AddVehicleModal({ basePath, onClose, onSaved, t }) {
  const [form, setForm] = useState({
    vehicleNo: '',
    vehicleType: 'truck',
    driverName: '',
    driverPhone: '',
    capacity: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const vehicleTypes = [
    { value: 'truck', label: `🚛 ${t.truck}` },
    { value: 'van', label: `🚐 ${t.van}` },
    { value: 'lorry', label: `🚚 ${t.lorry}` },
    { value: 'pickup', label: `🛻 ${t.pickup}` },
  ];

  const handleSave = async () => {
    if (!form.vehicleNo.trim()) return alert(t.vehicleNo + '!');
    setSaving(true);
    try {
      await addDoc(collection(db, `${basePath}/vehicles`), {
        ...form,
        isActive: true,
        createdAt: serverTimestamp(),
      });
      onSaved?.();
      onClose();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.modalHdr('#10b981')}>
          <h3 style={{ margin: 0, fontSize: 18 }}>🚛 {t.addVehicle}</h3>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: 'white',
              borderRadius: '50%',
              width: 32,
              height: 32,
              cursor: 'pointer',
              fontSize: 16,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={S.grid2}>
            <div>
              <label style={S.label}>{t.vehicleNo} *</label>
              <input
                value={form.vehicleNo}
                onChange={(e) =>
                  setForm((p) => ({ ...p, vehicleNo: e.target.value.toUpperCase() }))
                }
                style={S.input}
                placeholder="ABC-1234"
              />
            </div>
            <div>
              <label style={S.label}>{t.vehicleType}</label>
              <select
                value={form.vehicleType}
                onChange={(e) =>
                  setForm((p) => ({ ...p, vehicleType: e.target.value }))
                }
                style={S.input}
              >
                {vehicleTypes.map((vt) => (
                  <option key={vt.value} value={vt.value}>
                    {vt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={S.grid2}>
            <div>
              <label style={S.label}>{t.driverName}</label>
              <input
                value={form.driverName}
                onChange={(e) =>
                  setForm((p) => ({ ...p, driverName: e.target.value }))
                }
                style={S.input}
              />
            </div>
            <div>
              <label style={S.label}>{t.driverPhone}</label>
              <input
                value={form.driverPhone}
                onChange={(e) =>
                  setForm((p) => ({ ...p, driverPhone: e.target.value }))
                }
                style={S.input}
                placeholder="07X XXX XXXX"
              />
            </div>
          </div>
          <div>
            <label style={S.label}>{t.capacity}</label>
            <input
              value={form.capacity}
              onChange={(e) =>
                setForm((p) => ({ ...p, capacity: e.target.value }))
              }
              style={S.input}
              placeholder="10 Ton"
            />
          </div>
          <div>
            <label style={S.label}>{t.notes}</label>
            <textarea
              value={form.notes}
              onChange={(e) =>
                setForm((p) => ({ ...p, notes: e.target.value }))
              }
              style={{ ...S.input, height: 70, resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={onClose} style={{ ...S.btn('#f1f5f9', '#475569'), flex: 1 }}>
              {t.cancel}
            </button>
            <button onClick={handleSave} disabled={saving} style={{ ...S.btn('#10b981'), flex: 2 }}>
              {saving ? t.saving : `💾 ${t.save}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   ADD TRIP MODAL
   ════════════════════════════════════════ */
function AddTripModal({ basePath, uid, vehicles, onClose, onSaved, t }) {
  const [form, setForm] = useState({
    tripDate: todayStr(),
    vehicleId: '',
    customerId: '',
    customerName: '',
    customerPhone: '',
    fromLocation: '',
    toLocation: '',
    fare: '',
    paidAmount: '',
    paymentMethod: 'cash',
    notes: '',
  });
  const [cargoItems, setCargoItems] = useState([]);
  const [saving, setSaving] = useState(false);

  const fare = R2(form.fare);
  const cargoTotal = cargoItems.reduce((s, ci) => s + R2(ci.total), 0);
  const totalBill = R2(fare + cargoTotal);
  const paid = R2(form.paidAmount);
  const balanceDue = R2(totalBill - paid);

  const addCargoItem = () =>
    setCargoItems((p) => [...p, { goodsName: '', qty: 1, unitPrice: 0, total: 0 }]);

  const updateCargo = (idx, field, val) => {
    setCargoItems((p) => {
      const n = [...p];
      n[idx] = { ...n[idx], [field]: val };
      if (field === 'qty' || field === 'unitPrice')
        n[idx].total = R2(R2(n[idx].qty) * R2(n[idx].unitPrice));
      return n;
    });
  };

  const removeCargo = (idx) =>
    setCargoItems((p) => p.filter((_, i) => i !== idx));

  const handleCustomerChange = (custId, custData) => {
    if (custId === 'guest' || !custId) {
      setForm((p) => ({ ...p, customerId: '', customerName: '', customerPhone: '' }));
    } else if (custData) {
      setForm((p) => ({
        ...p,
        customerId: custId,
        customerName: custData.name || '',
        customerPhone: custData.phone || '',
      }));
    }
  };

  const handleSave = async () => {
    if (!form.vehicleId) return alert(t.selectVehicle + '!');
    if (!form.fare && cargoItems.length === 0) return alert(t.fare + '!');
    setSaving(true);
    try {
      const vehicle = vehicles.find((v) => v.id === form.vehicleId);
      const tripData = {
        uid,
        tripDate: Timestamp.fromDate(new Date(form.tripDate + 'T12:00:00')),
        vehicleId: form.vehicleId,
        vehicleName: vehicle?.vehicleNo || '',
        vehicleType: vehicle?.vehicleType || '',
        customerId: form.customerId || null,
        customerName: form.customerName || t.guestCustomer,
        customerPhone: form.customerPhone || '',
        fromLocation: form.fromLocation,
        toLocation: form.toLocation,
        fare,
        cargoItems: cargoItems.map((ci) => ({
          goodsName: ci.goodsName,
          qty: R2(ci.qty),
          unitPrice: R2(ci.unitPrice),
          originalPrice: R2(ci.unitPrice),
          total: R2(ci.total),
        })),
        totalBillAmount: totalBill,
        paidAmount: paid,
        balanceDue,
        paymentMethod: form.paymentMethod,
        notes: form.notes,
        createdAt: serverTimestamp(),
      };

      const tripRef = await addDoc(collection(db, `${basePath}/vehicleTrips`), tripData);

      if (form.customerId && balanceDue > 0) {
        try {
          await updateDoc(doc(db, 'customers', form.customerId), {
            currentBalance: increment(balanceDue),
            updatedAt: serverTimestamp(),
          });

          await addDoc(collection(db, 'customerTransactions'), {
            uid,
            customerId: form.customerId,
            type: 'credit',
            amount: fare,
            date: form.tripDate,
            note: `ප්‍රවාහන ගාස්තු (${vehicle?.vehicleNo || ''})`,
            source: 'vehicleTrip',
            tripId: tripRef.id,
            createdAt: serverTimestamp(),
            timestamp: Date.now(),
          });

          if (paid > 0) {
            await addDoc(collection(db, 'customerTransactions'), {
              uid,
              customerId: form.customerId,
              type: 'payment',
              amount: paid,
              date: form.tripDate,
              note: `ප්‍රවාහන ගෙවීම (${vehicle?.vehicleNo || ''})`,
              source: 'vehicleTrip',
              tripId: tripRef.id,
              paymentMethod: form.paymentMethod,
              createdAt: serverTimestamp(),
              timestamp: Date.now() + 100,
            });
          }
        } catch (e) {
          console.warn('Customer update:', e);
        }
      }

      if (paid > 0) {
        try {
          await addDoc(collection(db, `users/${uid}/cashTransactions`), {
            uid,
            type: 'in',
            category: 'vehicleIncome',
            source: 'vehicleTrip',
            description: `ප්‍රවාහන ආදායම - ${form.customerName || t.guestCustomer}`,
            amount: paid,
            paymentMethod: form.paymentMethod,
            customerId: form.customerId || null,
            customerName: form.customerName || t.guestCustomer,
            tripId: tripRef.id,
            date: form.tripDate,
            timestamp: Timestamp.fromDate(new Date(form.tripDate + 'T12:00:00')),
            createdAt: serverTimestamp(),
            isAutomatic: true,
          });
        } catch (e) {
          console.warn('Cash txn:', e);
        }
      }

      onSaved?.();
      onClose();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={S.overlay}>
      <div style={{ ...S.modal, maxWidth: 700 }}>
        <div style={S.modalHdr('#667eea')}>
          <h3 style={{ margin: 0, fontSize: 18 }}>🚛 {t.addTrip}</h3>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: 'white',
              borderRadius: '50%',
              width: 32,
              height: 32,
              cursor: 'pointer',
              fontSize: 16,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={S.grid2}>
            <div>
              <label style={S.label}>{t.tripDate} *</label>
              <input
                type="date"
                value={form.tripDate}
                onChange={(e) => setForm((p) => ({ ...p, tripDate: e.target.value }))}
                style={S.input}
              />
            </div>
            <div>
              <label style={S.label}>{t.vehicle} *</label>
              <select
                value={form.vehicleId}
                onChange={(e) => setForm((p) => ({ ...p, vehicleId: e.target.value }))}
                style={S.input}
              >
                <option value="">{t.selectVehicle}</option>
                {vehicles.filter((v) => v.isActive !== false).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.vehicleNo} — {v.vehicleType}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={S.label}>{t.customer}</label>
            <CustomerSearch uid={uid} value={form.customerId} onChange={handleCustomerChange} t={t} />
            {!form.customerId && (
              <div style={{ ...S.grid2, marginTop: 10 }}>
                <input
                  value={form.customerName}
                  onChange={(e) => setForm((p) => ({ ...p, customerName: e.target.value }))}
                  style={S.input}
                  placeholder={`${t.customerName} (Optional)`}
                />
                <input
                  value={form.customerPhone}
                  onChange={(e) => setForm((p) => ({ ...p, customerPhone: e.target.value }))}
                  style={S.input}
                  placeholder={`${t.phone} (Optional)`}
                />
              </div>
            )}
          </div>

          <div style={S.grid2}>
            <div>
              <label style={S.label}>{t.fromLocation}</label>
              <input
                value={form.fromLocation}
                onChange={(e) => setForm((p) => ({ ...p, fromLocation: e.target.value }))}
                style={S.input}
              />
            </div>
            <div>
              <label style={S.label}>{t.toLocation}</label>
              <input
                value={form.toLocation}
                onChange={(e) => setForm((p) => ({ ...p, toLocation: e.target.value }))}
                style={S.input}
              />
            </div>
          </div>

          <div>
            <label style={S.label}>{t.fare} (Rs.)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.fare}
              onChange={(e) => setForm((p) => ({ ...p, fare: e.target.value }))}
              style={{ ...S.input, fontSize: 20, fontWeight: 800, color: '#2563eb' }}
              placeholder="0.00"
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <label style={{ ...S.label, margin: 0 }}>📦 {t.cargo} (Optional)</label>
              <button onClick={addCargoItem} style={S.btn('#8b5cf6')}>
                + {t.addGoods}
              </button>
            </div>

            {cargoItems.map((ci, idx) => (
              <div
                key={idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr auto',
                  gap: 8,
                  marginBottom: 8,
                  alignItems: 'center',
                }}
              >
                <input
                  value={ci.goodsName}
                  onChange={(e) => updateCargo(idx, 'goodsName', e.target.value)}
                  style={{ ...S.input, marginBottom: 0 }}
                  placeholder={t.goodsName}
                />
                <input
                  type="number"
                  value={ci.qty}
                  onChange={(e) => updateCargo(idx, 'qty', e.target.value)}
                  style={{ ...S.input, marginBottom: 0 }}
                  placeholder={t.qty}
                />
                <input
                  type="number"
                  value={ci.unitPrice}
                  onChange={(e) => updateCargo(idx, 'unitPrice', e.target.value)}
                  style={{ ...S.input, marginBottom: 0 }}
                  placeholder={t.unitPrice}
                />
                <div
                  style={{
                    padding: '12px 10px',
                    background: '#f0fdf4',
                    borderRadius: 8,
                    textAlign: 'center',
                    fontWeight: 700,
                    fontSize: 13,
                    color: '#16a34a',
                  }}
                >
                  Rs.{ci.total.toLocaleString()}
                </div>
                <button
                  onClick={() => removeCargo(idx)}
                  style={{
                    background: '#fee2e2',
                    border: 'none',
                    borderRadius: 8,
                    width: 34,
                    height: 44,
                    cursor: 'pointer',
                    color: '#dc2626',
                    fontSize: 16,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div style={{ background: '#f8fafc', borderRadius: 14, padding: 16, border: '2px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: '#64748b' }}>{t.fare}:</span>
              <span style={{ fontWeight: 700 }}>{formatCurrency(fare)}</span>
            </div>
            {cargoTotal > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#64748b' }}>{t.cargo}:</span>
                <span style={{ fontWeight: 700 }}>{formatCurrency(cargoTotal)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '2px solid #e2e8f0', marginTop: 6 }}>
              <span style={{ fontWeight: 800, fontSize: 16 }}>{t.totalBill}:</span>
              <span style={{ fontWeight: 900, fontSize: 18, color: '#2563eb' }}>
                {formatCurrency(totalBill)}
              </span>
            </div>
          </div>

          <div style={S.grid2}>
            <div>
              <label style={S.label}>{t.paidAmount} (Rs.)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.paidAmount}
                onChange={(e) => setForm((p) => ({ ...p, paidAmount: e.target.value }))}
                style={{ ...S.input, fontSize: 18, fontWeight: 800, color: '#16a34a' }}
                placeholder="0.00"
              />
            </div>
            <div>
              <label style={S.label}>{t.paymentMethod}</label>
              <select
                value={form.paymentMethod}
                onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value }))}
                style={S.input}
              >
                <option value="cash">💵 {t.cash}</option>
                <option value="bank">🏦 {t.bank}</option>
                <option value="credit">🔴 {t.credit}</option>
              </select>
            </div>
          </div>

          {balanceDue > 0.01 && (
            <div style={{ padding: '10px 16px', background: '#fef2f2', borderRadius: 10, border: '2px solid #fecaca', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: '#dc2626' }}>⚠️ {t.balanceDue}:</span>
              <span style={{ fontWeight: 900, fontSize: 18, color: '#dc2626' }}>
                {formatCurrency(balanceDue)}
              </span>
            </div>
          )}

          <div>
            <label style={S.label}>{t.notes}</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              style={{ ...S.input, height: 70, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={onClose} style={{ ...S.btn('#f1f5f9', '#475569'), flex: 1 }}>
              {t.cancel}
            </button>
            <button onClick={handleSave} disabled={saving} style={{ ...S.btn('#667eea'), flex: 2 }}>
              {saving ? t.saving : `💾 ${t.save}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   REPORTS TAB
   ════════════════════════════════════════ */
function ReportsTab({ trips, vehicles, t }) {
  const [filterVehicle, setFilterVehicle] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const filtered = useMemo(() => {
    return trips.filter((tr) => {
      const ms = toMs(tr.tripDate);
      if (fromDate && ms < new Date(fromDate + 'T00:00:00').getTime()) return false;
      if (toDate && ms > new Date(toDate + 'T23:59:59').getTime()) return false;
      if (filterVehicle && tr.vehicleId !== filterVehicle) return false;
      return true;
    });
  }, [trips, fromDate, toDate, filterVehicle]);

  const totalBilled = filtered.reduce((s, x) => s + R2(x.totalBillAmount || 0), 0);
  const totalReceived = filtered.reduce((s, x) => s + R2(x.paidAmount || 0), 0);
  const totalDue = filtered.reduce((s, x) => s + R2(x.balanceDue || 0), 0);

  const statCards = [
    { label: t.totalTrips, value: filtered.length, icon: '🚛', color: '#3b82f6' },
    { label: t.totalBilled, value: formatCurrency(totalBilled), icon: '📋', color: '#8b5cf6' },
    { label: t.totalReceived, value: formatCurrency(totalReceived), icon: '💰', color: '#10b981' },
    { label: t.totalDue, value: formatCurrency(totalDue), icon: '⚠️', color: '#dc2626' },
  ];

  return (
    <div>
      <div style={{ ...S.card, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          <div>
            <label style={S.label}>{t.from}</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={S.input} />
          </div>
          <div>
            <label style={S.label}>{t.to}</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={S.input} />
          </div>
          <div>
            <label style={S.label}>{t.vehicle}</label>
            <select value={filterVehicle} onChange={(e) => setFilterVehicle(e.target.value)} style={S.input}>
              <option value="">{t.allVehicles}</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.vehicleNo}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        {statCards.map((sc, i) => (
          <div key={i} style={{ ...S.card, padding: 20, marginBottom: 0, textAlign: 'center', borderTop: `4px solid ${sc.color}` }}>
            <div style={{ fontSize: 30, marginBottom: 8 }}>{sc.icon}</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>{sc.label}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: sc.color }}>{sc.value}</div>
          </div>
        ))}
      </div>

      <div style={S.card}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {[t.date, t.vehicle, t.customer, t.route, t.totalBill, t.received, t.balanceDue].map((h) => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ ...S.td, textAlign: 'center', color: '#94a3b8', padding: 40 }}>
                    {t.noData}
                  </td>
                </tr>
              ) : (
                filtered.map((tr) => {
                  const due = R2(tr.balanceDue || 0);
                  return (
                    <tr key={tr.id}>
                      <td style={S.td}>{formatDate(tr.tripDate)}</td>
                      <td style={S.td}>
                        <span style={S.badge('#e0e7ff', '#4338ca')}>{tr.vehicleName || '-'}</span>
                      </td>
                      <td style={S.td}>{tr.customerName || t.guestCustomer}</td>
                      <td style={{ ...S.td, fontSize: 12, color: '#64748b' }}>
                        {[tr.fromLocation, tr.toLocation].filter(Boolean).join(' → ') || '-'}
                      </td>
                      <td style={{ ...S.td, fontWeight: 700 }}>{formatCurrency(tr.totalBillAmount)}</td>
                      <td style={{ ...S.td, fontWeight: 700, color: '#16a34a' }}>{formatCurrency(tr.paidAmount)}</td>
                      <td style={S.td}>
                        {due > 0.01 ? (
                          <span style={S.badge('#fef2f2', '#dc2626')}>Rs.{due.toLocaleString()}</span>
                        ) : (
                          <span style={S.badge('#f0fdf4', '#16a34a')}>✅</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                  <td colSpan={4} style={{ ...S.td, textAlign: 'right' }}>{t.summary}:</td>
                  <td style={S.td}>{formatCurrency(totalBilled)}</td>
                  <td style={{ ...S.td, color: '#16a34a' }}>{formatCurrency(totalReceived)}</td>
                  <td style={{ ...S.td, color: '#dc2626' }}>{formatCurrency(totalDue)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════ */
export default function VehicleIncomeManager() {
  const { user } = useUserAuth();
  const { lang, t } = useLanguage();

  const [activeTab, setActiveTab] = useState('income');
  const [vehicles, setVehicles] = useState([]);
  const [trips, setTrips] = useState([]);
  const [outputInvoice, setOutputInvoice] = useState(null);
  const [showAddTrip, setShowAddTrip] = useState(false);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [filterVehicle, setFilterVehicle] = useState('');
  const [searchQ, setSearchQ] = useState('');

  const basePath = useMemo(() => (user ? `users/${user.uid}` : null), [user]);

  useEffect(() => {
    if (!basePath) return;

    const unsubV = onSnapshot(collection(db, `${basePath}/vehicles`), (s) =>
      setVehicles(s.docs.map((d) => ({ id: d.id, ...d.data() })))
    );

    const unsubT = onSnapshot(
      query(collection(db, `${basePath}/vehicleTrips`), orderBy('tripDate', 'desc')),
      (s) => setTrips(s.docs.map((d) => ({ id: d.id, ...d.data() })))
    );

    return () => {
      unsubV();
      unsubT();
    };
  }, [basePath]);

  const filteredTrips = useMemo(() => {
    return trips.filter((tr) => {
      if (filterVehicle && tr.vehicleId !== filterVehicle) return false;
      if (searchQ) {
        const q = norm(searchQ);
        if (!norm(tr.customerName).includes(q) && !norm(tr.vehicleName).includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [trips, filterVehicle, searchQ]);

  const openOutputManager = useCallback(
    (trip) => setOutputInvoice(buildTripInvoice(trip, vehicles)),
    [vehicles]
  );

  const tabs = [
    { key: 'income', icon: '💰', label: t.incomeTab || t.income || 'Income' },
    { key: 'expenses', icon: '💸', label: t.expenses },
    { key: 'vehicles', icon: '🚗', label: t.vehicles },
    { key: 'reports', icon: '📊', label: t.reports },
  ];

  return (
    <div style={S.container}>
      {outputInvoice && (
        <InvoiceOutputManager invoice={outputInvoice} onClose={() => setOutputInvoice(null)} />
      )}

      {showAddTrip && basePath && (
        <AddTripModal
          basePath={basePath}
          uid={user.uid}
          vehicles={vehicles}
          onClose={() => setShowAddTrip(false)}
          onSaved={() => setShowAddTrip(false)}
          t={t}
        />
      )}

      {showAddVehicle && basePath && (
        <AddVehicleModal
          basePath={basePath}
          onClose={() => setShowAddVehicle(false)}
          onSaved={() => setShowAddVehicle(false)}
          t={t}
        />
      )}

      <div style={S.header}>
        <div style={{ fontSize: 50, marginBottom: 10 }}>🚛</div>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>{t.title}</h1>
        <p style={{ margin: '8px 0 0', opacity: 0.85, fontSize: 14 }}>
          {vehicles.length} {t.headerSubtitle} • {trips.length} {t.tripCountLabel}
        </p>
      </div>

      <div style={S.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '12px 24px',
              borderRadius: 12,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: activeTab === tab.key
                ? 'linear-gradient(135deg,#667eea,#764ba2)'
                : '#f8fafc',
              color: activeTab === tab.key ? 'white' : '#64748b',
              boxShadow: activeTab === tab.key
                ? '0 4px 12px rgba(102,126,234,0.3)'
                : 'none',
              transition: 'all 0.2s',
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'expenses' && (
        <VehicleExpenseTab vehicles={vehicles} lang={lang} />
      )}

      {activeTab === 'income' && (
        <div style={S.card}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20,
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
              💰 {t.incomeTab || t.income}
            </h2>
            <button onClick={() => setShowAddTrip(true)} style={S.btn('#667eea')}>
              + {t.addTrip}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder={`🔍 ${t.search}`}
              style={{ ...S.input, maxWidth: 260 }}
            />
            <select
              value={filterVehicle}
              onChange={(e) => setFilterVehicle(e.target.value)}
              style={{ ...S.input, maxWidth: 200 }}
            >
              <option value="">{t.allVehicles}</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.vehicleNo}
                </option>
              ))}
            </select>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {[t.tripDate, t.vehicle, t.customer, t.fare, t.paidAmount, t.balanceDue, t.actions].map((h) => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTrips.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ ...S.td, textAlign: 'center', color: '#94a3b8', padding: 40 }}>
                      <div style={{ fontSize: 40, marginBottom: 10 }}>🚛</div>
                      {t.noData}
                    </td>
                  </tr>
                ) : (
                  filteredTrips.map((tr) => {
                    const due = R2(tr.balanceDue || 0);
                    return (
                      <tr
                        key={tr.id}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                      >
                        <td style={S.td}>{formatDate(tr.tripDate)}</td>
                        <td style={S.td}>
                          <span style={S.badge('#e0e7ff', '#4338ca')}>
                            {tr.vehicleName || '-'}
                          </span>
                        </td>
                        <td style={S.td}>
                          <div style={{ fontWeight: 600 }}>{tr.customerName || t.guestCustomer}</div>
                          {tr.customerPhone && (
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              {tr.customerPhone}
                            </div>
                          )}
                        </td>
                        <td style={{ ...S.td, fontWeight: 700, color: '#2563eb' }}>
                          {formatCurrency(tr.totalBillAmount)}
                        </td>
                        <td style={{ ...S.td, fontWeight: 700, color: '#16a34a' }}>
                          {formatCurrency(tr.paidAmount)}
                        </td>
                        <td style={S.td}>
                          {due > 0.01 ? (
                            <span style={S.badge('#fef2f2', '#dc2626')}>
                              Rs.{due.toLocaleString()}
                            </span>
                          ) : (
                            <span style={S.badge('#f0fdf4', '#16a34a')}>
                              ✅ {t.fullyPaid}
                            </span>
                          )}
                        </td>
                        <td style={S.td}>
                          <button
                            onClick={() => openOutputManager(tr)}
                            style={{
                              padding: '7px 14px',
                              background: '#3b82f6',
                              color: 'white',
                              border: 'none',
                              borderRadius: 8,
                              cursor: 'pointer',
                              fontWeight: 700,
                              fontSize: 13,
                            }}
                          >
                            📤 {t.share}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'vehicles' && (
        <div style={S.card}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
              🚗 {t.vehicles}
            </h2>
            <button onClick={() => setShowAddVehicle(true)} style={S.btn('#10b981')}>
              + {t.addVehicle}
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {vehicles.length === 0 ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                <div style={{ fontSize: 50, marginBottom: 10 }}>🚗</div>
                <div>{t.noVehicles}</div>
              </div>
            ) : (
              vehicles.map((v) => {
                const vTrips = trips.filter((x) => x.vehicleId === v.id);
                const vIncome = vTrips.reduce((s, x) => s + R2(x.paidAmount || 0), 0);
                const typeEmoji =
                  { truck: '🚛', van: '🚐', lorry: '🚚', pickup: '🛻' }[v.vehicleType] || '🚗';

                return (
                  <div
                    key={v.id}
                    style={{
                      ...S.card,
                      marginBottom: 0,
                      border: '2px solid #e2e8f0',
                      padding: 20,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <span style={{ fontSize: 36 }}>{typeEmoji}</span>
                      <div>
                        <div style={{ fontWeight: 900, fontSize: 18 }}>{v.vehicleNo}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{v.vehicleType}</div>
                      </div>
                      <span
                        style={{
                          marginLeft: 'auto',
                          ...S.badge(
                            v.isActive !== false ? '#f0fdf4' : '#f1f5f9',
                            v.isActive !== false ? '#16a34a' : '#94a3b8'
                          ),
                        }}
                      >
                        ● {v.isActive !== false ? t.active : t.inactive}
                      </span>
                    </div>

                    {v.driverName && (
                      <div style={{ fontSize: 13, color: '#475569', marginBottom: 6 }}>
                        👨‍💼 {v.driverName} {v.driverPhone && `• ${v.driverPhone}`}
                      </div>
                    )}

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginTop: 12,
                        paddingTop: 12,
                        borderTop: '1px solid #e2e8f0',
                      }}
                    >
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{t.tripCount}</div>
                        <div style={{ fontWeight: 800, color: '#3b82f6' }}>{vTrips.length}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{t.income}</div>
                        <div style={{ fontWeight: 800, color: '#16a34a', fontSize: 13 }}>
                          Rs.{vIncome.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        <ReportsTab trips={trips} vehicles={vehicles} t={t} />
      )}
    </div>
  );
}