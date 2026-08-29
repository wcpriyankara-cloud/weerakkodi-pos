'use client';

// components/BankLoanManagement.jsx
// ★ Bank Loan + Chit Fund / Group Savings Management (v36.1 — Fixed Missing Loan Data)

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db, storage } from "@/firebaseConfig";
import { useUserAuth } from "@/context/UserContext";
import {
  ref as storageRef, uploadBytes, getDownloadURL
} from 'firebase/storage';
import {
  collection, onSnapshot, doc,
  addDoc, updateDoc, increment, writeBatch,
  serverTimestamp, Timestamp,
} from "firebase/firestore";

/* ════════════════════════════════════════
   1. TRANSLATIONS (Condensed — Same as v36.0)
   ════════════════════════════════════════ */
const TRANSLATIONS = {
  si: {
    tabLoans: '🏦 බැංකු ලෝන්', tabChitFunds: '🎫 සීට්ටු / සමිති',
    title: '🏦 බැංකු ලෝන් සහ මූල්‍ය ආයතන ණය',
    subtitle: 'EMI පරිගණනය · මාසික වාරික · Amortization Schedule',
    addNewLoan: '➕ නව බැංකු ලෝන් එකක්',
    totalBalance: '💸 මුළු ණය ශේෂය', active: 'ක්‍රියාකාරී',
    monthlyPayments: '📅 මාසික ගෙවීම්', thisMonth: 'මේ මාසය',
    totalInterest: '🎯 මුළු පොලී වියදම', totalLoan: 'මුළු ණය මුදල',
    overduePayments: '⚠️ ප්‍රමාද වූ වාරික', payImmediately: 'වහාම ගෙවන්න',
    searchPlaceholder: '🔍 සොයන්න...', allTypes: 'සියලු වර්ග', allStatus: 'සියලු තත්ත්ව',
    overdue: 'ප්‍රමාද', completed: 'සම්පූර්ණ',
    noLoansFound: 'බැංකු ලෝන් හමු නොවීය', loading: '⏳ දත්ත පූරණය වෙමින්...',
    reducingLabel: 'අඩුවන', flatLabel: 'ස්ථිර', next: 'මීළඟ',
    payProgress: 'ගෙවීම් ප්‍රගතිය', instalments: 'වාරික',
    loanAmount: 'ණය මුදල', interest: 'පොලිය', paid: 'ගෙවා ඇති',
    term: 'කාලය', months: 'මාස', schedule: '📊 කාලසටහන',
    payInstalment: '💳 වාරිකය ගෙවන්න',
    newLoanHeader: '🏦 නව බැංකු ලෝන් එකක් එකතු කරන්න',
    institutionType: '📌 ආයතන වර්ගය', institutionDetails: '🏛️ ආයතන තොරතුරු',
    institutionName: 'ආයතනයේ නම', branch: 'ශාඛාව', accNum: 'ණය ගිණුම් අංකය',
    purpose: 'ණයේ අරමුණ', loanAmountLabel: 'ණය මුදල (Rs.) *',
    interestLabel: 'පොලිය % (වාර්ෂික) *', interestType: 'පොලී ක්‍රමය',
    reducing: 'අඩුවන ශේෂය', flat: 'ස්ථිර පොලිය',
    loanDate: 'ණය ලබාගත් දිනය', firstEmi: '1වන EMI දිනය',
    calculateEMI: '🧮 EMI පරිගණනය', totalPayable: 'මුළු ගෙවීම',
    emiAmount: 'මාසික EMI', officerName: '👨‍💼 ණය නිලධාරී නම',
    officerPhone: '📞 නිලධාරී දුරකථන', collateral: '🏘️ ඇපකර',
    notes: '📝 සටහන්', saveLoan: '✅ බැංකු ලෝන් එක සුරකින්න',
    payEmiHeader: '💳 EMI වාරිකය ගෙවන්න', dueLabel: 'ඉතිරි ශේෂය',
    paymentDate: '📅 ගෙවීමේ දිනය', month: '🗓️ මාසය',
    paidAmount: '💰 ගෙවන මුදල', method: '💳 ක්‍රමය',
    bank: '🏦 බැංකුව', refNo: '📋 යොමු අංකය', note: '📝 සටහන',
    payBtn: 'ගෙවන්න', savingLabel: '⏳ සුරකිමින්...', due: 'ශේෂය',
    instBank: 'රාජ්‍ය බැංකුව', instPrivate: 'පෞද්ගලික බැංකුව',
    instFinance: 'මූල්‍ය ආයතනය', instLeasing: 'කල්බදු ආයතනය',
    instMicrofin: 'ක්ෂුද්‍ර මූල්‍ය', instOther: 'වෙනත්',
    purposeBusiness: 'ව්‍යාපාරික ණය', purposeHousing: 'නිවාස ණය',
    purposeVehicle: 'වාහන ණය', purposePersonal: 'පුද්ගලික ණය',
    purposeEducational: 'අධ්‍යාපන ණය', purposeAgricultural: 'කෘෂිකාර්මික',
    purposeEquipment: 'උපකරණ මිලදී ගැනීම', purposeOther: 'වෙනත්',
    statusActive: 'ක්‍රියාකාරී', statusOverdue: 'ප්‍රමාදයි',
    statusCompleted: 'සම්පූර්ණයි', statusRestructured: 'ප්‍රතිසැකසූ',
    daysOverdue: 'දින {days} ප්‍රමාදයි',
    errorInstitution: '❌ ආයතනයේ නම ඇතුළත් කරන්න',
    errorLoanAmt: '❌ වලංගු ණය මුදලක් ඇතුළත් කරන්න',
    errorTerm: '❌ කාලසීමාව ඇතුළත් කරන්න',
    errorAmount: '❌ වලංගු මුදලක් ඇතුළත් කරන්න',
    errorBank: '❌ බැංකු ගිණුම තෝරන්න',
    successRepay: '✅ වාරිකය සාර්ථකව ගෙවන ලදී!',
    successFullySettled: '🎉 ණය සම්පූර්ණයෙන් ගෙවා අවසන්!',
    successAdd: 'සාර්ථකව එකතු කරන ලදී!',
    cash: '💵 මුදල්', cheque: '📝 චෙක්', cancel: 'අවලංගු',
    selectBank: '-- තෝරන්න --',
    // Chit Fund
    chitTitle: '🎫 සීට්ටු / කන්ඩායම් සමිති',
    chitSubtitle: 'සීට්ටු, කන්ඩායම් සමිති, ධන සංචය ගනුදෙනු',
    addChitFund: '➕ නව සමිතියක්', chitName: 'සමිතියේ නම *',
    chitType: 'වර්ගය', chitTypeSeetu: '🎫 සීට්ටු', chitTypeGroup: '👥 කන්ඩායම් සමිතිය',
    chitTypeSavings: '💰 ධන සංචය', chitTypeOther: '📋 වෙනත්',
    organizer: 'සංවිධායක / බාරකරු', organizerPhone: 'දුරකථනය',
    monthlyAmount: 'මාසික වාරිකය (Rs.)', totalMembers: 'සාමාජික ගණන',
    duration: 'කාලය (මාස)', startDate: 'ආරම්භ දිනය',
    myTotalPaid: '💸 මා ගෙවූ', myTotalReceived: '💰 මට ලැබුණු',
    netPosition: '📊 ශුද්ධ ප්‍රතිඵලය',
    paymentOut: '💸 ගෙවීම (OUT)', receiptIn: '💰 ලැබීම (IN)',
    recordPayment: '💸 මුදල් ගෙවීමක් සටහන් කරන්න',
    recordReceipt: '💰 මුදල් ලැබීමක් සටහන් කරන්න',
    paymentAmount: 'ගෙවන මුදල (Rs.) *', receiptAmount: 'ලැබුණු මුදල (Rs.) *',
    paymentMethod: '💳 ක්‍රමය', bankAccount: '🏦 බැංකු ගිණුම',
    reference: '📋 යොමු අංකය', description: '📝 විස්තරය',
    saveBtn: '💾 සුරකින්න', saving: '⏳ සුරකිමින්...',
    noChitFunds: 'සීට්ටු / සමිති හමු නොවීය',
    activeLabel: 'ක්‍රියාකාරී', completedLabel: 'සම්පූර්ණ',
    transactions: 'ගනුදෙනු',
    successPayment: '✅ ගෙවීම සාර්ථකව සටහන් විය!',
    successReceipt: '✅ ලැබීම සාර්ථකව සටහන් විය!',
    errorName: '❌ සමිතියේ නම ඇතුළත් කරන්න',
    totalPaidAll: '💸 මුළු ගෙවූ', totalReceivedAll: '💰 මුළු ලැබුණු',
    netAll: '📊 ශුද්ධ ප්‍රතිඵලය', activeChits: '📋 ක්‍රියාකාරී',
  },
  en: {
    tabLoans: '🏦 Bank Loans', tabChitFunds: '🎫 Chit Funds / Groups',
    title: '🏦 Bank & Institution Loan Management',
    subtitle: 'EMI Calculation · Monthly Instalments · Amortization Schedule',
    addNewLoan: '➕ New Bank Loan',
    totalBalance: '💸 Total Remaining Balance', active: 'Active',
    monthlyPayments: '📅 Monthly Payments', thisMonth: 'This Month',
    totalInterest: '🎯 Total Interest Expense', totalLoan: 'Total Loan Amount',
    overduePayments: '⚠️ Overdue Instalments', payImmediately: 'Pay Immediately',
    searchPlaceholder: '🔍 Search...', allTypes: 'All Types', allStatus: 'All Statuses',
    overdue: 'Overdue', completed: 'Completed',
    noLoansFound: 'No bank loans found', loading: '⏳ Loading...',
    reducingLabel: 'Reducing', flatLabel: 'Flat', next: 'Next',
    payProgress: 'Repayment Progress', instalments: 'Instalments',
    loanAmount: 'Loan Amount', interest: 'Interest', paid: 'Paid',
    term: 'Term', months: 'Months', schedule: '📊 Schedule',
    payInstalment: '💳 Pay Instalment',
    newLoanHeader: '🏦 Add New Bank Loan',
    institutionType: '📌 Institution Type', institutionDetails: '🏛️ Institution Details',
    institutionName: 'Institution Name', branch: 'Branch', accNum: 'Loan Account Number',
    purpose: 'Loan Purpose', loanAmountLabel: 'Loan Amount (Rs.) *',
    interestLabel: 'Interest % (Annual) *', interestType: 'Interest Method',
    reducing: 'Reducing Balance', flat: 'Flat Interest',
    loanDate: 'Loan Taken Date', firstEmi: '1st EMI Date',
    calculateEMI: '🧮 EMI Calculation', totalPayable: 'Total Payable',
    emiAmount: 'Monthly EMI', officerName: '👨‍💼 Loan Officer Name',
    officerPhone: '📞 Officer Phone', collateral: '🏘️ Collateral',
    notes: '📝 Notes', saveLoan: '✅ Save Bank Loan',
    payEmiHeader: '💳 Pay EMI Instalment', dueLabel: 'Remaining Balance',
    paymentDate: '📅 Payment Date', month: '🗓️ Month',
    paidAmount: '💰 Paid Amount', method: '💳 Method',
    bank: '🏦 Bank', refNo: '📋 Reference No', note: '📝 Note',
    payBtn: 'Pay', savingLabel: '⏳ Saving...', due: 'Balance',
    instBank: 'State Bank', instPrivate: 'Private Bank',
    instFinance: 'Finance Company', instLeasing: 'Leasing Company',
    instMicrofin: 'Microfinance', instOther: 'Other',
    purposeBusiness: 'Business Loan', purposeHousing: 'Housing Loan',
    purposeVehicle: 'Vehicle Loan', purposePersonal: 'Personal Loan',
    purposeEducational: 'Educational Loan', purposeAgricultural: 'Agricultural',
    purposeEquipment: 'Equipment Purchase', purposeOther: 'Other',
    statusActive: 'Active', statusOverdue: 'Overdue',
    statusCompleted: 'Completed', statusRestructured: 'Restructured',
    daysOverdue: '{days} Days Overdue',
    errorInstitution: '❌ Please enter institution name',
    errorLoanAmt: '❌ Please enter valid loan amount',
    errorTerm: '❌ Please enter loan term',
    errorAmount: '❌ Please enter a valid amount',
    errorBank: '❌ Please select bank account',
    successRepay: '✅ Instalment paid successfully!',
    successFullySettled: '🎉 Loan is fully settled!',
    successAdd: 'successfully added!',
    cash: '💵 Cash', cheque: '📝 Cheque', cancel: 'Cancel',
    selectBank: '-- Select Bank --',
    chitTitle: '🎫 Chit Funds & Group Savings',
    chitSubtitle: 'Chit Funds, Group Savings, Community Pools',
    addChitFund: '➕ New Fund/Group', chitName: 'Fund/Group Name *',
    chitType: 'Type', chitTypeSeetu: '🎫 Chit Fund (Seetu)', chitTypeGroup: '👥 Group Savings',
    chitTypeSavings: '💰 Savings Pool', chitTypeOther: '📋 Other',
    organizer: 'Organizer / Manager', organizerPhone: 'Phone',
    monthlyAmount: 'Monthly Amount (Rs.)', totalMembers: 'Total Members',
    duration: 'Duration (Months)', startDate: 'Start Date',
    myTotalPaid: '💸 Total Paid', myTotalReceived: '💰 Total Received',
    netPosition: '📊 Net Position',
    paymentOut: '💸 Payment (OUT)', receiptIn: '💰 Receipt (IN)',
    recordPayment: '💸 Record a Payment', recordReceipt: '💰 Record a Receipt',
    paymentAmount: 'Payment Amount (Rs.) *', receiptAmount: 'Receipt Amount (Rs.) *',
    paymentMethod: '💳 Method', bankAccount: '🏦 Bank Account',
    reference: '📋 Reference No', description: '📝 Description',
    saveBtn: '💾 Save', saving: '⏳ Saving...',
    noChitFunds: 'No Chit Funds / Groups found',
    activeLabel: 'Active', completedLabel: 'Completed',
    transactions: 'Transactions',
    successPayment: '✅ Payment recorded successfully!',
    successReceipt: '✅ Receipt recorded successfully!',
    errorName: '❌ Please enter fund/group name',
    totalPaidAll: '💸 Total Paid', totalReceivedAll: '💰 Total Received',
    netAll: '📊 Net Position', activeChits: '📋 Active',
  },
};

