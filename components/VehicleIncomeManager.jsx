'use client';

// components/VehicleIncomeManager.jsx
// ═══════════════════════════════════════════════════════════════
// v28.0 — Damage Charges + Meter/Hours/Days/Months UX +
//        Guest Full-Pay Enforced + Income History Sorting/Filters +
//        InvoiceOutputManager Balance Integration
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  collection, addDoc, updateDoc, doc,
  onSnapshot, query, where, orderBy,
  Timestamp, serverTimestamp, increment,
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
  const n = parseFloat(String(v ?? 0).replace(/,/g, ''));
  return isNaN(n) || !isFinite(n) ? 0 : Math.round(n * 100) / 100;
};

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
   FUZZY SEARCH
   ════════════════════════════════════════ */
const fuzzyMatch = (target, searchText) => {
  if (!searchText || !searchText.trim()) return true;
  if (!target) return false;
  const hay = String(target).toLowerCase();
  const tokens = String(searchText).toLowerCase().trim().split(/\s+/).filter(Boolean);
  return tokens.every((tok) => hay.includes(tok));
};

const customerSearchStr = (c) =>
  [c?.name, c?.customerName, c?.displayName, c?.phone, c?.mobile, c?.address, c?.email, c?.nic]
    .filter(Boolean).join(' ');

const tripSearchStr = (tr) =>
  [tr?.customerName, tr?.customerPhone, tr?.vehicleName, tr?.fromLocation, tr?.toLocation, tr?.notes, tr?.paymentMethod]
    .filter(Boolean).join(' ');

/* ════════════════════════════════════════
   BUILD TRIP INVOICE FOR OUTPUT MANAGER
   ════════════════════════════════════════ */
const buildTripInvoice = (trip, vehicles = []) => {
  if (!trip) return null;
  const tripId = trip.id || trip.receiptId || Date.now().toString(36);
  const invoiceNo = `TRP-${String(tripId).slice(0, 6).toUpperCase()}`;
  const vehicleNo = trip.vehicleName || vehicles.find((v) => v.id === trip.vehicleId)?.vehicleNo || '';
  const totalBill = R2(trip.totalBillAmount || 0);
  const paidAmt = R2(trip.paidAmount || 0);
  const balDue = R2(totalBill - paidAmt);
  const methodMap = { cash: 'cash', bank: 'etransfer', card: 'card', credit: 'credit' };
  const payMethod = methodMap[trip.paymentMethod] || 'cash';
  const items = [];

  // 1. Base Fare
  if (R2(trip.fare) > 0) {
    items.push({
      name: `ප්‍රවාහන ගාස්තුව${vehicleNo ? ` (${vehicleNo})` : ''}`,
      nameSi: 'ප්‍රවාහන ගාස්තුව',
      qty: 1,
      sellingPrice: R2(trip.fare),
      yourPrice: R2(trip.fare),
      lineTotal: R2(trip.fare),
      uom: 'unit',
      warrantyCode: '',
    });
  }

  // 2. Meter / KM charges
  if (R2(trip.meterKmTotal) > 0) {
    const units = R2(trip.meterUnits) || 0;
    const rate = R2(trip.meterRate) || 0;
    items.push({
      name: `🛣️ Meter / KM${units > 0 ? ` (${units} km)` : ''}`,
      nameSi: `මීටර් / KM${units > 0 ? ` (${units} km)` : ''}`,
      qty: units > 0 ? units : 1,
      sellingPrice: rate > 0 ? rate : R2(trip.meterKmTotal),
      yourPrice: rate > 0 ? rate : R2(trip.meterKmTotal),
      lineTotal: R2(trip.meterKmTotal),
      uom: 'km',
      warrantyCode: '',
    });
  }

  // 3. Hours charges
  if (R2(trip.meterHoursTotal) > 0) {
    const hrs = R2(trip.meterHours) || 0;
    const rate = R2(trip.hourlyRate) || 0;
    items.push({
      name: `⏱️ Hours${hrs > 0 ? ` (${hrs} hrs)` : ''}`,
      nameSi: `පැය ගාස්තු${hrs > 0 ? ` (${hrs} පැය)` : ''}`,
      qty: hrs > 0 ? hrs : 1,
      sellingPrice: rate > 0 ? rate : R2(trip.meterHoursTotal),
      yourPrice: rate > 0 ? rate : R2(trip.meterHoursTotal),
      lineTotal: R2(trip.meterHoursTotal),
      uom: 'hrs',
      warrantyCode: '',
    });
  }

  // 4. Days charges
  if (R2(trip.meterDaysTotal) > 0) {
    const days = R2(trip.meterDays) || 0;
    const rate = R2(trip.dailyRate) || 0;
    items.push({
      name: `📅 Days${days > 0 ? ` (${days} days)` : ''}`,
      nameSi: `දින ගාස්තු${days > 0 ? ` (${days} දින)` : ''}`,
      qty: days > 0 ? days : 1,
      sellingPrice: rate > 0 ? rate : R2(trip.meterDaysTotal),
      yourPrice: rate > 0 ? rate : R2(trip.meterDaysTotal),
      lineTotal: R2(trip.meterDaysTotal),
      uom: 'days',
      warrantyCode: '',
    });
  }

  // 5. Months charges
  if (R2(trip.meterMonthsTotal) > 0) {
    const months = R2(trip.meterMonths) || 0;
    const rate = R2(trip.monthlyRate) || 0;
    items.push({
      name: `📆 Months${months > 0 ? ` (${months} months)` : ''}`,
      nameSi: `මාස ගාස්තු${months > 0 ? ` (${months} මාස)` : ''}`,
      qty: months > 0 ? months : 1,
      sellingPrice: rate > 0 ? rate : R2(trip.meterMonthsTotal),
      yourPrice: rate > 0 ? rate : R2(trip.meterMonthsTotal),
      lineTotal: R2(trip.meterMonthsTotal),
      uom: 'months',
      warrantyCode: '',
    });
  }

  // 6. Cargo items
  (trip.cargoItems || []).forEach((ci, idx) => {
    if (!ci.goodsName && !ci.goodsId) return;
    const up = R2(ci.unitPrice || 0);
    const lt = R2(ci.total || R2(ci.qty) * up);
    items.push({
      name: ci.goodsName || `Cargo ${idx + 1}`,
      nameSi: ci.goodsName || '',
      qty: R2(ci.qty) || 1,
      sellingPrice: R2(ci.originalPrice || up),
      yourPrice: up,
      lineTotal: lt,
      uom: 'unit',
      warrantyCode: '',
    });
  });

  // 7. Damage charges
  if (R2(trip.damageAmount) > 0) {
    items.push({
      name: `⚠️ Damage / හානි${trip.damageNote ? ` — ${trip.damageNote}` : ''}`,
      nameSi: `⚠️ හානි අය කිරීම${trip.damageNote ? ` — ${trip.damageNote}` : ''}`,
      qty: 1,
      sellingPrice: R2(trip.damageAmount),
      yourPrice: R2(trip.damageAmount),
      lineTotal: R2(trip.damageAmount),
      uom: 'unit',
      warrantyCode: '',
    });
  }

  // Route & details as remarks
  const route = [trip.fromLocation, trip.toLocation].filter(Boolean).join(' → ');
  const remarks = [route, trip.notes, vehicleNo ? `Vehicle: ${vehicleNo}` : ''].filter(Boolean).join(' | ');

  return {
    id: `trip-${tripId}`,
    invoiceNo,
    invoiceCode: invoiceNo,
    customerId: trip.customerId || '',
    customerName: trip.customerName || 'Guest',
    customerPhone: trip.customerPhone || '',
    customerAddress: '',
    items,
    grossTotal: totalBill,
    invoiceValue: totalBill,
    totalDiscount: 0,
    billDiscount: 0,
    billDiscountPercent: 0,
    exchangeAmount: 0,
    returnAmount: 0,
    netAmount: totalBill,
    payAmount: paidAmt,
    balance: balDue > 0 ? balDue : 0,
    paymentMethod: payMethod,
    remarks,
    invoiceRemark: remarks,
    createdAt: trip.tripDate || trip.createdAt || { toDate: () => new Date() },
    date: trip.tripDate
      ? (typeof trip.tripDate.toDate === 'function'
          ? trip.tripDate.toDate().toISOString().split('T')[0]
          : String(trip.tripDate).slice(0, 10))
      : new Date().toISOString().split('T')[0],
    status: balDue <= 0.01 ? 'paid' : 'partial',
    type: 'invoice',
  };
};

