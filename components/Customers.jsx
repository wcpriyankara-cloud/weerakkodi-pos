'use client';

// components/Customers.jsx
// ✅ Quota-safe: onSnapshot → getDocs + sessionStorage cache
// ✅ Language-aware (lang prop)
// ✅ SSR-safe (no btoa/window on server)

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { db } from '@/shared/firebase-config';
import { useUserAuth } from '@/context/UserContext';
import {
  collection,
  onSnapshot,
  query,
  where,
  addDoc,
  updateDoc,
  doc,
  getDocs,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import InvoiceOutputManager from './InvoiceOutputManager';

/* ════════════════════════════════════════
   HELPERS
════════════════════════════════════════ */
const nn = (v) => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

const fmt = (v) =>
  nn(v).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const normalizePhone = (raw) => {
  if (!raw) return '';
  let p = String(raw).replace(/[^\d+]/g, '');
  if (p.startsWith('+94')) p = '0' + p.slice(3);
  else if (p.startsWith('94') && p.length >= 11) p = '0' + p.slice(2);
  else if (/^\d{9}$/.test(p)) p = '0' + p;
  return p;
};

const slugify = (s) =>
  String(s || 'customer')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const makePortalKey = (name) =>
  `${slugify(name)}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const getPortalLink = (key) => {
  if (typeof window === 'undefined') return '';
  return key ? `${window.location.origin}/portal/${key}` : '';
};

const getCustomerBalance = (c) =>
  nn(c?.currentBalance ?? c?.balance ?? 0);

// ✅ SSR-safe avatar
const getDefaultAvatar = () => {
  if (typeof window === 'undefined') return '';
  return (
    'data:image/svg+xml;base64,' +
    btoa(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
        `<circle cx="50" cy="50" r="50" fill="#dbeafe"/>` +
        `<circle cx="50" cy="38" r="18" fill="#3b82f6"/>` +
        `<path d="M20 85c6-16 20-24 30-24s24 8 30 24" fill="none" stroke="#3b82f6" stroke-width="10"/>` +
      `</svg>`
    )
  );
};

/* ════════════════════════════════════════
   CACHE HELPERS
════════════════════════════════════════ */
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const saveCustomersCache = (uid, list) => {
  try {
    sessionStorage.setItem(
      `customers_${uid}`,
      JSON.stringify({
        data: list.map((c) => ({
          id:              c.id,
          name:            c.name            || '',
          phone:           c.phone           || '',
          address:         c.address         || '',
          email:           c.email           || '',
          nic:             c.nic             || '',
          notes:           c.notes           || '',
          currentBalance:  c.currentBalance  || 0,
          profilePicture:  c.profilePicture  || '',
          portalAccessKey: c.portalAccessKey || '',
          creditLimit:     c.creditLimit     || 0,
        })),
        ts: Date.now(),
      })
    );
  } catch {}
};

const loadCustomersCache = (uid) => {
  try {
    const raw = sessionStorage.getItem(`customers_${uid}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch { return null; }
};

const clearCustomersCache = (uid) => {
  try { sessionStorage.removeItem(`customers_${uid}`); } catch {}
};

/* ════════════════════════════════════════
   SYNTHETIC INVOICE BUILDER
════════════════════════════════════════ */
const buildSyntheticInvoice = (shareData, customer) => {
  if (!shareData) return null;
  const {
    type, customerName, customerPhone,
    amount, method, note,
    previousBalance, newBalance, date, refNo,
  } = shareData;
  const isPayment = type === 'payment';
  const now = new Date();
  const methodMap = {
    cash: 'cash', bank: 'etransfer', card: 'card',
    cheque: 'cheque', online: 'etransfer', credit: 'credit',
  };
  const invoiceMethod = methodMap[method] || 'cash';
  const paidAmt = nn(amount);
  const itemName = isPayment ? 'ගෙවීම් රිසිට්පත' : 'ණය ඇතුළු කිරීම';
  return {
    id: `${type}-${refNo}`,
    invoiceNo: refNo,
    invoiceCode: `${isPayment ? 'PAY' : 'CRD'}-${refNo}`,
    customerId: customer?.id || '',
    customerName: customerName || '',
    customerPhone: customerPhone || '',
    customerAddress: customer?.address || '',
    items: [{
      name: itemName, nameSi: isPayment ? 'ගෙවීම' : 'ණය',
      qty: 1, sellingPrice: paidAmt, yourPrice: paidAmt,
      lineTotal: paidAmt, uom: 'unit', warrantyCode: '',
    }],
    grossTotal: paidAmt, totalDiscount: 0, billDiscount: 0,
    billDiscountPercent: 0, exchangeAmount: 0, returnAmount: 0,
    netAmount: paidAmt, payAmount: isPayment ? paidAmt : 0,
    balance: isPayment ? 0 : -paidAmt,
    paymentMethod: invoiceMethod, remarks: note || '',
    invoiceRemark: note || '',
    previousOutstanding: nn(previousBalance),
    newOutstanding: nn(newBalance),
    customerCurrentBalance: nn(newBalance),
    createdAt: { toDate: () => now },
    date: date || now.toLocaleDateString('en-GB'),
    status: 'completed', type: 'receipt',
    _collection: 'customerTransactions',
    _isReceipt: true, _receiptType: type,
  };
};

