'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from "../firebaseConfig";
import { useUserAuth } from '@/context/UserContext';
import {
  collection, onSnapshot, query, doc,
  addDoc, updateDoc, increment, serverTimestamp,
  Timestamp, writeBatch, where, orderBy, getDocs
} from 'firebase/firestore';

/* ═══════════════════════════════════════ HELPERS ═══════════════════════════════════════ */
const toNum = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const fmtC = v => toNum(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQ = v => { const n = Math.round(toNum(v) * 100) / 100; return n % 1 === 0 ? String(n) : (Number(n) || 0).toFixed(2); };

const toMs = src => {
  if (!src) return 0;
  if (src?.toDate) { try { return src.toDate().getTime(); } catch { return 0; } }
  if (src?.seconds) return src.seconds * 1000;
  if (src?._seconds) return src._seconds * 1000;
  if (typeof src === 'number') return src;
  if (typeof src === 'string') {
    const d = new Date(src);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  return 0;
};

const padZ = n => String(n).padStart(2, '0');
const msToLocalDate = ms => { if (ms <= 0) return ''; const d = new Date(ms); return `${d.getFullYear()}-${padZ(d.getMonth() + 1)}-${padZ(d.getDate())}`; };
const msToLocalTime = ms => { if (ms <= 0) return ''; const d = new Date(ms); return `${padZ(d.getHours())}:${padZ(d.getMinutes())}`; };
const todayStr = () => msToLocalDate(Date.now());
const nowHHMM = () => { const d = new Date(); return `${padZ(d.getHours())}:${padZ(d.getMinutes())}`; };

const resolveMs = tx => {
  if (!tx) return 0;
  let ms = toMs(tx?.timestamp);
  if (ms > 0) return ms;
  ms = toMs(tx?.createdAt);
  if (ms > 0) return ms;
  
  const ds = (tx?.date && typeof tx.date === 'string') ? tx.date : '';
  if (ds && /^\d{4}-\d{2}-\d{2}$/.test(ds)) {
    const ts = (tx?.time && typeof tx.time === 'string') ? tx.time.trim() : '';
    let timePart = '12:00';
    if (ds && ts) {
      const m24 = ts.match(/^(\d{1,2}):(\d{2})$/);
      const m12 = ts.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)$/);
      if (m24) timePart = `${padZ(m24[1])}:${m24[2]}`;
      else if (m12) {
        let h = parseInt(m12[1], 10);
        const isPM = /pm/i.test(m12[3]);
        if (isPM && h < 12) h += 12;
        if (!isPM && h === 12) h = 0;
        timePart = `${padZ(h)}:${m12[2]}`;
      }
    }
    const d = new Date(`${ds}T${timePart}:00`);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return Date.now();
};

const getDisplayDate = tx => {
  const ms = resolveMs(tx);
  if (ms > 0) return msToLocalDate(ms);
  if (tx?.date && typeof tx.date === 'string') return tx.date;
  return todayStr();
};

const getDisplayTime = tx => {
  if (tx?.time && typeof tx.time === 'string' && tx.time.trim()) return tx.time.trim();
  const ms = resolveMs(tx);
  return ms > 0 ? msToLocalTime(ms) : '';
};

const fmtDate = s => {
  if (!s) return '—';
  try {
    const [y, m, d] = s.split('-');
    const months = ['ජන', 'පෙබ', 'මාර්', 'අප්‍ර', 'මැයි', 'ජූනි', 'ජූලි', 'අගෝ', 'සැප්', 'ඔක්', 'නොවැ', 'දෙසැ'];
    return `${d} ${months[parseInt(m, 10) - 1]} ${y}`;
  } catch { return s; }
};

const rangeStart = f => {
  const d = new Date();
  switch (f) {
    case 'today': return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    case 'yesterday': return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1).getTime();
    case 'thisWeek': { const day = d.getDay(); const diff = day === 0 ? 6 : day - 1; return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff).getTime(); }
    case 'thisMonth': return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    default: return 0;
  }
};

const rangeEnd = f => {
  const d = new Date();
  if (f === 'yesterday') return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Date.now() + 86400000;
};

const diffDaysFrom = dateStr => {
  if (!dateStr) return 0;
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
};

/* ═══ PROFIT HELPERS ═══ */
const getItemCostPrice = it => {
  const avgCost = toNum(it?.avgBatchCost); if (avgCost > 0) return avgCost;
  const allocCost = toNum(it?.allocatedCostTotal); const qty = toNum(it?.qty || it?.quantity || 1);
  if (allocCost > 0 && qty > 0) return allocCost / qty;
  const bnp = toNum(it?.buyingNetPrice); if (bnp > 0) return bnp;
  return toNum(it?.costPrice || it?.buyingPrice || it?.unitCost || it?.cost || it?.purchasePrice || it?.netPrice || 0);
};
const getItemSellPrice = it => {
  const yp = toNum(it?.yourPrice); if (yp > 0) return yp;
  const lt = toNum(it?.lineTotal || it?.total || 0); const qty = toNum(it?.qty || it?.quantity || 1);
  if (lt > 0 && qty > 0) return lt / qty;
  return toNum(it?.sellingPrice || it?.unitPrice || it?.salePrice || it?.retailYourPrice || it?.wholesaleYourPrice || it?.price || it?.retailPrice || 0);
};
const getLineRevenue = (it, sell) => {
  const lt = toNum(it?.lineTotal || it?.total || 0); if (lt > 0) return lt;
  const qty = toNum(it?.qty || it?.quantity || 1); const disc = toNum(it?.discAmount || it?.discount || 0);
  return Math.max(0, (sell * qty) - (disc * qty));
};
const calcItemProfit = it => {
  const qty = toNum(it?.qty || it?.quantity || 1); const cost = getItemCostPrice(it); const sell = getItemSellPrice(it);
  const lineRev = getLineRevenue(it, sell);
  const lineCost = toNum(it?.allocatedCostTotal) > 0 ? toNum(it.allocatedCostTotal) : cost * qty;
  const lineProfit = cost > 0 ? lineRev - lineCost : null;
  const margin = lineRev > 0 && cost > 0 ? (lineProfit / lineRev) * 100 : null;
  return { qty, cost, sell, lineRev, lineCost, lineProfit, margin, hasCost: cost > 0 };
};
const calcInvoiceProfit = items => {
  if (!Array.isArray(items) || !items.length) return { totalProfit: 0, totalRevenue: 0, totalCost: 0, margin: 0, hasCostData: false };
  let totalProfit = 0, totalRevenue = 0, totalCost = 0, hasCostData = false;
  items.forEach(it => { const p = calcItemProfit(it); totalRevenue += p.lineRev; if (p.hasCost) { totalProfit += p.lineProfit; totalCost += p.lineCost; hasCostData = true; } });
  return { totalProfit, totalRevenue, totalCost, margin: totalRevenue > 0 && hasCostData ? (totalProfit / totalRevenue) * 100 : 0, hasCostData };
};
const getCashTxProfit = tx => {
  const lineProfit = tx?.lineProfit; const totalCost = toNum(tx?.totalCostPrice); const totalRevenue = toNum(tx?.totalSellingRevenue || tx?.amount);
  const hasCostData = tx?.hasCostData === true || totalCost > 0;
  if (lineProfit !== null && lineProfit !== undefined && hasCostData) {
    const margin = totalRevenue > 0 ? (toNum(lineProfit) / totalRevenue) * 100 : 0;
    return { totalProfit: toNum(lineProfit), totalRevenue, totalCost, margin, hasCostData };
  }
  return null;
};

/* ═══ VEHICLE EXPENSE META HELPERS ═══ */
const VEH_META = {
  fuel: { label: 'ඉන්ධන (Fuel)', icon: '⛽', color: '#ea580c', bg: '#fff7ed', border: '#fdba74' },
  tyre: { label: 'ටයර් (Tyre)', icon: '🛞', color: '#7c3aed', bg: '#faf5ff', border: '#c4b5fd' },
  service: { label: 'සර්විස් (Service)', icon: '🔧', color: '#0284c7', bg: '#f0fdf4', border: '#bae6fd' },
  other: { label: 'වෙනත් (Other)', icon: '📋', color: '#475569', bg: '#f8fafc', border: '#cbd5e1' },
};
const getVehMeta = type => VEH_META[type] || VEH_META.other;

const vehicleFuelStats = form => {
  const litres = toNum(form.fuelLitres);
  const price = toNum(form.pricePerLitre);
  const kb = toNum(form.kmBefore);
  const ka = toNum(form.kmAfter);
  const kmDriven = ka > kb ? ka - kb : 0;
  const kmPerLitre = litres > 0 && kmDriven > 0 ? kmDriven / litres : 0;
  const amountAuto = litres * price;
  return { kmDriven, kmPerLitre, amountAuto };
};

const vehicleTyreStats = form => {
  const ik = toNum(form.installedKm);
  const ck = toNum(form.currentKm);
  const ek = toNum(form.expectedLifeKm);
  const kmUsed = ck > ik ? ck - ik : 0;
  const remainingKm = Math.max(0, ek - kmUsed);
  const daysUsed = diffDaysFrom(form.installedDate);
  return { kmUsed, remainingKm, daysUsed };
};

/* ═══ SOURCE DETECTION ═══ */
const SRC = {
  purchase: { si: 'මිලදී ගැනීම', icon: '📦', color: '#d97706' },
  supplier: { si: 'සැපයුම්කරු ගෙවීම', icon: '🏪', color: '#7c3aed' },
  expense: { si: 'වියදම්', icon: '💰', color: '#dc2626' },
  invoice: { si: 'ඉන්වොයිස්', icon: '🧾', color: '#4f46e5' },
  balance: { si: 'ශේෂය', icon: '💼', color: '#0f766e' },
  manual: { si: 'අතින්', icon: '✍️', color: '#475569' },
  customerCredit: { si: 'පාරිභෝගික ණය', icon: '👤', color: '#dc2626' },
  invoicePayment: { si: 'පාරිභෝගික ගෙවීම', icon: '💵', color: '#16a34a' },
  bankDeposit: { si: 'මුදල් බැංකුගත', icon: '🏦', color: '#059669' },
  bankWithdraw: { si: 'බැංකුවෙන් ගැනීම', icon: '💵', color: '#2563eb' },
  bankTransfer: { si: 'බැංකු අතර මාරු', icon: '🔄', color: '#6366f1' },
  vehicleExpense: { si: 'වාහන වියදම', icon: '🚛', color: '#dc2626' },
  production: { si: 'නිෂ්පාදන/සේවා', icon: '🏭', color: '#0f766e' },
  productionSales: { si: 'නිෂ්පාදන ආදායම', icon: '🏭', color: '#059669' },
  productionExpense: { si: 'නිෂ්පාදන වියදම', icon: '📉', color: '#b91c1c' },
  bankLoanRepayment: { si: 'ණය වාරික ගෙවීම', icon: '🏦', color: '#dc2626' },
  chitFundPayment: { si: 'සීට්ටු/සමිති ගෙවීම', icon: '🎫', color: '#ea580c' },
  chitFundReceipt: { si: 'සීට්ටු/සමිති ලැබීම', icon: '💰', color: '#16a34a' },
};

const isPurch = tx => tx && (tx._isPurchDoc || tx.source === 'purchase' || tx.source === 'supplier' || tx.category === 'supplierPayment');
const isBalanceTx = tx => tx && (tx.source === 'balance' || tx.category === 'openingBalance' || tx.category === 'closingBalance');
const isOpeningTx = tx => tx && tx.category === 'openingBalance';

const isCustomerCredit = tx => {
  if (!tx) return false;
  const src = String(tx.source || '').toLowerCase();
  const cat = String(tx.category || '').toLowerCase();
  const type = String(tx.type || '').toLowerCase();
  return (
    src === 'customercredit' || cat === 'customercredit' || src === 'credit' ||
    (type === 'out' && !!tx.customerId && !tx.invoiceId && (tx.paymentMethod === 'credit' || src === 'manual_credit'))
  );
};