/* ═══════════════════════════════════════
   TRANSLATIONS
   ═══════════════════════════════════════ */
const TRANSLATIONS = {
  si: {
    title: 'වාහන ආදායම් කළමනාකරණය',
    vehicles: 'වාහන', trips: 'ගමන්', incomeTab: 'ආදායම්',
    expenses: 'වියදම්', reports: 'වාර්තා',
    addVehicle: 'වාහනයක් එකතු කරන්න', addTrip: 'ගමනක් එකතු කරන්න',
    vehicleNo: 'වාහන අංකය', vehicleType: 'වාහන වර්ගය',
    driverName: 'රියදුරු නම', driverPhone: 'දුරකථනය',
    status: 'තත්ත්වය', active: 'සක්‍රීය', inactive: 'නිෂ්ක්‍රීය',
    tripDate: 'ගමන් දිනය', customer: 'පාරිභෝගිකයා',
    fare: 'ප්‍රවාහන ගාස්තුව', paidAmount: 'ගෙවන ලද මුදල',
    balanceDue: 'ඉතිරි ණය', save: 'සුරකින්න', cancel: 'අවලංගු',
    saving: 'සුරකිමින්...', noData: 'දත්ත නොමැත', amount: 'මුදල',
    totalIncome: 'මුළු ආදායම', totalExpense: 'මුළු වියදම',
    netProfit: 'ශුද්ධ ලාභය', allVehicles: 'සියලුම වාහන',
    selectVehicle: 'වාහනයක් තෝරන්න', totalBill: 'මුළු බිල්පත',
    received: 'ලැබුණු', close: 'වසන්න', print: 'මුද්‍රණය',
    sendBill: 'යවන්න', truck: 'ට්‍රක්', van: 'වෑන්',
    lorry: 'ලොරි', pickup: 'පිකප්', guestCustomer: 'Guest',
    from: 'සිට', to: 'දක්වා',
    searchCustomer: 'පාරිභෝගිකයා සොයන්න... (උදා: වීර චන්)',
    searchTrips: 'ගමන් සොයන්න... (නම, දුරකථන, ස්ථානය...)',
    paymentMethod: 'ගෙවීම් ක්‍රමය', cash: 'මුදල්', bank: 'බැංකු', credit: 'ණය',
    addGoods: 'භාණ්ඩ එකතු කරන්න', goodsName: 'භාණ්ඩ නම',
    qty: 'ප්‍රමාණය', unitPrice: 'එකක මිල', total: 'එකතුව',
    fromLocation: 'ආරම්භ ස්ථානය', toLocation: 'ගමනාන්තය',
    notes: 'සටහන්', vehicle: 'වාහනය', capacity: 'ධාරිතාව',
    noVehicles: 'වාහන නොමැත', tripCount: 'ගමන් ගණන',
    income: 'ආදායම', actions: 'ක්‍රියා', share: 'Share',
    fullyPaid: 'ගෙවා ඇත', cargo: 'භාණ්ඩ', search: 'සොයන්න...',
    filter: 'පෙරහන', headerSubtitle: 'වාහන', tripCountLabel: 'ගමන්',
    totalTrips: 'මුළු ගමන්', totalBilled: 'මුළු බිල්',
    totalReceived: 'මුළු ලැබුණු', totalDue: 'මුළු ඉතිරි',
    date: 'දිනය', route: 'මාර්ගය', paid: 'ගෙවූ', due: 'ඉතිරි',
    summary: 'සාරාංශය', noMatches: 'ගැලපෙන ප්‍රතිඵල නැත',
    notRegistered: 'ලියාපදිංචි නැත', customerName: 'ගනුදෙනුකරු නම',
    phone: 'දුරකථනය', searchResults: 'ප්‍රතිඵල',
    addNewCustomer: 'නව පාරිභෝගිකයකු එකතු කරන්න',
    newCustomer: 'නව පාරිභෝගිකයා',
    customerNotFound: 'පාරිභෝගිකයා හමු නොවීය',
    saveAsNew: 'නව පාරිභෝගිකයකු ලෙස සුරකින්න',
    address: 'ලිපිනය',
    customerSaved: 'පාරිභෝගිකයා සාර්ථකව සුරකින ලදි!',
    customerSaveError: 'පාරිභෝගිකයා සුරැකීමේ දෝෂයකි',
    orAddNew: 'හෝ නව පාරිභෝගිකයකු එකතු කරන්න',
    meterKm: '🛣️ මීටර් / KM',
    meterHours: '⏱️ පැය ගාස්තු',
    meterDays: '📅 දින ගාස්තු',
    meterMonths: '📆 මාස ගාස්තු',
    damage: '⚠️ හානි අය කිරීම',
    meterUnits: 'ගමන් ඒකක (km)',
    meterRate: 'ඒකක ගාස්තුව (Rs./km)',
    hoursCount: 'පැය ගණන',
    hourlyRate: 'පැය ගාස්තුව (Rs./hr)',
    daysCount: 'දින ගණන',
    dailyRate: 'දින ගාස්තුව (Rs./day)',
    monthsCount: 'මාස ගණන',
    monthlyRate: 'මාස ගාස්තුව (Rs./month)',
    damageAmount: 'හානි මුදල (Rs.)',
    damageNote: 'හානි විස්තරය',
    baseFare: 'ප්‍රවාහන ගාස්තු',
    extraCharges: 'අමතර ගාස්තු',
    guestWarning: '⚠️ පාරිභෝගිකයකු තෝරා නොමැති විට සම්පූර්ණ මුදල ගෙවීම අනිවාර්ය වේ!',
    payFullBtn: 'සම්පූර්ණ මුදල ගෙවන්න',
  },
  en: {
    title: 'Vehicle Income Manager',
    vehicles: 'Vehicles', trips: 'Trips', incomeTab: 'Income',
    expenses: 'Expenses', reports: 'Reports',
    addVehicle: 'Add Vehicle', addTrip: 'Add Trip',
    vehicleNo: 'Vehicle No', vehicleType: 'Vehicle Type',
    driverName: 'Driver Name', driverPhone: 'Phone',
    status: 'Status', active: 'Active', inactive: 'Inactive',
    tripDate: 'Trip Date', customer: 'Customer',
    fare: 'Transport Fare', paidAmount: 'Paid Amount',
    balanceDue: 'Balance Due', save: 'Save', cancel: 'Cancel',
    saving: 'Saving...', noData: 'No data', amount: 'Amount',
    totalIncome: 'Total Income', totalExpense: 'Total Expense',
    netProfit: 'Net Profit', allVehicles: 'All Vehicles',
    selectVehicle: 'Select Vehicle', totalBill: 'Total Bill',
    received: 'Received', close: 'Close', print: 'Print',
    sendBill: 'Send', truck: 'Truck', van: 'Van',
    lorry: 'Lorry', pickup: 'Pickup', guestCustomer: 'Guest',
    from: 'From', to: 'To',
    searchCustomer: 'Search customer... (e.g. weer chan)',
    searchTrips: 'Search trips... (name, phone, route...)',
    paymentMethod: 'Payment Method', cash: 'Cash', bank: 'Bank', credit: 'Credit',
    addGoods: 'Add Goods', goodsName: 'Item Name',
    qty: 'Qty', unitPrice: 'Unit Price', total: 'Total',
    fromLocation: 'From', toLocation: 'To',
    notes: 'Notes', vehicle: 'Vehicle', capacity: 'Capacity',
    noVehicles: 'No vehicles', tripCount: 'Trip Count',
    income: 'Income', actions: 'Actions', share: 'Share',
    fullyPaid: 'Fully Paid', cargo: 'Cargo', search: 'Search...',
    filter: 'Filter', headerSubtitle: 'vehicles', tripCountLabel: 'trips',
    totalTrips: 'Total Trips', totalBilled: 'Total Billed',
    totalReceived: 'Total Received', totalDue: 'Total Due',
    date: 'Date', route: 'Route', paid: 'Paid', due: 'Due',
    summary: 'Summary', noMatches: 'No matches found',
    notRegistered: 'Not registered', customerName: 'Customer Name',
    phone: 'Phone', searchResults: 'results',
    addNewCustomer: 'Add New Customer',
    newCustomer: 'New Customer',
    customerNotFound: 'Customer not found',
    saveAsNew: 'Save as New Customer',
    address: 'Address',
    customerSaved: 'Customer saved successfully!',
    customerSaveError: 'Error saving customer',
    orAddNew: 'or add new customer',
    meterKm: '🛣️ Meter / KM',
    meterHours: '⏱️ Hours',
    meterDays: '📅 Days',
    meterMonths: '📆 Months',
    damage: '⚠️ Damage Charges',
    meterUnits: 'Units (km)',
    meterRate: 'Rate (Rs./km)',
    hoursCount: 'Hours',
    hourlyRate: 'Hourly Rate (Rs./hr)',
    daysCount: 'Days',
    dailyRate: 'Daily Rate (Rs./day)',
    monthsCount: 'Months',
    monthlyRate: 'Monthly Rate (Rs./month)',
    damageAmount: 'Damage Amount (Rs.)',
    damageNote: 'Damage Description',
    baseFare: 'Base Fare',
    extraCharges: 'Extra Charges',
    guestWarning: '⚠️ Full payment is mandatory when no registered customer is selected!',
    payFullBtn: 'Pay Full Amount',
  },
};

