'use client';

// components/DashboardShell.jsx
// ★ v7 (Latest) — Bilingual Switchable Session vs Today's Transactions Dashboard
// 🚀 BULLETPROOF MULTI-SOURCE SYNC (Matches CashManagement v61 perfectly)
// - Directly listens to `cashTransactions`, root-level `customerTransactions` AND `productionEntries`
// - Synchronizes 100% with Cash page, showing identical Income, Expenses & Expected Amounts
// - Excludes internal bank operations and transfers from revenue calculations
// - Multilingual support

import React, { useState, useEffect, useMemo } from 'react';
import Sidebar from './Sidebar';
import { db } from '@/firebaseConfig';
import { useUserAuth } from '@/context/UserContext';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

/* ═══════════════════════════════════════
   HELPERS
═══════════════════════════════════════ */
const toNum = (v) => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

const fmtC = (v) =>
  toNum(v).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const padZ = (n) => String(n).padStart(2, '0');

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${padZ(d.getMonth() + 1)}-${padZ(d.getDate())}`;
};

const toMs = (src) => {
  if (!src) return 0;
  if (src?.toDate) return src.toDate().getTime();
  if (src?.seconds) return src.seconds * 1000;
  if (typeof src === 'number') return src;
  const d = new Date(src);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

const resolveMs = (tx) => {
  let ms = toMs(tx?.timestamp);
  if (ms > 0) return ms;
  ms = toMs(tx?.createdAt);
  if (ms > 0) return ms;
  ms = toMs(tx?.date);
  if (ms > 0) return ms;
  if (tx?.date && typeof tx.date === 'string') {
    const d = new Date(`${tx.date}T${tx.time || '00:00'}:00`);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return 0;
};

const getDisplayDate = (tx) => {
  const ms = resolveMs(tx);
  if (ms > 0) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${padZ(d.getMonth() + 1)}-${padZ(d.getDate())}`;
  }
  return tx?.date || todayStr();
};

const getDisplayTime = (tx) => {
  if (tx?.time) return tx.time;
  const ms = resolveMs(tx);
  if (ms > 0) {
    const d = new Date(ms);
    const h = d.getHours();
    const m = padZ(d.getMinutes());
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hh = h % 12 || 12;
    return `${hh}:${m} ${ampm}`;
  }
  return '';
};

const isTodayTx = (tx) => {
  return getDisplayDate(tx) === todayStr();
};

const isOpeningTx = tx => tx && tx.category === 'openingBalance';
const isBalanceTx = tx => tx && (tx.source === 'balance' || tx.category === 'openingBalance' || tx.category === 'closingBalance');

const isAnyBankTx = tx => {
  const src = tx?.source || '';
  const cat = tx?.category || '';
  return (
    src === 'bankDeposit' ||
    src === 'bankWithdraw' ||
    src === 'bankTransfer' ||
    src === 'cashTransfer' ||
    cat === 'bankDeposit' ||
    cat === 'bankWithdraw' ||
    cat === 'bankTransfer' ||
    tx?.type === 'transfer'
  );
};

const isInternalTransfer = (tx) => {
  return isBalanceTx(tx) || isAnyBankTx(tx);
};

const isCustomerCredit = tx => {
  if (!tx) return false;
  const src = String(tx.source || '').toLowerCase();
  const cat = String(tx.category || '').toLowerCase();
  const type = String(tx.type || '').toLowerCase();
  return (
    src === 'customercredit' ||
    cat === 'customercredit' ||
    src === 'credit' ||
    (type === 'out' && !!tx.customerId && !tx.invoiceId && (tx.paymentMethod === 'credit' || src === 'manual_credit'))
  );
};

const isCustomerPayment = tx => {
  if (!tx) return false;
  const src = String(tx.source || '').toLowerCase();
  const cat = String(tx.category || '').toLowerCase();
  const type = String(tx.type || '').toLowerCase();
  return (
    src === 'invoicepayment' ||
    cat === 'invoicepayment' ||
    src === 'customerpayment' ||
    cat === 'customerpayment' ||
    src === 'payment' ||
    (type === 'in' && !!tx.customerId)
  );
};

