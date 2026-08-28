'use client';

// components/VehicleIncomeManager.jsx
// ═══════════════════════════════════════════════════════════════
// v35.0 — Real-Time App-Wide Language Sync with Sidebar Integration
//        + POS-Style Searchable Vehicle Types + Inline Custom Type
//        + Edit Vehicle Modal + Focus Bug Fixed + POS Cargo Picker 
//        + Enhanced Quick Purchase Modal + Stock ON/OFF Toggle
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  collection, addDoc, updateDoc, doc,
  onSnapshot, query, where, orderBy, getDoc,
  Timestamp, serverTimestamp, increment, writeBatch
} from 'firebase/firestore';
import { db } from '@/shared/firebase-config';
import { useUserAuth } from '@/context/UserContext';
import VehicleExpenseTab from './VehicleExpenseTab';
import InvoiceOutputManager from './InvoiceOutputManager';

/* ═══════════════════════════════════════
   1. CONSTANTS & TRANSLATIONS
   ═══════════════════════════════════════ */
const DP = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23e2e8f0' rx='10'/%3E%3Cpath d='M35 60l10-10 10 10 15-15 10 15' stroke='%2394a3b8' stroke-width='4' fill='none'/%3E%3Ccircle cx='65' cy='40' r='5' fill='%2394a3b8'/%3E%3C/svg%3E";

const TRANSLATIONS = {
  si: {
    title: 'වාහන ආදායම් කළමනාකරණය',
    vehicles: 'වාහන', trips: 'ගමන්', incomeTab: 'ආදායම්',
    expenses: 'වියදම්', reports: 'වාර්තා',
    addVehicle: 'වාහනයක් එකතු කරන්න', editVehicle: 'වාහන විස්තර සංස්කරණය',
    addTrip: 'ගමනක් එකතු කරන්න', edit: 'සංස්කරණය',
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
    lorry: 'ලොරි', pickup: 'පිකප්', threewheel: 'ත්‍රීවීලර්',
    car: 'මෝටර් රථ', bus: 'බස් රථ', tractor: 'ට්‍රැක්ටර්', bike: 'යතුරුපැදි',
    guestCustomer: 'ආගන්තුක', from: 'සිට', to: 'දක්වා',
    searchCustomer: 'පාරිභෝගිකයා සොයන්න...',
    searchTrips: 'ගමන් සොයන්න...',
    paymentMethod: 'ගෙවීම් ක්‍රමය', cash: 'මුදල්', bank: 'බැංකු', credit: 'ණය',
    addGoods: '📦 භාණ්ඩ එකතු කරන්න', goodsName: 'භාණ්ඩ නම',
    qty: 'ප්‍රමාණය', unitPrice: 'එකක මිල', total: 'එකතුව',
    fromLocation: 'ආරම්භ ස්ථානය', toLocation: 'ගමනාන්තය',
    notes: 'සටහන්', vehicle: 'වාහනය', capacity: 'ධාරිතාව',
    noVehicles: 'වාහන නොමැත', tripCount: 'ගමන් ගණන',
    income: 'ආදායම', actions: 'ක්‍රියා', share: 'බෙදා ගන්න',
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
    customerSaved: 'පාරිභෝගිකයා සුරකින ලදි!',
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
    searchGoods: 'භාණ්ඩය සොයන්න (නම, කේතය, බාර්කෝඩ්)...',
    stock: 'තොග',
    noItemResults: 'භාණ්ඩ හමු නොවීය',
    manualEntry: '✏️ අතින් ඇතුළත් කරන්න',
    orSearchCatalog: 'හෝ catalog එකෙන් සොයන්න',
    stockOff: '🔓 තොග පාලනය අක්‍රීයයි',
    stockOn: '🔒 තොග පාලනය සක්‍රීයයි',
    outOfStock: '⚠️ තොග අවසන් වී ඇත!',
    quickPurchase: '⚡ ඉක්මන් මිලදී ගැනීම',
    insufficientStock: '⚠️ තොග ප්‍රමාණවත් නැත!',
    searchVehicleType: 'වාහන වර්ගය සොයන්න...',
    addCustomVehicleType: 'නව වාහන වර්ගය ලෙස එක් කරන්න',
    newestFirst: 'අලුත්ම පළමුව',
    oldestFirst: 'පැරණිම පළමුව',
    amountHighLow: 'මුදල (වැඩි→අඩු)',
    amountLowHigh: 'මුදල (අඩු→වැඩි)',
    nameAZ: 'නම (අ-ඔ)',
    nameZA: 'නම (ඔ-අ)',
    all: 'සියල්ල',
    unpaid: 'ණය ඇති',
    billSummary: '📋 බිල්පත් සාරාංශය',
    optional: 'අත්‍යවශ්‍ය නොවේ',
    payFull: 'සම්පූර්ණ',
    quickStockRefill: 'ඉක්මන් තොග පිරවීම',
    itemToPurchase: 'මිලදී ගැනීමට භාණ්ඩය',
    supplier: 'සැපයුම්කරු',
    selectSupplier: 'සැපයුම්කරු තෝරන්න!',
    searchSupplier: 'සැපයුම්කරු සොයන්න (නම, දුරකථන, සමාගම)...',
    prevCredit: 'පෙර ණය',
    newCredit: 'නව ණය',
    supplierNotFound: 'හමු නොවීය',
    saveAsNewSupplier: 'නව සැපයුම්කරු ලෙස Save',
    addNewSupplier: 'නව සැපයුම්කරුවෙකු එකතු කරන්න',
    addSupplierBig: 'නව සැපයුම්කරු එකතු කරන්න',
    supplierName: 'සැපයුම්කරු නම *',
    company: 'සමාගම',
    saveSelect: 'Save & Select',
    qtyPurchase: 'ප්‍රමාණය (Qty)',
    unitCost: 'මිලදී ගන්නා මිල (Cost)',
    totalBillLbl: 'මුළු බිල්පත (Total)',
    paymentMethodLbl: '💳 ගෙවීම් ක්‍රමය',
    cashMethod: '💵 මුදල්',
    bankMethod: '🏦 බැංකු',
    creditMethod: '🔴 ණය',
    selectBankAcc: '🏦 බැංකු ගිණුම තෝරන්න',
    chooseAcc: '-- ගිණුමක් තෝරන්න --',
    paidAmountLbl: '💵 ගෙවන මුදල (Rs.)',
    balanceDueLbl: '🔴 ණය ශේෂය (Balance Due)',
    cancelBtn: 'අවලංගු කරන්න',
    confirmBtn: 'තහවුරු කරන්න',
    savingIn: 'සුරකිමින්...',
    validQtyErr: 'වලංගු ප්‍රමාණයක් ඇතුළත් කරන්න!',
    supplierErr: 'සැපයුම්කරුවෙකු තෝරන්න!',
    bankAccErr: 'බැංකු ගිණුම තෝරන්න!',
    supplierNameErr: '❌ සැපයුම්කරු නම අවශ්‍යයි',
    stockUpdatedMsg: 'තොග යාවත්කාලීන විය!',
    paidAmountText: 'ගෙවා ඇත',
    creditBalText: 'ණය ශේෂය',
    fullyPaidText: 'සම්පූර්ණයෙන් ගෙවා ඇත',
    noItems: 'භාණ්ඩ නොමැත',
    pressAddGoods: 'ඔබන්න',
    orAddManually: 'POS Catalog එකෙන් සොයන්න හෝ අතින් ඇතුළත් කරන්න',
    payFullLbl: 'Pay Full',
    driverInfo: 'රියදුරු',
    weightCap: 'ධාරිතාව',
  },
  en: {
    title: 'Vehicle Income Manager',
    vehicles: 'Vehicles', trips: 'Trips', incomeTab: 'Income',
    expenses: 'Expenses', reports: 'Reports',
    addVehicle: 'Add Vehicle', editVehicle: 'Edit Vehicle Details',
    addTrip: 'Add Trip', edit: 'Edit',
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
    lorry: 'Lorry', pickup: 'Pickup', threewheel: 'Three-Wheel',
    car: 'Car', bus: 'Bus', tractor: 'Tractor', bike: 'Motorbike',
    guestCustomer: 'Guest', from: 'From', to: 'To',
    searchCustomer: 'Search customer...',
    searchTrips: 'Search trips...',
    paymentMethod: 'Payment Method', cash: 'Cash', bank: 'Bank', credit: 'Credit',
    addGoods: '📦 Add Goods', goodsName: 'Item Name',
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
    searchGoods: 'Search item (name, code, barcode)...',
    stock: 'Stock',
    noItemResults: 'No items found',
    manualEntry: '✏️ Manual Entry',
    orSearchCatalog: 'or search from catalog',
    stockOff: '🔓 Stock Control OFF',
    stockOn: '🔒 Stock Control ON',
    outOfStock: '⚠️ Out of Stock!',
    quickPurchase: '⚡ Quick Purchase',
    insufficientStock: '⚠️ Insufficient Stock!',
    searchVehicleType: 'Search vehicle type...',
    addCustomVehicleType: 'Add as new vehicle type',
    newestFirst: 'Newest First',
    oldestFirst: 'Oldest First',
    amountHighLow: 'Amount (High→Low)',
    amountLowHigh: 'Amount (Low→High)',
    nameAZ: 'Name (A-Z)',
    nameZA: 'Name (Z-A)',
    all: 'All',
    unpaid: 'Unpaid',
    billSummary: '📋 Bill Summary',
    optional: 'Optional',
    payFull: 'Full',
    quickStockRefill: 'Quick Stock Refill',
    itemToPurchase: 'ITEM TO PURCHASE',
    supplier: 'Supplier',
    selectSupplier: 'Please select a supplier!',
    searchSupplier: 'Search supplier (name, phone, company)...',
    prevCredit: 'Prev Credit',
    newCredit: 'New Credit',
    supplierNotFound: 'not found',
    saveAsNewSupplier: 'Save as new supplier',
    addNewSupplier: 'Add new supplier',
    addSupplierBig: 'Add New Supplier',
    supplierName: 'Supplier Name *',
    company: 'Company',
    saveSelect: 'Save & Select',
    qtyPurchase: 'Quantity (Qty)',
    unitCost: 'Unit Cost',
    totalBillLbl: 'Total Bill',
    paymentMethodLbl: '💳 Payment Method',
    cashMethod: '💵 Cash',
    bankMethod: '🏦 Bank',
    creditMethod: '🔴 Credit',
    selectBankAcc: '🏦 Select Bank Account',
    chooseAcc: '-- Choose Account --',
    paidAmountLbl: '💵 Paid Amount (Rs.)',
    balanceDueLbl: '🔴 Balance Due',
    cancelBtn: 'Cancel',
    confirmBtn: 'Confirm',
    savingIn: 'Saving...',
    validQtyErr: 'Enter a valid quantity!',
    supplierErr: 'Please select a supplier!',
    bankAccErr: 'Please select a bank account!',
    supplierNameErr: '❌ Supplier name required',
    stockUpdatedMsg: 'stock updated successfully!',
    paidAmountText: 'paid',
    creditBalText: 'Credit Balance',
    fullyPaidText: 'Fully Paid',
    noItems: 'No items',
    pressAddGoods: 'to add',
    orAddManually: 'Search from POS Catalog or enter manually',
    payFullLbl: 'Pay Full',
    driverInfo: 'Driver',
    weightCap: 'Capacity',
  },
};

/* ════════════════════════════════════════
   2. useLanguage HOOK — ★ REAL-TIME SIDEBAR SYNC ★
   ════════════════════════════════════════ */