const isCustomerPayment = tx => {
  if (!tx) return false;
  const src = String(tx.source || '').toLowerCase();
  const cat = String(tx.category || '').toLowerCase();
  const type = String(tx.type || '').toLowerCase();
  return (
    src === 'invoicepayment' || cat === 'invoicepayment' || src === 'customerpayment' ||
    cat === 'customerpayment' || src === 'payment' || (type === 'in' && !!tx.customerId)
  );
};

const isBankDeposit = tx => tx && (tx.type === 'bankDeposit' || tx.category === 'bankDeposit' || tx.source === 'bankDeposit');
const isBankWithdraw = tx => tx && (tx.type === 'bankWithdraw' || tx.category === 'bankWithdraw' || tx.source === 'bankWithdraw');
const isBankTransfer = tx => tx && (tx.type === 'transfer' || tx.category === 'bankTransfer' || tx.source === 'bankTransfer' || tx.source === 'cashTransfer');
const isVehicleExpense = tx => tx && (tx.source === 'vehicleExpense' || tx.category === 'vehicleFuel' || tx.category === 'vehicleTyre' || tx.category === 'vehicleService' || tx.category === 'vehicleOther');
const isBankMovement = tx => isBankDeposit(tx) || isBankWithdraw(tx);
const isAnyBankTx = tx => isBankDeposit(tx) || isBankWithdraw(tx) || isBankTransfer(tx);

const isProductionTx = tx => {
  if (!tx) return false;
  const src = String(tx.source || '').toLowerCase();
  const cat = String(tx.category || '').toLowerCase();
  return (
    src === 'production' || src.startsWith('custom_') || src === 'quarry' ||
    src === 'cropfarm' || src === 'vehiclerepair' || src === 'tyreshop' ||
    src === 'vehiclewash' || cat === 'productionsales' || cat === 'productionexpense' ||
    cat === 'quarry' || cat === 'cropfarm' || cat.startsWith('custom_')
  );
};

const isProductionIncome = tx => isProductionTx(tx) && tx.type === 'in';
const isProductionExpense = tx => isProductionTx(tx) && tx.type === 'out';

const isSalesTx = tx =>
  !isPurch(tx) && !isBalanceTx(tx) && !isCustomerCredit(tx) && !isCustomerPayment(tx) &&
  !isAnyBankTx(tx) && !isVehicleExpense(tx) && !isProductionTx(tx) &&
  tx?.type === 'in' && (tx.source === 'invoice' || tx.source === 'pos' || tx.category === 'sales');

const srcCfg = tx => {
  if (isBankTransfer(tx)) return SRC.bankTransfer;
  if (isBankDeposit(tx)) return SRC.bankDeposit;
  if (isBankWithdraw(tx)) return SRC.bankWithdraw;
  if (isProductionIncome(tx)) return SRC.productionSales;
  if (isProductionExpense(tx)) return SRC.productionExpense;
  if (isProductionTx(tx)) return SRC.production;
  if (tx?.category === 'bankLoanRepayment') return SRC.bankLoanRepayment;
  if (tx?.category === 'chitFundPayment') return SRC.chitFundPayment;
  if (tx?.category === 'chitFundReceipt') return SRC.chitFundReceipt;
  if (tx?.source === 'supplier' || tx?.category === 'supplierPayment') return tx._isPurchDoc ? SRC.purchase : SRC.supplier;
  if (isPurch(tx)) return SRC.purchase;
  if (isBalanceTx(tx)) return SRC.balance;
  if (isCustomerCredit(tx)) return SRC.customerCredit;
  if (isCustomerPayment(tx)) return SRC.invoicePayment;
  if (isVehicleExpense(tx)) return SRC.vehicleExpense;
  return SRC[tx?.source] || SRC.manual;
};

const catLabel = cat => ({
  supplierPayment: 'සැපයුම්කරු ගෙවීම', openingBalance: 'ආරම්භක ශේෂය', closingBalance: 'අවසාන ශේෂය',
  sales: 'විකිණීම', productionSales: 'නිෂ්පාදන ආදායම',
  customerCredit: 'පාරිභෝගික ණය', invoicePayment: 'පාරිභෝගික ගෙවීම', customerPayment: 'පාරිභෝගික ගෙවීම',
  bankDeposit: 'මුදල් බැංකුගත කිරීම', bankWithdraw: 'බැංකුවෙන් මුදල් ගැනීම', bankTransfer: 'බැංකු අතර මාරු කිරීම',
  vehicleFuel: 'වාහන ඉන්ධන', vehicleTyre: 'ටයර්', vehicleService: 'වාහන සේවා', vehicleOther: 'අනෙකුත් වාහන වියදම්',
  petrolExpense: 'ඩීසල් / ඉන්ධන', salary: 'කම්කරු', maintenance: 'නඩත්තු', transport: 'ප්‍රවාහනය',
  utilities: 'විදුලිය / ජලය', rent: 'කුලිය', other: 'වෙනත්',
  bankLoanRepayment: 'ණය වාරික ගෙවීම',
  chitFundPayment: 'සීට්ටු/සමිති වාරික ගෙවීම',
  chitFundReceipt: 'සීට්ටු ලැබීම / ලාභාංශ',
}[cat] || cat || '—');

/* ═══ DENOMINATIONS ═══ */
const NOTES = [
  { value: 5000, label: '5,000', emoji: '💵', color: '#059669' },
  { value: 2000, label: '2,000', emoji: '💵', color: '#0d9488' },
  { value: 1000, label: '1,000', emoji: '💵', color: '#0891b2' },
  { value: 500, label: '500', emoji: '💵', color: '#2563eb' },
  { value: 100, label: '100', emoji: '💵', color: '#7c3aed' },
  { value: 50, label: '50', emoji: '💵', color: '#9333ea' },
  { value: 20, label: '20', emoji: '💵', color: '#c026d3' },
];
const COINS = [
  { value: 10, label: '10', emoji: '🪙', color: '#b45309' },
  { value: 5, label: '5', emoji: '🪙', color: '#a16207' },
  { value: 2, label: '2', emoji: '🪙', color: '#854d0e' },
  { value: 1, label: '1', emoji: '🪙', color: '#78716c' },
];
const ALL_DENOMS = [...NOTES, ...COINS];
const initDenom = () => { const d = {}; ALL_DENOMS.forEach(n => { d[n.value] = ''; }); return d; };
const calcDenomTotal = denom => ALL_DENOMS.reduce((s, n) => s + toNum(denom[n.value]) * n.value, 0);

const DenomCard = React.memo(({ n, isNote, value, onChange, disabled }) => {
  const [localVal, setLocalVal] = useState(value || '');
  const timerRef = useRef(null);
  useEffect(() => { setLocalVal(value || ''); }, [value]);
  const handleInput = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    setLocalVal(raw);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { onChange(raw); }, 300);
  };
  const handleBlur = () => { if (timerRef.current) clearTimeout(timerRef.current); onChange(localVal); };
  const cnt = toNum(localVal); const line = cnt * n.value;
  return (
    <div style={{ background: cnt > 0 ? (isNote ? '#f0fdf4' : '#fffbeb') : 'white', border: cnt > 0 ? `2px solid ${isNote ? '#86efac' : '#fcd34d'}` : '1px solid #e2e8f0', borderRadius: 12, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ background: n.color, color: 'white', padding: '2px 8px', borderRadius: 6, fontSize: 13, fontWeight: 800, minWidth: 50, textAlign: 'center' }}>{n.emoji} {n.label}</span>
        {cnt > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: isNote ? '#16a34a' : '#b45309', background: isNote ? '#dcfce7' : '#fef3c7', padding: '2px 8px', borderRadius: 6 }}>={fmtC(line)}</span>}
      </div>
      <input type="tel" inputMode="numeric" autoComplete="off" value={localVal} onChange={handleInput} onBlur={handleBlur} onFocus={e => e.target.select()} disabled={disabled} placeholder="0" style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 18, fontWeight: 700, textAlign: 'center', boxSizing: 'border-box', background: disabled ? '#f3f4f6' : 'white' }} />
    </div>
  );
});
DenomCard.displayName = 'DenomCard';

const DenominationInput = ({ denominations, onChange, disabled }) => {
  const total = calcDenomTotal(denominations);
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#16a34a', marginBottom: 10 }}>💵 නෝට්ටු</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 8, marginBottom: 16 }}>
        {NOTES.map(n => <DenomCard key={n.value} n={n} isNote value={denominations[n.value]} onChange={val => onChange({ ...denominations, [n.value]: val })} disabled={disabled} />)}
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#92400e', marginBottom: 10 }}>🪙 කාසි</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))', gap: 8, marginBottom: 16 }}>
        {COINS.map(n => <DenomCard key={n.value} n={n} isNote={false} value={denominations[n.value]} onChange={val => onChange({ ...denominations, [n.value]: val })} disabled={disabled} />)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: total > 0 ? '#f0fdf4' : '#f8fafc', borderRadius: 12, border: `2px solid ${total > 0 ? '#86efac' : '#e2e8f0'}` }}>
        <div>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Cash</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: total > 0 ? '#16a34a' : '#94a3b8' }}>Rs.{fmtC(total)}</div>
        </div>
        <button onClick={() => onChange(initDenom())} disabled={disabled} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', fontWeight: 700, fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer' }}>🗑️</button>
      </div>
    </div>
  );
};

