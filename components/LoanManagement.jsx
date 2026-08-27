'use client';

// components/LoanManagement.jsx
// ★ Customer Lending System v3.1 — CRITICAL TIMESTAMPS FIXED FOR CASH REGISTER
// Features:
//   1. Real customer autocomplete search
//   2. Existing customer selector
//   3. New customer auto-creation option
//   4. Payment recording with Cash Register Sync (TIMESTAMPS FIXED WITH Timestamp.now())

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from "@/firebaseConfig";
import { useUserAuth } from "@/context/UserContext";
import {
  collection, onSnapshot, doc, query, where,
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

const addDays = (dateStr, days) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + Number(days));
  return `${d.getFullYear()}-${padZ(d.getMonth()+1)}-${padZ(d.getDate())}`;
};

const daysBetween = (d1, d2) => {
  const a = new Date(d1), b = new Date(d2);
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
};

const slugify = (s) => String(s || 'customer').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const makePortalKey = (name) => `${slugify(name)}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const calcCustomerLoan = (principal, annualRate, termMonths, collectionMethod) => {
  const totalInterest = principal * (annualRate / 100) * (termMonths / 12);
  const totalPayable = principal + totalInterest;

  let installmentAmount = 0;
  let installmentCount = 0;
  let intervalDays = 30;

  switch (collectionMethod) {
    case 'daily':
      installmentCount = termMonths * 30;
      intervalDays = 1;
      break;
    case 'weekly':
      installmentCount = Math.ceil(termMonths * 4.33);
      intervalDays = 7;
      break;
    case 'monthly':
    default:
      installmentCount = termMonths;
      intervalDays = 30;
      break;
  }

  installmentAmount = installmentCount > 0 ? totalPayable / installmentCount : 0;

  return {
    totalInterest: Math.round(totalInterest * 100) / 100,
    totalPayable: Math.round(totalPayable * 100) / 100,
    installmentAmount: Math.round(installmentAmount * 100) / 100,
    installmentCount,
    intervalDays,
  };
};

const COLLECTION_METHODS = {
  daily:   { label: 'දෛනික',    icon: '📅', color: '#dc2626', bg: '#fef2f2', days: 1 },
  weekly:  { label: 'සතිපතා',   icon: '📆', color: '#7c3aed', bg: '#faf5ff', days: 7 },
  monthly: { label: 'මාසික',    icon: '🗓️', color: '#2563eb', bg: '#eff6ff', days: 30 },
};

const STATUS_CFG = {
  active:    { label: 'ක්‍රියාකාරී', color: '#16a34a', bg: '#f0fdf4' },
  overdue:   { label: 'ප්‍රමාදයි',    color: '#dc2626', bg: '#fef2f2' },
  completed: { label: 'සම්පූර්ණයි',  color: '#2563eb', bg: '#eff6ff' },
  defaulted: { label: 'අක්‍රීය',      color: '#991b1b', bg: '#fef2f2' },
};

const CustomerSearchSelect = ({ customers, selectedCustomer, onSelect, onNew }) => {
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (selectedCustomer) setSearch(selectedCustomer.name);
  }, [selectedCustomer]);

  useEffect(() => {
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = useMemo(() => {
    if (!search) return customers.slice(0, 20);
    const q = search.toLowerCase();
    return customers.filter(c => {
      const hay = [c.name, c.phone, c.nic, c.address].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    }).slice(0, 30);
  }, [customers, search]);

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setShowDropdown(true);
              if (selectedCustomer) onSelect(null);
            }}
            onFocus={() => setShowDropdown(true)}
            placeholder="🔍 පාරිභෝගිකයෙක් සොයන්න (නම / දුරකථන / NIC)..."
            style={{
              width: '100%', padding: '11px 14px', borderRadius: 10,
              border: selectedCustomer ? '2px solid #16a34a' : '2px solid #cbd5e1',
              fontSize: 14, fontWeight: selectedCustomer ? 700 : 500,
              background: selectedCustomer ? '#f0fdf4' : 'white',
              color: selectedCustomer ? '#166534' : '#1e293b',
              boxSizing: 'border-box', outline: 'none',
            }}
          />
          {selectedCustomer && <span style={{ position: 'absolute', right: 40, top: '50%', transform: 'translateY(-50%)', color: '#16a34a', fontSize: 18 }}>✓</span>}
          {search && <button onClick={() => { setSearch(''); onSelect(null); setShowDropdown(true); }} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#94a3b8' }}>✕</button>}
        </div>
        <button type="button" onClick={onNew} style={{ padding: '11px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>➕ නව</button>
      </div>

      {showDropdown && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', maxHeight: 320, overflowY: 'auto', zIndex: 100 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>🔍 පාරිභෝගිකයන් හමු නොවීය.</div>
          ) : (
            <>
              <div style={{ padding: '8px 12px', background: '#f8fafc', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>{filtered.length} ලැබී ඇත</div>
              {filtered.map(c => (
                <button
                  key={c.id} type="button"
                  onClick={() => { onSelect(c); setShowDropdown(false); setSearch(c.name); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', background: selectedCustomer?.id === c.id ? '#f0fdf4' : 'white', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 14 }}>{(c.name || '?')[0].toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>📞 {c.phone}</div>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default function LoanManagement() {
  const { user } = useUserAuth();
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [activeTab, setActiveTab] = useState('all');
  const [filterMethod, setFilterMethod] = useState('all');
  const [searchQ, setSearchQ] = useState('');

  const [showNewModal, setShowNewModal] = useState(false);
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [payLoan, setPayLoan] = useState(null);
  const [detailLoan, setDetailLoan] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', phoneSuffix: '', nic: '', address: '' });
  const [savingCustomer, setSavingCustomer] = useState(false);

  const [form, setForm] = useState({ guarantorName: '', guarantorPhone: '', principalAmount: '', interestRate: '', loanTermMonths: '', collectionMethod: 'daily', startDate: todayStr(), notes: '' });
  const [paymentForm, setPaymentForm] = useState({ amount: '', paymentMethod: 'cash', bankAccountId: '', receiptNo: '', paymentDate: todayStr(), notes: '' });

  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);

    const u1 = onSnapshot(collection(db, `users/${user.uid}/customerLoans`), s => {
      setLoans(s.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    const u2 = onSnapshot(collection(db, `users/${user.uid}/customerLoanPayments`), s => {
      setPayments(s.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const u3 = onSnapshot(collection(db, `users/${user.uid}/bankAccounts`), s => {
      setBankAccounts(s.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const u4 = onSnapshot(query(collection(db, 'customers'), where('uid', '==', user.uid)), s => {
      setCustomers(s.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { u1(); u2(); u3(); u4(); };
  }, [user]);

  const liveCalc = useMemo(() => {
    const p = toNum(form.principalAmount);
    const r = toNum(form.interestRate);
    const t = toNum(form.loanTermMonths);
    if (p <= 0 || t <= 0) return null;
    return calcCustomerLoan(p, r, t, form.collectionMethod);
  }, [form.principalAmount, form.interestRate, form.loanTermMonths, form.collectionMethod]);

  const metrics = useMemo(() => {
    const today = todayStr();
    let activeCount = 0, overdueCount = 0, completedCount = 0;
    let totalLent = 0, totalCollected = 0, totalOutstanding = 0;
    let todayExpected = 0, todayCollected = 0, monthlyExpected = 0;

    loans.forEach(loan => {
      const rem = toNum(loan.remainingBalance);
      const paid = toNum(loan.paidAmount);
      totalLent += toNum(loan.principalAmount);
      totalCollected += paid;

      if (loan.status === 'completed') {
        completedCount++;
        return;
      }

      totalOutstanding += rem;
      activeCount++;

      if (loan.nextDueDate && loan.nextDueDate < today) overdueCount++;
      if (loan.collectionMethod === 'daily' && loan.status === 'active') todayExpected += toNum(loan.installmentAmount);
      if (loan.collectionMethod === 'monthly') monthlyExpected += toNum(loan.installmentAmount);
      else if (loan.collectionMethod === 'daily') monthlyExpected += toNum(loan.installmentAmount) * 30;
      else if (loan.collectionMethod === 'weekly') monthlyExpected += toNum(loan.installmentAmount) * 4;
    });

    payments.forEach(p => {
      if (p.paymentDate === today) todayCollected += toNum(p.amount);
    });

    return { activeCount, overdueCount, completedCount, totalLent, totalCollected, totalOutstanding, todayExpected, todayCollected, monthlyExpected };
  }, [loans, payments]);

  const filteredLoans = useMemo(() => {
    const today = todayStr();
    const q = searchQ.toLowerCase().trim();

    return loans.filter(loan => {
      if (activeTab === 'today') {
        const paidToday = payments.some(p => p.loanId === loan.id && p.paymentDate === today);
        if (loan.status !== 'active' || paidToday) return false;
      }
      if (activeTab === 'overdue') {
        if (loan.status !== 'active') return false;
        if (!loan.nextDueDate || loan.nextDueDate >= today) return false;
      }
      if (activeTab === 'completed') {
        if (loan.status !== 'completed') return false;
      }
      if (filterMethod !== 'all' && loan.collectionMethod !== filterMethod) return false;
      if (q) {
        const hay = [loan.customerName, loan.customerPhone, loan.customerNIC, loan.guarantorName].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      const aOverdue = a.nextDueDate && a.nextDueDate < today && a.status === 'active';
      const bOverdue = b.nextDueDate && b.nextDueDate < today && b.status === 'active';
      if (aOverdue && !bOverdue) return -1;
      if (bOverdue && !aOverdue) return 1;
      return toNum(b.remainingBalance) - toNum(a.remainingBalance);
    });
  }, [loans, payments, activeTab, filterMethod, searchQ]);

  const handleCreateNewCustomer = async () => {
    if (!newCustomerForm.name || !newCustomerForm.phoneSuffix) return alert('❌ නම සහ දුරකථනය අවශ්‍යයි');
    setSavingCustomer(true);
    try {
      const newDoc = await addDoc(collection(db, 'customers'), {
        name: newCustomerForm.name, phone: `+94${newCustomerForm.phoneSuffix}`, nic: newCustomerForm.nic || '', address: newCustomerForm.address || '',
        uid: user.uid, currentBalance: 0, portalAccessKey: makePortalKey(newCustomerForm.name), createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      setSelectedCustomer({ id: newDoc.id, name: newCustomerForm.name, phone: `+94${newCustomerForm.phoneSuffix}`, nic: newCustomerForm.nic, address: newCustomerForm.address, currentBalance: 0 });
      setShowNewCustomerModal(false);
      setNewCustomerForm({ name: '', phoneSuffix: '', nic: '', address: '' });
    } catch (err) { alert('❌ ' + err.message); }
    setSavingCustomer(false);
  };

  const handleSaveLoan = async () => {
    if (!user?.uid || !selectedCustomer) return alert('❌ පාරිභෝගිකයා තෝරන්න');
    const p = toNum(form.principalAmount);
    const t = toNum(form.loanTermMonths);
    if (p <= 0 || t <= 0) return alert('❌ වලංගු ණය මුදලක් සහ කාලසීමාවක් අවශ්‍යයි');

    setSaving(true);
    try {
      const calc = calcCustomerLoan(p, toNum(form.interestRate), t, form.collectionMethod);
      const nextDueDate = addDays(form.startDate, COLLECTION_METHODS[form.collectionMethod].days);
      const batch = writeBatch(db);

      const loanRef = doc(collection(db, `users/${user.uid}/customerLoans`));
      batch.set(loanRef, {
        customerId: selectedCustomer.id, customerName: selectedCustomer.name, customerPhone: selectedCustomer.phone, customerNIC: selectedCustomer.nic || '', customerAddress: selectedCustomer.address || '',
        guarantorName: form.guarantorName, guarantorPhone: form.guarantorPhone, principalAmount: p, interestRate: toNum(form.interestRate), loanTermMonths: t,
        totalInterest: calc.totalInterest, totalPayable: calc.totalPayable, installmentAmount: calc.installmentAmount, installmentCount: calc.installmentCount, intervalDays: calc.intervalDays,
        collectionMethod: form.collectionMethod, startDate: form.startDate, notes: form.notes, paidAmount: 0, remainingBalance: calc.totalPayable, installmentsPaid: 0, status: 'active', nextDueDate, endDate: addMonths(form.startDate, t), createdAt: serverTimestamp(), uid: user.uid
      });

      // ★ REALTIME SYNC FIX: Uses exact current timestamp instead of midnight date
      const cashRef = doc(collection(db, `users/${user.uid}/cashTransactions`));
      batch.set(cashRef, {
        type: 'out', source: 'customerLoanIssue', category: 'customerLoanIssue', amount: p, loanId: loanRef.id, customerId: selectedCustomer.id, customerName: selectedCustomer.name, customerPhone: selectedCustomer.phone, paymentMethod: 'cash',
        description: `📤 ණය නිකුත් කිරීම - ${selectedCustomer.name} (Rs.${fmtC(p)})`,
        date: todayStr(), time: nowHHMM(), timestamp: Timestamp.now(), createdAt: serverTimestamp(), uid: user.uid, createdBy: user.email || ''
      });

      await batch.commit();
      alert('✅ ණය නිකුත් කිරීම සාර්ථකයි!');
      setShowNewModal(false);
      setSelectedCustomer(null);
      setForm({ guarantorName: '', guarantorPhone: '', principalAmount: '', interestRate: '', loanTermMonths: '', collectionMethod: 'daily', startDate: todayStr(), notes: '' });
    } catch (err) { alert('❌ ' + err.message); }
    setSaving(false);
  };

  const handleRecordPayment = async () => {
    if (!user?.uid || !payLoan) return;
    const amt = toNum(paymentForm.amount);
    if (amt <= 0) return alert('❌ මුදල ඇතුළත් කරන්න');

    setSaving(true);
    try {
      const batch = writeBatch(db);
      const payRef = doc(collection(db, `users/${user.uid}/customerLoanPayments`));
      batch.set(payRef, {
        loanId: payLoan.id, customerId: payLoan.customerId || '', customerName: payLoan.customerName, amount: amt, paymentDate: paymentForm.paymentDate, paymentMethod: paymentForm.paymentMethod, bankAccountId: paymentForm.bankAccountId || '', receiptNo: paymentForm.receiptNo || '', notes: paymentForm.notes || '', installmentAmount: payLoan.installmentAmount, createdAt: serverTimestamp(), uid: user.uid
      });

      const newRem = Math.max(0, toNum(payLoan.remainingBalance) - amt);
      const isComplete = newRem <= 0.01;
      const nextDue = isComplete ? null : addDays(paymentForm.paymentDate, payLoan.intervalDays || 1);

      const loanRef = doc(db, `users/${user.uid}/customerLoans`, payLoan.id);
      batch.update(loanRef, { paidAmount: increment(amt), remainingBalance: increment(-amt), installmentsPaid: increment(1), status: isComplete ? 'completed' : 'active', nextDueDate: nextDue, lastPaymentDate: paymentForm.paymentDate, updatedAt: serverTimestamp() });

      // ★ REALTIME SYNC FIX: Sync payment using standard exact Timestamp.now()
      const cashRef = doc(collection(db, `users/${user.uid}/cashTransactions`));
      batch.set(cashRef, {
        type: 'in', source: 'customerLoanCollection', category: 'customerLoanCollection', amount: amt, loanId: payLoan.id, customerId: payLoan.customerId || '', customerName: payLoan.customerName, paymentMethod: paymentForm.paymentMethod, bankAccountId: paymentForm.bankAccountId || '',
        description: `💰 ණය එකතු කිරීම - ${payLoan.customerName} (Rs.${fmtC(amt)})`,
        date: todayStr(), time: nowHHMM(), timestamp: Timestamp.now(), createdAt: serverTimestamp(), uid: user.uid, createdBy: user.email || ''
      });

      if (paymentForm.paymentMethod === 'bank' && paymentForm.bankAccountId) {
        batch.update(doc(db, `users/${user.uid}/bankAccounts`, paymentForm.bankAccountId), { currentBalance: increment(amt), liveBalance: increment(amt), updatedAt: serverTimestamp() });
      }

      await batch.commit();
      alert('✅ ගෙවීම සාර්ථකව සටහන් විය!');
      setPayLoan(null);
      setPaymentForm({ amount: '', paymentMethod: 'cash', bankAccountId: '', receiptNo: '', paymentDate: todayStr(), notes: '' });
    } catch (err) { alert('❌ ' + err.message); }
    setSaving(false);
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 20, fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: '#0f172a' }}>💰 පාරිභෝගික ණය කළමනාකරණය</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>පොලියට ණය නිකුත් කිරීම · දෛනික/සතිපතා/මාසික එකතු කිරීම්</p>
        </div>
        <button onClick={() => setShowNewModal(true)} style={{ padding: '12px 20px', background: 'linear-gradient(135deg,#059669,#10b981)', color: 'white', border: 'none', borderRadius: 12, fontWeight: 800, cursor: 'pointer' }}>➕ නව ණයක් නිකුත් කරන්න</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div style={{ background: 'linear-gradient(135deg,#059669,#10b981)', color: 'white', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 11, opacity: 0.9, fontWeight: 700 }}>📤 මුළු නිකුත් කළ මුදල්</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>Rs.{fmtC(metrics.totalLent)}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg,#2563eb,#3b82f6)', color: 'white', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 11, opacity: 0.9, fontWeight: 700 }}>💰 ලැබීමට ඇති මුදල්</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>Rs.{fmtC(metrics.totalOutstanding)}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg,#dc2626,#ef4444)', color: 'white', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 11, opacity: 0.9, fontWeight: 700 }}>⚠️ ප්‍රමාද වූ ණය</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>{metrics.overdueCount}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg,#f59e0b,#fbbf24)', color: 'white', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 11, opacity: 0.9, fontWeight: 700 }}>📅 අද එකතු වීමට</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>Rs.{fmtC(metrics.todayExpected)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', borderBottom: '2px solid #e2e8f0', paddingBottom: 8 }}>
        {[{ id: 'all', label: '📋 සියලුම' }, { id: 'today', label: '📅 අද එකතු කිරීම්' }, { id: 'overdue', label: '⚠️ ප්‍රමාද' }, { id: 'completed', label: '✅ සම්පූර්ණ' }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '10px 16px', background: activeTab === tab.id ? '#059669' : 'transparent', color: activeTab === tab.id ? 'white' : '#64748b', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>{tab.label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input type="text" placeholder="🔍 සොයන්න (නම, දුරකථන, NIC)..." value={searchQ} onChange={e => setSearchQ(e.target.value)} style={{ flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13 }} />
        <select value={filterMethod} onChange={e => setFilterMethod(e.target.value)} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, background: 'white', fontWeight: 600 }}>
          <option value="all">සියලු ක්‍රම</option>
          <option value="daily">📅 දෛනික</option>
          <option value="weekly">📆 සතිපතා</option>
          <option value="monthly">🗓️ මාසික</option>
        </select>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {filteredLoans.map(loan => {
          const method = COLLECTION_METHODS[loan.collectionMethod] || COLLECTION_METHODS.monthly;
          const status = STATUS_CFG[loan.status] || STATUS_CFG.active;
          const progress = loan.totalPayable > 0 ? (toNum(loan.paidAmount) / loan.totalPayable) * 100 : 0;
          const today = todayStr();
          const isOverdue = loan.nextDueDate && loan.nextDueDate < today && loan.status === 'active';

          return (
            <div key={loan.id} style={{ background: 'white', borderRadius: 14, border: `1px solid ${isOverdue ? '#fca5a5' : '#e2e8f0'}`, borderLeft: `6px solid ${isOverdue ? '#dc2626' : loan.status === 'completed' ? '#16a34a' : method.color}`, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#1e293b' }}>👤 {loan.customerName}</h3>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>📞 {loan.customerPhone} | 📅 මීළඟ දිනය: {fmtDate(loan.nextDueDate)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#dc2626' }}>Rs.{fmtC(loan.remainingBalance)}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>වාරිකය: Rs.{fmtC(loan.installmentAmount)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                <button onClick={() => setDetailLoan(loan)} style={{ padding: '8px 14px', background: '#f1f5f9', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>👁️ විස්තර</button>
                {loan.status !== 'completed' && <button onClick={() => { setPayLoan(loan); setPaymentForm(p => ({ ...p, amount: String(loan.installmentAmount) })); }} style={{ padding: '8px 14px', background: 'linear-gradient(135deg,#10b981,#059669)', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>💰 ගෙවීම් එකතු කරන්න</button>}
              </div>
            </div>
          );
        })}
      </div>

      {showNewModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, overflowY: 'auto' }}>
          <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 640, margin: '20px 0', padding: 24 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 20 }}>💰 නව පාරිභෝගික ණයක් නිකුත් කිරීම</h2>
            <CustomerSearchSelect customers={customers} selectedCustomer={selectedCustomer} onSelect={setSelectedCustomer} onNew={() => setShowNewCustomerModal(true)} />
            {selectedCustomer && (
              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div><label>ණය මුදල *</label><input type="number" value={form.principalAmount} onChange={e => setForm(p => ({ ...p, principalAmount: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1' }} /></div>
                <div><label>පොලිය %</label><input type="number" value={form.interestRate} onChange={e => setForm(p => ({ ...p, interestRate: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1' }} /></div>
                <div><label>කාලය (මාස) *</label><input type="number" value={form.loanTermMonths} onChange={e => setForm(p => ({ ...p, loanTermMonths: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1' }} /></div>
              </div>
            )}
            {liveCalc && <div style={{ background: '#ecfdf5', padding: 12, borderRadius: 10, marginTop: 12 }}>මුළු වාරිකය: Rs.{fmtC(liveCalc.installmentAmount)}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}><button onClick={() => setShowNewModal(false)} style={{ flex: 1, padding: 12, borderRadius: 8, border: '1px solid #cbd5e1' }}>අවලංගු කරන්න</button><button onClick={handleSaveLoan} style={{ flex: 1, padding: 12, background: '#059669', color: 'white', border: 'none', borderRadius: 8 }}>සුරකින්න</button></div>
          </div>
        </div>
      )}

      {showNewCustomerModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', padding: 20, borderRadius: 16, width: '100%', maxWidth: 400 }}>
            <h3>➕ නව පාරිභෝගිකයා</h3>
            <input placeholder="නම" value={newCustomerForm.name} onChange={e => setNewCustomerForm(p => ({ ...p, name: e.target.value }))} style={{ width: '100%', padding: 10, marginBottom: 10, borderRadius: 8 }} />
            <input placeholder="දුරකථනය" value={newCustomerForm.phoneSuffix} onChange={e => setNewCustomerForm(p => ({ ...p, phoneSuffix: e.target.value }))} style={{ width: '100%', padding: 10, marginBottom: 20, borderRadius: 8 }} />
            <button onClick={handleCreateNewCustomer} style={{ width: '100%', padding: 12, background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8 }}>එකතු කරන්න</button>
          </div>
        </div>
      )}

      {payLoan && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', padding: 20, borderRadius: 16, width: '100%', maxWidth: 440 }}>
            <h3>💰 ණය වාරිකය එකතු කිරීම</h3>
            <input type="number" value={paymentForm.amount} onChange={e => setPaymentForm(p => ({ ...p, amount: e.target.value }))} style={{ width: '100%', padding: 12, fontSize: 20, textAlign: 'center', marginBottom: 14 }} />
            <button onClick={handleRecordPayment} style={{ width: '100%', padding: 14, background: '#10b981', color: 'white', border: 'none', borderRadius: 8 }}>වාරිකය එකතු කරන්න</button>
          </div>
        </div>
      )}
    </div>
  );
}