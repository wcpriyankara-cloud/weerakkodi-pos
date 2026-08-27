'use client';

// components/BankLoanManagement.jsx
// ★ Bank & Institution Loan Management
// Features:
//   1. Track bank/finance company loans
//   2. EMI calculation (Flat & Reducing balance)
//   3. Amortization schedule
//   4. Monthly payment tracking
//   5. Cash/Bank register integration for repayments
//   6. Overdue alerts & upcoming payments

import React, { useState, useEffect, useMemo } from 'react';
import { db } from "@/firebaseConfig";
import { useUserAuth } from "@/context/UserContext";
import {
  collection, onSnapshot, doc,
  addDoc, updateDoc, increment,
  serverTimestamp, Timestamp, writeBatch,
} from "firebase/firestore";

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
const toNum = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const fmtC = v => toNum(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const padZ = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${padZ(d.getMonth()+1)}-${padZ(d.getDate())}`; };
const nowHHMM = () => { const d = new Date(); return `${padZ(d.getHours())}:${padZ(d.getMinutes())}`; };

const fmtDate = s => {
  if (!s) return '—';
  try {
    const [y, m, d] = s.split('-');
    const months = ['ජන','පෙබ','මාර්','අප්‍ර','මැයි','ජූනි','ජූලි','අගෝ','සැප්','ඔක්','නොවැ','දෙසැ'];
    return `${d} ${months[parseInt(m,10)-1]} ${y}`;
  } catch { return s; }
};

const addMonths = (dateStr, months) => {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + Number(months));
  return `${d.getFullYear()}-${padZ(d.getMonth()+1)}-${padZ(d.getDate())}`;
};

const daysBetween = (d1, d2) => {
  const a = new Date(d1), b = new Date(d2);
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
};

// ═══════════════════════════════════════════════════════════
// EMI CALCULATION ENGINE
// ═══════════════════════════════════════════════════════════
const calcFlatEMI = (principal, annualRate, termMonths) => {
  const totalInterest = principal * (annualRate / 100) * (termMonths / 12);
  const totalPayable = principal + totalInterest;
  const emi = termMonths > 0 ? totalPayable / termMonths : 0;
  return { emi, totalInterest, totalPayable };
};

const calcReducingEMI = (principal, annualRate, termMonths) => {
  const r = annualRate / 100 / 12;
  if (r === 0) return { emi: principal / termMonths, totalInterest: 0, totalPayable: principal };
  const emi = principal * r * Math.pow(1 + r, termMonths) / (Math.pow(1 + r, termMonths) - 1);
  const totalPayable = emi * termMonths;
  const totalInterest = totalPayable - principal;
  return { emi, totalInterest, totalPayable };
};

const calcLoanEMI = (principal, annualRate, termMonths, interestType) => {
  if (interestType === 'reducing') return calcReducingEMI(principal, annualRate, termMonths);
  return calcFlatEMI(principal, annualRate, termMonths);
};

const generateAmortization = (principal, annualRate, termMonths, interestType, startDate) => {
  const schedule = [];
  if (interestType === 'reducing') {
    const r = annualRate / 100 / 12;
    const { emi } = calcReducingEMI(principal, annualRate, termMonths);
    let balance = principal;
    for (let i = 1; i <= termMonths; i++) {
      const interestPortion = balance * r;
      const principalPortion = emi - interestPortion;
      balance = Math.max(0, balance - principalPortion);
      schedule.push({
        month: i,
        dueDate: addMonths(startDate, i),
        emi: Math.round(emi * 100) / 100,
        principal: Math.round(principalPortion * 100) / 100,
        interest: Math.round(interestPortion * 100) / 100,
        balance: Math.round(balance * 100) / 100,
      });
    }
  } else {
    const { emi, totalInterest } = calcFlatEMI(principal, annualRate, termMonths);
    const monthlyPrincipal = principal / termMonths;
    const monthlyInterest = totalInterest / termMonths;
    let balance = principal;
    for (let i = 1; i <= termMonths; i++) {
      balance = Math.max(0, balance - monthlyPrincipal);
      schedule.push({
        month: i,
        dueDate: addMonths(startDate, i),
        emi: Math.round(emi * 100) / 100,
        principal: Math.round(monthlyPrincipal * 100) / 100,
        interest: Math.round(monthlyInterest * 100) / 100,
        balance: Math.round(balance * 100) / 100,
      });
    }
  }
  return schedule;
};

// ═══════════════════════════════════════════════════════════
// INSTITUTION TYPES
// ═══════════════════════════════════════════════════════════
const INSTITUTION_TYPES = {
  bank:       { label: 'රාජ්‍ය බැංකුව',     icon: '🏛️', color: '#1e40af', bg: '#eff6ff', border: '#93c5fd' },
  private:    { label: 'පෞද්ගලික බැංකුව',  icon: '🏦', color: '#7c3aed', bg: '#faf5ff', border: '#c4b5fd' },
  finance:    { label: 'මූල්‍ය ආයතනය',    icon: '💳', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
  leasing:    { label: 'කල්බදු ආයතනය',   icon: '🚗', color: '#059669', bg: '#f0fdf4', border: '#86efac' },
  microfin:   { label: 'ක්ෂුද්‍ර මූල්‍ය',    icon: '💰', color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
  other:      { label: 'වෙනත්',           icon: '📋', color: '#475569', bg: '#f8fafc', border: '#cbd5e1' },
};

const LOAN_PURPOSES = [
  'ව්‍යාපාරික ණය', 'නිවාස ණය', 'වාහන ණය', 'පුද්ගලික ණය',
  'අධ්‍යාපන ණය', 'කෘෂිකාර්මික', 'උපකරණ මිලදී ගැනීම', 'වෙනත්',
];

const STATUS_CFG = {
  active:      { label: 'ක්‍රියාකාරී',   color: '#16a34a', bg: '#f0fdf4' },
  overdue:     { label: 'ප්‍රමාදයි',      color: '#dc2626', bg: '#fef2f2' },
  completed:   { label: 'සම්පූර්ණයි',    color: '#2563eb', bg: '#eff6ff' },
  restructured:{ label: 'ප්‍රතිසැකසූ',    color: '#7c3aed', bg: '#faf5ff' },
};

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
export default function BankLoanManagement() {
  const { user } = useUserAuth();
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filters
  const [filterInstitution, setFilterInstitution] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQ, setSearchQ] = useState('');

  // Modals
  const [showNewModal, setShowNewModal] = useState(false);
  const [payLoan, setPayLoan] = useState(null);
  const [scheduleLoan, setScheduleLoan] = useState(null);

  // Form
  const [form, setForm] = useState({
    institutionType: 'bank',
    institutionName: '',
    branchName: '',
    accountNumber: '',
    loanPurpose: 'ව්‍යාපාරික ණය',
    principalAmount: '',
    interestRate: '',
    interestType: 'reducing',
    loanTermMonths: '',
    startDate: todayStr(),
    firstEmiDate: '',
    officerName: '',
    officerPhone: '',
    collateral: '',
    notes: '',
  });

  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentMethod: 'bank',
    bankAccountId: '',
    referenceNo: '',
    paymentDate: todayStr(),
    installmentMonth: '',
    notes: '',
  });

  // ═══════════════════════════════════════════════════════════
  // FIRESTORE SYNC
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);

    const u1 = onSnapshot(collection(db, `users/${user.uid}/bankLoans`), s => {
      setLoans(s.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    const u2 = onSnapshot(collection(db, `users/${user.uid}/bankLoanPayments`), s => {
      setPayments(s.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const u3 = onSnapshot(collection(db, `users/${user.uid}/bankAccounts`), s => {
      setBankAccounts(s.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { u1(); u2(); u3(); };
  }, [user]);

  // Live EMI Calculation
  const liveEMI = useMemo(() => {
    const p = toNum(form.principalAmount);
    const r = toNum(form.interestRate);
    const t = toNum(form.loanTermMonths);
    if (p <= 0 || t <= 0) return null;
    return calcLoanEMI(p, r, t, form.interestType);
  }, [form.principalAmount, form.interestRate, form.loanTermMonths, form.interestType]);

  // ═══════════════════════════════════════════════════════════
  // METRICS
  // ═══════════════════════════════════════════════════════════
  const metrics = useMemo(() => {
    const today = todayStr();
    let totalPrincipal = 0, totalPaid = 0, totalRemaining = 0, totalInterest = 0;
    let monthlyOutflow = 0, overdueCount = 0, activeCount = 0, completedCount = 0;
    let upcomingThisMonth = 0;

    loans.forEach(l => {
      totalPrincipal += toNum(l.principalAmount);
      totalPaid += toNum(l.paidAmount);
      totalInterest += toNum(l.totalInterest);

      if (l.status === 'completed') {
        completedCount++;
        return;
      }

      totalRemaining += toNum(l.remainingBalance);
      activeCount++;
      monthlyOutflow += toNum(l.emiAmount);

      if (l.nextEmiDate && l.nextEmiDate < today) overdueCount++;

      // Upcoming this month
      if (l.nextEmiDate) {
        const dueMonth = l.nextEmiDate.substring(0, 7);
        const thisMonth = today.substring(0, 7);
        if (dueMonth === thisMonth) upcomingThisMonth += toNum(l.emiAmount);
      }
    });

    return { totalPrincipal, totalPaid, totalRemaining, totalInterest, monthlyOutflow, overdueCount, activeCount, completedCount, upcomingThisMonth };
  }, [loans]);

  // Filtered Loans
  const filteredLoans = useMemo(() => {
    const q = searchQ.toLowerCase().trim();
    const today = todayStr();

    return loans.filter(l => {
      if (filterInstitution !== 'all' && l.institutionType !== filterInstitution) return false;
      if (filterStatus !== 'all') {
        if (filterStatus === 'overdue') {
          if (l.status !== 'active') return false;
          if (!l.nextEmiDate || l.nextEmiDate >= today) return false;
        } else if (l.status !== filterStatus) return false;
      }
      if (q) {
        const hay = [l.institutionName, l.accountNumber, l.branchName, l.officerName, l.loanPurpose].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      // Overdue first
      const aOverdue = a.nextEmiDate && a.nextEmiDate < today && a.status === 'active';
      const bOverdue = b.nextEmiDate && b.nextEmiDate < today && b.status === 'active';
      if (aOverdue && !bOverdue) return -1;
      if (bOverdue && !aOverdue) return 1;
      return toNum(b.remainingBalance) - toNum(a.remainingBalance);
    });
  }, [loans, filterInstitution, filterStatus, searchQ]);

  // ═══════════════════════════════════════════════════════════
  // SAVE NEW LOAN
  // ═══════════════════════════════════════════════════════════
  const handleSaveLoan = async () => {
    if (!user?.uid) return;
    if (!form.institutionName) return alert('❌ ආයතනයේ නම ඇතුළත් කරන්න');
    const p = toNum(form.principalAmount);
    const t = toNum(form.loanTermMonths);
    if (p <= 0) return alert('❌ වලංගු ණය මුදලක් ඇතුළත් කරන්න');
    if (t <= 0) return alert('❌ කාලසීමාව ඇතුළත් කරන්න');

    setSaving(true);
    try {
      const emiData = calcLoanEMI(p, toNum(form.interestRate), t, form.interestType);
      const firstEmi = form.firstEmiDate || addMonths(form.startDate, 1);

      await addDoc(collection(db, `users/${user.uid}/bankLoans`), {
        ...form,
        principalAmount: p,
        interestRate: toNum(form.interestRate),
        loanTermMonths: t,
        emiAmount: Math.round(emiData.emi * 100) / 100,
        totalInterest: Math.round(emiData.totalInterest * 100) / 100,
        totalPayable: Math.round(emiData.totalPayable * 100) / 100,
        paidAmount: 0,
        remainingBalance: Math.round(emiData.totalPayable * 100) / 100,
        emiPaid: 0,
        status: 'active',
        firstEmiDate: firstEmi,
        nextEmiDate: firstEmi,
        endDate: addMonths(form.startDate, t),
        createdAt: serverTimestamp(),
        uid: user.uid,
      });

      alert(`✅ ${form.institutionName} ණය සාර්ථකව එකතු කරන ලදී!\n📅 මාසික වාරිකය: Rs.${fmtC(emiData.emi)}`);
      setShowNewModal(false);
      setForm({
        institutionType: 'bank', institutionName: '', branchName: '', accountNumber: '',
        loanPurpose: 'ව්‍යාපාරික ණය', principalAmount: '', interestRate: '',
        interestType: 'reducing', loanTermMonths: '', startDate: todayStr(),
        firstEmiDate: '', officerName: '', officerPhone: '', collateral: '', notes: '',
      });
    } catch (err) {
      console.error(err);
      alert('❌ ' + err.message);
    }
    setSaving(false);
  };

  // ═══════════════════════════════════════════════════════════
  // RECORD PAYMENT
  // ═══════════════════════════════════════════════════════════
  const handleRecordPayment = async () => {
    if (!user?.uid || !payLoan) return;
    const amt = toNum(paymentForm.amount);
    if (amt <= 0) return alert('❌ වලංගු මුදලක් ඇතුළත් කරන්න');
    if (paymentForm.paymentMethod === 'bank' && !paymentForm.bankAccountId) {
      return alert('❌ බැංකු ගිණුම තෝරන්න');
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);

      // Calculate interest/principal split
      const interestPortion = payLoan.interestType === 'flat'
        ? (payLoan.totalInterest / payLoan.loanTermMonths)
        : (toNum(payLoan.remainingBalance) * (payLoan.interestRate / 100 / 12));
      const principalPortion = Math.max(0, amt - interestPortion);

      // 1. Payment record
      const payRef = doc(collection(db, `users/${user.uid}/bankLoanPayments`));
      batch.set(payRef, {
        loanId: payLoan.id,
        institutionName: payLoan.institutionName,
        amount: amt,
        principalPortion: Math.round(principalPortion * 100) / 100,
        interestPortion: Math.round(interestPortion * 100) / 100,
        paymentDate: paymentForm.paymentDate,
        paymentMethod: paymentForm.paymentMethod,
        bankAccountId: paymentForm.bankAccountId || '',
        referenceNo: paymentForm.referenceNo || '',
        installmentMonth: paymentForm.installmentMonth || '',
        notes: paymentForm.notes || '',
        createdAt: serverTimestamp(),
        uid: user.uid,
      });

      // 2. Update loan
      const newRem = Math.max(0, toNum(payLoan.remainingBalance) - amt);
      const newEmiPaid = toNum(payLoan.emiPaid) + 1;
      const isComplete = newRem <= 0.01;
      const nextEmi = isComplete ? null : addMonths(paymentForm.paymentDate, 1);

      const loanRef = doc(db, `users/${user.uid}/bankLoans`, payLoan.id);
      batch.update(loanRef, {
        paidAmount: increment(amt),
        remainingBalance: increment(-amt),
        emiPaid: newEmiPaid,
        status: isComplete ? 'completed' : 'active',
        nextEmiDate: nextEmi,
        lastPaymentDate: paymentForm.paymentDate,
        updatedAt: serverTimestamp(),
      });

      // 3. Cash Register: Money going OUT (loan repayment)
      const cashRef = doc(collection(db, `users/${user.uid}/cashTransactions`));
      batch.set(cashRef, {
        type: 'out',
        source: 'bankLoanRepayment',
        category: 'bankLoanRepayment',
        amount: amt,
        loanId: payLoan.id,
        institutionName: payLoan.institutionName,
        paymentMethod: paymentForm.paymentMethod,
        bankAccountId: paymentForm.bankAccountId || '',
        description: `📤 බැංකු ණය වාරිකය - ${payLoan.institutionName} (Rs.${fmtC(amt)})`,
        date: paymentForm.paymentDate,
        time: nowHHMM(),
        timestamp: Timestamp.fromDate(new Date(paymentForm.paymentDate)),
        createdAt: serverTimestamp(),
        createdBy: user?.email || '',
        uid: user.uid,
      });

      // 4. Bank balance deduction
      if (paymentForm.paymentMethod === 'bank' && paymentForm.bankAccountId) {
        const accRef = doc(db, `users/${user.uid}/bankAccounts`, paymentForm.bankAccountId);
        batch.update(accRef, {
          currentBalance: increment(-amt),
          liveBalance: increment(-amt),
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      alert(`✅ වාරිකය සාර්ථකව ගෙවන ලදී!${isComplete ? '\n🎉 ණය සම්පූර්ණයෙන් ගෙවා අවසන්!' : ''}`);
      setPayLoan(null);
      setPaymentForm({
        amount: '', paymentMethod: 'bank', bankAccountId: '',
        referenceNo: '', paymentDate: todayStr(), installmentMonth: '', notes: '',
      });
    } catch (err) {
      console.error(err);
      alert('❌ ' + err.message);
    }
    setSaving(false);
  };

  const currentSchedule = useMemo(() => {
    if (!scheduleLoan) return [];
    return generateAmortization(
      scheduleLoan.principalAmount,
      scheduleLoan.interestRate,
      scheduleLoan.loanTermMonths,
      scheduleLoan.interestType,
      scheduleLoan.startDate
    );
  }, [scheduleLoan]);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 20, fontFamily: 'sans-serif' }}>

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: '#0f172a' }}>🏦 බැංකු ලෝන් සහ මූල්‍ය ආයතන ණය</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>EMI පරිගණනය · මාසික වාරික · Amortization Schedule</p>
        </div>
        <button onClick={() => setShowNewModal(true)} style={{ padding: '12px 20px', background: 'linear-gradient(135deg,#1e40af,#3b82f6)', color: 'white', border: 'none', borderRadius: 12, fontWeight: 800, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}>
          ➕ නව බැංකු ලෝන් එකක්
        </button>
      </div>

      {/* METRICS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div style={{ background: 'linear-gradient(135deg,#dc2626,#ef4444)', color: 'white', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 11, opacity: 0.9, fontWeight: 700 }}>💸 මුළු ණය ශේෂය</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>Rs.{fmtC(metrics.totalRemaining)}</div>
          <div style={{ fontSize: 10, opacity: 0.85, marginTop: 4 }}>ක්‍රියාකාරී: {metrics.activeCount}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg,#2563eb,#3b82f6)', color: 'white', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 11, opacity: 0.9, fontWeight: 700 }}>📅 මාසික ගෙවීම්</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>Rs.{fmtC(metrics.monthlyOutflow)}</div>
          <div style={{ fontSize: 10, opacity: 0.85, marginTop: 4 }}>මේ මාසය: Rs.{fmtC(metrics.upcomingThisMonth)}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg,#f59e0b,#fbbf24)', color: 'white', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 11, opacity: 0.9, fontWeight: 700 }}>🎯 මුළු පොලී වියදම</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>Rs.{fmtC(metrics.totalInterest)}</div>
          <div style={{ fontSize: 10, opacity: 0.85, marginTop: 4 }}>මුළු ණය මුදල: Rs.{fmtC(metrics.totalPrincipal)}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg,#7c3aed,#8b5cf6)', color: 'white', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 11, opacity: 0.9, fontWeight: 700 }}>⚠️ ප්‍රමාද වූ වාරික</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>{metrics.overdueCount}</div>
          <div style={{ fontSize: 10, opacity: 0.85, marginTop: 4 }}>වහාම ගෙවන්න</div>
        </div>
      </div>

      {/* FILTERS */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="🔍 සොයන්න (ආයතනය, ගිණුම, නිලධාරී)..."
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13 }}
        />
        <select value={filterInstitution} onChange={e => setFilterInstitution(e.target.value)} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, background: 'white', fontWeight: 600 }}>
          <option value="all">සියලු වර්ග</option>
          {Object.entries(INSTITUTION_TYPES).map(([k, m]) => <option key={k} value={k}>{m.icon} {m.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, background: 'white', fontWeight: 600 }}>
          <option value="all">සියලු තත්ත්ව</option>
          <option value="active">ක්‍රියාකාරී</option>
          <option value="overdue">⚠️ ප්‍රමාද</option>
          <option value="completed">✅ සම්පූර්ණ</option>
        </select>
      </div>

      {/* LOANS LIST */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>⏳ දත්ත පූරණය වෙමින්...</div>
      ) : filteredLoans.length === 0 ? (
        <div style={{ background: 'white', borderRadius: 14, padding: 40, textAlign: 'center', color: '#94a3b8', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 40 }}>🏦</div>
          <div style={{ marginTop: 10, fontWeight: 700 }}>බැංකු ලෝන් හමු නොවීය</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {filteredLoans.map(loan => {
            const inst = INSTITUTION_TYPES[loan.institutionType] || INSTITUTION_TYPES.other;
            const status = STATUS_CFG[loan.status] || STATUS_CFG.active;
            const progress = loan.totalPayable > 0 ? (toNum(loan.paidAmount) / loan.totalPayable) * 100 : 0;
            const today = todayStr();
            const isOverdue = loan.nextEmiDate && loan.nextEmiDate < today && loan.status === 'active';
            const daysOverdue = isOverdue ? Math.abs(daysBetween(today, loan.nextEmiDate)) : 0;

            return (
              <div key={loan.id} style={{
                background: 'white',
                borderRadius: 14,
                border: `1px solid ${isOverdue ? '#fca5a5' : '#e2e8f0'}`,
                borderLeft: `6px solid ${isOverdue ? '#dc2626' : loan.status === 'completed' ? '#16a34a' : inst.color}`,
                padding: 16,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#1e293b' }}>{inst.icon} {loan.institutionName}</h3>
                      <span style={{ background: inst.bg, color: inst.color, padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800 }}>{inst.label}</span>
                      <span style={{ background: status.bg, color: status.color, padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800 }}>{status.label}</span>
                      {isOverdue && (
                        <span style={{ background: '#fef2f2', color: '#dc2626', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800, border: '1px solid #fecaca' }}>
                          ⚠️ දින {daysOverdue} ප්‍රමාදයි
                        </span>
                      )}
                      <span style={{ background: '#f8fafc', color: '#475569', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                        {loan.interestType === 'reducing' ? '📉 අඩුවන' : '📊 ස්ථිර'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                      {loan.accountNumber && <span>#️⃣ {loan.accountNumber}</span>}
                      {loan.branchName && <span>🏢 {loan.branchName}</span>}
                      {loan.loanPurpose && <span>🎯 {loan.loanPurpose}</span>}
                      {loan.nextEmiDate && <span style={{ color: isOverdue ? '#dc2626' : '#64748b', fontWeight: isOverdue ? 700 : 600 }}>📅 මීළඟ: {fmtDate(loan.nextEmiDate)}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>ඉතිරි ශේෂය</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#dc2626' }}>Rs.{fmtC(loan.remainingBalance)}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                      මාසික EMI: <b style={{ color: inst.color }}>Rs.{fmtC(loan.emiAmount)}</b>
                    </div>
                  </div>
                </div>

                {/* Progress */}
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 4 }}>
                    <span style={{ color: '#64748b', fontWeight: 700 }}>ගෙවීම් ප්‍රගතිය</span>
                    <span style={{ color: inst.color, fontWeight: 800 }}>{progress.toFixed(1)}% · {loan.emiPaid || 0}/{loan.loanTermMonths} වාරික</span>
                  </div>
                  <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${progress}%`, background: `linear-gradient(90deg,${inst.color},${inst.color}dd)`, transition: 'width 0.5s' }} />
                  </div>
                </div>

                {/* Info Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 12 }}>
                  <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#64748b' }}>ණය මුදල</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b' }}>Rs.{fmtC(loan.principalAmount)}</div>
                  </div>
                  <div style={{ background: '#fff7ed', padding: '8px 10px', borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#64748b' }}>පොලිය</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#ea580c' }}>{loan.interestRate}% p.a.</div>
                  </div>
                  <div style={{ background: '#f0fdf4', padding: '8px 10px', borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#64748b' }}>ගෙවා ඇති</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#16a34a' }}>Rs.{fmtC(loan.paidAmount)}</div>
                  </div>
                  <div style={{ background: '#eff6ff', padding: '8px 10px', borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#64748b' }}>කාලය</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#2563eb' }}>{loan.loanTermMonths} මාස</div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                  <button onClick={() => setScheduleLoan(loan)} style={{ padding: '8px 14px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                    📊 කාලසටහන
                  </button>
                  {loan.status !== 'completed' && (
                    <button onClick={() => { setPayLoan(loan); setPaymentForm(p => ({ ...p, amount: String(loan.emiAmount || '') })); }} style={{ padding: '8px 14px', background: 'linear-gradient(135deg,#1e40af,#3b82f6)', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                      💳 වාරිකය ගෙවන්න
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          MODAL: NEW BANK LOAN
          ═══════════════════════════════════════════════════════════ */}
      {showNewModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, overflowY: 'auto' }}>
          <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 720, margin: '20px 0', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: '20px 24px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>🏦 නව බැංකු ලෝන් එකක් එකතු කරන්න</h2>
              <button onClick={() => setShowNewModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '50%', width: 34, height: 34, fontSize: 16, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: 24 }}>

              {/* Institution Type */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8, display: 'block' }}>📌 ආයතන වර්ගය</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
                  {Object.entries(INSTITUTION_TYPES).map(([k, m]) => (
                    <button key={k} onClick={() => setForm(p => ({ ...p, institutionType: k }))} style={{ padding: '10px 4px', borderRadius: 8, cursor: 'pointer', border: form.institutionType === k ? `2px solid ${m.color}` : '1px solid #e2e8f0', background: form.institutionType === k ? m.bg : 'white', color: form.institutionType === k ? m.color : '#64748b', fontWeight: 700, fontSize: 10 }}>
                      <div style={{ fontSize: 18 }}>{m.icon}</div>
                      <div style={{ marginTop: 4 }}>{m.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Institution Details */}
              <div style={{ background: '#eff6ff', border: '2px solid #93c5fd', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#1e40af', marginBottom: 10 }}>🏛️ ආයතන තොරතුරු</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>ආයතනයේ නම *</label>
                    <input value={form.institutionName} onChange={e => setForm(p => ({ ...p, institutionName: e.target.value }))} placeholder="BOC / LOLC / Commercial Bank" style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #bfdbfe', boxSizing: 'border-box', fontWeight: 600 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>ශාඛාව</label>
                    <input value={form.branchName} onChange={e => setForm(p => ({ ...p, branchName: e.target.value }))} placeholder="Colombo Main" style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #bfdbfe', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>ණය ගිණුම් අංකය</label>
                    <input value={form.accountNumber} onChange={e => setForm(p => ({ ...p, accountNumber: e.target.value }))} placeholder="LN-XXXX" style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #bfdbfe', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>ණයේ අරමුණ</label>
                    <select value={form.loanPurpose} onChange={e => setForm(p => ({ ...p, loanPurpose: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #bfdbfe', boxSizing: 'border-box' }}>
                      {LOAN_PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Loan Amount & Terms */}
              <div style={{ background: '#fff7ed', border: '2px solid #fdba74', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#ea580c', marginBottom: 10 }}>💰 ණය මුදල හා කාලසීමා</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>ණය මුදල (Rs.) *</label>
                    <input type="number" value={form.principalAmount} onChange={e => setForm(p => ({ ...p, principalAmount: e.target.value }))} placeholder="0" style={{ width: '100%', padding: 10, borderRadius: 8, border: '2px solid #ea580c', fontSize: 16, fontWeight: 800, textAlign: 'right', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>පොලිය % (වාර්ෂික) *</label>
                    <input type="number" step="0.01" value={form.interestRate} onChange={e => setForm(p => ({ ...p, interestRate: e.target.value }))} placeholder="14" style={{ width: '100%', padding: 10, borderRadius: 8, border: '2px solid #f59e0b', fontSize: 16, fontWeight: 800, textAlign: 'right', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>කාලය (මාස) *</label>
                    <input type="number" value={form.loanTermMonths} onChange={e => setForm(p => ({ ...p, loanTermMonths: e.target.value }))} placeholder="60" style={{ width: '100%', padding: 10, borderRadius: 8, border: '2px solid #8b5cf6', fontSize: 16, fontWeight: 800, textAlign: 'right', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>පොලී ක්‍රමය</label>
                    <select value={form.interestType} onChange={e => setForm(p => ({ ...p, interestType: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #fed7aa', fontWeight: 700, boxSizing: 'border-box' }}>
                      <option value="reducing">📉 අඩුවන ශේෂය</option>
                      <option value="flat">📊 ස්ථිර පොලිය</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>ණය ලබාගත් දිනය</label>
                    <input type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #fed7aa', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>1වන EMI දිනය</label>
                    <input type="date" value={form.firstEmiDate} onChange={e => setForm(p => ({ ...p, firstEmiDate: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #fed7aa', boxSizing: 'border-box' }} />
                  </div>
                </div>
              </div>

              {/* Live EMI */}
              {liveEMI && (
                <div style={{ background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', border: '2px solid #93c5fd', borderRadius: 12, padding: 16, marginBottom: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#1e40af', marginBottom: 10, textAlign: 'center' }}>🧮 EMI පරිගණනය</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
                    <div style={{ background: 'white', padding: 10, borderRadius: 8, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: '#64748b' }}>මුළු පොලිය</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#ea580c' }}>Rs.{fmtC(liveEMI.totalInterest)}</div>
                    </div>
                    <div style={{ background: 'white', padding: 10, borderRadius: 8, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: '#64748b' }}>මුළු ගෙවීම</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#dc2626' }}>Rs.{fmtC(liveEMI.totalPayable)}</div>
                    </div>
                    <div style={{ background: 'white', padding: 10, borderRadius: 8, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: '#64748b' }}>වාරික ගණන</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#2563eb' }}>{toNum(form.loanTermMonths)}</div>
                    </div>
                  </div>
                  <div style={{ background: '#1e40af', color: 'white', padding: 12, borderRadius: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, opacity: 0.9 }}>මාසික EMI</div>
                    <div style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>Rs.{fmtC(liveEMI.emi)}</div>
                  </div>
                </div>
              )}

              {/* Officer Details (Optional) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>👨‍💼 ණය නිලධාරී නම</label>
                  <input value={form.officerName} onChange={e => setForm(p => ({ ...p, officerName: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>📞 නිලධාරී දුරකථන</label>
                  <input value={form.officerPhone} onChange={e => setForm(p => ({ ...p, officerPhone: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>🏘️ ඇපකර / Collateral</label>
                <input value={form.collateral} onChange={e => setForm(p => ({ ...p, collateral: e.target.value }))} placeholder="Vehicle, Property, etc." style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>📝 සටහන්</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>

              <button onClick={handleSaveLoan} disabled={saving} style={{ width: '100%', padding: 14, background: saving ? '#94a3b8' : 'linear-gradient(135deg,#1e40af,#3b82f6)', color: 'white', border: 'none', borderRadius: 12, fontWeight: 800, fontSize: 15, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? '⏳ සුරකිමින්...' : '✅ බැංකු ලෝන් එක සුරකින්න'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          MODAL: PAY EMI
          ═══════════════════════════════════════════════════════════ */}
      {payLoan && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 15 }}>
          <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 500, overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: '18px 22px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>💳 EMI වාරිකය ගෙවන්න</h3>
              <button onClick={() => setPayLoan(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '50%', width: 34, height: 34, fontSize: 16, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ background: '#eff6ff', borderRadius: 12, padding: 14, marginBottom: 16, border: '1px solid #bfdbfe' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e40af' }}>🏦 {payLoan.institutionName}</div>
                {payLoan.accountNumber && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>#{payLoan.accountNumber}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12 }}>
                  <span style={{ color: '#64748b' }}>ඉතිරි ශේෂය:</span>
                  <span style={{ fontWeight: 900, color: '#dc2626', fontSize: 15 }}>Rs.{fmtC(payLoan.remainingBalance)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 12 }}>
                  <span style={{ color: '#64748b' }}>මාසික EMI:</span>
                  <span style={{ fontWeight: 800, color: '#2563eb' }}>Rs.{fmtC(payLoan.emiAmount)}</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>📅 ගෙවීමේ දිනය</label>
                  <input type="date" value={paymentForm.paymentDate} onChange={e => setPaymentForm(p => ({ ...p, paymentDate: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>🗓️ මාසය</label>
                  <input type="month" value={paymentForm.installmentMonth} onChange={e => setPaymentForm(p => ({ ...p, installmentMonth: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>💰 ගෙවන මුදල *</label>
                <input type="number" step="0.01" value={paymentForm.amount} onChange={e => setPaymentForm(p => ({ ...p, amount: e.target.value }))} style={{ width: '100%', padding: 12, borderRadius: 10, border: '2px solid #1e40af', fontSize: 22, fontWeight: 800, textAlign: 'center', boxSizing: 'border-box' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: paymentForm.paymentMethod === 'bank' ? '1fr 1fr' : '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>💳 ක්‍රමය</label>
                  <select value={paymentForm.paymentMethod} onChange={e => setPaymentForm(p => ({ ...p, paymentMethod: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}>
                    <option value="bank">🏦 Bank Transfer</option>
                    <option value="cash">💵 Cash</option>
                    <option value="cheque">📝 Cheque</option>
                  </select>
                </div>
                {paymentForm.paymentMethod === 'bank' && (
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>🏦 බැංකුව *</label>
                    <select value={paymentForm.bankAccountId} onChange={e => setPaymentForm(p => ({ ...p, bankAccountId: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}>
                      <option value="">-- තෝරන්න --</option>
                      {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.bankName}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>📋 යොමු අංකය</label>
                  <input value={paymentForm.referenceNo} onChange={e => setPaymentForm(p => ({ ...p, referenceNo: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>📝 සටහන</label>
                  <input value={paymentForm.notes} onChange={e => setPaymentForm(p => ({ ...p, notes: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>
              </div>

              <button onClick={handleRecordPayment} disabled={saving} style={{ width: '100%', padding: 14, background: saving ? '#94a3b8' : 'linear-gradient(135deg,#1e40af,#3b82f6)', color: 'white', border: 'none', borderRadius: 12, fontWeight: 800, fontSize: 15, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? '⏳ ගෙවමින්...' : `✅ Rs.${fmtC(toNum(paymentForm.amount))} ගෙවන්න`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          MODAL: AMORTIZATION SCHEDULE
          ═══════════════════════════════════════════════════════════ */}
      {scheduleLoan && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, overflowY: 'auto' }}>
          <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 800, margin: '20px 0', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#7c3aed,#8b5cf6)', padding: '20px 24px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>📊 Amortization Schedule</h2>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>{scheduleLoan.institutionName} · {scheduleLoan.loanTermMonths} මාස</div>
              </div>
              <button onClick={() => setScheduleLoan(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '50%', width: 34, height: 34, fontSize: 16, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ maxHeight: 500, overflowY: 'auto', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#f1f5f9', zIndex: 1 }}>
                    <tr>
                      {['#', 'දිනය', 'EMI', 'මුලධනය', 'පොලිය', 'ශේෂය'].map((h, i) => (
                        <th key={i} style={{ padding: '10px 8px', textAlign: i === 0 ? 'center' : 'right', fontWeight: 800, color: '#475569', borderBottom: '2px solid #cbd5e1' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {currentSchedule.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                        <td style={{ padding: '8px', textAlign: 'center', fontWeight: 800, color: '#1e293b' }}>{row.month}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#64748b' }}>{fmtDate(row.dueDate)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800, color: '#1e293b' }}>{fmtC(row.emi)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#2563eb', fontWeight: 700 }}>{fmtC(row.principal)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#dc2626', fontWeight: 700 }}>{fmtC(row.interest)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800, color: '#059669' }}>{fmtC(row.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}