/* ════════════════════════════════════════
   2. useLanguage HOOK
   ════════════════════════════════════════ */
function useLanguage() {
  const [lang, setLang] = useState('si');
  useEffect(() => {
    try { const saved = localStorage.getItem('language'); if (saved === 'en' || saved === 'si') setLang(saved); } catch {}
    const handleLangEvent = (e) => { const nl = e.detail || 'si'; if (nl === 'si' || nl === 'en') setLang(nl); };
    const handleStorage = (e) => { if (e.key === 'language') { const nl = e.newValue; if (nl === 'si' || nl === 'en') setLang(nl); } };
    window.addEventListener('app-language-change', handleLangEvent);
    window.addEventListener('storage', handleStorage);
    return () => { window.removeEventListener('app-language-change', handleLangEvent); window.removeEventListener('storage', handleStorage); };
  }, []);
  const t = useMemo(() => TRANSLATIONS[lang] || TRANSLATIONS.si, [lang]);
  return { lang, t };
}

/* ═══════════════════════════════════════
   3. UTILITIES
   ═══════════════════════════════════════ */
const toNum = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const fmtC = v => toNum(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const padZ = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${padZ(d.getMonth()+1)}-${padZ(d.getDate())}`; };
const nowHHMM = () => { const d = new Date(); return `${padZ(d.getHours())}:${padZ(d.getMinutes())}`; };

const formatDate = (val, lang = 'si') => {
  if (!val) return '—';
  if (val && (val.toDate || val instanceof Date)) {
    const d = val.toDate ? val.toDate() : val;
    return d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'si-LK', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  if (typeof val === 'string' && val.includes('-')) {
    try {
      const [y, m, d] = val.split('-');
      const mSi = ['ජන','පෙබ','මාර්','අප්‍ර','මැයි','ජූනි','ජූලි','අගෝ','සැප්','ඔක්','නොවැ','දෙසැ'];
      const mEn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${d} ${(lang === 'en' ? mEn : mSi)[parseInt(m, 10) - 1]} ${y}`;
    } catch { return val; }
  }
  return String(val);
};

const addMonths = (dateStr, months) => { const d = new Date(dateStr); d.setMonth(d.getMonth() + Number(months)); return `${d.getFullYear()}-${padZ(d.getMonth()+1)}-${padZ(d.getDate())}`; };
const daysBetween = (d1, d2) => { const a = new Date(d1), b = new Date(d2); return isNaN(a) || isNaN(b) ? 0 : Math.round((b - a) / 86400000); };

/* ═══════════════════════════════════════
   4. EMI ENGINE
   ═══════════════════════════════════════ */