function useLanguage() {
  const [lang, setLang] = useState('si');

  useEffect(() => {
    // Initial load from localStorage
    try {
      const saved = localStorage.getItem('language');
      if (saved === 'en' || saved === 'si') setLang(saved);
    } catch {}

    // Listen for Sidebar language changes (dispatched via CustomEvent)
    const handleLangEvent = (e) => {
      const newLang = e.detail || 'si';
      if (newLang === 'si' || newLang === 'en') {
        setLang(newLang);
      }
    };

    // Listen for cross-tab language changes (via localStorage 'storage' event)
    const handleStorage = (e) => {
      if (e.key === 'language') {
        try {
          const newLang = e.newValue;
          if (newLang === 'si' || newLang === 'en') {
            setLang(newLang);
          }
        } catch {}
      }
    };

    window.addEventListener('app-language-change', handleLangEvent);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('app-language-change', handleLangEvent);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const t = useMemo(() => TRANSLATIONS[lang] || TRANSLATIONS.si, [lang]);
  return { lang, t };
}

/* ═══════════════════════════════════════
   3. STYLES
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

/* ═══════════════════════════════════════
   4. HELPER UTILITIES
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

const formatDate = (src, lang = 'si') => {
  if (!src) return '-';
  const ms = toMs(src);
  const locale = lang === 'en' ? 'en-GB' : 'si-LK';
  if (ms > 0) return new Date(ms).toLocaleDateString(locale);
  if (typeof src === 'string' && src.length >= 10) {
    const d = new Date(src + 'T00:00:00');
    return isNaN(d.getTime()) ? src : d.toLocaleDateString(locale);
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

const getItemImg = (i) => {
  if (!i) return DP;
  const u = i.picture || i.images?.[0] || i.photoURL || i.imageUrl || '';
  return u?.trim()?.length > 10 ? u.trim() : DP;
};

const getSinhala = (i) => i?.sinhalaName || i?.nameSi || '';
const getRack = (i) => i?.rackName || i?.rack || i?.rackNo || i?.location || '';

const getDocStock = (item) => {
  if (!item) return 0;
  if (item.stocks && typeof item.stocks === 'object') {
    const keys = Object.keys(item.stocks);
    if (keys.length > 0) {
      const t = keys.reduce((s, k) => s + R2(item.stocks[k]), 0);
      if (t >= 0) return R2(t);
    }
  }
  if (item.currentStock != null && item.currentStock !== '') return R2(item.currentStock);
  if (item.stock != null && item.stock !== '') return R2(item.stock);
  return 0;
};

const getOriginalPrice = (item) => {
  if (!item) return 0;
  return R2(item.sellingPriceRetail || item.retailPrice || item.sellingPrice || item.price || item.mrp || 0);
};

const getItemSearchStr = (i) =>
  [i?.name, i?.sinhalaName, i?.nameSi, i?.itemCode, i?.barcode, getRack(i)].filter(Boolean).join(' ');

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

const StockBadge = ({ stock, uom }) => {
  const s = R2(stock), z = s <= 0, l = s > 0 && s <= 5;
  const fmtQ = (v) => { const n = R2(v); return n % 1 === 0 ? String(n) : n.toFixed(2); };
  return (
    <span style={{
      fontWeight: 'bold', padding: '2px 8px', borderRadius: 4,
      background: z ? '#fef2f2' : l ? '#fffbeb' : '#f0fdf4',
      color: z ? '#dc2626' : l ? '#d97706' : '#16a34a',
      fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 3
    }}>
      {z ? '🔴' : l ? '🟡' : '🟢'} {fmtQ(s)}{uom && uom !== 'unit' ? ` ${uom}` : ''}
    </span>
  );
};

/* ═══════════════════════════════════════
   5. BUILD TRIP INVOICE FOR OUTPUT MANAGER
   ═══════════════════════════════════════ */
const buildTripInvoice = (trip, vehicles = [], t = TRANSLATIONS.si) => {
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

  if (R2(trip.fare) > 0) {
    items.push({ name: `${t.baseFare}${vehicleNo ? ` (${vehicleNo})` : ''}`, nameSi: t.baseFare, qty: 1, sellingPrice: R2(trip.fare), yourPrice: R2(trip.fare), lineTotal: R2(trip.fare), uom: 'unit', warrantyCode: '' });
  }
  if (R2(trip.meterKmTotal) > 0) {
    const units = R2(trip.meterUnits) || 0;
    const rate = R2(trip.meterRate) || 0;
    items.push({ name: `${t.meterKm}${units > 0 ? ` (${units} km)` : ''}`, nameSi: t.meterKm, qty: units > 0 ? units : 1, sellingPrice: rate > 0 ? rate : R2(trip.meterKmTotal), yourPrice: rate > 0 ? rate : R2(trip.meterKmTotal), lineTotal: R2(trip.meterKmTotal), uom: 'km', warrantyCode: '' });
  }
  if (R2(trip.meterHoursTotal) > 0) {
    const hrs = R2(trip.meterHours) || 0;
    const rate = R2(trip.hourlyRate) || 0;
    items.push({ name: `${t.meterHours}${hrs > 0 ? ` (${hrs} hrs)` : ''}`, nameSi: t.meterHours, qty: hrs > 0 ? hrs : 1, sellingPrice: rate > 0 ? rate : R2(trip.meterHoursTotal), yourPrice: rate > 0 ? rate : R2(trip.meterHoursTotal), lineTotal: R2(trip.meterHoursTotal), uom: 'hrs', warrantyCode: '' });
  }
  if (R2(trip.meterDaysTotal) > 0) {
    const days = R2(trip.meterDays) || 0;
    const rate = R2(trip.dailyRate) || 0;
    items.push({ name: `${t.meterDays}${days > 0 ? ` (${days} days)` : ''}`, nameSi: t.meterDays, qty: days > 0 ? days : 1, sellingPrice: rate > 0 ? rate : R2(trip.meterDaysTotal), yourPrice: rate > 0 ? rate : R2(trip.meterDaysTotal), lineTotal: R2(trip.meterDaysTotal), uom: 'days', warrantyCode: '' });
  }
  if (R2(trip.meterMonthsTotal) > 0) {
    const months = R2(trip.meterMonths) || 0;
    const rate = R2(trip.monthlyRate) || 0;
    items.push({ name: `${t.meterMonths}${months > 0 ? ` (${months} months)` : ''}`, nameSi: t.meterMonths, qty: months > 0 ? months : 1, sellingPrice: rate > 0 ? rate : R2(trip.meterMonthsTotal), yourPrice: rate > 0 ? rate : R2(trip.meterMonthsTotal), lineTotal: R2(trip.meterMonthsTotal), uom: 'months', warrantyCode: '' });
  }
  (trip.cargoItems || []).forEach((ci, idx) => {
    if (!ci.goodsName && !ci.goodsId) return;
    const up = R2(ci.unitPrice || 0);
    const lt = R2(ci.total || R2(ci.qty) * up);
    items.push({ name: ci.goodsName || `Cargo ${idx + 1}`, nameSi: ci.goodsName || '', qty: R2(ci.qty) || 1, sellingPrice: R2(ci.originalPrice || up), yourPrice: up, lineTotal: lt, uom: 'unit', warrantyCode: '' });
  });
  if (R2(trip.damageAmount) > 0) {
    items.push({ name: `${t.damage}${trip.damageNote ? ` — ${trip.damageNote}` : ''}`, nameSi: t.damage, qty: 1, sellingPrice: R2(trip.damageAmount), yourPrice: R2(trip.damageAmount), lineTotal: R2(trip.damageAmount), uom: 'unit', warrantyCode: '' });
  }

  const route = [trip.fromLocation, trip.toLocation].filter(Boolean).join(' → ');
  const remarks = [route, trip.notes, vehicleNo ? `${t.vehicle}: ${vehicleNo}` : ''].filter(Boolean).join(' | ');

  return {
    id: `trip-${tripId}`, invoiceNo, invoiceCode: invoiceNo,
    customerId: trip.customerId || '', customerName: trip.customerName || t.guestCustomer,
    customerPhone: trip.customerPhone || '', customerAddress: '',
    items, grossTotal: totalBill, invoiceValue: totalBill, totalDiscount: 0,
    billDiscount: 0, billDiscountPercent: 0, exchangeAmount: 0, returnAmount: 0,
    netAmount: totalBill, payAmount: paidAmt, balance: balDue > 0 ? balDue : 0,
    paymentMethod: payMethod, remarks, invoiceRemark: remarks,
    createdAt: trip.tripDate || trip.createdAt || { toDate: () => new Date() },
    date: trip.tripDate
      ? (typeof trip.tripDate.toDate === 'function'
          ? trip.tripDate.toDate().toISOString().split('T')[0]
          : String(trip.tripDate).slice(0, 10))
      : new Date().toISOString().split('T')[0],
    status: balDue <= 0.01 ? 'paid' : 'partial', type: 'invoice',
  };
};

/* ═══════════════════════════════════════
   6. METER ROW (STANDALONE)
   ═══════════════════════════════════════ */
function MeterRow({ icon, label, useKey, unitsKey, rateKey, unitsLabel, rateLabel, unitSuffix, total, presets, form, setForm, S }) {
  const isUsed = form[useKey];
  return (
    <div style={{ background: isUsed ? '#f0f9ff' : '#f8fafc', borderRadius: 12, padding: 14, border: `2px solid ${isUsed ? '#bfdbfe' : '#e2e8f0'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: isUsed ? 12 : 0 }}>
        <button type="button" onClick={() => setForm((p) => ({ ...p, [useKey]: !p[useKey] }))} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: isUsed ? '#3b82f6' : '#d1d5db', position: 'relative', padding: 0, flexShrink: 0, transition: 'background 0.2s' }}>
          <span style={{ position: 'absolute', top: 2, left: isUsed ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 700, color: isUsed ? '#1d4ed8' : '#64748b' }}>{icon} {label}</span>
        {isUsed && total > 0 && (<span style={{ marginLeft: 'auto', fontWeight: 900, color: '#1d4ed8', fontSize: 16 }}>{formatCurrency(total)}</span>)}
      </div>
      {isUsed && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
            <div>
              <label style={S.label}>{unitsLabel}</label>
              <input type="number" inputMode="decimal" min="0" step="any" value={form[unitsKey]} onChange={(e) => setForm((p) => ({ ...p, [unitsKey]: e.target.value }))} style={{ ...S.input, color: '#1d4ed8', fontWeight: 800, fontSize: 18, textAlign: 'center' }} placeholder={`0 ${unitSuffix}`} />
            </div>
            <div>
              <label style={S.label}>{rateLabel}</label>
              <input type="number" inputMode="decimal" min="0" step="any" value={form[rateKey]} onChange={(e) => setForm((p) => ({ ...p, [rateKey]: e.target.value }))} style={{ ...S.input, color: '#16a34a', fontWeight: 800, fontSize: 18, textAlign: 'center' }} placeholder="0.00" />
            </div>
          </div>
          {presets && presets.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {presets.map((p) => (<button key={p.v} type="button" onClick={() => setForm((prev) => ({ ...prev, [unitsKey]: String(p.v) }))} style={{ padding: '5px 10px', borderRadius: 8, border: String(form[unitsKey]) === String(p.v) ? '2px solid #3b82f6' : '1px solid #cbd5e1', background: String(form[unitsKey]) === String(p.v) ? '#dbeafe' : '#ffffff', color: String(form[unitsKey]) === String(p.v) ? '#1d4ed8' : '#475569', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>{p.l}</button>))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════
   7. CARGO ITEM ROW COMPONENT
   ════════════════════════════════════════ */
function CargoItemRow({ idx, item, allItems, onChange, onRemove, onQuickPurchase, stockControlEnabled, t }) {
  const [searchQ, setSearchQ] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [isManual, setIsManual] = useState(!item.goodsId);
  const containerRef = useRef(null);

  useEffect(() => {
    const h = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filtered = useMemo(() => {
    if (!searchQ.trim()) return [];
    return allItems.filter((i) => fuzzyMatch(getItemSearchStr(i), searchQ)).slice(0, 8);
  }, [allItems, searchQ]);

  const handleSelectItem = (catalogItem) => {
    const price = getOriginalPrice(catalogItem);
    onChange(idx, {
      goodsId: catalogItem.id,
      goodsName: catalogItem.name,
      goodsNameSi: getSinhala(catalogItem),
      goodsImage: getItemImg(catalogItem),
      qty: item.qty || 1,
      unitPrice: price,
      originalPrice: price,
      total: R2((item.qty || 1) * price),
    });
    setSearchQ('');
    setShowDropdown(false);
    setIsManual(false);
  };

  const handleFieldChange = (field, val) => {
    const updated = { ...item, [field]: val };
    if (field === 'qty' || field === 'unitPrice') {
      updated.total = R2(R2(updated.qty) * R2(updated.unitPrice));
    }
    onChange(idx, updated);
  };

  const selectedItem = item.goodsId ? allItems.find((i) => i.id === item.goodsId) : null;
  const stockCount = selectedItem ? getDocStock(selectedItem) : 0;
  const isOutOfStock = stockCount <= 0;
  const isStockInsufficient = stockCount < R2(item.qty);

  return (
    <div ref={containerRef} style={{
      padding: 14, borderRadius: 12, border: '2px solid #e2e8f0', marginBottom: 10,
      background: item.goodsId ? '#f0fdf4' : '#fafafa',
      position: 'relative',
    }}>
      <div style={{ marginBottom: 10 }}>
        {item.goodsId && !isManual ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            <img
              src={item.goodsImage || getItemImg(selectedItem) || DP}
              alt=""
              onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = DP; }}
              style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', border: '1px solid #e2e8f0' }}
            />
            <div style={{ flex: 1, minWidth: 150 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#166534' }}>{item.goodsName}</div>
              {item.goodsNameSi && <div style={{ fontSize: 12, color: '#15803d' }}>{item.goodsNameSi}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                <StockBadge stock={stockCount} />
                {stockControlEnabled && isOutOfStock && (
                  <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 'bold' }}>{t.outOfStock}</span>
                )}
                {stockControlEnabled && !isOutOfStock && isStockInsufficient && (
                  <span style={{ fontSize: 11, color: '#ea580c', fontWeight: 'bold' }}>{t.insufficientStock}</span>
                )}
              </div>
            </div>

            {item.goodsId && stockControlEnabled && (isOutOfStock || isStockInsufficient) && (
              <button
                type="button"
                onClick={() => onQuickPurchase(selectedItem)}
                style={{
                  padding: '6px 12px', background: '#3b82f6', color: 'white', border: 'none',
                  borderRadius: 8, fontSize: 11, fontWeight: 'bold', cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(59,130,246,0.3)',
                }}
              >
                {t.quickPurchase}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                onChange(idx, { ...item, goodsId: '', goodsName: '', goodsNameSi: '', goodsImage: '' });
                setIsManual(false);
                setSearchQ('');
              }}
              style={{ background: '#fee2e2', border: 'none', borderRadius: 6, width: 30, height: 30, cursor: 'pointer', color: '#dc2626', fontSize: 14, fontWeight: 900 }}
            >✕</button>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <button
                type="button"
                onClick={() => setIsManual(false)}
                style={{
                  flex: 1, padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  border: !isManual ? '2px solid #3b82f6' : '1px solid #cbd5e1',
                  background: !isManual ? '#eff6ff' : 'white',
                  color: !isManual ? '#2563eb' : '#64748b',
                }}
              >
                🔍 {t.orSearchCatalog}
              </button>
              <button
                type="button"
                onClick={() => { setIsManual(true); setShowDropdown(false); }}
                style={{
                  flex: 1, padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  border: isManual ? '2px solid #f59e0b' : '1px solid #cbd5e1',
                  background: isManual ? '#fffbeb' : 'white',
                  color: isManual ? '#b45309' : '#64748b',
                }}
              >
                {t.manualEntry}
              </button>
            </div>

            {!isManual ? (
              <div>
                <input
                  value={searchQ}
                  onChange={(e) => { setSearchQ(e.target.value); setShowDropdown(true); }}
                  onFocus={() => { if (searchQ) setShowDropdown(true); }}
                  placeholder={t.searchGoods}
                  style={{
                    width: '100%', padding: '10px 14px', border: '2px solid #3b82f6',
                    borderRadius: 10, fontSize: 14, boxSizing: 'border-box', outline: 'none',
                    background: '#f8f9ff',
                  }}
                />

                {showDropdown && searchQ.trim() && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                    background: 'white', border: '1px solid #cbd5e1', borderRadius: 10,
                    boxShadow: '0 10px 30px rgba(0,0,0,0.15)', maxHeight: 300, overflowY: 'auto',
                    marginTop: 4,
                  }}>
                    {filtered.length === 0 ? (
                      <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>
                        <div style={{ fontSize: 30, marginBottom: 6 }}>🔍</div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{t.noItemResults}</div>
                        <button
                          type="button"
                          onClick={() => { setIsManual(true); setShowDropdown(false); handleFieldChange('goodsName', searchQ); }}
                          style={{ marginTop: 8, ...S.btn('#f59e0b'), fontSize: 12, padding: '6px 14px' }}
                        >
                          ✏️ &quot;{searchQ}&quot; {t.manualEntry}
                        </button>
                      </div>
                    ) : (
                      filtered.map((catItem) => {
                        const price = getOriginalPrice(catItem);
                        const stock = getDocStock(catItem);
                        return (
                          <div
                            key={catItem.id}
                            onClick={() => handleSelectItem(catItem)}
                            style={{
                              padding: '10px 12px', borderBottom: '1px solid #f1f5f9',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#f0f9ff'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                          >
                            <img
                              src={getItemImg(catItem)}
                              alt=""
                              onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = DP; }}
                              style={{ width: 46, height: 46, borderRadius: 8, objectFit: 'cover', border: '1px solid #e2e8f0', flexShrink: 0 }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {catItem.name}
                              </div>
                              {getSinhala(catItem) && (
                                <div style={{ fontSize: 12, color: '#1e40af', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {getSinhala(catItem)}
                                </div>
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginTop: 2, flexWrap: 'wrap' }}>
                                <StockBadge stock={stock} uom={catItem.packSize || catItem.uomName} />
                                <span style={{ fontWeight: 'bold', color: '#0369a1' }}>Rs.{price.toFixed(2)}</span>
                                {getRack(catItem) && (
                                  <span style={{ fontSize: 11, color: '#e11d48', fontWeight: 'bold' }}>📍 {getRack(catItem)}</span>
                                )}
                              </div>
                            </div>
                            <span style={{ fontSize: 20, color: '#3b82f6', flexShrink: 0 }}>＋</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            ) : (
              <input
                value={item.goodsName}
                onChange={(e) => handleFieldChange('goodsName', e.target.value)}
                style={{ ...S.input, border: '2px solid #f59e0b', background: '#fffbeb' }}
                placeholder={t.goodsName}
              />
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
        <div>
          <label style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>{t.qty}</label>
          <input
            type="number" inputMode="decimal" min="0" step="any"
            value={item.qty}
            onChange={(e) => handleFieldChange('qty', e.target.value)}
            style={{ ...S.input, padding: '8px 10px', fontSize: 15, fontWeight: 800, textAlign: 'center' }}
            placeholder="1"
          />
        </div>
        <div>
          <label style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>{t.unitPrice}</label>
          <input
            type="number" inputMode="decimal" min="0" step="any"
            value={item.unitPrice}
            onChange={(e) => handleFieldChange('unitPrice', e.target.value)}
            style={{ ...S.input, padding: '8px 10px', fontSize: 15, fontWeight: 800, textAlign: 'center', color: '#0369a1' }}
            placeholder="0.00"
          />
        </div>
        <div>
          <label style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>{t.total}</label>
          <div style={{
            padding: '10px', background: '#f0fdf4', borderRadius: 10,
            textAlign: 'center', fontWeight: 800, fontSize: 14, color: '#16a34a',
            border: '1px solid #bbf7d0',
          }}>
            Rs.{R2(item.total).toLocaleString()}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onRemove(idx)}
          style={{
            background: '#fee2e2', border: 'none', borderRadius: 10,
            width: 40, height: 44, cursor: 'pointer', color: '#dc2626',
            fontSize: 18, fontWeight: 900,
          }}
        >✕</button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   8. QUICK PURCHASE MODAL
   ════════════════════════════════════════ */
function QuickPurchaseModal({ isOpen, item, user, onClose, t }) {
  const [qty, setQty] = useState('10');
  const [unitCost, setUnitCost] = useState('');
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [saving, setSaving] = useState(false);
  
  const [supplierSearchQ, setSupplierSearchQ] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [showAddNewSupplier, setShowAddNewSupplier] = useState(false);
  const [newSupplierForm, setNewSupplierForm] = useState({ name: '', phone: '', company: '', address: '' });
  const [savingSupplier, setSavingSupplier] = useState(false);
  const supplierRef = useRef(null);

  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paidAmount, setPaidAmount] = useState('');
  const [bankAccounts, setBankAccounts] = useState([]);
  const [selectedBankId, setSelectedBankId] = useState('');

  useEffect(() => {
    if (!isOpen || !item) return;
    setUnitCost(String(item.buyingNetPrice || item.buyingPrice || ''));
    
    const unsubSuppliers = onSnapshot(
      query(collection(db, 'suppliers'), where('uid', '==', user.uid)),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setSuppliers(list);
      }
    );

    const unsubBanks = onSnapshot(
      collection(db, `users/${user.uid}/bankAccounts`),
      (snap) => {
        const banks = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => b.isActive !== false);
        setBankAccounts(banks);
        if (banks.length > 0 && !selectedBankId) setSelectedBankId(banks[0].id);
      }
    );

    return () => { unsubSuppliers(); unsubBanks(); };
  }, [isOpen, item, user?.uid, selectedBankId]);

  useEffect(() => {
    if (selectedSupplierId) {
      const found = suppliers.find(s => s.id === selectedSupplierId);
      setSelectedSupplier(found || null);
    } else {
      setSelectedSupplier(null);
    }
  }, [selectedSupplierId, suppliers]);

  useEffect(() => {
    const h = (e) => {
      if (supplierRef.current && !supplierRef.current.contains(e.target)) {
        setShowSupplierDropdown(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filteredSuppliers = useMemo(() => {
    if (!supplierSearchQ.trim()) return suppliers.slice(0, 10);
    const q = supplierSearchQ.toLowerCase().trim();
    return suppliers.filter(s => 
      (s.name || '').toLowerCase().includes(q) ||
      (s.phone || '').includes(q) ||
      (s.company || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q)
    ).slice(0, 8);
  }, [suppliers, supplierSearchQ]);

  const getSupplierImg = (s) => s?.imageUrl || s?.photoUrl || s?.profilePicture || '';
  const getSupplierBal = (s) => {
    if (!s) return 0;
    const b = parseFloat(s.balance);
    if (!isNaN(b) && b !== 0) return b;
    const c = parseFloat(s.currentBalance);
    if (!isNaN(c)) return c;
    return parseFloat(s.openingBalance) || 0;
  };

  const totalCost = R2(R2(qty) * R2(unitCost));
  const paid = R2(paymentMethod === 'credit' ? 0 : (paidAmount || totalCost));
  const balanceDue = R2(totalCost - paid);

  useEffect(() => {
    if (paymentMethod === 'cash' || paymentMethod === 'bank') {
      setPaidAmount(String(totalCost));
    } else if (paymentMethod === 'credit') {
      setPaidAmount('0');
    }
  }, [paymentMethod, totalCost]);

  const newSupplierBalance = R2(getSupplierBal(selectedSupplier) + balanceDue);

  const handleSaveNewSupplier = async () => {
    if (!newSupplierForm.name.trim()) return alert(t.supplierNameErr);
    setSavingSupplier(true);
    try {
      const payload = {
        uid: user.uid,
        name: newSupplierForm.name.trim(),
        phone: normalizePhone(newSupplierForm.phone),
        company: newSupplierForm.company.trim(),
        address: newSupplierForm.address.trim(),
        balance: 0, currentBalance: 0, openingBalance: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        source: 'quick_purchase',
      };
      const docRef = await addDoc(collection(db, 'suppliers'), payload);
      const newSup = { id: docRef.id, ...payload };
      setSelectedSupplierId(docRef.id);
      setSelectedSupplier(newSup);
      setShowAddNewSupplier(false);
      setShowSupplierDropdown(false);
      setSupplierSearchQ('');
      setNewSupplierForm({ name: '', phone: '', company: '', address: '' });
    } catch (e) {
      console.error(e);
      alert('❌ Error: ' + e.message);
    } finally {
      setSavingSupplier(false);
    }
  };

  const handleConfirmPurchase = async () => {
    if (R2(qty) <= 0) return alert(t.validQtyErr);
    if (!selectedSupplierId) return alert(t.supplierErr);
    if (paymentMethod === 'bank' && !selectedBankId) return alert(t.bankAccErr);
    
    setSaving(true);
    try {
      const batch = writeBatch(db);
      const supplier = suppliers.find(s => s.id === selectedSupplierId);
      const selBank = bankAccounts.find(b => b.id === selectedBankId);
      const billNo = `PUR-QP-${Date.now().toString().slice(-5).toUpperCase()}`;
      const purchaseRef = doc(collection(db, `users/${user.uid}/purchases`));
      
      const purchasePayload = {
        uid: user.uid,
        supplierId: selectedSupplierId,
        supplierName: supplier?.name || 'Unknown',
        billNo,
        items: [{
          itemId: item.id,
          name: item.name,
          qty: R2(qty),
          buyingPrice: R2(unitCost),
          buyingNetPrice: R2(unitCost),
          totalCost,
        }],
        subTotal: totalCost,
        billDiscount: 0,
        netAmount: totalCost,
        grandTotal: totalCost,
        paidAmount: paid,
        balance: balanceDue,
        paymentMethod,
        paymentStatus: balanceDue <= 0.01 ? 'paid' : (paid > 0 ? 'partial' : 'credit'),
        bankAccountId: paymentMethod === 'bank' ? selectedBankId : null,
        bankName: paymentMethod === 'bank' ? (selBank?.bankName || '') : '',
        notes: `Quick purchase for: ${item.name}`,
        date: todayStr(),
        createdAt: serverTimestamp(),
      };

      batch.set(purchaseRef, purchasePayload);

      const itemRef = doc(db, 'items', item.id);
      batch.update(itemRef, {
        stock: increment(R2(qty)),
        currentStock: increment(R2(qty)),
        'stocks.Main_Store': increment(R2(qty)),
        buyingPrice: R2(unitCost),
        buyingNetPrice: R2(unitCost),
        updatedAt: serverTimestamp(),
      });

      if (balanceDue > 0.01) {
        const supRef = doc(db, 'suppliers', selectedSupplierId);
        batch.update(supRef, {
          balance: increment(balanceDue),
          currentBalance: increment(balanceDue),
          updatedAt: serverTimestamp(),
        });
      }

      if (paid > 0) {
        const paymentRef = doc(collection(db, 'payments'));
        batch.set(paymentRef, {
          invoiceId: purchaseRef.id,
          supplierId: selectedSupplierId,
          supplierName: supplier?.name || '',
          amount: paid,
          method: paymentMethod,
          bankAccountId: paymentMethod === 'bank' ? selectedBankId : null,
          bankName: paymentMethod === 'bank' ? (selBank?.bankName || '') : '',
          uid: user.uid,
          type: 'purchase',
          note: 'Quick purchase payment',
          date: todayStr(),
          createdAt: serverTimestamp(),
        });
      }

      if (paymentMethod === 'bank' && selectedBankId && paid > 0) {
        const bankRef = doc(db, `users/${user.uid}/bankAccounts`, selectedBankId);
        batch.update(bankRef, {
          currentBalance: increment(-paid),
          updatedAt: serverTimestamp(),
        });

        const bankTxnRef = doc(collection(db, `users/${user.uid}/bankTransactions`));
        batch.set(bankTxnRef, {
          type: 'withdrawal',
          accountId: selectedBankId,
          amount: paid,
          date: Timestamp.now(),
          description: `Quick Purchase — ${supplier?.name || ''}`,
          reference: billNo,
          source: 'purchase',
          invoiceId: purchaseRef.id,
          createdAt: serverTimestamp(),
        });
      }

      if (paid > 0) {
        const cashTxnRef = doc(collection(db, `users/${user.uid}/cashTransactions`));
        batch.set(cashTxnRef, {
          type: 'out',
          category: 'supplierPayment',
          source: 'purchase',
          amount: paid,
          supplierId: selectedSupplierId,
          supplierName: supplier?.name || '',
          invoiceId: purchaseRef.id,
          invoiceNo: billNo,
          paymentMethod,
          bankAccountId: paymentMethod === 'bank' ? selectedBankId : null,
          bankName: paymentMethod === 'bank' ? (selBank?.bankName || '') : '',
          description: `📦 ${supplier?.name || 'Supplier'} — Rs.${paid.toFixed(2)} (Quick Purchase)`,
          notes: purchasePayload.notes,
          date: todayStr(),
          time: new Date().toTimeString().slice(0, 5),
          createdAt: serverTimestamp(),
          isAutomatic: true,
          uid: user.uid,
        });
      }

      await batch.commit();
      
      const msg = balanceDue > 0.01
        ? `✅ ${item.name} ${t.stockUpdatedMsg}\n💵 Rs.${paid.toLocaleString()} ${t.paidAmountText}\n🔴 ${t.creditBalText}: Rs.${balanceDue.toLocaleString()}`
        : `✅ ${item.name} ${t.stockUpdatedMsg}\n💵 ${t.fullyPaidText} (Rs.${paid.toLocaleString()})`;
      alert(msg);
      onClose();
    } catch (e) {
      console.error(e);
      alert('❌ Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{ ...S.overlay, zIndex: 1100 }}>
      <div style={{ ...S.modal, maxWidth: 520 }}>
        <div style={S.modalHdr('#3b82f6')}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>⚡ {t.quickStockRefill}</h3>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: '#f0f9ff', padding: 12, borderRadius: 10, border: '1px solid #bfdbfe' }}>
            <div style={{ fontSize: 11, color: '#0369a1', fontWeight: 'bold' }}>📦 {t.itemToPurchase}</div>
            <div style={{ fontWeight: 'bold', fontSize: 15, color: '#0369a1', marginTop: 2 }}>{item?.name}</div>
            {getSinhala(item) && <div style={{ fontSize: 12, color: '#0284c7', marginTop: 2 }}>{getSinhala(item)}</div>}
          </div>

          <div ref={supplierRef} style={{ position: 'relative' }}>
            <label style={S.label}>🏪 {t.supplier} *</label>
            
            {selectedSupplier ? (
              <div style={{ 
                padding: 12, borderRadius: 12, border: '2px solid #10b981',
                background: '#f0fdf4', display: 'flex', alignItems: 'center', gap: 12,
              }}>
                {getSupplierImg(selectedSupplier) ? (
                  <img
                    src={getSupplierImg(selectedSupplier)}
                    alt={selectedSupplier.name}
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid #d1fae5', flexShrink: 0 }}
                  />
                ) : (
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: '#dcfce7', color: '#059669',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, fontWeight: 800, flexShrink: 0,
                  }}>
                    {(selectedSupplier.name || '?')[0]?.toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: '#166534' }}>
                    ✓ {selectedSupplier.name}
                  </div>
                  {selectedSupplier.phone && (
                    <div style={{ fontSize: 12, color: '#0284c7', marginTop: 2 }}>
                      📞 {selectedSupplier.phone}
                    </div>
                  )}
                  {selectedSupplier.company && (
                    <div style={{ fontSize: 12, color: '#7c3aed', marginTop: 1 }}>
                      🏢 {selectedSupplier.company}
                    </div>
                  )}
                  <div style={{ marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 8,
                      background: getSupplierBal(selectedSupplier) > 0 ? '#fef2f2' : '#f0fdf4',
                      color: getSupplierBal(selectedSupplier) > 0 ? '#dc2626' : '#16a34a',
                    }}>
                      🔴 {t.prevCredit}: Rs.{Math.abs(getSupplierBal(selectedSupplier)).toLocaleString()}
                    </span>
                    {balanceDue > 0.01 && (
                      <span style={{
                        fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 8,
                        background: '#fef2f2', color: '#dc2626',
                      }}>
                        📈 {t.newCredit}: Rs.{newSupplierBalance.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedSupplierId(''); setSelectedSupplier(null); setSupplierSearchQ(''); }}
                  style={{ background: '#fee2e2', border: 'none', borderRadius: 6, width: 30, height: 30, cursor: 'pointer', color: '#dc2626', fontSize: 14, fontWeight: 900, flexShrink: 0 }}
                >✕</button>
              </div>
            ) : (
              <input
                value={supplierSearchQ}
                onChange={(e) => { setSupplierSearchQ(e.target.value); setShowSupplierDropdown(true); setShowAddNewSupplier(false); }}
                onFocus={() => setShowSupplierDropdown(true)}
                placeholder={t.searchSupplier}
                style={{ ...S.input, border: '2px solid #cbd5e1' }}
              />
            )}

            {showSupplierDropdown && !selectedSupplier && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
                background: 'white', border: '1px solid #cbd5e1', borderRadius: 12,
                boxShadow: '0 10px 40px rgba(0,0,0,0.15)', marginTop: 4, overflow: 'hidden',
              }}>
                {!showAddNewSupplier && (
                  <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {filteredSuppliers.map(s => {
                      const bal = getSupplierBal(s);
                      return (
                        <div
                          key={s.id}
                          onClick={() => { setSelectedSupplierId(s.id); setShowSupplierDropdown(false); setSupplierSearchQ(''); }}
                          style={{
                            padding: '10px 14px', cursor: 'pointer',
                            borderBottom: '1px solid #f1f5f9',
                            display: 'flex', alignItems: 'center', gap: 10,
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#f0f9ff'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                        >
                          {getSupplierImg(s) ? (
                            <img
                              src={getSupplierImg(s)}
                              alt={s.name}
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid #e2e8f0', flexShrink: 0 }}
                            />
                          ) : (
                            <div style={{
                              width: 36, height: 36, borderRadius: '50%',
                              background: '#e0e7ff', color: '#4338ca',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 16, fontWeight: 800, flexShrink: 0,
                            }}>
                              {(s.name || '?')[0]?.toUpperCase()}
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                              {s.phone && (
                                <span style={{ fontSize: 11, color: '#3b82f6', background: '#eff6ff', padding: '1px 6px', borderRadius: 4 }}>
                                  📞 {s.phone}
                                </span>
                              )}
                              {s.company && (
                                <span style={{ fontSize: 11, color: '#7c3aed', background: '#f5f3ff', padding: '1px 6px', borderRadius: 4 }}>
                                  🏢 {s.company}
                                </span>
                              )}
                            </div>
                          </div>
                          {bal !== 0 && (
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 9, color: '#94a3b8' }}>{t.credit}</div>
                              <div style={{ 
                                fontSize: 12, fontWeight: 800,
                                color: bal > 0 ? '#dc2626' : '#16a34a',
                              }}>
                                {Math.abs(bal).toLocaleString('en-US', { minimumFractionDigits: 0 })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {supplierSearchQ.trim() && filteredSuppliers.length === 0 && (
                      <div style={{ padding: 20, textAlign: 'center' }}>
                        <div style={{ fontSize: 30, marginBottom: 6 }}>🔍</div>
                        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
                          &quot;{supplierSearchQ}&quot; {t.supplierNotFound}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setNewSupplierForm({ name: supplierSearchQ.trim(), phone: '', company: '', address: '' });
                            setShowAddNewSupplier(true);
                          }}
                          style={{
                            padding: '8px 20px', background: 'linear-gradient(135deg,#059669,#10b981)',
                            color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                          }}
                        >
                          ➕ &quot;{supplierSearchQ}&quot; {t.saveAsNewSupplier}
                        </button>
                      </div>
                    )}

                    <div
                      onClick={() => {
                        setNewSupplierForm({ 
                          name: supplierSearchQ.trim(), phone: '', company: '', address: '' 
                        });
                        setShowAddNewSupplier(true);
                      }}
                      style={{
                        padding: '12px 14px', cursor: 'pointer',
                        borderTop: '2px solid #e2e8f0', background: '#f0fdf4',
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}
                    >
                      <span style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: '#10b981', color: 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, fontWeight: 800,
                      }}>+</span>
                      <span style={{ fontWeight: 700, color: '#059669', fontSize: 13 }}>
                        ➕ {t.addNewSupplier}
                      </span>
                    </div>
                  </div>
                )}

                {showAddNewSupplier && (
                  <div style={{ padding: 16, background: '#f0fdf4', borderTop: '2px solid #10b981' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span style={{ fontSize: 20 }}>➕</span>
                      <span style={{ fontWeight: 800, color: '#059669', fontSize: 14 }}>{t.addSupplierBig}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input
                        value={newSupplierForm.name}
                        onChange={(e) => setNewSupplierForm(p => ({ ...p, name: e.target.value }))}
                        placeholder={t.supplierName}
                        style={{ ...S.input, border: '2px solid #bbf7d0', fontSize: 13 }}
                        autoFocus
                      />
                      <div style={S.grid2}>
                        <input
                          value={newSupplierForm.phone}
                          onChange={(e) => setNewSupplierForm(p => ({ ...p, phone: e.target.value }))}
                          placeholder={t.phone + ' (07X XXX XXXX)'}
                          style={{ ...S.input, border: '2px solid #bbf7d0', fontSize: 13 }}
                        />
                        <input
                          value={newSupplierForm.company}
                          onChange={(e) => setNewSupplierForm(p => ({ ...p, company: e.target.value }))}
                          placeholder={t.company}
                          style={{ ...S.input, border: '2px solid #bbf7d0', fontSize: 13 }}
                        />
                      </div>
                      <input
                        value={newSupplierForm.address}
                        onChange={(e) => setNewSupplierForm(p => ({ ...p, address: e.target.value }))}
                        placeholder={t.address}
                        style={{ ...S.input, border: '2px solid #bbf7d0', fontSize: 13 }}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <button
                          type="button"
                          onClick={() => { setShowAddNewSupplier(false); setNewSupplierForm({ name: '', phone: '', company: '', address: '' }); }}
                          style={{ ...S.btn('#f1f5f9', '#64748b'), flex: 1, padding: '8px 14px', fontSize: 12 }}
                        >
                          {t.cancel}
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveNewSupplier}
                          disabled={savingSupplier || !newSupplierForm.name.trim()}
                          style={{ 
                            ...S.btn(savingSupplier ? '#94a3b8' : '#10b981'), 
                            flex: 2, padding: '8px 14px', fontSize: 12,
                            cursor: savingSupplier ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {savingSupplier ? '⏳ Saving...' : `💾 ${t.saveSelect}`}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={S.grid2}>
            <div>
              <label style={S.label}>{t.qtyPurchase}</label>
              <input
                type="number" inputMode="decimal" min="0" step="any"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                style={{ ...S.input, fontSize: 16, fontWeight: 'bold', textAlign: 'center' }}
                placeholder="10"
              />
            </div>
            <div>
              <label style={S.label}>{t.unitCost}</label>
              <input
                type="number" inputMode="decimal" min="0" step="any"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                style={{ ...S.input, fontSize: 16, fontWeight: 'bold', color: '#dc2626', textAlign: 'center' }}
                placeholder="0.00"
              />
            </div>
          </div>

          <div style={{
            padding: 12, background: 'linear-gradient(135deg,#eff6ff,#dbeafe)',
            borderRadius: 10, border: '1px solid #bfdbfe',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontWeight: 'bold', fontSize: 14, color: '#1e40af' }}>{t.totalBillLbl}:</span>
            <span style={{ fontWeight: 900, fontSize: 22, color: '#1e40af' }}>Rs. {totalCost.toLocaleString()}</span>
          </div>

          <div>
            <label style={S.label}>{t.paymentMethodLbl}</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {[
                { v: 'cash', l: t.cashMethod, c: '#16a34a' },
                { v: 'bank', l: t.bankMethod, c: '#2563eb' },
                { v: 'credit', l: t.creditMethod, c: '#dc2626' },
              ].map(m => (
                <button
                  key={m.v}
                  type="button"
                  onClick={() => setPaymentMethod(m.v)}
                  style={{
                    padding: '10px 8px', borderRadius: 8, cursor: 'pointer',
                    border: paymentMethod === m.v ? `2px solid ${m.c}` : '1px solid #cbd5e1',
                    background: paymentMethod === m.v ? `${m.c}12` : 'white',
                    color: paymentMethod === m.v ? m.c : '#475569',
                    fontWeight: paymentMethod === m.v ? 800 : 500,
                    fontSize: 12,
                  }}
                >
                  {m.l}
                </button>
              ))}
            </div>
          </div>

          {paymentMethod === 'bank' && bankAccounts.length > 0 && (
            <div>
              <label style={S.label}>{t.selectBankAcc}</label>
              <select
                value={selectedBankId}
                onChange={(e) => setSelectedBankId(e.target.value)}
                style={S.input}
              >
                <option value="">{t.chooseAcc}</option>
                {bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>
                    🏦 {b.bankName} — {b.accountName} (Rs.{(parseFloat(b.currentBalance) || 0).toLocaleString()})
                  </option>
                ))}
              </select>
            </div>
          )}

          {paymentMethod !== 'credit' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <label style={{ ...S.label, margin: 0 }}>{t.paidAmountLbl}</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setPaidAmount(String(totalCost / 2))}
                    style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}
                  >½</button>
                  <button
                    type="button"
                    onClick={() => setPaidAmount(String(totalCost))}
                    style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#15803d', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}
                  >{t.payFull}</button>
                </div>
              </div>
              <input
                type="number"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                style={{ ...S.input, fontSize: 18, fontWeight: 800, color: '#16a34a', textAlign: 'center' }}
                placeholder="0.00"
              />
            </div>
          )}

          {balanceDue > 0.01 && (
            <div style={{
              padding: '10px 14px', borderRadius: 10, border: '2px solid #fecaca',
              background: '#fef2f2',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontWeight: 800, color: '#dc2626', fontSize: 13 }}>{t.balanceDueLbl}:</span>
              <span style={{ fontWeight: 900, color: '#dc2626', fontSize: 18 }}>Rs. {balanceDue.toLocaleString()}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ ...S.btn('#f1f5f9', '#475569'), flex: 1 }}
            >
              {t.cancelBtn}
            </button>
            <button
              type="button"
              onClick={handleConfirmPurchase}
              disabled={saving || !selectedSupplierId}
              style={{
                ...S.btn(saving || !selectedSupplierId ? '#94a3b8' : '#16a34a'),
                flex: 2,
                cursor: (saving || !selectedSupplierId) ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? `⏳ ${t.savingIn}` : `💾 ${t.confirmBtn} (Rs.${paid.toLocaleString()})`}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   9. ADD NEW CUSTOMER MINI FORM
   ════════════════════════════════════════ */
function AddNewCustomerInline({ uid, initialName, initialPhone, onSaved, onCancel, t }) {
  const [form, setForm] = useState({ name: initialName || '', phone: initialPhone || '', address: '' });
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!form.name.trim() && !form.phone.trim()) return;
    setSaving(true);
    try {
      const customerData = { uid, name: form.name.trim(), phone: normalizePhone(form.phone), address: form.address.trim(), currentBalance: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), source: 'vehicleTrip' };
      const docRef = await addDoc(collection(db, 'customers'), customerData);
      onSaved({ id: docRef.id, ...customerData });
    } catch (e) { console.error('Save customer error:', e); alert((t.customerSaveError || 'Error') + ': ' + e.message); }
    finally { setSaving(false); }
  };
  return (
    <div style={{ padding: 16, background: '#f0fdf4', borderTop: '2px solid #10b981' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>➕</span>
        <span style={{ fontWeight: 800, color: '#10b981', fontSize: 14 }}>{t.addNewCustomer}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder={t.customerName + ' *'} style={{ ...S.input, border: '2px solid #bbf7d0', fontSize: 13 }} autoFocus />
        <input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder={t.phone + ' (07X XXX XXXX)'} style={{ ...S.input, border: '2px solid #bbf7d0', fontSize: 13 }} />
        <input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} placeholder={t.address} style={{ ...S.input, border: '2px solid #bbf7d0', fontSize: 13 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{ ...S.btn('#f1f5f9', '#64748b'), flex: 1, padding: '8px 14px', fontSize: 12 }}>{t.cancel}</button>
          <button onClick={handleSave} disabled={saving || (!form.name.trim() && !form.phone.trim())} style={{ ...S.btn(saving ? '#94a3b8' : '#10b981'), flex: 2, padding: '8px 14px', fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? '⏳...' : `💾 ${t.saveAsNew}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   10. CUSTOMER SEARCH COMPONENT
   ════════════════════════════════════════ */
function CustomerSearch({ uid, value, onChange, placeholder, t }) {
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [showAddNew, setShowAddNew] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(query(collection(db, 'customers'), where('uid', '==', uid)), (s) => setCustomers(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, [uid]);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setShowAddNew(false); } };
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

  const handleNewCustomerSaved = (newCust) => { onChange(newCust.id, newCust); setShowAddNew(false); setOpen(false); setQ(''); };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div onClick={() => setOpen((o) => !o)} style={{ ...S.input, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: selected ? '#f0fdf4' : 'white', borderColor: selected ? '#10b981' : '#e2e8f0' }}>
        {selected ? (
          <>
            {getCustomerPicture(selected) ? (<img src={getCustomerPicture(selected)} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />) : (<div style={{ width: 28, height: 28, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>👤</div>)}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{selected.name}</div>
              {selected.phone && <div style={{ fontSize: 11, color: '#64748b' }}>{selected.phone}</div>}
            </div>
            {getCustomerBalance(selected) > 0 && (<span style={S.badge('#fef2f2', '#dc2626')}>Rs.{getCustomerBalance(selected).toLocaleString()}</span>)}
            <button onClick={(e) => { e.stopPropagation(); onChange(null, null); setQ(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16 }}>✕</button>
          </>
        ) : (<span style={{ color: '#94a3b8' }}>{placeholder || t.searchCustomer}</span>)}
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 99, background: 'white', border: '2px solid #e2e8f0', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
          <div style={{ padding: 10, borderBottom: '1px solid #e2e8f0' }}>
            <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setShowAddNew(false); }} placeholder={t.searchCustomer} style={{ ...S.searchInput, fontSize: 13 }} />
            {q && (<div style={{ fontSize: 11, color: '#64748b', marginTop: 4, paddingLeft: 2 }}>🔍 &quot;{q}&quot; — {filtered.length} {t.searchResults}</div>)}
          </div>
          {!showAddNew && (
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              <div onClick={() => { onChange('guest', null); setOpen(false); setQ(''); }} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }} onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.background = 'white'}>
                <span style={{ fontSize: 20 }}>👤</span><span style={{ fontWeight: 600, color: '#475569' }}>{t.guestCustomer} ({t.notRegistered})</span>
              </div>
              {filtered.map((c) => (
                <div key={c.id} onClick={() => { onChange(c.id, c); setOpen(false); setQ(''); }} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10, background: c.id === value ? '#f0fdf4' : 'white' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f0f9ff'} onMouseLeave={(e) => e.currentTarget.style.background = c.id === value ? '#f0fdf4' : 'white'}>
                  {getCustomerPicture(c) ? (<img src={getCustomerPicture(c)} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} />) : (<div style={{ width: 34, height: 34, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>👤</div>)}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{c.name}</div>
                    {c.phone && <div style={{ fontSize: 12, color: '#64748b' }}>{c.phone}</div>}
                    {c.address && <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.address}</div>}
                  </div>
                  {getCustomerBalance(c) > 0 && (<span style={S.badge('#fef2f2', '#dc2626')}>Rs.{getCustomerBalance(c).toLocaleString()}</span>)}
                </div>
              ))}
              {q.trim() && filtered.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center' }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>
                  <div style={{ color: '#94a3b8', marginBottom: 12, fontSize: 14 }}>{t.customerNotFound}</div>
                  <button onClick={() => setShowAddNew(true)} style={{ ...S.btn('#10b981'), padding: '10px 24px', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, margin: '0 auto' }}>➕ {t.addNewCustomer}</button>
                </div>
              )}
              {q.trim() && filtered.length > 0 && (
                <div onClick={() => setShowAddNew(true)} style={{ padding: '12px 14px', cursor: 'pointer', borderTop: '2px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10, background: '#f0fdf4' }} onMouseEnter={(e) => e.currentTarget.style.background = '#dcfce7'} onMouseLeave={(e) => e.currentTarget.style.background = '#f0fdf4'}>
                  <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#10b981', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800 }}>+</span>
                  <div><div style={{ fontWeight: 700, color: '#10b981', fontSize: 13 }}>➕ {t.addNewCustomer}</div><div style={{ fontSize: 11, color: '#64748b' }}>{t.orAddNew}</div></div>
                </div>
              )}
            </div>
          )}
          {showAddNew && (<AddNewCustomerInline uid={uid} initialName={isPhoneSearch ? '' : q} initialPhone={isPhoneSearch ? q : ''} onSaved={handleNewCustomerSaved} onCancel={() => setShowAddNew(false)} t={t} />)}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════
   11. ADD / EDIT VEHICLE MODAL
   ════════════════════════════════════════ */
function VehicleModal({ basePath, vehicle, vehicles, onClose, onSaved, t }) {
  const [form, setForm] = useState({
    vehicleNo: '',
    vehicleType: 'truck',
    driverName: '',
    driverPhone: '',
    capacity: '',
    notes: '',
    isActive: true
  });
  const [saving, setSaving] = useState(false);

  const [typeSearchQ, setTypeSearchQ] = useState('');
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const typeDropdownRef = useRef(null);

  const baseTypes = useMemo(() => [
    { value: 'truck', label: `🚛 ${t.truck || 'Truck'}` },
    { value: 'lorry', label: `🚚 ${t.lorry || 'Lorry'}` },
    { value: 'van', label: `🚐 ${t.van || 'Van'}` },
    { value: 'pickup', label: `🛻 ${t.pickup || 'Pickup'}` },
    { value: 'threewheel', label: `🛺 ${t.threewheel || 'Three-Wheel'}` },
    { value: 'car', label: `🚗 ${t.car || 'Car'}` },
    { value: 'bus', label: `🚌 ${t.bus || 'Bus'}` },
    { value: 'tractor', label: `🚜 ${t.tractor || 'Tractor'}` },
    { value: 'bike', label: `🏍️ ${t.bike || 'Motorbike'}` },
  ], [t]);

  const vehicleTypesOptions = useMemo(() => {
    const options = [...baseTypes];
    (vehicles || []).forEach(v => {
      if (v.vehicleType && !options.some(opt => opt.value.toLowerCase() === v.vehicleType.toLowerCase())) {
        options.push({
          value: v.vehicleType,
          label: `🚗 ${v.vehicleType}`
        });
      }
    });
    return options;
  }, [vehicles, baseTypes]);

  useEffect(() => {
    if (vehicle) {
      setForm({
        vehicleNo: vehicle.vehicleNo || '',
        vehicleType: vehicle.vehicleType || 'truck',
        driverName: vehicle.driverName || '',
        driverPhone: vehicle.driverPhone || '',
        capacity: vehicle.capacity || '',
        notes: vehicle.notes || '',
        isActive: vehicle.isActive !== false
      });
    }
  }, [vehicle]);

  useEffect(() => {
    const h = (e) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target)) {
        setShowTypeDropdown(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filteredTypes = useMemo(() => {
    if (!typeSearchQ.trim()) return vehicleTypesOptions;
    const q = typeSearchQ.toLowerCase().trim();
    return vehicleTypesOptions.filter(opt => 
      opt.label.toLowerCase().includes(q) || 
      opt.value.toLowerCase().includes(q)
    );
  }, [vehicleTypesOptions, typeSearchQ]);

  const exactMatchExists = vehicleTypesOptions.some(
    opt => opt.value.toLowerCase() === typeSearchQ.toLowerCase().trim()
  );

  const selectedOpt = vehicleTypesOptions.find(
    opt => opt.value.toLowerCase() === form.vehicleType.toLowerCase()
  );
  const displayTypeLabel = selectedOpt ? selectedOpt.label : `🚗 ${form.vehicleType}`;

  const handleSave = async () => {
    if (!form.vehicleNo.trim()) return alert(t.vehicleNo + '!');
    setSaving(true);
    try {
      if (vehicle?.id) {
        await updateDoc(doc(db, `${basePath}/vehicles`, vehicle.id), {
          ...form,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, `${basePath}/vehicles`), {
          ...form,
          createdAt: serverTimestamp()
        });
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
      <div style={S.modal}>
        <div style={S.modalHdr('#10b981')}>
          <h3 style={{ margin: 0, fontSize: 18 }}>
            🚛 {vehicle ? t.editVehicle : t.addVehicle}
          </h3>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={S.grid2}>
            <div>
              <label style={S.label}>{t.vehicleNo} *</label>
              <input value={form.vehicleNo} onChange={(e) => setForm((p) => ({ ...p, vehicleNo: e.target.value.toUpperCase() }))} style={S.input} placeholder="ABC-1234" disabled={!!vehicle} />
            </div>

            <div ref={typeDropdownRef} style={{ position: 'relative' }}>
              <label style={S.label}>{t.vehicleType}</label>
              <div 
                onClick={() => setShowTypeDropdown(!showTypeDropdown)}
                style={{ 
                  ...S.input, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: '#f0fdf4', borderColor: '#10b981', fontWeight: 'bold' 
                }}
              >
                <span>{displayTypeLabel}</span>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>{showTypeDropdown ? '▲' : '▼'}</span>
              </div>

              {showTypeDropdown && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                  background: 'white', border: '1px solid #cbd5e1', borderRadius: 10,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.15)', marginTop: 4, overflow: 'hidden'
                }}>
                  <div style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>
                    <input 
                      autoFocus
                      placeholder={t.searchVehicleType}
                      value={typeSearchQ}
                      onChange={(e) => setTypeSearchQ(e.target.value)}
                      style={{ ...S.input, padding: '8px 10px', fontSize: 13 }}
                    />
                  </div>
                  
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {filteredTypes.map(opt => (
                      <div
                        key={opt.value}
                        onClick={() => {
                          setForm(p => ({ ...p, vehicleType: opt.value }));
                          setShowTypeDropdown(false);
                          setTypeSearchQ('');
                        }}
                        style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 13, fontWeight: 'bold' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#f0f9ff'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                      >
                        {opt.label}
                      </div>
                    ))}

                    {typeSearchQ.trim() && !exactMatchExists && (
                      <div 
                        onClick={() => {
                          const val = typeSearchQ.trim();
                          setForm(p => ({ ...p, vehicleType: val }));
                          setShowTypeDropdown(false);
                          setTypeSearchQ('');
                        }}
                        style={{ 
                          padding: '12px 14px', background: '#f0fdf4', color: '#059669', 
                          fontWeight: 'bold', cursor: 'pointer', borderTop: '2px solid #e2e8f0',
                          fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 
                        }}
                      >
                        <span>➕</span>
                        <span>&quot;{typeSearchQ}&quot; {t.addCustomVehicleType}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={S.grid2}>
            <div>
              <label style={S.label}>{t.driverName}</label>
              <input value={form.driverName} onChange={(e) => setForm((p) => ({ ...p, driverName: e.target.value }))} style={S.input} />
            </div>
            <div>
              <label style={S.label}>{t.driverPhone}</label>
              <input value={form.driverPhone} onChange={(e) => setForm((p) => ({ ...p, driverPhone: e.target.value }))} style={S.input} placeholder="07X XXX XXXX" />
            </div>
          </div>
          <div style={S.grid2}>
            <div>
              <label style={S.label}>{t.capacity}</label>
              <input value={form.capacity} onChange={(e) => setForm((p) => ({ ...p, capacity: e.target.value }))} style={S.input} placeholder="10 Ton" />
            </div>
            {vehicle && (
              <div>
                <label style={S.label}>{t.status}</label>
                <select value={form.isActive ? 'active' : 'inactive'} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.value === 'active' }))} style={S.input}>
                  <option value="active">● {t.active}</option>
                  <option value="inactive">● {t.inactive}</option>
                </select>
              </div>
            )}
          </div>
          <div>
            <label style={S.label}>{t.notes}</label>
            <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} style={{ ...S.input, height: 70, resize: 'vertical' }} />
          </div>
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
   12. ADD TRIP MODAL
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
  const [stockControlEnabled, setStockControlEnabled] = useState(true);
  const [quickPurchaseItem, setQuickPurchaseItem] = useState(null);

  const [allItems, setAllItems] = useState([]);
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(collection(db, 'items'), where('uid', '==', uid)),
      (snap) => setAllItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return unsub;
  }, [uid]);

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

  const addCargoItem = () => setCargoItems((p) => [...p, { goodsId: '', goodsName: '', goodsNameSi: '', goodsImage: '', qty: 1, unitPrice: '', total: 0 }]);
  const updateCargo = (idx, updatedItem) => {
    setCargoItems((p) => { const n = [...p]; n[idx] = updatedItem; return n; });
  };
  const removeCargo = (idx) => setCargoItems((p) => p.filter((_, i) => i !== idx));

  const handleCustomerChange = (custId, custData) => {
    if (custId === 'guest' || !custId) {
      setForm((p) => ({ ...p, customerId: '', customerName: '', customerPhone: '' }));
    } else if (custData) {
      setForm((p) => ({ ...p, customerId: custId, customerName: custData.name || '', customerPhone: custData.phone || '' }));
    }
  };

  const handleSave = async () => {
    if (!form.vehicleId) return alert(t.selectVehicle + '!');
    if (!form.fare && cargoItems.length === 0 && !meterTotal && !hoursTotal && !daysTotal && !monthsTotal) return alert(t.fare + '!');
    if (isGuest && balanceDue > 0.01) { alert(t.guestWarning); return; }

    if (stockControlEnabled) {
      for (const ci of cargoItems) {
        if (ci.goodsId) {
          const catItem = allItems.find(i => i.id === ci.goodsId);
          const avStock = catItem ? getDocStock(catItem) : 0;
          if (avStock < R2(ci.qty)) {
            alert(`⚠️ "${ci.goodsName}" ${t.insufficientStock} (${avStock})`);
            return;
          }
        }
      }
    }

    setSaving(true);
    try {
      const vehicle = vehicles.find((v) => v.id === form.vehicleId);
      const tripData = {
        uid, tripDate: Timestamp.fromDate(new Date(form.tripDate + 'T12:00:00')),
        vehicleId: form.vehicleId, vehicleName: vehicle?.vehicleNo || '', vehicleType: vehicle?.vehicleType || '',
        customerId: form.customerId || null, customerName: form.customerName || t.guestCustomer, customerPhone: form.customerPhone || '',
        fromLocation: form.fromLocation, toLocation: form.toLocation, fare,
        meterUnits: form.useMeter ? R2(form.meterUnits) : 0, meterRate: form.useMeter ? R2(form.meterRate) : 0, meterKmTotal: meterTotal,
        meterHours: form.useHours ? R2(form.meterHours) : 0, hourlyRate: form.useHours ? R2(form.hourlyRate) : 0, meterHoursTotal: hoursTotal,
        meterDays: form.useDays ? R2(form.meterDays) : 0, dailyRate: form.useDays ? R2(form.dailyRate) : 0, meterDaysTotal: daysTotal,
        meterMonths: form.useMonths ? R2(form.meterMonths) : 0, monthlyRate: form.useMonths ? R2(form.monthlyRate) : 0, meterMonthsTotal: monthsTotal,
        damageAmount: damageAmt, damageNote: form.useDamage ? form.damageNote.trim() : '',
        cargoItems: cargoItems.map((ci) => ({
          goodsId: ci.goodsId || '', goodsName: ci.goodsName, goodsNameSi: ci.goodsNameSi || '',
          qty: R2(ci.qty), unitPrice: R2(ci.unitPrice), originalPrice: R2(ci.originalPrice || ci.unitPrice), total: R2(ci.total),
        })),
        totalBillAmount: totalBill, paidAmount: paid, balanceDue, paymentMethod: form.paymentMethod, notes: form.notes, createdAt: serverTimestamp(),
      };

      const batch = writeBatch(db);
      const tripRef = doc(collection(db, `${basePath}/vehicleTrips`));
      batch.set(tripRef, tripData);

      cargoItems.forEach((ci) => {
        if (ci.goodsId) {
          const itemRef = doc(db, 'items', ci.goodsId);
          batch.update(itemRef, {
            stock: increment(-R2(ci.qty)),
            currentStock: increment(-R2(ci.qty)),
            'stocks.Main_Store': increment(-R2(ci.qty)),
          });
        }
      });

      if (form.customerId && balanceDue > 0) {
        batch.update(doc(db, 'customers', form.customerId), { currentBalance: increment(balanceDue), updatedAt: serverTimestamp() });
        const txnRef = doc(collection(db, 'customerTransactions'));
        batch.set(txnRef, { uid, customerId: form.customerId, type: 'credit', amount: totalBill, date: form.tripDate, note: `${t.baseFare} (${vehicle?.vehicleNo || ''})`, source: 'vehicleTrip', tripId: tripRef.id, createdAt: serverTimestamp(), timestamp: Date.now() });
        
        if (paid > 0) {
          const payTxnRef = doc(collection(db, 'customerTransactions'));
          batch.set(payTxnRef, { uid, customerId: form.customerId, type: 'payment', amount: paid, date: form.tripDate, note: `${t.paidAmount} (${vehicle?.vehicleNo || ''})`, source: 'vehicleTrip', tripId: tripRef.id, paymentMethod: form.paymentMethod, createdAt: serverTimestamp(), timestamp: Date.now() + 100 });
        }
      }

      if (paid > 0) {
        const cashTxnRef = doc(collection(db, `users/${uid}/cashTransactions`));
        batch.set(cashTxnRef, { uid, type: 'in', category: 'vehicleIncome', source: 'vehicleTrip', description: `${t.title} - ${form.customerName || t.guestCustomer}`, amount: paid, paymentMethod: form.paymentMethod, customerId: form.customerId || null, customerName: form.customerName || t.guestCustomer, tripId: tripRef.id, date: form.tripDate, timestamp: Timestamp.fromDate(new Date(form.tripDate + 'T12:00:00')), createdAt: serverTimestamp(), isAutomatic: true });
      }

      await batch.commit();
      onSaved?.(); onClose();
    } catch (e) { alert('Error: ' + e.message); } finally { setSaving(false); }
  };

  return (
    <div style={S.overlay}>
      {quickPurchaseItem && (
        <QuickPurchaseModal
          isOpen={!!quickPurchaseItem}
          item={quickPurchaseItem}
          user={{ uid }}
          onClose={() => setQuickPurchaseItem(null)}
          t={t}
        />
      )}

      <div style={{ ...S.modal, maxWidth: 720 }}>
        <div style={S.modalHdr('#667eea')}>
          <h3 style={{ margin: 0, fontSize: 18 }}>🚛 {t.addTrip}</h3>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>

          <div style={S.grid2}>
            <div><label style={S.label}>{t.tripDate} *</label><input type="date" value={form.tripDate} onChange={(e) => setForm((p) => ({ ...p, tripDate: e.target.value }))} style={S.input} /></div>
            <div><label style={S.label}>{t.vehicle} *</label><select value={form.vehicleId} onChange={(e) => setForm((p) => ({ ...p, vehicleId: e.target.value }))} style={S.input}><option value="">{t.selectVehicle}</option>{vehicles.filter((v) => v.isActive !== false).map((v) => (<option key={v.id} value={v.id}>{v.vehicleNo} — {v.vehicleType}</option>))}</select></div>
          </div>

          <div><label style={S.label}>{t.customer}</label><CustomerSearch uid={uid} value={form.customerId} onChange={handleCustomerChange} t={t} />
            {!form.customerId && (<div style={{ ...S.grid2, marginTop: 10 }}><input value={form.customerName} onChange={(e) => setForm((p) => ({ ...p, customerName: e.target.value }))} style={S.input} placeholder={`${t.customerName} (${t.guestCustomer})`} /><input value={form.customerPhone} onChange={(e) => setForm((p) => ({ ...p, customerPhone: e.target.value }))} style={S.input} placeholder={`${t.phone}`} /></div>)}
          </div>

          <div style={S.grid2}>
            <div><label style={S.label}>{t.fromLocation}</label><input value={form.fromLocation} onChange={(e) => setForm((p) => ({ ...p, fromLocation: e.target.value }))} style={S.input} /></div>
            <div><label style={S.label}>{t.toLocation}</label><input value={form.toLocation} onChange={(e) => setForm((p) => ({ ...p, toLocation: e.target.value }))} style={S.input} /></div>
          </div>

          <div><label style={S.label}>🚛 {t.baseFare} (Rs.)</label><input type="number" inputMode="decimal" step="any" min="0" value={form.fare} onChange={(e) => setForm((p) => ({ ...p, fare: e.target.value }))} style={{ ...S.input, fontSize: 20, fontWeight: 800, color: '#2563eb' }} placeholder="0.00" /></div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#475569', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>⚙️ {t.extraCharges}</span><span style={{ fontSize: 11, background: '#e0e7ff', color: '#4338ca', padding: '2px 8px', borderRadius: 8 }}>{t.optional}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <MeterRow icon="🛣️" label={t.meterKm} useKey="useMeter" unitsKey="meterUnits" rateKey="meterRate" unitsLabel={t.meterUnits} rateLabel={t.meterRate} unitSuffix="km" total={meterTotal} presets={[{ v: 5, l: '5km' }, { v: 10, l: '10km' }, { v: 25, l: '25km' }, { v: 50, l: '50km' }, { v: 100, l: '100km' }]} form={form} setForm={setForm} S={S} />
              <MeterRow icon="⏱️" label={t.meterHours} useKey="useHours" unitsKey="meterHours" rateKey="hourlyRate" unitsLabel={t.hoursCount} rateLabel={t.hourlyRate} unitSuffix="hrs" total={hoursTotal} presets={[{ v: 1, l: '1hr' }, { v: 2, l: '2hrs' }, { v: 4, l: '4hrs' }, { v: 8, l: '8hrs' }]} form={form} setForm={setForm} S={S} />
              <MeterRow icon="📅" label={t.meterDays} useKey="useDays" unitsKey="meterDays" rateKey="dailyRate" unitsLabel={t.daysCount} rateLabel={t.dailyRate} unitSuffix="days" total={daysTotal} presets={[{ v: 1, l: '1 day' }, { v: 2, l: '2 days' }, { v: 7, l: '1 wk' }, { v: 30, l: '1 mo' }]} form={form} setForm={setForm} S={S} />
              <MeterRow icon="📆" label={t.meterMonths} useKey="useMonths" unitsKey="meterMonths" rateKey="monthlyRate" unitsLabel={t.monthsCount} rateLabel={t.monthlyRate} unitSuffix="months" total={monthsTotal} presets={[{ v: 1, l: '1 mo' }, { v: 3, l: '3 mos' }, { v: 6, l: '6 mos' }, { v: 12, l: '1 yr' }]} form={form} setForm={setForm} S={S} />

              <div style={{ background: form.useDamage ? '#fff7ed' : '#f8fafc', borderRadius: 12, padding: 14, border: `2px solid ${form.useDamage ? '#fed7aa' : '#e2e8f0'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: form.useDamage ? 12 : 0 }}>
                  <button type="button" onClick={() => setForm((p) => ({ ...p, useDamage: !p.useDamage }))} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: form.useDamage ? '#f97316' : '#d1d5db', position: 'relative', padding: 0, flexShrink: 0, transition: 'background 0.2s' }}>
                    <span style={{ position: 'absolute', top: 2, left: form.useDamage ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </button>
                  <span style={{ fontSize: 14, fontWeight: 700, color: form.useDamage ? '#ea580c' : '#64748b' }}>⚠️ {t.damage}</span>
                  {form.useDamage && damageAmt > 0 && (<span style={{ marginLeft: 'auto', fontWeight: 900, color: '#dc2626', fontSize: 16 }}>{formatCurrency(damageAmt)}</span>)}
                </div>
                {form.useDamage && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div><label style={S.label}>{t.damageAmount}</label><input type="number" inputMode="decimal" min="0" step="any" value={form.damageAmount} onChange={(e) => setForm((p) => ({ ...p, damageAmount: e.target.value }))} style={{ ...S.input, color: '#dc2626', fontWeight: 800, fontSize: 18, border: '2px solid #fecaca' }} placeholder="0.00" /></div>
                    <div><label style={S.label}>{t.damageNote}</label><input value={form.damageNote} onChange={(e) => setForm((p) => ({ ...p, damageNote: e.target.value }))} style={{ ...S.input, border: '2px solid #fecaca' }} /></div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <label style={{ ...S.label, margin: 0, fontSize: 14 }}>📦 {t.cargo} ({t.optional})</label>
              
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setStockControlEnabled(!stockControlEnabled)}
                  style={{
                    padding: '6px 12px', border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 'bold', cursor: 'pointer',
                    background: stockControlEnabled ? '#ecfdf5' : '#fffbeb',
                    color: stockControlEnabled ? '#059669' : '#d97706',
                    border: `1px solid ${stockControlEnabled ? '#a7f3d0' : '#fde047'}`,
                  }}
                >
                  {stockControlEnabled ? t.stockOn : t.stockOff}
                </button>
                <button type="button" onClick={addCargoItem} style={S.btn('#8b5cf6')}>+ {t.addGoods}</button>
              </div>
            </div>

            {cargoItems.length === 0 && (
              <div style={{
                padding: 20, textAlign: 'center', border: '2px dashed #cbd5e1',
                borderRadius: 12, color: '#94a3b8', background: '#fafafa',
              }}>
                <div style={{ fontSize: 30, marginBottom: 6 }}>📦</div>
                <div style={{ fontSize: 13 }}>{t.noItems} — &quot;+ {t.addGoods}&quot; {t.pressAddGoods}</div>
                <div style={{ fontSize: 11, marginTop: 4, color: '#b0b0b0' }}>
                  {t.orAddManually}
                </div>
              </div>
            )}

            {cargoItems.map((ci, idx) => (
              <CargoItemRow
                key={idx}
                idx={idx}
                item={ci}
                allItems={allItems}
                onChange={updateCargo}
                onRemove={removeCargo}
                onQuickPurchase={setQuickPurchaseItem}
                stockControlEnabled={stockControlEnabled}
                t={t}
              />
            ))}
          </div>

          <div style={{ background: 'linear-gradient(135deg,#f0f9ff,#eff6ff)', borderRadius: 14, padding: 16, border: '2px solid #bfdbfe' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1e40af', marginBottom: 10 }}>{t.billSummary}</div>
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

          <div style={S.grid2}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <label style={{ ...S.label, margin: 0 }}>{t.paidAmount} (Rs.)</label>
                {totalBill > 0 && (<button type="button" onClick={() => setForm((p) => ({ ...p, paidAmount: String(totalBill) }))} style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#15803d', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, cursor: 'pointer' }}>⚡ {t.payFull}</button>)}
              </div>
              <input type="number" inputMode="decimal" step="any" min="0" value={form.paidAmount} onChange={(e) => setForm((p) => ({ ...p, paidAmount: e.target.value }))} style={{ ...S.input, fontSize: 18, fontWeight: 800, color: '#16a34a' }} placeholder="0.00" />
            </div>
            <div><label style={S.label}>{t.paymentMethod}</label><select value={form.paymentMethod} onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value }))} style={S.input}>
              <option value="cash">💵 {t.cash}</option>
              <option value="bank">🏦 {t.bank}</option>
              <option value="credit">🔴 {t.credit}</option>
            </select></div>
          </div>

          {isGuest && balanceDue > 0.01 && (
            <div style={{ padding: '12px 16px', background: '#fef2f2', borderRadius: 10, border: '2px solid #fecaca', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 24 }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, color: '#dc2626', fontSize: 13 }}>{t.guestWarning}</div>
                <div style={{ fontSize: 11, color: '#991b1b', marginTop: 2 }}>{t.balanceDue}: {formatCurrency(balanceDue)}</div>
              </div>
              <button type="button" onClick={() => setForm((p) => ({ ...p, paidAmount: String(totalBill) }))} style={{ padding: '6px 12px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>{t.payFullLbl}</button>
            </div>
          )}

          {!isGuest && balanceDue > 0.01 && (
            <div style={{ padding: '10px 16px', background: '#fef2f2', borderRadius: 10, border: '2px solid #fecaca', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: '#dc2626' }}>⚠️ {t.balanceDue}:</span>
              <span style={{ fontWeight: 900, fontSize: 18, color: '#dc2626' }}>{formatCurrency(balanceDue)}</span>
            </div>
          )}

          <div><label style={S.label}>{t.notes}</label><textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} style={{ ...S.input, height: 70, resize: 'vertical' }} /></div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={onClose} style={{ ...S.btn('#f1f5f9', '#475569'), flex: 1 }}>{t.cancel}</button>
            <button onClick={handleSave} disabled={saving || (isGuest && balanceDue > 0.01)} style={{ ...S.btn(isGuest && balanceDue > 0.01 ? '#94a3b8' : '#667eea'), flex: 2, cursor: (isGuest && balanceDue > 0.01) ? 'not-allowed' : 'pointer' }}>
              {saving ? t.saving : `💾 ${t.save}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   13. REPORTS TAB
   ════════════════════════════════════════ */
function ReportsTab({ trips, vehicles, t, lang }) {
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
        {statCards.map((sc, i) => (<div key={i} style={{ ...S.card, padding: 20, marginBottom: 0, textAlign: 'center', borderTop: `4px solid ${sc.color}` }}><div style={{ fontSize: 30, marginBottom: 8 }}>{sc.icon}</div><div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>{sc.label}</div><div style={{ fontSize: 18, fontWeight: 900, color: sc.color }}>{sc.value}</div></div>))}
      </div>
      <div style={S.card}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{[t.date, t.vehicle, t.customer, t.route, t.totalBill, t.received, t.balanceDue].map((h) => (<th key={h} style={S.th}>{h}</th>))}</tr></thead>
            <tbody>
              {filtered.length === 0 ? (<tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: '#94a3b8', padding: 40 }}>{t.noData}</td></tr>) : (
                filtered.map((tr) => {
                  const due = R2(tr.balanceDue || 0);
                  return (<tr key={tr.id}><td style={S.td}>{formatDate(tr.tripDate, lang)}</td><td style={S.td}><span style={S.badge('#e0e7ff', '#4338ca')}>{tr.vehicleName || '-'}</span></td><td style={S.td}>{tr.customerName || t.guestCustomer}</td><td style={{ ...S.td, fontSize: 12, color: '#64748b' }}>{[tr.fromLocation, tr.toLocation].filter(Boolean).join(' → ') || '-'}</td><td style={{ ...S.td, fontWeight: 700 }}>{formatCurrency(tr.totalBillAmount)}</td><td style={{ ...S.td, fontWeight: 700, color: '#16a34a' }}>{formatCurrency(tr.paidAmount)}</td><td style={S.td}>{due > 0.01 ? <span style={S.badge('#fef2f2', '#dc2626')}>Rs.{due.toLocaleString()}</span> : <span style={S.badge('#f0fdf4', '#16a34a')}>✅</span>}</td></tr>);
                })
              )}
            </tbody>
            {filtered.length > 0 && (<tfoot><tr style={{ background: '#f8fafc', fontWeight: 800 }}><td colSpan={4} style={{ ...S.td, textAlign: 'right' }}>{t.summary}:</td><td style={S.td}>{formatCurrency(totalBilled)}</td><td style={{ ...S.td, color: '#16a34a' }}>{formatCurrency(totalReceived)}</td><td style={{ ...S.td, color: '#dc2626' }}>{formatCurrency(totalDue)}</td></tr></tfoot>)}
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   14. MAIN COMPONENT EXPORT
   ═══════════════════════════════════════════════════════════════ */
export default function VehicleIncomeManager() {
  const { user } = useUserAuth();
  const { lang, t } = useLanguage();

  const [activeTab, setActiveTab] = useState('income');
  const [vehicles, setVehicles] = useState([]);
  const [trips, setTrips] = useState([]);
  const [outputInvoice, setOutputInvoice] = useState(null);
  const [showAddTrip, setShowAddTrip] = useState(false);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [filterVehicle, setFilterVehicle] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [sortBy, setSortBy] = useState('dateDesc');
  const [payFilter, setPayFilter] = useState('all');

  const basePath = useMemo(() => (user ? `users/${user.uid}` : null), [user]);

  useEffect(() => {
    if (!basePath) return;
    const unsubV = onSnapshot(collection(db, `${basePath}/vehicles`), (s) => setVehicles(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const unsubT = onSnapshot(query(collection(db, `${basePath}/vehicleTrips`), orderBy('tripDate', 'desc')), (s) => setTrips(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => { unsubV(); unsubT(); };
  }, [basePath]);

  const filteredTrips = useMemo(() => {
    let result = trips.filter((tr) => {
      if (filterVehicle && tr.vehicleId !== filterVehicle) return false;
      if (searchQ && !fuzzyMatch(tripSearchStr(tr), searchQ)) return false;
      if (payFilter === 'paid' && R2(tr.balanceDue || 0) > 0.01) return false;
      if (payFilter === 'unpaid' && R2(tr.balanceDue || 0) <= 0.01) return false;
      return true;
    });
    switch (sortBy) {
      case 'dateAsc': result.sort((a, b) => toMs(a.tripDate) - toMs(b.tripDate)); break;
      case 'amountDesc': result.sort((a, b) => R2(b.totalBillAmount || 0) - R2(a.totalBillAmount || 0)); break;
      case 'amountAsc': result.sort((a, b) => R2(a.totalBillAmount || 0) - R2(b.totalBillAmount || 0)); break;
      case 'nameAZ': result.sort((a, b) => (a.customerName || '').localeCompare(b.customerName || '')); break;
      case 'nameZA': result.sort((a, b) => (b.customerName || '').localeCompare(a.customerName || '')); break;
      default: result.sort((a, b) => toMs(b.tripDate) - toMs(a.tripDate)); break;
    }
    return result;
  }, [trips, filterVehicle, searchQ, sortBy, payFilter]);

  const openOutputManager = useCallback((trip) => setOutputInvoice(buildTripInvoice(trip, vehicles, t)), [vehicles, t]);

  const tabs = [
    { key: 'income', icon: '💰', label: t.incomeTab || t.income },
    { key: 'expenses', icon: '💸', label: t.expenses },
    { key: 'vehicles', icon: '🚗', label: t.vehicles },
    { key: 'reports', icon: '📊', label: t.reports },
  ];

  return (
    <div style={S.container}>
      {outputInvoice && (<InvoiceOutputManager invoice={outputInvoice} initialMode="whatsapp" onClose={() => setOutputInvoice(null)} />)}
      {showAddTrip && basePath && (<AddTripModal basePath={basePath} uid={user.uid} vehicles={vehicles} onClose={() => setShowAddTrip(false)} onSaved={() => setShowAddTrip(false)} t={t} lang={lang} />)}
      
      {showAddVehicle && basePath && (
        <VehicleModal 
          basePath={basePath} 
          vehicle={editingVehicle}
          vehicles={vehicles}
          onClose={() => { setShowAddVehicle(false); setEditingVehicle(null); }} 
          onSaved={() => { setShowAddVehicle(false); setEditingVehicle(null); }} 
          t={t} 
        />
      )}

      <div style={S.header}>
        <div style={{ fontSize: 50, marginBottom: 10 }}>🚛</div>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>{t.title}</h1>
        <p style={{ margin: '8px 0 0', opacity: 0.85, fontSize: 14 }}>{vehicles.length} {t.headerSubtitle} • {trips.length} {t.tripCountLabel}</p>
      </div>

      <div style={S.tabs}>
        {tabs.map((tab) => (<button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ padding: '12px 24px', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, background: activeTab === tab.key ? 'linear-gradient(135deg,#667eea,#764ba2)' : '#f8fafc', color: activeTab === tab.key ? 'white' : '#64748b', boxShadow: activeTab === tab.key ? '0 4px 12px rgba(102,126,234,0.3)' : 'none', transition: 'all 0.2s' }}><span>{tab.icon}</span><span>{tab.label}</span></button>))}
      </div>

      {activeTab === 'expenses' && <VehicleExpenseTab vehicles={vehicles} lang={lang} />}

      {activeTab === 'income' && (
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>💰 {t.incomeTab || t.income}</h2>
            <button onClick={() => setShowAddTrip(true)} style={S.btn('#667eea')}>+ {t.addTrip}</button>
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 2, minWidth: 200 }}><input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder={t.searchTrips} style={S.searchInput} /></div>
            <select value={filterVehicle} onChange={(e) => setFilterVehicle(e.target.value)} style={{ ...S.input, maxWidth: 160 }}><option value="">{t.allVehicles}</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.vehicleNo}</option>)}</select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ ...S.input, maxWidth: 180 }}>
              <option value="dateDesc">📅 {t.newestFirst}</option>
              <option value="dateAsc">📅 {t.oldestFirst}</option>
              <option value="amountDesc">💰 {t.amountHighLow}</option>
              <option value="amountAsc">💰 {t.amountLowHigh}</option>
              <option value="nameAZ">👤 {t.nameAZ}</option>
              <option value="nameZA">👤 {t.nameZA}</option>
            </select>
            <select value={payFilter} onChange={(e) => setPayFilter(e.target.value)} style={{ ...S.input, maxWidth: 140 }}>
              <option value="all">{t.all}</option>
              <option value="paid">✅ {t.fullyPaid}</option>
              <option value="unpaid">⚠️ {t.unpaid}</option>
            </select>
          </div>
          {searchQ && (<div style={{ marginBottom: 12, fontSize: 13, color: '#64748b' }}>🔍 &quot;{searchQ}&quot; — {filteredTrips.length} {t.searchResults}</div>)}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{[t.tripDate, t.vehicle, t.customer, t.fare, t.paidAmount, t.balanceDue, t.actions].map((h) => (<th key={h} style={S.th}>{h}</th>))}</tr></thead>
              <tbody>
                {filteredTrips.length === 0 ? (
                  <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: '#94a3b8', padding: 40 }}><div style={{ fontSize: 40, marginBottom: 10 }}>{searchQ ? '🔍' : '🚛'}</div>{searchQ ? `"${searchQ}" ${t.noMatches}` : t.noData}</td></tr>
                ) : (
                  filteredTrips.map((tr) => {
                    const due = R2(tr.balanceDue || 0);
                    const hasExtra = R2(tr.meterKmTotal) > 0 || R2(tr.meterHoursTotal) > 0 || R2(tr.meterDaysTotal) > 0 || R2(tr.meterMonthsTotal) > 0 || R2(tr.damageAmount) > 0;
                    return (
                      <tr key={tr.id} onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}>
                        <td style={S.td}>{formatDate(tr.tripDate, lang)}</td>
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
                        <td style={S.td}>{due > 0.01 ? <span style={S.badge('#fef2f2', '#dc2626')}>Rs.{due.toLocaleString()}</span> : <span style={S.badge('#f0fdf4', '#16a34a')}>✅ {t.fullyPaid}</span>}</td>
                        <td style={S.td}><button onClick={() => openOutputManager(tr)} style={{ padding: '7px 14px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>📤 {t.share}</button></td>
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
            <button onClick={() => { setEditingVehicle(null); setShowAddVehicle(true); }} style={S.btn('#10b981')}>+ {t.addVehicle}</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
            {vehicles.length === 0 ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: '#94a3b8' }}><div style={{ fontSize: 50, marginBottom: 10 }}>🚗</div><div>{t.noVehicles}</div></div>
            ) : (
              vehicles.map((v) => {
                const vTrips = trips.filter((x) => x.vehicleId === v.id);
                const vIncome = vTrips.reduce((s, x) => s + R2(x.paidAmount || 0), 0);
                const typeEmoji = {
                  truck: '🚛',
                  lorry: '🚚',
                  van: '🚐',
                  pickup: '🛻',
                  threewheel: '🛺',
                  car: '🚗',
                  bus: '🚌',
                  tractor: '🚜',
                  bike: '🏍️'
                }[v.vehicleType] || '🚗';
                
                return (
                  <div key={v.id} style={{ ...S.card, marginBottom: 0, border: '2px solid #e2e8f0', padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        <span style={{ fontSize: 36 }}>{typeEmoji}</span>
                        <div><div style={{ fontWeight: 900, fontSize: 18 }}>{v.vehicleNo}</div><div style={{ fontSize: 12, color: '#64748b' }}>{v.vehicleType}</div></div>
                        <span style={{ marginLeft: 'auto', ...S.badge(v.isActive !== false ? '#f0fdf4' : '#f1f5f9', v.isActive !== false ? '#16a34a' : '#94a3b8') }}>● {v.isActive !== false ? t.active : t.inactive}</span>
                      </div>
                      {v.driverName && <div style={{ fontSize: 13, color: '#475569', marginBottom: 6 }}>👨‍💼 {v.driverName} {v.driverPhone && `• ${v.driverPhone}`}</div>}
                      {v.capacity && <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>⚖️ {t.weightCap}: {v.capacity}</div>}
                    </div>
                    
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px solid #e2e8f0', marginBottom: 12 }}>
                        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 11, color: '#94a3b8' }}>{t.tripCount}</div><div style={{ fontWeight: 800, color: '#3b82f6' }}>{vTrips.length}</div></div>
                        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 11, color: '#94a3b8' }}>{t.income}</div><div style={{ fontWeight: 800, color: '#16a34a', fontSize: 13 }}>Rs.{vIncome.toLocaleString()}</div></div>
                      </div>
                      <button 
                        onClick={() => { setEditingVehicle(v); setShowAddVehicle(true); }}
                        style={{ ...S.btn('#3b82f6', 'white'), width: '100%', padding: '8px 12px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                      >
                        ✏️ {t.edit}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {activeTab === 'reports' && <ReportsTab trips={trips} vehicles={vehicles} t={t} lang={lang} />}
    </div>
  );
}