/* ═══════════════════════════════════════
   STYLES
   ═══════════════════════════════════════ */
const S = {
  container: { maxWidth: 1400, margin: '0 auto', padding: 20, minHeight: '100vh', fontFamily: 'inherit' },
  header: { background: 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)', padding: 30, borderRadius: 20, marginBottom: 30, color: 'white', textAlign: 'center' },
  tabs: { display: 'flex', gap: 12, background: 'white', borderRadius: 16, padding: 10, marginBottom: 25, overflowX: 'auto' },
  card: { background: 'white', borderRadius: 20, padding: 30, boxShadow: '0 10px 40px rgba(0,0,0,0.1)', marginBottom: 25 },
  th: { padding: '14px 16px', textAlign: 'left', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' },
  td: { padding: '14px 16px', borderBottom: '1px solid #f1f5f9', fontSize: 14 },
  input: { width: '100%', padding: '12px 14px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 14, boxSizing: 'border-box', outline: 'none' },
  searchInput: { width: '100%', padding: '12px 16px', border: '2px solid #667eea', borderRadius: 10, fontSize: 14, boxSizing: 'border-box', outline: 'none', background: '#f8f9ff' },
  label: { display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 5 },
  btn: (bg = '#3b82f6', c = 'white') => ({ padding: '10px 20px', background: bg, color: c, border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14 }),
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: 'white', borderRadius: 20, width: '95%', maxWidth: 720, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.3)' },
  modalHdr: (bg = '#667eea') => ({ background: `linear-gradient(135deg,${bg},${bg}cc)`, padding: '20px 24px', borderRadius: '20px 20px 0 0', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }),
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  badge: (bg, c) => ({ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: bg, color: c, display: 'inline-block' }),
};

/* ════════════════════════════════════════
   useLanguage HOOK
   ════════════════════════════════════════ */
function useLanguage() {
  const [lang, setLang] = useState('si');
  useEffect(() => {
    try { const saved = localStorage.getItem('language'); if (saved === 'en' || saved === 'si') setLang(saved); } catch {}
    const handleLangEvent = (e) => { const newLang = e.detail || 'si'; setLang(newLang); };
    const handleStorage = () => { try { const s = localStorage.getItem('language'); if (s === 'en' || s === 'si') setLang(s); } catch {} };
    window.addEventListener('app-language-change', handleLangEvent);
    window.addEventListener('storage', handleStorage);
    const interval = setInterval(() => { try { const s = localStorage.getItem('language'); if (s && s !== lang) setLang(s); } catch {} }, 1000);
    return () => { window.removeEventListener('app-language-change', handleLangEvent); window.removeEventListener('storage', handleStorage); clearInterval(interval); };
  }, [lang]);
  const t = useMemo(() => TRANSLATIONS[lang] || TRANSLATIONS.si, [lang]);
  return { lang, t };
}

/* ════════════════════════════════════════════════════════════════
   ADD NEW CUSTOMER MINI FORM (inline in dropdown)
   ════════════════════════════════════════════════════════════════ */
function AddNewCustomerInline({ uid, initialName, initialPhone, onSaved, onCancel, t }) {
  const [form, setForm] = useState({
    name: initialName || '',
    phone: initialPhone || '',
    address: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name.trim() && !form.phone.trim()) return;
    setSaving(true);
    try {
      const customerData = {
        uid,
        name: form.name.trim(),
        phone: normalizePhone(form.phone),
        address: form.address.trim(),
        currentBalance: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        source: 'vehicleTrip',
      };
      const docRef = await addDoc(collection(db, 'customers'), customerData);
      onSaved({ id: docRef.id, ...customerData });
    } catch (e) {
      console.error('Save customer error:', e);
      alert((t.customerSaveError || 'Error') + ': ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 16, background: '#f0fdf4', borderTop: '2px solid #10b981' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>➕</span>
        <span style={{ fontWeight: 800, color: '#10b981', fontSize: 14 }}>
          {t.addNewCustomer}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          placeholder={t.customerName + ' *'}
          style={{ ...S.input, border: '2px solid #bbf7d0', fontSize: 13 }}
          autoFocus
        />
        <input
          value={form.phone}
          onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
          placeholder={t.phone + ' (07X XXX XXXX)'}
          style={{ ...S.input, border: '2px solid #bbf7d0', fontSize: 13 }}
        />
        <input
          value={form.address}
          onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
          placeholder={t.address}
          style={{ ...S.input, border: '2px solid #bbf7d0', fontSize: 13 }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onCancel}
            style={{ ...S.btn('#f1f5f9', '#64748b'), flex: 1, padding: '8px 14px', fontSize: 12 }}
          >
            {t.cancel}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (!form.name.trim() && !form.phone.trim())}
            style={{
              ...S.btn(saving ? '#94a3b8' : '#10b981'),
              flex: 2, padding: '8px 14px', fontSize: 12,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? '⏳...' : `💾 ${t.saveAsNew}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   CUSTOMER SEARCH — Fuzzy + Add New Customer
   ════════════════════════════════════════════════════════════════ */
function CustomerSearch({ uid, value, onChange, placeholder, t }) {
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [showAddNew, setShowAddNew] = useState(false);
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
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setShowAddNew(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return customers.slice(0, 12);
    return customers.filter((c) => fuzzyMatch(customerSearchStr(c), q)).slice(0, 10);
  }, [customers, q]);

  const isPhoneSearch = useMemo(() => {
    const cleaned = (q || '').replace(/[\s\-\(\)]/g, '');
    return /^\d{3,}$/.test(cleaned);
  }, [q]);

  const selected = customers.find((c) => c.id === value);

  const handleNewCustomerSaved = (newCust) => {
    onChange(newCust.id, newCust);
    setShowAddNew(false);
    setOpen(false);
    setQ('');
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          ...S.input, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
          background: selected ? '#f0fdf4' : 'white',
          borderColor: selected ? '#10b981' : '#e2e8f0',
        }}
      >
        {selected ? (
          <>
            {getCustomerPicture(selected) ? (
              <img src={getCustomerPicture(selected)} alt=""
                style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>👤</div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{selected.name}</div>
              {selected.phone && <div style={{ fontSize: 11, color: '#64748b' }}>{selected.phone}</div>}
            </div>
            {getCustomerBalance(selected) > 0 && (
              <span style={S.badge('#fef2f2', '#dc2626')}>Rs.{getCustomerBalance(selected).toLocaleString()}</span>
            )}
            <button onClick={(e) => { e.stopPropagation(); onChange(null, null); setQ(''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16 }}>✕</button>
          </>
        ) : (
          <span style={{ color: '#94a3b8' }}>{placeholder || t.searchCustomer}</span>
        )}
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 99,
          background: 'white', border: '2px solid #e2e8f0', borderRadius: 12,
          boxShadow: '0 10px 30px rgba(0,0,0,0.15)', overflow: 'hidden',
        }}>
          <div style={{ padding: 10, borderBottom: '1px solid #e2e8f0' }}>
            <input
              autoFocus value={q}
              onChange={(e) => { setQ(e.target.value); setShowAddNew(false); }}
              placeholder={t.searchCustomer}
              style={{ ...S.searchInput, fontSize: 13 }}
            />
            {q && (
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, paddingLeft: 2 }}>
                🔍 &quot;{q}&quot; — {filtered.length} {t.searchResults || 'results'}
              </div>
            )}
          </div>

          {!showAddNew && (
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              <div
                onClick={() => { onChange('guest', null); setOpen(false); setQ(''); }}
                style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
              >
                <span style={{ fontSize: 20 }}>👤</span>
                <span style={{ fontWeight: 600, color: '#475569' }}>{t.guestCustomer} ({t.notRegistered})</span>
              </div>

              {filtered.map((c) => (
                <div key={c.id}
                  onClick={() => { onChange(c.id, c); setOpen(false); setQ(''); }}
                  style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10, background: c.id === value ? '#f0fdf4' : 'white' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f0f9ff'}
                  onMouseLeave={(e) => e.currentTarget.style.background = c.id === value ? '#f0fdf4' : 'white'}
                >
                  {getCustomerPicture(c) ? (
                    <img src={getCustomerPicture(c)} alt=""
                      style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>👤</div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{c.name}</div>
                    {c.phone && <div style={{ fontSize: 12, color: '#64748b' }}>{c.phone}</div>}
                    {c.address && <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.address}</div>}
                  </div>
                  {getCustomerBalance(c) > 0 && (
                    <span style={S.badge('#fef2f2', '#dc2626')}>Rs.{getCustomerBalance(c).toLocaleString()}</span>
                  )}
                </div>
              ))}

              {q.trim() && filtered.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center' }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>
                  <div style={{ color: '#94a3b8', marginBottom: 12, fontSize: 14 }}>
                    {t.customerNotFound}
                  </div>
                  <button
                    onClick={() => setShowAddNew(true)}
                    style={{
                      ...S.btn('#10b981'), padding: '10px 24px', fontSize: 14,
                      display: 'flex', alignItems: 'center', gap: 8, margin: '0 auto',
                    }}
                  >
                    ➕ {t.addNewCustomer}
                  </button>
                </div>
              )}

              {q.trim() && filtered.length > 0 && (
                <div
                  onClick={() => setShowAddNew(true)}
                  style={{
                    padding: '12px 14px', cursor: 'pointer',
                    borderTop: '2px solid #e2e8f0',
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: '#f0fdf4',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#dcfce7'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#f0fdf4'}
                >
                  <span style={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: '#10b981', color: 'white', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800,
                  }}>+</span>
                  <div>
                    <div style={{ fontWeight: 700, color: '#10b981', fontSize: 13 }}>
                      ➕ {t.addNewCustomer}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      {t.orAddNew}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {showAddNew && (
            <AddNewCustomerInline
              uid={uid}
              initialName={isPhoneSearch ? '' : q}
              initialPhone={isPhoneSearch ? q : ''}
              onSaved={handleNewCustomerSaved}
              onCancel={() => setShowAddNew(false)}
              t={t}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════
   ADD VEHICLE MODAL
   ════════════════════════════════════════ */
function AddVehicleModal({ basePath, onClose, onSaved, t }) {
  const [form, setForm] = useState({ vehicleNo: '', vehicleType: 'truck', driverName: '', driverPhone: '', capacity: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const vehicleTypes = [
    { value: 'truck', label: `🚛 ${t.truck}` }, { value: 'van', label: `🚐 ${t.van}` },
    { value: 'lorry', label: `🚚 ${t.lorry}` }, { value: 'pickup', label: `🛻 ${t.pickup}` },
  ];
  const handleSave = async () => {
    if (!form.vehicleNo.trim()) return alert(t.vehicleNo + '!');
    setSaving(true);
    try {
      await addDoc(collection(db, `${basePath}/vehicles`), { ...form, isActive: true, createdAt: serverTimestamp() });
      onSaved?.(); onClose();
    } catch (e) { alert('Error: ' + e.message); } finally { setSaving(false); }
  };
  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.modalHdr('#10b981')}>
          <h3 style={{ margin: 0, fontSize: 18 }}>🚛 {t.addVehicle}</h3>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={S.grid2}>
            <div><label style={S.label}>{t.vehicleNo} *</label><input value={form.vehicleNo} onChange={(e) => setForm((p) => ({ ...p, vehicleNo: e.target.value.toUpperCase() }))} style={S.input} placeholder="ABC-1234" /></div>
            <div><label style={S.label}>{t.vehicleType}</label><select value={form.vehicleType} onChange={(e) => setForm((p) => ({ ...p, vehicleType: e.target.value }))} style={S.input}>{vehicleTypes.map((vt) => <option key={vt.value} value={vt.value}>{vt.label}</option>)}</select></div>
          </div>
          <div style={S.grid2}>
            <div><label style={S.label}>{t.driverName}</label><input value={form.driverName} onChange={(e) => setForm((p) => ({ ...p, driverName: e.target.value }))} style={S.input} /></div>
            <div><label style={S.label}>{t.driverPhone}</label><input value={form.driverPhone} onChange={(e) => setForm((p) => ({ ...p, driverPhone: e.target.value }))} style={S.input} placeholder="07X XXX XXXX" /></div>
          </div>
          <div><label style={S.label}>{t.capacity}</label><input value={form.capacity} onChange={(e) => setForm((p) => ({ ...p, capacity: e.target.value }))} style={S.input} placeholder="10 Ton" /></div>
          <div><label style={S.label}>{t.notes}</label><textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} style={{ ...S.input, height: 70, resize: 'vertical' }} /></div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={onClose} style={{ ...S.btn('#f1f5f9', '#475569'), flex: 1 }}>{t.cancel}</button>
            <button onClick={handleSave} disabled={saving} style={{ ...S.btn('#10b981'), flex: 2 }}>{saving ? t.saving : `💾 ${t.save}`}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   ★★★ ADD TRIP MODAL — Easy Input UX + Guest Full Pay Enforcement ★★★
════════════════════════════════════════ */
function AddTripModal({ basePath, uid, vehicles, onClose, onSaved, t, lang }) {
  const [form, setForm] = useState({
    tripDate: todayStr(), vehicleId: '', customerId: '', customerName: '', customerPhone: '',
    fromLocation: '', toLocation: '', fare: '', paidAmount: '', paymentMethod: 'cash', notes: '',
    useMeter: false, meterUnits: '', meterRate: '',
    useHours: false, meterHours: '', hourlyRate: '',
    useDays: false, meterDays: '', dailyRate: '',
    useMonths: false, meterMonths: '', monthlyRate: '',
    useDamage: false, damageAmount: '', damageNote: '',
  });
  const [cargoItems, setCargoItems] = useState([]);
  const [saving, setSaving] = useState(false);

  const fare = R2(form.fare);
  const meterTotal = form.useMeter ? R2(R2(form.meterUnits) * R2(form.meterRate)) : 0;
  const hoursTotal = form.useHours ? R2(R2(form.meterHours) * R2(form.hourlyRate)) : 0;
  const daysTotal = form.useDays ? R2(R2(form.meterDays) * R2(form.dailyRate)) : 0;
  const monthsTotal = form.useMonths ? R2(R2(form.meterMonths) * R2(form.monthlyRate)) : 0;
  const damageAmt = form.useDamage ? R2(form.damageAmount) : 0;
  const cargoTotal = cargoItems.reduce((s, ci) => s + R2(ci.total), 0);
  const totalBill = R2(fare + meterTotal + hoursTotal + daysTotal + monthsTotal + damageAmt + cargoTotal);
  const paid = R2(form.paidAmount);
  const balanceDue = R2(totalBill - paid);

  const isGuest = !form.customerId;

  const addCargoItem = () => setCargoItems((p) => [...p, { goodsName: '', qty: 1, unitPrice: '', total: 0 }]);
  const updateCargo = (idx, field, val) => {
    setCargoItems((p) => {
      const n = [...p];
      n[idx] = { ...n[idx], [field]: val };
      if (field === 'qty' || field === 'unitPrice') {
        n[idx].total = R2(R2(n[idx].qty) * R2(n[idx].unitPrice));
      }
      return n;
    });
  };
  const removeCargo = (idx) => setCargoItems((p) => p.filter((_, i) => i !== idx));

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
    if (!form.fare && cargoItems.length === 0 && !meterTotal && !hoursTotal && !daysTotal && !monthsTotal) {
      return alert(t.fare + '!');
    }

    // ★★★ ENFORCE FULL PAYMENT FOR GUEST / UNREGISTERED CUSTOMERS ★★★
    if (isGuest && balanceDue > 0.01) {
      alert(t.guestWarning || '⚠️ පාරිභෝගිකයකු තෝරා නොමැති විට සම්පූර්ණ මුදල ගෙවිය යුතුය!');
      return;
    }

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
        meterUnits: form.useMeter ? R2(form.meterUnits) : 0,
        meterRate: form.useMeter ? R2(form.meterRate) : 0,
        meterKmTotal: meterTotal,
        meterHours: form.useHours ? R2(form.meterHours) : 0,
        hourlyRate: form.useHours ? R2(form.hourlyRate) : 0,
        meterHoursTotal: hoursTotal,
        meterDays: form.useDays ? R2(form.meterDays) : 0,
        dailyRate: form.useDays ? R2(form.dailyRate) : 0,
        meterDaysTotal: daysTotal,
        meterMonths: form.useMonths ? R2(form.meterMonths) : 0,
        monthlyRate: form.useMonths ? R2(form.monthlyRate) : 0,
        meterMonthsTotal: monthsTotal,
        damageAmount: damageAmt,
        damageNote: form.useDamage ? form.damageNote.trim() : '',
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
            amount: totalBill,
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

  /* Enhanced Meter/Hours/Days/Months Row with Easy Inputs & Quick Presets */
  const MeterRow = ({ icon, label, useKey, unitsKey, rateKey, unitsLabel, rateLabel, unitSuffix, total, presets }) => (
    <div style={{
      background: form[useKey] ? '#f0f9ff' : '#f8fafc',
      borderRadius: 12, padding: 14,
      border: `2px solid ${form[useKey] ? '#bfdbfe' : '#e2e8f0'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: form[useKey] ? 12 : 0 }}>
        <button
          type="button"
          onClick={() => setForm((p) => ({ ...p, [useKey]: !p[useKey] }))}
          style={{
            width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
            background: form[useKey] ? '#3b82f6' : '#d1d5db',
            position: 'relative', padding: 0, flexShrink: 0, transition: 'background 0.2s',
          }}
        >
          <span style={{
            position: 'absolute', top: 2, left: form[useKey] ? 22 : 2,
            width: 20, height: 20, borderRadius: '50%', background: 'white',
            transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 700, color: form[useKey] ? '#1d4ed8' : '#64748b' }}>
          {icon} {label}
        </span>
        {form[useKey] && total > 0 && (
          <span style={{ marginLeft: 'auto', fontWeight: 900, color: '#1d4ed8', fontSize: 16 }}>
            {formatCurrency(total)}
          </span>
        )}
      </div>

      {form[useKey] && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
            <div>
              <label style={S.label}>{unitsLabel}</label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={form[unitsKey]}
                onChange={(e) => setForm((p) => ({ ...p, [unitsKey]: e.target.value }))}
                style={{ ...S.input, color: '#1d4ed8', fontWeight: 800, fontSize: 18, textAlign: 'center' }}
                placeholder={`0 ${unitSuffix}`}
              />
            </div>
            <div>
              <label style={S.label}>{rateLabel}</label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={form[rateKey]}
                onChange={(e) => setForm((p) => ({ ...p, [rateKey]: e.target.value }))}
                style={{ ...S.input, color: '#16a34a', fontWeight: 800, fontSize: 18, textAlign: 'center' }}
                placeholder="0.00"
              />
            </div>
          </div>
          {presets && presets.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {presets.map((p) => (
                <button
                  key={p.v}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, [unitsKey]: String(p.v) }))}
                  style={{
                    padding: '5px 10px', borderRadius: 8,
                    border: String(form[unitsKey]) === String(p.v) ? '2px solid #3b82f6' : '1px solid #cbd5e1',
                    background: String(form[unitsKey]) === String(p.v) ? '#dbeafe' : '#ffffff',
                    color: String(form[unitsKey]) === String(p.v) ? '#1d4ed8' : '#475569',
                    fontWeight: 700, fontSize: 11, cursor: 'pointer',
                  }}
                >
                  {p.l}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div style={S.overlay}>
      <div style={{ ...S.modal, maxWidth: 720 }}>
        <div style={S.modalHdr('#667eea')}>
          <h3 style={{ margin: 0, fontSize: 18 }}>🚛 {t.addTrip}</h3>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Date & Vehicle */}
          <div style={S.grid2}>
            <div><label style={S.label}>{t.tripDate} *</label><input type="date" value={form.tripDate} onChange={(e) => setForm((p) => ({ ...p, tripDate: e.target.value }))} style={S.input} /></div>
            <div>
              <label style={S.label}>{t.vehicle} *</label>
              <select value={form.vehicleId} onChange={(e) => setForm((p) => ({ ...p, vehicleId: e.target.value }))} style={S.input}>
                <option value="">{t.selectVehicle}</option>
                {vehicles.filter((v) => v.isActive !== false).map((v) => (
                  <option key={v.id} value={v.id}>{v.vehicleNo} — {v.vehicleType}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Customer Selection */}
          <div>
            <label style={S.label}>{t.customer}</label>
            <CustomerSearch uid={uid} value={form.customerId} onChange={handleCustomerChange} t={t} />
            {!form.customerId && (
              <div style={{ ...S.grid2, marginTop: 10 }}>
                <input value={form.customerName} onChange={(e) => setForm((p) => ({ ...p, customerName: e.target.value }))} style={S.input} placeholder={`${t.customerName} (Guest)`} />
                <input value={form.customerPhone} onChange={(e) => setForm((p) => ({ ...p, customerPhone: e.target.value }))} style={S.input} placeholder={`${t.phone} (Optional)`} />
              </div>
            )}
          </div>

          {/* Route */}
          <div style={S.grid2}>
            <div><label style={S.label}>{t.fromLocation}</label><input value={form.fromLocation} onChange={(e) => setForm((p) => ({ ...p, fromLocation: e.target.value }))} style={S.input} placeholder="Start Location" /></div>
            <div><label style={S.label}>{t.toLocation}</label><input value={form.toLocation} onChange={(e) => setForm((p) => ({ ...p, toLocation: e.target.value }))} style={S.input} placeholder="Destination" /></div>
          </div>

          {/* Base Transport Fare */}
          <div>
            <label style={S.label}>🚛 {t.baseFare} (Rs.)</label>
            <input
              type="number" inputMode="decimal" step="any" min="0"
              value={form.fare}
              onChange={(e) => setForm((p) => ({ ...p, fare: e.target.value }))}
              style={{ ...S.input, fontSize: 20, fontWeight: 800, color: '#2563eb' }}
              placeholder="0.00"
            />
          </div>

          {/* Extra Charges (Meter, Hours, Days, Months, Damage) */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#475569', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>⚙️ {t.extraCharges}</span>
              <span style={{ fontSize: 11, background: '#e0e7ff', color: '#4338ca', padding: '2px 8px', borderRadius: 8 }}>Optional</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <MeterRow
                icon="🛣️" label={t.meterKm} useKey="useMeter" unitsKey="meterUnits" rateKey="meterRate"
                unitsLabel={t.meterUnits} rateLabel={t.meterRate} unitSuffix="km" total={meterTotal}
                presets={[{ v: 5, l: '5km' }, { v: 10, l: '10km' }, { v: 25, l: '25km' }, { v: 50, l: '50km' }, { v: 100, l: '100km' }]}
              />

              <MeterRow
                icon="⏱️" label={t.meterHours} useKey="useHours" unitsKey="meterHours" rateKey="hourlyRate"
                unitsLabel={t.hoursCount} rateLabel={t.hourlyRate} unitSuffix="hrs" total={hoursTotal}
                presets={[{ v: 1, l: '1hr' }, { v: 2, l: '2hrs' }, { v: 4, l: '4hrs' }, { v: 8, l: '8hrs' }, { v: 12, l: '12hrs' }]}
              />

              <MeterRow
                icon="📅" label={t.meterDays} useKey="useDays" unitsKey="meterDays" rateKey="dailyRate"
                unitsLabel={t.daysCount} rateLabel={t.dailyRate} unitSuffix="days" total={daysTotal}
                presets={[{ v: 1, l: '1 day' }, { v: 2, l: '2 days' }, { v: 3, l: '3 days' }, { v: 7, l: '1 wk' }, { v: 14, l: '2 wks' }, { v: 30, l: '1 mo' }]}
              />

              <MeterRow
                icon="📆" label={t.meterMonths} useKey="useMonths" unitsKey="meterMonths" rateKey="monthlyRate"
                unitsLabel={t.monthsCount} rateLabel={t.monthlyRate} unitSuffix="months" total={monthsTotal}
                presets={[{ v: 1, l: '1 mo' }, { v: 2, l: '2 mos' }, { v: 3, l: '3 mos' }, { v: 6, l: '6 mos' }, { v: 12, l: '1 yr' }]}
              />

              {/* Damage Charges */}
              <div style={{ background: form.useDamage ? '#fff7ed' : '#f8fafc', borderRadius: 12, padding: 14, border: `2px solid ${form.useDamage ? '#fed7aa' : '#e2e8f0'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: form.useDamage ? 12 : 0 }}>
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, useDamage: !p.useDamage }))}
                    style={{
                      width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                      background: form.useDamage ? '#f97316' : '#d1d5db',
                      position: 'relative', padding: 0, flexShrink: 0, transition: 'background 0.2s',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 2, left: form.useDamage ? 22 : 2,
                      width: 20, height: 20, borderRadius: '50%', background: 'white',
                      transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </button>
                  <span style={{ fontSize: 14, fontWeight: 700, color: form.useDamage ? '#ea580c' : '#64748b' }}>
                    ⚠️ {t.damage}
                  </span>
                  {form.useDamage && damageAmt > 0 && (
                    <span style={{ marginLeft: 'auto', fontWeight: 900, color: '#dc2626', fontSize: 16 }}>
                      {formatCurrency(damageAmt)}
                    </span>
                  )}
                </div>
                {form.useDamage && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={S.label}>{t.damageAmount}</label>
                      <input
                        type="number" inputMode="decimal" min="0" step="any"
                        value={form.damageAmount}
                        onChange={(e) => setForm((p) => ({ ...p, damageAmount: e.target.value }))}
                        style={{ ...S.input, color: '#dc2626', fontWeight: 800, fontSize: 18, border: '2px solid #fecaca' }}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label style={S.label}>{t.damageNote}</label>
                      <input
                        value={form.damageNote}
                        onChange={(e) => setForm((p) => ({ ...p, damageNote: e.target.value }))}
                        style={{ ...S.input, border: '2px solid #fecaca' }}
                        placeholder="හානි විස්තරය..."
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Cargo Goods */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <label style={{ ...S.label, margin: 0 }}>📦 {t.cargo} (Optional)</label>
              <button onClick={addCargoItem} style={S.btn('#8b5cf6')}>+ {t.addGoods}</button>
            </div>
            {cargoItems.map((ci, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input value={ci.goodsName} onChange={(e) => updateCargo(idx, 'goodsName', e.target.value)} style={{ ...S.input, marginBottom: 0 }} placeholder={t.goodsName} />
                <input type="number" inputMode="decimal" value={ci.qty} onChange={(e) => updateCargo(idx, 'qty', e.target.value)} style={{ ...S.input, marginBottom: 0 }} placeholder={t.qty} />
                <input type="number" inputMode="decimal" value={ci.unitPrice} onChange={(e) => updateCargo(idx, 'unitPrice', e.target.value)} style={{ ...S.input, marginBottom: 0 }} placeholder={t.unitPrice} />
                <div style={{ padding: '12px 10px', background: '#f0fdf4', borderRadius: 8, textAlign: 'center', fontWeight: 700, fontSize: 13, color: '#16a34a' }}>Rs.{ci.total.toLocaleString()}</div>
                <button onClick={() => removeCargo(idx)} style={{ background: '#fee2e2', border: 'none', borderRadius: 8, width: 34, height: 44, cursor: 'pointer', color: '#dc2626', fontSize: 16 }}>✕</button>
              </div>
            ))}
          </div>

          {/* Bill Summary */}
          <div style={{ background: 'linear-gradient(135deg,#f0f9ff,#eff6ff)', borderRadius: 14, padding: 16, border: '2px solid #bfdbfe' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1e40af', marginBottom: 10 }}>📋 Bill Summary</div>
            {fare > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}><span style={{ color: '#64748b' }}>🚛 {t.baseFare}:</span><span style={{ fontWeight: 700 }}>{formatCurrency(fare)}</span></div>}
            {meterTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}><span style={{ color: '#64748b' }}>🛣️ Meter ({form.meterUnits} km × Rs.{form.meterRate}):</span><span style={{ fontWeight: 700, color: '#1d4ed8' }}>{formatCurrency(meterTotal)}</span></div>}
            {hoursTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}><span style={{ color: '#64748b' }}>⏱️ Hours ({form.meterHours} hrs × Rs.{form.hourlyRate}):</span><span style={{ fontWeight: 700, color: '#1d4ed8' }}>{formatCurrency(hoursTotal)}</span></div>}
            {daysTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}><span style={{ color: '#64748b' }}>📅 Days ({form.meterDays} days × Rs.{form.dailyRate}):</span><span style={{ fontWeight: 700, color: '#1d4ed8' }}>{formatCurrency(daysTotal)}</span></div>}
            {monthsTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}><span style={{ color: '#64748b' }}>📆 Months ({form.meterMonths} mos × Rs.{form.monthlyRate}):</span><span style={{ fontWeight: 700, color: '#1d4ed8' }}>{formatCurrency(monthsTotal)}</span></div>}
            {cargoTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}><span style={{ color: '#64748b' }}>📦 {t.cargo}:</span><span style={{ fontWeight: 700 }}>{formatCurrency(cargoTotal)}</span></div>}
            {damageAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}><span style={{ color: '#dc2626' }}>⚠️ {t.damage}:</span><span style={{ fontWeight: 700, color: '#dc2626' }}>{formatCurrency(damageAmt)}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '2px solid #bfdbfe', marginTop: 6 }}>
              <span style={{ fontWeight: 800, fontSize: 16 }}>{t.totalBill}:</span>
              <span style={{ fontWeight: 900, fontSize: 22, color: '#1d4ed8' }}>{formatCurrency(totalBill)}</span>
            </div>
          </div>

          {/* Payment Input */}
          <div style={S.grid2}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <label style={{ ...S.label, margin: 0 }}>{t.paidAmount} (Rs.)</label>
                {totalBill > 0 && (
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, paidAmount: String(totalBill) }))}
                    style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#15803d', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, cursor: 'pointer' }}
                  >
                    ⚡ {t.payFullBtn || 'Full'}
                  </button>
                )}
              </div>
              <input
                type="number" inputMode="decimal" step="any" min="0"
                value={form.paidAmount}
                onChange={(e) => setForm((p) => ({ ...p, paidAmount: e.target.value }))}
                style={{ ...S.input, fontSize: 18, fontWeight: 800, color: '#16a34a' }}
                placeholder="0.00"
              />
            </div>
            <div>
              <label style={S.label}>{t.paymentMethod}</label>
              <select value={form.paymentMethod} onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value }))} style={S.input}>
                <option value="cash">💵 {t.cash}</option>
                <option value="bank">🏦 {t.bank}</option>
                <option value="credit">🔴 {t.credit}</option>
              </select>
            </div>
          </div>

          {/* Guest Full-Payment Warning */}
          {isGuest && balanceDue > 0.01 && (
            <div style={{
              padding: '12px 16px', background: '#fef2f2', borderRadius: 10,
              border: '2px solid #fecaca', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 24 }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, color: '#dc2626', fontSize: 13 }}>
                  {t.guestWarning}
                </div>
                <div style={{ fontSize: 11, color: '#991b1b', marginTop: 2 }}>
                  Due: {formatCurrency(balanceDue)} — Please click Full or select a registered customer to allow credit.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, paidAmount: String(totalBill) }))}
                style={{ padding: '6px 12px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Pay Full
              </button>
            </div>
          )}

          {!isGuest && balanceDue > 0.01 && (
            <div style={{ padding: '10px 16px', background: '#fef2f2', borderRadius: 10, border: '2px solid #fecaca', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: '#dc2626' }}>⚠️ {t.balanceDue}:</span>
              <span style={{ fontWeight: 900, fontSize: 18, color: '#dc2626' }}>{formatCurrency(balanceDue)}</span>
            </div>
          )}

          <div><label style={S.label}>{t.notes}</label><textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} style={{ ...S.input, height: 70, resize: 'vertical' }} placeholder="Notes / Remarks..." /></div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={onClose} style={{ ...S.btn('#f1f5f9', '#475569'), flex: 1 }}>{t.cancel}</button>
            <button
              onClick={handleSave}
              disabled={saving || (isGuest && balanceDue > 0.01)}
              style={{
                ...S.btn(isGuest && balanceDue > 0.01 ? '#94a3b8' : '#667eea'),
                flex: 2,
                cursor: (isGuest && balanceDue > 0.01) ? 'not-allowed' : 'pointer',
              }}
            >
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
          <div><label style={S.label}>{t.from}</label><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={S.input} /></div>
          <div><label style={S.label}>{t.to}</label><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={S.input} /></div>
          <div><label style={S.label}>{t.vehicle}</label><select value={filterVehicle} onChange={(e) => setFilterVehicle(e.target.value)} style={S.input}><option value="">{t.allVehicles}</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.vehicleNo}</option>)}</select></div>
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
                <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: '#94a3b8', padding: 40 }}>{t.noData}</td></tr>
              ) : (
                filtered.map((tr) => {
                  const due = R2(tr.balanceDue || 0);
                  return (
                    <tr key={tr.id}>
                      <td style={S.td}>{formatDate(tr.tripDate)}</td>
                      <td style={S.td}><span style={S.badge('#e0e7ff', '#4338ca')}>{tr.vehicleName || '-'}</span></td>
                      <td style={S.td}>{tr.customerName || t.guestCustomer}</td>
                      <td style={{ ...S.td, fontSize: 12, color: '#64748b' }}>{[tr.fromLocation, tr.toLocation].filter(Boolean).join(' → ') || '-'}</td>
                      <td style={{ ...S.td, fontWeight: 700 }}>{formatCurrency(tr.totalBillAmount)}</td>
                      <td style={{ ...S.td, fontWeight: 700, color: '#16a34a' }}>{formatCurrency(tr.paidAmount)}</td>
                      <td style={S.td}>{due > 0.01 ? <span style={S.badge('#fef2f2', '#dc2626')}>Rs.{due.toLocaleString()}</span> : <span style={S.badge('#f0fdf4', '#16a34a')}>✅</span>}</td>
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

  // ★ Sorter and Filter states for Income History Tab
  const [sortBy, setSortBy] = useState('dateDesc');
  const [payFilter, setPayFilter] = useState('all');

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
    return () => { unsubV(); unsubT(); };
  }, [basePath]);

  /* Multi-criteria Filter & Sort for Income Trips */
  const filteredTrips = useMemo(() => {
    let result = trips.filter((tr) => {
      if (filterVehicle && tr.vehicleId !== filterVehicle) return false;
      if (searchQ && !fuzzyMatch(tripSearchStr(tr), searchQ)) return false;
      if (payFilter === 'paid' && R2(tr.balanceDue || 0) > 0.01) return false;
      if (payFilter === 'unpaid' && R2(tr.balanceDue || 0) <= 0.01) return false;
      return true;
    });

    switch (sortBy) {
      case 'dateAsc':
        result.sort((a, b) => toMs(a.tripDate) - toMs(b.tripDate));
        break;
      case 'amountDesc':
        result.sort((a, b) => R2(b.totalBillAmount || 0) - R2(a.totalBillAmount || 0));
        break;
      case 'amountAsc':
        result.sort((a, b) => R2(a.totalBillAmount || 0) - R2(b.totalBillAmount || 0));
        break;
      case 'nameAZ':
        result.sort((a, b) => (a.customerName || '').localeCompare(b.customerName || ''));
        break;
      case 'nameZA':
        result.sort((a, b) => (b.customerName || '').localeCompare(a.customerName || ''));
        break;
      default: // dateDesc
        result.sort((a, b) => toMs(b.tripDate) - toMs(a.tripDate));
        break;
    }

    return result;
  }, [trips, filterVehicle, searchQ, sortBy, payFilter]);

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
        <InvoiceOutputManager
          invoice={outputInvoice}
          initialMode="whatsapp"
          onClose={() => setOutputInvoice(null)}
        />
      )}
      {showAddTrip && basePath && (
        <AddTripModal
          basePath={basePath}
          uid={user.uid}
          vehicles={vehicles}
          onClose={() => setShowAddTrip(false)}
          onSaved={() => setShowAddTrip(false)}
          t={t}
          lang={lang}
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
              padding: '12px 24px', borderRadius: 12, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8,
              background: activeTab === tab.key ? 'linear-gradient(135deg,#667eea,#764ba2)' : '#f8fafc',
              color: activeTab === tab.key ? 'white' : '#64748b',
              boxShadow: activeTab === tab.key ? '0 4px 12px rgba(102,126,234,0.3)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            <span>{tab.icon}</span><span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'expenses' && <VehicleExpenseTab vehicles={vehicles} lang={lang} />}

      {activeTab === 'income' && (
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>💰 {t.incomeTab || t.income}</h2>
            <button onClick={() => setShowAddTrip(true)} style={S.btn('#667eea')}>+ {t.addTrip}</button>
          </div>

          {/* Sorter & Filter Control Panel */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 2, minWidth: 200 }}>
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder={t.searchTrips}
                style={S.searchInput}
              />
            </div>
            <select
              value={filterVehicle}
              onChange={(e) => setFilterVehicle(e.target.value)}
              style={{ ...S.input, maxWidth: 160 }}
            >
              <option value="">{t.allVehicles}</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.vehicleNo}</option>)}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{ ...S.input, maxWidth: 180 }}
            >
              <option value="dateDesc">📅 {lang === 'si' ? 'අලුත්ම පළමුව' : 'Newest First'}</option>
              <option value="dateAsc">📅 {lang === 'si' ? 'පැරණිම පළමුව' : 'Oldest First'}</option>
              <option value="amountDesc">💰 {lang === 'si' ? 'මුදල (වැඩි→අඩු)' : 'Amount (High→Low)'}</option>
              <option value="amountAsc">💰 {lang === 'si' ? 'මුදල (අඩු→වැඩි)' : 'Amount (Low→High)'}</option>
              <option value="nameAZ">👤 {lang === 'si' ? 'නම (අ-ඔ)' : 'Name (A-Z)'}</option>
              <option value="nameZA">👤 {lang === 'si' ? 'නම (ඔ-අ)' : 'Name (Z-A)'}</option>
            </select>
            <select
              value={payFilter}
              onChange={(e) => setPayFilter(e.target.value)}
              style={{ ...S.input, maxWidth: 140 }}
            >
              <option value="all">{lang === 'si' ? 'සියල්ල' : 'All'}</option>
              <option value="paid">✅ {t.fullyPaid}</option>
              <option value="unpaid">⚠️ {lang === 'si' ? 'ණය ඇති' : 'Unpaid'}</option>
            </select>
          </div>

          {searchQ && (
            <div style={{ marginBottom: 12, fontSize: 13, color: '#64748b' }}>
              🔍 &quot;{searchQ}&quot; — {filteredTrips.length} {t.searchResults || 'ප්‍රතිඵල'}
            </div>
          )}

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
                      <div style={{ fontSize: 40, marginBottom: 10 }}>{searchQ ? '🔍' : '🚛'}</div>
                      {searchQ ? `"${searchQ}" ${t.noMatches}` : t.noData}
                    </td>
                  </tr>
                ) : (
                  filteredTrips.map((tr) => {
                    const due = R2(tr.balanceDue || 0);
                    const hasExtra = R2(tr.meterKmTotal) > 0 || R2(tr.meterHoursTotal) > 0 || R2(tr.meterDaysTotal) > 0 || R2(tr.meterMonthsTotal) > 0 || R2(tr.damageAmount) > 0;
                    return (
                      <tr
                        key={tr.id}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                      >
                        <td style={S.td}>{formatDate(tr.tripDate)}</td>
                        <td style={S.td}><span style={S.badge('#e0e7ff', '#4338ca')}>{tr.vehicleName || '-'}</span></td>
                        <td style={S.td}>
                          <div style={{ fontWeight: 600 }}>{tr.customerName || t.guestCustomer}</div>
                          {tr.customerPhone && <div style={{ fontSize: 11, color: '#64748b' }}>{tr.customerPhone}</div>}
                          {(tr.fromLocation || tr.toLocation) && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{[tr.fromLocation, tr.toLocation].filter(Boolean).join(' → ')}</div>}
                        </td>
                        <td style={{ ...S.td, fontWeight: 700, color: '#2563eb' }}>
                          {formatCurrency(tr.totalBillAmount)}
                          {hasExtra && (
                            <div style={{ fontSize: 10, marginTop: 3, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {R2(tr.meterKmTotal) > 0 && <span style={S.badge('#e0e7ff', '#4338ca')}>🛣️ {formatCurrency(tr.meterKmTotal)}</span>}
                              {R2(tr.meterHoursTotal) > 0 && <span style={S.badge('#fef3c7', '#92400e')}>⏱️ {formatCurrency(tr.meterHoursTotal)}</span>}
                              {R2(tr.meterDaysTotal) > 0 && <span style={S.badge('#f0fdf4', '#166534')}>📅 {formatCurrency(tr.meterDaysTotal)}</span>}
                              {R2(tr.meterMonthsTotal) > 0 && <span style={S.badge('#f5f3ff', '#6d28d9')}>📆 {formatCurrency(tr.meterMonthsTotal)}</span>}
                              {R2(tr.damageAmount) > 0 && <span style={S.badge('#fef2f2', '#dc2626')}>⚠️ {formatCurrency(tr.damageAmount)}</span>}
                            </div>
                          )}
                        </td>
                        <td style={{ ...S.td, fontWeight: 700, color: '#16a34a' }}>{formatCurrency(tr.paidAmount)}</td>
                        <td style={S.td}>
                          {due > 0.01
                            ? <span style={S.badge('#fef2f2', '#dc2626')}>Rs.{due.toLocaleString()}</span>
                            : <span style={S.badge('#f0fdf4', '#16a34a')}>✅ {t.fullyPaid}</span>}
                        </td>
                        <td style={S.td}>
                          <button
                            onClick={() => openOutputManager(tr)}
                            style={{ padding: '7px 14px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🚗 {t.vehicles}</h2>
            <button onClick={() => setShowAddVehicle(true)} style={S.btn('#10b981')}>+ {t.addVehicle}</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
            {vehicles.length === 0 ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                <div style={{ fontSize: 50, marginBottom: 10 }}>🚗</div><div>{t.noVehicles}</div>
              </div>
            ) : (
              vehicles.map((v) => {
                const vTrips = trips.filter((x) => x.vehicleId === v.id);
                const vIncome = vTrips.reduce((s, x) => s + R2(x.paidAmount || 0), 0);
                const typeEmoji = { truck: '🚛', van: '🚐', lorry: '🚚', pickup: '🛻' }[v.vehicleType] || '🚗';
                return (
                  <div key={v.id} style={{ ...S.card, marginBottom: 0, border: '2px solid #e2e8f0', padding: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <span style={{ fontSize: 36 }}>{typeEmoji}</span>
                      <div>
                        <div style={{ fontWeight: 900, fontSize: 18 }}>{v.vehicleNo}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{v.vehicleType}</div>
                      </div>
                      <span style={{ marginLeft: 'auto', ...S.badge(v.isActive !== false ? '#f0fdf4' : '#f1f5f9', v.isActive !== false ? '#16a34a' : '#94a3b8') }}>
                        ● {v.isActive !== false ? t.active : t.inactive}
                      </span>
                    </div>
                    {v.driverName && <div style={{ fontSize: 13, color: '#475569', marginBottom: 6 }}>👨‍💼 {v.driverName} {v.driverPhone && `• ${v.driverPhone}`}</div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
                      <div style={{ textAlign: 'center' }}><div style={{ fontSize: 11, color: '#94a3b8' }}>{t.tripCount}</div><div style={{ fontWeight: 800, color: '#3b82f6' }}>{vTrips.length}</div></div>
                      <div style={{ textAlign: 'center' }}><div style={{ fontSize: 11, color: '#94a3b8' }}>{t.income}</div><div style={{ fontWeight: 800, color: '#16a34a', fontSize: 13 }}>Rs.{vIncome.toLocaleString()}</div></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {activeTab === 'reports' && <ReportsTab trips={trips} vehicles={vehicles} t={t} />}
    </div>
  );
}