const calcFlatEMI = (p, r, t) => { const ti = p * (r / 100) * (t / 12); const tp = p + ti; return { emi: t > 0 ? tp / t : 0, totalInterest: ti, totalPayable: tp }; };
const calcReducingEMI = (p, r, t) => { const mr = r / 100 / 12; if (mr === 0) return { emi: p / t, totalInterest: 0, totalPayable: p }; const emi = p * mr * Math.pow(1 + mr, t) / (Math.pow(1 + mr, t) - 1); const tp = emi * t; return { emi, totalInterest: tp - p, totalPayable: tp }; };
const calcLoanEMI = (p, r, t, type) => type === 'reducing' ? calcReducingEMI(p, r, t) : calcFlatEMI(p, r, t);
const generateAmortization = (p, r, t, type, startDate) => {
  const sched = [];
  if (type === 'reducing') {
    const mr = r / 100 / 12; const { emi } = calcReducingEMI(p, r, t); let bal = p;
    for (let i = 1; i <= t; i++) { const ip = bal * mr; const pp = emi - ip; bal = Math.max(0, bal - pp); sched.push({ month: i, dueDate: addMonths(startDate, i), emi: Math.round(emi * 100) / 100, principal: Math.round(pp * 100) / 100, interest: Math.round(ip * 100) / 100, balance: Math.round(bal * 100) / 100 }); }
  } else {
    const { emi, totalInterest } = calcFlatEMI(p, r, t); const mp = p / t; const mi = totalInterest / t; let bal = p;
    for (let i = 1; i <= t; i++) { bal = Math.max(0, bal - mp); sched.push({ month: i, dueDate: addMonths(startDate, i), emi: Math.round(emi * 100) / 100, principal: Math.round(mp * 100) / 100, interest: Math.round(mi * 100) / 100, balance: Math.round(bal * 100) / 100 }); }
  }
  return sched;
};

