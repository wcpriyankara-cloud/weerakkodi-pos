'use client';

// src/components/VehicleIncomeManager.jsx
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// v22.0 â€” Next.js compatible version
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  collection, addDoc, updateDoc, doc,
  onSnapshot, query, where, orderBy,
  Timestamp, serverTimestamp, increment, getDoc,
} from 'firebase/firestore';
import { db } from '@/shared/firebase-config';
import { useUserAuth } from '@/context/UserContext';
import VehicleExpenseTab from './VehicleExpenseTab';
import InvoiceOutputManager from './InvoiceOutputManager';

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HELPERS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const todayStr = () => new Date().toISOString().split('T')[0];

const toMs = src => {
  if (!src) return 0;
  if (typeof src?.toDate === 'function') return src.toDate().getTime();
  if (src?.seconds) return src.seconds * 1000;
  if (src?._seconds) return src._seconds * 1000;
  if (typeof src === 'number') return src;
  const d = new Date(src);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

const formatDate = src => {
  if (!src) return '-';
  const ms = toMs(src);
  if (ms > 0) return new Date(ms).toLocaleDateString('si-LK');
  if (typeof src === 'string' && src.length >= 10) {
    const d = new Date(src + 'T00:00:00');
    return isNaN(d.getTime()) ? src : d.toLocaleDateString('si-LK');
  }
  return '-';
};

const formatCurrency = v =>
  'Rs. ' + (Number(v) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });

const R2 = v => { const n = parseFloat(v); return isNaN(n) ? 0 : Math.round(n * 100) / 100; };
const fmtQ = v => { const n = R2(v); return n % 1 === 0 ? String(n) : n.toFixed(2); };

const safeStr = v => {
  if (v === null || v === undefined) return '-';
  if (typeof v === 'object') {
    if (typeof v.toDate === 'function') return formatDate(v);
    if (v.seconds) return formatDate(v);
    return JSON.stringify(v);
  }
  return String(v);
};

// Phone + Portal
const normalizePhone = raw => {
  if (!raw) return '';
  let p = String(raw).replace(/[\s\-\(\)]/g, '');
  if (p.startsWith('+94')) p = '0' + p.slice(3);
  else if (p.startsWith('94') && p.length >= 11) p = '0' + p.slice(2);
  else if (/^\d{9}$/.test(p)) p = '0' + p;
  return p;
};

const phoneToIntl = raw => {
  const p = normalizePhone(raw);
  return p.startsWith('0') ? '94' + p.slice(1) : p;
};

const displayPhone = raw => {
  const p = normalizePhone(raw);
  return (p.startsWith('0') && p.length === 10) ? `${p}  (+94${p.slice(1)})` : p;
};

const phoneMatch = (a, b) => {
  const na = normalizePhone(a), nb = normalizePhone(b);
  return !!(na && nb && (na.includes(nb) || nb.includes(na)));
};