/* ═══ BALANCE ENTRY MODAL ═══ */
const BalanceEntryModal = ({ isOpen, onClose, type, user, bankAccounts, expectedAmount = 0 }) => {
  const [denominations, setDenominations] = useState(initDenom());
  const [bankBalances, setBankBalances] = useState({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const isOpening = type === 'opening';
  const title = isOpening ? 'ආරම්භක ශේෂය' : 'අවසාන ශේෂය';
  const icon = isOpening ? '🌅' : '🌆';
  const accentClr = isOpening ? '#059669' : '#7c3aed';
  const category = isOpening ? 'openingBalance' : 'closingBalance';

  useEffect(() => {
    if (!isOpen) return;
    setDenominations(initDenom());
    const prefill = {};
    bankAccounts.forEach(acc => { const live = toNum(acc.liveBalance ?? acc.currentBalance ?? 0); prefill[acc.id] = live > 0 ? (Number(live) || 0).toFixed(2) : ''; });
    setBankBalances(prefill); setNotes('');
  }, [isOpen, bankAccounts]);

  const cashTotal = useMemo(() => calcDenomTotal(denominations), [denominations]);
  const bankTotal = useMemo(() => Object.values(bankBalances).reduce((s, v) => s + toNum(v), 0), [bankBalances]);
  const grandTotal = cashTotal + bankTotal;
  const variance = grandTotal - expectedAmount;

  const handleSave = async () => {
    if (grandTotal <= 0) return alert('❌ මුදල් ඇතුළත් කරන්න');
    setSaving(true);
    try {
      const denomData = {};
      ALL_DENOMS.forEach(n => { const cnt = toNum(denominations[n.value]); if (cnt > 0) denomData[n.value] = cnt; });
      const bankBalancesObj = {}; const bankSnapshot = [];
      bankAccounts.forEach(acc => {
        const amt = toNum(bankBalances[acc.id]); if (amt <= 0) return;
        bankBalancesObj[acc.id] = { amount: amt, bankName: acc.bankName || '', accountName: acc.accountName || '', accountNumber: acc.accountNumber || '', currency: acc.currency || 'LKR' };
        bankSnapshot.push({ accountId: acc.id, amount: amt, bankName: acc.bankName || '', accountName: acc.accountName || '', accountNumber: acc.accountNumber || '', currency: acc.currency || 'LKR' });
      });

      const payload = {
        type: isOpening ? 'in' : 'out', source: 'balance', category, amount: grandTotal, cashAmount: cashTotal, bankAmount: bankTotal,
        denominations: denomData, bankBalances: bankBalancesObj, bankSnapshot,
        description: `${icon} ${title} — Rs.${fmtC(grandTotal)}`, notes: notes || '',
        date: todayStr(), time: nowHHMM(), timestamp: Timestamp.now(), createdAt: serverTimestamp(),
        createdBy: user?.email || '', uid: user.uid,
      };

      if (!isOpening) {
        payload.expectedAmount = expectedAmount;
        payload.varianceAmount = variance;
      }

      await addDoc(collection(db, `users/${user.uid}/cashTransactions`), payload);
      let msg = `✅ ${title}!\n💵 ${fmtC(cashTotal)} | 🏦 ${fmtC(bankTotal)} | 📊 ${fmtC(grandTotal)}`;
      if (!isOpening) msg += `\n🎯 අපේක්ෂිත මුදල: Rs.${fmtC(expectedAmount)}\n⚖️ වෙනස: Rs.${fmtC(variance)}`;
      alert(msg); onClose();
    } catch (err) { alert('❌ ' + err.message); }
    setSaving(false);
  };

  if (!isOpen) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 15 }}>
      <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 660, maxHeight: '95vh', overflowY: 'auto' }}>
        <div style={{ background: `linear-gradient(135deg,${accentClr},${isOpening ? '#10b981' : '#8b5cf6'})`, padding: '20px 24px', borderRadius: '20px 20px 0 0', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 1 }}>
          <div><h2 style={{ margin: 0, fontSize: 22 }}>{icon} {title}</h2><div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>{fmtDate(todayStr())}</div></div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '50%', width: 36, height: 36, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          {!isOpening && (
            <div style={{ background: '#f8fafc', borderRadius: 16, padding: '16px 20px', border: '2px solid #cbd5e1', marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>🎯 අපේක්ශිත මුදල (Expected)</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#1e40af', marginTop: 4 }}>Rs.{fmtC(expectedAmount)}</div>
              </div>
              <div style={{ borderRadius: 10, padding: '8px 12px', textAlign: 'right', background: variance === 0 ? '#eff6ff' : variance > 0 ? '#f0fdf4' : '#fef2f2', border: `1px solid ${variance === 0 ? '#93c5fd' : variance > 0 ? '#86efac' : '#fca5a5'}` }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>⚖️ මුදලේ වෙනස (Discrepancy)</div>
                <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4, color: variance === 0 ? '#2563eb' : variance > 0 ? '#16a34a' : '#dc2626' }}>{variance > 0 ? '+' : ''}Rs.{fmtC(variance)}</div>
              </div>
            </div>
          )}
          <div style={{ background: '#f8fafc', borderRadius: 16, padding: 20, border: '2px solid #e2e8f0', marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>💵 මුදල් ගණනය</h3>
            <DenominationInput denominations={denominations} onChange={setDenominations} disabled={saving} />
          </div>
          {bankAccounts.length > 0 && (
            <div style={{ background: '#eff6ff', borderRadius: 16, padding: 20, border: `2px solid #bfdbfe`, marginBottom: 20 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 16, color: '#1e40af' }}>🏦 බැංකු ශේෂ</h3>
              <div style={{ display: 'grid', gap: 10 }}>
                {bankAccounts.map(acc => {
                  const val = bankBalances[acc.id] || ''; const live = toNum(acc.liveBalance ?? acc.currentBalance ?? 0);
                  return (
                    <div key={acc.id} style={{ background: toNum(val) > 0 ? '#dbeafe' : 'white', border: toNum(val) > 0 ? '2px solid #93c5fd' : '1px solid #e2e8f0', borderRadius: 12, padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>🏦 {acc.bankName}</div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{acc.accountName}</div>
                          <div style={{ marginTop: 6, fontSize: 11 }}>පද්ධති: <b style={{ color: '#2563eb' }}>Rs.{fmtC(live)}</b></div>
                        </div>
                        <div style={{ minWidth: 145 }}>
                          <input type="number" value={val} onChange={e => setBankBalances(p => ({ ...p, [acc.id]: e.target.value }))} onFocus={e => e.target.select()} disabled={saving} placeholder="0.00" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '2px solid #3b82f6', fontSize: 17, fontWeight: 800, textAlign: 'center', boxSizing: 'border-box' }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 12, padding: '10px 14px', background: 'white', borderRadius: 10, display: 'flex', justifyContent: 'space-between', border: '1px solid #bfdbfe' }}>
                <span style={{ fontSize: 13, color: '#1e40af', fontWeight: 700 }}>🏦 බැංකු:</span>
                <span style={{ fontSize: 20, fontWeight: 900, color: '#1e40af' }}>Rs.{fmtC(bankTotal)}</span>
              </div>
            </div>
          )}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 6 }}>📝 සටහන</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} disabled={saving} rows={2} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <div style={{ background: isOpening ? 'linear-gradient(135deg,#ecfdf5,#d1fae5)' : 'linear-gradient(135deg,#f5f3ff,#ede9fe)', borderRadius: 16, padding: 20, border: `2px solid ${isOpening ? '#6ee7b7' : '#c4b5fd'}`, marginBottom: 20 }}>
            <div style={{ textAlign: 'center', marginBottom: 12, fontSize: 14, fontWeight: 700, color: '#64748b' }}>{icon} ඇතුළත් කළ {title}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              {[{ label: '💵 මුදල්', value: cashTotal, color: '#16a34a' }, { label: '🏦 බැංකු', value: bankTotal, color: '#2563eb' }, { label: '📊 එකතුව', value: grandTotal, color: accentClr, big: true }].map(x => (
                <div key={x.label} style={{ background: x.big ? (isOpening ? '#dcfce7' : '#ede9fe') : 'white', padding: 12, borderRadius: 12, textAlign: 'center', border: `1px solid ${x.big ? (isOpening ? '#86efac' : '#c4b5fd') : '#e2e8f0'}` }}>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{x.label}</div>
                  <div style={{ fontSize: x.big ? 22 : 18, fontWeight: 900, color: x.color, marginTop: 4 }}>{fmtC(x.value)}</div>
                </div>
              ))}
            </div>
          </div>
          <button onClick={handleSave} disabled={saving || grandTotal <= 0} style={{ width: '100%', padding: 18, borderRadius: 14, border: 'none', fontSize: 18, fontWeight: 800, color: 'white', cursor: saving || grandTotal <= 0 ? 'not-allowed' : 'pointer', background: saving || grandTotal <= 0 ? '#94a3b8' : `linear-gradient(135deg,${accentClr},${isOpening ? '#10b981' : '#8b5cf6'})` }}>
            {saving ? '⏳...' : `${icon} ${title} සුරකින්න — Rs.${fmtC(grandTotal)}`}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ═══ BANK CASH MODAL ═══ */
const BankCashModal = ({ isOpen, mode, onClose, onSave, bankAccounts, saving }) => {
  const [accountId, setAccountId] = useState(''); const [amount, setAmount] = useState('');
  const [reference, setReference] = useState(''); const [description, setDescription] = useState('');
  useEffect(() => { if (!isOpen) return; setAccountId(''); setAmount(''); setReference(''); setDescription(''); }, [isOpen]);
  if (!isOpen) return null;
  const isDeposit = mode === 'deposit'; const color = isDeposit ? '#059669' : '#2563eb';
  const iconE = isDeposit ? '🏦' : '💵'; const title = isDeposit ? 'මුදල් බැංකුගත කිරීම' : 'බැංකුවෙන් මුදල් ගැනීම';
  const aa = bankAccounts.filter(a => a.isActive !== false); const amt = toNum(amount); const canSave = accountId && amt > 0;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 15 }}>
      <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 520 }}>
        <div style={{ background: `linear-gradient(135deg,${color},${isDeposit ? '#10b981' : '#3b82f6'})`, padding: '20px 24px', borderRadius: '20px 20px 0 0', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>{iconE} {title}</h2>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '50%', width: 36, height: 36, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>🏦 බැංකු ගිණුම *</label>
            <select value={accountId} onChange={e => setAccountId(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, fontWeight: 600, boxSizing: 'border-box' }}>
              <option value="">-- තෝරන්න --</option>
              {aa.map(a => <option key={a.id} value={a.id}>{a.bankName} — {a.accountName} (Rs.{fmtC(a.liveBalance ?? a.currentBalance ?? 0)})</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>💰 මුදල *</label>
            <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={{ width: '100%', padding: '14px', borderRadius: 12, border: `2px solid ${color}`, fontSize: 24, fontWeight: 800, textAlign: 'center', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>📋 යොමු</label><input value={reference} onChange={e => setReference(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} /></div>
            <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>📝 විස්තරය</label><input value={description} onChange={e => setDescription(e.target.value)} placeholder={isDeposit ? 'බැංකුගත කිරීම' : 'ආපසු ගැනීම'} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} /></div>
          </div>
          <button onClick={() => onSave({ accountId, amount: amt, reference, description, mode })} disabled={!canSave || saving} style={{ width: '100%', padding: 16, borderRadius: 14, border: 'none', fontSize: 16, fontWeight: 800, color: 'white', cursor: !canSave || saving ? 'not-allowed' : 'pointer', background: !canSave || saving ? '#94a3b8' : `linear-gradient(135deg,${color},${isDeposit ? '#10b981' : '#3b82f6'})` }}>
            {saving ? '⏳ සකසමින්...' : `${iconE} ${title}`}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ═══ INTER-BANK TRANSFER MODAL ═══ */
const InterBankTransferModal = ({ isOpen, onClose, onSave, bankAccounts, saving }) => {
  const [fromId, setFromId] = useState(''); const [toId, setToId] = useState('');
  const [amount, setAmount] = useState(''); const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  useEffect(() => { if (!isOpen) return; setFromId(''); setToId(''); setAmount(''); setReference(''); setDescription(''); }, [isOpen]);
  if (!isOpen) return null;
  const aa = bankAccounts.filter(a => a.isActive !== false);
  const amt = toNum(amount); const canSave = fromId && toId && fromId !== toId && amt > 0;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 15 }}>
      <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 560 }}>
        <div style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', padding: '20px 24px', borderRadius: '20px 20px 0 0', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>🔄 බැංකු අතර මුදල් මාරු</h2>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '50%', width: 36, height: 36, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📤 සිට *</label>
            <select value={fromId} onChange={e => setFromId(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, fontWeight: 600, boxSizing: 'border-box' }}>
              <option value="">-- තෝරන්න --</option>
              {aa.map(a => <option key={a.id} value={a.id}>{a.bankName} — {a.accountName}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📥 වෙත *</label>
            <select value={toId} onChange={e => setToId(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, fontWeight: 600, boxSizing: 'border-box' }}>
              <option value="">-- තෝරන්න --</option>
              {aa.filter(a => a.id !== fromId).map(a => <option key={a.id} value={a.id}>{a.bankName} — {a.accountName}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>💰 මුදල *</label>
            <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={{ width: '100%', padding: '14px', borderRadius: 12, border: `2px solid #6366f1`, fontSize: 24, fontWeight: 800, textAlign: 'center', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <input value={reference} onChange={e => setReference(e.target.value)} placeholder="යොමු" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} />
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="විස්තරය" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <button onClick={() => onSave({ fromId, toId, amount: amt, reference, description })} disabled={!canSave || saving} style={{ width: '100%', padding: 16, borderRadius: 14, border: 'none', fontSize: 16, fontWeight: 800, color: 'white', cursor: !canSave || saving ? 'not-allowed' : 'pointer', background: !canSave || saving ? '#94a3b8' : 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
            {saving ? '⏳...' : '🔄 මුදල් මාරු කරන්න'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ═══ ADD BANK ACCOUNT MODAL ═══ */
const AddBankAccountModal = ({ isOpen, onClose, user, saving, setSaving }) => {
  const [bankName, setBankName] = useState(''); const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState(''); const [openingBalance, setOpeningBalance] = useState('');
  useEffect(() => { if (!isOpen) return; setBankName(''); setAccountName(''); setAccountNumber(''); setOpeningBalance(''); }, [isOpen]);
  if (!isOpen) return null;
  const handleSave = async () => {
    if (!bankName || !accountName || !accountNumber) return alert('❌ කරුණාකර තරු (*) ලකුණු කළ සියලුම ක්ෂේත්‍ර පුරවන්න.');
    setSaving(true);
    try {
      const initBal = toNum(openingBalance);
      await addDoc(collection(db, `users/${user.uid}/bankAccounts`), { bankName: bankName.trim(), accountName: accountName.trim(), accountNumber: accountNumber.trim(), currentBalance: initBal, liveBalance: initBal, currency: 'LKR', isActive: true, createdAt: serverTimestamp() });
      alert('✅ නව බැංකු ගිණුම සාර්ථකව ඇතුළත් කරන ලදී!'); onClose();
    } catch (err) { alert('❌ ' + err.message); }
    setSaving(false);
  };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 15 }}>
      <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 480 }}>
        <div style={{ background: 'linear-gradient(135deg,#2563eb,#3b82f6)', padding: '20px 24px', borderRadius: '20px 20px 0 0', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>🏦 නව බැංකු ගිණුමක් එකතු කිරීම</h2>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '50%', width: 32, height: 32, fontSize: 16, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <div style={{ marginBottom: 14 }}><label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>බැංකුවේ නම (Bank Name) *</label><input type="text" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="Sampath Bank, BOC" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, boxSizing: 'border-box' }} /></div>
          <div style={{ marginBottom: 14 }}><label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>ගිණුම් හිමියාගේ නම (Account Name) *</label><input type="text" value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="ගිණුමේ නම" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, boxSizing: 'border-box' }} /></div>
          <div style={{ marginBottom: 14 }}><label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>ගිණුම් අංකය (Account Number) *</label><input type="text" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="ගිණුම් අංකය" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, boxSizing: 'border-box' }} /></div>
          <div style={{ marginBottom: 20 }}><label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>ආරම්භක ශේෂය (Opening Balance)</label><input type="number" step="0.01" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} placeholder="0.00" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, boxSizing: 'border-box' }} /></div>
          <button onClick={handleSave} disabled={saving} style={{ width: '100%', padding: 14, border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 800, color: 'white', background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? '⏳...' : '💾 ගිණුම සුරකින්න'}</button>
        </div>
      </div>
    </div>
  );
};