const S = {
  label: { display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 5 },
  input: { width: '100%', padding: '12px 14px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 14, boxSizing: 'border-box', outline: 'none' },
};

/* ════════════════════════════════════════════════════════════════
   5. CHIT FUND TAB COMPONENT
   ════════════════════════════════════════════════════════════════ */
function ChitFundTab({ user, t, lang, bankAccounts }) {
  const [chitFunds, setChitFunds] = useState([]);
  const [chitTxns, setChitTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [txnModal, setTxnModal] = useState(null);

  const [fundForm, setFundForm] = useState({
    name: '', type: 'seetu', organizer: '', organizerPhone: '',
    monthlyAmount: '', totalMembers: '', duration: '',
    startDate: todayStr(), notes: '',
  });
  const [txnForm, setTxnForm] = useState({
    amount: '', paymentMethod: 'cash', bankAccountId: '',
    referenceNo: '', date: todayStr(), description: '',
  });

  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);
    const u1 = onSnapshot(collection(db, `users/${user.uid}/chitFunds`), s => { setChitFunds(s.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); });
    const u2 = onSnapshot(collection(db, `users/${user.uid}/chitFundTransactions`), s => { setChitTxns(s.docs.map(d => ({ id: d.id, ...d.data() }))); });
    return () => { u1(); u2(); };
  }, [user?.uid]);

  const metrics = useMemo(() => {
    let totalPaid = 0, totalReceived = 0, activeCount = 0;
    chitFunds.forEach(f => { if (f.status !== 'completed') activeCount++; });
    chitTxns.forEach(tx => { if (tx.type === 'payment') totalPaid += toNum(tx.amount); if (tx.type === 'receipt') totalReceived += toNum(tx.amount); });
    return { totalPaid, totalReceived, net: totalReceived - totalPaid, activeCount };
  }, [chitFunds, chitTxns]);

  const CHIT_TYPES = {
    seetu: { label: t.chitTypeSeetu, icon: '🎫', color: '#7c3aed', bg: '#faf5ff' },
    group: { label: t.chitTypeGroup, icon: '👥', color: '#059669', bg: '#f0fdf4' },
    savings: { label: t.chitTypeSavings, icon: '💰', color: '#d97706', bg: '#fffbeb' },
    other: { label: t.chitTypeOther, icon: '📋', color: '#475569', bg: '#f8fafc' },
  };

  const handleSaveFund = async () => {
    if (!fundForm.name.trim()) return alert(t.errorName);
    setSaving(true);
    try {
      await addDoc(collection(db, `users/${user.uid}/chitFunds`), { ...fundForm, monthlyAmount: toNum(fundForm.monthlyAmount), totalMembers: toNum(fundForm.totalMembers), duration: toNum(fundForm.duration), totalPaid: 0, totalReceived: 0, status: 'active', createdAt: serverTimestamp(), uid: user.uid });
      alert(t.successAdd);
      setShowAddModal(false);
      setFundForm({ name: '', type: 'seetu', organizer: '', organizerPhone: '', monthlyAmount: '', totalMembers: '', duration: '', startDate: todayStr(), notes: '' });
    } catch (e) { alert('❌ ' + e.message); }
    setSaving(false);
  };

  const handleSaveTxn = async () => {
    if (!txnModal) return;
    const amt = toNum(txnForm.amount);
    if (amt <= 0) return alert(t.errorAmount);
    if (txnForm.paymentMethod === 'bank' && !txnForm.bankAccountId) return alert(t.errorBank);

    setSaving(true);
    try {
      const batch = writeBatch(db);
      const isPayment = txnModal.type === 'payment';

      const txnRef = doc(collection(db, `users/${user.uid}/chitFundTransactions`));
      batch.set(txnRef, { fundId: txnModal.fund.id, fundName: txnModal.fund.name, type: isPayment ? 'payment' : 'receipt', amount: amt, paymentMethod: txnForm.paymentMethod, bankAccountId: txnForm.bankAccountId || '', referenceNo: txnForm.referenceNo || '', description: txnForm.description || '', date: txnForm.date, createdAt: serverTimestamp(), uid: user.uid });

      const fundRef = doc(db, `users/${user.uid}/chitFunds`, txnModal.fund.id);
      batch.update(fundRef, { [isPayment ? 'totalPaid' : 'totalReceived']: increment(amt), updatedAt: serverTimestamp() });

      const cashRef = doc(collection(db, `users/${user.uid}/cashTransactions`));
      batch.set(cashRef, { type: isPayment ? 'out' : 'in', source: 'chitFund', category: isPayment ? 'chitFundPayment' : 'chitFundReceipt', amount: amt, fundId: txnModal.fund.id, fundName: txnModal.fund.name, paymentMethod: txnForm.paymentMethod, bankAccountId: txnForm.bankAccountId || '', description: `${isPayment ? '💸' : '💰'} ${txnModal.fund.name} — Rs.${fmtC(amt)}`, date: txnForm.date, time: nowHHMM(), timestamp: Timestamp.fromDate(new Date(txnForm.date)), createdAt: serverTimestamp(), createdBy: user?.email || '', uid: user.uid });

      if (txnForm.paymentMethod === 'bank' && txnForm.bankAccountId) {
        const accRef = doc(db, `users/${user.uid}/bankAccounts`, txnForm.bankAccountId);
        batch.update(accRef, { currentBalance: increment(isPayment ? -amt : amt), updatedAt: serverTimestamp() });
      }

      await batch.commit();
      alert(isPayment ? t.successPayment : t.successReceipt);
      setTxnModal(null);
      setTxnForm({ amount: '', paymentMethod: 'cash', bankAccountId: '', referenceNo: '', date: todayStr(), description: '' });
    } catch (e) { alert('❌ ' + e.message); }
    setSaving(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#0f172a' }}>{t.chitTitle}</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>{t.chitSubtitle}</p>
        </div>
        <button onClick={() => setShowAddModal(true)} style={{ padding: '12px 20px', background: 'linear-gradient(135deg,#7c3aed,#8b5cf6)', color: 'white', border: 'none', borderRadius: 12, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>{t.addChitFund}</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div style={{ background: 'linear-gradient(135deg,#dc2626,#ef4444)', color: 'white', borderRadius: 14, padding: 16 }}><div style={{ fontSize: 11, opacity: 0.9, fontWeight: 700 }}>{t.totalPaidAll}</div><div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>Rs.{fmtC(metrics.totalPaid)}</div></div>
        <div style={{ background: 'linear-gradient(135deg,#059669,#10b981)', color: 'white', borderRadius: 14, padding: 16 }}><div style={{ fontSize: 11, opacity: 0.9, fontWeight: 700 }}>{t.totalReceivedAll}</div><div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>Rs.{fmtC(metrics.totalReceived)}</div></div>
        <div style={{ background: `linear-gradient(135deg,${metrics.net >= 0 ? '#059669' : '#dc2626'},${metrics.net >= 0 ? '#10b981' : '#ef4444'})`, color: 'white', borderRadius: 14, padding: 16 }}><div style={{ fontSize: 11, opacity: 0.9, fontWeight: 700 }}>{t.netAll}</div><div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>Rs.{fmtC(Math.abs(metrics.net))}</div><div style={{ fontSize: 10, opacity: 0.85, marginTop: 4 }}>{metrics.net >= 0 ? '📈' : '📉'}</div></div>
        <div style={{ background: 'linear-gradient(135deg,#7c3aed,#8b5cf6)', color: 'white', borderRadius: 14, padding: 16 }}><div style={{ fontSize: 11, opacity: 0.9, fontWeight: 700 }}>{t.activeChits}</div><div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>{metrics.activeCount}</div></div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>{t.loading}</div>
      ) : chitFunds.length === 0 ? (
        <div style={{ background: 'white', borderRadius: 14, padding: 40, textAlign: 'center', color: '#94a3b8', border: '1px solid #e2e8f0' }}><div style={{ fontSize: 40 }}>🎫</div><div style={{ marginTop: 10, fontWeight: 700 }}>{t.noChitFunds}</div></div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {chitFunds.map(fund => {
            const ct = CHIT_TYPES[fund.type] || CHIT_TYPES.other;
            const fundTxns = chitTxns.filter(tx => tx.fundId === fund.id);
            const fundPaid = fundTxns.filter(tx => tx.type === 'payment').reduce((s, tx) => s + toNum(tx.amount), 0);
            const fundReceived = fundTxns.filter(tx => tx.type === 'receipt').reduce((s, tx) => s + toNum(tx.amount), 0);
            const fundNet = fundReceived - fundPaid;

            return (
              <div key={fund.id} style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', borderLeft: `6px solid ${ct.color}`, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#1e293b' }}>{ct.icon} {fund.name}</h3>
                      <span style={{ background: ct.bg, color: ct.color, padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800 }}>{ct.label}</span>
                      <span style={{ background: fund.status === 'completed' ? '#eff6ff' : '#f0fdf4', color: fund.status === 'completed' ? '#2563eb' : '#16a34a', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800 }}>{fund.status === 'completed' ? t.completedLabel : t.activeLabel}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: '#64748b' }}>
                      {fund.organizer && <span>👤 {fund.organizer}</span>}
                      {fund.organizerPhone && <span>📞 {fund.organizerPhone}</span>}
                      {fund.monthlyAmount > 0 && <span>💵 Rs.{fmtC(fund.monthlyAmount)}/{t.months}</span>}
                      {fund.totalMembers > 0 && <span>👥 {fund.totalMembers}</span>}
                      {fund.duration > 0 && <span>📅 {fund.duration} {t.months}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{t.netPosition}</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: fundNet >= 0 ? '#16a34a' : '#dc2626' }}>{fundNet >= 0 ? '+' : '-'}Rs.{fmtC(Math.abs(fundNet))}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
                  <div style={{ background: '#fef2f2', padding: '8px 10px', borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 10, color: '#dc2626' }}>{t.myTotalPaid}</div><div style={{ fontSize: 13, fontWeight: 800, color: '#dc2626' }}>Rs.{fmtC(fundPaid)}</div></div>
                  <div style={{ background: '#f0fdf4', padding: '8px 10px', borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 10, color: '#16a34a' }}>{t.myTotalReceived}</div><div style={{ fontSize: 13, fontWeight: 800, color: '#16a34a' }}>Rs.{fmtC(fundReceived)}</div></div>
                  <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 10, color: '#475569' }}>{t.transactions}</div><div style={{ fontSize: 13, fontWeight: 800, color: '#475569' }}>{fundTxns.length}</div></div>
                </div>

                {fundTxns.length > 0 && (
                  <div style={{ marginTop: 10, maxHeight: 120, overflowY: 'auto' }}>
                    {fundTxns.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5).map((tx, i) => (
                      <div key={tx.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', borderBottom: '1px solid #f1f5f9', fontSize: 11 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{tx.type === 'payment' ? '🔴' : '🟢'}</span>
                          <span style={{ color: '#64748b' }}>{formatDate(tx.date, lang)}</span>
                          {tx.description && <span style={{ color: '#94a3b8' }}>— {tx.description}</span>}
                        </div>
                        <span style={{ fontWeight: 800, color: tx.type === 'payment' ? '#dc2626' : '#16a34a' }}>{tx.type === 'payment' ? '-' : '+'}Rs.{fmtC(tx.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {fund.status !== 'completed' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                    <button onClick={() => { setTxnModal({ fund, type: 'payment' }); setTxnForm(p => ({ ...p, amount: String(fund.monthlyAmount || '') })); }} style={{ padding: '8px 14px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>{t.paymentOut}</button>
                    <button onClick={() => { setTxnModal({ fund, type: 'receipt' }); setTxnForm(p => ({ ...p, amount: '' })); }} style={{ padding: '8px 14px', background: '#059669', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>{t.receiptIn}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Fund Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 520, overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#7c3aed,#8b5cf6)', padding: '18px 22px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>{t.addChitFund}</h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '50%', width: 34, height: 34, fontSize: 16, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div><label style={S.label}>{t.chitName}</label><input value={fundForm.name} onChange={e => setFundForm(p => ({ ...p, name: e.target.value }))} style={S.input} placeholder="උදා: අපේ ගමේ සමිතිය" /></div>
              <div><label style={S.label}>{t.chitType}</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {Object.entries(CHIT_TYPES).map(([k, m]) => (
                    <button key={k} type="button" onClick={() => setFundForm(p => ({ ...p, type: k }))} style={{ padding: '8px 4px', borderRadius: 8, cursor: 'pointer', border: fundForm.type === k ? `2px solid ${m.color}` : '1px solid #e2e8f0', background: fundForm.type === k ? m.bg : 'white', color: fundForm.type === k ? m.color : '#64748b', fontWeight: 700, fontSize: 10 }}><div style={{ fontSize: 16 }}>{m.icon}</div><div style={{ marginTop: 2 }}>{m.label}</div></button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={S.label}>{t.organizer}</label><input value={fundForm.organizer} onChange={e => setFundForm(p => ({ ...p, organizer: e.target.value }))} style={S.input} /></div>
                <div><label style={S.label}>{t.organizerPhone}</label><input value={fundForm.organizerPhone} onChange={e => setFundForm(p => ({ ...p, organizerPhone: e.target.value }))} style={S.input} placeholder="07X XXX XXXX" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div><label style={S.label}>{t.monthlyAmount}</label><input type="number" value={fundForm.monthlyAmount} onChange={e => setFundForm(p => ({ ...p, monthlyAmount: e.target.value }))} style={{ ...S.input, fontWeight: 800, textAlign: 'center' }} placeholder="5000" /></div>
                <div><label style={S.label}>{t.totalMembers}</label><input type="number" value={fundForm.totalMembers} onChange={e => setFundForm(p => ({ ...p, totalMembers: e.target.value }))} style={{ ...S.input, textAlign: 'center' }} placeholder="10" /></div>
                <div><label style={S.label}>{t.duration}</label><input type="number" value={fundForm.duration} onChange={e => setFundForm(p => ({ ...p, duration: e.target.value }))} style={{ ...S.input, textAlign: 'center' }} placeholder="12" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={S.label}>{t.startDate}</label><input type="date" value={fundForm.startDate} onChange={e => setFundForm(p => ({ ...p, startDate: e.target.value }))} style={S.input} /></div>
                <div><label style={S.label}>{t.notes}</label><input value={fundForm.notes} onChange={e => setFundForm(p => ({ ...p, notes: e.target.value }))} style={S.input} /></div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <button onClick={() => setShowAddModal(false)} style={{ flex: 1, padding: 12, background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>{t.cancel}</button>
                <button onClick={handleSaveFund} disabled={saving} style={{ flex: 2, padding: 12, background: saving ? '#94a3b8' : 'linear-gradient(135deg,#7c3aed,#8b5cf6)', color: 'white', border: 'none', borderRadius: 10, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? t.saving : t.saveBtn}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Modal */}
      {txnModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 480, overflow: 'hidden' }}>
            <div style={{ background: txnModal.type === 'payment' ? 'linear-gradient(135deg,#dc2626,#ef4444)' : 'linear-gradient(135deg,#059669,#10b981)', padding: '18px 22px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>{txnModal.type === 'payment' ? t.recordPayment : t.recordReceipt}</h3>
              <button onClick={() => setTxnModal(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '50%', width: 34, height: 34, fontSize: 16, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{txnModal.fund.name}</div>
                {txnModal.fund.organizer && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>👤 {txnModal.fund.organizer}</div>}
              </div>
              <div><label style={S.label}>{txnModal.type === 'payment' ? t.paymentAmount : t.receiptAmount}</label><input type="number" value={txnForm.amount} onChange={e => setTxnForm(p => ({ ...p, amount: e.target.value }))} style={{ ...S.input, fontSize: 22, fontWeight: 800, textAlign: 'center', border: `2px solid ${txnModal.type === 'payment' ? '#dc2626' : '#059669'}` }} placeholder="0.00" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={S.label}>{t.paymentDate}</label><input type="date" value={txnForm.date} onChange={e => setTxnForm(p => ({ ...p, date: e.target.value }))} style={S.input} /></div>
                <div><label style={S.label}>{t.paymentMethod}</label><select value={txnForm.paymentMethod} onChange={e => setTxnForm(p => ({ ...p, paymentMethod: e.target.value }))} style={S.input}><option value="cash">{t.cash}</option><option value="bank">{t.bank}</option><option value="cheque">{t.cheque}</option></select></div>
              </div>
              {txnForm.paymentMethod === 'bank' && (
                <div><label style={S.label}>{t.bankAccount}</label><select value={txnForm.bankAccountId} onChange={e => setTxnForm(p => ({ ...p, bankAccountId: e.target.value }))} style={S.input}><option value="">{t.selectBank}</option>{bankAccounts.map(b => (<option key={b.id} value={b.id}>🏦 {b.bankName} (Rs.{(b.currentBalance || 0).toLocaleString()})</option>))}</select></div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={S.label}>{t.reference}</label><input value={txnForm.referenceNo} onChange={e => setTxnForm(p => ({ ...p, referenceNo: e.target.value }))} style={S.input} /></div>
                <div><label style={S.label}>{t.description}</label><input value={txnForm.description} onChange={e => setTxnForm(p => ({ ...p, description: e.target.value }))} style={S.input} placeholder={txnModal.type === 'payment' ? 'මාසික වාරිකය' : 'සීට්ටුව හිමි විය'} /></div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <button onClick={() => setTxnModal(null)} style={{ flex: 1, padding: 12, background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>{t.cancel}</button>
                <button onClick={handleSaveTxn} disabled={saving} style={{ flex: 2, padding: 12, background: saving ? '#94a3b8' : (txnModal.type === 'payment' ? 'linear-gradient(135deg,#dc2626,#ef4444)' : 'linear-gradient(135deg,#059669,#10b981)'), color: 'white', border: 'none', borderRadius: 10, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? t.saving : `${txnModal.type === 'payment' ? '💸' : '💰'} Rs.${fmtC(toNum(txnForm.amount))} ${t.saveBtn}`}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   6. LOANS TAB COMPONENT (★ RESTORED FULLY FROM ORIGINAL ★)
   ════════════════════════════════════════════════════════════════ */
function LoansTab({ user, t, lang, bankAccounts }) {
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [filterInstitution, setFilterInstitution] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQ, setSearchQ] = useState('');

  const [showNewModal, setShowNewModal] = useState(false);
  const [payLoan, setPayLoan] = useState(null);
  const [scheduleLoan, setScheduleLoan] = useState(null);

  const [form, setForm] = useState({
    institutionType: 'bank', institutionName: '', branchName: '', accountNumber: '',
    loanPurpose: 'ව්‍යාපාරික ණය', principalAmount: '', interestRate: '',
    interestType: 'reducing', loanTermMonths: '', startDate: todayStr(),
    firstEmiDate: '', officerName: '', officerPhone: '', collateral: '', notes: '',
  });

  const [paymentForm, setPaymentForm] = useState({
    amount: '', paymentMethod: 'bank', bankAccountId: '',
    referenceNo: '', paymentDate: todayStr(), installmentMonth: '', notes: '',
  });

  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);
    const u1 = onSnapshot(collection(db, `users/${user.uid}/bankLoans`), s => { setLoans(s.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); });
    const u2 = onSnapshot(collection(db, `users/${user.uid}/bankLoanPayments`), s => { setPayments(s.docs.map(d => ({ id: d.id, ...d.data() }))); });
    return () => { u1(); u2(); };
  }, [user?.uid]);

  const institutionTypesOptions = useMemo(() => ({
    bank: { label: t.instBank, icon: '🏛️', color: '#1e40af', bg: '#eff6ff', border: '#93c5fd' },
    private: { label: t.instPrivate, icon: '🏦', color: '#7c3aed', bg: '#faf5ff', border: '#c4b5fd' },
    finance: { label: t.instFinance, icon: '💳', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
    leasing: { label: t.instLeasing, icon: '🚗', color: '#059669', bg: '#f0fdf4', border: '#86efac' },
    microfin: { label: t.instMicrofin, icon: '💰', color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
    other: { label: t.instOther, icon: '📋', color: '#475569', bg: '#f8fafc', border: '#cbd5e1' },
  }), [t]);

  const loanPurposesOptions = useMemo(() => [
    { value: 'ව්‍යාපාරික ණය', label: t.purposeBusiness },
    { value: 'නිවාස ණය', label: t.purposeHousing },
    { value: 'වාහන ණය', label: t.purposeVehicle },
    { value: 'පුද්ගලික ණය', label: t.purposePersonal },
    { value: 'අධ්‍යාපන ණය', label: t.purposeEducational },
    { value: 'කෘෂිකාර්මික', label: t.purposeAgricultural },
    { value: 'උපකරණ මිලදී ගැනීම', label: t.purposeEquipment },
    { value: 'වෙනත්', label: t.purposeOther },
  ], [t]);

  const statusCfg = useMemo(() => ({
    active: { label: t.statusActive, color: '#16a34a', bg: '#f0fdf4' },
    overdue: { label: t.statusOverdue, color: '#dc2626', bg: '#fef2f2' },
    completed: { label: t.statusCompleted, color: '#2563eb', bg: '#eff6ff' },
    restructured: { label: t.statusRestructured, color: '#7c3aed', bg: '#faf5ff' },
  }), [t]);

  const liveEMI = useMemo(() => {
    const p = toNum(form.principalAmount);
    const r = toNum(form.interestRate);
    const tVal = toNum(form.loanTermMonths);
    if (p <= 0 || tVal <= 0) return null;
    return calcLoanEMI(p, r, tVal, form.interestType);
  }, [form.principalAmount, form.interestRate, form.loanTermMonths, form.interestType]);

  const metrics = useMemo(() => {
    const today = todayStr();
    let totalPrincipal = 0, totalPaid = 0, totalRemaining = 0, totalInterest = 0;
    let monthlyOutflow = 0, overdueCount = 0, activeCount = 0, upcomingThisMonth = 0;
    loans.forEach(l => {
      totalPrincipal += toNum(l.principalAmount); totalPaid += toNum(l.paidAmount); totalInterest += toNum(l.totalInterest);
      if (l.status === 'completed') return;
      totalRemaining += toNum(l.remainingBalance); activeCount++; monthlyOutflow += toNum(l.emiAmount);
      if (l.nextEmiDate && l.nextEmiDate < today) overdueCount++;
      if (l.nextEmiDate) { const dm = l.nextEmiDate.substring(0, 7); const tm = today.substring(0, 7); if (dm === tm) upcomingThisMonth += toNum(l.emiAmount); }
    });
    return { totalPrincipal, totalPaid, totalRemaining, totalInterest, monthlyOutflow, overdueCount, activeCount, upcomingThisMonth };
  }, [loans]);

  const filteredLoans = useMemo(() => {
    const q = searchQ.toLowerCase().trim();
    const today = todayStr();
    return loans.filter(l => {
      if (filterInstitution !== 'all' && l.institutionType !== filterInstitution) return false;
      if (filterStatus !== 'all') {
        if (filterStatus === 'overdue') { if (l.status !== 'active' || !l.nextEmiDate || l.nextEmiDate >= today) return false; }
        else if (l.status !== filterStatus) return false;
      }
      if (q) { const hay = [l.institutionName, l.accountNumber, l.branchName, l.officerName, l.loanPurpose].filter(Boolean).join(' ').toLowerCase(); if (!hay.includes(q)) return false; }
      return true;
    }).sort((a, b) => {
      const aO = a.nextEmiDate && a.nextEmiDate < today && a.status === 'active';
      const bO = b.nextEmiDate && b.nextEmiDate < today && b.status === 'active';
      if (aO && !bO) return -1; if (bO && !aO) return 1;
      return toNum(b.remainingBalance) - toNum(a.remainingBalance);
    });
  }, [loans, filterInstitution, filterStatus, searchQ]);

  const handleSaveLoan = async () => {
    if (!user?.uid) return;
    if (!form.institutionName) return alert(t.errorInstitution);
    const p = toNum(form.principalAmount); const tVal = toNum(form.loanTermMonths);
    if (p <= 0) return alert(t.errorLoanAmt); if (tVal <= 0) return alert(t.errorTerm);
    setSaving(true);
    try {
      const emiData = calcLoanEMI(p, toNum(form.interestRate), tVal, form.interestType);
      const firstEmi = form.firstEmiDate || addMonths(form.startDate, 1);
      await addDoc(collection(db, `users/${user.uid}/bankLoans`), {
        ...form, principalAmount: p, interestRate: toNum(form.interestRate), loanTermMonths: tVal,
        emiAmount: Math.round(emiData.emi * 100) / 100, totalInterest: Math.round(emiData.totalInterest * 100) / 100,
        totalPayable: Math.round(emiData.totalPayable * 100) / 100, paidAmount: 0,
        remainingBalance: Math.round(emiData.totalPayable * 100) / 100, emiPaid: 0, status: 'active',
        firstEmiDate: firstEmi, nextEmiDate: firstEmi, endDate: addMonths(form.startDate, tVal),
        createdAt: serverTimestamp(), uid: user.uid,
      });
      alert(`✅ ${form.institutionName} ${t.successAdd}\n📅 ${t.emiAmount}: Rs.${fmtC(emiData.emi)}`);
      setShowNewModal(false);
      setForm({ institutionType: 'bank', institutionName: '', branchName: '', accountNumber: '', loanPurpose: 'ව්‍යාපාරික ණය', principalAmount: '', interestRate: '', interestType: 'reducing', loanTermMonths: '', startDate: todayStr(), firstEmiDate: '', officerName: '', officerPhone: '', collateral: '', notes: '' });
    } catch (err) { alert('❌ ' + err.message); }
    setSaving(false);
  };

  const handleRecordPayment = async () => {
    if (!user?.uid || !payLoan) return;
    const amt = toNum(paymentForm.amount);
    if (amt <= 0) return alert(t.errorAmount);
    if (paymentForm.paymentMethod === 'bank' && !paymentForm.bankAccountId) return alert(t.errorBank);
    setSaving(true);
    try {
      const batch = writeBatch(db);
      const interestPortion = payLoan.interestType === 'flat' ? (payLoan.totalInterest / payLoan.loanTermMonths) : (toNum(payLoan.remainingBalance) * (payLoan.interestRate / 100 / 12));
      const principalPortion = Math.max(0, amt - interestPortion);

      const payRef = doc(collection(db, `users/${user.uid}/bankLoanPayments`));
      batch.set(payRef, { loanId: payLoan.id, institutionName: payLoan.institutionName, amount: amt, principalPortion: Math.round(principalPortion * 100) / 100, interestPortion: Math.round(interestPortion * 100) / 100, paymentDate: paymentForm.paymentDate, paymentMethod: paymentForm.paymentMethod, bankAccountId: paymentForm.bankAccountId || '', referenceNo: paymentForm.referenceNo || '', installmentMonth: paymentForm.installmentMonth || '', notes: paymentForm.notes || '', createdAt: serverTimestamp(), uid: user.uid });

      const newRem = Math.max(0, toNum(payLoan.remainingBalance) - amt);
      const isComplete = newRem <= 0.01;
      const nextEmi = isComplete ? null : addMonths(paymentForm.paymentDate, 1);

      const loanRef = doc(db, `users/${user.uid}/bankLoans`, payLoan.id);
      batch.update(loanRef, { paidAmount: increment(amt), remainingBalance: increment(-amt), emiPaid: toNum(payLoan.emiPaid) + 1, status: isComplete ? 'completed' : 'active', nextEmiDate: nextEmi, lastPaymentDate: paymentForm.paymentDate, updatedAt: serverTimestamp() });

      const cashRef = doc(collection(db, `users/${user.uid}/cashTransactions`));
      batch.set(cashRef, { type: 'out', source: 'bankLoanRepayment', category: 'bankLoanRepayment', amount: amt, loanId: payLoan.id, institutionName: payLoan.institutionName, paymentMethod: paymentForm.paymentMethod, bankAccountId: paymentForm.bankAccountId || '', description: `📤 බැංකු ණය වාරිකය - ${payLoan.institutionName} (Rs.${fmtC(amt)})`, date: paymentForm.paymentDate, time: nowHHMM(), timestamp: Timestamp.fromDate(new Date(paymentForm.paymentDate)), createdAt: serverTimestamp(), createdBy: user?.email || '', uid: user.uid });

      if (paymentForm.paymentMethod === 'bank' && paymentForm.bankAccountId) {
        const accRef = doc(db, `users/${user.uid}/bankAccounts`, paymentForm.bankAccountId);
        batch.update(accRef, { currentBalance: increment(-amt), liveBalance: increment(-amt), updatedAt: serverTimestamp() });
      }

      await batch.commit();
      alert(`${t.successRepay}${isComplete ? `\n${t.successFullySettled}` : ''}`);
      setPayLoan(null);
      setPaymentForm({ amount: '', paymentMethod: 'bank', bankAccountId: '', referenceNo: '', paymentDate: todayStr(), installmentMonth: '', notes: '' });
    } catch (err) { alert('❌ ' + err.message); }
    setSaving(false);
  };

  const currentSchedule = useMemo(() => {
    if (!scheduleLoan) return [];
    return generateAmortization(scheduleLoan.principalAmount, scheduleLoan.interestRate, scheduleLoan.loanTermMonths, scheduleLoan.interestType, scheduleLoan.startDate);
  }, [scheduleLoan]);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#0f172a' }}>{t.title}</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>{t.subtitle}</p>
        </div>
        <button onClick={() => setShowNewModal(true)} style={{ padding: '12px 20px', background: 'linear-gradient(135deg,#1e40af,#3b82f6)', color: 'white', border: 'none', borderRadius: 12, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>{t.addNewLoan}</button>
      </div>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div style={{ background: 'linear-gradient(135deg,#dc2626,#ef4444)', color: 'white', borderRadius: 14, padding: 16 }}><div style={{ fontSize: 11, opacity: 0.9, fontWeight: 700 }}>{t.totalBalance}</div><div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>Rs.{fmtC(metrics.totalRemaining)}</div><div style={{ fontSize: 10, opacity: 0.85, marginTop: 4 }}>{t.active}: {metrics.activeCount}</div></div>
        <div style={{ background: 'linear-gradient(135deg,#2563eb,#3b82f6)', color: 'white', borderRadius: 14, padding: 16 }}><div style={{ fontSize: 11, opacity: 0.9, fontWeight: 700 }}>{t.monthlyPayments}</div><div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>Rs.{fmtC(metrics.monthlyOutflow)}</div><div style={{ fontSize: 10, opacity: 0.85, marginTop: 4 }}>{t.thisMonth}: Rs.{fmtC(metrics.upcomingThisMonth)}</div></div>
        <div style={{ background: 'linear-gradient(135deg,#f59e0b,#fbbf24)', color: 'white', borderRadius: 14, padding: 16 }}><div style={{ fontSize: 11, opacity: 0.9, fontWeight: 700 }}>{t.totalInterest}</div><div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>Rs.{fmtC(metrics.totalInterest)}</div><div style={{ fontSize: 10, opacity: 0.85, marginTop: 4 }}>{t.totalLoan}: Rs.{fmtC(metrics.totalPrincipal)}</div></div>
        <div style={{ background: 'linear-gradient(135deg,#7c3aed,#8b5cf6)', color: 'white', borderRadius: 14, padding: 16 }}><div style={{ fontSize: 11, opacity: 0.9, fontWeight: 700 }}>{t.overduePayments}</div><div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>{metrics.overdueCount}</div><div style={{ fontSize: 10, opacity: 0.85, marginTop: 4 }}>{t.payImmediately}</div></div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input type="text" placeholder={t.searchPlaceholder} value={searchQ} onChange={e => setSearchQ(e.target.value)} style={{ flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13 }} />
        <select value={filterInstitution} onChange={e => setFilterInstitution(e.target.value)} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, background: 'white', fontWeight: 600 }}>
          <option value="all">{t.allTypes}</option>
          {Object.entries(institutionTypesOptions).map(([k, m]) => <option key={k} value={k}>{m.icon} {m.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, background: 'white', fontWeight: 600 }}>
          <option value="all">{t.allStatus}</option>
          <option value="active">{t.active}</option>
          <option value="overdue">{t.overdue}</option>
          <option value="completed">{t.completed}</option>
        </select>
      </div>

      {/* Loans List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>{t.loading}</div>
      ) : filteredLoans.length === 0 ? (
        <div style={{ background: 'white', borderRadius: 14, padding: 40, textAlign: 'center', color: '#94a3b8', border: '1px solid #e2e8f0' }}><div style={{ fontSize: 40 }}>🏦</div><div style={{ marginTop: 10, fontWeight: 700 }}>{t.noLoansFound}</div></div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {filteredLoans.map(loan => {
            const inst = institutionTypesOptions[loan.institutionType] || institutionTypesOptions.other;
            const status = statusCfg[loan.status] || statusCfg.active;
            const progress = loan.totalPayable > 0 ? (toNum(loan.paidAmount) / loan.totalPayable) * 100 : 0;
            const today = todayStr();
            const isOverdue = loan.nextEmiDate && loan.nextEmiDate < today && loan.status === 'active';
            const daysOD = isOverdue ? Math.abs(daysBetween(today, loan.nextEmiDate)) : 0;

            return (
              <div key={loan.id} style={{ background: 'white', borderRadius: 14, border: `1px solid ${isOverdue ? '#fca5a5' : '#e2e8f0'}`, borderLeft: `6px solid ${isOverdue ? '#dc2626' : loan.status === 'completed' ? '#16a34a' : inst.color}`, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#1e293b' }}>{inst.icon} {loan.institutionName}</h3>
                      <span style={{ background: inst.bg, color: inst.color, padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800 }}>{inst.label}</span>
                      <span style={{ background: status.bg, color: status.color, padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800 }}>{status.label}</span>
                      {isOverdue && <span style={{ background: '#fef2f2', color: '#dc2626', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800, border: '1px solid #fecaca' }}>⚠️ {t.daysOverdue.replace('{days}', daysOD)}</span>}
                      <span style={{ background: '#f8fafc', color: '#475569', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{loan.interestType === 'reducing' ? t.reducingLabel : t.flatLabel}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                      {loan.accountNumber && <span># {loan.accountNumber}</span>}
                      {loan.branchName && <span>🏢 {loan.branchName}</span>}
                      {loan.loanPurpose && <span>🎯 {loan.loanPurpose}</span>}
                      {loan.nextEmiDate && <span style={{ color: isOverdue ? '#dc2626' : '#64748b', fontWeight: isOverdue ? 700 : 600 }}>📅 {t.next}: {formatDate(loan.nextEmiDate, lang)}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{t.dueLabel}</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#dc2626' }}>Rs.{fmtC(loan.remainingBalance)}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{t.emiAmount}: <b style={{ color: inst.color }}>Rs.{fmtC(loan.emiAmount)}</b></div>
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 4 }}>
                    <span style={{ color: '#64748b', fontWeight: 700 }}>{t.payProgress}</span>
                    <span style={{ color: inst.color, fontWeight: 800 }}>{progress.toFixed(1)}% · {loan.emiPaid || 0}/{loan.loanTermMonths} {t.instalments}</span>
                  </div>
                  <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: `${progress}%`, background: `linear-gradient(90deg,${inst.color},${inst.color}dd)`, transition: 'width 0.5s' }} /></div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 12 }}>
                  <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 10, color: '#64748b' }}>{t.loanAmount}</div><div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b' }}>Rs.{fmtC(loan.principalAmount)}</div></div>
                  <div style={{ background: '#fff7ed', padding: '8px 10px', borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 10, color: '#64748b' }}>{t.interest}</div><div style={{ fontSize: 12, fontWeight: 800, color: '#ea580c' }}>{loan.interestRate}% p.a.</div></div>
                  <div style={{ background: '#f0fdf4', padding: '8px 10px', borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 10, color: '#64748b' }}>{t.paid}</div><div style={{ fontSize: 12, fontWeight: 800, color: '#16a34a' }}>Rs.{fmtC(loan.paidAmount)}</div></div>
                  <div style={{ background: '#eff6ff', padding: '8px 10px', borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 10, color: '#64748b' }}>{t.term}</div><div style={{ fontSize: 12, fontWeight: 800, color: '#2563eb' }}>{loan.loanTermMonths} {t.months}</div></div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                  <button onClick={() => setScheduleLoan(loan)} style={{ padding: '8px 14px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>{t.schedule}</button>
                  {loan.status !== 'completed' && (
                    <button onClick={() => { setPayLoan(loan); setPaymentForm(p => ({ ...p, amount: String(loan.emiAmount || '') })); }} style={{ padding: '8px 14px', background: 'linear-gradient(135deg,#1e40af,#3b82f6)', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>{t.payInstalment}</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* NEW LOAN MODAL */}
      {showNewModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, overflowY: 'auto' }}>
          <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 720, margin: '20px 0', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: '20px 24px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>{t.newLoanHeader}</h2>
              <button onClick={() => setShowNewModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '50%', width: 34, height: 34, fontSize: 16, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8, display: 'block' }}>{t.institutionType}</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {Object.entries(institutionTypesOptions).map(([k, m]) => (
                    <button type="button" key={k} onClick={() => setForm(p => ({ ...p, institutionType: k }))} style={{ padding: '10px 4px', borderRadius: 8, cursor: 'pointer', border: form.institutionType === k ? `2px solid ${m.color}` : '1px solid #e2e8f0', background: form.institutionType === k ? m.bg : 'white', color: form.institutionType === k ? m.color : '#64748b', fontWeight: 700, fontSize: 10 }}><div style={{ fontSize: 18 }}>{m.icon}</div><div style={{ marginTop: 4 }}>{m.label}</div></button>
                  ))}
                </div>
              </div>

              <div style={{ background: '#eff6ff', border: '2px solid #93c5fd', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#1e40af', marginBottom: 10 }}>{t.institutionDetails}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div><label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{t.institutionName} *</label><input value={form.institutionName} onChange={e => setForm(p => ({ ...p, institutionName: e.target.value }))} placeholder="BOC / LOLC" style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #bfdbfe', boxSizing: 'border-box', fontWeight: 600 }} /></div>
                  <div><label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{t.branch}</label><input value={form.branchName} onChange={e => setForm(p => ({ ...p, branchName: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #bfdbfe', boxSizing: 'border-box' }} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{t.accNum}</label><input value={form.accountNumber} onChange={e => setForm(p => ({ ...p, accountNumber: e.target.value }))} placeholder="LN-XXXX" style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #bfdbfe', boxSizing: 'border-box' }} /></div>
                  <div><label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{t.purpose}</label><select value={form.loanPurpose} onChange={e => setForm(p => ({ ...p, loanPurpose: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #bfdbfe', boxSizing: 'border-box' }}>{loanPurposesOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
                </div>
              </div>

              <div style={{ background: '#fff7ed', border: '2px solid #fdba74', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#ea580c', marginBottom: 10 }}>{t.loanAmount} & {t.term}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div><label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{t.loanAmountLabel}</label><input type="number" value={form.principalAmount} onChange={e => setForm(p => ({ ...p, principalAmount: e.target.value }))} placeholder="0" style={{ width: '100%', padding: 10, borderRadius: 8, border: '2px solid #ea580c', fontSize: 16, fontWeight: 800, textAlign: 'right', boxSizing: 'border-box' }} /></div>
                  <div><label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{t.interestLabel}</label><input type="number" step="0.01" value={form.interestRate} onChange={e => setForm(p => ({ ...p, interestRate: e.target.value }))} placeholder="14" style={{ width: '100%', padding: 10, borderRadius: 8, border: '2px solid #f59e0b', fontSize: 16, fontWeight: 800, textAlign: 'right', boxSizing: 'border-box' }} /></div>
                  <div><label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{t.term} ({t.months}) *</label><input type="number" value={form.loanTermMonths} onChange={e => setForm(p => ({ ...p, loanTermMonths: e.target.value }))} placeholder="60" style={{ width: '100%', padding: 10, borderRadius: 8, border: '2px solid #8b5cf6', fontSize: 16, fontWeight: 800, textAlign: 'right', boxSizing: 'border-box' }} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div><label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{t.interestType}</label><select value={form.interestType} onChange={e => setForm(p => ({ ...p, interestType: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #fed7aa', fontWeight: 700, boxSizing: 'border-box' }}><option value="reducing">📉 {t.reducing}</option><option value="flat">📊 {t.flat}</option></select></div>
                  <div><label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{t.loanDate}</label><input type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #fed7aa', boxSizing: 'border-box' }} /></div>
                  <div><label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{t.firstEmi}</label><input type="date" value={form.firstEmiDate} onChange={e => setForm(p => ({ ...p, firstEmiDate: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #fed7aa', boxSizing: 'border-box' }} /></div>
                </div>
              </div>

              {liveEMI && (
                <div style={{ background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', border: '2px solid #93c5fd', borderRadius: 12, padding: 16, marginBottom: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#1e40af', marginBottom: 10, textAlign: 'center' }}>{t.calculateEMI}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
                    <div style={{ background: 'white', padding: 10, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 10, color: '#64748b' }}>{t.interest}</div><div style={{ fontSize: 16, fontWeight: 900, color: '#ea580c' }}>Rs.{fmtC(liveEMI.totalInterest)}</div></div>
                    <div style={{ background: 'white', padding: 10, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 10, color: '#64748b' }}>{t.totalPayable}</div><div style={{ fontSize: 16, fontWeight: 900, color: '#dc2626' }}>Rs.{fmtC(liveEMI.totalPayable)}</div></div>
                    <div style={{ background: 'white', padding: 10, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 10, color: '#64748b' }}>{t.term}</div><div style={{ fontSize: 16, fontWeight: 900, color: '#2563eb' }}>{toNum(form.loanTermMonths)}</div></div>
                  </div>
                  <div style={{ background: '#1e40af', color: 'white', padding: 12, borderRadius: 10, textAlign: 'center' }}><div style={{ fontSize: 12, opacity: 0.9 }}>{t.emiAmount}</div><div style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>Rs.{fmtC(liveEMI.emi)}</div></div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div><label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{t.officerName}</label><input value={form.officerName} onChange={e => setForm(p => ({ ...p, officerName: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }} /></div>
                <div><label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{t.officerPhone}</label><input value={form.officerPhone} onChange={e => setForm(p => ({ ...p, officerPhone: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }} /></div>
              </div>
              <div style={{ marginBottom: 14 }}><label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{t.collateral}</label><input value={form.collateral} onChange={e => setForm(p => ({ ...p, collateral: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }} /></div>
              <div style={{ marginBottom: 16 }}><label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{t.notes}</label><textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }} /></div>
              <button onClick={handleSaveLoan} disabled={saving} style={{ width: '100%', padding: 14, background: saving ? '#94a3b8' : 'linear-gradient(135deg,#1e40af,#3b82f6)', color: 'white', border: 'none', borderRadius: 12, fontWeight: 800, fontSize: 15, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? t.savingLabel : t.saveLoan}</button>
            </div>
          </div>
        </div>
      )}

      {/* PAY EMI MODAL */}
      {payLoan && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 15 }}>
          <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 500, overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: '18px 22px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>{t.payEmiHeader}</h3>
              <button onClick={() => setPayLoan(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '50%', width: 34, height: 34, fontSize: 16, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ background: '#eff6ff', borderRadius: 12, padding: 14, marginBottom: 16, border: '1px solid #bfdbfe' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e40af' }}>🏦 {payLoan.institutionName}</div>
                {payLoan.accountNumber && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>#{payLoan.accountNumber}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12 }}><span style={{ color: '#64748b' }}>{t.dueLabel}:</span><span style={{ fontWeight: 900, color: '#dc2626', fontSize: 15 }}>Rs.{fmtC(payLoan.remainingBalance)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 12 }}><span style={{ color: '#64748b' }}>{t.emiAmount}:</span><span style={{ fontWeight: 800, color: '#2563eb' }}>Rs.{fmtC(payLoan.emiAmount)}</span></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div><label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>{t.paymentDate}</label><input type="date" value={paymentForm.paymentDate} onChange={e => setPaymentForm(p => ({ ...p, paymentDate: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }} /></div>
                <div><label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>{t.month}</label><input type="month" value={paymentForm.installmentMonth} onChange={e => setPaymentForm(p => ({ ...p, installmentMonth: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }} /></div>
              </div>
              <div style={{ marginBottom: 12 }}><label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>{t.paidAmount} *</label><input type="number" step="0.01" value={paymentForm.amount} onChange={e => setPaymentForm(p => ({ ...p, amount: e.target.value }))} style={{ width: '100%', padding: 12, borderRadius: 10, border: '2px solid #1e40af', fontSize: 22, fontWeight: 800, textAlign: 'center', boxSizing: 'border-box' }} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div><label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{t.method}</label><select value={paymentForm.paymentMethod} onChange={e => setPaymentForm(p => ({ ...p, paymentMethod: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}><option value="bank">{t.bank}</option><option value="cash">{t.cash}</option><option value="cheque">{t.cheque}</option></select></div>
                {paymentForm.paymentMethod === 'bank' && (
                  <div><label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{t.bank} *</label><select value={paymentForm.bankAccountId} onChange={e => setPaymentForm(p => ({ ...p, bankAccountId: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}><option value="">{t.selectBank}</option>{bankAccounts.map(a => <option key={a.id} value={a.id}>{a.bankName}</option>)}</select></div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div><label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{t.refNo}</label><input value={paymentForm.referenceNo} onChange={e => setPaymentForm(p => ({ ...p, referenceNo: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }} /></div>
                <div><label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{t.note}</label><input value={paymentForm.notes} onChange={e => setPaymentForm(p => ({ ...p, notes: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }} /></div>
              </div>
              <button onClick={handleRecordPayment} disabled={saving} style={{ width: '100%', padding: 14, background: saving ? '#94a3b8' : 'linear-gradient(135deg,#1e40af,#3b82f6)', color: 'white', border: 'none', borderRadius: 12, fontWeight: 800, fontSize: 15, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? t.savingLabel : `✅ Rs.${fmtC(toNum(paymentForm.amount))} ${t.payBtn}`}</button>
            </div>
          </div>
        </div>
      )}

      {/* AMORTIZATION SCHEDULE MODAL */}
      {scheduleLoan && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, overflowY: 'auto' }}>
          <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 800, margin: '20px 0', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#7c3aed,#8b5cf6)', padding: '20px 24px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><h2 style={{ margin: 0, fontSize: 20 }}>{t.schedule}</h2><div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>{scheduleLoan.institutionName} · {scheduleLoan.loanTermMonths} {t.months}</div></div>
              <button onClick={() => setScheduleLoan(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '50%', width: 34, height: 34, fontSize: 16, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ maxHeight: 500, overflowY: 'auto', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#f1f5f9', zIndex: 1 }}>
                    <tr>{['#', t.paymentDate, 'EMI', t.loanAmount, t.interest, t.due].map((h, i) => (<th key={i} style={{ padding: '10px 8px', textAlign: i === 0 ? 'center' : 'right', fontWeight: 800, color: '#475569', borderBottom: '2px solid #cbd5e1' }}>{h}</th>))}</tr>
                  </thead>
                  <tbody>
                    {currentSchedule.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                        <td style={{ padding: 8, textAlign: 'center', fontWeight: 800 }}>{row.month}</td>
                        <td style={{ padding: 8, textAlign: 'right', color: '#64748b' }}>{formatDate(row.dueDate, lang)}</td>
                        <td style={{ padding: 8, textAlign: 'right', fontWeight: 800 }}>{fmtC(row.emi)}</td>
                        <td style={{ padding: 8, textAlign: 'right', color: '#2563eb', fontWeight: 700 }}>{fmtC(row.principal)}</td>
                        <td style={{ padding: 8, textAlign: 'right', color: '#dc2626', fontWeight: 700 }}>{fmtC(row.interest)}</td>
                        <td style={{ padding: 8, textAlign: 'right', fontWeight: 800, color: '#059669' }}>{fmtC(row.balance)}</td>
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

/* ═══════════════════════════════════════════════════════════════
   7. MAIN EXPORT COMPONENT (WITH TABS)
   ═══════════════════════════════════════════════════════════════ */
export default function BankLoanManagement() {
  const { user } = useUserAuth();
  const { lang, t } = useLanguage();

  const [activeTab, setActiveTab] = useState('loans');
  const [bankAccounts, setBankAccounts] = useState([]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(collection(db, `users/${user.uid}/bankAccounts`), s => {
      setBankAccounts(s.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [user?.uid]);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 20, fontFamily: 'sans-serif' }}>
      
      {/* TAB NAVIGATION */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '2px solid #e2e8f0', paddingBottom: 0 }}>
        {[
          { key: 'loans', label: t.tabLoans },
          { key: 'chitfunds', label: t.tabChitFunds },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '14px 24px',
              borderRadius: '12px 12px 0 0',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: 15,
              background: activeTab === tab.key ? 'white' : '#f1f5f9',
              color: activeTab === tab.key ? '#1e40af' : '#64748b',
              borderBottom: activeTab === tab.key ? '3px solid #3b82f6' : '3px solid transparent',
              transition: 'all 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ★ TAB: LOANS (FULLY RESTORED) ★ */}
      {activeTab === 'loans' && (
        <LoansTab user={user} t={t} lang={lang} bankAccounts={bankAccounts} />
      )}

      {/* TAB: CHIT FUNDS */}
      {activeTab === 'chitfunds' && (
        <ChitFundTab user={user} t={t} lang={lang} bankAccounts={bankAccounts} />
      )}
    </div>
  );
}