const norm = v => (v || '').toString().trim().toLowerCase();
const slugify = s => String(s || 'c').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const makePortalKey = n => `${slugify(n)}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const getBasePosUrl = () =>
  process.env.NEXT_PUBLIC_POS_URL ||
  (typeof window !== 'undefined' ? window.location.origin : '');

const getPortalLink = k => k ? `${getBasePosUrl()}/portal/${k}` : '';

// Contacts
const blobToDataURL = blob => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = rej;
  r.readAsDataURL(blob);
});

const hasNativeContactPicker = () =>
  typeof window !== 'undefined' &&
  window.isSecureContext === true &&
  'contacts' in navigator &&
  'ContactsManager' in window;

const parseVCF = txt => {
  const contacts = [];
  for (const card of txt.split('BEGIN:VCARD').filter(c => c.trim())) {
    let name = '', phone = '', photo = '';
    const lines = card.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      if (l.startsWith('FN:') || l.startsWith('FN;')) name = l.split(':').slice(1).join(':').trim();
      else if (!name && (l.startsWith('N:') || l.startsWith('N;'))) {
        const p = l.split(':').slice(1).join(':').split(';');
        name = `${(p[1] || '').trim()} ${(p[0] || '').trim()}`.trim();
      }
      if (l.startsWith('TEL') && !phone) phone = l.split(':').slice(1).join(':').trim();
      if (l.startsWith('PHOTO')) {
        let d = ''; const ci = l.indexOf(':');
        if (ci > -1) d = l.slice(ci + 1);
        let j = i + 1;
        while (j < lines.length && (lines[j].startsWith(' ') || lines[j].startsWith('\t'))) { d += lines[j].trim(); j++; }
        i = j - 1;
        if (d && !d.startsWith('http')) {
          const m = l.toLowerCase().includes('type=png') ? 'image/png' : 'image/jpeg';
          photo = d.startsWith('data:') ? d : `data:${m};base64,${d}`;
        }
      }
    }
    if (name || phone) contacts.push({ name: name || 'Unknown', phone: normalizePhone(phone), photoDataUrl: photo || '' });
  }
  return contacts;
};

const readVCFFile = f => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = e => { try { res(parseVCF(e.target.result)); } catch (err) { rej(err); } };
  r.onerror = rej;
  r.readAsText(f);
});

// Goods
const GOODS_PH = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23e2e8f0' rx='10'/%3E%3Cpath d='M25 68l16-18 12 12 10-10 12 16' stroke='%2394a3b8' stroke-width='5' fill='none'/%3E%3Ccircle cx='66' cy='34' r='6' fill='%2394a3b8'/%3E%3C/svg%3E";
const getGoodsImage = item => {
  if (!item) return GOODS_PH;
  const src = item.picture || item.photoURL || item.imageUrl || item.image || item.productImage || (Array.isArray(item.images) ? item.images[0] : '') || '';
  return src && String(src).length > 8 ? src : GOODS_PH;
};
const getGoodsOrigPrice = item => R2(item?.sellingPriceRetail || item?.retailPrice || item?.sellingPrice || item?.price || item?.mrp || 0);
const getGoodsSellPrice = item => {
  const yp = R2(item?.retailYourPrice || 0);
  if (yp > 0) return yp;
  const op = getGoodsOrigPrice(item);
  const disc = R2(item?.retailDiscount || item?.discPercent || item?.discount || 0);
  return disc > 0 ? R2(op - (op * disc / 100)) : op;
};
const getGoodsName = item => item?.name || item?.goodsName || item?.itemName || 'â€”';
const getInventoryItemStock = item => {
  if (!item) return 0;
  if (item.stock != null && item.stock !== '') {
    const n = parseFloat(item.stock);
    if (!isNaN(n)) return R2(n);
  }
  if (item.currentStock != null && item.currentStock !== '') {
    const n = parseFloat(item.currentStock);
    if (!isNaN(n)) return R2(n);
  }
  return 0;
};
const getCustomerPicture = c => c?.profilePicture || c?.picture || c?.photoURL || c?.photo || '';
const getCustomerBalance = c => R2(c?.currentBalance ?? c?.balance ?? 0);

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   BUILD TRIP â†’ INVOICE OBJECT
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const buildTripInvoice = (trip, vehicles = []) => {
  if (!trip) return null;

  const tripId     = trip.id || trip.receiptId || Date.now().toString(36);
  const invoiceNo  = `TRP-${String(tripId).slice(0, 6).toUpperCase()}`;
  const vehicleNo  = trip.vehicleName || vehicles.find(v => v.id === trip.vehicleId)?.vehicleNo || '';
  const totalBill  = R2(trip.totalBillAmount || 0);
  const paidAmt    = R2(trip.paidAmount || 0);
  const balanceDue = R2(trip.balanceDue || 0);

  const methodMap  = { cash: 'cash', bank: 'etransfer', card: 'card', credit: 'credit' };
  const payMethod  = methodMap[trip.paymentMethod] || 'cash';

  const items = [];

  if (R2(trip.fare) > 0) {
    const routeLabel = (trip.startLocation && trip.endLocation)
      ? `${trip.startLocation} â†’ ${trip.endLocation}`
      : trip.startLocation || trip.endLocation || 'Transport';
    items.push({
      name:         `ðŸš› à¶´à·Šâ€à¶»à·€à·à·„à¶± à¶œà·à·ƒà·Šà¶­à·”à·€${vehicleNo ? ` (${vehicleNo})` : ''}`,
      nameSi:       routeLabel,
      qty:           1,
      sellingPrice:  R2(trip.fare),
      yourPrice:     R2(trip.fare),
      lineTotal:     R2(trip.fare),
      uom:          'unit',
    });
  }

  if (R2(trip.meterKmTotal) > 0) {
    const units = R2(trip.meterUnits || 0);
    const price = units > 0 ? R2(trip.meterKmTotal / units) : 0;
    items.push({
      name:         `ðŸ›£ï¸ KM à¶œà·à·ƒà·Šà¶­à·”à·€`,
      nameSi:       `${fmtQ(units)} KM`,
      qty:           units || 1,
      sellingPrice:  price,
      yourPrice:     price,
      lineTotal:     R2(trip.meterKmTotal),
      uom:          'km',
    });
  }

  if (R2(trip.meterHoursTotal) > 0) {
    const hrs   = R2(trip.meterHours || 0);
    const price = hrs > 0 ? R2(trip.meterHoursTotal / hrs) : 0;
    items.push({
      name:         `â±ï¸ à¶´à·à¶º à¶œà·à·ƒà·Šà¶­à·”à·€`,
      nameSi:       `${fmtQ(hrs)} hrs`,
      qty:           hrs || 1,
      sellingPrice:  price,
      yourPrice:     price,
      lineTotal:     R2(trip.meterHoursTotal),
      uom:          'hrs',
    });
  }

  if (R2(trip.meterDaysTotal) > 0) {
    const days  = R2(trip.meterDays || 0);
    const price = days > 0 ? R2(trip.meterDaysTotal / days) : 0;
    items.push({
      name:         `ðŸ“… à¶¯à·’à¶± à¶œà·à·ƒà·Šà¶­à·”à·€`,
      nameSi:       `${fmtQ(days)} days`,
      qty:           days || 1,
      sellingPrice:  price,
      yourPrice:     price,
      lineTotal:     R2(trip.meterDaysTotal),
      uom:          'days',
    });
  }

  if (R2(trip.meterMonthsTotal) > 0) {
    const months = R2(trip.meterMonths || 0);
    const price  = months > 0 ? R2(trip.meterMonthsTotal / months) : 0;
    items.push({
      name:         `ðŸ—“ï¸ à¶¸à·à·ƒ à¶œà·à·ƒà·Šà¶­à·”à·€`,
      nameSi:       `${fmtQ(months)} months`,
      qty:           months || 1,
      sellingPrice:  price,
      yourPrice:     price,
      lineTotal:     R2(trip.meterMonthsTotal),
      uom:          'months',
    });
  }

  (trip.cargoItems || []).forEach((ci, idx) => {
    if (!ci.goodsName && !ci.goodsId) return;
    const gross  = R2(R2(ci.qty) * R2(ci.unitPrice));
    const disc   = R2(gross * R2(ci.discount) / 100);
    const net    = R2(ci.total || (gross - disc));
    const up     = R2(ci.unitPrice || 0);
    const origP  = R2(ci.originalPrice || up);
    items.push({
      name:         `ðŸ“¦ ${ci.goodsName || `Item ${idx + 1}`}`,
      qty:           R2(ci.qty) || 1,
      sellingPrice:  origP > up && up > 0 ? origP : up,
      yourPrice:     up,
      lineTotal:     net,
      uom:          'unit',
      photoURL:      ci.image || '',
      discAmount:    disc,
    });
  });

  if (R2(trip.damageAmount) > 0) {
    items.push({
      name:         `âš ï¸ à·„à·à¶±à·’ à¶…à¶º à¶šà·’à¶»à·“à¶¸${trip.damageDescription ? ` (${trip.damageDescription})` : ''}`,
      qty:           1,
      sellingPrice:  R2(trip.damageAmount),
      yourPrice:     R2(trip.damageAmount),
      lineTotal:     R2(trip.damageAmount),
      uom:          'unit',
    });
  }

  if (items.length === 0) {
    items.push({
      name:         `ðŸš› ${vehicleNo || 'Vehicle Trip'}`,
      qty:           1,
      sellingPrice:  totalBill,
      yourPrice:     totalBill,
      lineTotal:     totalBill,
      uom:          'unit',
    });
  }

  const prevDebt  = R2(trip.customerPreviousBalance || 0);
  const totalDebt = R2(trip.customerTotalDebtAfterTrip || (prevDebt + balanceDue));

  const remarks = [
    vehicleNo ? `Vehicle: ${vehicleNo}` : '',
    trip.startLocation && trip.endLocation ? `Route: ${trip.startLocation} â†’ ${trip.endLocation}` : '',
    trip.description || '',
  ].filter(Boolean).join(' | ');

  const createdAt = trip.tripDate
    ? { toDate: () => new Date(trip.tripDate + 'T00:00:00') }
    : { toDate: () => new Date() };

  return {
    id:          `trip-${tripId}`,
    invoiceNo,
    invoiceCode: invoiceNo,
    customerId:      trip.customerId   || '',
    customerName:    trip.customerName || 'Guest',
    customerPhone:   trip.customerPhone || '',
    customerAddress: trip.customerAddress || '',
    items,
    grossTotal:          totalBill,
    totalDiscount:       0,
    billDiscount:        0,
    billDiscountPercent: 0,
    exchangeAmount:      0,
    returnAmount:        0,
    netAmount:           totalBill,
    payAmount:           paidAmt,
    balance:             paidAmt > totalBill ? R2(paidAmt - totalBill) : 0,
    paymentMethod: balanceDue > 0 && paidAmt === 0 ? 'credit' : payMethod,
    remarks,
    invoiceRemark: remarks,
    previousOutstanding:    prevDebt,
    newOutstanding:         totalDebt,
    customerCurrentBalance: totalDebt,
    createdAt,
    status: balanceDue > 0 ? 'partial' : 'completed',
    _docType:         'vehicle_trip',
    _tripId:          tripId,
    _vehicleNo:       vehicleNo,
    _balanceDue:      balanceDue,
    _totalDebt:       totalDebt,
    _portalKey:       trip.customerPortalKey || '',
  };
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TRANSLATIONS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const T = {
  title: 'à·€à·à·„à¶± à¶†à¶¯à·à¶ºà¶¸à·Š à¶šà·…à¶¸à¶±à·à¶šà¶»à¶«à¶º', vehicles: 'à·€à·à·„à¶±', trips: 'à¶œà¶¸à¶±à·Š', expenses: 'à·€à·’à¶ºà¶¯à¶¸à·Š', reports: 'à·€à·à¶»à·Šà¶­à·',
  addVehicle: 'à·€à·à·„à¶±à¶ºà¶šà·Š à¶‘à¶šà¶­à·” à¶šà¶»à¶±à·Šà¶±', addTrip: 'à¶œà¶¸à¶±à¶šà·Š à¶‘à¶šà¶­à·” à¶šà¶»à¶±à·Šà¶±', vehicleNo: 'à·€à·à·„à¶± à¶…à¶‚à¶šà¶º',
  vehicleType: 'à·€à·à·„à¶± à·€à¶»à·Šà¶œà¶º', driverName: 'à¶»à·’à¶ºà¶¯à·”à¶»à·” à¶±à¶¸', status: 'à¶­à¶­à·Šà¶­à·Šà·€à¶º', active: 'à·ƒà¶šà·Šâ€à¶»à·“à¶º',
  tripDate: 'à¶œà¶¸à¶±à·Š à¶¯à·’à¶±à¶º', customer: 'à¶´à·à¶»à·’à¶·à·à¶œà·’à¶šà¶ºà·', fare: 'à¶´à·Šâ€à¶»à·€à·à·„à¶± à¶œà·à·ƒà·Šà¶­à·”à·€', paidAmount: 'à¶œà·™à·€à¶± à¶½à¶¯ à¶¸à·”à¶¯à¶½',
  balanceDue: 'à¶‰à¶­à·’à¶»à·’ à¶«à¶º', save: 'à·ƒà·”à¶»à¶šà·’à¶±à·Šà¶±', cancel: 'à¶…à·€à¶½à¶‚à¶œà·”', saving: 'à·ƒà·”à¶»à¶šà·’à¶¸à·’à¶±à·Š...',
  noData: 'à¶¯à¶­à·Šà¶­ à¶±à·œà¶¸à·à¶­', amount: 'à¶¸à·”à¶¯à¶½', totalIncome: 'à¶¸à·”à·…à·” à¶†à¶¯à·à¶ºà¶¸', totalExpense: 'à¶¸à·”à·…à·” à·€à·’à¶ºà¶¯à¶¸',
  netProfit: 'à·à·”à¶¯à·Šà¶° à¶½à·à¶·à¶º', allVehicles: 'à·ƒà·’à¶ºà¶½à·”à¶¸ à·€à·à·„à¶±', selectVehicle: 'à·€à·à·„à¶±à¶ºà¶šà·Š à¶­à·à¶»à¶±à·Šà¶±',
  searchCustomer: 'à¶±à¶¸ à·„à· à¶¯à·”à¶»à¶šà¶®à¶±...', selectOption: 'à¶­à·à¶»à¶±à·Šà¶±', totalBill: 'à¶¸à·”à·…à·” à¶¶à·’à¶½à·Šà¶´à¶­',
  route: 'à¶¸à·à¶»à·Šà¶œà¶º', startLocation: 'à¶†à¶»à¶¸à·Šà¶·à¶º', endLocation: 'à¶…à·€à·ƒà·à¶±à¶º', description: 'à·€à·’à·ƒà·Šà¶­à¶»à¶º',
  registered: 'à¶½à·’à¶ºà·à¶´à¶¯à·’à¶‚à¶ à·’', guestCustomer: 'Guest', customerCreditBalance: 'à¶«à¶º à·à·šà·‚à¶º',
  noCredit: 'à¶«à¶º à¶±à·à¶­', hasCredit: 'à¶«à¶º à¶‡à¶­',
  paidExceedsTotal: 'à¶œà·™à·€à¶± à¶½à¶¯ à¶¸à·”à¶¯à¶½ à·€à·à¶©à·’à¶º!', partialPaymentRequiresCustomer: 'à¶«à¶º â†’ customer!',
  requiredVehicleCustomer: 'à·€à·à·„à¶±à¶º à¶­à·à¶»à¶±à·Šà¶±', requiredVehicleNo: 'à·€à·à·„à¶± à¶…à¶‚à¶šà¶º!',
  truck: 'à¶§à·Šâ€à¶»à¶šà·Š', van: 'à·€à·‘à¶±à·Š', lorry: 'à¶½à·œà¶»à·’', pickup: 'à¶´à·’à¶šà¶´à·Š',
  paymentMethod: 'à¶œà·™à·€à·“à¶¸à·Š à¶šà·Šâ€à¶»à¶¸à¶º', createAndSelect: 'à·ƒà·à¶¯à· à¶­à·à¶»à¶±à·Šà¶±',
  meterSection: 'ðŸ“ à¶¸à·“à¶§à¶» / à¶´à·à¶º / à¶¯à·’à¶± / à¶¸à·à·ƒ',
  km: 'KM', hours: 'à¶´à·à¶º', days: 'à¶¯à·’à¶±', months: 'à¶¸à·à·ƒ',
  meterTotal: 'à¶‘à¶šà¶­à·”à·€', received: 'à¶½à·à¶¶à·”à¶«à·”', close: 'à·€à·ƒà¶±à·Šà¶±', print: 'à¶¸à·”à¶¯à·Šâ€à¶»à¶«à¶º',
  creditRequiresCustomer: 'Credit â†’ customer!',
  sendBill: 'ðŸ“¤ à¶ºà·€à¶±à·Šà¶±', sendWhatsApp: 'WhatsApp', sendSMS: 'SMS',
  copyLink: 'ðŸ”— Link', linkCopied: 'âœ… Copied!', noPhoneNumber: 'âš ï¸ Phone à¶±à·à¶­',
  addCustomerTitle: 'âž• à¶±à·€ à¶´à·à¶»à·’à¶·à·à¶œà·’à¶šà¶ºà·', phoneHint: '07X XXXXXXX',
  noResults: 'à·„à¶¸à·” à¶±à·œà·€à·“à¶º', addNew: 'add new',
  viewAccount: 'ðŸ‘¤ à¶œà·’à¶«à·”à¶¸', copyAccountLink: 'ðŸ”— Link', accountLinkCopied: 'âœ… Copied!',
  importFromContacts: 'ðŸ“‡ Contacts', importFromVCF: 'ðŸ“ VCF',
  contactNotSupported: 'HTTPS Chrome', existingCustomerSelected: 'âœ… Found',
  selectContactTitle: 'ðŸ“‡ Contact', noContactsFound: 'Not found',
  totalOutstandingDebt: 'à·ƒà¶¸à·Šà¶´à·–à¶»à·Šà¶« à¶«à¶º à·à·šà·‚à¶º', previousTripDebt: 'à¶´à·™à¶» à¶«à¶º', thisTrip: 'à¶¸à·™à¶¸ à¶œà¶¸à¶±',
  debtSummary: 'à¶«à¶º à·ƒà·à¶»à·à¶‚à·à¶º',
  cargoSection: 'ðŸ“¦ à¶·à·à¶«à·Šà¶© / Cargo', addCargoItem: 'âž• à¶·à·à¶«à·Šà¶©à¶ºà¶šà·Š +',
  goodsName: 'à¶·à·à¶«à·Šà¶©à¶ºà·š à¶±à¶¸', goodsQty: 'à¶´à·Šâ€à¶»à¶¸à·à¶«à¶º', goodsPrice: 'à¶‘à¶šà¶š à¶¸à·’à¶½',
  goodsDiscount: 'à·€à¶§à·Šà¶§à¶¸ %', goodsTotal: 'à¶‘à¶šà¶­à·”à·€', cargoTotal: 'à¶·à·à¶«à·Šà¶© à¶‘à¶šà¶­à·”à·€',
  searchGoods: 'à¶·à·à¶«à·Šà¶© à·ƒà·œà¶ºà¶±à·Šà¶±...', selectGoods: 'à¶·à·à¶«à·Šà¶©à¶º à¶­à·à¶»à¶±à·Šà¶±',
  goodsStock: 'à¶­à·œà¶œà¶º', noGoodsFound: 'à·„à¶¸à·” à¶±à·œà·€à·“à¶º', originalPrice: 'MRP à¶¸à·’à¶½',
  damageCharge: 'âš ï¸ à·„à·à¶±à·’ à¶…à¶º à¶šà·’à¶»à·“à¶¸', damageChargeAmount: 'à·„à·à¶±à·’ à¶¸à·”à¶¯à¶½', damageDescription: 'à·„à·à¶±à·’ à·€à·’à·ƒà·Šà¶­à¶»à¶º',
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// STYLES
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const S = {
  container: { maxWidth: 1400, margin: '0 auto', fontFamily: "'Inter',sans-serif", padding: 20, background: 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)', minHeight: '100vh' },
  header: { background: 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)', padding: 30, borderRadius: 20, marginBottom: 30, color: 'white', textAlign: 'center' },
  tabs: { display: 'flex', gap: 12, background: 'white', borderRadius: 16, padding: 10, marginBottom: 25, overflowX: 'auto' },
  card: { background: 'white', borderRadius: 20, padding: 30, boxShadow: '0 10px 40px rgba(0,0,0,0.1)', marginBottom: 25 },
  input: { width: '100%', padding: '12px 16px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 15, outline: 'none', boxSizing: 'border-box' },
  select: { width: '100%', padding: '12px 16px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 15, outline: 'none', background: 'white', boxSizing: 'border-box', cursor: 'pointer' },
  label: { display: 'block', fontSize: 14, fontWeight: 700, color: '#334155', marginBottom: 8 },
  addBtn: { padding: '12px 24px', background: 'linear-gradient(135deg,#10b981,#059669)', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700 },
  modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 40, zIndex: 2000, overflowY: 'auto' },
  modalContent: { background: 'white', borderRadius: 24, padding: 40, width: '95%', maxWidth: 820, marginBottom: 40 },
  th: { padding: '16px 20px', textAlign: 'left', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontWeight: 700, fontSize: 14 },
  td: { padding: '16px 20px', borderBottom: '1px solid #f1f5f9' },
  saveBtn: { padding: '14px 32px', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 16 },
  cancelBtn: { padding: '14px 32px', background: '#f1f5f9', color: '#64748b', border: '2px solid #e2e8f0', borderRadius: 10, cursor: 'pointer', fontWeight: 700 },
  textarea: { width: '100%', padding: '12px 16px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 15, outline: 'none', boxSizing: 'border-box', minHeight: 80, resize: 'vertical' },
};

const getTab = a => ({ padding: '14px 24px', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 700, background: a ? 'linear-gradient(135deg,#667eea,#764ba2)' : '#f8fafc', color: a ? 'white' : '#64748b', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' });
const getBadge = c => ({ padding: '6px 14px', borderRadius: 50, fontSize: 13, fontWeight: 700, background: `${c}15`, color: c });
const getStatCard = c => ({ background: `linear-gradient(135deg,${c}08,${c}15)`, border: `2px solid ${c}30`, borderRadius: 16, padding: 25, flex: 1, textAlign: 'center', minWidth: 220 });

let injected = false;
const inject = () => {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const el = document.createElement('style');
  el.id = 'vim-s';
  el.innerText = `.vim-btn:hover{filter:brightness(1.1)}.vim-tr:hover td{background:#f8fafc!important}.vim-input:focus{border-color:#667eea!important;box-shadow:0 0 0 3px rgba(102,126,234,0.1)!important}@keyframes slideIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}.slide-in{animation:slideIn .2s ease}@media print{body *{visibility:hidden}#printable-invoice,#printable-invoice *{visibility:visible}#printable-invoice{position:absolute;left:0;top:0;width:100%;padding:20px;background:white}.no-print{display:none!important}}`;
  document.head.appendChild(el);
};