/* ════════════════════════════════════════
   TRANSLATIONS
════════════════════════════════════════ */
const translations = {
  si: {
    title: 'පාරිභෝගිකයින්',
    addNew: 'නව පාරිභෝගිකයෙක්',
    refresh: '🔄 Refresh',
    search: 'නම / දුරකථනය සොයන්න...',
    showCredit: 'ණය ඇති අය පමණක්',
    name: 'නම',
    mobile: 'දුරකථන',
    address: 'ලිපිනය',
    balance: 'ශේෂය',
    action: 'ක්‍රියා',
    loading: 'පූරණය වෙමින්...',
    noData: 'පාරිභෝගිකයින් හමු නොවීය',
    save: 'සුරකින්න',
    cancel: 'අවලංගු කරන්න',
    adding: 'එකතු කරමින්...',
    success: 'සාර්ථකව ඇතුළත් කරන ලදී!',
    loginRequired: 'කරුණාකර පළමුව ලොග් වන්න',
    totalReceivables: 'ලබාගත යුතු මුළු හිඟ මුදල',
    settled: 'පියවා ඇත',
    totalCustomers: 'මුළු පාරිභෝගිකයින්',
    creditCustomers: 'ණය ඇති',
    settledCustomers: 'පියවා ඇති',
    showing: 'පෙන්වන්නේ',
    of: 'න්',
    sortBalHigh: 'ශේෂය (වැඩි→අඩු)',
    sortBalLow: 'ශේෂය (අඩු→වැඩි)',
    sortNameAZ: 'නම (අ-ඔ)',
    sortNameZA: 'නම (ඔ-අ)',
    cardView: 'කාඩ්පත්',
    tableView: 'වගුව',
    perPage: 'පිටුවට',
    prev: 'පෙර',
    next: 'ඊළඟ',
    page: 'පිටුව',
    receivePayment: 'මුදල් ලබාගැනීම',
    amountReceived: 'ලැබෙන මුදල',
    paymentMethod: 'ගෙවීම් ක්‍රමය',
    receiveNow: 'ලබාගන්න',
    paymentNote: 'ගෙවීම් සටහන (Optional)',
    paymentSuccess: '✅ මුදල් ලබාගැනීම සාර්ථකයි!',
    overpaid: 'අතිරේක ගෙවීම',
    lastUpdated: 'අවසන් update',
    offlineMsg: '⚠️ Offline — Cache data',
    quotaMsg: '⚠️ Quota exceeded — Cache data',
  },
  en: {
    title: 'Customers',
    addNew: 'New Customer',
    refresh: '🔄 Refresh',
    search: 'Search Name / Mobile...',
    showCredit: 'Credit Only',
    name: 'Name',
    mobile: 'Mobile',
    address: 'Address',
    balance: 'Balance',
    action: 'Action',
    loading: 'Loading...',
    noData: 'No customers found',
    save: 'Save',
    cancel: 'Cancel',
    adding: 'Adding...',
    success: 'Customer added successfully!',
    loginRequired: 'Please login first',
    totalReceivables: 'Total Receivables',
    settled: 'Settled',
    totalCustomers: 'Total Customers',
    creditCustomers: 'Credit',
    settledCustomers: 'Settled',
    showing: 'Showing',
    of: 'of',
    sortBalHigh: 'Balance (High→Low)',
    sortBalLow: 'Balance (Low→High)',
    sortNameAZ: 'Name (A-Z)',
    sortNameZA: 'Name (Z-A)',
    cardView: 'Cards',
    tableView: 'Table',
    perPage: 'Per Page',
    prev: 'Prev',
    next: 'Next',
    page: 'Page',
    receivePayment: 'Receive Payment',
    amountReceived: 'Amount Received',
    paymentMethod: 'Payment Method',
    receiveNow: 'Receive Now',
    paymentNote: 'Payment Note (Optional)',
    paymentSuccess: '✅ Payment received!',
    overpaid: 'Overpaid',
    lastUpdated: 'Last updated',
    offlineMsg: '⚠️ Offline — Cache data',
    quotaMsg: '⚠️ Quota exceeded — Cache data',
  },
};