const isProductionTx = tx => {
  if (!tx) return false;
  const src = String(tx.source || '').toLowerCase();
  const cat = String(tx.category || '').toLowerCase();
  return (
    src === 'production' ||
    src.startsWith('custom_') ||
    src === 'quarry' ||
    src === 'cropfarm' ||
    src === 'vehiclerepair' ||
    src === 'tyreshop' ||
    src === 'vehiclewash' ||
    cat === 'productionsales' ||
    cat === 'productionexpense' ||
    cat === 'quarry' ||
    cat === 'cropfarm' ||
    cat.startsWith('custom_')
  );
};

/* ═══════════════════════════════════════
   SOURCE / CATEGORY METADATA
═══════════════════════════════════════ */
const SOURCE_META = {
  invoice: { si: 'ඉන්වොයිස් විකුණුම්', en: 'Invoice Sale', icon: '🧾', color: '#4f46e5' },
  pos: { si: 'POS විකුණුම්', en: 'POS Sale', icon: '🛒', color: '#10b981' },
  invoicePayment: { si: 'ගෙවීම් ලැබීම', en: 'Payment Received', icon: '💵', color: '#16a34a' },
  customerLoanCollection: { si: 'ණය එකතු කිරීම', en: 'Loan Collection', icon: '💰', color: '#059669' },
  productionSales: { si: 'නිෂ්පාදන ආදායම', en: 'Production Income', icon: '🏭', color: '#0891b2' },

  purchase: { si: 'මිලදී ගැනීම්', en: 'Purchases', icon: '📦', color: '#d97706' },
  supplier: { si: 'සැපයුම්කරු ගෙවීම', en: 'Supplier Payment', icon: '🏪', color: '#7c3aed' },
  expense: { si: 'වියදම්', en: 'Expenses', icon: '💸', color: '#dc2626' },
  customerCredit: { si: 'පාරිභෝගික ණය', en: 'Customer Credit', icon: '👤', color: '#dc2626' },
  customerLoanIssue: { si: 'ණය නිකුත් කිරීම', en: 'Loan Issued', icon: '📤', color: '#dc2626' },
  vehicleExpense: { si: 'වාහන වියදම', en: 'Vehicle Expense', icon: '🚛', color: '#dc2626' },
  bankLoanRepayment: { si: 'බැංකු ණය ගෙවීම', en: 'Bank Loan Payment', icon: '🏛️', color: '#1e40af' },
  productionExpense: { si: 'නිෂ්පාදන වියදම', en: 'Production Expense', icon: '📉', color: '#b91c1c' },
  manual: { si: 'අතින්', en: 'Manual', icon: '✍️', color: '#475569' },
};

const CATEGORY_LABELS = {
  si: {
    salary: 'වැටුප්', rent: 'කුලිය', utilities: 'විදුලිය/ජලය',
    transport: 'ප්‍රවාහනය', maintenance: 'නඩත්තු', vehicleFuel: 'ඉන්ධන',
    vehicleTyre: 'ටයර්', vehicleService: 'සේවා', other: 'වෙනත්',
    sales: 'විකිණීම', supplierPayment: 'සැපයුම්කරු ගෙවීම',
    productionSales: 'නිෂ්පාදන ආදායම', productionExpense: 'නිෂ්පාදන වියදම',
  },
  en: {
    salary: 'Salary', rent: 'Rent', utilities: 'Utilities',
    transport: 'Transport', maintenance: 'Maintenance', vehicleFuel: 'Fuel',
    vehicleTyre: 'Tyres', vehicleService: 'Service', other: 'Other',
    sales: 'Sales', supplierPayment: 'Supplier Payment',
    productionSales: 'Production Income', productionExpense: 'Production Expense',
  },
};

const getSrcMeta = (tx) => {
  const key = tx?.source || 'manual';
  return SOURCE_META[key] || SOURCE_META.manual;
};

const getCatLabel = (tx, lang) => {
  const cat = tx?.category;
  if (!cat) return '';
  return CATEGORY_LABELS[lang]?.[cat] || cat;
};