const INIT_V = { vehicleNo: '', vehicleType: 'truck', driverName: '', status: 'active' };
const INIT_T = {
  tripDate: '', vehicleId: '', customerId: '', customerName: '',
  cargoItems: [], fare: '', paidAmount: '',
  startLocation: '', endLocation: '', description: '',
  meterKmStart: '', meterKmEnd: '', meterKmPrice: '',
  meterHours: '', meterHourPrice: '',
  meterDays: '', meterDayPrice: '',
  meterMonths: '', meterMonthPrice: '',
  damageAmount: '', damageDescription: '',
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CONTACT PICKER MODAL
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const ContactPickerModal = React.memo(({ contacts, onSelect, onClose }) => {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search.trim()) return contacts;
    const s = search.toLowerCase();
    return contacts.filter(c => (c.name || '').toLowerCase().includes(s) || (c.phone || '').includes(s));
  }, [contacts, search]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5000, padding: 20 }}>
      <div style={{ background: 'white', borderRadius: 20, padding: 24, width: '100%', maxWidth: 420, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>ðŸ“‡</h3>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: '#f1f5f9', cursor: 'pointer', fontSize: 16 }}>âœ•</button>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ðŸ”" style={{ ...S.input, marginBottom: 12 }} />
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0
            ? <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>â€”</div>
            : filtered.map((c, i) => (
              <div key={i} onClick={() => onSelect(c)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f0f9ff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}>
                {c.photoDataUrl
                  ? <img src={c.photoDataUrl} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid #3b82f6', flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; }} />
                  : <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 18, flexShrink: 0 }}>{(c.name || '?')[0]?.toUpperCase()}</div>
                }
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                  {c.phone && <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>ðŸ“± {displayPhone(c.phone)}</div>}
                </div>
                <span style={{ color: '#3b82f6' }}>âžœ</span>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CUSTOMER PICKER
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const CustomerPicker = React.memo(({ customers, customerId, customerName, onChange, onCreateNew }) => {
  const [show, setShow] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPhoto, setNewPhoto] = useState('');
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [vcfContacts, setVcfContacts] = useState(null);
  const ref = useRef(null);
  const vcfRef = useRef(null);
  const supN = useMemo(() => hasNativeContactPicker(), []);

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setShow(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const sel = customers.find(c => c.id === customerId);

  const filtered = useMemo(() => {
    const s = (customerName || '').toLowerCase().trim();
    if (!s) return customers.slice(0, 10);
    const isP = /^[\d\+\s\-]{3,}$/.test(s.replace(/\s/g, ''));
    return customers.filter(c => {
      if ((c.name || '').toLowerCase().includes(s)) return true;
      if (isP) return phoneMatch(c.phone || '', s);
      return (c.phone || '').includes(s);
    }).slice(0, 20);
  }, [customers, customerName]);

  const noR = customerName?.trim().length >= 2 && filtered.length === 0 && !customerId;

  const applyC = useCallback((n, p, ph) => {
    const np = normalizePhone(p);
    const ex = customers.find(c => (np && normalizePhone(c.phone) === np) || (n.trim() && norm(c.name) === norm(n)));
    if (ex) { onChange(ex.id, ex.name); setShow(false); setShowCreate(false); setVcfContacts(null); alert(T.existingCustomerSelected); return; }
    setNewName(n); setNewPhone(np); setNewPhoto(ph); onChange('', n); setShow(false); setVcfContacts(null); setShowCreate(true);
  }, [customers, onChange]);

  const handleN = async () => {
    setImporting(true);
    try {
      const props = ['name', 'tel'];
      try { props.push('icon'); } catch {}
      const cs = await navigator.contacts.select(props, { multiple: false });
      if (!cs || !cs.length) return;
      const c = cs[0];
      const n = Array.isArray(c.name) ? (c.name[0] || '') : (c.name || '');
      const p = Array.isArray(c.tel) ? (c.tel[0] || '') : (c.tel || '');
      let ph = '';
      const ic = Array.isArray(c.icon) ? c.icon[0] : c.icon;
      if (ic instanceof Blob) { try { ph = await blobToDataURL(ic); } catch {} }
      else if (typeof ic === 'string' && ic.length > 10) ph = ic;
      applyC(n, p, ph);
    } catch (err) { if (err?.name !== 'AbortError') alert(T.contactNotSupported); }
    finally { setImporting(false); }
  };

  const handleV = async e => {
    const f = e.target.files?.[0]; if (!f) return;
    setImporting(true);
    try {
      const cs = await readVCFFile(f);
      if (!cs.length) { alert(T.noContactsFound); return; }
      if (cs.length === 1) applyC(cs[0].name, cs[0].phone, cs[0].photoDataUrl);
      else setVcfContacts(cs);
    } catch { alert('VCF error'); }
    finally { setImporting(false); e.target.value = ''; }
  };

  const doCreate = async () => {
    const n = (newName || customerName || '').trim();
    if (!n) return;
    setCreating(true);
    try {
      await onCreateNew({ name: n, phone: normalizePhone(newPhone), profilePicture: newPhoto, portalAccessKey: makePortalKey(n) });
      setNewName(''); setNewPhone(''); setNewPhoto(''); setShowCreate(false); setShow(false);
    } catch (e) { alert(e.message); }
    finally { setCreating(false); }
  };

  if (sel) {
    const pic = getCustomerPicture(sel), bal = getCustomerBalance(sel), ph = normalizePhone(sel.phone);
    return (
      <div style={{ marginBottom: 16 }}>
        <label style={S.label}>ðŸ‘¤ {T.customer}</label>
        <div style={{ padding: 16, borderRadius: 16, border: '2px solid #10b981', background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            {pic ? <img src={pic} alt="" style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', border: '3px solid #10b981' }} onError={e => { e.currentTarget.style.display = 'none'; }} />
              : <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'linear-gradient(135deg,#10b981,#059669)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 22 }}>{(sel.name || '?')[0]?.toUpperCase()}</div>}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#065f46' }}>ðŸ‘¤ {sel.name}</div>
              {ph && <div style={{ fontSize: 13, color: '#047857', marginTop: 3 }}>ðŸ“± {displayPhone(ph)}</div>}
              <span style={{ display: 'inline-block', marginTop: 4, fontSize: 11, fontWeight: 700, color: '#166534', background: '#dcfce7', border: '1px solid #86efac', padding: '3px 8px', borderRadius: 999 }}>âœ… {T.registered}</span>
              <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 12, background: bal > 0 ? '#fef2f2' : '#ecfdf5', border: `1.5px solid ${bal > 0 ? '#fecaca' : '#86efac'}` }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: bal > 0 ? '#991b1b' : '#166534' }}>ðŸ’³ {T.customerCreditBalance}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: bal > 0 ? '#dc2626' : '#16a34a' }}>{formatCurrency(bal)}</div>
              </div>
            </div>
            <button type="button" onClick={() => onChange('', '')} style={{ padding: '8px 14px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>âœ•</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: 'relative', marginBottom: 16 }}>
      <label style={S.label}>ðŸ‘¤ {T.customer}</label>
      {vcfContacts && <ContactPickerModal contacts={vcfContacts} onSelect={c => applyC(c.name, c.phone, c.photoDataUrl)} onClose={() => setVcfContacts(null)} />}
      <input type="file" ref={vcfRef} accept=".vcf,.vcard" style={{ display: 'none' }} onChange={handleV} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <input className="vim-input" style={{ ...S.input, borderColor: customerName ? '#3b82f6' : '#e2e8f0' }}
            placeholder={T.searchCustomer} value={customerName}
            onChange={e => { onChange('', e.target.value); setShow(true); }}
            onFocus={() => setShow(true)}
          />
          {customerName && (
            <button type="button" onClick={() => { onChange('', ''); setShow(false); setShowCreate(false); }}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 24, height: 24, borderRadius: '50%', border: 'none', background: '#f1f5f9', cursor: 'pointer' }}>âœ•</button>
          )}
        </div>
        {supN && (
          <button type="button" onClick={handleN} disabled={importing}
            style={{ padding: '10px 14px', background: importing ? '#cbd5e1' : 'linear-gradient(135deg,#6d28d9,#7c3aed)', color: 'white', border: 'none', borderRadius: 10, cursor: importing ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>
            {importing ? 'â³' : 'ðŸ“‡'} {T.importFromContacts}
          </button>
        )}
        <button type="button" onClick={() => vcfRef.current?.click()} disabled={importing}
          style={{ padding: '10px 14px', background: importing ? '#cbd5e1' : '#ede9fe', color: importing ? '#64748b' : '#6d28d9', border: '1px solid #ddd6fe', borderRadius: 10, cursor: importing ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>
          {importing ? 'â³' : 'ðŸ“'} {T.importFromVCF}
        </button>
      </div>

      {show && customerName && filtered.length > 0 && !customerId && (
        <div className="slide-in" style={{ position: 'absolute', background: 'white', width: '100%', zIndex: 100, border: '2px solid #3b82f6', borderRadius: 10, maxHeight: 260, overflowY: 'auto', marginTop: 8, boxShadow: '0 10px 30px rgba(0,0,0,0.15)' }}>
          {filtered.map(c => {
            const b = getCustomerBalance(c), ph2 = normalizePhone(c.phone), pic2 = getCustomerPicture(c);
            return (
              <div key={c.id} onClick={() => { onChange(c.id, c.name); setShow(false); }}
                style={{ padding: 12, cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>
                {pic2 ? <img src={pic2} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid #667eea', flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; }} />
                  : <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#667eea', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>{(c.name || '?')[0]}</div>}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{c.name}</div>
                  {ph2 && <div style={{ fontSize: 11, color: '#64748b' }}>ðŸ“± {displayPhone(ph2)}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: b > 0 ? '#dc2626' : '#16a34a', fontWeight: 800 }}>{b > 0 ? T.hasCredit : T.noCredit}</div>
                  <div style={{ fontSize: 12, color: b > 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>{formatCurrency(b)}</div>
                </div>
              </div>
            );
          })}
          <div onClick={() => { setNewName(customerName); setShowCreate(true); setShow(false); }}
            style={{ padding: 12, cursor: 'pointer', background: '#eff6ff', color: '#2563eb', fontWeight: 700 }}>
            âž• "{customerName}" {T.addNew}
          </div>
        </div>
      )}

      {noR && !showCreate && (
        <div style={{ marginTop: 10 }}>
          <button type="button" onClick={() => { setNewName(customerName); setShowCreate(true); }}
            style={{ width: '100%', padding: 12, borderRadius: 10, border: '2px dashed #93c5fd', background: '#eff6ff', color: '#2563eb', fontWeight: 700, cursor: 'pointer' }}>
            âž• "{customerName}" {T.addNew}
          </button>
        </div>
      )}

      {showCreate && (
        <div className="slide-in" style={{ marginTop: 12, padding: 16, borderRadius: 14, background: '#eff6ff', border: '2px solid #bfdbfe' }}>
          <div style={{ fontSize: 15, color: '#1e40af', fontWeight: 800, marginBottom: 12 }}>{T.addCustomerTitle}</div>
          {newPhoto && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <div style={{ position: 'relative' }}>
                <img src={newPhoto} alt="" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '3px solid #3b82f6' }} onError={e => { e.target.style.display = 'none'; }} />
                <button type="button" onClick={() => setNewPhoto('')} style={{ position: 'absolute', top: -4, right: -4, width: 22, height: 22, borderRadius: '50%', border: 'none', background: '#dc2626', color: 'white', cursor: 'pointer', fontSize: 11 }}>âœ•</button>
              </div>
            </div>
          )}
          <input className="vim-input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Customer name" style={{ ...S.input, marginBottom: 10, fontWeight: 700 }} />
          <input className="vim-input" type="tel" inputMode="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder={T.phoneHint} style={{ ...S.input, marginBottom: 8 }} />
          {newPhone && (
            <div style={{ fontSize: 12, color: '#2563eb', fontWeight: 600, marginBottom: 12 }}>
              ðŸ“± {displayPhone(newPhone)}
              {normalizePhone(newPhone).length >= 10 && <span style={{ marginLeft: 8, background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>âœ…</span>}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {supN && <button type="button" onClick={handleN} disabled={importing} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #c4b5fd', background: '#ede9fe', color: '#6d28d9', cursor: 'pointer', fontWeight: 700 }}>{importing ? 'â³' : 'ðŸ“‡'}</button>}
            <button type="button" onClick={() => vcfRef.current?.click()} disabled={importing} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #c4b5fd', background: '#ede9fe', color: '#6d28d9', cursor: 'pointer', fontWeight: 700 }}>{importing ? 'â³' : 'ðŸ“'}</button>
            <button type="button" onClick={() => { setShowCreate(false); setNewName(''); setNewPhone(''); setNewPhoto(''); }} style={{ flex: 1, padding: 12, borderRadius: 10, border: '2px solid #cbd5e1', background: 'white', color: '#64748b', cursor: 'pointer', fontWeight: 700 }}>{T.cancel}</button>
            <button type="button" onClick={doCreate} disabled={creating || !newName.trim()} style={{ flex: 2, padding: 12, borderRadius: 10, border: 'none', background: creating ? '#cbd5e1' : '#2563eb', color: 'white', cursor: creating ? 'not-allowed' : 'pointer', fontWeight: 700 }}>{creating ? 'â³...' : T.createAndSelect}</button>
          </div>
        </div>
      )}
    </div>
  );
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CARGO ITEM ROW
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const CargoItemRow = React.memo(({ item, index, goodsList, onUpdate, onSelectGoods, onRemove }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(item.goodsName || '');
  const ref = useRef(null);

  useEffect(() => { setSearch(item.goodsName || ''); }, [item.goodsName]);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filteredGoods = useMemo(() => {
    const s = (search || '').toLowerCase().trim();
    if (!s) return goodsList.slice(0, 20);
    return goodsList.filter(g => {
      const txt = [g.name, g.goodsName, g.itemName, g.itemCode, g.barcode].filter(Boolean).join(' ').toLowerCase();
      return txt.includes(s);
    }).slice(0, 30);
  }, [goodsList, search]);

  const gross = R2(R2(item.qty) * R2(item.unitPrice));
  const discAmt = R2(gross * R2(item.discount) / 100);
  const net = R2(gross - discAmt);
  const origP = R2(item.originalPrice || 0);
  const unitP = R2(item.unitPrice || 0);
  const hasOrigDisc = origP > unitP && unitP > 0;

  return (
    <div style={{ background: 'white', borderRadius: 14, padding: 12, marginBottom: 12, border: item.goodsId ? '2px solid #c4b5fd' : '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ width: 56, height: 56, borderRadius: 10, overflow: 'hidden', border: item.goodsId ? '2px solid #8b5cf6' : '2px dashed #cbd5e1', background: '#faf5ff', flexShrink: 0 }}>
          <img src={item.image || GOODS_PH} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.src = GOODS_PH; }} />
        </div>
        <div ref={ref} style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <input value={search}
            onChange={e => { setSearch(e.target.value); onUpdate(index, 'goodsName', e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={T.searchGoods}
            style={{ width: '100%', padding: '10px 12px', border: item.goodsId ? '2px solid #8b5cf6' : '2px solid #e2e8f0', borderRadius: 10, fontSize: 14, fontWeight: 700, outline: 'none', boxSizing: 'border-box', background: item.goodsId ? '#faf5ff' : 'white' }}
          />
          {open && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'white', border: '2px solid #8b5cf6', borderRadius: 12, maxHeight: 280, overflowY: 'auto', zIndex: 200, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
              {filteredGoods.length === 0
                ? <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>ðŸ” {T.noGoodsFound}</div>
                : filteredGoods.map(g => {
                  const sp = getGoodsSellPrice(g), op = getGoodsOrigPrice(g), hd = op > sp && sp > 0;
                  return (
                    <div key={g.id} onClick={() => { onSelectGoods(index, g); setSearch(getGoodsName(g)); setOpen(false); }}
                      style={{ padding: '10px 12px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center', minHeight: 56 }}>
                      <img src={getGoodsImage(g)} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', border: '1.5px solid #ddd6fe', flexShrink: 0 }} onError={e => { e.currentTarget.src = GOODS_PH; }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getGoodsName(g)}</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          {hd && <span style={{ textDecoration: 'line-through', color: '#94a3b8', fontSize: 11 }}>Rs.{fmtQ(op)}</span>}
                          <span style={{ fontWeight: 800, color: '#16a34a', fontSize: 13 }}>Rs.{fmtQ(sp)}</span>
                          {hd && <span style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', background: '#fef2f2', padding: '1px 5px', borderRadius: 4 }}>âˆ’{fmtQ(R2(((op - sp) / op) * 100))}%</span>}
                          <span style={{ fontSize: 11, color: getInventoryItemStock(g) > 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>ðŸ“¦ {fmtQ(getInventoryItemStock(g))}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              }
            </div>
          )}
        </div>
        <button type="button" onClick={() => onRemove(index)} style={{ width: 36, height: 36, borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', cursor: 'pointer', fontWeight: 900, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 10 }}>âœ•</button>
      </div>

      {item.goodsId && hasOrigDisc && (
        <div style={{ marginBottom: 10, padding: '6px 10px', background: '#fffbeb', borderRadius: 8, border: '1px solid #fcd34d', fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: '#92400e', fontWeight: 700 }}>{T.originalPrice}:</span>
          <span style={{ textDecoration: 'line-through', color: '#94a3b8' }}>Rs.{fmtQ(origP)}</span>
          <span style={{ color: '#dc2626', fontWeight: 700 }}>âˆ’{fmtQ(R2(((origP - unitP) / origP) * 100))}%</span>
          <span style={{ color: '#16a34a', fontWeight: 700 }}>â†’ Rs.{fmtQ(unitP)}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9', display: 'block', marginBottom: 4 }}>ðŸ“¦ {T.goodsQty}</label>
          <input type="number" inputMode="decimal" value={item.qty} onChange={e => onUpdate(index, 'qty', e.target.value)} placeholder="0" min="0" step="0.01" style={{ width: '100%', padding: '12px 10px', border: '2px solid #ddd6fe', borderRadius: 10, fontSize: 18, fontWeight: 800, textAlign: 'center', outline: 'none', boxSizing: 'border-box', color: '#6d28d9', background: '#faf5ff' }} />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9', display: 'block', marginBottom: 4 }}>ðŸ’° {T.goodsPrice}</label>
          <input type="number" inputMode="decimal" value={item.unitPrice} onChange={e => onUpdate(index, 'unitPrice', e.target.value)} placeholder="0.00" min="0" step="0.01" style={{ width: '100%', padding: '12px 10px', border: '2px solid #ddd6fe', borderRadius: 10, fontSize: 18, fontWeight: 800, textAlign: 'right', outline: 'none', boxSizing: 'border-box', color: '#059669' }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 8 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', display: 'block', marginBottom: 4 }}>ðŸ·ï¸ {T.goodsDiscount}</label>
          <input type="number" inputMode="decimal" value={item.discount} onChange={e => onUpdate(index, 'discount', e.target.value)} placeholder="0" min="0" max="100" step="0.5" style={{ width: '100%', padding: '12px 10px', border: '2px solid #fecaca', borderRadius: 10, fontSize: 16, fontWeight: 800, textAlign: 'center', outline: 'none', boxSizing: 'border-box', color: '#dc2626', background: '#fef2f2' }} />
        </div>
        <div style={{ background: net > 0 ? 'linear-gradient(135deg,#f0fdf4,#dcfce7)' : '#f8fafc', borderRadius: 12, padding: '10px 12px', border: net > 0 ? '2px solid #86efac' : '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ fontSize: 10, color: net > 0 ? '#047857' : '#94a3b8', fontWeight: 700, marginBottom: 2 }}>{T.goodsTotal}</div>
          {discAmt > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
              <span style={{ fontSize: 11, color: '#94a3b8', textDecoration: 'line-through' }}>Rs.{fmtQ(gross)}</span>
              <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 700 }}>âˆ’Rs.{fmtQ(discAmt)}</span>
            </div>
          )}
          <div style={{ fontSize: 22, fontWeight: 900, color: net > 0 ? '#047857' : '#94a3b8' }}>{formatCurrency(net)}</div>
        </div>
      </div>
    </div>
  );
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CARGO SECTION
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const CargoSection = React.memo(({ cargoItems, goodsList, onChange }) => {
  const addItem = () => onChange([...cargoItems, { goodsId: '', goodsName: '', image: '', qty: '', unitPrice: '', originalPrice: 0, discount: '0', total: 0 }]);

  const updateItem = (idx, key, value) => {
    onChange(cargoItems.map((item, i) => {
      if (i !== idx) return item;
      const ni = { ...item, [key]: value };
      const gross = R2(R2(ni.qty) * R2(ni.unitPrice));
      ni.total = R2(gross - R2(gross * R2(ni.discount) / 100));
      return ni;
    }));
  };

  const selectGoods = (idx, goods) => {
    const origPrice = getGoodsOrigPrice(goods);
    const yourPrice = getGoodsSellPrice(goods);
    onChange(cargoItems.map((item, i) => {
      if (i !== idx) return item;
      const ni = { ...item, goodsId: goods.id, goodsName: getGoodsName(goods), image: getGoodsImage(goods), unitPrice: item.unitPrice || String(yourPrice), originalPrice: origPrice };
      const gross = R2(R2(ni.qty) * R2(ni.unitPrice));
      ni.total = R2(gross - R2(gross * R2(ni.discount) / 100));
      return ni;
    }));
  };

  const removeItem = idx => onChange(cargoItems.filter((_, i) => i !== idx));
  const total = cargoItems.reduce((s, i) => s + R2(i.total), 0);

  return (
    <div style={{ border: '3px solid #8b5cf6', borderRadius: 16, padding: 20, background: 'linear-gradient(135deg,#faf5ff,#ede9fe)', marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <label style={{ ...S.label, color: '#6d28d9', fontSize: 16, marginBottom: 0 }}>{T.cargoSection}</label>
        {total > 0 && <span style={{ padding: '6px 14px', background: '#6d28d9', color: 'white', borderRadius: 999, fontSize: 13, fontWeight: 800 }}>{formatCurrency(total)}</span>}
      </div>
      {cargoItems.map((item, i) => (<CargoItemRow key={i} item={item} index={i} goodsList={goodsList} onUpdate={updateItem} onSelectGoods={selectGoods} onRemove={removeItem} />))}
      <button type="button" onClick={addItem} style={{ width: '100%', padding: 12, borderRadius: 10, border: '2px dashed #8b5cf6', background: 'white', color: '#6d28d9', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>{T.addCargoItem}</button>
      {total > 0 && (
        <div style={{ marginTop: 12, padding: 14, background: '#6d28d9', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white' }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>ðŸ“¦ {T.cargoTotal} ({cargoItems.length})</span>
          <span style={{ fontWeight: 900, fontSize: 22 }}>{formatCurrency(total)}</span>
        </div>
      )}
    </div>
  );
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// METER SECTION
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const MeterSection = React.memo(({ form, onChange }) => {
  const kmUnits = Math.max(0, R2(R2(form.meterKmEnd) - R2(form.meterKmStart)));
  const kmTotal = R2(kmUnits * R2(form.meterKmPrice));
  const hoursTotal = R2(R2(form.meterHours) * R2(form.meterHourPrice));
  const daysTotal = R2(R2(form.meterDays) * R2(form.meterDayPrice));
  const monthsTotal = R2(R2(form.meterMonths) * R2(form.meterMonthPrice));
  const grandTotal = R2(kmTotal + hoursTotal + daysTotal + monthsTotal);

  const inp = (key, val, ph, step = '0.01') => (
    <input className="vim-input" type="number" value={val} onChange={e => onChange(key, e.target.value)} placeholder={ph} min="0" step={step} style={{ ...S.input, fontSize: 16, fontWeight: 700, textAlign: 'center', borderColor: '#38bdf8' }} />
  );
  const boxStyle = (color, has) => ({ border: `2px solid ${has ? color : '#e2e8f0'}`, borderRadius: 14, padding: 16, background: has ? `${color}08` : 'white', marginBottom: 12 });
  const totalBox = (label, value, color) => value > 0 && (
    <div style={{ padding: 10, borderRadius: 10, background: `${color}12`, border: `1px solid ${color}30`, textAlign: 'center', marginTop: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900, color, marginTop: 2 }}>{formatCurrency(value)}</div>
    </div>
  );

  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ ...S.label, color: '#0369a1', fontSize: 16, marginBottom: 14 }}>ðŸ“ {T.meterSection}</label>
      <div style={boxStyle('#0ea5e9', kmTotal > 0)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><span style={{ fontSize: 24 }}>ðŸ›£ï¸</span><span style={{ fontWeight: 800, fontSize: 15, color: '#0369a1' }}>{T.km}</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div><label style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', display: 'block', marginBottom: 4 }}>ðŸ“ à¶†à¶»à¶¸à·Šà¶·</label>{inp('meterKmStart', form.meterKmStart, '0', '0.1')}</div>
          <div><label style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', display: 'block', marginBottom: 4 }}>ðŸ à¶…à·€à·ƒà·à¶±</label>{inp('meterKmEnd', form.meterKmEnd, '0', '0.1')}</div>
          <div><label style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', display: 'block', marginBottom: 4 }}>ðŸ’° KM à¶¸à·’à¶½</label>{inp('meterKmPrice', form.meterKmPrice, '0.00')}</div>
        </div>
        {kmUnits > 0 && <div style={{ marginTop: 8, fontSize: 12, color: '#0369a1', fontWeight: 700 }}>ðŸ“ {fmtQ(kmUnits)} KM Ã— {formatCurrency(form.meterKmPrice)}</div>}
        {totalBox('KM à¶‘à¶šà¶­à·”à·€', kmTotal, '#0369a1')}
      </div>
      <div style={boxStyle('#7c3aed', hoursTotal > 0)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><span style={{ fontSize: 24 }}>â±ï¸</span><span style={{ fontWeight: 800, fontSize: 15, color: '#7c3aed' }}>{T.hours}</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', display: 'block', marginBottom: 4 }}>â±ï¸ à¶´à·à¶º à¶œà¶«à¶±</label>{inp('meterHours', form.meterHours, '0', '0.5')}</div>
          <div><label style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', display: 'block', marginBottom: 4 }}>ðŸ’° à¶´à·à¶ºà¶šà¶§ à¶¸à·’à¶½</label>{inp('meterHourPrice', form.meterHourPrice, '0.00')}</div>
        </div>
        {totalBox('à¶´à·à¶º à¶‘à¶šà¶­à·”à·€', hoursTotal, '#7c3aed')}
      </div>
      <div style={boxStyle('#d97706', daysTotal > 0)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><span style={{ fontSize: 24 }}>ðŸ“…</span><span style={{ fontWeight: 800, fontSize: 15, color: '#d97706' }}>{T.days}</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={{ fontSize: 11, fontWeight: 700, color: '#d97706', display: 'block', marginBottom: 4 }}>ðŸ“… à¶¯à·’à¶± à¶œà¶«à¶±</label>{inp('meterDays', form.meterDays, '0', '1')}</div>
          <div><label style={{ fontSize: 11, fontWeight: 700, color: '#d97706', display: 'block', marginBottom: 4 }}>ðŸ’° à¶¯à·’à¶±à¶šà¶§ à¶¸à·’à¶½</label>{inp('meterDayPrice', form.meterDayPrice, '0.00')}</div>
        </div>
        {totalBox('à¶¯à·’à¶± à¶‘à¶šà¶­à·”à·€', daysTotal, '#d97706')}
      </div>
      <div style={boxStyle('#059669', monthsTotal > 0)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><span style={{ fontSize: 24 }}>ðŸ—“ï¸</span><span style={{ fontWeight: 800, fontSize: 15, color: '#059669' }}>{T.months}</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={{ fontSize: 11, fontWeight: 700, color: '#059669', display: 'block', marginBottom: 4 }}>ðŸ—“ï¸ à¶¸à·à·ƒ à¶œà¶«à¶±</label>{inp('meterMonths', form.meterMonths, '0', '1')}</div>
          <div><label style={{ fontSize: 11, fontWeight: 700, color: '#059669', display: 'block', marginBottom: 4 }}>ðŸ’° à¶¸à·à·ƒà¶ºà¶šà¶§ à¶¸à·’à¶½</label>{inp('meterMonthPrice', form.meterMonthPrice, '0.00')}</div>
        </div>
        {totalBox('à¶¸à·à·ƒ à¶‘à¶šà¶­à·”à·€', monthsTotal, '#059669')}
      </div>
      {grandTotal > 0 && (
        <div style={{ padding: 16, borderRadius: 14, background: 'linear-gradient(135deg,#dcfce7,#f0fdf4)', border: '2px solid #86efac', textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#047857' }}>ðŸ“ à¶¸à·“à¶§à¶» / à¶´à·à¶º / à¶¯à·’à¶± / à¶¸à·à·ƒ à¶‘à¶šà¶­à·”à·€</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#047857', marginTop: 4 }}>{formatCurrency(grandTotal)}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
            {kmTotal > 0 && <span>ðŸ›£ï¸ {formatCurrency(kmTotal)}</span>}
            {hoursTotal > 0 && <span>â±ï¸ {formatCurrency(hoursTotal)}</span>}
            {daysTotal > 0 && <span>ðŸ“… {formatCurrency(daysTotal)}</span>}
            {monthsTotal > 0 && <span>ðŸ—“ï¸ {formatCurrency(monthsTotal)}</span>}
          </div>
        </div>
      )}
    </div>
  );
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// BANK SELECTOR
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const BankSelector = React.memo(({ bankAccounts, paymentMethod, setPaymentMethod, bankAccountId, setBankAccountId }) => (
  <div style={{ marginTop: 20, padding: 20, background: '#f0fdf4', borderRadius: 14, border: '2px solid #86efac' }}>
    <label style={{ ...S.label, color: '#16a34a', fontSize: 15, marginBottom: 12 }}>ðŸ’³ {T.paymentMethod}</label>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
      {[{ v: 'cash', i: 'ðŸ’µ', l: 'Cash' }, { v: 'bank', i: 'ðŸ¦', l: 'Bank' }, { v: 'card', i: 'ðŸ’³', l: 'Card' }, { v: 'credit', i: 'ðŸ“', l: 'Credit' }].map(m => (
        <button key={m.v} type="button"
          onClick={() => { setPaymentMethod(m.v); if (m.v !== 'bank') setBankAccountId(''); else if (bankAccounts.length > 0) setBankAccountId(bankAccounts[0].id); }}
          style={{ padding: '10px 6px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: paymentMethod === m.v ? '2px solid #16a34a' : '2px solid #e2e8f0', background: paymentMethod === m.v ? '#dcfce7' : 'white', color: paymentMethod === m.v ? '#16a34a' : '#64748b', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <span style={{ fontSize: 18 }}>{m.i}</span><span>{m.l}</span>
        </button>
      ))}
    </div>
    {paymentMethod === 'bank' && bankAccounts.length > 0 && (
      <select className="vim-input" style={{ ...S.select, border: bankAccountId ? '2px solid #16a34a' : '2px solid #fca5a5' }} value={bankAccountId} onChange={e => setBankAccountId(e.target.value)}>
        <option value="">-- à¶¶à·à¶‚à¶šà·”à·€ --</option>
        {bankAccounts.map(a => <option key={a.id} value={a.id}>ðŸ¦ {a.bankName} | {a.accountName}</option>)}
      </select>
    )}
  </div>
));

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   MAIN COMPONENT
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export default function VehicleIncomeManager() {
  const { user } = useUserAuth();
  useEffect(() => { inject(); }, []);

  const [activeTab, setActiveTab] = useState('trips');
  const [vehicles, setVehicles] = useState([]);
  const [trips, setTrips] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [goodsList, setGoodsList] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [showModal, setShowModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reportVehicleId, setReportVehicleId] = useState('all');
  const [printingTrip, setPrintingTrip] = useState(null);
  const [vForm, setVForm] = useState({ ...INIT_V });
  const [tForm, setTForm] = useState({ ...INIT_T, tripDate: todayStr() });
  const [tripPM, setTripPM] = useState('cash');
  const [tripBank, setTripBank] = useState('');
  const [vehicleExpenses, setVehicleExpenses] = useState([]);
  const [businessSettings, setBusinessSettings] = useState(null);
  const [outputInvoice, setOutputInvoice] = useState(null);

  const basePath = useMemo(() => user ? `users/${user.uid}` : null, [user]);

  const openOutputManager = useCallback((trip) => {
    const inv = buildTripInvoice(trip, vehicles);
    if (inv) setOutputInvoice(inv);
  }, [vehicles]);

  // â”€â”€ Data listeners â”€â”€
  useEffect(() => {
    if (!basePath || !user?.uid) return;
    const subs = [];
    const m = s => s.docs.map(d => ({ id: d.id, ...d.data() }));

    subs.push(onSnapshot(collection(db, `${basePath}/vehicles`), s => setVehicles(m(s)), () => {}));

    try {
      subs.push(onSnapshot(
        query(collection(db, `${basePath}/vehicleTrips`), orderBy('timestamp', 'desc')),
        s => setTrips(m(s)),
        () => {
          subs.push(onSnapshot(collection(db, `${basePath}/vehicleTrips`), s => {
            const d = m(s);
            d.sort((a, b) => toMs(b.timestamp) - toMs(a.timestamp));
            setTrips(d);
          }));
        }
      ));
    } catch {
      subs.push(onSnapshot(collection(db, `${basePath}/vehicleTrips`), s => {
        const d = m(s);
        d.sort((a, b) => toMs(b.timestamp) - toMs(a.timestamp));
        setTrips(d);
      }));
    }

    subs.push(onSnapshot(collection(db, `${basePath}/vehicleExpenses`), s => {
      const d = m(s);
      d.sort((a, b) => toMs(b.timestamp || b.createdAt) - toMs(a.timestamp || a.createdAt));
      setVehicleExpenses(d);
    }, () => {}));

    subs.push(onSnapshot(query(collection(db, 'customers'), where('uid', '==', user.uid)), s => setCustomers(m(s)), () => {}));
    subs.push(onSnapshot(query(collection(db, 'items'), where('uid', '==', user.uid)), s => setGoodsList(m(s)), () => {}));
    subs.push(onSnapshot(collection(db, `${basePath}/bankAccounts`), s => setBankAccounts(m(s).filter(a => a.isActive !== false)), () => {}));
    subs.push(onSnapshot(query(collection(db, 'invoice_settings'), where('uid', '==', user.uid)), s => { if (!s.empty) setBusinessSettings(s.docs[0].data()); }, () => {}));

    return () => subs.forEach(f => typeof f === 'function' && f());
  }, [basePath, user?.uid]);

  // â”€â”€ Create customer â”€â”€
  const handleCreateCustomer = useCallback(async d => {
    if (!user) return;
    const name = (d.name || '').trim();
    const phone = normalizePhone(d.phone || '');
    const portalAccessKey = d.portalAccessKey || makePortalKey(name);
    const payload = {
      uid: user.uid,
      name,
      phone,
      portalAccessKey,
      currentBalance: 0,
      profilePicture: d.profilePicture || '',
      photoURL: d.profilePicture || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const r = await addDoc(collection(db, 'customers'), payload);
    setTForm(p => ({ ...p, customerId: r.id, customerName: name }));
  }, [user]);

  // â”€â”€ Calculated values â”€â”€
  const cargoTotal = useMemo(() => tForm.cargoItems.reduce((s, i) => s + R2(i.total), 0), [tForm.cargoItems]);

  const meterCalc = useMemo(() => {
    const kmUnits    = Math.max(0, R2(R2(tForm.meterKmEnd) - R2(tForm.meterKmStart)));
    const kmTotal    = R2(kmUnits * R2(tForm.meterKmPrice));
    const hoursTotal = R2(R2(tForm.meterHours) * R2(tForm.meterHourPrice));
    const daysTotal  = R2(R2(tForm.meterDays) * R2(tForm.meterDayPrice));
    const monthsTotal = R2(R2(tForm.meterMonths) * R2(tForm.meterMonthPrice));
    return { kmUnits, kmTotal, hoursTotal, daysTotal, monthsTotal, total: R2(kmTotal + hoursTotal + daysTotal + monthsTotal) };
  }, [tForm.meterKmStart, tForm.meterKmEnd, tForm.meterKmPrice, tForm.meterHours, tForm.meterHourPrice, tForm.meterDays, tForm.meterDayPrice, tForm.meterMonths, tForm.meterMonthPrice]);

  const meterTotal   = meterCalc.total;
  const damageAmount = R2(tForm.damageAmount);
  const tripTotal    = R2(R2(tForm.fare) + cargoTotal + meterTotal + damageAmount);
  const paidVal      = Math.max(0, R2(tForm.paidAmount));
  const balanceDue   = Math.max(0, R2(tripTotal - paidVal));
  const selCus       = customers.find(c => c.id === tForm.customerId);
  const existDebt    = getCustomerBalance(selCus);
  const totalDebtAfterTrip = R2(existDebt + balanceDue);

  // â”€â”€ Save Trip â”€â”€
  const handleSaveTrip = async () => {
    if (!tForm.vehicleId) return alert(T.requiredVehicleCustomer);
    if (tripPM === 'credit' && !tForm.customerId) return alert(T.creditRequiresCustomer);
    if (paidVal > tripTotal) return alert(T.paidExceedsTotal);
    if (balanceDue > 0 && !tForm.customerId) return alert(T.partialPaymentRequiresCustomer);
    if (tripPM === 'bank' && paidVal > 0 && !tripBank) return alert('à¶¶à·à¶‚à¶šà·”à·€!');
    if (saving) return;
    setSaving(true);

    try {
      const vName = vehicles.find(v => v.id === tForm.vehicleId)?.vehicleNo || '';
      const selB  = bankAccounts.find(a => a.id === tripBank);
      const cName = (tForm.customerName || '').trim() || T.guestCustomer;
      const tripDateStr  = typeof tForm.tripDate === 'string' ? tForm.tripDate : todayStr();
      const customerPhone = selCus ? normalizePhone(selCus.phone) : '';

      let customerPortalKey = '';
      if (tForm.customerId && selCus) {
        customerPortalKey = selCus.portalAccessKey || '';
        if (!customerPortalKey) {
          customerPortalKey = makePortalKey(cName);
          try {
            await updateDoc(doc(db, 'customers', tForm.customerId), {
              portalAccessKey: customerPortalKey,
              updatedAt: new Date().toISOString(),
            });
          } catch {}
        }
      }

      const payload = {
        ...tForm,
        tripDate:        tripDateStr,
        fare:            R2(tForm.fare),
        paidAmount:      paidVal,
        balanceDue,
        meterUnits:      meterCalc.kmUnits,
        meterKmTotal:    meterCalc.kmTotal,
        meterHoursTotal: meterCalc.hoursTotal,
        meterDaysTotal:  meterCalc.daysTotal,
        meterMonthsTotal: meterCalc.monthsTotal,
        meterTotal,
        damageAmount,
        damageDescription: tForm.damageDescription || '',
        totalBillAmount: tripTotal,
        vehicleName:     vName,
        customerName:    cName,
        customerPhone,
        customerPortalKey,
        customerPreviousBalance:    existDebt,
        customerTotalDebtAfterTrip: totalDebtAfterTrip,
        timestamp:       Date.now(),
        uid:             user.uid,
        paymentMethod:   tripPM,
        bankAccountId:   tripPM === 'bank' ? tripBank : '',
        bankName:        tripPM === 'bank' ? (selB?.bankName || '') : '',
        createdAt:       serverTimestamp(),
      };

      const tripRef = await addDoc(collection(db, `${basePath}/vehicleTrips`), payload);

      if (tForm.customerId && balanceDue > 0) {
        try {
          await updateDoc(doc(db, 'customers', tForm.customerId), {
            currentBalance: increment(balanceDue),
            updatedAt: new Date().toISOString(),
          });
        } catch {}
      }

      for (const item of tForm.cargoItems) {
        if (item.goodsId && R2(item.qty) > 0) {
          try {
            const iRef  = doc(db, 'items', item.goodsId);
            const iSnap = await getDoc(iRef);
            if (iSnap.exists()) {
              const cur  = getInventoryItemStock(iSnap.data());
              const next = Math.max(0, cur - R2(item.qty));
              await updateDoc(iRef, { stock: next, currentStock: next, updatedAt: serverTimestamp() });
            }
          } catch {}
        }
      }

      if (user?.uid && paidVal > 0 && tripPM !== 'credit') {
        try {
          await addDoc(collection(db, `users/${user.uid}/cashTransactions`), {
            type:          'in',
            category:      'sales',
            source:        'vehicle',
            description:   `ðŸš› ${vName} - ${cName}${tForm.startLocation ? ` (${tForm.startLocation} â†’ ${tForm.endLocation || '?'})` : ''}`,
            amount:        paidVal,
            paymentMethod: tripPM === 'bank' ? 'bank' : tripPM === 'card' ? 'card' : 'cash',
            vehicleId:     tForm.vehicleId,
            vehicleNo:     vName,
            customerId:    tForm.customerId || '',
            customerName:  cName,
            customerPhone,
            tripId:        tripRef.id,
            totalBillAmount: tripTotal,
            balanceDue,
            date:          tripDateStr,
            timestamp:     Timestamp.now(),
            createdAt:     Timestamp.now(),
            isAutomatic:   true,
          });
        } catch (e) { console.error('Cash tx error:', e); }
      }

      if (tripPM === 'bank' && tripBank && paidVal > 0) {
        try {
          await updateDoc(doc(db, `users/${user.uid}/bankAccounts`, tripBank), {
            currentBalance: increment(paidVal),
            liveBalance:    increment(paidVal),
            updatedAt:      serverTimestamp(),
          });
          await addDoc(collection(db, `users/${user.uid}/bankTransactions`), {
            type:        'deposit',
            accountId:   tripBank,
            amount:      paidVal,
            date:        Timestamp.fromDate(new Date(tripDateStr + 'T12:00:00')),
            description: `ðŸš› Trip ${cName} â€” ${vName}`,
            reference:   `TRIP-${tripRef.id}`,
            createdAt:   serverTimestamp(),
            source:      'vehicle-trip',
          });
        } catch (e) { console.error('Bank update error:', e); }
      }

      if (user?.uid && balanceDue > 0 && tForm.customerId) {
        try {
          await addDoc(collection(db, `users/${user.uid}/cashTransactions`), {
            type:          'out',
            category:      'customerCredit',
            source:        'vehicle',
            description:   `ðŸš› ${vName} - ${cName} (à¶«à¶º)`,
            amount:        balanceDue,
            paymentMethod: 'credit',
            vehicleId:     tForm.vehicleId,
            vehicleNo:     vName,
            customerId:    tForm.customerId || '',
            customerName:  cName,
            customerPhone,
            tripId:        tripRef.id,
            date:          tripDateStr,
            timestamp:     Timestamp.now(),
            createdAt:     Timestamp.now(),
            isAutomatic:   true,
          });
        } catch {}
      }

      const savedTrip = {
        id:        tripRef.id,
        receiptId: tripRef.id,
        ...payload,
        customerPhone,
        customerPortalKey,
      };

      setShowModal(null);
      setTForm({ ...INIT_T, tripDate: todayStr() });
      setTripPM('cash');
      setTripBank('');
      setPrintingTrip(savedTrip);
      openOutputManager(savedTrip);
    } catch (e) {
      alert('âš ï¸ ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // â”€â”€ Save Vehicle â”€â”€
  const handleSaveVehicle = async () => {
    if (!vForm.vehicleNo) return alert(T.requiredVehicleNo);
    if (saving) return;
    setSaving(true);
    try {
      await addDoc(collection(db, `${basePath}/vehicles`), { ...vForm, createdAt: serverTimestamp() });
      setShowModal(null);
      setVForm({ ...INIT_V });
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  // â”€â”€ Stats â”€â”€
  const stats = useMemo(() => {
    let it = trips, ie = vehicleExpenses;
    if (reportVehicleId !== 'all') {
      it = trips.filter(t => t.vehicleId === reportVehicleId);
      ie = vehicleExpenses.filter(e => e.vehicleId === reportVehicleId);
    }
    const inc = it.reduce((s, t) => s + R2(t.totalBillAmount), 0);
    const exp = ie.reduce((s, e) => s + R2(e.amount), 0);

    const vehicleStats = {};
    vehicles.forEach(v => {
      vehicleStats[v.id] = {
        vehicleNo: v.vehicleNo,
        trips: 0,
        income: 0,
        expenses: 0,
        fuel: 0,
        tyre: 0,
        service: 0,
      };
    });

    trips.forEach(t => {
      if (vehicleStats[t.vehicleId]) {
        vehicleStats[t.vehicleId].trips++;
        vehicleStats[t.vehicleId].income += R2(t.totalBillAmount);
      }
    });

    vehicleExpenses.forEach(e => {
      if (vehicleStats[e.vehicleId]) {
        vehicleStats[e.vehicleId].expenses += R2(e.amount);
        if (e.expenseType === 'fuel') vehicleStats[e.vehicleId].fuel += R2(e.amount);
        if (e.expenseType === 'tyre') vehicleStats[e.vehicleId].tyre += R2(e.amount);
        if (e.expenseType === 'service') vehicleStats[e.vehicleId].service += R2(e.amount);
      }
    });

    return { inc, exp, net: inc - exp, vehicleStats };
  }, [trips, vehicleExpenses, reportVehicleId, vehicles]);

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // RENDER
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  return (
    <div style={S.container}>
      {outputInvoice && (
        <InvoiceOutputManager
          invoice={outputInvoice}
          onClose={() => setOutputInvoice(null)}
        />
      )}

      <div style={S.header}>
        <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0 }}>ðŸš› {T.title}</h1>
      </div>

      <div style={S.tabs}>
        {[
          { key: 'trips',    icon: 'ðŸ›£ï¸',  label: T.trips },
          { key: 'expenses', icon: 'ðŸ’¸',  label: T.expenses },
          { key: 'vehicles', icon: 'ðŸš›',  label: T.vehicles },
          { key: 'reports',  icon: 'ðŸ“Š',  label: T.reports },
        ].map(tab => (
          <button key={tab.key} className="vim-btn" onClick={() => setActiveTab(tab.key)} style={getTab(activeTab === tab.key)}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'expenses' && <VehicleExpenseTab vehicles={vehicles} />}

      {activeTab !== 'expenses' && (
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25, paddingBottom: 20, borderBottom: '3px solid #f1f5f9' }}>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, background: 'linear-gradient(135deg,#667eea,#764ba2)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {activeTab === 'trips' ? T.trips : activeTab === 'vehicles' ? T.vehicles : T.reports}
            </h2>
            {activeTab === 'trips'    && <button className="vim-btn" onClick={() => setShowModal('trip')}    style={S.addBtn}>âž• {T.addTrip}</button>}
            {activeTab === 'vehicles' && <button className="vim-btn" onClick={() => setShowModal('vehicle')} style={S.addBtn}>âž• {T.addVehicle}</button>}
          </div>

          {activeTab === 'trips' && (
            <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
                <thead>
                  <tr>{[T.tripDate, T.customer, T.amount, T.paidAmount, T.balanceDue, 'à¶šà·Šâ€à¶»à·’à¶ºà·'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {trips.map(tr => (
                    <tr key={tr.id} className="vim-tr">
                      <td style={S.td}>
                        <div style={{ fontWeight: 700 }}>{formatDate(tr.tripDate)}</div>
                        {tr.vehicleName && <div style={{ fontSize: 11, color: '#64748b' }}>ðŸš› {safeStr(tr.vehicleName)}</div>}
                      </td>
                      <td style={S.td}>
                        <div style={{ fontWeight: 800 }}>ðŸ‘¤ {safeStr(tr.customerName || T.guestCustomer)}</div>
                        {tr.customerPhone && <div style={{ fontSize: 11, color: '#64748b' }}>ðŸ“± {displayPhone(tr.customerPhone)}</div>}
                        {tr.description && <div style={{ fontSize: 11, color: '#7c3aed', fontStyle: 'italic' }}>ðŸ“ {String(tr.description).slice(0, 40)}{String(tr.description).length > 40 ? '...' : ''}</div>}
                      </td>
                      <td style={S.td}><div style={{ fontWeight: 900, color: '#10b981', fontSize: 16 }}>{formatCurrency(tr.totalBillAmount)}</div></td>
                      <td style={S.td}><div style={{ fontWeight: 700, color: '#059669' }}>{formatCurrency(tr.paidAmount)}</div></td>
                      <td style={S.td}>{R2(tr.balanceDue) > 0 ? <div style={{ fontWeight: 700, color: '#dc2626' }}>{formatCurrency(tr.balanceDue)}</div> : <span style={{ color: '#16a34a' }}>âœ…</span>}</td>
                      <td style={S.td}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button type="button" onClick={() => setPrintingTrip(tr)}
                            style={{ padding: '6px 10px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>
                            ðŸ–¨ï¸
                          </button>
                          <button type="button" onClick={() => openOutputManager(tr)}
                            style={{ padding: '6px 10px', background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>
                            ðŸ“¤
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!trips.length && (
                    <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: '#94a3b8', padding: 40 }}>{T.noData}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'vehicles' && (
            <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
                <thead><tr>{[T.vehicleNo, T.vehicleType, T.driverName, T.status].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {vehicles.map(v => (
                    <tr key={v.id} className="vim-tr">
                      <td style={S.td}><b>{safeStr(v.vehicleNo)}</b></td>
                      <td style={S.td}>{safeStr(T[v.vehicleType] || v.vehicleType)}</td>
                      <td style={S.td}>{safeStr(v.driverName || '-')}</td>
                      <td style={S.td}><span style={getBadge(v.status === 'active' ? '#10b981' : '#f59e0b')}>{safeStr(T[v.status] || v.status)}</span></td>
                    </tr>
                  ))}
                  {!vehicles.length && <tr><td colSpan={4} style={{ ...S.td, textAlign: 'center', color: '#94a3b8', padding: 40 }}>{T.noData}</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'reports' && (
            <div>
              <select className="vim-input" style={{ ...S.select, width: 'auto', marginBottom: 25 }} value={reportVehicleId} onChange={e => setReportVehicleId(e.target.value)}>
                <option value="all">ðŸ” {T.allVehicles}</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.vehicleNo}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 24 }}>
                {[
                  { l: `ðŸ’° ${T.totalIncome}`,  v: stats.inc, c: '#3b82f6' },
                  { l: `ðŸ’¸ ${T.totalExpense}`, v: stats.exp, c: '#ef4444' },
                  { l: `ðŸ“ˆ ${T.netProfit}`,    v: stats.net, c: stats.net >= 0 ? '#10b981' : '#dc2626' },
                ].map(x => (
                  <div key={x.l} style={getStatCard(x.c)}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#64748b' }}>{x.l}</div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: x.c, marginTop: 8 }}>{formatCurrency(x.v)}</div>
                  </div>
                ))}
              </div>
              {reportVehicleId === 'all' && vehicles.length > 0 && (
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: '#334155', marginBottom: 16 }}>ðŸš› à·€à·à·„à¶± à·€à·à¶»à·Šà¶­à·à·€</h3>
                  <div style={{ display: 'grid', gap: 12 }}>
                    {vehicles.map(v => {
                      const vs  = stats.vehicleStats[v.id] || {};
                      const net = (vs.income || 0) - (vs.expenses || 0);
                      return (
                        <div key={v.id} style={{ background: '#f8fafc', borderRadius: 16, padding: 20, border: '2px solid #e2e8f0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                            <div style={{ fontWeight: 800, fontSize: 18 }}>ðŸš› {safeStr(v.vehicleNo)}</div>
                            <div style={{ fontWeight: 900, fontSize: 18, color: net >= 0 ? '#10b981' : '#dc2626' }}>{net >= 0 ? '+' : ''}{formatCurrency(net)}</div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
                            {[
                              { l: 'ðŸ›£ï¸ à¶œà¶¸à¶±à·Š',    v: String(vs.trips || 0),          c: '#2563eb' },
                              { l: 'ðŸ’° à¶†à¶¯à·à¶ºà¶¸',   v: formatCurrency(vs.income || 0),  c: '#10b981' },
                              { l: 'â›½ Fuel',    v: formatCurrency(vs.fuel || 0),    c: '#ea580c' },
                              { l: 'ðŸ›ž Tyre',    v: formatCurrency(vs.tyre || 0),    c: '#2563eb' },
                              { l: 'ðŸ”§ Service', v: formatCurrency(vs.service || 0), c: '#7c3aed' },
                            ].map(x => (
                              <div key={x.l} style={{ background: 'white', borderRadius: 10, padding: 12, textAlign: 'center', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>{x.l}</div>
                                <div style={{ fontSize: 14, fontWeight: 900, color: x.c, marginTop: 4 }}>{x.v}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TRIP MODAL */}
      {showModal === 'trip' && (
        <div style={S.modal} onClick={() => !saving && setShowModal(null)}>
          <div style={S.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 24, fontWeight: 800, marginBottom: 25, background: 'linear-gradient(135deg,#10b981,#059669)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              ðŸ—ºï¸ {T.addTrip}
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15, marginBottom: 15 }}>
              <div>
                <label style={S.label}>ðŸš› {T.selectVehicle} *</label>
                <select className="vim-input" style={S.select} value={tForm.vehicleId} onChange={e => setTForm({ ...tForm, vehicleId: e.target.value })}>
                  <option value="">-- {T.selectOption} --</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.vehicleNo}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>ðŸ“… {T.tripDate} *</label>
                <input className="vim-input" type="date" style={S.input} value={tForm.tripDate} onChange={e => setTForm({ ...tForm, tripDate: e.target.value })} />
              </div>
            </div>

            <CustomerPicker
              customers={customers}
              customerId={tForm.customerId}
              customerName={tForm.customerName}
              onChange={(id, name) => setTForm(p => ({ ...p, customerId: id, customerName: name }))}
              onCreateNew={handleCreateCustomer}
            />

            <div style={{ background: '#fffbeb', border: '2px solid #fcd34d', borderRadius: 14, padding: 20, marginBottom: 16 }}>
              <label style={{ ...S.label, color: '#92400e', fontSize: 15 }}>ðŸ—ºï¸ {T.route}</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15, marginTop: 10 }}>
                <div>
                  <label style={{ ...S.label, color: '#b45309' }}>ðŸ“ {T.startLocation}</label>
                  <input className="vim-input" style={{ ...S.input, borderColor: '#f59e0b' }} value={tForm.startLocation} onChange={e => setTForm({ ...tForm, startLocation: e.target.value })} />
                </div>
                <div>
                  <label style={{ ...S.label, color: '#059669' }}>ðŸ {T.endLocation}</label>
                  <input className="vim-input" style={{ ...S.input, borderColor: '#10b981' }} value={tForm.endLocation} onChange={e => setTForm({ ...tForm, endLocation: e.target.value })} />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={S.label}>ðŸ“ {T.description}</label>
              <textarea className="vim-input" style={S.textarea} value={tForm.description} onChange={e => setTForm({ ...tForm, description: e.target.value })} placeholder="à¶œà¶¸à¶±à·š à·€à·’à·ƒà·Šà¶­à¶»à¶º..." />
            </div>

            <div style={{ border: `2px solid ${damageAmount > 0 ? '#f59e0b' : '#e2e8f0'}`, borderRadius: 14, padding: 16, background: damageAmount > 0 ? '#fffbeb' : 'white', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 22 }}>âš ï¸</span>
                <label style={{ ...S.label, color: '#92400e', fontSize: 15, marginBottom: 0 }}>{T.damageCharge}</label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#92400e', display: 'block', marginBottom: 4 }}>ðŸ’° {T.damageChargeAmount}</label>
                  <input className="vim-input" type="number" value={tForm.damageAmount} onChange={e => setTForm({ ...tForm, damageAmount: e.target.value })} placeholder="0.00" min="0" step="0.01"
                    style={{ ...S.input, fontSize: 18, fontWeight: 700, textAlign: 'right', borderColor: damageAmount > 0 ? '#f59e0b' : '#e2e8f0', color: '#92400e' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#92400e', display: 'block', marginBottom: 4 }}>ðŸ“ {T.damageDescription}</label>
                  <input className="vim-input" value={tForm.damageDescription} onChange={e => setTForm({ ...tForm, damageDescription: e.target.value })} placeholder="à·„à·à¶±à·’ à·€à·’à·ƒà·Šà¶­à¶»à¶º..."
                    style={{ ...S.input, borderColor: tForm.damageDescription ? '#f59e0b' : '#e2e8f0' }} />
                </div>
              </div>
              {damageAmount > 0 && (
                <div style={{ padding: 10, background: '#fef3c7', borderRadius: 10, border: '1px solid #fcd34d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>âš ï¸ à·„à·à¶±à·’ à¶…à¶º à¶šà·’à¶»à·“à¶¸</span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: '#b45309' }}>{formatCurrency(damageAmount)}</span>
                </div>
              )}
            </div>

            <CargoSection cargoItems={tForm.cargoItems} goodsList={goodsList} onChange={items => setTForm(p => ({ ...p, cargoItems: items }))} />
            <MeterSection form={tForm} onChange={(field, value) => setTForm(p => ({ ...p, [field]: value }))} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15, marginBottom: 20 }}>
              <div style={{ padding: 18, borderRadius: 16, background: '#eff6ff', border: '2px solid #93c5fd' }}>
                <label style={{ ...S.label, color: '#1d4ed8', fontSize: 15 }}>ðŸ’µ {T.fare}</label>
                <input className="vim-input" type="number" value={tForm.fare} onChange={e => setTForm({ ...tForm, fare: e.target.value })} placeholder="0.00"
                  style={{ ...S.input, borderColor: '#3b82f6', fontSize: 22, fontWeight: 900, textAlign: 'right', color: '#1d4ed8' }} />
              </div>
              <div style={{ padding: 18, borderRadius: 16, background: '#ecfdf5', border: '2px solid #86efac' }}>
                <label style={{ ...S.label, color: '#047857', fontSize: 15 }}>ðŸ’° {T.paidAmount}</label>
                <input className="vim-input" type="number" value={tForm.paidAmount} onChange={e => setTForm({ ...tForm, paidAmount: e.target.value })} placeholder="0.00"
                  style={{ ...S.input, borderColor: '#10b981', fontSize: 22, fontWeight: 900, textAlign: 'right', color: '#047857' }} />
              </div>
            </div>

            <BankSelector bankAccounts={bankAccounts} paymentMethod={tripPM} setPaymentMethod={setTripPM} bankAccountId={tripBank} setBankAccountId={setTripBank} />

            <div style={{ marginTop: 20, padding: 18, background: '#f8fafc', borderRadius: 14, border: '2px solid #e2e8f0' }}>
              <div style={{ fontSize: 14, color: '#475569', fontWeight: 700, marginBottom: 12 }}>ðŸ“Š {T.totalBill}</div>
              {(cargoTotal > 0 || meterTotal > 0 || R2(tForm.fare) > 0 || damageAmount > 0) && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  {R2(tForm.fare) > 0    && <div style={{ padding: '8px 12px', background: '#dbeafe', borderRadius: 10, fontSize: 12, fontWeight: 700, color: '#1d4ed8' }}>ðŸ’µ {formatCurrency(tForm.fare)}</div>}
                  {meterTotal > 0        && <div style={{ padding: '8px 12px', background: '#e0f2fe', borderRadius: 10, fontSize: 12, fontWeight: 700, color: '#0369a1' }}>ðŸ“ {formatCurrency(meterTotal)}</div>}
                  {cargoTotal > 0        && <div style={{ padding: '8px 12px', background: '#ede9fe', borderRadius: 10, fontSize: 12, fontWeight: 700, color: '#6d28d9' }}>ðŸ“¦ {formatCurrency(cargoTotal)}</div>}
                  {damageAmount > 0      && <div style={{ padding: '8px 12px', background: '#fef3c7', borderRadius: 10, fontSize: 12, fontWeight: 700, color: '#92400e' }}>âš ï¸ {formatCurrency(damageAmount)}</div>}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div style={{ padding: 14, background: '#dbeafe', borderRadius: 12, textAlign: 'center', border: '2px solid #93c5fd' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#1d4ed8' }}>{T.totalBill}</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#1d4ed8', marginTop: 4 }}>{formatCurrency(tripTotal)}</div>
                </div>
                <div style={{ padding: 14, background: '#dcfce7', borderRadius: 12, textAlign: 'center', border: '2px solid #86efac' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#047857' }}>{T.received}</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#047857', marginTop: 4 }}>{formatCurrency(paidVal)}</div>
                </div>
                <div style={{ padding: 14, background: balanceDue > 0 ? '#fee2e2' : '#dcfce7', borderRadius: 12, textAlign: 'center', border: `2px solid ${balanceDue > 0 ? '#fecaca' : '#86efac'}` }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: balanceDue > 0 ? '#dc2626' : '#16a34a' }}>{T.balanceDue}</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: balanceDue > 0 ? '#dc2626' : '#16a34a', marginTop: 4 }}>{formatCurrency(balanceDue)}</div>
                </div>
              </div>

              {selCus && (balanceDue > 0 || existDebt > 0) && (
                <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: 'linear-gradient(135deg,#fff7ed,#fef2f2)', border: '1.5px solid #fca5a5' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#9a3412', marginBottom: 10 }}>ðŸ’³ {T.debtSummary}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {existDebt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#9a3412' }}><span>ðŸ“‹ {T.previousTripDebt}:</span><span style={{ fontWeight: 700 }}>{formatCurrency(existDebt)}</span></div>}
                    {balanceDue > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#9a3412' }}><span>ðŸš› {T.thisTrip}:</span><span style={{ fontWeight: 700 }}>{formatCurrency(balanceDue)}</span></div>}
                    {existDebt > 0 && balanceDue > 0 && <div style={{ borderTop: '1px dashed #fca5a5', paddingTop: 8, marginTop: 2 }} />}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#7f1d1d' }}>ðŸ“Œ {T.totalOutstandingDebt}:</span>
                      <span style={{ fontSize: 22, fontWeight: 900, color: '#b91c1c' }}>{formatCurrency(totalDebtAfterTrip)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 30 }}>
              <button className="vim-btn" onClick={() => { setShowModal(null); setTripPM('cash'); setTripBank(''); }} style={S.cancelBtn} disabled={saving}>
                {T.cancel}
              </button>
              <button className="vim-btn" onClick={handleSaveTrip} disabled={saving} style={{ ...S.saveBtn, flex: 1, opacity: saving ? 0.6 : 1 }}>
                {saving ? `â³ ${T.saving}` : `âœ… ${T.save}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VEHICLE MODAL */}
      {showModal === 'vehicle' && (
        <div style={S.modal} onClick={() => !saving && setShowModal(null)}>
          <div style={S.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 24, fontWeight: 800, marginBottom: 25 }}>ðŸš› {T.addVehicle}</h3>
            <div style={{ marginBottom: 15 }}>
              <label style={S.label}>ðŸš— {T.vehicleNo} *</label>
              <input className="vim-input" style={S.input} value={vForm.vehicleNo} onChange={e => setVForm({ ...vForm, vehicleNo: e.target.value.toUpperCase() })} />
            </div>
            <div style={{ marginBottom: 15 }}>
              <label style={S.label}>ðŸš— {T.vehicleType}</label>
              <select className="vim-input" style={S.select} value={vForm.vehicleType} onChange={e => setVForm({ ...vForm, vehicleType: e.target.value })}>
                <option value="truck">{T.truck}</option>
                <option value="van">{T.van}</option>
                <option value="lorry">{T.lorry}</option>
                <option value="pickup">{T.pickup}</option>
              </select>
            </div>
            <div style={{ marginBottom: 15 }}>
              <label style={S.label}>ðŸ‘¨â€âœˆï¸ {T.driverName}</label>
              <input className="vim-input" style={S.input} value={vForm.driverName} onChange={e => setVForm({ ...vForm, driverName: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 30 }}>
              <button className="vim-btn" onClick={() => setShowModal(null)} style={S.cancelBtn}>{T.cancel}</button>
              <button className="vim-btn" onClick={handleSaveVehicle} disabled={saving} style={{ ...S.saveBtn, opacity: saving ? 0.6 : 1 }}>
                {saving ? `â³ ${T.saving}` : `âœ… ${T.save}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT PREVIEW */}
      {printingTrip && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 3000, display: 'flex', justifyContent: 'center', paddingTop: 40, overflowY: 'auto' }}>
          <div style={{ background: 'white', padding: 40, width: '100%', maxWidth: 680, borderRadius: 12, marginBottom: 40 }}>
            <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 20 }}>
              <button onClick={() => setPrintingTrip(null)}
                style={{ padding: '8px 16px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, cursor: 'pointer' }}>
                {T.close}
              </button>
              <button onClick={() => openOutputManager(printingTrip)}
                style={{ padding: '8px 16px', background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
                ðŸ“¤ {T.sendBill}
              </button>
              <button onClick={() => typeof window !== 'undefined' && window.print()}
                style={{ padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                ðŸ–¨ï¸ {T.print}
              </button>
            </div>

            <div id="printable-invoice">
              <h2 style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: 15 }}>à¶´à·Šâ€à¶»à·€à·à·„à¶± à¶¶à·’à¶½à·Šà¶´à¶­</h2>
              <p>
                <strong>à¶¯à·’à¶±à¶º:</strong> {formatDate(printingTrip.tripDate)} |{' '}
                <strong>à·€à·à·„à¶±à¶º:</strong> {safeStr(printingTrip.vehicleName)} |{' '}
                <strong>à¶´à·à¶»à·’à¶·à·à¶œà·’à¶šà¶ºà·:</strong> {safeStr(printingTrip.customerName)}
              </p>
              {printingTrip.customerPhone && <p><strong>ðŸ“±:</strong> {displayPhone(printingTrip.customerPhone)}</p>}
              {printingTrip.description && (
                <div style={{ padding: 10, background: '#f8fafc', borderRadius: 8, margin: '12px 0', border: '1px solid #e2e8f0', fontSize: 14, color: '#334155', fontStyle: 'italic' }}>
                  ðŸ“ {printingTrip.description}
                </div>
              )}

              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 15 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #000' }}>
                    <th style={{ textAlign: 'left', padding: 8 }}>à·€à·’à·ƒà·Šà¶­à¶»à¶º</th>
                    <th style={{ textAlign: 'center', padding: 8 }}>à¶´à·Šâ€à¶»à¶¸à·à¶«à¶º</th>
                    <th style={{ textAlign: 'right', padding: 8 }}>à¶¸à·”à¶¯à¶½</th>
                  </tr>
                </thead>
                <tbody>
                  {Number(printingTrip.fare) > 0 && (
                    <tr><td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{T.fare}</td><td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'center' }}>â€”</td><td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'right' }}>{formatCurrency(printingTrip.fare)}</td></tr>
                  )}
                  {R2(printingTrip.meterKmTotal) > 0 && (
                    <tr><td style={{ padding: 8, borderBottom: '1px solid #eee' }}>ðŸ›£ï¸ KM</td><td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'center' }}>{fmtQ(printingTrip.meterUnits || 0)}</td><td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'right' }}>{formatCurrency(printingTrip.meterKmTotal)}</td></tr>
                  )}
                  {R2(printingTrip.meterHoursTotal) > 0 && (
                    <tr><td style={{ padding: 8, borderBottom: '1px solid #eee' }}>â±ï¸ à¶´à·à¶º</td><td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'center' }}>{fmtQ(printingTrip.meterHours || 0)}</td><td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'right' }}>{formatCurrency(printingTrip.meterHoursTotal)}</td></tr>
                  )}
                  {R2(printingTrip.meterDaysTotal) > 0 && (
                    <tr><td style={{ padding: 8, borderBottom: '1px solid #eee' }}>ðŸ“… à¶¯à·’à¶±</td><td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'center' }}>{fmtQ(printingTrip.meterDays)}</td><td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'right' }}>{formatCurrency(printingTrip.meterDaysTotal)}</td></tr>
                  )}
                  {R2(printingTrip.meterMonthsTotal) > 0 && (
                    <tr><td style={{ padding: 8, borderBottom: '1px solid #eee' }}>ðŸ—“ï¸ à¶¸à·à·ƒ</td><td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'center' }}>{fmtQ(printingTrip.meterMonths)}</td><td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'right' }}>{formatCurrency(printingTrip.meterMonthsTotal)}</td></tr>
                  )}
                  {R2(printingTrip.damageAmount) > 0 && (
                    <tr>
                      <td style={{ padding: 8, borderBottom: '1px solid #eee', color: '#b45309', fontWeight: 700 }}>âš ï¸ à·„à·à¶±à·’ {printingTrip.damageDescription ? `(${printingTrip.damageDescription})` : ''}</td>
                      <td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'center' }}>â€”</td>
                      <td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'right', fontWeight: 700, color: '#b45309' }}>{formatCurrency(printingTrip.damageAmount)}</td>
                    </tr>
                  )}
                  {(printingTrip.cargoItems || []).map((ci, x) => {
                    const gross = R2(R2(ci.qty) * R2(ci.unitPrice));
                    const disc  = R2(gross * R2(ci.discount) / 100);
                    const net   = R2(ci.total || (gross - disc));
                    return (
                      <tr key={x}>
                        <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>
                          ðŸ“¦ {safeStr(ci.goodsName)}
                          {R2(ci.discount) > 0 && <span style={{ color: '#dc2626', fontSize: 12 }}> (âˆ’{fmtQ(ci.discount)}%)</span>}
                        </td>
                        <td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'center' }}>{fmtQ(ci.qty)}</td>
                        <td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'right', fontWeight: 700 }}>{formatCurrency(net)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr><td colSpan={2} style={{ padding: 10, textAlign: 'right', fontWeight: 'bold' }}>{T.totalBill}:</td><td style={{ padding: 10, textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(printingTrip.totalBillAmount)}</td></tr>
                  <tr><td colSpan={2} style={{ padding: 10, textAlign: 'right', fontWeight: 'bold', color: '#166534' }}>{T.paidAmount}:</td><td style={{ padding: 10, textAlign: 'right', fontWeight: 'bold', color: '#166534' }}>{formatCurrency(printingTrip.paidAmount)}</td></tr>
                  <tr><td colSpan={2} style={{ padding: 10, textAlign: 'right', fontWeight: 'bold', color: '#dc2626', fontSize: 18 }}>{T.balanceDue}:</td><td style={{ padding: 10, textAlign: 'right', fontWeight: 'bold', color: '#dc2626', fontSize: 18 }}>{formatCurrency(printingTrip.balanceDue)}</td></tr>
                </tfoot>
              </table>

              {(() => {
                const prev  = R2(printingTrip.customerPreviousBalance ?? 0);
                const td    = R2(printingTrip.balanceDue ?? 0);
                const total = R2(printingTrip.customerTotalDebtAfterTrip ?? (prev + td));
                if (total <= 0) return null;
                return (
                  <div style={{ marginTop: 20, padding: 16, borderRadius: 12, background: 'linear-gradient(135deg,#fff1f2,#fef2f2)', border: '2px solid #fecaca', textAlign: 'center' }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#991b1b' }}>ðŸ“Œ {T.totalOutstandingDebt}</div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: '#b91c1c', marginTop: 4 }}>{formatCurrency(total)}</div>
                    {prev > 0 && td > 0 && (
                      <div style={{ fontSize: 12, color: '#991b1b', marginTop: 8, display: 'flex', justifyContent: 'center', gap: 16 }}>
                        <span>{T.previousTripDebt}: {formatCurrency(prev)}</span>
                        <span>+</span>
                        <span>{T.thisTrip}: {formatCurrency(td)}</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {printingTrip.customerPortalKey && (
                <p style={{ marginTop: 14, fontSize: 12, wordBreak: 'break-all' }}>
                  <strong>ðŸ‘¤ à¶œà·’à¶«à·”à¶¸:</strong> {getPortalLink(printingTrip.customerPortalKey)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

