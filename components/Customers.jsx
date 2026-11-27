'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db, auth } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  addDoc,
  updateDoc,
  doc,
  getDocs,
  getDoc,
  setDoc,
  serverTimestamp,
  increment,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { useUserAuth } from '@/context/UserContext';
import { localDb } from '@/lib/localDb';
import { normalizeDate } from '@/lib/utils';
import InvoiceOutputManager from './InvoiceOutputManager';

/* ════════════════════════════════════════
   HELPERS
════════════════════════════════════════ */
const nn = (v) => {
  const n = parseFloat(String(v ?? 0).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};
const fmt = (v) =>
  nn(v).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const pad2 = (n) => String(n).padStart(2, '0');
const nowHHMM24 = () => {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const localDateStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const slugify = (s) =>
  String(s || 'customer').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const makePortalKey = (name) =>
  `${slugify(name)}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const canUseCloud = () => navigator.onLine && db && typeof collection === 'function';

/* ════════════════════════════════════════
   TRANSLATIONS
════════════════════════════════════════ */
const T = {
  si: {
    title: 'පාරිභෝගිකයින්', addNew: 'නව පාරිභෝගිකයෙක්', refresh: '🔄 Refresh',
    search: 'නම / දුරකථනය සොයන්න...', showCredit: 'ණය ඇති අය පමණක්',
    name: 'නම', mobile: 'දුරකථන', address: 'ලිපිනය', balance: 'ශේෂය', action: 'ක්‍රියා',
    loading: 'පූරණය වෙමින්...', noData: 'පාරිභෝගිකයින් හමු නොවීය',
    save: 'සුරකින්න', cancel: 'අවලංගු කරන්න', adding: 'එකතු කරමින්...',
    success: 'සාර්ථකව ඇතුළත් කරන ලදී!', loginRequired: 'කරුණාකර පළමුව ලොග් වන්න',
    totalReceivables: 'ලබාගත යුතු මුළු හිඟ මුදල', settled: 'පියවා ඇත',
    totalCustomers: 'මුළු පාරිභෝගිකයින්', creditCustomers: 'ණය ඇති',
    settledCustomers: 'පියවා ඇති', showing: 'පෙන්වන්නේ', of: 'න්',
    sortBalHigh: 'ශේෂය (වැඩි→අඩු)', sortBalLow: 'ශේෂය (අඩු→වැඩි)',
    sortNameAZ: 'නම (අ-ඔ)', sortNameZA: 'නම (ඔ-අ)',
    perPage: 'පිටුවට', prev: 'පෙර', next: 'ඊළඟ', page: 'පිටුව',
    receivePayment: 'මුදල් ලබාගැනීම', amountReceived: 'ලැබෙන මුදල',
    paymentMethod: 'ගෙවීම් ක්‍රමය', receiveNow: 'ලබාගන්න',
    paymentNote: 'ගෙවීම් සටහන (Optional)',
    overpaid: 'අතිරේක ගෙවීම', lastUpdated: 'අවසන් update',
    offlineMsg: '⚠️ Offline — දේශීය දත්ත ක්‍රියාත්මකයි', quotaMsg: '⚠️ Quota exceeded',
    addCreditTitle: 'ණය ඇතුළු කිරීම', creditAmount: 'ණය මුදල',
    creditNote: 'ණය විස්තරය (Optional)', addCredit: 'ණය ඇතුළු කරන්න',
    newBalance: 'නව ශේෂය', currentBalance: 'වත්මන් ශේෂය',
    creditInfoMsg: 'Cash Management හි "ණය (OUT)" ලෙස පෙනෙනු ඇත.',
    paymentInfoMsg: 'Cash & Bank Register හි "ලැබීම (IN)" ලෙස ස්වයංක්‍රීයව සටහන් වේ.',
    fetchingBalance: 'Balance ලබාගනිමින්...',
    activeLoan: '💰 සක්‍රීය ණයක් ඇත',
    importContact: '📱 Contacts වලින් ගන්න',
    contactPickerError: '❌ Contacts ලබාගැනීමට නොහැකි විය.',
    contactPickerNotSupported: '⚠️ ඔබගේ දුරකථනය මෙම පහසුකම සපයන්නේ නැත.',
  },
  en: {
    title: 'Customers', addNew: 'New Customer', refresh: 'Refresh',
    search: 'Search Name / Mobile...', showCredit: 'Credit Only',
    name: 'Name', mobile: 'Mobile', address: 'Address', balance: 'Balance', action: 'Action',
    loading: 'Loading...', noData: 'No customers found',
    save: 'Save', cancel: 'Cancel', adding: 'Adding...',
    success: 'Customer added!', loginRequired: 'Please login first',
    totalReceivables: 'Total Receivables', settled: 'Settled',
    totalCustomers: 'Total Customers', creditCustomers: 'Credit',
    settledCustomers: 'Settled', showing: 'Showing', of: 'of',
    sortBalHigh: 'Balance (High→Low)', sortBalLow: 'Balance (Low→High)',
    sortNameAZ: 'Name (A-Z)', sortNameZA: 'Name (Z-A)',
    perPage: 'Per Page', prev: 'Prev', next: 'Next', page: 'Page',
    receivePayment: 'Receive Payment', amountReceived: 'Amount Received',
    paymentMethod: 'Payment Method', receiveNow: 'Receive Now',
    paymentNote: 'Payment Note (Optional)',
    overpaid: 'Overpaid', lastUpdated: 'Last updated',
    offlineMsg: '⚠️ Offline — Using Local Data', quotaMsg: '⚠️ Quota exceeded',
    addCreditTitle: 'Add Credit Entry', creditAmount: 'Credit Amount',
    creditNote: 'Credit Description (Optional)', addCredit: 'Add Credit',
    newBalance: 'New Balance', currentBalance: 'Current Balance',
    creditInfoMsg: 'Will appear as "Credit (OUT)" in Cash Management.',
    paymentInfoMsg: 'Automatically recorded as "Cash In" in Cash & Bank Register.',
    fetchingBalance: 'Fetching balance...',
    activeLoan: '💰 Active Loan Exist',
    importContact: '📱 From Phone Contacts',
    contactPickerError: '❌ Could not retrieve contacts.',
    contactPickerNotSupported: '⚠️ Contact picker is not supported on this device.',
  },
};

/* ════════════════════════════════════════
   PAYMENT MODAL
════════════════════════════════════════ */
function PaymentModal({ customer, onClose, onSuccess, t, user }) {
  const [amount,      setAmount     ] = useState('');
  const [method,      setMethod     ] = useState('cash');
  const [note,        setNote       ] = useState('');
  const [saving,      setSaving     ] = useState(false);
  const [freshBal,    setFreshBal   ] = useState(null);
  const [fetchingBal, setFetchingBal] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setFetchingBal(true);
      try {
        const localRecord = await localDb.customers.get(customer.id);
        if (active && localRecord) {
          const bal = nn(localRecord.currentBalance);
          setFreshBal(bal);
          if (bal > 0) setAmount((Number(bal) || 0).toFixed(2));
        }
        if (canUseCloud()) {
          const snap = await getDoc(doc(db, 'customers', customer.id));
          if (!active) return;
          if (snap.exists()) {
            const bal = nn(snap.data().currentBalance);
            setFreshBal(bal);
            if (bal > 0) setAmount((Number(bal) || 0).toFixed(2));
            await localDb.customers.update(customer.id, { currentBalance: bal }).catch(() => {});
          }
        }
      } catch (e) {
        console.warn('Fresh balance check notice:', e?.message || e);
      } finally {
        if (active) setFetchingBal(false);
      }
    })();
    return () => { active = false; };
  }, [customer.id]);

  const currentBal = freshBal !== null ? freshBal : nn(customer?.currentBalance);

  const handleSave = async () => {
    const payAmt = nn(amount);
    if (payAmt <= 0) return alert(t.amountReceived);
    if (fetchingBal) return alert('Balance loading...');
    if (!user?.uid) return alert(t.loginRequired);

    const prevBal = currentBal;
    const newBal  = prevBal - payAmt;
    setSaving(true);
    try {
      const refNo    = `PAY${Date.now().toString(36).toUpperCase().slice(-8)}`;
      const dateStr  = localDateStr();
      const timeStr  = nowHHMM24();
      const nowTs    = Timestamp ? Timestamp.now() : null;
      const now      = new Date();
      let cusTxnId   = `txn_${Date.now()}`;

      await localDb.customers.update(customer.id, {
        currentBalance: newBal,
        updatedAt: now.toISOString(),
        synced: 0
      });

      if (localDb.customerTransactions) {
        await localDb.customerTransactions.put({
          id: cusTxnId,
          uid: user.uid,
          customerId: customer.id,
          customerName: customer.name || '',
          customerPhone: customer.phone || '',
          type: 'payment',
          amount: payAmt,
          method,
          note: note || '',
          status: 'confirmed',
          refNo,
          createdAt: now.toISOString(),
          date: dateStr,
          time: timeStr,
          synced: 0
        });
      }

      if (canUseCloud()) {
        try {
          const cusTxnRef = await addDoc(collection(db, 'customerTransactions'), {
            uid: user.uid,
            customerId: customer.id,
            customerName: customer.name || '',
            customerPhone: customer.phone || '',
            type: 'payment',
            amount: payAmt,
            method,
            note: note || '',
            status: 'confirmed',
            refNo,
            createdAt: serverTimestamp(),
            timestamp: nowTs,
            date: dateStr,
            time: timeStr,
          });
          cusTxnId = cusTxnRef.id;

          await updateDoc(doc(db, 'customers', customer.id), {
            currentBalance: increment(-payAmt),
            lastPaymentAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          await addDoc(collection(db, `users/${user.uid}/cashTransactions`), {
            type: 'in',
            source: 'invoicePayment',
            category: 'invoicePayment',
            description: `💵 පාරිභෝගික ගෙවීම් ලැබීම [${customer.name || 'Customer'}]${note ? ' | ' + note : ''}`,
            amount: payAmt,
            paymentMethod: method,
            customerId: customer.id,
            customerName: customer.name || '',
            customerPhone: customer.phone || '',
            customerTxnId: cusTxnId,
            reference: refNo,
            notes: note || '',
            note: note || '',
            previousOutstanding: prevBal,
            newOutstanding: newBal,
            date: dateStr,
            time: timeStr,
            timestamp: nowTs,
            createdAt: serverTimestamp(),
            createdBy: user?.email || '',
            uid: user.uid,
            isAutomatic: true,
          });

          await localDb.customers.update(customer.id, { synced: 1 }).catch(() => {});
        } catch (cloudErr) {
          console.warn("Deferred cloud payment registration:", cloudErr?.message || cloudErr);
        }
      }

      const methodMap = { cash: 'cash', bank: 'etransfer', card: 'card', cheque: 'cheque', online: 'etransfer' };
      const synthetic = {
        _isReceipt: true, _receiptType: 'payment',
        id: `payment-${refNo}`, invoiceNo: refNo, invoiceCode: `PAY-${refNo}`,
        customerId: customer.id || '', customerName: customer.name || '',
        customerPhone: customer.phone || '', customerAddress: customer.address || '',
        items: [{
          name: 'ගෙවීම් රිසිට්පත', nameSi: 'ගෙවීම',
          qty: 1, sellingPrice: payAmt, yourPrice: payAmt,
          lineTotal: payAmt, uom: 'unit', warrantyCode: '',
        }],
        grossTotal: payAmt, totalDiscount: 0, billDiscount: 0,
        billDiscountPercent: 0, exchangeAmount: 0,
        netAmount: payAmt, payAmount: payAmt, balance: 0,
        paymentMethod: methodMap[method] || 'cash',
        remarks: note || '', invoiceRemark: note || '',
        previousOutstanding: prevBal, newOutstanding: newBal,
        customerCurrentBalance: newBal,
        createdAt: { toDate: () => now },
        date: dateStr, status: 'completed', type: 'receipt',
        _collection: 'customerTransactions',
      };
      onSuccess(synthetic);
    } catch (e) {
      console.error('Payment error:', e);
      alert(`❌ ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={S.overlay}>
      <div style={{ ...S.modal, maxWidth: 440 }}>
        <div style={S.modalHead}>
          <h3 style={{ margin: 0, color: '#16a34a' }}>💰 {t.receivePayment}</h3>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <div style={{ padding: '10px 0 20px' }}>
          <div style={{ marginBottom: 16, padding: 14, background: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {customer.profilePicture ? (
                <img src={customer.profilePicture} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} alt="" />
              ) : (
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 18 }}>
                  {(customer.name || '?')[0]}
                </div>
              )}
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{customer.name}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{customer.phone}</div>
              </div>
            </div>
            <div style={{ marginTop: 10, padding: '8px 12px', background: 'white', borderRadius: 8, border: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#166534', fontWeight: 700 }}>{t.currentBalance}:</span>
              {fetchingBal ? (
                <span style={{ fontSize: 14, color: '#64748b', fontStyle: 'italic' }}>⏳ {t.fetchingBalance}</span>
              ) : (
                <span style={{ fontSize: 20, fontWeight: 900, color: '#dc2626' }}>Rs.{fmt(currentBal)}</span>
              )}
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>{t.amountReceived} *</label>
            <input type="number" autoFocus placeholder="0.00"
              value={amount} onChange={(e) => setAmount(e.target.value)}
              style={{ ...S.input, fontSize: 24, fontWeight: 'bold', color: '#16a34a', textAlign: 'center', padding: 16 }} />
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {currentBal > 0 && (
                <button onClick={() => setAmount((Number(currentBal) || 0).toFixed(2))} style={S.quickBtn}>
                  ✅ Full Rs.{fmt(currentBal)}
                </button>
              )}
              {[1000, 5000, 10000].map(a => (
                <button key={a} onClick={() => setAmount(a.toString())} style={S.quickBtn}>
                  Rs.{a.toLocaleString()}
                </button>
              ))}
            </div>
            {nn(amount) > 0 && (
              <div style={{ marginTop: 8, padding: '8px 12px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>{t.newBalance}:</span>
                <span style={{ fontWeight: 800, color: '#16a34a', fontSize: 16 }}>
                  Rs.{fmt(currentBal - nn(amount))}
                </span>
              </div>
            )}
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>{t.paymentMethod}</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
              {[
                { v: 'cash', i: '💵', l: 'Cash' }, { v: 'card', i: '💳', l: 'Card' },
                { v: 'bank', i: '🏦', l: 'Bank' }, { v: 'cheque', i: '🧾', l: 'Cheque' },
              ].map(m => (
                <button key={m.v} onClick={() => setMethod(m.v)} style={{
                  padding: '10px 6px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  border: method === m.v ? '2px solid #16a34a' : '2px solid #e2e8f0',
                  background: method === m.v ? '#f0fdf4' : 'white',
                  color: method === m.v ? '#16a34a' : '#64748b',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                  <span style={{ fontSize: 18 }}>{m.i}</span><span>{m.l}</span>
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>{t.paymentNote}</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
              style={S.input} placeholder="ගෙවීම් විස්තරය..." />
          </div>
          <div style={{ marginBottom: 16, padding: '10px 14px', background: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe', fontSize: 12, color: '#1e40af' }}>
            ℹ️ {t.paymentInfoMsg}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={S.cancelBtn}>{t.cancel}</button>
            <button onClick={handleSave} disabled={saving || nn(amount) <= 0 || fetchingBal}
              style={{ ...S.saveBtn, opacity: (saving || nn(amount) <= 0 || fetchingBal) ? 0.6 : 1 }}>
              {saving ? '⏳ සුරකිමින්...' : fetchingBal ? '⏳...' : `💰 ${t.receiveNow}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   CREDIT MODAL
════════════════════════════════════════ */
function CreditModal({ customer, onClose, onSuccess, t, user }) {
  const [amount,      setAmount     ] = useState('');
  const [note,        setNote       ] = useState('');
  const [saving,      setSaving     ] = useState(false);
  const [freshBal,    setFreshBal   ] = useState(null);
  const [fetchingBal, setFetchingBal] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setFetchingBal(true);
      try {
        const localRecord = await localDb.customers.get(customer.id);
        if (active && localRecord) {
          setFreshBal(nn(localRecord.currentBalance));
        }
        if (canUseCloud()) {
          const snap = await getDoc(doc(db, 'customers', customer.id));
          if (!active) return;
          const bal = snap.exists() ? nn(snap.data().currentBalance) : nn(customer.currentBalance);
          setFreshBal(bal);
          await localDb.customers.update(customer.id, { currentBalance: bal }).catch(() => {});
        }
      } catch {
        setFreshBal(nn(customer.currentBalance));
      } finally {
        if (active) setFetchingBal(false);
      }
    })();
    return () => { active = false; };
  }, [customer.id]);

  const currentBal = freshBal !== null ? freshBal : nn(customer?.currentBalance);

  const handleSave = async () => {
    const creditAmt = nn(amount);
    if (creditAmt <= 0) return alert('Enter valid amount');
    if (fetchingBal) return alert('Balance loading...');
    if (!user?.uid) return alert(t.loginRequired);

    const prevBal = currentBal;
    const newBal  = prevBal + creditAmt;
    setSaving(true);
    try {
      const refNo   = `CRD${Date.now().toString(36).toUpperCase().slice(-8)}`;
      const dateStr = localDateStr();
      const timeStr = nowHHMM24();
      const nowTs   = Timestamp ? Timestamp.now() : null;
      const now     = new Date();
      let cusTxnId  = `txn_${Date.now()}`;

      await localDb.customers.update(customer.id, {
        currentBalance: newBal,
        updatedAt: now.toISOString(),
        synced: 0
      });

      if (localDb.customerTransactions) {
        await localDb.customerTransactions.put({
          id: cusTxnId,
          uid: user.uid,
          customerId: customer.id,
          customerName: customer.name || '',
          customerPhone: customer.phone || '',
          type: 'credit',
          amount: creditAmt,
          note: note || t.addCreditTitle,
          status: 'confirmed',
          source: 'manual_credit',
          refNo,
          createdAt: now.toISOString(),
          date: dateStr,
          time: timeStr,
          synced: 0
        });
      }

      if (canUseCloud()) {
        try {
          const cusTxnRef = await addDoc(collection(db, 'customerTransactions'), {
            uid: user.uid,
            customerId: customer.id,
            customerName: customer.name || '',
            customerPhone: customer.phone || '',
            type: 'credit',
            amount: creditAmt,
            note: note || t.addCreditTitle,
            status: 'confirmed',
            source: 'manual_credit',
            refNo,
            createdAt: serverTimestamp(),
            timestamp: nowTs,
            date: dateStr,
            time: timeStr,
            createdBy: user.email || 'Unknown',
          });
          cusTxnId = cusTxnRef.id;

          await updateDoc(doc(db, 'customers', customer.id), {
            currentBalance: increment(creditAmt),
            updatedAt: serverTimestamp(),
          });

          await addDoc(collection(db, `users/${user.uid}/cashTransactions`), {
            type: 'out', source: 'customerCredit', category: 'customerCredit',
            description: `👤 ${customer.name || 'Customer'} — ණය ලබාදීම${note ? ' | ' + note : ''}`,
            amount: creditAmt, paymentMethod: 'credit',
            customerId: customer.id, customerName: customer.name || '',
            customerPhone: customer.phone || '', customerTxnId: cusTxnId,
            reference: refNo, notes: note || '', note: note || '',
            previousOutstanding: prevBal, newOutstanding: newBal,
            date: dateStr, time: timeStr, timestamp: nowTs,
            createdAt: serverTimestamp(), createdBy: user?.email || '',
            uid: user.uid, isAutomatic: true,
          });

          await localDb.customers.update(customer.id, { synced: 1 }).catch(() => {});
        } catch (cloudErr) {
          console.warn("Deferred cloud credit registration:", cloudErr?.message || cloudErr);
        }
      }

      const synthetic = {
        _isReceipt: true, _receiptType: 'credit',
        id: `credit-${refNo}`, invoiceNo: refNo, invoiceCode: `CRD-${refNo}`,
        customerId: customer.id || '', customerName: customer.name || '',
        customerPhone: customer.phone || '', customerAddress: customer.address || '',
        items: [{
          name: 'ණය ඇතුළු කිරීම', nameSi: 'ණය',
          qty: 1, sellingPrice: creditAmt, yourPrice: creditAmt,
          lineTotal: creditAmt, uom: 'unit', warrantyCode: '',
        }],
        grossTotal: creditAmt, totalDiscount: 0, billDiscount: 0,
        billDiscountPercent: 0, exchangeAmount: 0,
        netAmount: creditAmt, payAmount: 0, balance: -creditAmt,
        paymentMethod: 'credit',
        remarks: note || '', invoiceRemark: note || '',
        previousOutstanding: prevBal, newOutstanding: newBal,
        customerCurrentBalance: newBal,
        createdAt: { toDate: () => now },
        date: dateStr, status: 'completed', type: 'receipt',
        _collection: 'customerTransactions',
      };
      onSuccess(synthetic);
    } catch (e) {
      console.error('Credit error:', e);
      alert(`❌ ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={S.overlay}>
      <div style={{ ...S.modal, maxWidth: 420 }}>
        <div style={S.modalHead}>
          <h3 style={{ margin: 0, color: '#dc2626' }}>➕ {t.addCreditTitle}</h3>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <div style={{ padding: '10px 0 20px' }}>
          <div style={{ marginBottom: 16, padding: 14, background: '#fef2f2', borderRadius: 12, border: '1px solid #fecaca' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {customer.profilePicture ? (
                <img src={customer.profilePicture} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} alt="" />
              ) : (
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 18 }}>
                  {(customer.name || '?')[0]}
                </div>
              )}
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{customer.name}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{customer.phone}</div>
              </div>
            </div>
            <div style={{ marginTop: 10, padding: '8px 12px', background: 'white', borderRadius: 8, border: '1px solid #fecaca', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#991b1b', fontWeight: 700 }}>{t.currentBalance}:</span>
              {fetchingBal ? (
                <span style={{ fontSize: 14, color: '#64748b', fontStyle: 'italic' }}>⏳ {t.fetchingBalance}</span>
              ) : (
                <span style={{ fontSize: 18, fontWeight: 900, color: currentBal < -0.01 ? '#2563eb' : '#dc2626' }}>
                  {currentBal < 0 ? `-Rs.${fmt(Math.abs(currentBal))}` : `Rs.${fmt(currentBal)}`}
                </span>
              )}
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>{t.creditAmount} *</label>
            <input type="number" autoFocus placeholder="0.00"
              value={amount} onChange={(e) => setAmount(e.target.value)}
              style={{ ...S.input, fontSize: 24, fontWeight: 'bold', color: '#dc2626', textAlign: 'center', padding: 16 }} />
            {nn(amount) > 0 && (
              <div style={{ marginTop: 8, padding: '8px 12px', background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>{t.newBalance}:</span>
                <span style={{ fontWeight: 800, color: '#dc2626', fontSize: 16 }}>
                  Rs.{fmt(currentBal + nn(amount))}
                </span>
              </div>
            )}
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={S.label}>{t.creditNote}</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
              style={S.input} placeholder="භාණ්ඩ / සේවා විස්තරය..." />
          </div>
          <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fffbeb', borderRadius: 10, border: '1px solid #fde68a', fontSize: 12, color: '#92400e' }}>
            ℹ️ {t.creditInfoMsg}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={S.cancelBtn}>{t.cancel}</button>
            <button onClick={handleSave} disabled={saving || nn(amount) <= 0 || fetchingBal}
              style={{ ...S.saveBtn, background: 'linear-gradient(135deg,#dc2626,#b91c1c)', opacity: (saving || nn(amount) <= 0 || fetchingBal) ? 0.6 : 1 }}>
              {saving ? '⏳ සුරකිමින්...' : fetchingBal ? '⏳...' : `➕ ${t.addCredit}`}
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
  const t = T[lang] || T.si;
  const { user, loading: authLoading } = useUserAuth();
  const [customers,      setCustomers    ] = useState([]);
  const [activeLoans,    setActiveLoans  ] = useState([]);
  const [loading,        setLoading      ] = useState(true);
  const [lastFetchTs,    setLastFetchTs  ] = useState(0);
  const [fetchErrMsg,    setFetchErrMsg  ] = useState('');
  const [searchTerm,     setSearchTerm   ] = useState('');
  const [showCreditOnly, setShowCreditOnly] = useState(false);
  const [sortBy,         setSortBy       ] = useState('balHigh');
  const [viewMode,       setViewMode     ] = useState('table');
  const [page,           setPage         ] = useState(1);
  const [perPage,        setPerPage      ] = useState(25);
  const [showAddModal,  setShowAddModal ] = useState(false);
  const [newCust,       setNewCust      ] = useState({ name: '', phone: '', address: '', email: '', nic: '', notes: '', profilePicture: '' });
  const [phoneSuffix,   setPhoneSuffix  ] = useState('');
  const [isSaving,      setIsSaving     ] = useState(false);
  const [paymentCust,   setPaymentCust  ] = useState(null);
  const [creditCust,    setCreditCust   ] = useState(null);
  const [outputInvoice, setOutputInvoice] = useState(null);
  const [toastMsg,      setToastMsg     ] = useState('');
  const showToast = useCallback((m) => { setToastMsg(m); setTimeout(() => setToastMsg(''), 3000); }, []);

  /* ── Fetch customers (Inclusive Local Hard Disk Load - Shows all legacy 324 records) ── */
  const fetchCustomers = useCallback(async (force = false) => {
    setFetchErrMsg('');
    setLoading(true);
    try {
      // 1. Load ALL records from Dexie Hard Disk (No records left behind)
      const allLocal = await localDb.customers.toArray();
      const currentUid = user?.uid;

      let displayList = allLocal;
      if (currentUid) {
        const userMatched = allLocal.filter(c => !c.uid || c.uid === currentUid || c.uid === 'system' || c.uid === 'all' || c.uid === 'local_user');
        displayList = userMatched.length > 0 ? userMatched : allLocal;

        // Auto-adopt legacy unassigned customers to current user
        const unassigned = allLocal.filter(c => !c.uid || c.uid === 'system' || c.uid === 'local_user');
        if (unassigned.length > 0) {
          localDb.transaction('rw', localDb.customers, async () => {
            for (const item of unassigned) {
              await localDb.customers.update(item.id, { uid: currentUid });
            }
          }).catch(() => {});
        }
      }

      const sortedLocal = displayList.map(c => ({
        ...c,
        currentBalance: nn(c.currentBalance),
        createdAt: normalizeDate(c.createdAt),
        updatedAt: normalizeDate(c.updatedAt)
      })).sort((a, b) => b.createdAt - a.createdAt);

      setCustomers(sortedLocal);
      setLastFetchTs(Date.now());

      // 2. Safe Cloud sync
      if (canUseCloud() && currentUid) {
        try {
          const snap = await getDocs(query(collection(db, 'customers'), where('uid', '==', currentUid)));
          if (!snap.empty) {
            const cloudList = snap.docs.map(d => ({
              id: d.id, ...d.data(),
              currentBalance: nn(d.data().currentBalance),
              synced: 1,
              _synced: true
            }));

            await localDb.transaction('rw', localDb.customers, async () => {
              for (const cloudCust of cloudList) {
                const existing = await localDb.customers.get(cloudCust.id);
                if (!existing || existing.synced === 1) {
                  await localDb.customers.put(cloudCust);
                }
              }
            });

            const refreshed = await localDb.customers.toArray();
            setCustomers(refreshed.map(c => ({
              ...c,
              currentBalance: nn(c.currentBalance),
              createdAt: normalizeDate(c.createdAt),
              updatedAt: normalizeDate(c.updatedAt)
            })).sort((a, b) => b.createdAt - a.createdAt));
          }
        } catch (cloudErr) {
          setFetchErrMsg(cloudErr.code === 'resource-exhausted' ? t.quotaMsg : t.offlineMsg);
        }
      }
    } catch (err) {
      console.warn("Local database retrieval notice:", err);
    } finally {
      setLoading(false);
    }
  }, [user?.uid, t.quotaMsg, t.offlineMsg]);

  /* ── Safe Realtime Sync: Active Loans ── */
  useEffect(() => {
    if (!user?.uid || !canUseCloud()) return;
    try {
      const q = query(
        collection(db, `users/${user.uid}/customerLoans`),
        where('status', '==', 'active')
      );
      const unsub = onSnapshot(q,
        snap => setActiveLoans(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
        err  => console.warn('Loans listener safe notice:', err?.message || err)
      );
      return () => unsub();
    } catch (e) {
      // Safe fallback
    }
  }, [user?.uid]);

  useEffect(() => {
    if (!authLoading) fetchCustomers();
  }, [authLoading, fetchCustomers]);

  /* ── Add customer ── */
  const handleAdd = async (e) => {
    if (e) e.preventDefault();
    if (!newCust.name || !phoneSuffix) return alert('Name + Phone required');

    setIsSaving(true);
    const customerId = 'cust_' + Date.now();
    const timestamp = new Date().toISOString();
    const fullPhone = `+94${phoneSuffix}`;
    const newCustomerObj = {
      id: customerId,
      uid: user?.uid || 'system',
      name: newCust.name.trim(),
      phone: fullPhone,
      address: newCust.address || '',
      email: newCust.email || '',
      nic: newCust.nic || '',
      notes: newCust.notes || '',
      profilePicture: newCust.profilePicture || '',
      currentBalance: 0,
      portalAccessKey: makePortalKey(newCust.name),
      synced: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    try {
      await localDb.customers.put(newCustomerObj);
      setCustomers(prev => [
        { ...newCustomerObj, createdAt: new Date(timestamp), updatedAt: new Date(timestamp) },
        ...prev
      ]);
      setShowAddModal(false);
      setNewCust({ name: '', phone: '', address: '', email: '', nic: '', notes: '', profilePicture: '' });
      setPhoneSuffix('');
      showToast(t.success);

      if (canUseCloud()) {
        try {
          await setDoc(doc(db, 'customers', customerId), {
            ...newCustomerObj,
            synced: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          await localDb.customers.update(customerId, { synced: 1 });
        } catch (firebaseErr) {
          console.warn("Deferred cloud customer save:", firebaseErr?.message || firebaseErr);
        }
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  /* ── Active Loan finder ── */
  const getCustomerActiveLoan = useCallback((phone) => {
    if (!phone) return null;
    const cleanPhone = phone.replace(/\s+/g, '');
    return activeLoans.find(loan => {
      const loanPhone = (loan.customerPhone || '').replace(/\s+/g, '');
      if (!loanPhone) return false;
      return loanPhone.includes(cleanPhone) || cleanPhone.includes(loanPhone);
    });
  }, [activeLoans]);

  /* ── Stats ── */
  const stats = useMemo(() => ({
    total:      customers.length,
    totalRec:   customers.reduce((s, c) => s + Math.max(0, nn(c.currentBalance)), 0),
    creditCnt:  customers.filter(c => nn(c.currentBalance) > 0.01).length,
    settledCnt: customers.filter(c => Math.abs(nn(c.currentBalance)) <= 0.01).length,
  }), [customers]);

  /* ── Filter + sort ── */
  const filtered = useMemo(() => {
    const words = searchTerm.toLowerCase().trim().split(/\s+/).filter(Boolean);
    let res = customers.filter(c => {
      const hay = [c.name, c.phone, c.address, c.email, c.nic].filter(Boolean).join(' ').toLowerCase();
      return (words.length === 0 || words.every(w => hay.includes(w))) &&
             (!showCreditOnly || nn(c.currentBalance) > 0);
    });
    if (sortBy === 'nameAZ')  res = [...res].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (sortBy === 'nameZA')  res = [...res].sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    if (sortBy === 'balHigh') res = [...res].sort((a, b) => nn(b.currentBalance) - nn(a.currentBalance));
    if (sortBy === 'balLow')  res = [...res].sort((a, b) => nn(a.currentBalance) - nn(b.currentBalance));
    return res;
  }, [customers, searchTerm, showCreditOnly, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = useMemo(() => filtered.slice((page - 1) * perPage, page * perPage), [filtered, page, perPage]);

  const BalBadge = ({ bal }) => {
    const b = nn(bal);
    if (b > 0.01)  return <div style={{ fontWeight: 800, color: '#dc2626', fontSize: 16 }}>Rs.{fmt(b)}</div>;
    if (b < -0.01) return <div style={{ fontWeight: 800, color: '#2563eb', fontSize: 14 }}>-Rs.{fmt(Math.abs(b))}</div>;
    return <div style={{ fontWeight: 600, color: '#16a34a', fontSize: 13, background: '#dcfce7', padding: '4px 12px', borderRadius: 20, display: 'inline-block' }}>✅ {t.settled}</div>;
  };

  if (authLoading || loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 18, fontWeight: 600 }}>
      {t.loading}
    </div>
  );

  return (
    <div style={S.container}>
      {toastMsg && (
        <div style={{ position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', background:'#1e293b', color:'#fff', padding:'10px 20px', borderRadius:10, zIndex:10002, fontWeight:700, fontSize:14, boxShadow:'0 4px 20px rgba(0,0,0,0.4)', whiteSpace:'nowrap' }}>{toastMsg}</div>
      )}
      {outputInvoice && (
        <InvoiceOutputManager invoice={outputInvoice} initialMode="whatsapp" onClose={() => setOutputInvoice(null)} />
      )}
      {paymentCust && (
        <PaymentModal customer={paymentCust} t={t} user={user}
          onClose={() => setPaymentCust(null)}
          onSuccess={(synthetic) => { setPaymentCust(null); setOutputInvoice(synthetic); fetchCustomers(true); }} />
      )}
      {creditCust && (
        <CreditModal customer={creditCust} t={t} user={user}
          onClose={() => setCreditCust(null)}
          onSuccess={(synthetic) => { setCreditCust(null); setOutputInvoice(synthetic); fetchCustomers(true); }} />
      )}

      {/* Header */}
      <div style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 28 }}>👥</span>
          <div>
            <h2 style={S.title}>{t.title}</h2>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
              {stats.total} {t.totalCustomers}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => fetchCustomers(true)} disabled={loading}
            style={{ padding: '10px 16px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
            {t.refresh}
          </button>
          <button onClick={() => setShowAddModal(true)} style={S.addBtn}>➕ {t.addNew}</button>
        </div>
      </div>

      {fetchErrMsg && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde068', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#92400e', fontWeight: 600 }}>
          {fetchErrMsg}
        </div>
      )}

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { bg: 'linear-gradient(135deg,#fef2f2,#fee2e2)', bc: '#fca5a5', tc: '#991b1b', vc: '#dc2626', icon: '💸', label: t.totalReceivables, value: `Rs.${fmt(stats.totalRec)}` },
          { bg: 'linear-gradient(135deg,#eff6ff,#dbeafe)', bc: '#93c5fd', tc: '#1e40af', vc: '#2563eb', icon: '👥', label: t.totalCustomers, value: stats.total },
          { bg: 'linear-gradient(135deg,#fff7ed,#fed7aa)', bc: '#fdba74', tc: '#9a3412', vc: '#ea580c', icon: '⚠️', label: t.creditCustomers, value: stats.creditCnt },
          { bg: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', bc: '#86efac', tc: '#166534', vc: '#16a34a', icon: '✅', label: t.settledCustomers, value: stats.settledCnt },
        ].map((s, i) => (
          <div key={i} style={{ padding: '14px 16px', borderRadius: 14, background: s.bg, border: `2px solid ${s.bc}` }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: s.tc }}>{s.icon} {s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: s.vc, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center', background: '#f8fafc', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <div style={{ position: 'relative', flex: 2, minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
          <input type="text" placeholder={t.search} value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ padding: '11px 32px 11px 38px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box', background: 'white' }} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', background: showCreditOnly ? '#fef2f2' : 'white', padding: '8px 14px', borderRadius: 10, border: `2px solid ${showCreditOnly ? '#dc2626' : '#e2e8f0'}`, userSelect: 'none' }}>
          <input type="checkbox" checked={showCreditOnly} onChange={e => setShowCreditOnly(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#dc2626' }} />
          <span style={{ color: showCreditOnly ? '#dc2626' : '#475569', fontWeight: showCreditOnly ? 700 : 500 }}>💳 {t.showCredit}</span>
        </label>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ padding: '10px 12px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 13, outline: 'none', background: 'white', cursor: 'pointer' }}>
          <option value="balHigh">📉 {t.sortBalHigh}</option>
          <option value="balLow">📈 {t.sortBalLow}</option>
          <option value="nameAZ">🔤 {t.sortNameAZ}</option>
          <option value="nameZA">🔤 {t.sortNameZA}</option>
        </select>
      </div>

      {/* ── TABLE VIEW ── */}
      <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['#', '', t.name, t.mobile, t.address, t.balance, t.action].map((h, i) => (
                <th key={i} style={{ padding: '14px 12px', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: i === 5 ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan="7" style={{ padding: 50, textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div><div>{t.noData}</div>
              </td></tr>
            ) : paged.map((cus, idx) => {
              const activeLoan = getCustomerActiveLoan(cus.phone);
              return (
                <tr key={cus.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={S.td}>{(page - 1) * perPage + idx + 1}</td>
                  <td style={S.td}>
                    {cus.profilePicture ? (
                      <img src={cus.profilePicture} style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover' }} alt="" />
                    ) : (
                      <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'white', fontSize: 16 }}>
                        {(cus.name || '?')[0].toUpperCase()}
                      </div>
                    )}
                  </td>
                  <td style={S.td}>
                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 15 }}>{cus.name}</div>
                    {cus.email && <div style={{ fontSize: 11, color: '#94a3b8' }}>📧 {cus.email}</div>}
                  </td>
                  <td style={S.td}>{cus.phone || '-'}</td>
                  <td style={S.td}>{cus.address || '-'}</td>
                  <td style={{ ...S.td, textAlign: 'right' }}><BalBadge bal={cus.currentBalance} /></td>
                  <td style={{ ...S.td, textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                      <button onClick={() => setCreditCust(cus)}
                        style={{ padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}>
                        ➕ {t.addCreditTitle}
                      </button>
                      <button onClick={() => setPaymentCust(cus)}
                        style={{ padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: '#dcfce7', color: '#16a34a', border: '1px solid #86efac' }}>
                        💰 {t.receivePayment}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div style={S.overlay}>
          <div style={S.modal}>
            <div style={S.modalHead}>
              <h3 style={{ margin: 0, fontSize: 18 }}>👤 {t.addNew}</h3>
              <button onClick={() => setShowAddModal(false)} style={S.closeBtn}>✕</button>
            </div>
            <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={S.label}>{t.name} *</label>
                <input style={S.input} value={newCust.name}
                  onChange={e => setNewCust({ ...newCust, name: e.target.value })}
                  required autoFocus placeholder={t.name} />
              </div>
              <div>
                <label style={S.label}>{t.mobile} *</label>
                <div style={{ display: 'flex', alignItems: 'center', border: '2px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                  <span style={{ padding: '10px 12px', background: '#f1f5f9', fontWeight: 'bold' }}>+94</span>
                  <input style={{ ...S.input, border: 'none' }} type="tel"
                    value={phoneSuffix} onChange={e => setPhoneSuffix(e.target.value.replace(/\D/g, ''))}
                    placeholder="771234567" required maxLength={9} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button type="button" onClick={() => setShowAddModal(false)} style={S.cancelBtn}>{t.cancel}</button>
                <button type="submit" disabled={isSaving} style={S.saveBtn}>
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

const S = {
  container: { padding: 20, maxWidth: 1400, margin: '0 auto' },
  header:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  title:     { margin: 0, color: '#1e293b', fontSize: 24, fontWeight: 800 },
  addBtn:    { padding: '10px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700 },
  td:        { padding: '12px 12px', color: '#334155' },
  overlay:   { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal:     { background: 'white', padding: 24, borderRadius: 16, width: '100%', maxWidth: 440 },
  modalHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  closeBtn:  { background: '#f1f5f9', border: 'none', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontWeight: 'bold' },
  input:     { width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, boxSizing: 'border-box' },
  label:     { display: 'block', marginBottom: 4, fontWeight: 600, fontSize: 13, color: '#475569' },
  cancelBtn: { flex: 1, padding: 10, background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  saveBtn:   { flex: 1, padding: 10, background: '#10b981', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  quickBtn:  { padding: '4px 8px', borderRadius: 6, border: '1px solid #86efac', background: '#f0fdf4', color: '#16a34a', fontSize: 11, fontWeight: 700, cursor: 'pointer' },
};