/* ═══ VEHICLE EXPENSE TAB ═══ */
const VEH_INIT = { vehicleId: '', expenseDate: todayStr(), expenseTime: nowHHMM(), expenseType: 'fuel', paymentMethod: 'cash', bankAccountId: '', amount: '', description: '', fuelLitres: '', pricePerLitre: '', kmBefore: '', kmAfter: '', tyreBrand: '', tyrePosition: 'Front-Left', installedDate: todayStr(), installedKm: '', currentKm: '', expectedLifeKm: '', serviceKm: '', nextServiceKm: '' };

const VehicleExpenseTab = ({ user, bankAccounts }) => {
  const [vehicles, setVehicles] = useState([]);
  const [vehicleExpenses, setVehicleExpenses] = useState([]);
  const [open, setOpen] = useState(false); const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(VEH_INIT);
  useEffect(() => {
    if (!user?.uid) return;
    const u1 = onSnapshot(collection(db, `users/${user.uid}/vehicles`), s => setVehicles(s.docs.map(d => ({ id: d.id, ...d.data() }))),
    (error) => {
      console.warn("⚠️ Firestore listener error:", error?.code, error?.message);
      if (error?.code === "resource-exhausted") {
        console.warn("📊 Quota exceeded — offline data පමණක් භාවිතා වේ");
      }
    }
  );
    const u2 = onSnapshot(collection(db, `users/${user.uid}/vehicleExpenses`), s => setVehicleExpenses(s.docs.map(d => ({ id: d.id, ...d.data() }))),
    (error) => {
      console.warn("⚠️ Firestore listener error:", error?.code, error?.message);
      if (error?.code === "resource-exhausted") {
        console.warn("📊 Quota exceeded — offline data පමණක් භාවිතා වේ");
      }
    }
  );
    return () => { u1(); u2(); };
  }, [user]);
  const rows = useMemo(() => [...vehicleExpenses].sort((a, b) => toMs(b.timestamp || b.createdAt) - toMs(a.timestamp || a.createdAt)), [vehicleExpenses]);
  const fs = vehicleFuelStats(form); const ts = vehicleTyreStats(form);
  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const handleSave = async () => {
    if (!form.vehicleId) return alert('❌ වාහනය තෝරන්න');
    const selectedVehicle = vehicles.find(v => v.id === form.vehicleId);
    const meta = getVehMeta(form.expenseType);
    let amount = toNum(form.amount);
    if (form.expenseType === 'fuel' && amount <= 0) amount = fs.amountAuto;
    if (amount <= 0) return alert('❌ මුදල ඇතුළත් කරන්න');
    setSaving(true);
    try {
      const txTs = Timestamp.fromDate(new Date(`${form.expenseDate}T${form.expenseTime || '12:00'}:00`));
      const payload = { ...form, amount, uid: user.uid, vehicleNo: selectedVehicle?.vehicleNo || '', expenseTypeLabel: meta.label, kmDriven: form.expenseType === 'fuel' ? fs.kmDriven : 0, kmPerLitre: form.expenseType === 'fuel' ? fs.kmPerLitre : 0, kmUsed: form.expenseType === 'tyre' ? ts.kmUsed : 0, daysUsed: form.expenseType === 'tyre' ? ts.daysUsed : 0, remainingKm: form.expenseType === 'tyre' ? ts.remainingKm : 0, timestamp: txTs, createdAt: serverTimestamp() };
      const expenseRef = await addDoc(collection(db, `users/${user.uid}/vehicleExpenses`), payload);
      if (form.paymentMethod === 'cash') {
        await addDoc(collection(db, `users/${user.uid}/cashTransactions`), {
          type: 'out', source: 'vehicleExpense',
          category: form.expenseType === 'fuel' ? 'vehicleFuel' : form.expenseType === 'tyre' ? 'vehicleTyre' : form.expenseType === 'service' ? 'vehicleService' : 'vehicleOther',
          amount, expenseId: expenseRef.id, expenseType: form.expenseType, vehicleId: form.vehicleId, vehicleNo: selectedVehicle?.vehicleNo || '', paymentMethod: 'cash',
          description: form.description || `${meta.icon} ${meta.label} - ${selectedVehicle?.vehicleNo || ''}`,
          fuelLitres: form.expenseType === 'fuel' ? toNum(form.fuelLitres) : 0,
          kmDriven: form.expenseType === 'fuel' ? fs.kmDriven : 0, kmPerLitre: form.expenseType === 'fuel' ? fs.kmPerLitre : 0,
          tyrePosition: form.expenseType === 'tyre' ? form.tyrePosition : '', tyreBrand: form.expenseType === 'tyre' ? form.tyreBrand : '',
          kmUsed: form.expenseType === 'tyre' ? ts.kmUsed : 0, daysUsed: form.expenseType === 'tyre' ? ts.daysUsed : 0, remainingKm: form.expenseType === 'tyre' ? ts.remainingKm : 0,
          serviceKm: form.expenseType === 'service' ? toNum(form.serviceKm) : 0, nextServiceKm: form.expenseType === 'service' ? toNum(form.nextServiceKm) : 0,
          date: form.expenseDate, time: form.expenseTime || '12:00', timestamp: txTs, createdAt: serverTimestamp(), uid: user.uid, createdBy: user?.email || '',
        });
      }
      if (form.paymentMethod === 'bank' && form.bankAccountId) {
        await updateDoc(doc(db, `users/${user.uid}/bankAccounts`, form.bankAccountId), { currentBalance: increment(-amount), liveBalance: increment(-amount), updatedAt: serverTimestamp() });
        await addDoc(collection(db, `users/${user.uid}/bankTransactions`), { type: 'expense', source: 'vehicleExpense', category: 'vehicleExpense', accountId: form.bankAccountId, amount, description: form.description || `${meta.icon} ${meta.label}`, date: txTs, createdAt: serverTimestamp() });
      }
      alert('✅ වාහන වියදම සුරකින ලදී'); setOpen(false); setForm(VEH_INIT);
    } catch (err) { alert('❌ ' + err.message); }
    setSaving(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>🚛 වාහන වියදම්</h2>
        <button onClick={() => setOpen(true)} style={{ padding: '12px 16px', border: 'none', borderRadius: 12, fontWeight: 800, cursor: 'pointer', background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: 'white' }}>➕ එකතු කරන්න</button>
      </div>
      {rows.length === 0 ? (
        <div style={{ background: 'white', borderRadius: 14, padding: 40, textAlign: 'center', color: '#94a3b8' }}>වාහන වියදම් නොමැත</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map(r => {
            const m = getVehMeta(r.expenseType);
            return (
              <div key={r.id} style={{ background: 'white', borderRadius: 14, border: `2px solid ${m.border}`, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ background: m.bg, color: m.color, border: `1px solid ${m.border}`, padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 800 }}>{m.icon} {m.label}</span>
                      <span style={{ fontSize: 12, color: '#475569', fontWeight: 700 }}>🚛 {r.vehicleNo || '-'}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>📅 {r.expenseDate}</span>
                    </div>
                    {r.description && <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>📝 {r.description}</div>}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: m.color }}>Rs.{fmtC(r.amount)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 20, overflowY: 'auto' }}>
          <div style={{ background: 'white', width: '100%', maxWidth: 760, borderRadius: 20 }}>
            <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: 'white', display: 'flex', justifyContent: 'space-between', borderRadius: '20px 20px 0 0' }}>
              <h3 style={{ margin: 0 }}>🚛 වාහන වියදම</h3>
              <button onClick={() => setOpen(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
                <select value={form.vehicleId} onChange={e => setField('vehicleId', e.target.value)} style={{ padding: 12, borderRadius: 10, border: '1px solid #cbd5e1' }}>
                  <option value="">-- වාහනය --</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.vehicleNo}</option>)}
                </select>
                <input type="date" value={form.expenseDate} onChange={e => setField('expenseDate', e.target.value)} style={{ padding: 12, borderRadius: 10, border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                <input type="time" value={form.expenseTime} onChange={e => setField('expenseTime', e.target.value)} style={{ padding: 12, borderRadius: 10, border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
                {Object.entries(VEH_META).map(([k, m]) => <button key={k} type="button" onClick={() => setField('expenseType', k)} style={{ padding: '12px 8px', borderRadius: 12, cursor: 'pointer', border: form.expenseType === k ? `2px solid ${m.color}` : '1px solid #e2e8f0', background: form.expenseType === k ? m.bg : 'white', color: form.expenseType === k ? m.color : '#475569', fontWeight: 800 }}>{m.icon} {m.label}</button>)}
              </div>
              {form.expenseType === 'fuel' && (
                <div style={{ background: '#fff7ed', padding: 14, borderRadius: 12, marginBottom: 14, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                  <input type="number" placeholder="ලීටර" value={form.fuelLitres} onChange={e => setField('fuelLitres', e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #fed7aa', boxSizing: 'border-box' }} />
                  <input type="number" placeholder="ලීටර මිල" value={form.pricePerLitre} onChange={e => setField('pricePerLitre', e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #fed7aa', boxSizing: 'border-box' }} />
                  <input type="number" placeholder="KM Before" value={form.kmBefore} onChange={e => setField('kmBefore', e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #fed7aa', boxSizing: 'border-box' }} />
                  <input type="number" placeholder="KM After" value={form.kmAfter} onChange={e => setField('kmAfter', e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #fed7aa', boxSizing: 'border-box' }} />
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: form.paymentMethod === 'bank' ? '1fr 1fr 1fr' : '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <select value={form.paymentMethod} onChange={e => setField('paymentMethod', e.target.value)} style={{ padding: 12, borderRadius: 10, border: '1px solid #cbd5e1' }}>
                  <option value="cash">💵 Cash</option><option value="bank">🏦 Bank</option><option value="credit">📝 Credit</option>
                </select>
                {form.paymentMethod === 'bank' && (
                  <select value={form.bankAccountId} onChange={e => setField('bankAccountId', e.target.value)} style={{ padding: 12, borderRadius: 10, border: '1px solid #cbd5e1' }}>
                    <option value="">-- බැංකුව --</option>
                    {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.bankName}</option>)}
                  </select>
                )}
                <input type="number" placeholder={form.expenseType === 'fuel' ? `Auto: ${fmtC(fs.amountAuto)}` : 'මුදල'} value={form.amount} onChange={e => setField('amount', e.target.value)} style={{ padding: 12, borderRadius: 10, border: '2px solid #ef4444', fontSize: 18, fontWeight: 800, textAlign: 'right', boxSizing: 'border-box' }} />
              </div>
              <textarea placeholder="විස්තරය" value={form.description} onChange={e => setField('description', e.target.value)} rows={2} style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #cbd5e1', boxSizing: 'border-box', marginBottom: 14 }} />
              <button onClick={handleSave} disabled={saving} style={{ width: '100%', padding: 16, border: 'none', borderRadius: 14, fontSize: 17, fontWeight: 900, cursor: 'pointer', background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: 'white' }}>{saving ? '⏳...' : '✅  සුරකින්න'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ═══ DETAIL PANELS ═══ */
const BalanceDetailPanel = ({ tx }) => {
  const isOpening = tx.category === 'openingBalance';
  const snap = Array.isArray(tx.bankSnapshot) ? tx.bankSnapshot : Object.entries(tx.bankBalances || {}).map(([id, info]) => ({ accountId: id, ...info }));
  return (
    <div style={{ marginTop: 10, padding: 14, background: isOpening ? '#ecfdf5' : '#f5f3ff', borderRadius: 12, border: `2px solid ${isOpening ? '#6ee7b7' : '#c4b5fd'}` }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: isOpening ? '#059669' : '#7c3aed', marginBottom: 12 }}>{isOpening ? '🌅' : '🌆'} ශේෂ</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
        {[{ l: '💵', v: toNum(tx.cashAmount), c: '#16a34a' }, { l: '🏦', v: toNum(tx.bankAmount), c: '#2563eb' }, { l: '📊', v: toNum(tx.amount), c: isOpening ? '#059669' : '#7c3aed' }].map(x => (
          <div key={x.l} style={{ background: 'white', padding: '10px 12px', borderRadius: 10, textAlign: 'center', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>{x.l}</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: x.c }}>{fmtC(x.v)}</div>
          </div>
        ))}
      </div>
      {snap.length > 0 && (
        <div style={{ background: 'white', borderRadius: 10, padding: 12 }}>
          {snap.map((row, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < snap.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
              <span>🏦 {row.bankName} - {row.accountName}</span>
              <b style={{ color: '#2563eb' }}>Rs.{fmtC(row.amount)}</b>
            </div>
          ))}
        </div>
      )}
      {tx.notes && <div style={{ marginTop: 8, fontSize: 11, color: '#64748b' }}>📝 {tx.notes}</div>}
    </div>
  );
};

const PurchaseDetailPanel = ({ tx }) => {
  const items = Array.isArray(tx.items) ? tx.items : [];
  const grand = toNum(tx.grandTotal || tx.amount); const paid = toNum(tx.paidAmount || tx.amount);
  const bal = Math.max(0, grand - paid);
  return (
    <div style={{ marginTop: 10, padding: 14, background: '#fff7ed', borderRadius: 12, border: '2px solid #fdba74' }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#d97706', marginBottom: 8 }}>📦 {tx.supplierName || 'Supplier'}</div>
      {tx.invoiceNo && <div style={{ fontSize: 12, color: '#64748b' }}>📄 {tx.invoiceNo}</div>}
      <div style={{ background: 'white', borderRadius: 10, padding: 12, marginTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>සම්පූර්ණ:</span><b>Rs.{fmtC(grand)}</b></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#16a34a' }}><span>ගෙවූ:</span><b>Rs.{fmtC(paid)}</b></div>
        {bal > 0.01 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#dc2626', paddingTop: 4, borderTop: '1px dashed #e2e8f0' }}><span>ඉතිරි:</span><b>Rs.{fmtC(bal)}</b></div>}
      </div>
      {items.length > 0 && <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>📦 භාණ්ඩ ගණන: {items.length}</div>}
    </div>
  );
};

const CustomerCreditPanel = ({ tx }) => {
  const isCredit = isCustomerCredit(tx);
  const ac = isCredit ? '#dc2626' : '#16a34a';
  const bg = isCredit ? '#fef2f2' : '#f0fdf4';
  const bc = isCredit ? '#fca5a5' : '#86efac';
  return (
    <div style={{ marginTop: 10, padding: 14, background: bg, borderRadius: 12, border: `2px solid ${bc}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: ac }}>{isCredit ? '👤 පාරිභෝගික ණය ලබාදීම' : '💵 පාරිභෝගික ගෙවීම් ලැබීම'}</div>
          {tx.customerName && <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginTop: 4 }}>👤 {tx.customerName}</div>}
          {tx.customerPhone && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>📞 {tx.customerPhone}</div>}
        </div>
        {tx.paymentMethod && <div style={{ fontSize: 11, background: '#f1f5f9', padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}>
          {{ cash: '💵 Cash', bank: '🏦 Bank', card: '💳 Card', cheque: '🧾 Cheque', online: '📱 Online', credit: '📝 Credit' }[tx.paymentMethod] || tx.paymentMethod}
        </div>}
      </div>
      <div style={{ background: 'white', borderRadius: 10, padding: 14, textAlign: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{isCredit ? 'ලබාදුන් ණය මුදල' : 'ලැබුණු මුදල'}</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: ac }}>{isCredit ? '-' : '+'}Rs.{fmtC(tx.amount)}</div>
      </div>
      {(tx.notes || tx.note) && <div style={{ padding: '8px 10px', background: 'white', borderRadius: 6, fontSize: 11, color: '#64748b', border: '1px solid #e2e8f0' }}>📝 {tx.notes || tx.note}</div>}
    </div>
  );
};

const BankMovementPanel = ({ tx }) => {
  const isDeposit = isBankDeposit(tx); const ac = isDeposit ? '#059669' : '#2563eb';
  const bg = isDeposit ? '#f0fdf4' : '#eff6ff';
  return (
    <div style={{ marginTop: 10, padding: 14, background: bg, borderRadius: 12, border: `2px solid ${isDeposit ? '#86efac' : '#93c5fd'}` }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: ac, marginBottom: 8 }}>{isDeposit ? '🏦 මුදල් බැංකුගත' : '💵 බැංකුවෙන් ගැනීම'}</div>
      <div style={{ background: 'white', borderRadius: 10, padding: 14, textAlign: 'center' }}>
        <div style={{ fontSize: 26, fontWeight: 900, color: ac }}>{isDeposit ? '−' : '+'}Rs.{fmtC(tx.amount)}</div>
      </div>
      {tx.description && <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>📝 {tx.description}</div>}
    </div>
  );
};

const BankTransferPanel = ({ tx }) => (
  <div style={{ marginTop: 10, padding: 14, background: '#f5f3ff', borderRadius: 12, border: '2px solid #c4b5fd' }}>
    <div style={{ fontSize: 14, fontWeight: 800, color: '#6366f1', marginBottom: 8 }}>🔄 බැංකු අතර මාරු</div>
    <div style={{ background: 'white', borderRadius: 10, padding: 12, display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center', textAlign: 'center' }}>
      <div><div style={{ fontSize: 11, color: '#64748b' }}>{tx.fromBankName}</div><div style={{ fontSize: 16, fontWeight: 900, color: '#dc2626' }}>-Rs.{fmtC(tx.amount)}</div></div>
      <div style={{ fontSize: 24, color: '#6366f1' }}>→</div>
      <div><div style={{ fontSize: 11, color: '#64748b' }}>{tx.toBankName}</div><div style={{ fontSize: 16, fontWeight: 900, color: '#16a34a' }}>+Rs.{fmtC(tx.amount)}</div></div>
    </div>
  </div>
);

const ProductionDetailPanel = ({ tx }) => {
  const isIncome = tx.type === 'in'; 
  const ac = isIncome ? '#059669' : '#dc2626';
  const bg = isIncome ? '#f0fdf4' : '#fef2f2';
  const bc = isIncome ? '#86efac' : '#fecaca';

  return (
    <div style={{ marginTop: 10, padding: 14, background: bg, borderRadius: 12, border: `2px solid ${bc}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: ac }}>
            {tx.businessIcon || '🏭'} {tx.businessName || 'නිෂ්පාදන/සේවා'} {isIncome ? '(ලැබීම)' : '(වියදම)'}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Batch No: <b>#{tx.batchNumber || '—'}</b></div>
          {tx.customerName && <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginTop: 6 }}>👤 {tx.customerName}</div>}
          {tx.vehicleNo && <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>🚛 වාහන අංකය: <b>{tx.vehicleNo}</b></div>}
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: ac, textAlign: 'right' }}>
          {isIncome ? '+' : '−'}Rs.{fmtC(tx.amount)}
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginTop: 4 }}>ගෙවීම් ක්‍රමය: {tx.paymentMethod === 'cash' ? '💵 Cash' : '🏦 Bank'}</div>
        </div>
      </div>
      {tx.notes && <div style={{ marginTop: 8, fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>📝 සටහන: {tx.notes}</div>}
    </div>
  );
};

const BankLoanRepaymentDetailPanel = ({ tx }) => (
  <div style={{ marginTop: 10, padding: 14, background: '#fef2f2', borderRadius: 12, border: '2px solid #fca5a5' }}>
    <div style={{ fontSize: 14, fontWeight: 800, color: '#dc2626', marginBottom: 8 }}>🏦 බැංකු ණය වාරික ගෙවීම (Repayment)</div>
    <div style={{ background: 'white', borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}><span>මූල්‍ය ආයතනය:</span><b>{tx.institutionName || 'Unknown'}</b></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}><span>ගෙවීමේ ක්‍රමය:</span><b>{tx.paymentMethod === 'cash' ? '💵 Cash' : '🏦 Bank'}</b></div>
      {tx.bankName && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}><span>ගිණුම:</span><b>{tx.bankName} {tx.bankAccountName ? `(${tx.bankAccountName})` : ''}</b></div>}
      {tx.referenceNo && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>යොමු අංකය (Ref):</span><b>{tx.referenceNo}</b></div>}
    </div>
    {tx.notes && <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>📝 සටහන්: {tx.notes}</div>}
  </div>
);

const ChitFundDetailPanel = ({ tx }) => {
  const isPayment = tx.category === 'chitFundPayment';
  const clr = isPayment ? '#dc2626' : '#16a34a';
  const bg = isPayment ? '#fef2f2' : '#f0fdf4';
  const bc = isPayment ? '#fca5a5' : '#86efac';
  return (
    <div style={{ marginTop: 10, padding: 14, background: bg, borderRadius: 12, border: `2px solid ${bc}` }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: clr, marginBottom: 8 }}>
        {isPayment ? '🎫 සීට්ටු / සමිති වාරික ගෙවීම (Payment OUT)' : '💰 සීට්ටු ලැබීම / සමිති මුදල් ලැබීම (Receipt IN)'}
      </div>
      <div style={{ background: 'white', borderRadius: 10, padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}><span>සමිතිය/සීට්ටුව:</span><b>{tx.fundName || 'Unknown'}</b></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}><span>ගනුදෙනු ක්‍රමය:</span><b>{tx.paymentMethod === 'cash' ? '💵 Cash' : '🏦 Bank'}</b></div>
        {tx.referenceNo && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}><span>යොමු අංකය:</span><b>{tx.referenceNo}</b></div>}
        {tx.description && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>විස්තරය:</span><b>{tx.description}</b></div>}
      </div>
    </div>
  );
};

const CashTxProfitPanel = ({ tx }) => {
  const items = tx.invoiceItems || tx.items || [];
  const profit = getCashTxProfit(tx) || (items.length ? calcInvoiceProfit(items) : null);
  if (!profit) return null;
  const pmClr = v => v >= 0 ? '#059669' : '#dc2626';
  return (
    <div style={{ marginTop: 10, padding: 14, background: '#f0fdf4', borderRadius: 12, border: '2px solid #86efac' }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#059669', marginBottom: 10 }}>📊 ලාභ විශ්ලේෂණය</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        {[{ label: '📈 Revenue', value: profit.totalRevenue, color: '#2563eb' }, { label: '💸 Cost', value: profit.totalCost, color: '#dc2626' }, { label: '💰 ලාභය', value: profit.totalProfit, color: pmClr(profit.totalProfit) }].map(x => (
          <div key={x.label} style={{ background: 'white', padding: '10px 12px', borderRadius: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>{x.label}</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: x.color, marginTop: 3 }}>Rs.{fmtC(x.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════
   MAIN CONTAINER COMPONENT
   ═══════════════════════════════════════ */
export default function CashManagement() {
  const { user } = useUserAuth();
  const [activeTab, setActiveTab] = useState('register');
  const [cashTxs, setCashTxs] = useState([]);
  const [customerTxs, setCustomerTxs] = useState([]);
  const [productionEntries, setProductionEntries] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const [expandedTx, setExpandedTx] = useState(null);
  const [balanceModal, setBalanceModal] = useState({ isOpen: false, type: 'opening' });
  const [bankCashModal, setBankCashModal] = useState({ isOpen: false, mode: 'deposit' });
  const [transferModal, setTransferModal] = useState(false);
  const [manualTxModal, setManualTxModal] = useState(false);
  const [addBankModal, setAddBankModal] = useState(false);
  const [manualForm, setManualForm] = useState({ type: 'out', category: 'other', amount: '', description: '', paymentMethod: 'cash', bankAccountId: '' });
  const [saving, setSaving] = useState(false);

  // Firestore Listeners
  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);

    const unsubCash = onSnapshot(query(collection(db, `users/${user.uid}/cashTransactions`)), (snap) => {
      setCashTxs(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false);
    }, () => setLoading(false));

    const unsubCust = onSnapshot(query(collection(db, 'customerTransactions'), where('uid', '==', user.uid)), (snap) => {
      setCustomerTxs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    },
    (error) => {
      console.warn("⚠️ Firestore listener error:", error?.code, error?.message);
      if (error?.code === "resource-exhausted") {
        console.warn("📊 Quota exceeded — offline data පමණක් භාවිතා වේ");
      }
    }
  );

    const unsubBanks = onSnapshot(query(collection(db, `users/${user.uid}/bankAccounts`)), (snap) => {
      setBankAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    },
    (error) => {
      console.warn("⚠️ Firestore listener error:", error?.code, error?.message);
      if (error?.code === "resource-exhausted") {
        console.warn("📊 Quota exceeded — offline data පමණක් භාවිතා වේ");
      }
    }
  );

    const unsubPurch = onSnapshot(query(collection(db, `users/${user.uid}/purchases`)), (snap) => {
      setPurchases(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    },
    (error) => {
      console.warn("⚠️ Firestore listener error:", error?.code, error?.message);
      if (error?.code === "resource-exhausted") {
        console.warn("📊 Quota exceeded — offline data පමණක් භාවිතා වේ");
      }
    }
  );

    const unsubProd = onSnapshot(query(collection(db, 'productionEntries'), where('uid', '==', user.uid)), (snap) => {
      setProductionEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    },
    (error) => {
      console.warn("⚠️ Firestore listener error:", error?.code, error?.message);
      if (error?.code === "resource-exhausted") {
        console.warn("📊 Quota exceeded — offline data පමණක් භාවිතා වේ");
      }
    }
  );

    return () => { unsubCash(); unsubCust(); unsubBanks(); unsubPurch(); unsubProd(); };
  }, [user]);

  const currentSession = useMemo(() => {
    const openings = cashTxs.filter(tx => isOpeningTx(tx)).sort((a, b) => resolveMs(b) - resolveMs(a));
    const latest = openings[0];
    if (!latest) return { exists: false, startMs: 0, openingAmount: 0, openingDate: '', openingTime: '' };
    return { exists: true, startMs: resolveMs(latest), openingAmount: toNum(latest.amount), openingCash: toNum(latest.cashAmount), openingBank: toNum(latest.bankAmount), openingDate: getDisplayDate(latest), openingTime: getDisplayTime(latest), txId: latest.id };
  }, [cashTxs]);

  const mergedTransactions = useMemo(() => {
    const all = [...cashTxs];
    const trackedCustTxnIds = new Set(); const trackedProdIds = new Set(); const trackedBatches = new Set();

    cashTxs.forEach(tx => {
      if (tx.customerTxnId) trackedCustTxnIds.add(tx.customerTxnId);
      if (tx.linkedCustTxnId) trackedCustTxnIds.add(tx.linkedCustTxnId);
      if (tx.entryId) trackedProdIds.add(tx.entryId);
      if (tx.expenseId) trackedProdIds.add(tx.expenseId);
      if (tx.batchNumber) trackedBatches.add(tx.batchNumber);
      if (isCustomerPayment(tx) || isCustomerCredit(tx)) trackedCustTxnIds.add(`${tx.customerId}_${tx.amount}_${tx.date}`);
    });

    customerTxs.forEach(ct => {
      const fingerprint = `${ct.customerId}_${ct.amount}_${ct.date}`;
      if (trackedCustTxnIds.has(ct.id) || trackedCustTxnIds.has(fingerprint)) return;
      const normType = String(ct.type || '').trim().toLowerCase();
      const isPay = normType === 'payment' || normType === 'in';
      all.push({
        id: ct.id, customerTxnId: ct.id, type: isPay ? 'in' : 'out', source: isPay ? 'invoicePayment' : 'customerCredit', category: isPay ? 'invoicePayment' : 'customerCredit', amount: toNum(ct.amount),
        description: isPay ? `💵 පාරිභෝගික ගෙවීම් ලැබීම [${ct.customerName || 'Customer'}]` : `👤 පාරිභෝගික ණය ලබාදීම [${ct.customerName || 'Customer'}]`,
        paymentMethod: ct.method || ct.paymentMethod || 'cash', customerId: ct.customerId, customerName: ct.customerName || '', customerPhone: ct.customerPhone || '', notes: ct.note || ct.notes || '', date: ct.date || '', time: ct.time || '', timestamp: resolveMs(ct), createdAt: ct.createdAt,
      });
    });

    productionEntries.forEach(pe => {
      if (trackedProdIds.has(pe.id)) return;
      if (pe.batchNumber && trackedBatches.has(pe.batchNumber)) return;
      const ts = resolveMs(pe);
      if (!pe.isStandaloneExpense) {
        const paidAmt = toNum(pe.totalPaid || pe.grandTotal);
        if (paidAmt > 0) {
          all.push({ id: pe.id + '_inc', entryId: pe.id, type: 'in', source: pe.businessType || 'production', category: 'productionSales', amount: paidAmt, description: `🏭 නිෂ්පාදන ලැබීම [${pe.businessName || 'නිෂ්පාදන'}]`, paymentMethod: pe.paymentMethod || 'cash', customerName: pe.customerName || '', customerPhone: pe.customerPhone || '', vehicleNo: pe.vehicleNumber || '', notes: pe.remark || '', date: pe.date || '', time: pe.time || '', timestamp: ts, createdAt: pe.createdAt, batchNumber: pe.batchNumber, outputs: pe.outputs || [], harvests: pe.harvests || [], serviceItems: pe.serviceItems || [], partsUsed: pe.partsUsed || [] });
        }
      }
      if (pe.isStandaloneExpense || (Array.isArray(pe.expenseItems) && pe.expenseItems.length > 0)) {
        const costAmt = toNum(pe.totalCost || pe.amount);
        if (costAmt > 0) {
          all.push({ id: pe.id + '_exp', expenseId: pe.id, type: 'out', source: pe.businessType || 'production', category: 'productionExpense', amount: costAmt, description: `📉 නිෂ්පාදන වියදම [${pe.businessName || 'නිෂ්පාදන'}]`, paymentMethod: pe.paymentMethod || 'cash', notes: pe.remark || pe.description || '', date: pe.date || '', time: pe.time || '', timestamp: ts, createdAt: pe.createdAt, batchNumber: pe.batchNumber, expenseItems: pe.expenseItems || [] });
        }
      }
    });

    const cashTxIds = new Set(cashTxs.map(tx => tx.purchaseId).filter(Boolean));
    purchases.forEach(p => {
      if (p.id && !cashTxIds.has(p.id)) {
        all.push({ id: p.id, _isPurchDoc: true, source: 'purchase', type: 'out', category: 'supplierPayment', amount: toNum(p.paidAmount || p.grandTotal), grandTotal: toNum(p.grandTotal), paidAmount: toNum(p.paidAmount), supplierName: p.supplierName || 'Supplier', invoiceNo: p.invoiceNo || '', items: p.items || [], paymentMethod: p.paymentMethod || 'cash', date: p.purchaseDate || p.date || '', timestamp: p.timestamp || p.createdAt });
      }
    });

    return all.sort((a, b) => resolveMs(b) - resolveMs(a));
  }, [cashTxs, customerTxs, purchases, productionEntries]);

  const cashBalance = useMemo(() => {
    let sum = 0;
    const trackedCustTxnIds = new Set(); const trackedProdIds = new Set(); const trackedBatches = new Set();
    
    cashTxs.forEach(tx => {
      if (tx.customerTxnId) trackedCustTxnIds.add(tx.customerTxnId);
      if (tx.entryId) trackedProdIds.add(tx.entryId);
      if (tx.expenseId) trackedProdIds.add(tx.expenseId);
      if (tx.batchNumber) trackedBatches.add(tx.batchNumber);

      if (tx.paymentMethod === 'cash' || !tx.paymentMethod) {
        const amt = toNum(tx.amount);
        if (tx.type === 'in') sum += amt; else if (tx.type === 'out') sum -= amt;
      }
    });

    customerTxs.forEach(ct => {
      if (trackedCustTxnIds.has(ct.id)) return;
      if ((ct.method || ct.paymentMethod || 'cash') === 'cash') {
        const amt = toNum(ct.amount);
        if (String(ct.type || '').trim().toLowerCase() === 'payment') sum += amt; else sum -= amt;
      }
    });

    productionEntries.forEach(pe => {
      if (trackedProdIds.has(pe.id)) return;
      if (pe.batchNumber && trackedBatches.has(pe.batchNumber)) return;
      if (pe.paymentMethod === 'cash') {
        if (!pe.isStandaloneExpense) sum += toNum(pe.totalPaid || pe.grandTotal);
        if (pe.isStandaloneExpense || (Array.isArray(pe.expenseItems) && pe.expenseItems.length > 0)) sum -= toNum(pe.totalCost);
      }
    });

    return sum;
  }, [cashTxs, customerTxs, productionEntries]);

  const bankBalanceSum = useMemo(() => bankAccounts.reduce((s, a) => s + toNum(a.liveBalance ?? a.currentBalance ?? 0), 0), [bankAccounts]);

  const sessionMetrics = useMemo(() => {
    if (!currentSession.exists) return { totalIn: 0, totalOut: 0, net: 0, txCount: 0 };
    let totalIn = 0, totalOut = 0, txCount = 0;
    mergedTransactions.forEach(tx => {
      const ms = resolveMs(tx);
      if (ms < currentSession.startMs) return;
      if (isBalanceTx(tx) || isAnyBankTx(tx)) return;
      const amt = toNum(tx.amount);
      if (tx.type === 'in') { totalIn += amt; txCount++; }
      else if (tx.type === 'out') { totalOut += amt; txCount++; }
    });
    return { totalIn, totalOut, net: totalIn - totalOut, txCount };
  }, [mergedTransactions, currentSession]);

  // ★ EXPLICIT EQUATION VARIABLES ★
  const sessionOpeningAmount = useMemo(() => currentSession.exists ? currentSession.openingAmount : 0, [currentSession]);
  const sessionTotalIn = useMemo(() => sessionMetrics.totalIn, [sessionMetrics]);
  const sessionTotalOut = useMemo(() => sessionMetrics.totalOut, [sessionMetrics]);
  const expectedAmount = useMemo(() => sessionOpeningAmount + sessionTotalIn - sessionTotalOut, [sessionOpeningAmount, sessionTotalIn, sessionTotalOut]);

  const getFilterRange = (filter) => {
    if (filter === 'currentSession') {
      return { start: currentSession.exists ? currentSession.startMs : rangeStart('today'), end: Date.now() + 86400000 };
    }
    return { start: rangeStart(filter), end: rangeEnd(filter) };
  };

  const filteredTransactions = useMemo(() => {
    const { start: sTime, end: eTime } = getFilterRange(dateFilter);
    const q = searchQuery.toLowerCase().trim();
    return mergedTransactions.filter(tx => {
      if (dateFilter !== 'allTime') {
        const ms = resolveMs(tx);
        if (ms > 0 && (ms < sTime || ms >= eTime)) return false;
      }
      if (filterType === 'in' && tx.type !== 'in') return false;
      if (filterType === 'out' && tx.type !== 'out') return false;
      if (filterType === 'sales' && !isSalesTx(tx)) return false;
      if (filterType === 'purchase' && !isPurch(tx)) return false;
      if (filterType === 'customer' && !isCustomerCredit(tx) && !isCustomerPayment(tx)) return false;
      if (filterType === 'bank' && !isAnyBankTx(tx)) return false;
      if (filterType === 'vehicle' && !isVehicleExpense(tx)) return false;
      if (filterType === 'production' && !isProductionTx(tx)) return false;
      if (filterType === 'loans' && tx.category !== 'bankLoanRepayment') return false;
      if (filterType === 'chitfunds' && tx.category !== 'chitFundPayment' && tx.category !== 'chitFundReceipt') return false;

      if (q) {
        const hay = [tx.description, tx.notes, tx.note, tx.supplierName, tx.customerName, tx.fundName, tx.institutionName, tx.category, catLabel(tx.category)].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [mergedTransactions, filterType, dateFilter, searchQuery, currentSession]);

  const handleBankCashSave = async ({ accountId, amount, reference, description, mode }) => {
    if (!user?.uid || !accountId || amount <= 0) return;
    setSaving(true);
    try {
      const isDeposit = mode === 'deposit'; const changeAmount = isDeposit ? amount : -amount;
      const ts = Timestamp.now(); const batch = writeBatch(db);
      batch.set(doc(collection(db, `users/${user.uid}/bankTransactions`)), { type: isDeposit ? 'deposit' : 'withdraw', source: isDeposit ? 'bankDeposit' : 'bankWithdraw', category: isDeposit ? 'bankDeposit' : 'bankWithdraw', accountId, amount, reference: reference || '', description: description || (isDeposit ? 'මුදල් තැන්පතුව' : 'ආපසු ගැනීම්'), date: ts, createdAt: serverTimestamp() });
      batch.set(doc(collection(db, `users/${user.uid}/cashTransactions`)), { type: isDeposit ? 'out' : 'in', source: isDeposit ? 'bankDeposit' : 'bankWithdraw', category: isDeposit ? 'bankDeposit' : 'bankWithdraw', amount, bankAccountId: accountId, reference: reference || '', description: description || (isDeposit ? '🏦 බැංකුගත කිරීම' : '💵 බැංකුවෙන් ගැනීම්'), paymentMethod: 'cash', date: todayStr(), time: nowHHMM(), timestamp: ts, createdAt: serverTimestamp(), createdBy: user?.email || '', uid: user.uid });
      batch.update(doc(db, `users/${user.uid}/bankAccounts`, accountId), { currentBalance: increment(changeAmount), liveBalance: increment(changeAmount), updatedAt: serverTimestamp() });
      await batch.commit();
      alert('✅ සාර්ථකයි!'); setBankCashModal({ isOpen: false, mode: 'deposit' });
    } catch (err) { alert('❌ ' + err.message); }
    setSaving(false);
  };

  const handleInterBankTransferSave = async ({ fromId, toId, amount, reference, description }) => {
    if (!user?.uid || !fromId || !toId || amount <= 0) return;
    setSaving(true);
    try {
      const ts = Timestamp.now(); const batch = writeBatch(db);
      const fromAcc = bankAccounts.find(a => a.id === fromId); const toAcc = bankAccounts.find(a => a.id === toId);
      batch.set(doc(collection(db, `users/${user.uid}/bankTransactions`)), { type: 'transfer', source: 'bankTransfer', category: 'bankTransfer', accountId: fromId, amount, reference: reference || '', description: description || `-> ${toAcc?.bankName}`, date: ts, createdAt: serverTimestamp() });
      batch.set(doc(collection(db, `users/${user.uid}/bankTransactions`)), { type: 'transfer', source: 'bankTransfer', category: 'bankTransfer', accountId: toId, amount, reference: reference || '', description: description || `<- ${fromAcc?.bankName}`, date: ts, createdAt: serverTimestamp() });
      batch.set(doc(collection(db, `users/${user.uid}/cashTransactions`)), { type: 'out', source: 'bankTransfer', category: 'bankTransfer', amount, fromBankAccountId: fromId, fromBankName: fromAcc?.bankName || '', toBankAccountId: toId, toBankName: toAcc?.bankName || '', reference: reference || '', description: description || `🔄 ${fromAcc?.bankName} -> ${toAcc?.bankName}`, paymentMethod: 'bank', date: todayStr(), time: nowHHMM(), timestamp: ts, createdAt: serverTimestamp(), uid: user.uid });
      batch.update(doc(db, `users/${user.uid}/bankAccounts`, fromId), { currentBalance: increment(-amount), liveBalance: increment(-amount), updatedAt: serverTimestamp() });
      batch.update(doc(db, `users/${user.uid}/bankAccounts`, toId), { currentBalance: increment(amount), liveBalance: increment(amount), updatedAt: serverTimestamp() });
      await batch.commit();
      alert('✅ මාරු කිරීම සාර්ථකයි!'); setTransferModal(false);
    } catch (err) { alert('❌ ' + err.message); }
    setSaving(false);
  };

  const handleManualTxSave = async () => {
    const amt = toNum(manualForm.amount);
    if (amt <= 0) return alert('❌ වලංගු මුදලක් ඇතුළත් කරන්න.');
    if (manualForm.paymentMethod === 'bank' && !manualForm.bankAccountId) return alert('❌ බැංකු ගිණුම තෝරන්න.');
    setSaving(true);
    try {
      const ts = Timestamp.now(); const batch = writeBatch(db);
      const isOut = manualForm.type === 'out'; const changeAmount = isOut ? -amt : amt;
      batch.set(doc(collection(db, `users/${user.uid}/cashTransactions`)), { type: manualForm.type, source: 'manual', category: manualForm.category, amount: amt, paymentMethod: manualForm.paymentMethod, bankAccountId: manualForm.paymentMethod === 'bank' ? manualForm.bankAccountId : '', description: manualForm.description || `අතින් ඇතුළත් කළ`, date: todayStr(), time: nowHHMM(), timestamp: ts, createdAt: serverTimestamp(), uid: user.uid });
      if (manualForm.paymentMethod === 'bank' && manualForm.bankAccountId) {
        batch.set(doc(collection(db, `users/${user.uid}/bankTransactions`)), { type: isOut ? 'expense' : 'income', source: 'manual', category: manualForm.category, accountId: manualForm.bankAccountId, amount: amt, description: manualForm.description || `අතින්`, date: ts, createdAt: serverTimestamp() });
        batch.update(doc(db, `users/${user.uid}/bankAccounts`, manualForm.bankAccountId), { currentBalance: increment(changeAmount), liveBalance: increment(changeAmount), updatedAt: serverTimestamp() });
      }
      await batch.commit();
      alert('✅ සාර්ථකයි!'); setManualTxModal(false);
      setManualForm({ type: 'out', category: 'other', amount: '', description: '', paymentMethod: 'cash', bankAccountId: '' });
    } catch (err) { alert('❌ ' + err.message); }
    setSaving(false);
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px', fontFamily: 'sans-serif', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: '#0f172a' }}>📊 Cash & Bank Register</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b', fontWeight: 600 }}>මූල්‍ය ප්‍රවාහ කළමනාකරණය</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setBalanceModal({ isOpen: true, type: 'opening' })} style={{ padding: '10px 14px', background: 'linear-gradient(135deg,#059669,#10b981)', color: 'white', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>🌅 ආරම්භක ශේෂය</button>
          <button onClick={() => setBalanceModal({ isOpen: true, type: 'closing' })} style={{ padding: '10px 14px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>🌆 අවසාන ශේෂය</button>
        </div>
      </div>

      {currentSession.exists && (
        <div style={{ background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)', border: '2px solid #6ee7b7', borderRadius: 14, padding: '14px 18px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#166534' }}>වත්මන් සැසිය</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#065f46' }}>📅 {fmtDate(currentSession.openingDate)} · {sessionMetrics.txCount} ගනුදෙනු</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ background: 'white', padding: '8px 14px', borderRadius: 10, textAlign: 'center' }}><div style={{ fontSize: 10 }}>ආරම්භක</div><div style={{ fontWeight: 900, color: '#059669' }}>Rs.{fmtC(currentSession.openingAmount)}</div></div>
            <div style={{ background: '#dcfce7', padding: '8px 14px', borderRadius: 10, textAlign: 'center' }}><div style={{ fontSize: 10 }}>💰 ලැබීම්</div><div style={{ fontWeight: 900, color: '#16a34a' }}>Rs.{fmtC(sessionMetrics.totalIn)}</div></div>
            <div style={{ background: '#fee2e2', padding: '8px 14px', borderRadius: 10, textAlign: 'center' }}><div style={{ fontSize: 10 }}>💸 වියදම්</div><div style={{ fontWeight: 900, color: '#991b1b' }}>Rs.{fmtC(sessionMetrics.totalOut)}</div></div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: 'linear-gradient(135deg, #0f766e, #14b8a6)', color: 'white', borderRadius: 16, padding: 20 }}>
          <div style={{ fontSize: 12, opacity: 0.85 }}>💵 CASH BALANCE</div>
          <div style={{ fontSize: 30, fontWeight: 900, marginTop: 8 }}>Rs.{fmtC(cashBalance)}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #1e40af, #3b82f6)', color: 'white', borderRadius: 16, padding: 20 }}>
          <div style={{ fontSize: 12, opacity: 0.85 }}>🏦 BANK TOTAL</div>
          <div style={{ fontSize: 30, fontWeight: 900, marginTop: 8 }}>Rs.{fmtC(bankBalanceSum)}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #1e293b, #475569)', color: 'white', borderRadius: 16, padding: 20 }}>
          <div style={{ fontSize: 12, opacity: 0.85 }}>📊 TOTAL LIQUID</div>
          <div style={{ fontSize: 30, fontWeight: 900, marginTop: 8 }}>Rs.{fmtC(cashBalance + bankBalanceSum)}</div>
        </div>
      </div>

      {/* 🧮 DYNAMIC RECONCILIATION EQUATION WIDGET */}
      <div style={{ background: '#ffffff', border: '2px solid #e2e8f0', borderRadius: 16, padding: '20px', marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#334155', marginBottom: 14 }}>🧮 වත්මන් සැසියේ මුදල් ගැලපීම (Session Expected Reconciliation)</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ flex: '1 1 180px', background: '#f8fafc', padding: '14px', borderRadius: 12, border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>🌅 ආරම්භක ශේෂය</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#0f766e' }}>Rs.{fmtC(sessionOpeningAmount)}</div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#94a3b8' }}>+</div>
          <div style={{ flex: '1 1 180px', background: '#f0fdf4', padding: '14px', borderRadius: 12, border: '1px solid #bbf7d0', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#166534', fontWeight: 700, marginBottom: 4 }}>💰 සියලු ලැබීම් (+)</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#16a34a' }}>Rs.{fmtC(sessionTotalIn)}</div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#94a3b8' }}>-</div>
          <div style={{ flex: '1 1 180px', background: '#fef2f2', padding: '14px', borderRadius: 12, border: '1px solid #fecaca', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#991b1b', fontWeight: 700, marginBottom: 4 }}>💸 සියලු වියදම් (-)</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#dc2626' }}>Rs.{fmtC(sessionTotalOut)}</div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#94a3b8' }}>=</div>
          <div style={{ flex: '1 1 200px', background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', padding: '14px', borderRadius: 12, border: '2px solid #3b82f6', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 800, marginBottom: 4 }}>🎯 අපේක්ශිත මුදල</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#2563eb' }}>Rs.{fmtC(expectedAmount)}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24, padding: 14, background: '#f8fafc', borderRadius: 12 }}>
        <button onClick={() => setManualTxModal(true)} style={{ padding: '10px 16px', background: '#475569', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>✍️ Manual TX</button>
        <button onClick={() => setBankCashModal({ isOpen: true, mode: 'deposit' })} style={{ padding: '10px 16px', background: '#059669', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>🏦 Deposit</button>
        <button onClick={() => setBankCashModal({ isOpen: true, mode: 'withdraw' })} style={{ padding: '10px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>💵 Withdraw</button>
        <button onClick={() => setTransferModal(true)} style={{ padding: '10px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>🔄 Transfer</button>
      </div>

      <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: 20 }}>
        {[{ id: 'register', label: '📝 Register Log' }, { id: 'banks', label: '🏦 Banks' }, { id: 'vehicles', label: '🚛 Vehicles' }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '12px 20px', background: 'none', border: 'none', borderBottom: activeTab === tab.id ? '3px solid #3b82f6' : '3px solid transparent', color: activeTab === tab.id ? '#3b82f6' : '#64748b', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>{tab.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>⏳ පූරණය වෙමින්...</div>
      ) : activeTab === 'register' ? (
        <div>
          <div style={{ background: '#f1f5f9', padding: 16, borderRadius: 12, marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="text" placeholder="සොයන්න..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }} />
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', fontWeight: 600 }}>
              <option value="all">සියලු වර්ග</option>
              <option value="in">💰 ලැබීම්</option>
              <option value="out">💸 වියදම්</option>
              <option value="loans">🏦 බැංකු ණය (Loans)</option>
              <option value="chitfunds">🎫 සීට්ටු / සමිති</option>
              <option value="customer">👤 පාරිභෝගික</option>
              <option value="sales">🧾 විකුණුම්</option>
              <option value="purchase">📦 මිලදී ගැනීම්</option>
              <option value="bank">🏦 බැංකු ගනුදෙනු</option>
              <option value="vehicle">🚛 වාහන</option>
              <option value="production">🏭 නිෂ්පාදන</option>
            </select>
            <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', fontWeight: 700 }}>
              <option value="today">📅 අද</option>
              <option value="currentSession">⭐ වත්මන් සැසිය</option>
              <option value="yesterday">📅 ඊයේ</option>
              <option value="thisWeek">📆 මේ සතියේ</option>
              <option value="thisMonth">🗓️ මේ මාසයේ</option>
              <option value="allTime">🌐 සමස්තය</option>
            </select>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {filteredTransactions.map(tx => {
              const cfg = srcCfg(tx); const isExp = expandedTx === tx.id;
              const pmIcon = tx.paymentMethod === 'cash' ? '💵' : tx.paymentMethod === 'bank' ? '🏦' : tx.paymentMethod === 'card' ? '💳' : tx.paymentMethod === 'cheque' ? '🧾' : '📝';
              return (
                <div key={tx.id} style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', borderLeft: `6px solid ${tx.type === 'in' ? '#10b981' : '#ef4444'}`, overflow: 'hidden' }}>
                  <div onClick={() => setExpandedTx(isExp ? null : tx.id)} style={{ padding: 14, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 22, width: 42, height: 42, background: '#f1f5f9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{cfg.icon}</div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description || catLabel(tx.category)}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                          <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, color: '#475569' }}>{cfg.si}</span>
                          <span style={{ fontSize: 11, color: '#64748b' }}>📅 {getDisplayDate(tx)} {getDisplayTime(tx) && `@ ${getDisplayTime(tx)}`}</span>
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>{pmIcon}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: tx.type === 'in' ? '#10b981' : '#ef4444', marginLeft: 10, flexShrink: 0 }}>
                      {tx.type === 'in' ? '+' : '−'}Rs.{fmtC(tx.amount)}
                    </div>
                  </div>
                  {isExp && (
                    <div style={{ padding: '0 14px 14px', borderTop: '1px solid #f1f5f9' }}>
                      {isBalanceTx(tx) && <BalanceDetailPanel tx={tx} />}
                      {isPurch(tx) && <PurchaseDetailPanel tx={tx} />}
                      {(isCustomerCredit(tx) || isCustomerPayment(tx)) && <CustomerCreditPanel tx={tx} />}
                      {isBankMovement(tx) && <BankMovementPanel tx={tx} />}
                      {isBankTransfer(tx) && <BankTransferPanel tx={tx} />}
                      {isVehicleExpense(tx) && <VehicleExpensePanel tx={tx} />}
                      {isProductionTx(tx) && <ProductionDetailPanel tx={tx} />}
                      {tx.category === 'bankLoanRepayment' && <BankLoanRepaymentDetailPanel tx={tx} />}
                      {(tx.category === 'chitFundPayment' || tx.category === 'chitFundReceipt') && <ChitFundDetailPanel tx={tx} />}
                      {isSalesTx(tx) && <CashTxProfitPanel tx={tx} />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : activeTab === 'banks' ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button onClick={() => setAddBankModal(true)} style={{ padding: '10px 16px', background: 'linear-gradient(135deg,#2563eb,#3b82f6)', color: 'white', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>➕ නව ගිණුමක් එකතු කරන්න</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {bankAccounts.map(acc => (
              <div key={acc.id} style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #e2e8f0' }}>
                <span style={{ background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800 }}>🏦 {acc.bankName}</span>
                <h3 style={{ margin: '12px 0 4px' }}>{acc.accountName}</h3>
                <div style={{ fontSize: 12, color: '#64748b' }}>#{acc.accountNumber}</div>
                <div style={{ marginTop: 20, borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>LIVE BALANCE</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#1e3a8a', marginTop: 4 }}>Rs.{fmtC(acc.liveBalance ?? acc.currentBalance ?? 0)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : activeTab === 'vehicles' ? (
        <VehicleExpenseTab user={user} bankAccounts={bankAccounts} />
      ) : null}

      <BalanceEntryModal isOpen={balanceModal.isOpen} onClose={() => setBalanceModal({ isOpen: false, type: 'opening' })} type={balanceModal.type} user={user} bankAccounts={bankAccounts} expectedAmount={expectedAmount} />
      <BankCashModal isOpen={bankCashModal.isOpen} mode={bankCashModal.mode} onClose={() => setBankCashModal({ isOpen: false, mode: 'deposit' })} onSave={handleBankCashSave} bankAccounts={bankAccounts} saving={saving} />
      <InterBankTransferModal isOpen={transferModal} onClose={() => setTransferModal(false)} onSave={handleInterBankTransferSave} bankAccounts={bankAccounts} saving={saving} />
      <AddBankAccountModal isOpen={addBankModal} onClose={() => setAddBankModal(false)} user={user} saving={saving} setSaving={setSaving} />

      {manualTxModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 15 }}>
          <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 500 }}>
            <div style={{ background: '#475569', color: 'white', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', borderRadius: '20px 20px 0 0' }}>
              <h3 style={{ margin: 0 }}>✍️ Manual Transaction</h3>
              <button onClick={() => setManualTxModal(false)} style={{ background: 'none', border: 'none', color: 'white', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <button onClick={() => setManualForm(p => ({ ...p, type: 'in' }))} style={{ padding: 12, borderRadius: 10, fontWeight: 800, cursor: 'pointer', border: manualForm.type === 'in' ? '3px solid #10b981' : '1px solid #cbd5e1', background: manualForm.type === 'in' ? '#ecfdf5' : 'white', color: manualForm.type === 'in' ? '#047857' : '#475569' }}>🟢 Cash In</button>
                <button onClick={() => setManualForm(p => ({ ...p, type: 'out' }))} style={{ padding: 12, borderRadius: 10, fontWeight: 800, cursor: 'pointer', border: manualForm.type === 'out' ? '3px solid #ef4444' : '1px solid #cbd5e1', background: manualForm.type === 'out' ? '#fef2f2' : 'white', color: manualForm.type === 'out' ? '#b91c1c' : '#475569' }}>🔴 Cash Out</button>
              </div>
              <input type="number" placeholder="මුදල *" value={manualForm.amount} onChange={e => setManualForm(p => ({ ...p, amount: e.target.value }))} style={{ width: '100%', padding: 12, borderRadius: 10, border: '2px solid #cbd5e1', fontSize: 20, fontWeight: 800, marginBottom: 14, boxSizing: 'border-box' }} />
              <select value={manualForm.category} onChange={e => setManualForm(p => ({ ...p, category: e.target.value }))} style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #cbd5e1', marginBottom: 14, boxSizing: 'border-box' }}>
                <option value="other">අනෙකුත්</option><option value="salary">වැටුප්</option><option value="rent">කුලිය</option><option value="utilities">විදුලිය/ජලය</option><option value="transport">ප්‍රවාහනය</option>
              </select>
              <div style={{ display: 'grid', gridTemplateColumns: manualForm.paymentMethod === 'bank' ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 14 }}>
                <select value={manualForm.paymentMethod} onChange={e => setManualForm(p => ({ ...p, paymentMethod: e.target.value }))} style={{ padding: 12, borderRadius: 10, border: '1px solid #cbd5e1' }}><option value="cash">💵 Cash</option><option value="bank">🏦 Bank</option></select>
                {manualForm.paymentMethod === 'bank' && (
                  <select value={manualForm.bankAccountId} onChange={e => setManualForm(p => ({ ...p, bankAccountId: e.target.value }))} style={{ padding: 12, borderRadius: 10, border: '1px solid #cbd5e1' }}>
                    <option value="">-- බැංකුව --</option>
                    {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.bankName}</option>)}
                  </select>
                )}
              </div>
              <textarea rows={2} placeholder="විස්තරය" value={manualForm.description} onChange={e => setManualForm(p => ({ ...p, description: e.target.value }))} style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #cbd5e1', marginBottom: 18, boxSizing: 'border-box' }} />
              <button onClick={handleManualTxSave} disabled={saving} style={{ width: '100%', padding: 16, background: '#475569', color: 'white', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>{saving ? '⏳...' : '✅  සුරකින්න'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}