/* ════════════════════════════════════════
   RENTAL HISTORY MODAL
════════════════════════════════════════ */
function RentalHistoryModal({ customer, onClose, lang }) {
  const { user } = useUserAuth();
  const [rentals, setRentals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid || !customer?.id) return;
    const q = query(
      collection(db, 'rentalBookings'),
      where('uid', '==', user.uid),
      where('customerId', '==', customer.id)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setRentals(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [user?.uid, customer?.id]);

  return (
    <div style={styles.modalOverlay}>
      <div style={{ ...styles.modalContent, maxWidth: 700 }}>
        <div style={styles.modalHeader}>
          <h3 style={{ margin: 0 }}>
            🏗️ {lang === 'si' ? 'කුලී ඉතිහාසය' : 'Rental History'}
          </h3>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 30 }}>⏳</div>
        ) : rentals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>
            📭 {lang === 'si' ? 'කුලී ඉතිහාසය නොමැත' : 'No rental history'}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {rentals.map((r) => (
              <div key={r.id} style={{ background: '#f8fafc', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 700 }}>📦 {r.itemName || '-'}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  📅 {r.startDate || '-'} → {r.expectedReturnDate || '-'}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 6 }}>
                  Rs.{fmt(nn(r.totalAmount))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   PAYMENT MODAL
════════════════════════════════════════ */
function PaymentCollectionModal({ customer, onClose, onSuccess, t, user }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const bal = nn(customer?.currentBalance);
    if (bal > 0) setAmount(bal.toFixed(2));
  }, [customer]);

  const handleSave = async () => {
    const payAmt = nn(amount);
    if (payAmt <= 0) return alert(t.amountReceived);
    setSaving(true);
    try {
      const previousBalance = nn(customer?.currentBalance);
      const newBalance = previousBalance - payAmt;
      const refNo = Date.now().toString(36).toUpperCase().slice(-8);
      const date = new Date().toISOString().split('T')[0];

      await addDoc(collection(db, 'customerTransactions'), {
        uid: user.uid,
        customerId: customer.id,
        customerName: customer.name || '',
        customerPhone: customer.phone || '',
        type: 'payment',
        amount: payAmt,
        method,
        note: note || '',
        status: 'confirmed',
        createdAt: serverTimestamp(),
        date,
      });

      await updateDoc(doc(db, 'customers', customer.id), {
        currentBalance: increment(-payAmt),
        updatedAt: serverTimestamp(),
      });

      const synthetic = buildSyntheticInvoice({
        type: 'payment',
        customerName: customer.name,
        customerPhone: customer.phone,
        amount: payAmt,
        method,
        note,
        previousBalance,
        newBalance,
        date,
        refNo,
      }, customer);

      onSuccess(synthetic);
    } catch (e) {
      alert(`❌ ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.modalOverlay}>
      <div style={{ ...styles.modalContent, maxWidth: 440 }}>
        <div style={styles.modalHeader}>
          <h3 style={{ margin: 0, color: '#16a34a' }}>💰 {t.receivePayment}</h3>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>
        <div style={{ padding: '10px 0 20px' }}>
          <div style={{ marginBottom: 14 }}>
            <label style={styles.label}>{t.amountReceived}</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ ...styles.input, fontSize: 24, fontWeight: 'bold', textAlign: 'center' }}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={styles.label}>{t.paymentMethod}</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} style={styles.input}>
              <option value="cash">💵 Cash</option>
              <option value="card">💳 Card</option>
              <option value="bank">🏦 Bank</option>
              <option value="cheque">🧾 Cheque</option>
            </select>
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={styles.label}>{t.paymentNote}</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={styles.input}
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={styles.cancelBtn}>{t.cancel}</button>
            <button onClick={handleSave} disabled={saving} style={styles.saveBtn}>
              {saving ? '⏳...' : `💰 ${t.receiveNow}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════ */
export default function Customers({ lang = 'si' }) {
  const t = translations[lang] || translations.si;
  const { user, loading: authLoading } = useUserAuth();

  const [customers,    setCustomers   ] = useState([]);
  const [loading,      setLoading     ] = useState(true);
  const [lastFetchTs,  setLastFetchTs ] = useState(0);
  const [fetchErrMsg,  setFetchErrMsg ] = useState('');
  const [searchTerm,   setSearchTerm  ] = useState('');
  const [showCreditOnly, setShowCreditOnly] = useState(false);
  const [sortBy,       setSortBy      ] = useState('balHigh');
  const [viewMode,     setViewMode    ] = useState('table');
  const [page,         setPage        ] = useState(1);
  const [perPage,      setPerPage     ] = useState(25);

  const [showModal,    setShowModal   ] = useState(false);
  const [newCustomer,  setNewCustomer ] = useState({
    name: '', phone: '', address: '',
    email: '', nic: '', notes: '', profilePicture: '',
  });
  const [phoneSuffix,  setPhoneSuffix ] = useState('');
  const [isSaving,     setIsSaving    ] = useState(false);

  const [showPaymentModal,   setShowPaymentModal  ] = useState(false);
  const [selectedCustomer,   setSelectedCustomer  ] = useState(null);
  const [outputInvoice,      setOutputInvoice     ] = useState(null);
  const [rentalHistoryCust,  setRentalHistoryCust ] = useState(null);

  /* ════════════════════════════════════════
     ✅ QUOTA-SAFE FETCH (getDocs + cache)
     ════════════════════════════════════════ */
  const fetchCustomers = useCallback(async (forceRefresh = false) => {
    if (!user?.uid) {
      setCustomers([]);
      setLoading(false);
      return;
    }

    setFetchErrMsg('');

    // ── Cache check ──
    if (!forceRefresh) {
      const cached = loadCustomersCache(user.uid);
      if (cached && cached.length > 0) {
        const list = cached.map((c) => ({
          ...c,
          currentBalance: nn(c.currentBalance),
        }));
        list.sort((a, b) => nn(b.currentBalance) - nn(a.currentBalance));
        setCustomers(list);
        setLoading(false);
        return;
      }
    }

    // ── Firestore fetch ──
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'customers'), where('uid', '==', user.uid))
      );

      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        currentBalance: nn(d.data().currentBalance),
      }));

      list.sort((a, b) => nn(b.currentBalance) - nn(a.currentBalance));

      setCustomers(list);
      setLastFetchTs(Date.now());
      saveCustomersCache(user.uid, list);

    } catch (e) {
      console.error('Customers fetch error:', e);

      // ── Quota / offline — load cache anyway ──
      const cached = loadCustomersCache(user.uid);
      if (cached && cached.length > 0) {
        const list = cached.map((c) => ({
          ...c,
          currentBalance: nn(c.currentBalance),
        }));
        list.sort((a, b) => nn(b.currentBalance) - nn(a.currentBalance));
        setCustomers(list);
        setFetchErrMsg(
          e.code === 'resource-exhausted' ? t.quotaMsg : t.offlineMsg
        );
      }
    } finally {
      setLoading(false);
    }
  }, [user?.uid, t.quotaMsg, t.offlineMsg]);

  // ── Initial load ──
  useEffect(() => {
    if (!authLoading) fetchCustomers();
  }, [authLoading, fetchCustomers]);

  /* ── Add customer ── */
  const handleAddCustomer = async (e) => {
    e.preventDefault();
    if (!newCustomer.name || !phoneSuffix) return alert('Please enter Name and Phone Number');
    if (!user) return alert(t.loginRequired);
    setIsSaving(true);
    try {
      const portalAccessKey = makePortalKey(newCustomer.name);
      await addDoc(collection(db, 'customers'), {
        name:            newCustomer.name,
        phone:           `+94${phoneSuffix}`,
        address:         newCustomer.address  || '',
        email:           newCustomer.email    || '',
        nic:             newCustomer.nic      || '',
        notes:           newCustomer.notes    || '',
        profilePicture:  newCustomer.profilePicture || '',
        photoURL:        newCustomer.profilePicture || '',
        uid:             user.uid,
        currentBalance:  0,
        portalAccessKey,
        createdAt:       serverTimestamp(),
        updatedAt:       serverTimestamp(),
      });

      alert(t.success);
      setShowModal(false);
      setNewCustomer({ name:'', phone:'', address:'', email:'', nic:'', notes:'', profilePicture:'' });
      setPhoneSuffix('');

      // ── Clear cache + refresh ──
      clearCustomersCache(user.uid);
      fetchCustomers(true);

    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  /* ── Payment modal ── */
  const openPaymentModal = (cus) => {
    setSelectedCustomer(cus);
    setShowPaymentModal(true);
  };

  /* ── Stats ── */
  const stats = useMemo(() => {
    const total           = customers.length;
    const totalReceivables = customers.reduce((s, c) => s + Math.max(0, nn(c.currentBalance)), 0);
    const totalOverpaid    = customers.reduce((s, c) => s + Math.abs(Math.min(0, nn(c.currentBalance))), 0);
    const creditCount      = customers.filter((c) => nn(c.currentBalance) > 0.01).length;
    const overpaidCount    = customers.filter((c) => nn(c.currentBalance) < -0.01).length;
    const settledCount     = total - creditCount - overpaidCount;
    return { total, totalReceivables, totalOverpaid, creditCount, overpaidCount, settledCount };
  }, [customers]);

  /* ── Filter & sort ── */
  const filteredCustomers = useMemo(() => {
    const words = searchTerm.toLowerCase().trim().split(/\s+/).filter(Boolean);
    let result = customers.filter((c) => {
      const hay = [c.name, c.phone, c.address, c.email, c.nic].filter(Boolean).join(' ').toLowerCase();
      const termMatch  = words.length === 0 || words.every((w) => hay.includes(w));
      const creditMatch = showCreditOnly ? nn(c.currentBalance) > 0 : true;
      return termMatch && creditMatch;
    });

    switch (sortBy) {
      case 'nameAZ':  result.sort((a, b) => (a.name || '').localeCompare(b.name || '')); break;
      case 'nameZA':  result.sort((a, b) => (b.name || '').localeCompare(a.name || '')); break;
      case 'balHigh': result.sort((a, b) => nn(b.currentBalance) - nn(a.currentBalance)); break;
      case 'balLow':  result.sort((a, b) => nn(a.currentBalance) - nn(b.currentBalance)); break;
    }
    return result;
  }, [customers, searchTerm, showCreditOnly, sortBy]);

  const totalPages = Math.ceil(filteredCustomers.length / perPage);
  const pagedCustomers = useMemo(
    () => filteredCustomers.slice((page - 1) * perPage, page * perPage),
    [filteredCustomers, page, perPage]
  );

  useEffect(() => { setPage(1); }, [searchTerm, showCreditOnly, sortBy, perPage]);

  /* ── Balance badge ── */
  const BalanceBadge = ({ balance }) => {
    const b = nn(balance);
    if (b > 0.01) return <div style={{ fontWeight: 800, color: '#dc2626', fontSize: 16 }}>Rs.{fmt(b)}</div>;
    if (b < -0.01) return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <div style={{ fontWeight: 800, color: '#2563eb', fontSize: 14 }}>-Rs.{fmt(Math.abs(b))}</div>
        <div style={{ fontSize: 10, color: '#2563eb', fontWeight: 600, background: '#eff6ff', padding: '1px 6px', borderRadius: 8, marginTop: 1 }}>
          💰 {t.overpaid}
        </div>
      </div>
    );
    return <div style={styles.settledBadge}>✅ {t.settled}</div>;
  };

  /* ── Loading ── */
  if (authLoading || loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontWeight: 600, fontSize: 18 }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ width: 40, height: 40, border: '4px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto 12px' }} />
        {t.loading}
      </div>
    );
  }

  /* ════════════════════════════════════════
     RENDER
  ════════════════════════════════════════ */
  return (
    <div style={styles.container}>

      {outputInvoice && (
        <InvoiceOutputManager
          invoice={outputInvoice}
          onClose={() => setOutputInvoice(null)}
        />
      )}

      {rentalHistoryCust && (
        <RentalHistoryModal
          customer={rentalHistoryCust}
          onClose={() => setRentalHistoryCust(null)}
          lang={lang}
        />
      )}

      {/* ── HEADER ── */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 28 }}>👥</span>
          <div>
            <h2 style={styles.title}>{t.title}</h2>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
              {stats.total} {t.totalCustomers}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* ✅ Refresh button */}
          <button
            onClick={() => fetchCustomers(true)}
            disabled={loading}
            style={{
              padding: '10px 16px',
              background: '#f1f5f9',
              color: '#374151',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              cursor: loading ? 'wait' : 'pointer',
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {t.refresh}
          </button>

          <button onClick={() => setShowModal(true)} style={styles.addButton}>
            ➕ {t.addNew}
          </button>
        </div>
      </div>

      {/* ── Fetch error banner ── */}
      {fetchErrMsg && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde068', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#92400e', fontWeight: 600 }}>
          {fetchErrMsg}
        </div>
      )}

      {/* ── Last updated ── */}
      {lastFetchTs > 0 && (
        <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'right', marginBottom: 8 }}>
          ⏱️ {t.lastUpdated}: {new Date(lastFetchTs).toLocaleTimeString()} |
          📦 {customers.length} customers
        </div>
      )}

      {/* ── STATS ── */}
      <div style={styles.statsGrid}>
        {[
          { bg: 'linear-gradient(135deg,#fef2f2,#fee2e2)', bc: '#fca5a5', tc: '#991b1b', icon: '💸', label: t.totalReceivables, value: `Rs.${fmt(stats.totalReceivables)}`, vc: '#dc2626' },
          { bg: 'linear-gradient(135deg,#eff6ff,#dbeafe)', bc: '#93c5fd', tc: '#1e40af', icon: '👥', label: t.totalCustomers,    value: stats.total,                           vc: '#2563eb' },
          { bg: 'linear-gradient(135deg,#fff7ed,#fed7aa)', bc: '#fdba74', tc: '#9a3412', icon: '⚠️', label: t.creditCustomers,   value: stats.creditCount,                     vc: '#ea580c' },
          { bg: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', bc: '#86efac', tc: '#166534', icon: '✅', label: t.settledCustomers,  value: stats.settledCount,                    vc: '#16a34a' },
        ].map((s, i) => (
          <div key={i} style={{ ...styles.statCard, background: s.bg, borderColor: s.bc }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: s.tc }}>{s.icon} {s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: s.vc, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── FILTERS ── */}
      <div style={styles.filterRow}>
        <div style={{ position: 'relative', flex: 2, minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
          <input
            type="text"
            placeholder={t.search}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={styles.searchInput}
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} style={styles.clearSearchBtn}>✕</button>
          )}
        </div>

        <label style={{ ...styles.checkboxLabel, ...(showCreditOnly ? { borderColor: '#dc2626', background: '#fef2f2' } : {}) }}>
          <input
            type="checkbox"
            checked={showCreditOnly}
            onChange={(e) => setShowCreditOnly(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: '#dc2626' }}
          />
          <span style={{ color: showCreditOnly ? '#dc2626' : '#475569', fontWeight: showCreditOnly ? 700 : 500, fontSize: 13 }}>
            💳 {t.showCredit}
          </span>
        </label>

        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={styles.sortSelect}>
          <option value="balHigh">📉 {t.sortBalHigh}</option>
          <option value="balLow">📈 {t.sortBalLow}</option>
          <option value="nameAZ">🔤 {t.sortNameAZ}</option>
          <option value="nameZA">🔤 {t.sortNameZA}</option>
        </select>

        <div style={styles.viewToggle}>
          <button onClick={() => setViewMode('table')} style={{ ...styles.viewBtn2, ...(viewMode === 'table' ? styles.viewBtnOn : {}) }}>📋</button>
          <button onClick={() => setViewMode('cards')} style={{ ...styles.viewBtn2, ...(viewMode === 'cards' ? styles.viewBtnOn : {}) }}>🃏</button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '0 4px' }}>
        <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>
          {t.showing} {pagedCustomers.length} {t.of} {filteredCustomers.length}
        </span>
      </div>

      {/* ── TABLE VIEW ── */}
      {viewMode === 'table' && (
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                {['#', '', t.name, t.mobile, t.address, t.balance, t.action].map((h, i) => (
                  <th key={i} style={{ ...styles.th, textAlign: i === 5 ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedCustomers.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: 50, textAlign: 'center', color: '#94a3b8' }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                    <div style={{ fontSize: 15 }}>{t.noData}</div>
                  </td>
                </tr>
              ) : pagedCustomers.map((cus, index) => {
                const bal = nn(cus.currentBalance);
                const globalIdx = (page - 1) * perPage + index + 1;
                return (
                  <tr key={cus.id} style={styles.tr}>
                    <td style={styles.td}>{globalIdx}</td>
                    <td style={styles.td}>
                      {cus.profilePicture
                        ? <img src={cus.profilePicture} style={styles.avatarImg} alt="" />
                        : <div style={styles.avatarPlaceholder}>{(cus.name || '?').charAt(0).toUpperCase()}</div>}
                    </td>
                    <td
  style={{ ...styles.td, cursor: 'pointer' }}
  onClick={() => { window.location.href = `/customers/${cus.id}`; }}
>
  <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 15 }}>
    {cus.name || ''}
  </div>
  {cus.email && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>📧 {cus.email}</div>}
</td>
                    <td style={styles.td}>{cus.phone || '-'}</td>
                    <td style={styles.td}>{cus.address || '-'}</td>
                    <td style={{ ...styles.td, textAlign: 'right' }}><BalanceBadge balance={bal} /></td>
                    <td style={{ ...styles.td, textAlign: 'center' }}>
                      <button
                        onClick={() => openPaymentModal(cus)}
                        style={{ ...styles.viewBtn, background: '#dcfce7', color: '#16a34a', borderColor: '#86efac' }}
                      >
                        💰
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── CARDS VIEW ── */}
      {viewMode === 'cards' && (
        <div style={styles.cardGrid}>
          {pagedCustomers.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 50, color: '#94a3b8' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
              <div style={{ fontSize: 15 }}>{t.noData}</div>
            </div>
          ) : pagedCustomers.map((cus) => {
            const bal = nn(cus.currentBalance);
            return (
              <div
  key={cus.id}
  onClick={() => { window.location.href = `/customers/${cus.id}`; }}
  style={{
    ...styles.customerCard,
    cursor: 'pointer',
    borderLeftColor: bal > 0.01 ? '#dc2626' : bal < -0.01 ? '#2563eb' : '#16a34a'
  }}
>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  {cus.profilePicture
                    ? <img src={cus.profilePicture} style={{ ...styles.avatarImg, width: 48, height: 48 }} alt="" />
                    : <div style={{ ...styles.avatarPlaceholder, width: 48, height: 48, fontSize: 20 }}>{(cus.name || '?').charAt(0).toUpperCase()}</div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cus.name || ''}</div>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{cus.phone || '-'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}><BalanceBadge balance={bal} /></div>
                </div>
                {cus.address && <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>📍 {cus.address}</div>}
                <div style={{ display: 'flex', gap: 5, marginTop: 8, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => openPaymentModal(cus)}
                    style={{ ...styles.cardActionBtn, background: '#dcfce7', color: '#16a34a', border: '1px solid #86efac', fontWeight: 600 }}
                  >
                    💰 {t.receivePayment}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── PAGINATION ── */}
      {totalPages > 1 && (
        <div style={styles.pagination}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>{t.perPage}:</span>
            <select
              value={perPage}
              onChange={(e) => setPerPage(Number(e.target.value))}
              style={{ ...styles.sortSelect, width: 65, padding: '6px 8px' }}
            >
              {[10, 25, 50, 100].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={{ ...styles.pageBtn, opacity: page === 1 ? 0.4 : 1 }}>◀ {t.prev}</button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ ...styles.pageBtn, opacity: page === totalPages ? 0.4 : 1 }}>{t.next} ▶</button>
          </div>
          <span style={{ fontSize: 12, color: '#64748b' }}>{t.page} {page} / {totalPages}</span>
        </div>
      )}

      {/* ── PAYMENT MODAL ── */}
      {showPaymentModal && selectedCustomer && (
        <PaymentCollectionModal
          customer={selectedCustomer}
          t={t}
          user={user}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={(syntheticInvoice) => {
            setShowPaymentModal(false);
            setSelectedCustomer(null);
            setOutputInvoice(syntheticInvoice);
            // ── Clear cache + refresh ──
            clearCustomersCache(user.uid);
            fetchCustomers(true);
          }}
        />
      )}

      {/* ── ADD CUSTOMER MODAL ── */}
      {showModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, fontSize: 18 }}>👤 {t.addNew}</h3>
              <button onClick={() => setShowModal(false)} style={styles.closeBtn}>✕</button>
            </div>
            <form onSubmit={handleAddCustomer} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <input
                style={styles.input}
                value={newCustomer.name}
                onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                required
                autoFocus
                placeholder={t.name}
              />
              <div style={styles.phoneWrap}>
                <span style={styles.phonePrefix}>+94</span>
                <input
                  style={{ ...styles.input, border: 'none', borderRadius: 0, paddingLeft: 8 }}
                  type="tel"
                  value={phoneSuffix}
                  onChange={(e) => setPhoneSuffix(e.target.value.replace(/\D/g, ''))}
                  placeholder="771234567"
                  required
                  maxLength={9}
                />
              </div>
              <textarea
                style={{ ...styles.input, height: 60, resize: 'vertical' }}
                value={newCustomer.address}
                onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                placeholder={t.address}
              />
              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowModal(false)} style={styles.cancelBtn}>
                  {t.cancel}
                </button>
                <button type="submit" disabled={isSaving} style={{ ...styles.saveBtn, opacity: isSaving ? 0.6 : 1 }}>
                  {isSaving ? `⏳ ${t.adding}` : `💾 ${t.save}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════
   STYLES
════════════════════════════════════════ */
const styles = {
  container:         { padding: 20, maxWidth: 1400, margin: '0 auto', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' },
  header:            { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  title:             { margin: 0, color: '#1e293b', fontSize: 24, fontWeight: 800 },
  addButton:         { padding: '10px 20px', background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 12px rgba(59,130,246,0.3)', whiteSpace: 'nowrap' },
  statsGrid:         { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))', gap: 10, marginBottom: 16 },
  statCard:          { padding: '14px 16px', borderRadius: 14, border: '2px solid transparent' },
  filterRow:         { display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center', background: '#f8fafc', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0' },
  searchInput:       { padding: '11px 32px 11px 38px', borderRadius: 10, border: '2px solid #e2e8f0', flex: 1, minWidth: 200, fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box', background: 'white' },
  clearSearchBtn:    { position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#94a3b8', padding: '2px 6px' },
  checkboxLabel:     { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', userSelect: 'none', background: 'white', padding: '8px 14px', borderRadius: 10, border: '2px solid #e2e8f0', whiteSpace: 'nowrap' },
  sortSelect:        { padding: '10px 12px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 13, outline: 'none', background: 'white', cursor: 'pointer', fontWeight: 500 },
  viewToggle:        { display: 'flex', background: '#f1f5f9', borderRadius: 8, padding: 3 },
  viewBtn2:          { width: 36, height: 36, border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  viewBtnOn:         { background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,.1)' },
  tableContainer:    { overflowX: 'auto', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white' },
  table:             { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th:                { padding: '14px 12px', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 700, whiteSpace: 'nowrap', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  tr:                { borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' },
  td:                { padding: '12px 12px', color: '#334155', verticalAlign: 'middle' },
  avatarImg:         { width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', border: '2px solid #e2e8f0' },
  avatarPlaceholder: { width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'white', fontSize: 16 },
  viewBtn:           { padding: '7px 12px', background: '#e0f2fe', color: '#0284c7', border: '1px solid #bae6fd', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' },
  settledBadge:      { fontWeight: 600, color: '#16a34a', fontSize: 13, background: '#dcfce7', padding: '4px 12px', borderRadius: 20, display: 'inline-block' },
  cardGrid:          { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 12 },
  customerCard:      { background: 'white', borderRadius: 14, padding: 16, border: '1px solid #e2e8f0', borderLeft: '5px solid #16a34a', transition: 'all .15s', boxShadow: '0 1px 3px rgba(0,0,0,.04)' },
  cardActionBtn:     { padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 13 },
  pagination:        { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '14px 16px', background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', marginTop: 14 },
  pageBtn:           { padding: '7px 14px', borderRadius: 6, border: '1px solid #d1d5db', background: 'white', fontSize: 12, fontWeight: 500, cursor: 'pointer', color: '#475569' },
  modalOverlay:      { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  modalContent:      { background: 'white', padding: 28, borderRadius: 20, width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' },
  modalHeader:       { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 14, borderBottom: '2px solid #f1f5f9' },
  closeBtn:          { background: '#f1f5f9', border: 'none', width: 34, height: 34, borderRadius: '50%', fontSize: 16, cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' },
  input:             { width: '100%', padding: 12, borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', outline: 'none' },
  label:             { display: 'block', marginBottom: 5, fontWeight: 700, fontSize: 13, color: '#475569' },
  phoneWrap:         { display: 'flex', alignItems: 'center', border: '2px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', background: 'white' },
  phonePrefix:       { padding: '10px 12px', background: '#f1f5f9', fontWeight: 'bold', color: '#475569', fontSize: 14, borderRight: '2px solid #e2e8f0' },
  modalActions:      { display: 'flex', gap: 12, marginTop: 20, paddingTop: 14, borderTop: '2px solid #f1f5f9' },
  cancelBtn:         { flex: 1, padding: 13, background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14 },
  saveBtn:           { flex: 1, padding: 13, background: 'linear-gradient(135deg,#10b981,#059669)', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14, boxShadow: '0 2px 8px rgba(16,185,129,.3)' },
};