/* ═══════════════════════════════════════
   DETAILED TRANSACTIONS MODAL
═══════════════════════════════════════ */
function TransactionsDetailModal({ isOpen, onClose, type, transactions, lang, scope, sessionInfo }) {
  const [searchQ, setSearchQ] = useState('');
  const [filterSource, setFilterSource] = useState('all');

  const L = {
    si: {
      titleInSession: '💰 සැසියේ ලැබීම් විස්තර',
      titleOutSession: '💸 සැසියේ වියදම් විස්තර',
      titleInToday: '💰 අද ලැබීම් විස්තර',
      titleOutToday: '💸 අද වියදම් විස්තර',
      search: '🔍 සොයන්න...',
      allSources: 'සියලුම මූලාශ්‍ර',
      total: 'මුළු එකතුව',
      count: 'ගනුදෙනු',
      noData: 'දත්ත නොමැත',
      close: 'වසන්න',
      time: 'වේලාව',
      amount: 'මුදල',
      sessionStart: 'සැසිය ආරම්භය',
      scopeLabel: 'වත්මන් පරාසය',
    },
    en: {
      titleInSession: "💰 Session Income Details",
      titleOutSession: "💸 Session Expense Details",
      titleInToday: "💰 Today's Income Details",
      titleOutToday: "💸 Today's Expense Details",
      search: '🔍 Search...',
      allSources: 'All Sources',
      total: 'Grand Total',
      count: 'transactions',
      noData: 'No data found',
      close: 'Close',
      time: 'Time',
      amount: 'Amount',
      sessionStart: 'Session Started',
      scopeLabel: 'Current Scope',
    },
  };

  const t = L[lang] || L.si;
  const isIncome = type === 'in';
  const color = isIncome ? '#16a34a' : '#dc2626';
  const bgLight = isIncome ? '#f0fdf4' : '#fef2f2';
  const border = isIncome ? '#bbf7d0' : '#fecaca';
  const gradient = isIncome
    ? 'linear-gradient(135deg,#059669,#10b981)'
    : 'linear-gradient(135deg,#dc2626,#ef4444)';

  const bySource = useMemo(() => {
    const groups = {};
    transactions.forEach((tx) => {
      const src = tx.source || 'manual';
      if (!groups[src]) {
        groups[src] = { total: 0, count: 0, txs: [] };
      }
      groups[src].total += toNum(tx.amount);
      groups[src].count += 1;
      groups[src].txs.push(tx);
    });
    return groups;
  }, [transactions]);

  const filtered = useMemo(() => {
    const q = searchQ.toLowerCase().trim();
    return transactions
      .filter((tx) => {
        if (filterSource !== 'all' && tx.source !== filterSource) return false;
        if (q) {
          const hay = [
            tx.description, tx.notes, tx.customerName, tx.supplierName,
            tx.category, tx.source, String(tx.amount),
          ]
            .filter(Boolean).join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => resolveMs(b) - resolveMs(a));
  }, [transactions, searchQ, filterSource]);

  const grandTotal = useMemo(
    () => filtered.reduce((s, tx) => s + toNum(tx.amount), 0),
    [filtered]
  );

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: 20,
        overflowY: 'auto',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 20,
          width: '100%',
          maxWidth: 720,
          margin: '20px 0',
          overflow: 'hidden',
          boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div style={{ background: gradient, padding: '18px 22px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>
              {scope === 'session'
                ? (isIncome ? t.titleInSession : t.titleOutSession)
                : (isIncome ? t.titleInToday : t.titleOutToday)
              }
            </h2>
            <div style={{ fontSize: 11, opacity: 0.9, marginTop: 4 }}>
              {scope === 'session' && sessionInfo.exists
                ? `🕒 ${t.sessionStart}: ${sessionInfo.label}`
                : `📅 ${t.scopeLabel}: ${todayStr()}`
              }
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '50%', width: 36, height: 36, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: 20 }}>
          {/* SUMMARY BAR */}
          <div style={{ background: bgLight, border: `2px solid ${border}`, borderRadius: 14, padding: '14px 18px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>{t.total}</div>
              <div style={{ fontSize: 26, fontWeight: 900, color }}>Rs.{fmtC(grandTotal)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color }}>{filtered.length} {t.count}</div>
            </div>
          </div>

          {/* CHIPS */}
          {Object.keys(bySource).length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              <button
                onClick={() => setFilterSource('all')}
                style={{ padding: '6px 12px', borderRadius: 20, border: 'none', background: filterSource === 'all' ? color : '#f1f5f9', color: filterSource === 'all' ? 'white' : '#475569', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                🌐 {t.allSources} ({transactions.length})
              </button>
              {Object.entries(bySource).map(([src, data]) => {
                const meta = SOURCE_META[src] || SOURCE_META.manual;
                const active = filterSource === src;
                return (
                  <button
                    key={src}
                    onClick={() => setFilterSource(src)}
                    style={{ padding: '6px 12px', borderRadius: 20, border: 'none', background: active ? meta.color : '#f1f5f9', color: active ? 'white' : '#475569', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <span>{meta.icon}</span>
                    <span>{meta[lang] || meta.si}</span>
                    <span style={{ opacity: 0.75 }}>· Rs.{fmtC(data.total)}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* SEARCH */}
          <input
            type="text"
            placeholder={t.search}
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box', marginBottom: 12, outline: 'none' }}
          />

          {/* LIST */}
          <div style={{ maxHeight: 400, overflowY: 'auto', display: 'grid', gap: 8 }}>
            {filtered.map((tx, idx) => {
              const meta = getSrcMeta(tx);
              const catLbl = getCatLabel(tx, lang);
              return (
                <div key={tx.id || idx} style={{ background: 'white', border: '1px solid #e2e8f0', borderLeft: `4px solid ${meta.color}`, borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: `${meta.color}15`, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{meta.icon}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{tx.description || tx.customerName || meta[lang] || meta.si}</div>
                      <div style={{ fontSize: 11, color: '#64748b', display: 'flex', gap: 8, marginTop: 2 }}>
                        <span>🕐 {getDisplayTime(tx)}</span>
                        {catLbl && <span>· {catLbl}</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 900, color }}>{isIncome ? '+' : '−'}Rs.{fmtC(tx.amount)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══ TODAY'S SUMMARY CARDS COMPONENT ═══ */
function TodaysSummary({ cashTxs, lang, compact, onCardClick, session, scope }) {
  const summary = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    const incomeTxs = [];
    const expenseTxs = [];

    cashTxs.forEach((tx) => {
      const txMs = resolveMs(tx);
      let include = false;

      // Scope-wise logic selection
      if (scope === 'session' && session.exists) {
        if (txMs >= session.startMs) include = true;
      } else {
        if (isTodayTx(tx)) include = true;
      }

      if (!include) return;
      if (isInternalTransfer(tx)) return; // Exclude non-revenue movements

      const amt = toNum(tx.amount);
      if (tx.type === 'in') {
        totalIn += amt;
        incomeTxs.push(tx);
      } else if (tx.type === 'out') {
        totalOut += amt;
        expenseTxs.push(tx);
      }
    });

    return {
      totalIn,
      totalOut,
      netBalance: totalIn - totalOut,
      incomeTxs,
      expenseTxs,
    };
  }, [cashTxs, session, scope]);

  // ★ Dynamic Opening Balance Extraction based on selected Scope
  const openingAmount = useMemo(() => {
    if (scope === 'session' && session.exists) {
      return session.openingAmount;
    }
    // Find today's opening balance if scope is today
    const todayOpening = cashTxs.find(tx => tx.category === 'openingBalance' && isTodayTx(tx));
    return todayOpening ? toNum(todayOpening.amount) : 0;
  }, [scope, session, cashTxs]);

  // ★ Calculate Expected Amount (🎯 ආරම්භක + ලැබීම් - වියදම් = අපේක්ශිත මුදල)
  const expectedAmount = useMemo(() => {
    return openingAmount + summary.totalIn - summary.totalOut;
  }, [openingAmount, summary.totalIn, summary.totalOut]);

  const L = {
    si: {
      incomeSession: 'සැසියේ ලැබීම්',
      expenseSession: 'සැසියේ වියදම්',
      incomeToday: 'අද ලැබීම්',
      expenseToday: 'අද වියදම්',
      net: 'ශුද්ධ ලාභය',
      loss: 'ශුද්ධ පාඩුව',
      expected: 'අපේක්ශිත මුදල',
    },
    en: {
      incomeSession: 'Session Income',
      expenseSession: 'Session Expense',
      incomeToday: "Today's Income",
      expenseToday: "Today's Expense",
      net: 'Net Profit',
      loss: 'Net Loss',
      expected: 'Expected Amount',
    },
  };

  const t = L[lang] || L.si;
  const isProfit = summary.netBalance >= 0;

  const CardBase = ({ bg, border, color, icon, label, value, count, onClick }) => (
    <div
      onClick={onClick}
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 10,
        padding: compact ? '6px 8px' : '8px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minWidth: compact ? 'auto' : 135,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={(e) => { if (onClick) e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      <div style={{ fontSize: compact ? 18 : 22 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 800, color, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
          {onClick && count > 0 && (
            <span style={{ background: color, color: 'white', padding: '1px 5px', borderRadius: 8, fontSize: 8, fontWeight: 900 }}>{count}</span>
          )}
        </div>
        <div style={{ fontSize: compact ? 13 : 15, fontWeight: 900, color, lineHeight: 1.2 }}>
          Rs.{fmtC(value)}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: compact ? 5 : 8, alignItems: 'stretch', flexWrap: 'wrap' }}>
      {/* Income */}
      <CardBase
        bg="linear-gradient(135deg, #dcfce7, #bbf7d0)"
        border="#86efac"
        color="#166534"
        icon="💰"
        label={scope === 'session' && session.exists ? t.incomeSession : t.incomeToday}
        value={summary.totalIn}
        count={summary.incomeTxs.length}
        onClick={() => onCardClick('in', summary.incomeTxs)}
      />

      {/* Expense */}
      <CardBase
        bg="linear-gradient(135deg, #fee2e2, #fecaca)"
        border="#fca5a5"
        color="#991b1b"
        icon="💸"
        label={scope === 'session' && session.exists ? t.expenseSession : t.expenseToday}
        value={summary.totalOut}
        count={summary.expenseTxs.length}
        onClick={() => onCardClick('out', summary.expenseTxs)}
      />

      {/* 🎯 Expected Amount Card */}
      <CardBase
        bg="linear-gradient(135deg, #eff6ff, #dbeafe)"
        border="#93c5fd"
        color="#1e40af"
        icon="🎯"
        label={t.expected}
        value={expectedAmount}
      />

      {/* Net Balance (Desktop only) */}
      {!compact && (
        <CardBase
          bg={isProfit ? 'linear-gradient(135deg, #f0fdf4, #ccfbf1)' : 'linear-gradient(135deg, #fef3c7, #fde68a)'}
          border={isProfit ? '#5eead4' : '#fcd34d'}
          color={isProfit ? '#0f766e' : '#92400e'}
          icon={isProfit ? '📈' : '📉'}
          label={isProfit ? t.net : t.loss}
          value={Math.abs(summary.netBalance)}
        />
      )}
    </div>
  );
}

/* ═══ WHATSAPP HELP BUTTON ═══ */
function WhatsAppHelpButton() {
  const phone = '94787666999';
  const message = encodeURIComponent('Hello, Weerakkodi POS app සඳහා උදව් අවශ්‍යයි.');
  const whatsappUrl = `https://wa.me/${phone}?text=${message}`;

  return (
    <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 9999, textDecoration: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'linear-gradient(135deg, #25D366, #128C7E)', color: 'white', padding: '12px 16px', borderRadius: 999, boxShadow: '0 10px 25px rgba(0,0,0,0.22)', fontWeight: 800, fontSize: 14, border: '1px solid rgba(255,255,255,0.15)' }}>
        <span style={{ fontSize: 22 }}>💬</span>
        <span>WhatsApp Help</span>
      </div>
    </a>
  );
}

/* ═══ MAIN SHELL COMPONENT ═══ */
const isValidLang = (value) => value === 'si' || value === 'en';

export default function DashboardShell({ children }) {
  const { user } = useUserAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [lang, setLang] = useState('si');
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  // Real-time listener states
  const [cashTxs, setCashTxs] = useState([]);
  const [customerTxs, setCustomerTxs] = useState([]);
  const [productionEntries, setProductionEntries] = useState([]);

  // Scope Switcher state: "session" or "today"
  const [scope, setScope] = useState('session');

  // Detail Modal State
  const [detailModal, setDetailModal] = useState({
    isOpen: false,
    type: 'in',
    transactions: [],
  });

  // Load saved settings
  useEffect(() => {
    setMounted(true);
    try {
      const savedLang = localStorage.getItem('language');
      if (isValidLang(savedLang)) setLang(savedLang);
    } catch {}

    try {
      const savedCollapsed = localStorage.getItem('sidebarCollapsed');
      if (savedCollapsed === 'true') setCollapsed(true);
    } catch {}

    try {
      const savedScope = localStorage.getItem('dashboardScope');
      if (savedScope === 'session' || savedScope === 'today') setScope(savedScope);
    } catch {}
  }, []);

  // Save language preference
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem('language', lang);
    } catch {}
    window.dispatchEvent(new CustomEvent('app-language-change', { detail: lang }));
  }, [lang, mounted]);

  // Save collapse state
  useEffect(() => {
    if (!mounted || isMobile) return;
    try {
      localStorage.setItem('sidebarCollapsed', String(collapsed));
    } catch {}
  }, [collapsed, isMobile, mounted]);

  // Save active scope state
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem('dashboardScope', scope);
    } catch {}
  }, [scope, mounted]);

  // Responsive check
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth <= 900;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(false);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ══════════════════════════════════════════════════════
  // FIRESTORE REAL-TIME MULTI-SOURCE LISTENERS
  // ══════════════════════════════════════════════════════
  useEffect(() => {
    if (!user?.uid) {
      setCashTxs([]);
      setCustomerTxs([]);
      setProductionEntries([]);
      return;
    }

    // A: users/{uid}/cashTransactions
    const unsubCash = onSnapshot(collection(db, `users/${user.uid}/cashTransactions`), (snap) => {
      setCashTxs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => setCashTxs([]));

    // B: customerTransactions (Root level)
    const unsubCust = onSnapshot(query(collection(db, 'customerTransactions'), where('uid', '==', user.uid)), (snap) => {
      setCustomerTxs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => setCustomerTxs([]));

    // C: productionEntries (Root level)
    const unsubProd = onSnapshot(query(collection(db, 'productionEntries'), where('uid', '==', user.uid)), (snap) => {
      setProductionEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => setProductionEntries([]));

    return () => {
      unsubCash();
      unsubCust();
      unsubProd();
    };
  }, [user?.uid]);

  // ══════════════════════════════════════════════════════
  // BULLETPROOF MULTI-SOURCE IN-MEMORY MERGING (Matches CashManagement v61)
  // ══════════════════════════════════════════════════════
  const mergedTransactions = useMemo(() => {
    const all = [...cashTxs];

    const trackedCustTxnIds = new Set();
    const trackedProdIds = new Set();
    const trackedBatches = new Set();

    cashTxs.forEach(tx => {
      if (tx.customerTxnId) trackedCustTxnIds.add(tx.customerTxnId);
      if (tx.linkedCustTxnId) trackedCustTxnIds.add(tx.linkedCustTxnId);
      if (tx.entryId) trackedProdIds.add(tx.entryId);
      if (tx.expenseId) trackedProdIds.add(tx.expenseId);
      if (tx.batchNumber) trackedBatches.add(tx.batchNumber);

      if (isCustomerPayment(tx) || isCustomerCredit(tx)) {
        trackedCustTxnIds.add(`${tx.customerId}_${tx.amount}_${tx.date}`);
      }
    });

    // Merge untracked records from root customerTransactions collection
    customerTxs.forEach(ct => {
      const fingerprint = `${ct.customerId}_${ct.amount}_${ct.date}`;
      if (trackedCustTxnIds.has(ct.id) || trackedCustTxnIds.has(fingerprint)) return;

      const normType = String(ct.type || '').trim().toLowerCase();
      const isPay = normType === 'payment' || normType === 'in';
      const ts = resolveMs(ct);

      all.push({
        id: ct.id,
        customerTxnId: ct.id,
        type: isPay ? 'in' : 'out',
        source: isPay ? 'invoicePayment' : 'customerCredit',
        category: isPay ? 'invoicePayment' : 'customerCredit',
        amount: toNum(ct.amount),
        description: isPay 
          ? `💵 පාරිභෝගික ගෙවීම් ලැබීම [${ct.customerName || 'පාරිභෝගිකයා'}]` 
          : `👤 පාරිභෝගික ණය ලබාදීම [${ct.customerName || 'පාරිභෝගිකයා'}]`,
        paymentMethod: ct.method || ct.paymentMethod || 'cash',
        customerId: ct.customerId,
        customerName: ct.customerName || '',
        customerPhone: ct.customerPhone || '',
        notes: ct.note || ct.notes || '',
        date: ct.date || '',
        time: ct.time || '',
        timestamp: ts,
        createdAt: ct.createdAt,
      });
    });

    // Merge untracked records from productionEntries (Direct Bypass)
    productionEntries.forEach(pe => {
      if (trackedProdIds.has(pe.id)) return;
      if (pe.batchNumber && trackedBatches.has(pe.batchNumber)) return;

      const ts = resolveMs(pe);

      // Income record
      if (!pe.isStandaloneExpense) {
        const paidAmt = toNum(pe.totalPaid || pe.grandTotal);
        if (paidAmt > 0) {
          all.push({
            id: pe.id + '_inc',
            entryId: pe.id,
            type: 'in',
            source: pe.businessType || 'production',
            category: 'productionSales',
            amount: paidAmt,
            description: `🏭 නිෂ්පාදන ලැබීම [${pe.businessName || 'නිෂ්පාදන'}]`,
            paymentMethod: pe.paymentMethod || 'cash',
            customerName: pe.customerName || '',
            customerPhone: pe.customerPhone || '',
            vehicleNo: pe.vehicleNumber || '',
            notes: pe.remark || '',
            date: pe.date || '',
            time: pe.time || '',
            timestamp: ts,
            createdAt: pe.createdAt,
            batchNumber: pe.batchNumber,
            outputs: pe.outputs || [],
            harvests: pe.harvests || [],
            serviceItems: pe.serviceItems || [],
            partsUsed: pe.partsUsed || [],
          });
        }
      }

      // Expense record
      if (pe.isStandaloneExpense || (Array.isArray(pe.expenseItems) && pe.expenseItems.length > 0)) {
        const costAmt = toNum(pe.totalCost || pe.amount);
        if (costAmt > 0) {
          all.push({
            id: pe.id + '_exp',
            expenseId: pe.id,
            type: 'out',
            source: pe.businessType || 'production',
            category: 'productionExpense',
            amount: costAmt,
            description: `📉 නිෂ්පාදන වියදම [${pe.businessName || 'නිෂ්පාදන'}]`,
            paymentMethod: pe.paymentMethod || 'cash',
            notes: pe.remark || pe.description || '',
            date: pe.date || '',
            time: pe.time || '',
            timestamp: ts,
            createdAt: pe.createdAt,
            batchNumber: pe.batchNumber,
            expenseItems: pe.expenseItems || [],
          });
        }
      }
    });

    return all;
  }, [cashTxs, customerTxs, productionEntries]);

  // Current Session Extractor
  const currentSession = useMemo(() => {
    const openings = cashTxs
      .filter((tx) => tx.category === 'openingBalance')
      .sort((a, b) => resolveMs(b) - resolveMs(a));

    const latest = openings[0] || null;

    if (!latest) return { exists: false, startMs: 0, label: '', openingAmount: 0 };

    const dateStr = getDisplayDate(latest);
    const timeStr = getDisplayTime(latest);

    return {
      exists: true,
      startMs: resolveMs(latest),
      label: `${dateStr} @ ${timeStr}`,
      openingAmount: toNum(latest.amount),
    };
  }, [cashTxs]);

  const contentMarginLeft = !isMobile ? (collapsed ? 72 : 272) : 0;

  const handleCardClick = (type, transactions) => {
    setDetailModal({
      isOpen: true,
      type,
      transactions,
    });
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* SIDEBAR */}
      <Sidebar
        isOpen={isMobile ? sidebarOpen : true}
        onClose={() => setSidebarOpen(false)}
        isCollapsed={isMobile ? false : collapsed}
        toggleCollapse={() => setCollapsed((prev) => !prev)}
        lang={lang}
        setLang={setLang}
      />

      <div
        style={{
          marginLeft: contentMarginLeft,
          transition: 'margin-left 0.25s cubic-bezier(0.4,0,0.2,1)',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* HEADER */}
        <header
          style={{
            minHeight: isMobile ? 'auto' : 74,
            background: 'white',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: isMobile ? '10px 12px' : '10px 20px',
            position: 'sticky',
            top: 0,
            zIndex: 100,
            boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            {isMobile && (
              <button
                onClick={() => setSidebarOpen(true)}
                style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ☰
              </button>
            )}
            {!isMobile && (
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>Weerakkodi POS</div>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginTop: 1 }}>
                  {lang === 'si' ? 'පාලක පුවරුව' : 'Dashboard Panel'}
                </div>
              </div>
            )}
          </div>

          {/* Scope Switcher Tabs & Cards Wrapper */}
          <div style={{ flex: isMobile ? '1 1 100%' : 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: 10, order: isMobile ? 3 : 2 }}>
            
            {/* Range Toggle Tabs */}
            <div style={{ display: 'flex', background: '#f1f5f9', padding: 4, borderRadius: 10, border: '1px solid #e2e8f0', flexShrink: 0 }}>
              <button
                onClick={() => setScope('session')}
                disabled={!currentSession.exists}
                style={{
                  padding: '7px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: scope === 'session' && currentSession.exists ? 'linear-gradient(135deg,#059669,#10b981)' : 'transparent',
                  color: scope === 'session' && currentSession.exists ? 'white' : !currentSession.exists ? '#cbd5e1' : '#475569',
                  fontWeight: 700,
                  fontSize: 11,
                  cursor: currentSession.exists ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span>⭐</span>
                <span>{lang === 'si' ? 'වත්මන් සැසිය' : 'Active Session'}</span>
              </button>
              <button
                onClick={() => setScope('today')}
                style={{
                  padding: '7px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: scope === 'today' ? '#475569' : 'transparent',
                  color: scope === 'today' ? 'white' : '#475569',
                  fontWeight: 700,
                  fontSize: 11,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span>📅</span>
                <span>{lang === 'si' ? 'අද දින' : "Today's Ledger"}</span>
              </button>
            </div>

            {/* Cards Display (Uses mergedTransactions to ensure 100% sync consistency) */}
            <div style={{ overflowX: 'auto', width: isMobile ? '100%' : 'auto', display: 'flex', justifyContent: 'center' }}>
              <TodaysSummary
                cashTxs={mergedTransactions}
                lang={lang}
                compact={isMobile}
                onCardClick={handleCardClick}
                session={currentSession}
                scope={scope}
              />
            </div>
          </div>

          {/* Lang Toggle */}
          <button
            onClick={() => setLang((prev) => (prev === 'si' ? 'en' : 'si'))}
            style={{ fontSize: 12, color: '#334155', fontWeight: 800, background: '#f1f5f9', padding: '8px 12px', borderRadius: 10, border: '1px solid #e2e8f0', cursor: 'pointer', flexShrink: 0, order: isMobile ? 2 : 3 }}
          >
            🌐 {lang === 'si' ? 'සිං' : 'EN'}
          </button>
        </header>

        {/* MAIN CONTENT */}
        <main style={{ flex: 1, padding: isMobile ? 12 : 20, boxSizing: 'border-box' }}>
          {children}
        </main>
      </div>

      {/* DETAIL MODAL */}
      <TransactionsDetailModal
        isOpen={detailModal.isOpen}
        onClose={() => setDetailModal({ isOpen: false, type: 'in', transactions: [] })}
        type={detailModal.type}
        transactions={detailModal.transactions}
        lang={lang}
        scope={scope}
        sessionInfo={currentSession}
      />

      {/* FLOATING SUPPORT */}
      <WhatsAppHelpButton />
    </div>
  );
}